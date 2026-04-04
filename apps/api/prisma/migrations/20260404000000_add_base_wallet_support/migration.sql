-- AlterTable
ALTER TABLE "users" ADD COLUMN "baseWalletAddress" TEXT,
ADD COLUMN "primaryChain" TEXT NOT NULL DEFAULT 'solana';
CREATE UNIQUE INDEX "users_baseWalletAddress_key" ON "users"("baseWalletAddress");

ALTER TABLE "portfolio_snapshots" ADD COLUMN "chain" TEXT NOT NULL DEFAULT 'solana';
CREATE INDEX "portfolio_snapshots_userId_chain_createdAt_idx" ON "portfolio_snapshots"("userId", "chain", "createdAt");
