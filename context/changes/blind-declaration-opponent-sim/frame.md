# Frame Brief: Simultaneous-declaration leaks in practice-mode opponent simulation

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

In Mirrored (and Similar) practice mode, the simulated opponent's first-defender
choice changes depending on which army the captain reveals as *their own*
defender first. Verified live against real matrix data for team "Expedition 2137"
vs. opponent "Wujasy": picking CK or Tau as our defender → opponent picks "WE";
picking BA, Custo, or Demony → opponent picks "CSM" (traced via the actual
`bestTheirDefender`/`mirroredOpponentProvider.pickDefender` functions).

## Initial Framing (preserved)

- **User's stated cause or approach**: Both captains pick their defenders
  independently in reality — the captain's choice shouldn't be able to
  influence the opponent's choice. Confirmed (very confident) that real-world
  team-tournament declarations are blind/simultaneous.
- **User's proposed direction**: None from the user directly — routed to
  `/10x-frame` rather than proposing a fix. The only concrete idea on the
  table prior to framing was the reviewer's own tentative one (evaluate
  candidates without conditioning on the specific `ourDefender` identity),
  explicitly flagged low-confidence with no validated design.
- **Pre-dispatch narrowing**: User clarified the scope is much broader than
  the defender step alone — "all decisions made by the captains are made in
  parallel: picking defenders, picking two attackers, choosing and refusing
  attackers." Also clarified this concern applies only to the *simulated
  practice opponent* (Mirrored/Similar) — live mode's own suggestion engine
  intentionally uses worst-case/adversarial reasoning as a defensive safety
  margin for the captain's own suggestions, which is a different, legitimate
  design choice and out of scope here.

## Dimension Map

The observation could originate at any of these stages of a sub-round
(`src/lib/matchSessionEngine.ts`'s 6-phase state machine: our-defender →
their-defender → our-attacker-pair → their-pick → their-attacker-pair →
our-accept):

1. **Defender declaration** (`bestTheirDefender`, `their-defender` phase) —
   does the opponent's defender pick use the captain's already-committed
   `ourDefender` identity at a stage that should be blind? ← initial framing
2. **Attacker-pair offer** (`bestTheirAttackerPair`, `their-attacker-pair`
   phase) — does the opponent's own 2-attacker offer against our defender
   depend on anything from our simultaneous, parallel offer against theirs?
3. **Accept/refuse decision** (`bestTheirPick`, `their-pick` phase) — does
   the opponent's defender's choice among our offered pair use anything it
   shouldn't? (Structurally different: an offer is inherently directed at,
   and visible to, its target once made — not obviously the same bug class.)
4. **Engine-level sequencing** (`matchSessionEngine.ts` phase order) — does
   the state machine's strict alternation itself leak information across
   what should be independent parallel "exchanges," regardless of what
   parameters any individual scoring function declares?

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Defender declaration leaks `ourDefender` | Live-traced against real matrix data (WE vs. CSM picks flip with our defender choice); confirmed via direct code read of `bestTheirDefender` (`matchSuggestions.ts:204-220`) and its call site (`MatchSession.tsx:404`, passes `state.working.ourDefender` directly); confirmed by independent engine-sweep sub-agent | **STRONG** |
| 2. Attacker-pair offer leaks via reduced `ourAvailable` pool | No explicit `ourOfferedPair`/`theirPick` parameter in `bestTheirAttackerPair`'s signature (confirmed by grep, zero hits) — but its `ourAvailable` argument, as actually passed at the `their-attacker-pair` call site (`MatchSession.tsx:471-478`), has *already been reduced* by `enterTheirPick` (`matchSessionEngine.ts:169`, `ourAvailable: withoutArmy(state.ourAvailable, picked)`) — a decision that, under the confirmed parallel model, is a later/independent stage's outcome, not yet decided when the opponent's own offer should be computed. Confirmed via direct trace (independent sub-agent + own re-verification of `matchSessionEngine.ts`). | **STRONG** |
| 3. Accept/refuse decision (`bestTheirPick`) leaks | Uses `offeredPair` (legitimate — an offer must be visible to be accepted from) and prior-stage-public `ourDefender`/`theirDefender`; internal lookahead (`searchTheirAttackerPair`) only self-anticipates the opponent's *own* future optimal play, never reads a captain-side fact that isn't already legitimately public. No reference to `state.working.*` found in this path. | **NONE** |
| 4. Engine-level sequencing is the root cause | `context/archive/2026-09-11-live-match-mode-session/plan.md:45` (the original session-mechanics design, "confirmed, not otherwise derivable from any file"): *"each sub-round runs two parallel defend/attack exchanges simultaneously... We offer 2 attackers against their defender and they pick one; symmetrically, they offer 2 attackers against our defender and we pick one."* The engine as built serializes these two intended-parallel exchanges into one alternating chain (our-offer → their-pick(accept) → their-offer → our-accept) instead of resolving both offers before either accept. Harmless for live mode (a human just needs some order to type in what already happened at the table); becomes a real bug once an algorithm computes decisions from the same serialized, mutated state. | **STRONG** |

