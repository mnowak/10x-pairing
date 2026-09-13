# Pairing Assistant

A live pairing tool for Warhammer 40k team-tournament captains — walks you through the defender/attacker reveal sequence against a pre-entered pairing-matrix, so you don't have to eyeball a multi-step optimization live at the table.

## What it does

At the start of each round in a team tournament, captains reveal armies in a secret, time-boxed negotiation: one side declares a defender, the other offers two attackers, the defender picks one to fight, and the leftover armies on each side are forced into a final pairing. Get it wrong and you can walk your defender into a bad matchup, or end up holding a weak army for that forced final pairing. Pairing Assistant tracks your pre-entered pairing-matrix estimates against a given opponent together with which armies are still available, and suggests the choice that protects your team's *total* score — not just the immediate matchup — at each decision point.

### The live reveal sequence

1. **Defender declared** — the app suggests your safest available defender; you enter whichever army the opponent reveals as theirs.
2. **Attackers offered** — when you're attacking, the app suggests your best pair of armies to send against their defender.
3. **Attacker accepted** — when you're defending, the app suggests which of the opponent's two offered attackers to accept, weighing not just that matchup but which of your armies gets left over for the final pairing.
4. **Sub-round 2** — roles reverse (defender ↔ attacker) and the cycle repeats with the now-smaller pool of remaining armies.
5. **Refused attacker auto-paired** — the one army left uncommitted on each side is automatically paired as the round's final matchup.

A **solo practice mode** runs the same flow against a simulated opponent (Random, Mirrored, or Similar behavior) so a captain can rehearse without a second person present.

## Project Status

Shipped: the full MVP — team/roster setup, opponent pairing-matrix preparation, live match-mode, and solo practice simulation against three opponent styles (milestones M-1 and M-2). In progress: a release-hardening pass — CI, security audit, error visibility, test coverage, and this README (milestone M-3). See [`context/foundation/roadmap.md`](context/foundation/roadmap.md) for the full milestone/slice breakdown.

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Local Development

Requires Node.js v22.14.0 (see `.nvmrc`) and, for local Supabase, [Docker](https://www.docker.com/) (~7 GB RAM).

```bash
git clone git@github.com:mnowak/10x-pairing.git
cd 10x-pairing
npm install
cp .env.example .env
cp .env.example .dev.vars
npx supabase init   # first time only, creates supabase/
npx supabase start  # prints local SUPABASE_URL / SUPABASE_KEY
npm run dev
```

Paste the `SUPABASE_URL` / `SUPABASE_KEY` the CLI prints into both `.env` and `.dev.vars` — they need to stay in sync or the dev server and `astro:env` will disagree on config. Local Supabase Studio is at `http://localhost:54323`; stop the stack with `npx supabase stop`.

To use a hosted Supabase project instead, put its URL/anon key (**Settings → API** in the Supabase dashboard) into the same two files.

Supabase requires email confirmation before sign-in by default — for local dev, turn it off under **Authentication → Email → Confirm email** in the Supabase dashboard so sign-up doesn't require clicking a confirmation link.

## Available Scripts

- `npm run dev` - Start development server (Cloudflare `workerd` runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` / `npm run lint:fix` - ESLint
- `npm run format` - Prettier (writes)
- `npm test` / `npm run test:watch` - Vitest unit/integration suite
- `npm run test:e2e` - Playwright end-to-end suite
- `npm run db:types` - Regenerate `src/db/database.types.ts` from the local Supabase schema

## Deployment

Deploys to [Cloudflare Workers](https://workers.cloudflare.com/):

```bash
npm run build
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as Cloudflare secrets (dashboard, or `npx wrangler secret put <name>`).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs 4 independent jobs on every push/PR to `main`: `lint`, `typecheck` (`astro check`), `build`, and `test` (spins up a local Supabase instance via the Supabase CLI, then runs the full suite). All 4 are required to merge.

## License

MIT
