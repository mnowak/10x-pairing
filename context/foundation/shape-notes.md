---
project: "Pairing Assistant"
context_type: greenfield
created: 2026-09-01
updated: 2026-09-01
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 2
  hard_deadline: 2026-09-13
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "decision paralysis under time pressure — reasoning correctly over the pairing matrix in a live, secret-reveal negotiation, not a data-entry/tracking problem"
    - topic: "core insight"
      decision: "combination of two: (1) the optimal pick at each step depends on remaining armies on both sides and the running team total, not just the immediate matchup — a multi-step optimization a captain can't reliably eyeball live; (2) existing tools are generic spreadsheets built for pre-tournament prep, not for walking the live reveal sequence with the matrix narrowing automatically"
    - topic: "primary persona scope"
      decision: "a team captain managing one team, who prepares pairing-matrix estimates against multiple possible opponent teams ahead of a tournament"
    - topic: "auth method"
      decision: "login (email/password or OAuth) — needed so a captain's teams/matrices persist across devices/sessions"
    - topic: "role model"
      decision: "flat, captain-only for MVP — every logged-in user has full control over the teams they own. Teammate/viewer role deferred to a future improvement, not MVP."
    - topic: "MVP flow scope"
      decision: "full flow accepted at 3-week budget: team setup, opponent matrix prep, and live match-mode with suggestions at all 3 decision points across 2 sub-rounds plus auto-paired refused attacker. No scope-down needed."
    - topic: "secondary success criterion"
      decision: "support for team rosters larger than 5 players, without a rebuild of core matching/matrix logic"
    - topic: "guardrails"
      decision: "(1) suggestion engine never recommends an already-used army; (2) no loss of previously entered pairing-matrix estimates, including mid-tournament"
    - topic: "timeline budget revision"
      decision: "actual budget is 2 weeks (revised down from initial 3-week estimate). FR-002 (managing multiple teams under one account) demoted from must-have to nice-have to fit — MVP scope is one team per captain."
    - topic: "matrix input shape"
      decision: "pairing-matrix cells use color bands (red/orange/yellow/green/blue, plus purple for unpredictable), not raw numeric estimates — matches how captains actually prepare (FR-004 revised)"
    - topic: "defender suggestion scope"
      decision: "safest-defender suggestion (FR-008) must use the currently remaining matrix (armies not yet committed on either side), not the original full matrix — matters starting sub-round 2"
    - topic: "attacker-acceptance suggestion logic"
      decision: "FR-013's suggestion must weigh both the immediate matchup estimate AND which army it leaves behind for the forced final refused-attacker pairing, to avoid leaving a red/bad refused-attacker matchup — this is a real domain rule, carried into Business Logic (Phase 5)"
    - topic: "product type / scale / timing"
      decision: "web app (mobile-usable); scale is just the user themself or a handful of captains, confirmed not to affect the domain rule at 100x scale; hard deadline 2026-09-13, after-hours only"
  frs_drafted: 16
  quality_check_status: accepted
---

# Shape Notes

## Seed idea (verbatim)

> Chce stworzyc aplikacje ktora wspomaga kapitana druzyny podczas procesu parowania na poczatku rundy turnieju druzynowego w grze Warhammer40k. Zasady procesu parowania mozna znalezc w dokumencie https://assets.warhammer-community.com/eng_22-07_warhammer_40,000_teams_event_companion-7ow8c92xdm-dyf3i4qpst.pdf

Supplementary discovery input: `pairing-process-worksheet.md` (user-authored, in Polish), covering tournament context, the pairing process step-by-step, pairing-matrix mechanics, captain's decisions, current pain points, and desired app capabilities. Used as the primary source for Phases 1–8 below in place of re-asking already-answered questions.

## Vision & Problem Statement

During the live pairing process at the start of each round in a Warhammer 40k team tournament, a team captain must decide — under a secret-reveal, time-boxed negotiation with the opposing captain — which armies to commit as defender and attacker, aiming to maximize the team's summed 20:0 score across all games. Today this is done with paper pairing-matrices and physical cards representing each army; a captain who eyeballs a single matchup easily walks into a trap where their exposed defender faces two attackers they estimate poorly against, or ends a sub-round holding a "bad" remaining matrix for what's left to pair.

At each step of the sequence, the best pick depends on which armies remain available on both sides and the running team total — not just the score of the immediate matchup — a multi-step optimization a captain cannot reliably eyeball live. Existing tools in this scene are generic spreadsheets built for pre-tournament matrix prep, not for walking through the actual live reveal sequence (defender → attackers → pick → repeat) with the matrix narrowing automatically as armies are consumed.

## User & Persona

