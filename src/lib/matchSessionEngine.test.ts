import { describe, expect, it } from "vitest";
import {
  confirmOurAccept,
  confirmOurAttackerPair,
  confirmOurDefender,
  createSession,
  enterTheirAttackerPair,
  enterTheirDefender,
  enterTheirPick,
  isResumableSessionState,
  isSessionComplete,
  type MatchSessionState,
} from "@/lib/matchSessionEngine";
import type { MatchSuggestionProvider } from "@/lib/matchSuggestions";
import type { MatrixGridData } from "@/lib/matrix";

const emptyGrid: MatrixGridData = { ourArmies: [], theirArmies: [], estimates: {} };

// Deterministic fake: always picks the first (pair: first two) available
// army, so every transition in a test is exact and reproducible — the
// engine's phase/commit logic is under test here, not suggestion quality.
const firstAvailableProvider: MatchSuggestionProvider = {
  suggestDefender: (ourAvailable) => ourAvailable[0],
  suggestAttackerPair: (ourAvailable) => [ourAvailable[0], ourAvailable[1]],
  suggestAcceptedAttacker: (_ourDefender, theirOfferedPair) => theirOfferedPair[0],
};

const ourArmies = ["o1", "o2", "o3", "o4", "o5"];
const theirArmies = ["t1", "t2", "t3", "t4", "t5"];

function runSubRound(
  state: MatchSessionState,
  ourDefender: string,
  theirDefender: string,
  ourOfferedPair: [string, string],
  theirPick: string,
  theirOfferedPair: [string, string],
  ourAccepted: string,
): MatchSessionState {
  let next = confirmOurDefender(state, ourDefender);
  next = enterTheirDefender(next, theirDefender, firstAvailableProvider, emptyGrid);
  next = confirmOurAttackerPair(next, ourOfferedPair);
  next = enterTheirPick(next, theirPick);
  next = enterTheirAttackerPair(next, theirOfferedPair, firstAvailableProvider, emptyGrid);
  next = confirmOurAccept(next, ourAccepted, firstAvailableProvider, emptyGrid);
  return next;
}

describe("createSession — roster validation", () => {
  it("throws when rosters are unequal in size", () => {
    expect(() => createSession(["o1", "o2"], ["t1"], firstAvailableProvider, emptyGrid)).toThrow(
      /equal, non-empty rosters/,
    );
  });

  it("throws when a roster is empty", () => {
    expect(() => createSession([], [], firstAvailableProvider, emptyGrid)).toThrow(/equal, non-empty rosters/);
  });
});

describe("matchSessionEngine — full 5-vs-5 walkthrough", () => {
  it("runs two sub-rounds and auto-pairs the final refused attacker", () => {
    let state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    expect(state.phase).toBe("our-defender");
    expect(state.suggested).toBe("o1");

    state = runSubRound(state, "o1", "t1", ["o2", "o3"], "o2", ["t2", "t3"], "t2");
    expect(state.phase).toBe("our-defender");
    expect(state.subRound).toBe(2);
    expect(isSessionComplete(state)).toBe(false);

    state = runSubRound(state, "o3", "t3", ["o4", "o5"], "o4", ["t4", "t5"], "t4");

    expect(isSessionComplete(state)).toBe(true);
    expect(state.phase).toBe("complete");
    expect(state.history).toHaveLength(2);
    expect(state.refusedAttacker).toEqual({ ours: "o5", theirs: "t5" });

    // 2 committed per side per sub-round (defender + accepted attacker) x 2
    // sub-rounds + 1 refused-attacker pairing = all 5 armies per side.
    const committedOurs = new Set([
      ...state.history.map((r) => r.ourDefender),
      ...state.history.map((r) => r.theirPick),
      state.refusedAttacker?.ours,
    ]);
    const committedTheirs = new Set([
      ...state.history.map((r) => r.theirDefender),
      ...state.history.map((r) => r.ourAccepted),
      state.refusedAttacker?.theirs,
    ]);
    expect(committedOurs).toEqual(new Set(ourArmies));
    expect(committedTheirs).toEqual(new Set(theirArmies));
  });

  it("returns a not-picked offered attacker to its side's available pool", () => {
    let state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    state = confirmOurDefender(state, "o1");
    state = enterTheirDefender(state, "t1", firstAvailableProvider, emptyGrid);
    state = confirmOurAttackerPair(state, ["o2", "o3"]);
    // They pick o2; o3 was offered but not picked, so it must remain available.
    state = enterTheirPick(state, "o2");
    expect(state.ourAvailable).toContain("o3");
    expect(state.ourAvailable).not.toContain("o2");

    state = enterTheirAttackerPair(state, ["t2", "t3"], firstAvailableProvider, emptyGrid);
    // We accept t2; t3 was offered but not accepted, so it must remain available.
    state = confirmOurAccept(state, "t2", firstAvailableProvider, emptyGrid);
    expect(state.theirAvailable).toContain("t3");
    expect(state.theirAvailable).not.toContain("t2");
  });

  it("populates a suggestion only for phases that need one", () => {
    let state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    expect(state.suggested).not.toBeNull();

    state = confirmOurDefender(state, "o1");
    expect(state.phase).toBe("their-defender");
    expect(state.suggested).toBeNull();

    state = enterTheirDefender(state, "t1", firstAvailableProvider, emptyGrid);
    expect(state.phase).toBe("our-attacker-pair");
    expect(state.suggested).toEqual(["o2", "o3"]);

    state = confirmOurAttackerPair(state, ["o2", "o3"]);
    expect(state.suggested).toBeNull();

    state = enterTheirPick(state, "o2");
    expect(state.suggested).toBeNull();

    state = enterTheirAttackerPair(state, ["t2", "t3"], firstAvailableProvider, emptyGrid);
    expect(state.suggested).toBe("t2");
  });
});

