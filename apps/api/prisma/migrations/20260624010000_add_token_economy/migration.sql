-- =============================================================================
-- Migration: add_token_economy
-- Part of the Solana-only migration (Phase 2: token economy, 2026-06).
-- See docs/solana-migration/design/phase2/CONTRACTS.md (§a) and SPEC.md.
-- =============================================================================
--
-- WHAT THIS MIGRATION DOES (all ADDITIVE — no drops, no data loss)
--   1. CREATE TYPE for the 9 new enums (TokenProgram, FundraiseStatus, FeeSource,
--      TradeSide, FeeEventType, FeeRecipient, LpProvider, LpOwner,
--      VestingProvider, VestingStatus).
--   2. ALTER TYPE "PoolType" ADD VALUE for the two Meteora venues
--      (METEORA_DBC, METEORA_DAMM_V2). Adding enum values is a safe, additive op.
--   3. ALTER TABLE "creator_tokens" ADD COLUMN for the 8 new token-economy fields.
--   4. CREATE TABLE for the 7 new tables (token_fee_configs, trades, fee_events,
--      token_fundraises, fundraise_contributions, lp_positions, vesting_schedules)
--      with PKs, indexes, unique constraints and FKs.
--
-- POSTGRES ENUM CAVEAT (`ALTER TYPE ... ADD VALUE`)
--   In some Postgres versions `ALTER TYPE ... ADD VALUE` cannot run inside a
--   transaction block, and a freshly added enum value cannot be used in the SAME
--   transaction that added it. The two `ADD VALUE` statements below are therefore
--   kept as standalone statements and ordered before everything that might read
--   them. None of the new tables reference the added PoolType values at DDL time
--   (defaults use the existing LpProvider enum), so this is safe. `ADD VALUE IF
--   NOT EXISTS` makes the value adds idempotent. If your deploy wraps the whole
--   file in one transaction and your Postgres rejects in-txn ADD VALUE, run the
--   two ALTER TYPE statements first in their own transaction.
--
-- DEV vs PROD CAVEAT
--   This repo uses BOTH a `migrations/` folder AND `prisma db push` in dev/CI.
--     * PROD / CI: applied verbatim via `prisma migrate deploy`.
--     * DEV (`prisma db push`): Prisma diffs schema.prisma against the live DB and
--       may NOT execute this exact SQL. Confirm both paths stay in sync.
--   WARNING: NEVER run `prisma db push --accept-data-loss` blindly — the PostGIS
--   geography columns/indexes/triggers from `00_postgis_setup` are invisible to
--   Prisma and would be dropped.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. CreateEnum (new types) — must exist before tables that reference them
-- -----------------------------------------------------------------------------
-- CreateEnum
CREATE TYPE "TokenProgram" AS ENUM ('TOKEN_CLASSIC', 'TOKEN_2022');

