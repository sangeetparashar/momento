# Video Platform Decision Brief — 2026-05-23

> **Companion to**: [`improvements-backlog.md`](./improvements-backlog.md) #003 (50MB cap), #008 (compression/editing). Update this doc as costs and assumptions firm up.

## TL;DR

> **Keep Supabase Pro ($25/mo) for DB + images + avatars. Add Cloudflare Stream for new videos in ~2 weeks (~$15/mo). Ship client-side video compression THIS WEEK as a native build — it solves the immediate upload-speed complaint independently of any platform migration.**

Three-step ladder, in order of impact-per-effort:

| Step | Effort | When | Solves |
|---|---|---|---|
| 1. Client-side video compression (`react-native-compressor`) | 1 day code + Apple review (~3 days total) | This week | "Uploads take forever" complaint, 50MB cap concern (compresses 20MB → 3-5MB) |
| 2. Migrate new video uploads to Cloudflare Stream | 2 days code + 1 day dual-write soak | Within 2 weeks | HLS adaptive bitrate, edge caching, video analytics, no upload-cap fights |
| 3. Migrate 6 legacy videos to CF Stream | 1 hr script | Same release as step 2 | Cleanup; all video on one platform |

---

## 1. Context

### Current state (2026-05-23)
- 38 users, 6 active creators, ~6 videos uploaded total
- Supabase **upgraded to Pro today** (`$25/month`) — raises file cap 50MB → 5GB, storage cap 1GB → 100GB, includes 250GB egress, removes DB auto-pause
- **Image cache-control fix shipped today** via `/render/image/` rewrite (backlog #001 — done)
- Video files still served as raw MP4 from `/object/public/` with `cache-control: no-cache`
- No client-side video compression (images get resized + JPEG q=0.8; videos pass through unchanged)

### User complaints from last night (6 beta users)
1. **"Videos take a long time to upload"** — iPhone QuickTime captures are uncompressed; a 30s clip is 20-30MB. Cellular upload of 20MB at typical LTE upload speeds (~5 Mbps) is 32 seconds of waiting with no visible progress while the JS bridge holds the file.
2. **"50MB upload cap blocks longer or higher-quality clips"** — Mobile rejects uploads >50MB client-side at `apps/mobile/src/hooks/useUpload.ts:28`. The Supabase Pro upgrade raised the *server-side* cap to 5GB, but the mobile constant still enforces 50MB.

### The decision
Now that Supabase Pro is paid for, **should video continue to live on Supabase, or migrate to a dedicated video platform?**

---

## 2. What Supabase Pro changes (and doesn't)

### ✅ Supabase Pro solves
- **Per-file upload cap**: 50MB → 5GB (server-side; mobile constant still needs raising)
- **Storage cap**: 1GB → 100GB (room for ~5,000 short videos)
- **DB auto-pause**: removed (no more "down because idle for 7 days")
- **Egress**: 250GB/month included (vs no published quota on Free)
- **Daily backups**: 7 days retention
- **Support**: email tier, ~24-48h response

### ❌ Supabase Pro does NOT solve
| Problem | Why Pro doesn't fix it |
|---|---|
| Uploads still slow | Supabase serves uploads from a single region (US-East). Cellular users in EU/AU eat round-trip latency. Pro doesn't add edge ingest. |
| No HLS adaptive bitrate | Supabase Storage is object storage. It serves the raw file. No transcoding, no ABR ladder. A 1080p MP4 is the same payload whether the viewer is on 5G or 3G. |
| No video analytics | "Was this video actually watched, or just scrolled past?" — you don't know. |
| `/object/public/` ignores cache-control | Even after our fix landed today, the Supabase gateway returns `no-cache` for the `/object/public/` path. This is a platform-level override. Videos still re-download per view. |
| Storage egress overages | At 250GB/mo (Pro included) videos burn egress fast: 100 viewers × 30 videos × 20MB = 60GB/mo. Linear in users × videos × file size. Overage starts at $0.09/GB. |

### What Supabase Pro made cheaper
Image storage + DB + Postgres extensions + your existing image cache fix all stay on Supabase. The $25/mo is not "wasted" if you also use CF Stream — most of it pays for the DB tier alone.

---

## 3. Vendor side-by-side

> Pricing as of 2026-05-23. Verify on each vendor's pricing page before signing up.

| | **Supabase Pro** | **Cloudflare Stream** | **Mux Video** | **Bunny Stream** |
|---|---|---|---|---|
| **Pricing model** | Flat $25/mo includes 100GB storage + 250GB egress | $5/1000 min stored + $1/1000 min delivered | $5/mo plus per-min storage + delivery + encoding | $0.005/GB stored + $0.005/GB egress + $0.05/min encoding |
| **Your projected cost at 300 min/mo new (1yr ramp)** | $25 flat | $13-22/mo growing | $20-35/mo growing | $5-15/mo growing |
| **Your projected cost at 5× scale (200 creators, 2500 users)** | $25-50 + egress overages | $60-100/mo | $80-150/mo | $25-50/mo |
| **Upload UX** | Single-region ingest; user waits for upload + transcode (no transcode) | Tus-style resumable uploads to nearest edge; perceptual "done" when bytes arrive, transcoding async | Same as CF Stream | Resumable uploads, single-region ingest (slightly slower than CF/Mux) |
| **Playback UX** | Raw MP4 only; no adaptive bitrate; cellular users on 3G download the same 1080p file | HLS with auto-generated 240/360/480/720/1080 ladder; player picks bitrate by bandwidth | Same as CF Stream + DASH | HLS + MP4 fallback |
| **Transcoding** | None | Free, included | $0.025/min (one-time per upload) | $0.05/min (one-time per upload) |
| **Auto thumbnail generation** | ❌ | ✅ | ✅ | ✅ |
| **Per-view analytics** | ❌ | Basic (views, country, hours) | Best-in-class (engagement curves, retention, errors) | Basic |
| **Signed/private URLs** | ✅ | ✅ | ✅ | ✅ |
| **Live streaming** | ❌ | ✅ | ✅ | ✅ |
| **Vendor lock-in** | Low (raw MP4 portable) | Medium (HLS URLs unique to CF) | Medium (Mux ID-based URLs) | Medium |
| **DX / docs** | Good (Supabase JS SDK) | Good (REST + direct upload) | **Excellent** (best in class for video) | OK (smaller community) |
| **Vercel ecosystem fit** | Native (Supabase = Vercel partner) | First-class (CF + Vercel both edge) | First-class (Mux is on Vercel storefront) | Independent |

---

## 4. Why CF Stream wins for Momento specifically

### Upload speed (the #1 complaint)
- **Why CF Stream feels 2-5× faster than Supabase**: CF has ~300 global PoPs. Direct uploads route to the nearest edge ingest endpoint. A creator in Toronto hits a Toronto datacenter, not US-East-1. For typical 20MB videos on cellular, that's 5-8 seconds saved.
- **Tus protocol resumable uploads**: if the connection drops mid-upload, the client resumes from the last byte uploaded — not from zero. Supabase's basic PUT doesn't support this. Massive UX win on flaky networks.
- **Perceptual completion**: CF returns "upload done" when bytes arrive. Transcoding (HLS ladder generation) happens async in the background. From the user's POV, the upload IS faster because they're no longer waiting for transcoding (they didn't get any with Supabase, but the file was bigger).

### Playback speed
- **Adaptive bitrate**: A viewer on 5G gets the 1080p variant (~5 Mbps stream). A viewer on flaky 3G gets the 240p variant (~400 Kbps). Both start playing in 1-2s. With Supabase MP4, the 3G viewer waits 30+ seconds for the same 20MB file to download enough to start.
- **Edge caching that actually works**: CF Stream uses CF's CDN with proper cache TTLs. Videos served from the nearest edge after first request. Supabase's `/object/public/` returns `no-cache` so every view round-trips to US-East.

### 50MB cap problem
- **Disappears**: CF Stream's per-file cap is **30GB**. You'd never hit it for short-form content. Combined with client-side compression (step 1 in the ladder), even unedited iPhone 4K-60 captures stream fine.

### Cost at your scale
- $13-22/mo for the first year. **Cheaper than Mux** at this size, and the gap widens as you scale. Mux's per-engagement-minute analytics ROI doesn't kick in until ~1000 creators when there's enough data to actually act on retention curves.
- At 200 creators (5× growth), CF Stream is ~$60-100/mo. Bunny is half that, but Bunny's DX and analytics make it a worse fit for active iteration.

---

## 5. Why NOT to migrate (the counter-case)

Worth being honest. Reasons to **stay on Supabase for video**:

1. **You're sunk-cost on Supabase Pro for the month.** Migrating now means paying $25 (Supabase) + $15 (CF Stream) = $40/mo for two months until you'd otherwise cancel. Net new spend: $15/mo if you don't drop Supabase Pro (you shouldn't — DB + image still live there).

2. **You only have 6 videos.** The blast radius of "videos are slow" is small. If you ship video compression alone, those 6 videos shrink to ~5MB each on re-upload and the complaint goes away without any vendor migration.

3. **Migration introduces a second source of truth.** Posts now have `mediaUrl` (Supabase). After migration, some have CF Stream URLs and some Supabase. Schema, code, error handling all branch. Cognitive overhead until 100% migrated.

4. **CF Stream URLs are different shape**: `https://customer-<id>.cloudflarestream.com/<video-id>/manifest/video.m3u8` is an HLS playlist URL, not an MP4 URL. `expo-video` supports HLS on iOS (AVFoundation natively does), but you'd need to verify Android plays it via ExoPlayer (it does, but test). Plus thumbnails are at a different URL pattern.

5. **You don't have video analytics yet.** Adding CF Stream gives you basic analytics (views, country). But the metrics you'd act on (retention curves, drop-off points) are Mux's strength. CF Stream is a step up from Supabase, not a destination.

### When the counter-case holds vs collapses
- **Counter-case wins if**: Your creators stop posting videos for unrelated reasons, OR you find that videos aren't core to retention, OR you can ship compression and that ends the complaints.
- **Counter-case loses if**: Video complaints continue post-compression, OR you cross ~50 videos/week (egress starts mattering), OR you want to know if videos are actually being watched.

---

## 6. Recommended plan (with rationale)

### Step 1 — This week: Native build with `react-native-compressor`

**Why first**: Solves the immediate upload-speed complaint independently of any platform migration. If you later migrate to CF Stream, you keep compression (still helps because smaller uploads = even faster edge ingest). If you stay on Supabase, compression alone may end the complaints and you skip step 2.

**Concrete changes**:
- `pnpm add react-native-compressor` in `apps/mobile`
- In `apps/mobile/src/hooks/useUpload.ts` around line 85 (after the image branch), add:
  ```ts
  if (mimeType.startsWith('video/')) {
    const compressed = await Video.compress(uri, {
      compressionMethod: 'auto',
      minimumFileSizeForCompress: 5,  // MB — skip if smaller
    });
    processedUri = compressed;
    // Re-stat the file to get new size
    const info = await FileSystem.getInfoAsync(compressed, { size: true });
    if (info.exists && info.size) {
      processedSize = info.size;
    }
  }
  ```
- Raise `MAX_FILE_SIZE` at line 28 from 50MB to **250MB** (well within Supabase Pro's 5GB cap, conservative for cellular upload speeds)
- Update the error message at line 128 to mention compression: *"Even after compression, this file is too large. Try a shorter clip."*

**Deploy**: `eas build --profile production --platform ios` (native rebuild required — `react-native-compressor` includes native modules), then `eas submit --platform ios --latest`. Total wall-clock: ~25 min build + 10 min Apple processing + 24h Beta App Review (already approved for app, this is just a build update which usually auto-passes within hours). Realistic ship: 2-3 days.

**Expected impact**: 20MB videos compress to 3-5MB. Upload time drops from 30s on LTE to 5-7s. 50MB cap effectively becomes irrelevant for short-form (would now require ~250MB pre-compression, which is rare).

### Step 2 — Within 2 weeks: Add CF Stream for NEW video uploads

**Why second**: Compression alone doesn't fix HLS adaptive bitrate, edge caching, or video analytics. CF Stream is the right durable answer once compression is in production and you've measured whether complaints persist.

**Concrete changes**:
1. Sign up for Cloudflare Stream. Add `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_STREAM_API_TOKEN` to Vercel env vars (`apps/api`).
2. New endpoint `apps/api/app/api/uploads/video-presign/route.ts` that creates a CF Stream direct creator upload URL:
   ```ts
   const resp = await fetch(
     `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/direct_upload`,
     {
       method: 'POST',
       headers: { Authorization: `Bearer ${STREAM_API_TOKEN}` },
       body: JSON.stringify({ maxDurationSeconds: 300 }),
     }
   );
   const { result } = await resp.json();
   // result.uploadURL — for mobile to PUT to (tus protocol)
   // result.uid       — the video ID, stored on post.mediaUrl
   return { uploadUrl: result.uploadURL, videoId: result.uid };
   ```
3. Update `apps/mobile/src/hooks/useUpload.ts` to call `/uploads/video-presign` for videos (instead of `/uploads/presign`). Use the `tus-js-client` library (or a manual `fetch` with `Tus-Resumable: 1.0.0` headers — the API is simple) for the upload.
4. Store the video as `post.mediaUrl = "https://customer-XYZ.cloudflarestream.com/<videoId>/manifest/video.m3u8"`.
5. `apps/mobile`'s `useVideoPlayer` already plays HLS via expo-video. No mobile-side player changes needed.
6. Generate thumbnails on demand: `https://customer-XYZ.cloudflarestream.com/<videoId>/thumbnails/thumbnail.jpg?time=2s&width=400`. Update `apps/mobile` PostCard's thumbnail logic to use this for videos.

**Schema impact**: None required — `post.mediaUrl` is already a free-form string. But add a `post.mediaProvider` column (`'supabase' | 'cf-stream'`) if you want explicit routing.

**Deploy**: `[backend]` change deploys via `git push` to Vercel. Plus `[ota]` for the mobile useUpload changes (no native rebuild needed — tus is JS-only).

### Step 3 — Same release as step 2: Migrate the 6 legacy videos

**Script outline** (`apps/api/scripts/migrate-videos-to-stream.ts`):
```ts
// 1. List posts where mediaUrl starts with `supabase.co/storage/.../mp4`
// 2. For each:
//    a. Download from Supabase
//    b. Upload to CF Stream via the API
//    c. Update post.mediaUrl to the new HLS URL
//    d. (Don't delete from Supabase yet — keep as backup for 7 days)
// 3. After 7 days, separately delete the Supabase originals to free storage
```

Idempotent (skip posts already on CF Stream). Run once. Done.

### What to do with Supabase Pro after migration
**Keep it.** It's still paying for:
- DB (Postgres + PostGIS + Redis)
- Image storage (~7MB today, ~few hundred MB at 5× scale)
- Avatars + banners
- The 100GB storage cap means you won't hit limits any time soon
- Daily backups + no auto-pause = ops sanity

The $25/mo is good infra spend regardless of where video lives.

---

## 7. Cost projection — full 12 months

Assumes 30→50 creators ramp, 15 videos/creator/month, ~10 views per video, ~30s avg video.

### Scenario A — Stay on Supabase for video (status quo)
| Month | Supabase Pro | Egress overage | Total |
|---|---|---|---|
| 1-3 | $25 | $0 | $25 |
| 4-6 | $25 | $0-5 (approaches 250GB egress limit) | $25-30 |
| 7-9 | $25 | $10-30 (creator growth) | $35-55 |
| 10-12 | $25 | $30-60 | $55-85 |
| **Year 1 total** | $300 | $80-200 | **$380-500** |

Plus user complaints don't go away. Plus no video analytics. Plus 50MB hassle returns when creators hit it again.

### Scenario B — Add CF Stream for video (recommended)
| Month | Supabase Pro | CF Stream | Total |
|---|---|---|---|
| 1 (compression ships) | $25 | $0 | $25 |
| 2 (Stream ships, ramping) | $25 | $5-8 | $30-33 |
| 3-6 | $25 | $10-15 | $35-40 |
| 7-9 | $25 | $15-20 | $40-45 |
| 10-12 | $25 | $20-25 | $45-50 |
| **Year 1 total** | $300 | $135-200 | **$435-500** |

Same dollar range, vastly better UX, future-proof for scaling.

### Scenario C — Switch entirely to CF Stream + drop Supabase Pro
| Month | Supabase Free (DB only) | CF Stream | CF Images (if also migrated) | Total |
|---|---|---|---|---|
| 1+ | $0 (DB on Free auto-pauses) | $5-25 | $5-15 | $10-40 |

Cheaper, but loses Supabase Pro's benefits (no auto-pause, 100GB storage for non-video). Not recommended unless DB usage stays trivial and you're OK with weekly auto-pause.

---

## 8. Implementation handoff (concrete files for the next agent)

### Files to modify for Step 1 (compression)
- `apps/mobile/package.json` — add `react-native-compressor` to dependencies
- `apps/mobile/src/hooks/useUpload.ts:28` — raise `MAX_FILE_SIZE` to 250MB
- `apps/mobile/src/hooks/useUpload.ts:~85` — add video branch parallel to image branch
- `apps/mobile/src/hooks/useUpload.ts:~128` — update error message
- Test on at least 1 iPhone capture (QuickTime, ~20MB) and verify compressed size < 8MB
- Build: `cd apps/mobile && eas build --profile production --platform ios && eas submit --platform ios --latest`

### Files to create for Step 2 (CF Stream)
- Vercel env: add `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`
- New: `apps/api/app/api/uploads/video-presign/route.ts` — CF Stream direct upload URL gen
- New: `apps/api/lib/cloudflare.ts` — CF Stream SDK wrapper (just fetch wrappers, no need for cloudflare's npm package)
- Modify: `apps/mobile/src/hooks/useUpload.ts` — branch on mime type, video → new endpoint
- Modify: `apps/mobile/src/components/features/PostCard.tsx` — derive thumbnail URL from HLS URL for CF Stream videos
- Optional: `apps/api/prisma/schema.prisma` — add `mediaProvider` enum column to Post
- Update: `apps/mobile/src/utils/media.ts` (the helper we shipped today) — add CF Stream URL pass-through (the helper already passes-through non-Supabase URLs, so this Just Works)
- Test in Expo Go / TestFlight that HLS playback works on iOS (it will via AVFoundation) and on Android (verify with a TestFlight Android build later)

### Files to create for Step 3 (migration)
- New: `apps/api/scripts/migrate-videos-to-stream.ts` — idempotent batch migrator
- Update: `docs/improvements-backlog.md` — close #003 (50MB cap) and add new entry for "delete legacy Supabase video originals after T+7 days"

---

## 9. Open questions to answer before Step 2

1. **Apple App Store production submission timing**: If you're planning to submit for production review soon, does it make more sense to ship Step 1 (compression) *before* production submission so the release goes in with the upload UX improvements baked in? My recommendation: yes.
2. **Android distribution timing**: CF Stream HLS playback should work on Android via ExoPlayer, but it has to be verified. If you're 3-6 months from Android launch, fine; if it's sooner, test now.
3. **Are the 6 legacy videos actually important?** If creators have already deleted/replaced them, the migration script (Step 3) is wasted work. Worth checking: `SELECT count(*) FROM posts WHERE "mediaUrl" LIKE '%storage/v1/object/public/momento-uploads%' AND "postType"='VIDEO' AND "deletedAt" IS NULL`.
4. **Cost ceiling for CF Stream**: Worth setting a Cloudflare budget alert at $50/mo so you get notified if traffic blows past projections. Free to configure in the CF dashboard.

---

## 10. Linked issues

- **`improvements-backlog.md` #001** (image cache-control) — **resolved today** via `/render/image/` rewrite + per-upload Cache-Control header
- **`improvements-backlog.md` #003** (50MB cap) — Step 1 of this plan moots it (compression) and Step 2 fully solves it (CF Stream's 30GB cap)
- **`improvements-backlog.md` #008** (video editing) — Step 1 includes upload compression; trim/crop UI is still future work (`react-native-video-trim` recommended)
- **`engineering-starter-kit.md` §3.4** (video compression library picks) — `react-native-compressor` is the recommended lib for Step 1

---

## 11. Decision deadline

This isn't urgent — beta is running, current pain is tolerable, Supabase Pro is paid through the month. Realistic timeline:

- **Step 1 (compression)**: ship this week if possible. Cuts complaints, no architectural change.
- **Step 2 (CF Stream)**: decide by **2026-06-15** (3 weeks). If creators keep complaining about video UX after compression ships, that's the trigger. If complaints stop, defer Step 2 by another month and re-evaluate.
- **Step 3 (migration)**: bundled with Step 2.

When you're ready, kick off Step 1 by asking for it explicitly — I'll add `react-native-compressor`, modify the upload hook, and walk you through the native build.