Primary persona: a team captain of a 5-player Warhammer 40k tournament team (extensible to larger rosters later), who prepares pairing-matrix estimates against multiple possible opponent teams ahead of a tournament, and uses those matrices live during each round's pairing sequence to decide who to put forward as defender/attacker and which attacker to accept.

## Access Control

Login required (email/password or OAuth). Every logged-in user acts as a captain and has full control over the teams they own — create teams, edit pairing matrices, run live pairing sessions. Flat model: no role separation for MVP.

*Future consideration (not MVP):* a teammate/viewer role that would let other team members view matrices and pairing results without edit or live-pairing control.

## Success Criteria

### Primary
- A captain can complete the full live match-mode flow for one round — defender suggestion → enter opponent's defender → attacker-pair suggestion → enter opponent's pick → defender's-attacker-choice suggestion → repeat for sub-round 2 → auto-paired refused attacker — end-to-end, using a matrix prepared ahead of time, without leaving the app.

### Secondary
- The app supports team rosters larger than 5 players, without requiring a rebuild of the core matching/matrix logic.

### Guardrails
- The suggestion engine never recommends an army that has already been committed (used) in the current match.
- No loss of previously entered pairing-matrix estimates once saved, including mid-tournament.

## Functional Requirements

### Team & Roster Management
- FR-001: Captain can create a team with a name and roster of armies (default 5, extensible). Priority: must-have
  > Socratic: Counter-argument considered: naming armies upfront could be friction before any value; team could be an implicit label instead. Resolution: kept; no counter-argument stands as written.
- FR-002: Captain can manage multiple teams under their account. Priority: nice-to-have
  > Socratic: Counter-argument considered: even flagged nice-to-have, this is attractive scope creep that threatens the 2-week budget — captains will want it the moment one team works. Resolution: kept as an explicit boundary marker (not built opportunistically); will be mirrored into Non-Goals so it's clearly out of MVP scope, not quietly deferred.

### Opponent & Matrix Preparation
- FR-003: Captain can add an opponent team entry with its own roster of armies. Priority: must-have
  > Socratic: Counter-argument considered: opponent armies might not need names, just anonymous slots. Resolution: kept; no counter-argument stands as written.
- FR-004: Captain can enter a pairing-matrix color-band estimate (red/orange/yellow/green/blue, plus purple for "unpredictable") for every one of our armies vs. every one of the opponent's armies. Priority: must-have
  > Socratic: Counter-argument considered: raw numeric estimates may be the wrong input shape — captains actually think and prepare in color bands (per worksheet), not exact 0–20 scores. Resolution: FR revised — input shape is color bands, not numeric scores.
- FR-005: Captain can prepare matrices for multiple different opponent teams ahead of a tournament. Priority: must-have
  > Socratic: Counter-argument considered: also scope creep like FR-002 — MVP could support just one active opponent-matrix at a time. Resolution: kept; pre-tournament prep against multiple possible opponents is core to how captains actually operate (worksheet §8), unlike FR-002 which is about managing multiple of *our own* teams.
- FR-006: Captain can edit/update previously entered matrix estimates. Priority: must-have
  > Socratic: Counter-argument considered: could require delete-and-recreate the opponent entry instead of cell-level editing. Resolution: kept; cell-level editing is basic usability, not scope creep.

### Live Match Mode
- FR-007: Captain can start a live match-mode session against a specific prepared opponent matrix. Priority: must-have
  > Socratic: Counter-argument considered: requiring a fully-prepared matrix before match-mode may be too rigid if a captain hasn't prepped in advance. Resolution: kept; matches the real workflow described in the worksheet.
- FR-008: App suggests our safest defender pick based on the currently remaining matrix (armies not yet committed on either side), not the original full matrix. Priority: must-have
  > Socratic: Counter-argument considered: by sub-round 2, some opponent armies are already used/gone — suggesting against the full original matrix instead of only currently-available armies could recommend a defender that's no longer actually safest. Resolution: FR revised to explicitly scope the suggestion to the remaining matrix at each sub-round.
- FR-009: Captain can enter the opponent's revealed defender. Priority: must-have
  > Socratic: Counter-argument considered: manual entry during a live, timed negotiation adds friction to the exact pain point the app is meant to relieve. Resolution: kept; unavoidable since the app cannot know the opponent's choice automatically.
- FR-010: App suggests our 2 best attacker armies to send against the opponent's revealed defender. Priority: must-have
  > Socratic: Counter-argument considered: the suggestion assumes the opponent always picks optimally for themselves — a black-box single recommendation may hide the tradeoff. Resolution: kept as written for MVP; showing both possible outcomes explicitly is a reasonable future UX refinement, not required to prove the flow.
