---
project: "Pairing Assistant"
researched_at: 2026-09-03
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (React 19 islands)
  runtime: Cloudflare Workers (workerd)
---

## Recommendation

**Deploy on Cloudflare Workers.**

Cloudflare passed all five agent-friendly criteria (CLI-first, managed/serverless, agent-readable docs, stable deploy API, MCP/integration) and costs $0/month at the project's expected 10k–100k requests/month (Free plan: 100k req/day). It matches the developer's stated platform familiarity (interview Q3) and cost-minimization priority (Q2), and the repo's `wrangler.jsonc` is already configured in the modern Workers-native format — no migration needed, despite `tech-stack.md`'s `deployment_target: cloudflare-pages` hint predating Cloudflare's 2026 steer away from Pages for new full-stack SSR projects.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Vercel | Pass | Pass | Pass | Pass | Partial | 4 Pass / 1 Partial |
| Railway | Pass | Partial | Pass | Pass | Pass | 4 Pass / 1 Partial |
| Netlify | Partial | Pass | Pass | Pass | Partial | 3 Pass / 2 Partial |
| Render | Partial | Partial | Pass | Pass | Pass | 3 Pass / 2 Partial |
| Fly.io | Partial | Pass | Partial | Pass | Partial | 2 Pass / 3 Partial |

Notes per platform:

- **Cloudflare Workers** — `wrangler deploy`/`rollback`/`tail` all GA and deterministic; docs served as markdown with `llms.txt` plus raw source on GitHub; Free plan (100k req/day, 10ms CPU/invocation) covers this project's scale at $0/mo; MCP/Agents SDK actively evolving but functional today. Gotchas: `astro:env` can't read Cloudflare bindings (KV/D1/R2/Hyperdrive/DO — irrelevant for MVP since Supabase auth uses plain secret env vars, not bindings); Cloudflare now steers new SSR projects to Workers over Pages.
- **Vercel** — Excellent CLI (`vercel deploy`/`rollback`/`logs`) and `llms.txt` docs. Native WebSocket support is public beta with a 5-minute cap (irrelevant here — Q1 confirmed no persistent-connection need). MCP server is public beta, read-oriented tools only. Free Hobby tier is explicitly non-commercial-use only — worth re-checking eligibility once the app has real users.
- **Railway** — Strong CLI, docs, and a GA, full read/write MCP server (best-in-class of the six on this axis). No free tier for production use (~$5–15/mo minimum) — the weakest fit against the cost-minimization priority (Q2). External Supabase requires the Session Pooler (IPv6 gap on direct connections).
- **Netlify** — Solid adapter, docs, deploy API, and a Supabase extension that auto-injects env vars. Rollback is dashboard-only (no CLI verb found), and MCP server status is ambiguous (active development, no explicit GA label). Free tier recently (Apr 2026) moved to a credit-based model — likely fine at this scale, but newly changed.
- **Render** — Full WebSocket/persistent-process support and a GA MCP server, but rollback is API/dashboard-only (no CLI verb), and the free tier sleeps after 15 min idle with a ~1-minute cold start — that directly conflicts with the PRD's "no perceptible delay" live-match NFR, making the realistic cost floor $7/mo (Starter), not $0.
- **Fly.io** — Full VM/WebSocket support (unneeded here) but requires a Dockerfile, has no free tier (~$10–20/mo minimum), docs are a non-standard `.html.markerb` format, and its MCP server is early-stage (4 commits, no releases). Weakest fit for a cost-sensitive, low-complexity MVP.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Only platform to pass all five criteria. $0/month at MVP scale, matches the developer's existing familiarity and the Cloudflare skills/MCP plugin already installed in this environment, and requires no migration — `wrangler.jsonc` already targets Workers, not the legacy Pages format.

#### 2. Vercel

Strongest runner-up: GA CLI/docs/deploy API, only the MCP server (beta) and free-tier commercial-use terms hold it back from a tie. Reasonable fallback if a Cloudflare-specific blocker appears.

#### 3. Netlify

Solid third choice: GA adapter and docs, but a CLI gap on rollback and a recently-changed pricing model make it slightly less predictable than the top two for a two-week solo build.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. `tech-stack.md`'s `deployment_target: cloudflare-pages` hint predates Cloudflare's steer toward Workers for new SSR projects — anyone trusting that hint literally could target the wrong product. (Verified not actually a problem here: `wrangler.jsonc` already uses the Workers-native config shape.)
2. `astro:env` does not read Cloudflare bindings (KV/D1/R2/Hyperdrive/Durable Objects) — those require `context.locals.runtime.env` instead. Not triggered today (Supabase auth uses plain secret env vars), but a real trap the moment a binding is added.
3. Cloudflare's documented path for direct Postgres access (Hyperdrive) requires a raw `pg`/`postgres.js` driver with the *direct* connection string — not the `@supabase/ssr` client the project already uses for cookie-based auth. No single canonical guide reconciles both in one app.
4. Plain Workers are stateless; any future need for background/scheduled work requires Durable Objects or Queues — real added complexity versus a plain Node container platform.
5. Cloudflare's MCP/agent tooling is "actively evolving" without one uniform GA label across every server — the fastest-moving of the five evaluated surfaces.

### Pre-Mortem — How This Could Fail

