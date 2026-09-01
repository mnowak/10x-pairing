---
bootstrapped_at: 2026-09-01T16:29:39Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: pairing-assistant
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
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
```

### Why this stack

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

## Pre-scaffold verification

| Signal      | Value                                                        | Severity | Notes                                                              |
| ----------- | ------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| npm package | not run                                                        | n/a      | `cmd_template` starts with `git clone`; no npm CLI package to check |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-08-22T21:44:30Z | fresh    | from card `docs_url`, via GitHub REST API (gh CLI unavailable, used curl fallback) |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20 top-level entries (`.env.example`, `.github`, `.gitignore`, `.husky`, `.nvmrc`, `.prettierrc.json`, `.vscode`, `astro.config.mjs`, `CLAUDE.md`, `components.json`, `eslint.config.js`, `node_modules`, `package-lock.json`, `package.json`, `public`, `README.md`, `src`, `supabase`, `tsconfig.json`, `wrangler.jsonc`)
**Conflicts (.scaffold siblings)**: CLAUDE.md → CLAUDE.md.scaffold (existing project CLAUDE.md preserved)
**.gitignore handling**: moved silently (cwd had no pre-existing `.gitignore`)
**.bootstrap-scaffold cleanup**: deleted (including the cloned `.git/`, removed before move-up per the git-clone strategy)

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 1 CRITICAL, 13 HIGH, 7 MODERATE, 3 LOW (24 total across 895 resolved dependencies: 449 prod, 316 dev, 131 optional)
**Direct vs transitive**: 0/1/2/0 direct of total 1/13/7/3 (CRITICAL/HIGH/MODERATE/LOW)

#### CRITICAL findings

- **tar** `<=7.5.20` (transitive) — fix available. Multiple advisories: PAX size override file-smuggling (GHSA-vmf3-w455-68vh), process crash via PAX numeric path type confusion (GHSA-w8wr-v893-vjvp), decompression/parse DoS via unlimited input (GHSA-23hp-3jrh-7fpw), negative tar entry size infinite loop (GHSA-8x88-c5mf-7j5w), uncaught exception DoS via NUL byte in PAX records (GHSA-gvwx-54wh-qm9j), uncontrolled recursion stack-overflow DoS (GHSA-r292-9mhp-454m).

#### HIGH findings

- **astro** `<=7.0.9` (**direct**) — fix available. XSS via unescaped spread attribute names (GHSA-jrpj-wcv7-9fh9, GHSA-f48w-9m4c-m7f5), XSS via unescaped `transition:*` directive values (GHSA-7pw4-f3q4-r2p2), reflected XSS via unescaped View Transition animation properties (GHSA-4g3v-8h47-v7g6), host header SSRF in prerendered error page fetch (GHSA-2pvr-wf23-7pc7), reflected XSS via unescaped slot name (GHSA-8hv8-536x-4wqp).
- **brace-expansion** `<=1.1.17 || 3.0.0-5.0.8` (transitive) — fix available. DoS via exponential-time expansion (GHSA-3jxr-9vmj-r5cp), DoS via unbounded expansion length (GHSA-mh99-v99m-4gvg), DoS via unbounded intermediate arrays (GHSA-rgw5-rvv9-x895).
- **devalue** `5.6.3-5.8.0` (transitive) — fix available. DoS via sparse array deserialization (GHSA-77vg-94rm-hx3p).
- **fast-uri** `3.0.0-3.1.4` (transitive) — fix available. Host confusion via backslash authority delimiter/introducer, failed IDN canonicalization (GHSA-v2hh-gcrm-f6hx, GHSA-7p8r-x3mc-p8w7, GHSA-4c8g-83qw-93j6).
- **js-yaml** `4.0.0-4.3.0` (transitive) — fix available. Quadratic-complexity DoS via merge-key handling and `!!omap` resolution (GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj).
- **miniflare** (transitive) — fix available. No advisory detail parsed from output.
- **nanoid** `<=3.3.17` (transitive) — fix available. Non-secure/custom generators loop indefinitely on negative or zero size (GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8).
- **postcss** `<=8.5.22` (transitive) — fix available. Path traversal / arbitrary `.map` file disclosure via `sourceMappingURL` (GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849).
- **sharp** `<0.35.0` (transitive) — fix available. Inherited libvips CVEs (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591) (GHSA-f88m-g3jw-g9cj).
- **svgo** `4.0.0-4.0.1` (transitive) — fix available. `removeScripts` plugin leaves some executable scripts intact (GHSA-2p49-hgcm-8545).
- **undici** `7.0.0-7.28.0` (transitive) — fix available. TLS cert validation bypass, HTTP header injection, WebSocket DoS, cross-origin/cross-user cache and cookie issues, response desync, CRLF injection (11 advisories; see raw JSON for full list, e.g. GHSA-vmh5-mc38-953g, GHSA-p88m-4jfj-68fv, GHSA-vxpw-j846-p89q).
- **vite** `7.0.0-7.3.3` (transitive) — fix available. NTLMv2 hash disclosure via UNC path handling on Windows (launch-editor), `server.fs.deny` bypass on Windows (GHSA-v6wh-96g9-6wx3, GHSA-fx2h-pf6j-xcff).
- **ws** `8.0.0-8.20.1` (transitive) — fix available. Uninitialized memory disclosure, memory exhaustion DoS from tiny fragments (GHSA-58qx-3vcg-4xpx, GHSA-96hv-2xvq-fx4p).

#### MODERATE findings

- **@astrojs/language-server** `2.14.0-2.16.10` (transitive) — fix available.
- **@cloudflare/vite-plugin** `<=0.0.0-fff677e35 || 0.0.7-1.41.0` (transitive) — fix available.
- **supabase** `1.1.6-2.98.2` (**direct**) — fix available.
- **volar-service-yaml** `<=0.0.70` (transitive) — fix available.
- **wrangler** `<=0.0.0-kickoff-demo || 3.108.0-4.101.0` (**direct**) — fix available.
- **yaml** `2.0.0-2.8.2` (transitive) — fix available. Stack overflow via deeply nested YAML collections (GHSA-48c2-rrv3-qjmp).
- **yaml-language-server** `1.11.1-08d5f7b.0-1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0-1.22.1-fc5f874.0` (transitive) — fix available.

#### LOW / INFO findings

- **@babel/core** `<=7.29.0` (transitive) — fix available. Arbitrary file read via `sourceMappingURL` comment (GHSA-4x5r-pxfx-6jf8).
- **esbuild** `0.27.3-0.28.0` (transitive) — fix available. Arbitrary file read via dev server on Windows (GHSA-g7r4-m6w7-qqqr).
- **postcss-selector-parser** `7.1.0-7.1.2` (transitive) — fix available. DoS via uncontrolled AST recursion (GHSA-w9m9-85wc-3x92).

Full raw `npm audit --json` output was captured during the run but is not persisted alongside this log; re-run `npm audit --json` from the project root to regenerate it.

## Hints recorded but not acted on

| Hint                     | Value              |
| ------------------------ | ------------------- |
| bootstrapper_confidence  | first-class          |
| quality_override         | false                |
| path_taken               | standard             |
| self_check_answers       | null                 |
| team_size                | solo                 |
| deployment_target        | cloudflare-pages     |
| ci_provider              | github-actions       |
| ci_default_flow          | auto-deploy-on-merge |
| has_auth                 | true                 |
| has_payments             | false                |
| has_realtime             | false                |
| has_ai                   | false                |
| has_background_jobs      | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep — currently just `CLAUDE.md.scaffold`.
- Address audit findings per your project's risk tolerance — the full breakdown is above. `npm audit fix` was NOT run automatically; the CRITICAL `tar` finding and the direct HIGH `astro` finding are the highest-value first targets.
