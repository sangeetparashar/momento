# Phase 0 — Ops Runbook (human-only items)

These Phase 0 tasks need live credentials, dashboard access, mainnet, or `pnpm install` —
they can't be done from the agent sandbox. Each has concrete steps + an acceptance check.
Code-side Phase 0 (the devnet spikes) lives in [`/scripts/spikes`](../../scripts/spikes) — see its README.

> Status legend: ☐ todo · ◐ in progress · ☑ done

---

## 0.1 ☐ Rotate exposed secrets
Owner: ops. The `.env.development`/`.env.production` files now carry inline ROTATE notes; full
provider-by-provider steps are in [`SECRETS_REMEDIATION.md`](./SECRETS_REMEDIATION.md).
Team decision: **values left as-is for now** — but rotate the 🔴 set before widening repo access.
**Acceptance:** new keys live in Vercel/EAS env; old keys revoked; `.gitignore` updated in a security PR.

## 0.2 ☐ Activate MoonPay-via-Privy onramp on mainnet
The code path already exists (`usePrivyFunding.ts`, provider pinned `moonpay`, asset USDC). Remaining is config:
1. Privy dashboard (app `cmjbzyj4q00twlb0d1uc5w0sb`) → **enable the MoonPay Fiat On-Ramp plugin**. Until enabled, "Buy USDC" opens an empty modal.
2. Set `EXPO_PUBLIC_SOLANA_NETWORK=mainnet-beta` (and API `SOLANA_NETWORK=mainnet-beta`) via EAS/Vercel env — not committed files.
3. Build a **native** dev/preview build (MoonPay funding does NOT work in Expo Go).
4. Confirm MoonPay supports USDC-on-Solana in your target regions.
**Acceptance:** a real card purchase settles USDC to the embedded wallet on mainnet; balance refreshes.
**Ref:** `research/09-onramp-current.md`, `research/14-moonpay-privy.md`.

## 0.3 ☐ Fix the 0%-earnings fee-ATA bug (mainnet)
Today's flat 4% Jupiter `platformFee` only lands if the fee wallet's **output-token ATA exists** — on mainnet they were never created, so we currently collect **0%**.
1. Reconcile the fee wallet: the scripts hardcode `5U29gHgfeY8rnLcttjcQVLba1KGub9YUt6MP4yDc55yD` while code reads `MOMENTO_FEE_WALLET` — pick ONE canonical wallet and align both.
2. Run `scripts/create-fee-atas.ts` (and/or `create-fee-atas-send.ts`) against **mainnet** for that wallet across the traded mints.
3. (Better, later) make ATA creation lazy/idempotent so arbitrary creator tokens are covered, not a fixed allowlist.
**Acceptance:** a test swap routes the platform fee into the fee wallet's ATA (non-zero balance).
**Ref:** `research/05-token-fee-lp-onchain.md`.

## 0.4 ☐ Stand up Privy server-side signing
No server/delegated signing exists today — it's the keystone for mint/pool/claim/vesting.
1. Add `@privy-io/node` (the new server SDK; `@privy-io/server-auth` is deprecated — plan its migration).
2. In Privy dashboard, enable **Server Wallets**; provision a Momento treasury/server wallet; store its id in Vercel env.
3. Wire a minimal backend signer that builds → signs (server wallet) → self-submits via Helius (so we control RPC/priority fee/Jito tip, since Privy's API has no custom-RPC field).
**Acceptance:** backend signs + lands a trivial mainnet/devnet tx (e.g., memo) via the server wallet.
**Ref:** `research/04-wallet-auth-privy.md`, `research/16-solana-stack.md`.

## 0.5 ◐ Devnet spikes (code) — validate locked decisions
Scripts authored in `scripts/spikes/`. To RUN them you need: a funded **devnet** keypair (`SPIKE_KEYPAIR`),
`pnpm install` of the spike deps, then `npx tsx scripts/spikes/<file>`. Each prints a GO/NO-GO verdict.
- **A — Token-2022 transfer-fee + rebate** (proves the 3–5% + in-app rebate to ~1%).
- **B — Meteora DBC create→graduate→claim** (proves partner economics + configurable splits).
- **C — Streamflow vesting + Jupiter Lock** (proves vesting + lock, incl. the metadata-keypair co-signer).
**Acceptance:** all three print GO on devnet. See `scripts/spikes/README.md`.

## 0.6 ☐ Stack standardization / lockfile
1. **Run `pnpm install`** — required now: Phase 1 removed `@ethersproject/shims` from `package.json` but the lockfile still lists it; CI/EAS `--frozen-lockfile` builds will fail until refreshed.
2. Keep `@solana/web3.js@^1.98` (do NOT adopt `@solana/kit` yet — Meteora/Streamflow/Privy are v1).
3. Add the spike/launch deps when ready: `@solana/spl-token`, `@meteora-ag/dynamic-bonding-curve-sdk`, `@meteora-ag/cp-amm-sdk`, `@streamflow/stream`, `bs58` (+ Jupiter Lock). Verify exact versions with `npm view` (see `research/16-solana-stack.md`).
4. Run `tsc` + `turbo lint` across the monorepo as the **Phase 1 completeness gate** (couldn't run in-sandbox).
**Acceptance:** `pnpm install` clean; `tsc`/`lint`/build green.

---

### Exit criteria for Phase 0
0.1 noted (rotation scheduled) · 0.2 onramp live on mainnet · 0.3 fees > 0% · 0.4 server signer works ·
0.5 all spikes GO · 0.6 lockfile refreshed + typecheck green. Then → **Phase 2** (signing infra + fee
accounting) and **Phase 3** (Meteora launch + LP/fundraise). See `README.md` §11.