describe("matchSessionEngine — committed-army exclusion guardrail", () => {
  it("rejects confirming a defender that is not currently available", () => {
    const state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    const committed = confirmOurDefender(state, "o1");
    expect(() => confirmOurDefender({ ...committed, phase: "our-defender" }, "o1")).toThrow();
  });

  it("rejects an attacker pair containing an already-committed army", () => {
    let state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    state = confirmOurDefender(state, "o1");
    state = enterTheirDefender(state, "t1", firstAvailableProvider, emptyGrid);
    expect(() => confirmOurAttackerPair(state, ["o1", "o2"])).toThrow();
  });

  it("rejects a duplicate id as an attacker pair", () => {
    let state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    state = confirmOurDefender(state, "o1");
    state = enterTheirDefender(state, "t1", firstAvailableProvider, emptyGrid);
    expect(() => confirmOurAttackerPair(state, ["o2", "o2"])).toThrow();
  });

  it("rejects a their-pick that was not part of the offered pair", () => {
    let state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    state = confirmOurDefender(state, "o1");
    state = enterTheirDefender(state, "t1", firstAvailableProvider, emptyGrid);
    state = confirmOurAttackerPair(state, ["o2", "o3"]);
    expect(() => enterTheirPick(state, "o4")).toThrow();
  });

  it("rejects an accepted attacker that was not part of their offered pair", () => {
    let state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    state = confirmOurDefender(state, "o1");
    state = enterTheirDefender(state, "t1", firstAvailableProvider, emptyGrid);
    state = confirmOurAttackerPair(state, ["o2", "o3"]);
    state = enterTheirPick(state, "o2");
    state = enterTheirAttackerPair(state, ["t2", "t3"], firstAvailableProvider, emptyGrid);
    expect(() => confirmOurAccept(state, "t4", firstAvailableProvider, emptyGrid)).toThrow();
  });

  it("rejects calling a transition out of phase order", () => {
    const state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    expect(() => enterTheirDefender(state, "t1", firstAvailableProvider, emptyGrid)).toThrow();
  });
});

describe("matchSessionEngine — ourAvailableBeforeOurDefender snapshot", () => {
  it("still includes our own committed defender — the pool as it stood before that commit", () => {
    let state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    state = confirmOurDefender(state, "o1");
    // The their-defender phase's blind pick must search over the FULL
    // pre-commit pool, including "o1" — the live state.ourAvailable at this
    // point has already excluded it, which is exactly the leak this
    // snapshot exists to avoid.
    expect(state.working.ourAvailableBeforeOurDefender).toEqual(["o1", "o2", "o3", "o4", "o5"]);
    expect(state.ourAvailable).not.toContain("o1");
  });

  it("is independent of which army was committed as our defender", () => {
    let stateA = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    stateA = confirmOurDefender(stateA, "o1");
    let stateB = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    stateB = confirmOurDefender(stateB, "o3");

    // Different committed defenders still snapshot to the same full pool —
    // this is the invariant the reported bug violated at the call-site level.
    expect(new Set(stateA.working.ourAvailableBeforeOurDefender)).toEqual(new Set(ourArmies));
    expect(new Set(stateB.working.ourAvailableBeforeOurDefender)).toEqual(new Set(ourArmies));
  });
});

describe("matchSessionEngine — ourAvailableAtDefenderReveal snapshot", () => {
  it("survives enterTheirPick's later, independent reduction of ourAvailable", () => {
    let state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    state = confirmOurDefender(state, "o1");
    state = enterTheirDefender(state, "t1", firstAvailableProvider, emptyGrid);
    // Snapshot taken here should contain every army still available right
    // after our own defender was committed (o1 removed, nothing else yet).
    expect(state.working.ourAvailableAtDefenderReveal).toEqual(["o2", "o3", "o4", "o5"]);

    state = confirmOurAttackerPair(state, ["o2", "o3"]);
    state = enterTheirPick(state, "o2");
    // enterTheirPick just removed "o2" from the live ourAvailable — the
    // snapshot must be unaffected by that later, independent mutation.
    expect(state.ourAvailable).not.toContain("o2");
    expect(state.working.ourAvailableAtDefenderReveal).toEqual(["o2", "o3", "o4", "o5"]);
  });
});

describe("isResumableSessionState", () => {
  it("is true for a freshly-created session", () => {
    const state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    expect(isResumableSessionState(state)).toBe(true);
  });

  it("is true for a real mid-flight session (both snapshots set alongside their committed step)", () => {
    let state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    state = confirmOurDefender(state, "o1");
    expect(isResumableSessionState(state)).toBe(true);
    state = enterTheirDefender(state, "t1", firstAvailableProvider, emptyGrid);
    expect(isResumableSessionState(state)).toBe(true);
  });

  it("is false when ourDefender is committed but ourAvailableBeforeOurDefender is missing (pre-fix shape)", () => {
    let state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    state = confirmOurDefender(state, "o1");
    const staleState: MatchSessionState = {
      ...state,
      working: { ...state.working, ourAvailableBeforeOurDefender: undefined },
    };
    expect(isResumableSessionState(staleState)).toBe(false);
  });

  it("is false when theirDefender is committed but ourAvailableAtDefenderReveal is missing (pre-fix shape)", () => {
    let state = createSession(ourArmies, theirArmies, firstAvailableProvider, emptyGrid);
    state = confirmOurDefender(state, "o1");
    state = enterTheirDefender(state, "t1", firstAvailableProvider, emptyGrid);
    const staleState: MatchSessionState = {
      ...state,
      working: { ...state.working, ourAvailableAtDefenderReveal: undefined },
    };
    expect(isResumableSessionState(staleState)).toBe(false);
  });
});
