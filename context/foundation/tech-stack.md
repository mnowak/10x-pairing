---
starter_id: 10x-astro-starter
package_manager: npm
project_name: pairing-assistant
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

A solo captain building a 2-week, after-hours web MVP with required login (email/password
or OAuth) and a client-heavy, low-network-dependency live match-mode needs a battle-tested,
agent-friendly starter that ships auth and a database out of the box. 10x Astro Starter is
the recommended default for `(web-app, js)`: Astro + React islands + TypeScript + Supabase
(Postgres + auth) + Cloudflare Pages/Workers clears all four agent-friendly gates and keeps
the whole stack on a single pinned, well-documented toolchain — a good match for a tight
timeline with no team to split concerns across. Payments, realtime multiplayer sync, AI, and
background jobs are all out of scope per the PRD, so no feature-forcing gaps apply. CI runs
on GitHub Actions with auto-deploy-on-merge to Cloudflare Pages, matching the starter's
default deployment path.
