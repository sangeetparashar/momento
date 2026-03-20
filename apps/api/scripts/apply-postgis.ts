/**
 * Idempotent PostGIS setup script.
 * Safe to run on every deploy — all statements use IF NOT EXISTS / CREATE OR REPLACE.
 *
 * Creates:
 *   - geography(Point, 4326) columns on users + posts
 *   - GIST spatial indexes
 *   - BEFORE INSERT/UPDATE triggers that auto-sync lat/lng -> geography
 *   - Backfills any rows missing geography data
 *
 * Usage:
 *   npx tsx scripts/apply-postgis.ts
 *   (or: node -r tsx/register scripts/apply-postgis.ts)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

async function applyPostGIS() {
  console.log('[PostGIS] Starting idempotent migration...');

  // 1. Ensure PostGIS extension
  await prisma.$executeRawUnsafe(
    'CREATE EXTENSION IF NOT EXISTS postgis'
  );
  console.log('[PostGIS] Extension enabled');

  // 2. Add geography columns
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326)'
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326)'
  );
  console.log('[PostGIS] Geography columns ensured');

  // 3. Spatial indexes
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "idx_users_location_geo" ON "users" USING GIST ("location")'
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "idx_posts_location_geo" ON "posts" USING GIST ("location")'
  );
  console.log('[PostGIS] Spatial indexes ensured');

  // 4. Sync functions
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION sync_user_location() RETURNS TRIGGER AS $body$
    BEGIN
      IF NEW."locationLat" IS NOT NULL AND NEW."locationLng" IS NOT NULL THEN
        NEW."location" = ST_SetSRID(ST_MakePoint(NEW."locationLng", NEW."locationLat"), 4326)::geography;
      ELSE
        NEW."location" = NULL;
      END IF;
      RETURN NEW;
    END;
    $body$ LANGUAGE plpgsql
  `);

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION sync_post_location() RETURNS TRIGGER AS $body$
    BEGIN
      IF NEW."latitude" IS NOT NULL AND NEW."longitude" IS NOT NULL THEN
        NEW."location" = ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
      ELSE
        NEW."location" = NULL;
      END IF;
      RETURN NEW;
    END;
    $body$ LANGUAGE plpgsql
  `);
  console.log('[PostGIS] Sync functions created');

  // 5. Triggers (drop + recreate for idempotency)
  await prisma.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS trg_sync_user_location ON "users"'
  );
  await prisma.$executeRawUnsafe(
    'CREATE TRIGGER trg_sync_user_location BEFORE INSERT OR UPDATE OF "locationLat", "locationLng" ON "users" FOR EACH ROW EXECUTE FUNCTION sync_user_location()'
  );

  await prisma.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS trg_sync_post_location ON "posts"'
  );
  await prisma.$executeRawUnsafe(
    'CREATE TRIGGER trg_sync_post_location BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "posts" FOR EACH ROW EXECUTE FUNCTION sync_post_location()'
  );
  console.log('[PostGIS] Triggers created');

  // 6. Backfill any existing rows missing geography
  const usersBackfilled = await prisma.$executeRawUnsafe(
    'UPDATE "users" SET "location" = ST_SetSRID(ST_MakePoint("locationLng", "locationLat"), 4326)::geography WHERE "locationLat" IS NOT NULL AND "locationLng" IS NOT NULL AND "location" IS NULL'
  );
  const postsBackfilled = await prisma.$executeRawUnsafe(
    'UPDATE "posts" SET "location" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "location" IS NULL'
  );
  console.log(`[PostGIS] Backfilled ${usersBackfilled} users, ${postsBackfilled} posts`);

  console.log('[PostGIS] Migration complete.');
}

applyPostGIS()
  .catch((e) => {
    console.error('[PostGIS] Migration FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
