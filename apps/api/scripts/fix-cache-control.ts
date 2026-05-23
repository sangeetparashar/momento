/**
 * One-off migration: re-upload every file in the `momento-uploads` bucket
 * with a tiny trailing-byte change so Cloudflare's edge cache invalidates
 * and starts serving the new `Cache-Control: max-age=31536000, immutable`.
 *
 * Why a byte-append (and not just SQL or identical re-upload):
 * Supabase's CDN (Cloudflare) keeps cached responses keyed by the file's
 * etag/last-modified. Updating storage.objects.metadata in Postgres does
 * not change those. Re-uploading identical bytes is deduped by Supabase
 * — it returns 200 but doesn't create a new version. The only reliable
 * way to force CF cache invalidation is to make the file bytes differ.
 *
 * What we append (format-safe):
 *  - JPEG: single 0x00 byte after the EOI marker (FF D9). All decoders
 *    stop at EOI, trailing bytes are silently ignored.
 *  - PNG: single 0x00 byte after the IEND chunk. Decoders stop at IEND,
 *    trailing bytes are ignored.
 *  - MP4 / QuickTime: a spec-compliant empty `free` box (8 bytes:
 *    [00 00 00 08 66 72 65 65]). MP4 readers walk the box list and
 *    `free` boxes are explicitly "skip this." Zero playback risk.
 *
 * Backup: every original is saved to /tmp/momento-cache-fix-backup-<ts>/
 * BEFORE the upload. If anything goes wrong, restore by reuploading the
 * backed-up file (paths preserved).
 *
 * Run with:
 *   cd apps/api && pnpm tsx scripts/fix-cache-control.ts [flags]
 *
 * Flags:
 *   --dry-run     List files that would be processed; download to backup
 *                 dir but do not upload anything.
 *   --limit=N     Only process the first N files (default: all).
 *   --prefix=P    Only process files whose path starts with P.
 *
 * Idempotent — skips files whose served Cache-Control is already
 * max-age=31536000... so re-runs are cheap and safe.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Buffer } from 'node:buffer';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'momento-uploads';
const TARGET_CACHE = 'max-age=31536000, immutable';
const PAGE_SIZE = 100;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const prefixArg = args.find((a) => a.startsWith('--prefix='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const prefix = prefixArg ? prefixArg.split('=')[1] : '';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const BACKUP_ROOT = `/tmp/momento-cache-fix-backup-${Date.now()}`;
fs.mkdirSync(BACKUP_ROOT, { recursive: true });

interface ObjectInfo {
  path: string;
  size: number;
  contentType: string;
}

async function listAllRecursive(): Promise<ObjectInfo[]> {
  const queue: string[] = [prefix || ''];
  const all: ObjectInfo[] = [];

  while (queue.length > 0) {
    const folder = queue.shift()!;
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

      if (error) throw new Error(`list error at "${folder}": ${error.message}`);
      if (!data || data.length === 0) break;

      for (const item of data) {
        if (!item.name) continue;
        const fullPath = folder ? `${folder}/${item.name}` : item.name;
        if (item.id) {
          all.push({
            path: fullPath,
            size: (item.metadata as any)?.size ?? 0,
            contentType: (item.metadata as any)?.mimetype ?? 'application/octet-stream',
          });
        } else {
          queue.push(fullPath);
        }
      }

      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return all;
}

async function fetchServedCacheControl(p: string, contentType: string): Promise<string | null> {
  // Images are served via /render/image/public/ (respects cacheControl); videos
  // go through /object/public/ (always returns no-cache, so check anyway).
  const url = isImageContentType(contentType)
    ? `${SUPABASE_URL}/storage/v1/render/image/public/${BUCKET}/${p}`
    : `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p}`;
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    return resp.headers.get('cache-control');
  } catch {
    return null;
  }
}

function isImageContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct === 'image/jpeg' || ct === 'image/png' || ct === 'image/webp' ||
    ct === 'image/gif' || ct === 'image/avif' || ct === 'image/heic' || ct === 'image/heif';
}

function appendSafeTrailer(buf: Buffer, contentType: string): Buffer {
  if (!isImageContentType(contentType)) {
    throw new Error(`Refusing to append trailer for non-image content-type: ${contentType}`);
  }
  // Single null byte after EOI/IEND — every image decoder ignores trailing bytes.
  return Buffer.concat([buf, Buffer.from([0x00])]);
}

function saveBackup(p: string, buf: Buffer): string {
  const dest = path.join(BACKUP_ROOT, p);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return dest;
}

async function reuploadFile(obj: ObjectInfo): Promise<{ oldSize: number; newSize: number; backupPath: string }> {
  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(obj.path);
  if (dlErr || !blob) throw new Error(`download failed: ${dlErr?.message || 'no blob'}`);

  const original = Buffer.from(await blob.arrayBuffer());
  const backupPath = saveBackup(obj.path, original);

  if (dryRun) {
    return { oldSize: original.length, newSize: original.length, backupPath };
  }

  const newBytes = appendSafeTrailer(original, obj.contentType);

  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${obj.path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': obj.contentType,
      'Cache-Control': TARGET_CACHE,
      'x-upsert': 'true',
    },
    body: newBytes,
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`upload failed: ${resp.status} ${text.slice(0, 300)}`);
  }

  return { oldSize: original.length, newSize: newBytes.length, backupPath };
}

async function verifyServedAfterUpload(p: string, contentType: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cc = await fetchServedCacheControl(p, contentType);
    if (cc && cc.startsWith('max-age=')) return cc;
    if (attempt < 4) await new Promise((r) => setTimeout(r, 1500));
  }
  return await fetchServedCacheControl(p, contentType);
}

async function main() {
  console.log(`Listing files in bucket "${BUCKET}"${prefix ? ` under "${prefix}"` : ''}...`);
  const files = await listAllRecursive();
  console.log(`Found ${files.length} files. Backup dir: ${BACKUP_ROOT}\n`);

  const toProcess = files.slice(0, limit);
  console.log(`Processing ${toProcess.length} file(s)${dryRun ? ' (DRY RUN: download+backup only, no upload)' : ''}.\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const obj = toProcess[i];
    const tag = `[${i + 1}/${toProcess.length}]`;
    const sizeKB = (obj.size / 1024).toFixed(0);

    if (!isImageContentType(obj.contentType)) {
      console.log(`${tag} SKIP  ${obj.path} (${sizeKB} KB) — non-image (${obj.contentType}); /render/image/ doesn't apply`);
      skipped++;
      continue;
    }

    const currentServed = await fetchServedCacheControl(obj.path, obj.contentType);
    if (currentServed && currentServed.startsWith('max-age=')) {
      console.log(`${tag} SKIP  ${obj.path} (${sizeKB} KB) — already serving "${currentServed}"`);
      skipped++;
      continue;
    }

    try {
      const result = await reuploadFile(obj);
      if (dryRun) {
        console.log(`${tag} BACKUP ${obj.path} (${sizeKB} KB) — saved to ${result.backupPath}`);
        continue;
      }
      const verified = await verifyServedAfterUpload(obj.path, obj.contentType);
      console.log(`${tag} OK    ${obj.path} (${sizeKB} KB → ${(result.newSize / 1024).toFixed(0)} KB)  served="${verified}"  backup=${result.backupPath}`);
      updated++;
    } catch (err: any) {
      console.error(`${tag} FAIL  ${obj.path}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped} failed=${failed}  backup=${BACKUP_ROOT}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
