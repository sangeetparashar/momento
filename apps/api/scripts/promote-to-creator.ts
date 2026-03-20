import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

// Load .env.local from the api app root
config({ path: resolve(__dirname, '..', '.env.local') });

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  console.log(`Looking for users created between ${startOfYesterday.toISOString()} and ${startOfToday.toISOString()}...`);

  // Show who will be promoted
  const candidates = await prisma.user.findMany({
    where: {
      createdAt: { gte: startOfYesterday, lt: startOfToday },
      role: 'USER',
    },
    select: { id: true, email: true, username: true, displayName: true, createdAt: true },
  });

  if (candidates.length === 0) {
    console.log('No users found to promote. Trying all non-creator users...');
    const allUsers = await prisma.user.findMany({
      where: { role: 'USER' },
      select: { id: true, email: true, username: true, displayName: true, createdAt: true },
    });
    if (allUsers.length === 0) {
      console.log('No regular users found at all.');
      return;
    }
    console.log(`Found ${allUsers.length} regular user(s):`);
    allUsers.forEach((u) => console.log(`  - ${u.email || u.username || u.id} (created ${u.createdAt.toISOString()})`));

    const result = await prisma.user.updateMany({
      where: { role: 'USER' },
      data: { role: 'CREATOR', kycStatus: 'VERIFIED', isAdminApproved: true },
    });
    console.log(`Promoted ${result.count} user(s) to CREATOR.`);
    return;
  }

  console.log(`Found ${candidates.length} user(s) to promote:`);
  candidates.forEach((u) => console.log(`  - ${u.email || u.username || u.id} (created ${u.createdAt.toISOString()})`));

  const result = await prisma.user.updateMany({
    where: {
      createdAt: { gte: startOfYesterday, lt: startOfToday },
      role: 'USER',
    },
    data: { role: 'CREATOR', kycStatus: 'VERIFIED', isAdminApproved: true },
  });

  console.log(`Promoted ${result.count} user(s) to CREATOR.`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