-- CreateEnum
CREATE TYPE "FundraiseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'THRESHOLD_MET', 'FINALIZING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FeeSource" AS ENUM ('IN_APP', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "FeeEventType" AS ENUM ('TRANSFER_FEE_WITHHELD', 'PARTNER_TRADING_FEE', 'CREATOR_TRADING_FEE', 'LOCKED_LP_FEE', 'SURPLUS', 'REBATE', 'CLAIMED');

-- CreateEnum
CREATE TYPE "FeeRecipient" AS ENUM ('PLATFORM', 'CREATOR', 'PROTOCOL', 'TRADER');

-- CreateEnum
CREATE TYPE "LpProvider" AS ENUM ('METEORA_DAMM_V2', 'METEORA_DAMM_V1', 'METEORA_DLMM');

-- CreateEnum
CREATE TYPE "LpOwner" AS ENUM ('PARTNER', 'CREATOR');

-- CreateEnum
CREATE TYPE "VestingProvider" AS ENUM ('STREAMFLOW', 'JUP_LOCK');

-- CreateEnum
CREATE TYPE "VestingStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED');


-- -----------------------------------------------------------------------------
-- 2. AlterEnum "PoolType" — add the two Meteora venues (standalone statements;
--    see "POSTGRES ENUM CAVEAT" header note). Idempotent via IF NOT EXISTS.
-- -----------------------------------------------------------------------------
-- AlterEnum
ALTER TYPE "PoolType" ADD VALUE IF NOT EXISTS 'METEORA_DBC';

-- AlterEnum
ALTER TYPE "PoolType" ADD VALUE IF NOT EXISTS 'METEORA_DAMM_V2';


-- -----------------------------------------------------------------------------
-- 3. AlterTable "creator_tokens" — add token-economy fields
-- -----------------------------------------------------------------------------
-- AlterTable
ALTER TABLE "creator_tokens"
    ADD COLUMN IF NOT EXISTS "tokenProgram" "TokenProgram" NOT NULL DEFAULT 'TOKEN_2022',
    ADD COLUMN IF NOT EXISTS "transferFeeBps" INTEGER,
    ADD COLUMN IF NOT EXISTS "transferFeeMaxBaseUnits" TEXT,
    ADD COLUMN IF NOT EXISTS "transferFeeAuthority" TEXT,
    ADD COLUMN IF NOT EXISTS "withdrawWithheldAuthority" TEXT,
    ADD COLUMN IF NOT EXISTS "quoteMint" TEXT,
    ADD COLUMN IF NOT EXISTS "dbcConfigKey" TEXT,
    ADD COLUMN IF NOT EXISTS "dbcPoolAddress" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "creator_tokens_status_idx" ON "creator_tokens"("status");


-- -----------------------------------------------------------------------------
-- 4. CreateTable "token_fee_configs"
-- -----------------------------------------------------------------------------
-- CreateTable
CREATE TABLE "token_fee_configs" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "transferFeeBps" INTEGER NOT NULL,
    "rebateTargetBps" INTEGER NOT NULL DEFAULT 100,
    "creatorTradingFeeBps" INTEGER NOT NULL DEFAULT 5000,
    "partnerTradingFeeBps" INTEGER NOT NULL DEFAULT 5000,
    "protocolFeeBps" INTEGER NOT NULL DEFAULT 2000,
    "feeClaimer" TEXT,
    "creatorFeeWallet" TEXT,
    "rebateWallet" TEXT,
    "withdrawWithheldAuthority" TEXT,
    "rebateMint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_fee_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_fee_configs_tokenId_key" ON "token_fee_configs"("tokenId");


-- -----------------------------------------------------------------------------
-- 5. CreateTable "trades"
-- -----------------------------------------------------------------------------
-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "userId" TEXT,
    "traderWallet" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "source" "FeeSource" NOT NULL,
    "venue" "PoolType" NOT NULL,
    "intentId" TEXT,
    "signature" TEXT,
    "amountInBaseUnits" TEXT NOT NULL,
    "amountInMint" TEXT NOT NULL,
    "amountOutBaseUnits" TEXT NOT NULL,
    "amountOutMint" TEXT NOT NULL,
    "priceUsd" DOUBLE PRECISION,
    "priceTs" TIMESTAMP(3),
    "transferFeeBaseUnits" TEXT NOT NULL DEFAULT '0',
    "feeBps" INTEGER,
    "rebateBaseUnits" TEXT NOT NULL DEFAULT '0',
    "rebateMint" TEXT,
    "rebatePaid" BOOLEAN NOT NULL DEFAULT false,
    "rebateSignature" TEXT,
    "poolAddress" TEXT,
    "blockTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trades_intentId_key" ON "trades"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "trades_signature_key" ON "trades"("signature");

-- CreateIndex
CREATE INDEX "trades_tokenId_blockTime_idx" ON "trades"("tokenId", "blockTime");

-- CreateIndex
CREATE INDEX "trades_userId_blockTime_idx" ON "trades"("userId", "blockTime");

-- CreateIndex
CREATE INDEX "trades_tokenId_side_idx" ON "trades"("tokenId", "side");

-- CreateIndex
CREATE INDEX "trades_traderWallet_idx" ON "trades"("traderWallet");

-- CreateIndex
CREATE INDEX "trades_source_rebatePaid_idx" ON "trades"("source", "rebatePaid");


-- -----------------------------------------------------------------------------
-- 6. CreateTable "fee_events"
-- -----------------------------------------------------------------------------
-- CreateTable
CREATE TABLE "fee_events" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "tradeId" TEXT,
    "type" "FeeEventType" NOT NULL,
    "source" "FeeSource" NOT NULL,
    "recipient" "FeeRecipient" NOT NULL,
    "recipientWallet" TEXT,
    "grossBaseUnits" TEXT NOT NULL DEFAULT '0',
    "feeBaseUnits" TEXT NOT NULL DEFAULT '0',
    "netBaseUnits" TEXT NOT NULL DEFAULT '0',
    "amountMint" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION,
    "feeBps" INTEGER,
    "signature" TEXT,
    "internalRef" TEXT,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "claimSignature" TEXT,
    "blockTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fee_events_signature_key" ON "fee_events"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "fee_events_internalRef_key" ON "fee_events"("internalRef");

-- CreateIndex
CREATE INDEX "fee_events_tokenId_createdAt_idx" ON "fee_events"("tokenId", "createdAt");

-- CreateIndex
CREATE INDEX "fee_events_tokenId_type_idx" ON "fee_events"("tokenId", "type");

-- CreateIndex
CREATE INDEX "fee_events_recipient_claimed_idx" ON "fee_events"("recipient", "claimed");

-- CreateIndex
CREATE INDEX "fee_events_type_createdAt_idx" ON "fee_events"("type", "createdAt");

-- CreateIndex
CREATE INDEX "fee_events_tradeId_idx" ON "fee_events"("tradeId");


-- -----------------------------------------------------------------------------
-- 7. CreateTable "token_fundraises"
-- -----------------------------------------------------------------------------
-- CreateTable
CREATE TABLE "token_fundraises" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "status" "FundraiseStatus" NOT NULL DEFAULT 'DRAFT',
    "quoteMint" TEXT NOT NULL,
    "thresholdBaseUnits" TEXT NOT NULL,
    "raisedBaseUnits" TEXT NOT NULL DEFAULT '0',
    "contributorCount" INTEGER NOT NULL DEFAULT 0,
    "minContributionBaseUnits" TEXT,
    "maxContributionBaseUnits" TEXT,
    "partnerLpBps" INTEGER,
    "creatorLpBps" INTEGER,
    "partnerLockedLpBps" INTEGER,
    "creatorLockedLpBps" INTEGER,
    "migrationFeeBps" INTEGER,
    "leftoverReceiver" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "finalizeSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_fundraises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_fundraises_tokenId_key" ON "token_fundraises"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "token_fundraises_finalizeSignature_key" ON "token_fundraises"("finalizeSignature");

-- CreateIndex
CREATE INDEX "token_fundraises_status_idx" ON "token_fundraises"("status");


-- -----------------------------------------------------------------------------
-- 8. CreateTable "fundraise_contributions"
-- -----------------------------------------------------------------------------
-- CreateTable
CREATE TABLE "fundraise_contributions" (
    "id" TEXT NOT NULL,
    "fundraiseId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "userId" TEXT,
    "walletAddress" TEXT NOT NULL,
    "amountBaseUnits" TEXT NOT NULL,
    "quoteMint" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "refundSignature" TEXT,
    "blockTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fundraise_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fundraise_contributions_signature_key" ON "fundraise_contributions"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "fundraise_contributions_refundSignature_key" ON "fundraise_contributions"("refundSignature");

-- CreateIndex
CREATE INDEX "fundraise_contributions_fundraiseId_createdAt_idx" ON "fundraise_contributions"("fundraiseId", "createdAt");

-- CreateIndex
CREATE INDEX "fundraise_contributions_tokenId_createdAt_idx" ON "fundraise_contributions"("tokenId", "createdAt");

-- CreateIndex
CREATE INDEX "fundraise_contributions_userId_idx" ON "fundraise_contributions"("userId");

-- CreateIndex
CREATE INDEX "fundraise_contributions_walletAddress_idx" ON "fundraise_contributions"("walletAddress");


-- -----------------------------------------------------------------------------
-- 9. CreateTable "lp_positions"
-- -----------------------------------------------------------------------------
-- CreateTable
CREATE TABLE "lp_positions" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "provider" "LpProvider" NOT NULL DEFAULT 'METEORA_DAMM_V2',
    "owner" "LpOwner" NOT NULL,
    "ownerWallet" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "positionAddress" TEXT,
    "positionNftMint" TEXT,
    "lpMint" TEXT,
    "baseReserveBaseUnits" TEXT,
    "quoteReserveBaseUnits" TEXT,
    "liquidity" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT true,
    "lockedUntil" TIMESTAMP(3),
    "createSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lp_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lp_positions_positionNftMint_key" ON "lp_positions"("positionNftMint");

-- CreateIndex
CREATE UNIQUE INDEX "lp_positions_createSignature_key" ON "lp_positions"("createSignature");

-- CreateIndex
CREATE UNIQUE INDEX "lp_positions_tokenId_owner_key" ON "lp_positions"("tokenId", "owner");

-- CreateIndex
CREATE INDEX "lp_positions_tokenId_idx" ON "lp_positions"("tokenId");

-- CreateIndex
CREATE INDEX "lp_positions_owner_idx" ON "lp_positions"("owner");

-- CreateIndex
CREATE INDEX "lp_positions_poolAddress_idx" ON "lp_positions"("poolAddress");


-- -----------------------------------------------------------------------------
-- 10. CreateTable "vesting_schedules"
-- -----------------------------------------------------------------------------
-- CreateTable
CREATE TABLE "vesting_schedules" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "beneficiaryUserId" TEXT,
    "beneficiaryWallet" TEXT NOT NULL,
    "provider" "VestingProvider" NOT NULL,
    "streamId" TEXT,
    "totalBaseUnits" TEXT NOT NULL,
    "releasedBaseUnits" TEXT NOT NULL DEFAULT '0',
    "tokenMint" TEXT NOT NULL,
    "cliffSeconds" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "cliffAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "status" "VestingStatus" NOT NULL DEFAULT 'PENDING',
    "createSignature" TEXT,
    "cancelSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vesting_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vesting_schedules_streamId_key" ON "vesting_schedules"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "vesting_schedules_createSignature_key" ON "vesting_schedules"("createSignature");

-- CreateIndex
CREATE INDEX "vesting_schedules_tokenId_idx" ON "vesting_schedules"("tokenId");

-- CreateIndex
CREATE INDEX "vesting_schedules_beneficiaryUserId_idx" ON "vesting_schedules"("beneficiaryUserId");

-- CreateIndex
CREATE INDEX "vesting_schedules_beneficiaryWallet_idx" ON "vesting_schedules"("beneficiaryWallet");

-- CreateIndex
CREATE INDEX "vesting_schedules_status_idx" ON "vesting_schedules"("status");


-- -----------------------------------------------------------------------------
-- 11. AddForeignKey — all new tables
-- -----------------------------------------------------------------------------
-- AddForeignKey
ALTER TABLE "token_fee_configs" ADD CONSTRAINT "token_fee_configs_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "creator_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "creator_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_events" ADD CONSTRAINT "fee_events_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "creator_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_events" ADD CONSTRAINT "fee_events_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_fundraises" ADD CONSTRAINT "token_fundraises_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "creator_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fundraise_contributions" ADD CONSTRAINT "fundraise_contributions_fundraiseId_fkey" FOREIGN KEY ("fundraiseId") REFERENCES "token_fundraises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fundraise_contributions" ADD CONSTRAINT "fundraise_contributions_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "creator_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fundraise_contributions" ADD CONSTRAINT "fundraise_contributions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lp_positions" ADD CONSTRAINT "lp_positions_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "creator_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vesting_schedules" ADD CONSTRAINT "vesting_schedules_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "creator_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vesting_schedules" ADD CONSTRAINT "vesting_schedules_beneficiaryUserId_fkey" FOREIGN KEY ("beneficiaryUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
