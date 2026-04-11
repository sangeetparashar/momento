-- Rename solBalance/solValueUsd to chain-agnostic names
ALTER TABLE "portfolio_snapshots" RENAME COLUMN "solBalance" TO "nativeBalance";
ALTER TABLE "portfolio_snapshots" RENAME COLUMN "solValueUsd" TO "nativeValueUsd";

-- Create wallet_transactions table for server-side tx history
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "inputToken" TEXT,
    "outputToken" TEXT,
    "inputAmount" TEXT,
    "outputAmount" TEXT,
    "recipientAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one record per user+chain+signature
CREATE UNIQUE INDEX "wallet_transactions_userId_chain_signature_key" ON "wallet_transactions"("userId", "chain", "signature");

-- Index for listing transactions by user, chain, and time
CREATE INDEX "wallet_transactions_userId_chain_createdAt_idx" ON "wallet_transactions"("userId", "chain", "createdAt");
