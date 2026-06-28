# Secrets Remediation Checklist

**Status:** Documentation only — no code/git changes made (per request).
**Date:** 2026-06-23
**Severity:** High. Live secrets are committed to the repo and exist in git **history**.

> ⚠️ **Rotation is mandatory, not optional.** These secrets are in committed git history. Deleting the
> files from `HEAD` does **not** remove them from history — anyone with repo access (now or via any past
> clone/fork) still has them. The only real fix is to **rotate the keys at each provider**, then prevent
> recommitment. History rewrite (BFG/`git filter-repo`) is secondary and does not undo exposure.

---

## 1. Root cause

`.gitignore` ignores `.env`, `.env.local`, `.env.*.local` — but **not** `.env.development` or
`.env.production`. Those files were therefore committed. Several real secrets also live in `eas.json` (via
the RPC URL) and one is hardcoded in source.

## 2. Exposed locations (git-tracked)

| File | Contains | Severity |
|---|---|---|
| `apps/api/.env.development` | `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`, `PRIVY_APP_SECRET`, `VERIFF_API_KEY`, `VERIFF_SHARED_SECRET`, `UPSTASH_REDIS_REST_TOKEN`, `HELIUS_API_KEY`, `SKIP_KYC` | 🔴 Critical |
| `apps/mobile/.env.development` | `EXPO_PUBLIC_SOLANA_RPC_URL` (embeds the Helius key in the URL) | 🟠 High |
| `apps/mobile/.env.production` | `EXPO_PUBLIC_SOLANA_RPC_URL` (embeds the Helius key) | 🟠 High |
| `apps/mobile/eas.json` | `EXPO_PUBLIC_SOLANA_RPC_URL` (embeds the Helius key) | 🟠 High |
| `apps/mobile/src/providers/PrivyGuard.tsx:64` | Hardcoded Privy `clientId` (public client identifier — low risk, but should be env-driven) | 🟡 Low |
| `apps/api/app/api/debug/auth/route.ts` | Info-leaking debug auth route (not a secret, but exposes auth internals) | 🟡 Low |

> `apps/landing/.env.{development,production}` are tracked but empty. `*.env.example`/`.env.local.example`
> files are placeholders — verify they contain no real values, but they're expected to be committed.

## 3. Rotation steps (do these first, in order of severity)

**🔴 Critical — rotate immediately:**
- [ ] **Supabase** — regenerate the `service_role` key (Project → Settings → API). It bypasses RLS = full DB access. Update the deploy env (Vercel) after rotating.
- [ ] **Database** — rotate the Postgres password (Supabase → Database → Settings); update `DATABASE_URL` + `DIRECT_URL` in Vercel.
- [ ] **Privy** — rotate `PRIVY_APP_SECRET` (Privy dashboard → app settings → API keys). This secret controls server-side auth verification and (soon) server-wallet signing — high blast radius.
- [ ] **Veriff** — rotate `VERIFF_API_KEY` + `VERIFF_SHARED_SECRET` (Veriff dashboard). Controls KYC webhooks/signatures.

**🟠 High:**
- [ ] **Upstash Redis** — rotate `UPSTASH_REDIS_REST_TOKEN` (Upstash console → database → REST API → roll token).
- [ ] **Helius** — rotate `HELIUS_API_KEY` (Helius dashboard). Note the key is embedded in the **mobile RPC URL** (`EXPO_PUBLIC_SOLANA_RPC_URL`) and `eas.json`, so it is effectively shipped to clients regardless. After rotating: (a) restrict the key (Helius supports allowed-origins/IP + rate limits), and (b) consider proxying RPC through the API so the raw key isn't in the app bundle.

**🟡 Low / config:**
- [ ] Move the Privy `clientId` out of `PrivyGuard.tsx:64` into `EXPO_PUBLIC_PRIVY_CLIENT_ID`.
- [ ] Confirm `SKIP_KYC` is **never** truthy in production (it auto-promotes creators — see `02-api-backend.md`).
- [ ] Gate or delete `apps/api/app/api/debug/auth/route.ts` behind a non-prod check.

## 4. Prevent recommitment (.gitignore)

Add to root `.gitignore`:
```
.env.development
.env.production
.env.*.development
.env.*.production
# keep examples tracked:
!.env.example
!.env.local.example
```
Then untrack the committed files **without deleting them locally**:
```
git rm --cached apps/api/.env.development \
  apps/mobile/.env.development apps/mobile/.env.production
# (eas.json must stay tracked — instead remove the secret-bearing RPC URL from it
#  and inject EXPO_PUBLIC_SOLANA_RPC_URL via EAS secrets / env)
```
> ⚠️ These commands are listed for reference only — **not executed** (checklist-only per request). Run them
> as part of a dedicated security PR, after rotation.

## 5. EAS / Vercel secret injection (go-forward pattern)

- **Mobile (EAS):** store `EXPO_PUBLIC_SOLANA_RPC_URL` (or a key-less proxy URL) as an **EAS secret**
  (`eas secret:create`) and reference it from `eas.json` env, rather than inlining the value.
- **API (Vercel):** all server secrets belong in **Vercel Project → Environment Variables**, never in a
  committed `.env.*` file. The repo already documents an encrypted vault
  (`sangeetparashar/momento-secrets-vault`) — that, plus Vercel/EAS, should be the only homes for secrets.

## 6. Optional — purge from history

After rotation, if you want the values gone from history (e.g., before widening repo access):
- Use `git filter-repo` (preferred) or BFG Repo-Cleaner to strip the files, then force-push and have all
  collaborators re-clone. Coordinate — this rewrites SHAs. **Lower priority than rotation.**

---

**Bottom line:** rotate the 🔴 + 🟠 keys today; the migration work can proceed in parallel. Everything else
(gitignore, env injection, history purge) is cleanup that prevents recurrence.
