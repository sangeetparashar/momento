const SUPABASE_OBJECT_PATH = '/storage/v1/object/public/';
const SUPABASE_RENDER_PATH = '/storage/v1/render/image/public/';
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif|heic|heif)(\?|$)/i;

/**
 * Rewrite Supabase Storage image URLs to use the /render/image/public/
 * endpoint, which honors the file's cache-control metadata (max-age=1yr)
 * and is cached at Cloudflare's edge. The default /object/public/ endpoint
 * unconditionally returns `cache-control: no-cache`, so images served from
 * it re-download on every view.
 *
 * Pass-through cases (URL is returned unchanged):
 *  - null / undefined / empty string
 *  - non-Supabase URLs (avatars on external CDNs, sample/seed URLs)
 *  - URLs that don't end in a known image extension (videos, .quicktime, .mp4)
 *  - URLs already using /render/image/ (idempotent)
 *
 * Videos must continue using /object/public/ because Supabase does NOT
 * expose a /render/video/ equivalent. See improvements-backlog.md #001.
 */
export function transformMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return url ?? undefined;
  if (!url.includes(SUPABASE_OBJECT_PATH)) return url;
  if (!IMAGE_EXT_RE.test(url)) return url;
  return url.replace(SUPABASE_OBJECT_PATH, SUPABASE_RENDER_PATH);
}
