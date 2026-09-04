---
project: "Pairing Assistant"
platform: Cloudflare Workers
worker_name: pairing-assistant
deployed_at: 2026-09-03
url: https://pairing-assistant.michal-nowak-7b3.workers.dev
version_id: f12bb777-d2a7-4997-a0a6-783e1eed1394
status: deployed
---

# Deploy Plan — Pairing Assistant → Cloudflare Workers

Audit trail of the first production deployment: the plan approved via Plan Mode, what actually happened during execution (including two deviations not foreseen in the plan), and the resulting live state. Written per the Lesson 5 chain in `CLAUDE.md` so downstream milestone planning has ground truth for what's already deployed and which secrets are already wired.

## Context

`context/foundation/infrastructure.md` (via `/10x-infra-research`, anti-bias cross-check passed) recommended Cloudflare Workers. `wrangler.jsonc` already used the modern Workers-native config shape — no migration needed, despite `tech-stack.md`'s stale `deployment_target: cloudflare-pages` hint.

Two decisions were confirmed with the user before execution:
1. Rename the Worker from the starter's default `10x-astro-starter` to `pairing-assistant` (matches `tech-stack.md`'s `project_name`) — done before the first deploy, since renaming afterward creates a separate Worker.
2. Set Supabase secrets as part of this first deploy, not deferred — user had real Supabase project credentials ready.

## Plan as approved (Plan Mode)

1. Pre-flight: confirm `git status`, branch `main`, `wrangler whoami` authenticated.
2. Edit `wrangler.jsonc`: `name` → `pairing-assistant`.
3. `npx astro sync` (parity with CI, regenerates `astro:env` types).
4. `npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY` (interactive, values never touch chat/files/history).
5. `npm run build`.
6. `npx wrangler deploy`.
7. Verify: homepage 200, `/dashboard` redirects to `/auth/signin` (proves real middleware), Supabase secrets live (real auth error vs. "not configured"), `wrangler tail` shows request logs, `wrangler deployments list` shows the deployment registered.

Explicitly out of scope (unchanged, still true post-deploy): CI/CD deploy automation, Hyperdrive/direct-Postgres setup, custom domain routing, multi-region config.

## Execution log — what actually happened

Steps 1–5 executed exactly as planned, no deviation.

**Deviation 1 — Supabase key type.** Supabase's current dashboard issues `PUBLISHABLE_KEY` and `SECRET_KEY` (replacing the older `anon`/`service_role` naming) — not anticipated in the plan. Resolved: `PUBLISHABLE_KEY` is correct for `SUPABASE_KEY`, matching the `@supabase/ssr` cookie-based client pattern in `src/lib/supabase.ts`, which relies on Row Level Security per authenticated user. `SECRET_KEY` would bypass RLS entirely and must never be used here.

**Deviation 2 — missing workers.dev subdomain.** First `wrangler deploy` uploaded assets and provisioned the `pairing-assistant-session` KV namespace successfully, but failed at the final publish step: this Cloudflare account had never registered a `workers.dev` subdomain (one-time, account-level, dashboard-only action — no CLI flag exists for it). User registered `michal-nowak-7b3` via the Cloudflare onboarding dashboard. Re-running `wrangler deploy` then succeeded.

**Unplanned but expected side-effect.** The Cloudflare adapter auto-provisions a `SESSION` KV namespace binding (Astro sessions) on first deploy — not declared in `wrangler.jsonc` beforehand, added automatically by `wrangler deploy`. No conflict; expected adapter behavior for Astro 6 sessions support.

## Live state

- **URL**: https://pairing-assistant.michal-nowak-7b3.workers.dev
- **Version ID**: `f12bb777-d2a7-4997-a0a6-783e1eed1394`
- **Worker name**: `pairing-assistant`
- **Account**: `michal.nowak@me.com` (ID `7b39026ebdc8f780dc12a4336b98c46d`), subdomain `michal-nowak-7b3.workers.dev`
- **Secrets wired**: `SUPABASE_URL`, `SUPABASE_KEY` (publishable key) — set via `wrangler secret put`, confirmed live via a real Supabase `Invalid login credentials` response (not a "not configured" fallback)
- **Bindings**: `env.SESSION` (KV, auto-provisioned), `env.IMAGES` (Images), `env.ASSETS` (Assets)

## Verification results

| Check | Result |
|---|---|
| Homepage `/` | 200 |
| `/dashboard` (unauthenticated) | 302 → `/auth/signin` |
| Sign-in with bad credentials | 302 → `/auth/signin?error=Invalid%20login%20credentials` (real Supabase error) |
| `wrangler tail` during live requests | Both `/` and `/dashboard` requests logged in real time |
| `wrangler deployments list` | Full history present: 2 secret changes, 1 failed deploy (pre-subdomain), 1 successful deploy |

## Rollback note

This was the Worker's first deployment — `wrangler rollback` had nothing to revert to at the time. From this point forward (second deployment onward), `npx wrangler rollback [<deployment-id>]` is available against version `f12bb777-d2a7-4997-a0a6-783e1eed1394` as the current baseline.

## Next steps (not yet done, noted for future milestones)

- Wire an automated deploy step into `.github/workflows/ci.yml` (currently lint + build only) using a scoped Cloudflare API token.
- Fix `ci.yml`'s trigger branch (`master`) to match the actual default branch (`main`) — CI currently never fires.
- No custom domain, Hyperdrive, or multi-region setup — deliberately deferred per `infrastructure.md`'s Out of Scope.
