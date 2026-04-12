-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('PENDING', 'DEPLOYING', 'ACTIVE', 'FAILED', 'GRADUATED');

-- CreateEnum
CREATE TYPE "PoolType" AS ENUM ('BONDING_CURVE', 'RAYDIUM', 'AERODROME');

-- CreateTable
CREATE TABLE "creator_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "mintAddress" TEXT,
    "decimals" INTEGER NOT NULL DEFAULT 9,
    "totalSupply" TEXT NOT NULL DEFAULT '1000000000',
    "circulatingSupply" TEXT NOT NULL DEFAULT '0',
    "poolAddress" TEXT,
    "poolType" "PoolType",
    "bondingCurveParams" JSONB,
    "status" "TokenStatus" NOT NULL DEFAULT 'PENDING',
    "deployTxSignature" TEXT,
    "deployedAt" TIMESTAMP(3),
    "graduatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_tokens_mintAddress_key" ON "creator_tokens"("mintAddress");

-- CreateIndex
CREATE UNIQUE INDEX "creator_tokens_userId_chain_key" ON "creator_tokens"("userId", "chain");

-- CreateIndex
CREATE INDEX "creator_tokens_chain_status_idx" ON "creator_tokens"("chain", "status");

-- CreateIndex
CREATE INDEX "creator_tokens_symbol_idx" ON "creator_tokens"("symbol");

-- AddForeignKey
ALTER TABLE "creator_tokens" ADD CONSTRAINT "creator_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
