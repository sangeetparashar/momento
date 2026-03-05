-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography columns to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326);

-- Add geography columns to posts table
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326);

-- Create spatial indexes
CREATE INDEX IF NOT EXISTS "idx_users_location_geo" ON "users" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "idx_posts_location_geo" ON "posts" USING GIST ("location");

-- Function to sync user lat/lng to geography column
CREATE OR REPLACE FUNCTION sync_user_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."locationLat" IS NOT NULL AND NEW."locationLng" IS NOT NULL THEN
    NEW."location" = ST_SetSRID(ST_MakePoint(NEW."locationLng", NEW."locationLat"), 4326)::geography;
  ELSE
    NEW."location" = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to sync post lat/lng to geography column
CREATE OR REPLACE FUNCTION sync_post_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."latitude" IS NOT NULL AND NEW."longitude" IS NOT NULL THEN
    NEW."location" = ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  ELSE
    NEW."location" = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-sync on insert/update
DROP TRIGGER IF EXISTS trg_sync_user_location ON "users";
CREATE TRIGGER trg_sync_user_location
  BEFORE INSERT OR UPDATE OF "locationLat", "locationLng"
  ON "users"
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_location();

DROP TRIGGER IF EXISTS trg_sync_post_location ON "posts";
CREATE TRIGGER trg_sync_post_location
  BEFORE INSERT OR UPDATE OF "latitude", "longitude"
  ON "posts"
  FOR EACH ROW
  EXECUTE FUNCTION sync_post_location();

-- Backfill existing data
UPDATE "users"
SET "location" = ST_SetSRID(ST_MakePoint("locationLng", "locationLat"), 4326)::geography
WHERE "locationLat" IS NOT NULL AND "locationLng" IS NOT NULL;

UPDATE "posts"
SET "location" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;