- FR-011: Captain can enter which of our attackers the opponent's defender selected. Priority: must-have
  > Socratic: Counter-argument considered: could this be inferred instead of manually entered? Resolution: confirmed it cannot be inferred — the opponent's choice is external to the app. Kept as manual entry, as written.
- FR-012: Captain can enter the opponent's 2 revealed attackers against our defender. Priority: must-have
- FR-013: App suggests which of the opponent's 2 attackers our defender should accept, weighing both the immediate matchup estimate AND the quality of the army each choice would leave behind for our forced refused-attacker pairing (avoiding leaving a red/bad refused-attacker matchup). Priority: must-have
  > Socratic: Counter-argument considered: this isn't a trivial "pick the higher estimate" lookup — the choice also determines which of our armies is left over for the forced final refused-attacker pairing, so a purely local optimization could leave a bad final matchup. Resolution: FR revised to require weighing both the immediate matchup and the downstream refused-attacker impact. Carried into Business Logic (Phase 5) as a real domain rule.
- FR-014: App tracks committed/used armies (ours and opponent's) and excludes them from further suggestions. Priority: must-have
  > Socratic: Counter-argument considered: none — this implements the core guardrail (never suggest an already-used army) and is foundational.
- FR-015: App automatically pairs the last remaining army on each side as the "refused attacker" matchup. Priority: must-have
  > Socratic: Counter-argument considered: should this require captain confirmation instead of silent automation? Resolution: kept as written; the pairing is forced by the rules with no decision to make.

### Roster Flexibility
- FR-016: Team roster size is configurable beyond 5 players, without requiring separate matrix/matching logic per size. Priority: nice-to-have
  > Socratic: Counter-argument considered: given the tighter 2-week budget, should this be demoted/dropped like FR-002? Resolution: kept as nice-to-have; not hard-coding to 5 costs little now and avoids a costly rewrite later.

## User Stories

### US-01: Captain runs live match-mode against a prepared opponent

- **Given** a captain with a team and a prepared pairing matrix for today's opponent
- **When** they start match-mode and work through the defender/attacker reveal sequence for both sub-rounds
- **Then** the app suggests each of their 3 decision points (defender, attacker pair, attacker acceptance) using only currently-available armies, and auto-pairs the final refused-attacker matchup

#### Acceptance Criteria
- No suggestion ever names an army already committed/used in the current match (mirrors guardrail).
- All 3 suggestion types (defender, attacker pair, attacker acceptance) are available at their respective steps.
- The final remaining army on each side is auto-paired as the refused-attacker matchup without requiring a manual decision.

## Business Logic

The app recommends, at each defender/attacker decision point, the choice that protects the team's total score — weighing both the immediate matchup and the quality of the pairing it leaves behind for later, including the forced final refused-attacker matchup.

The rule consumes the captain's pre-entered pairing-matrix estimates (color-banded, per our-army-vs-opponent-army pair) together with the live state of which armies remain uncommitted on both sides at the current step of the reveal sequence.

Its output is a single recommended choice at each of the three decision types — which army to put forward as defender, which pair of armies to send as attackers, and which of two offered attackers to accept — always drawn only from currently-available armies.

The captain encounters this rule live, mid-match, at each reveal step: after entering what the opponent has just revealed, the app immediately surfaces its recommendation, which the captain can accept or override before locking in their own reveal.

## Non-Functional Requirements

- A captain sees each recommendation with no perceptible delay after entering the opponent's reveal, during the live, timed negotiation.
- Match-mode remains usable without a reliable network connection — a captain does not lose access to their prepared matrix or suggestions due to venue connectivity issues.
- The app is comfortably usable one-handed on a phone screen, standing at a physical table.
- A captain's pairing-matrix estimates are never visible to anyone outside their own account, including the opposing captain.

## Non-Goals

- **Managing multiple of our own teams** — FR-002 demoted to nice-to-have to protect the 2-week budget; MVP is scoped to one team per captain.
- **Team-vs-team round pairing (Swiss system between teams)** — the organizer's job, determined externally; the app only helps pair players within a match already assigned.
- **Post-match score tracking / historical stats** — the app supports live pairing decisions, not recording actual game results or building a season/tournament history.
- **A teammate/viewer role for non-captain team members** — deferred per Access Control (Phase 2); MVP is captain-only access.

## Quality cross-check

All elements present: Access Control, Business Logic (one-sentence rule), Project artifacts, Timeline-cost acknowledgment (2-week budget, under the 3-week soft threshold), Non-Goals. No gaps. Status: accepted.

## Forward: source material

- Official rules reference for the pairing process: https://assets.warhammer-community.com/eng_22-07_warhammer_40,000_teams_event_companion-7ow8c92xdm-dyf3i4qpst.pdf
