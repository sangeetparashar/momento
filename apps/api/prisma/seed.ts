import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Location Data ──────────────────────────────────────────────────────────

const LOCATIONS = {
  nyc: { lat: 40.7128, lng: -74.006, name: 'New York City' },
  la: { lat: 34.0522, lng: -118.2437, name: 'Los Angeles' },
  london: { lat: 51.5074, lng: -0.1278, name: 'London' },
  tokyo: { lat: 35.6762, lng: 139.6503, name: 'Tokyo' },
  paris: { lat: 48.8566, lng: 2.3522, name: 'Paris' },
};

// Offset by a small random amount to avoid identical locations
function jitter(value: number, range: number = 0.02): number {
  return value + (Math.random() - 0.5) * range;
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding database...');

  // Clean up existing data
  await prisma.like.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.post.deleteMany();
  await prisma.kycRecord.deleteMany();
  await prisma.user.deleteMany();

  // ─── Create Creators ────────────────────────────────────────────────────

  const creator1 = await prisma.user.create({
    data: {
      privyUserId: 'privy-creator-001',
      walletAddress: 'CRtr1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1',
      email: 'alex@momento.test',
      username: 'alexmusic',
      displayName: 'Alex Rivera',
      bio: 'Indie musician exploring the sounds of the city. NYC based producer and singer-songwriter.',
      avatarUrl: 'https://picsum.photos/seed/alex/200/200',
      bannerUrl: 'https://picsum.photos/seed/alexbanner/800/300',
      role: 'CREATOR',
      kycStatus: 'VERIFIED',
      isAdminApproved: true,
      tokenSymbol: 'ALEX',
      socialLinks: {
        instagram: 'alexrivera',
        twitter: 'alexrivera',
        spotify: 'artist/alexrivera',
        youtube: '@alexrivera',
      },
      locationLat: LOCATIONS.nyc.lat,
      locationLng: LOCATIONS.nyc.lng,
      followerCount: 1250,
      followingCount: 42,
      postCount: 0,
    },
  });

  const creator2 = await prisma.user.create({
    data: {
      privyUserId: 'privy-creator-002',
      walletAddress: 'CRtr2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2',
      email: 'bella@momento.test',
      username: 'bellaarts',
      displayName: 'Bella Chen',
      bio: 'Digital artist and muralist. Painting the streets of LA one wall at a time.',
      avatarUrl: 'https://picsum.photos/seed/bella/200/200',
      bannerUrl: 'https://picsum.photos/seed/bellabanner/800/300',
      role: 'CREATOR',
      kycStatus: 'VERIFIED',
      isAdminApproved: true,
      tokenSymbol: 'BELLA',
      socialLinks: {
        instagram: 'bellachen_art',
        twitter: 'bellachen',
        website: 'https://bellachen.art',
      },
      locationLat: LOCATIONS.la.lat,
      locationLng: LOCATIONS.la.lng,
      followerCount: 3400,
      followingCount: 85,
      postCount: 0,
    },
  });

  const creator3 = await prisma.user.create({
    data: {
      privyUserId: 'privy-creator-003',
      walletAddress: 'CRtr3xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx3',
      email: 'james@momento.test',
      username: 'jamesldn',
      displayName: 'James Wright',
      bio: 'Street photographer capturing London life. Featured in National Geographic.',
      avatarUrl: 'https://picsum.photos/seed/james/200/200',
      bannerUrl: 'https://picsum.photos/seed/jamesbanner/800/300',
      role: 'CREATOR',
      kycStatus: 'VERIFIED',
      isAdminApproved: true,
      tokenSymbol: 'JWRT',
      socialLinks: {
        instagram: 'jameswrightphoto',
        twitter: 'jwrightldn',
        website: 'https://jameswright.photo',
      },
      locationLat: LOCATIONS.london.lat,
      locationLng: LOCATIONS.london.lng,
      followerCount: 8200,
      followingCount: 120,
      postCount: 0,
    },
  });

  const creator4 = await prisma.user.create({
    data: {
      privyUserId: 'privy-creator-004',
      walletAddress: 'CRtr4xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx4',
      email: 'yuki@momento.test',
      username: 'yukitokyo',
      displayName: 'Yuki Tanaka',
      bio: 'Tokyo-based DJ and electronic music producer. Blending traditional Japanese sounds with modern beats.',
      avatarUrl: 'https://picsum.photos/seed/yuki/200/200',
      bannerUrl: 'https://picsum.photos/seed/yukibanner/800/300',
      role: 'CREATOR',
      kycStatus: 'VERIFIED',
      isAdminApproved: true,
      tokenSymbol: 'YUKI',
      socialLinks: {
        instagram: 'yukitanaka',
        soundcloud: 'yukitanaka',
        spotify: 'artist/yukitanaka',
      },
      locationLat: LOCATIONS.tokyo.lat,
      locationLng: LOCATIONS.tokyo.lng,
      followerCount: 5600,
      followingCount: 200,
      postCount: 0,
    },
  });

  const creator5 = await prisma.user.create({
    data: {
      privyUserId: 'privy-creator-005',
      walletAddress: 'CRtr5xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx5',
      email: 'marie@momento.test',
      username: 'marieparis',
      displayName: 'Marie Dubois',
      bio: 'Fashion designer and visual storyteller based in Paris. Founder of Maison Marie.',
      avatarUrl: 'https://picsum.photos/seed/marie/200/200',
      bannerUrl: 'https://picsum.photos/seed/mariebanner/800/300',
      role: 'CREATOR',
      kycStatus: 'VERIFIED',
      isAdminApproved: true,
      tokenSymbol: 'MRIE',
      socialLinks: {
        instagram: 'mariedubois',
        twitter: 'mariedubois',
        tiktok: 'mariedubois',
        website: 'https://maisonmarie.fr',
      },
      locationLat: LOCATIONS.paris.lat,
      locationLng: LOCATIONS.paris.lng,
      followerCount: 12300,
      followingCount: 65,
      postCount: 0,
    },
  });

  const creators = [creator1, creator2, creator3, creator4, creator5];
  const creatorLocations = [LOCATIONS.nyc, LOCATIONS.la, LOCATIONS.london, LOCATIONS.tokyo, LOCATIONS.paris];

  console.log(`Created ${creators.length} creators`);

  // ─── Create Test Users ──────────────────────────────────────────────────

  const testUsers = [];
  for (let i = 1; i <= 5; i++) {
    const locKeys = Object.keys(LOCATIONS) as (keyof typeof LOCATIONS)[];
    const loc = LOCATIONS[locKeys[i % locKeys.length]];
    const testUser = await prisma.user.create({
      data: {
        privyUserId: `privy-user-${String(i).padStart(3, '0')}`,
        walletAddress: `USR${i}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx${i}`,
        email: `testuser${i}@momento.test`,
        username: `testuser${i}`,
        displayName: `Test User ${i}`,
        bio: `Just a test user exploring Momento.`,
        avatarUrl: `https://picsum.photos/seed/user${i}/200/200`,
        role: 'USER',
        kycStatus: 'NONE',
        locationLat: jitter(loc.lat),
        locationLng: jitter(loc.lng),
        followerCount: 0,
        followingCount: 0,
        postCount: 0,
      },
    });
    testUsers.push(testUser);
  }

  console.log(`Created ${testUsers.length} test users`);

  // ─── Create Posts ───────────────────────────────────────────────────────

  const postCaptions = [
    'Just vibing in the city today',
    'New drop coming soon! Stay tuned',
    'Behind the scenes of my latest project',
    'This spot is absolutely incredible',
    'Working on something special',
    'Sunset sessions are the best',
    'Found this amazing hidden gem',
    'Studio life at its finest',
    'Exploring new neighborhoods',
    'The creative process never stops',
    'Morning coffee and inspiration',
    'Night vibes in the city',
    'Collaboration with amazing artists',
    'This is where the magic happens',
    'Grateful for this community',
    'New music dropping at midnight',
    'Art knows no boundaries',
    'The view from my studio',
    'Late night creative sessions',
    'Another day, another masterpiece',
  ];

  const posts = [];
  for (let i = 0; i < 20; i++) {
    const creatorIndex = i % creators.length;
    const creator = creators[creatorIndex];
    const loc = creatorLocations[creatorIndex];
    const postType = i % 3 === 0 ? 'TEXT' : i % 3 === 1 ? 'IMAGE' : 'VIDEO';
    const createdAt = new Date(Date.now() - (20 - i) * 3600 * 1000); // spread out over 20 hours

    const post = await prisma.post.create({
      data: {
        creatorId: creator.id,
        postType,
        content: postType === 'TEXT' ? postCaptions[i] : null,
        caption: postType !== 'TEXT' ? postCaptions[i] : null,
        mediaUrl:
          postType === 'IMAGE'
            ? `https://picsum.photos/seed/post${i}/600/400`
            : postType === 'VIDEO'
              ? `https://sample-videos.com/video${i % 3 + 1}.mp4`
              : null,
        mediaUrls:
          postType === 'IMAGE'
            ? [
                `https://picsum.photos/seed/post${i}a/600/400`,
                `https://picsum.photos/seed/post${i}b/600/400`,
              ]
            : null,
        latitude: jitter(loc.lat),
        longitude: jitter(loc.lng),
        likeCount: Math.floor(Math.random() * 100),
        commentCount: 0,
        createdAt,
        updatedAt: createdAt,
      },
    });
    posts.push(post);
  }

  // Update creator post counts
  for (const creator of creators) {
    const count = posts.filter((p) => p.creatorId === creator.id).length;
    await prisma.user.update({
      where: { id: creator.id },
      data: { postCount: count },
    });
  }

  console.log(`Created ${posts.length} posts`);

  // ─── Create Follows ─────────────────────────────────────────────────────

  const followPairs: { followerId: string; followingId: string }[] = [];

  // Each test user follows 2-3 creators
  for (const testUser of testUsers) {
    const numFollows = 2 + Math.floor(Math.random() * 2);
    const shuffled = [...creators].sort(() => Math.random() - 0.5);
    for (let i = 0; i < numFollows && i < shuffled.length; i++) {
      followPairs.push({
        followerId: testUser.id,
        followingId: shuffled[i].id,
      });
    }
  }

  // Some creators follow each other
  followPairs.push({ followerId: creator1.id, followingId: creator2.id });
  followPairs.push({ followerId: creator2.id, followingId: creator3.id });
  followPairs.push({ followerId: creator3.id, followingId: creator1.id });
  followPairs.push({ followerId: creator4.id, followingId: creator5.id });
  followPairs.push({ followerId: creator5.id, followingId: creator4.id });

  for (const pair of followPairs) {
    await prisma.follow.create({ data: pair });
  }

  // Update follower/following counts
  for (const user of [...creators, ...testUsers]) {
    const followerCount = followPairs.filter((p) => p.followingId === user.id).length;
    const followingCount = followPairs.filter((p) => p.followerId === user.id).length;
    await prisma.user.update({
      where: { id: user.id },
      data: { followerCount, followingCount },
    });
  }

  console.log(`Created ${followPairs.length} follows`);

  // ─── Create Some Comments ───────────────────────────────────────────────

  const commentTexts = [
    'This is amazing!',
    'Love this content!',
    'Keep it up!',
    'Incredible work!',
    'So inspiring!',
    'Wow, just wow!',
    'Can\'t wait for more!',
    'This made my day!',
    'Absolutely beautiful!',
    'You\'re so talented!',
  ];

  let commentCount = 0;
  for (let i = 0; i < 30; i++) {
    const post = posts[Math.floor(Math.random() * posts.length)];
    const allUsers = [...creators, ...testUsers];
    const commenter = allUsers[Math.floor(Math.random() * allUsers.length)];

    await prisma.comment.create({
      data: {
        userId: commenter.id,
        postId: post.id,
        content: commentTexts[i % commentTexts.length],
      },
    });
    commentCount++;

    await prisma.post.update({
      where: { id: post.id },
      data: { commentCount: { increment: 1 } },
    });
  }

  console.log(`Created ${commentCount} comments`);

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
