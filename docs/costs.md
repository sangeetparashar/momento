# Momento - Cost Breakdown

## Monthly Infrastructure Costs

### Minimum Viable (Development / Low Traffic)
| Service | Tier | Monthly Cost | What You Get |
|---------|------|-------------|--------------|
| Supabase | Free | $0 | 500MB DB, 1GB storage, 50K auth users |
| Upstash Redis | Free | $0 | 10K commands/day |
| Vercel | Hobby | $0 | 100GB bandwidth |
| Helius | Free | $0 | 1M credits/month (~100K RPC calls) |
| Privy | Free | $0 | 1K monthly active wallets |
| EAS | Free | $0 | 30 builds/month |
| **Total** | | **$0** | Sufficient for dev + small beta |

### Production Ready (Launch)
| Service | Tier | Monthly Cost | What You Get |
|---------|------|-------------|--------------|
| Supabase | Pro | $25 | 8GB DB, 100GB storage, unlimited auth |
| Upstash Redis | Pay-as-you-go | ~$10 | 10K commands/day baseline + $0.2/100K |
| Vercel | Pro | $20 | 1TB bandwidth, analytics |
| Helius | Starter | $49 | 10M credits/month |
| Privy | Free→Growth | $0-250 | Free up to 1K MAW, $250 for 10K MAW |
| EAS | Free→Production | $0-99 | Free: 30 builds, $99: priority queue |
| **Total** | | **$55-454** | Scales with usage |

### Per-Use Costs
| Action | Cost | Notes |
|--------|------|-------|
| KYC Verification (Veriff) | ~$2/verification | Only for creator applications |
| Supabase Storage | $0.021/GB/month | After free tier |
| Push Notifications | Free | Via Expo (unlimited) |
| Solana Transactions | ~$0.00025/tx | Network fees, not service fees |

## Build Costs (One-Time, Already Spent)

### AI Agent Build Session
| Phase | Agent | Files Created | Estimated Tokens |
|-------|-------|--------------|-----------------|
| Foundation | Main Context | 10 files | ~20K |
| API Backend | Agent A | 28 files | ~80K |
| Mobile Foundation | Agent B | 36 files | ~60K |
| Mobile UI | Agent C | 20 files | ~140K |
| Integration | Main Context | Verification only | ~30K |
| **Total** | | **93 files, 26K LOC** | **~330K tokens** |

### What Was Built for This Cost
- Complete API backend with 17 endpoints
- Full mobile app with 12 screens
- Shared type system
- Style system with 30+ design tokens
- 8 data hooks with optimistic updates
- Presigned upload flow
- Location-based feed with auto-expanding radius
- Portfolio display with SVG charts
- KYC verification flow
- Push notification infrastructure

## Scaling Cost Projections

| Users (MAU) | Estimated Monthly Cost | Notes |
|-------------|----------------------|-------|
| 100 | $0-25 | Free tiers sufficient |
| 1,000 | $55-105 | Pro tiers needed |
| 10,000 | $200-500 | Privy Growth, more Redis |
| 100,000 | $500-2,000 | Enterprise tiers, CDN |
| 1,000,000 | $2,000-10,000 | Custom contracts, dedicated infra |

## Cost Optimization Tips
1. **Supabase**: Use connection pooling (PgBouncer) to stay on lower tiers
2. **Redis**: Increase cache TTLs where freshness isn't critical
3. **Helius**: Batch RPC calls, cache token metadata (rarely changes)
4. **Veriff**: SKIP_KYC in dev, batch creator onboarding in production
5. **Vercel**: Enable ISR for any static-ish API responses
6. **Storage**: Compress images before upload (saves bandwidth + storage)