The captain deployed Pairing Assistant to Cloudflare Workers under a tight two-week, after-hours budget. In week one, the existing CI pipeline — never actually wired to deploy per the current `ci.yml` (lint + build only) — got extended in a hurry without re-confirming Workers vs. the `tech-stack.md` hint's "cloudflare-pages" label, costing an evening of confused debugging over a non-problem. Later, chasing better Postgres latency, the team followed Cloudflare's official Hyperdrive guide, which requires the *direct* connection string bypassing the already-working `@supabase/ssr` auth client — an incompatible pairing nobody caught until sign-in silently broke in the Hyperdrive-routed path while working fine locally. Diagnosing the `astro:env` vs. `runtime.env` split ate real days that didn't exist in the budget. By the time it was fixed, the hard deadline had passed with live match-mode — the actual point of the app — still unshipped, undone by infrastructure plumbing nobody needed to touch for an MVP that never required Hyperdrive in the first place.

### Unknown Unknowns

- `astro:env` silently cannot read Cloudflare bindings — this surfaces only as a runtime `undefined`, not a build error, the first time a binding is touched.
- Cloudflare steers new full-stack projects toward Workers even though Pages is formally "not deprecated" — easy to ship on the wrong product if following older tutorials or the starter's own naming.
- The correct Supabase-on-Hyperdrive pattern needs a split-client architecture (raw driver for queries, `@supabase/ssr` for auth) that isn't documented as one coherent guide anywhere the research found — and isn't needed for this MVP's scale in the first place.
- Outgoing WebSocket connections *from* a Worker can't use the Hibernation API and pin a Durable Object in memory — irrelevant today (no persistent-connection requirement) but a trap if a future feature calls an external realtime API.
- The Free plan's 10ms CPU/invocation cap is generous for typical request handling but untested against the suggestion engine's matrix-optimization logic — worth a rough profile before assuming free tier holds under full domain logic, not just static/auth routes.

## Operational Story

- **Preview deploys**: Cloudflare Workers uses Versions & gradual deployments rather than Pages' automatic per-PR-branch URLs; for MVP scope, `wrangler versions upload` before promoting to production is the documented path. A full PR-preview-URL CI pipeline is out of scope for this research (see Out of Scope).
- **Secrets**: `SUPABASE_URL`/`SUPABASE_KEY` are set via `wrangler secret put <NAME>`, encrypted server-side, readable only by the Worker at runtime, and picked up through the existing `astro:env/server` schema — no `runtime.env` change needed since these are plain secrets, not bindings. Rotation: re-run `wrangler secret put` with the new value; per Cloudflare's documented model this takes effect without a full redeploy.
- **Rollback**: `wrangler rollback [<deployment-id>]` reverts to the prior deployment (or the immediately preceding one if no ID given) — fast, deterministic, no dashboard step required.
- **Approval**: routine `wrangler deploy` from CI can run unattended once a scoped API token exists (Workers-only, this project only, no billing/DNS access). Rotating `SUPABASE_KEY`, deleting the Worker, or any KV/D1/R2 resource stays a human, dashboard-driven action per the minimal-permissions / human-on-irreversibles posture already recorded in this project's `CLAUDE.md`.
- **Logs**: `npx wrangler tail --format json` for live runtime logs; deploy history and metrics via the Cloudflare dashboard.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `tech-stack.md` hint says "cloudflare-pages" while the ecosystem has steered to Workers | Devil's advocate | L | M | Already verified non-issue: `wrangler.jsonc` uses the Workers-native config shape. Update the `tech-stack.md` hint to `cloudflare-workers` for consistency. |
| `astro:env` cannot read Cloudflare bindings (KV/D1/R2/Hyperdrive/DO) | Unknown unknowns | M | M | Not triggered for MVP (Supabase auth uses plain secret env vars). If a binding is added later, read it via `context.locals.runtime.env`, not `astro:env`. |
| Hyperdrive's recommended direct-connection pattern conflicts with the existing `@supabase/ssr` client | Devil's advocate / Pre-mortem | M | H | Not needed for MVP — current `@supabase/ssr`-over-HTTPS setup works without Hyperdrive. Only revisit, with a deliberate split-client design, if direct Postgres access becomes necessary. |
| 10ms CPU/invocation free-tier cap may be tight for the suggestion engine's matrix computation | Unknown unknowns | L | M | Profile the suggestion algorithm's CPU time before assuming the free tier holds; the $5/mo paid tier (30M CPU-ms) is a cheap fallback. |
| Outgoing WebSocket from a Worker can't hibernate, pinning a Durable Object in memory | Unknown unknowns | L | L | Not relevant for MVP (no persistent-connection requirement, confirmed in interview). Revisit only if a future feature adds outbound realtime calls. |
| Cloudflare's MCP/agent tooling is actively evolving without one uniform GA label | Devil's advocate | L | L | Not a blocker for manual `wrangler` CLI deploys. Treat MCP tool output as best-effort; verify before trusting blindly. |

## Getting Started

1. Confirm no migration is needed: `wrangler.jsonc` already uses the Workers-native config (`main` + `assets` binding, `compatibility_flags: ["nodejs_compat"]`) — this is correct as-is, despite the `tech-stack.md` hint saying "cloudflare-pages".
2. Authenticate: `npx wrangler login`.
3. Set production secrets (matching the existing `astro:env` schema in `astro.config.mjs`): `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
4. Build and deploy: `npm run build && npx wrangler deploy`.
5. Verify: open the returned `*.workers.dev` URL, then tail runtime logs with `npx wrangler tail`.
6. When ready to automate, add a deploy step to `.github/workflows/ci.yml` (currently lint + build only) using a scoped Cloudflare API token (Workers-only, this project, no DNS/billing) stored as a GitHub Actions secret — matching `tech-stack.md`'s `ci_default_flow: auto-deploy-on-merge` hint, not yet wired up.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (the deploy step itself — see Getting Started step 6 for a pointer, not a full implementation)
- Production-scale architecture (multi-region, HA, DR)
- Hyperdrive / direct-Postgres setup (not needed at MVP scale; see Risk Register)
