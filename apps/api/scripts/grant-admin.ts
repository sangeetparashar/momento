/**
 * One-off bootstrap: flip a user's `isAdmin` flag in the prod DB.
 *
 * Required before the /api/admin/* endpoints will accept the user's
 * auth token (those endpoints gate on `requireAdmin` which checks
 * `user.isAdmin === true`).
 *
 * Usage:
 *   cd apps/api && pnpm tsx scripts/grant-admin.ts <email>
 *
 * Pass --revoke to remove admin instead:
 *   pnpm tsx scripts/grant-admin.ts <email> --revoke
 *
 * The script prints the affected user before applying any change — abort
 * with Ctrl+C if the wrong user is matched.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const revoke = args.includes('--revoke');

  if (!email) {
    console.error('Usage: pnpm tsx scripts/grant-admin.ts <email> [--revoke]');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      role: true,
      isAdmin: true,
    },
  });

  if (!user) {
    console.error(`No user with email "${email}".`);
    process.exit(1);
  }

  const target = !revoke;
  console.log('Matched user:');
  console.log(`  id          ${user.id}`);
  console.log(`  email       ${user.email}`);
  console.log(`  username    ${user.username ?? '<unset>'}`);
  console.log(`  displayName ${user.displayName ?? '<unset>'}`);
  console.log(`  role        ${user.role}`);
  console.log(`  isAdmin     ${user.isAdmin}  →  ${target}`);

  if (user.isAdmin === target) {
    console.log(`\nNo change needed — isAdmin already ${target}.`);
    return;
  }

  // 2-second pause to allow Ctrl+C if the wrong user matched.
  console.log('\nApplying in 2 seconds. Ctrl+C to abort.');
  await new Promise((r) => setTimeout(r, 2000));

  await prisma.user.update({
    where: { id: user.id },
    data: { isAdmin: target },
  });

  console.log(`✓ isAdmin set to ${target} for ${user.email}`);
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