## Narrowing Signals

- User: "all decisions made by the captains are made in parallel — picking
  defenders, picking two attackers, choosing and refusing attackers" — this
  single clarification is what expanded the investigation from 1 hypothesis
  to 4, and is what led directly to finding #2 (which a narrower framing
  would have missed entirely).
- User: concern is practice-opponent-only, not live mode's own suggestion
  engine — this kept the fix scope from ballooning into `minimaxSuggestionProvider`
  and `match.astro`, which are explicitly out of scope.
- The original `2026-09-11-live-match-mode-session` plan-brief already
  states the intended design was two parallel simultaneous exchanges — the
  current engine is a departure from its own originally-confirmed design,
  not just from a newly-stated rule. This raises confidence substantially:
  the reframe isn't inventing a new requirement, it's restoring one that was
  already decided and then not fully carried through the implementation.

## Cross-System Convention

Live match-mode (`match.astro` → `MatchSession.tsx` with `mode: "live"`)
never actually computes the opponent's decisions — a human captain enters
what already happened at the table, so the engine's serialized phase order
never mattered for correctness there; it's a data-entry convenience, not a
timing claim. The leaks only manifest once an algorithm (practice mode)
starts *computing* decisions from the same shared, sequentially-mutated
state that live mode only ever *records*.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: the practice-mode opponent
> simulation computes 2 of its 3 decision points (their-defender,
> their-attacker-pair) from game state that has already been mutated by a
> decision which, under the confirmed real-world parallel/blind declaration
> model, hasn't logically happened yet — not a single value-function bug in
> `bestTheirDefender`, but a class of timing leak rooted in the engine
> serializing what its own original design called "two parallel exchanges
> simultaneously" into one alternating chain.

This is broader than the original F1 finding (which only caught the
defender-declaration instance). The fix needs to ensure each of the
opponent's 2 affected decisions is computed from the game-state snapshot
that would genuinely be available at that logical stage under the parallel
model — not simply patch `bestTheirDefender`'s value function in isolation
and declare the class of bug closed.

## Confidence

**HIGH** — evidence triangulated from: a live trace against real matrix
data (hypothesis 1), two independently-run sub-agents converging on the
same two leak points via different investigation angles (parameter-level
and deep state-flow tracing), a direct reading of `matchSessionEngine.ts`
confirming the exact state mutation, and a prior archived design document
that had already specified "two parallel exchanges simultaneously" as the
intended mechanic — meaning this reframe restores an already-decided design
intent rather than introducing a new one.

## What Changes for /10x-plan

The plan should scope a fix for **both** confirmed leak points (their-defender,
their-attacker-pair), not just the defender step — likely by computing each
affected decision from a snapshot of the pools as they stood at the start of
the correct logical stage (post-both-defenders for the attacker-pair offer;
pre-any-offer for the defender pick), rather than reading live, further-mutated
`state.ourAvailable`/`state.working.*` at the point the UI currently reveals
each decision. `bestTheirPick`, all of live mode (`match.astro`,
`minimaxSuggestionProvider`), and the engine's phase machine's *external*
behavior/UI sequence should remain untouched — only *which state snapshot*
feeds the two affected opponent-side computations needs to change.

## References

- Source files: `src/lib/matchSuggestions.ts:204-220` (`bestTheirDefender`),
  `src/lib/matchSuggestions.ts:291-307` (`bestTheirAttackerPair`),
  `src/lib/matchSessionEngine.ts:102-115` (`confirmOurDefender`),
  `src/lib/matchSessionEngine.ts:158-174` (`enterTheirPick`),
  `src/components/match/MatchSession.tsx:404-410,471-478`
- Related research: `context/changes/pairing-simulation-recommender/reviews/impl-review.md`
  (F1), `context/archive/2026-09-11-live-match-mode-session/plan.md:45`
- Investigation: 2 parallel sub-agent hypothesis sweeps (attacker-pair/accept
  function-level trace; engine/wiring-level sweep), 1 archived-plan search
