/**
 * One-off migration: replace broken `gtv-videos-bucket` sample video URLs
 * with the working `samplelib.com` URLs from seed.ts.
 *
 * Run with:
 *   cd apps/api && pnpm tsx scripts/fix-broken-video-urls.ts
 *
 * Safe to run multiple times — it only updates posts whose mediaUrl matches
 * the known-broken pattern.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BROKEN_HOST = 'storage.googleapis.com/gtv-videos-bucket';

// Keep in sync with SAMPLE_VIDEO_URLS in apps/api/prisma/seed.ts.
const REPLACEMENT_VIDEO_URLS = [
  'https://download.samplelib.com/mp4/sample-5s.mp4',
  'https://download.samplelib.com/mp4/sample-10s.mp4',
  'https://download.samplelib.com/mp4/sample-15s.mp4',
  'https://download.samplelib.com/mp4/sample-20s.mp4',
  'https://download.samplelib.com/mp4/sample-30s.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://videos.pexels.com/video-files/5752729/5752729-sd_640_360_30fps.mp4',
];

async function main() {
  const brokenPosts = await prisma.post.findMany({
    where: {
      mediaUrl: { contains: BROKEN_HOST },
    },
    select: { id: true, mediaUrl: true },
  });

  console.log(`Found ${brokenPosts.length} posts with broken video URLs.`);

  if (brokenPosts.length === 0) {
    await prisma.$disconnect();
    return;
  }

  let i = 0;
  for (const post of brokenPosts) {
    const newUrl =
      REPLACEMENT_VIDEO_URLS[i % REPLACEMENT_VIDEO_URLS.length];
    await prisma.post.update({
      where: { id: post.id },
      data: { mediaUrl: newUrl },
    });
    i += 1;
  }

  console.log(`Updated ${brokenPosts.length} posts.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
