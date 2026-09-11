import type { MatrixGridData } from "@/lib/matrix";
import type { ArmyId, MatchSuggestionProvider } from "@/lib/matchSuggestions";

export type MatchSessionPhase =
  | "our-defender"
  | "their-defender"
  | "our-attacker-pair"
  | "their-pick"
  | "their-attacker-pair"
  | "our-accept"
  | "complete";

export interface SubRoundResult {
  subRound: number;
  ourDefender: ArmyId;
  theirDefender: ArmyId;
  ourOfferedPair: [ArmyId, ArmyId];
  theirPick: ArmyId;
  theirOfferedPair: [ArmyId, ArmyId];
  ourAccepted: ArmyId;
}

export interface RefusedAttackerPairing {
  ours: ArmyId;
  theirs: ArmyId;
}

interface WorkingSubRound {
  ourDefender?: ArmyId;
  theirDefender?: ArmyId;
  ourOfferedPair?: [ArmyId, ArmyId];
  theirPick?: ArmyId;
  theirOfferedPair?: [ArmyId, ArmyId];
}

export interface MatchSessionState {
  ourAvailable: ArmyId[];
  theirAvailable: ArmyId[];
  subRound: number;
  phase: MatchSessionPhase;
  // The engine-suggested pick for the phase just entered, or null when the
  // phase is pure data entry (no suggestion applies). Persisted on state
  // (not recomputed per render) so a random suggestion stays stable across
  // re-renders and a page refresh, only changing when the phase advances.
  suggested: ArmyId | [ArmyId, ArmyId] | null;
  working: WorkingSubRound;
  history: SubRoundResult[];
  refusedAttacker: RefusedAttackerPairing | null;
}

function withoutArmy(list: ArmyId[], id: ArmyId): ArmyId[] {
  return list.filter((armyId) => armyId !== id);
}

function assertAvailable(list: ArmyId[], id: ArmyId, label: string): void {
  if (!list.includes(id)) {
    throw new Error(`${label} "${id}" is not currently available — it may already be committed`);
  }
}

function assertDistinctAvailablePair(pair: [ArmyId, ArmyId], list: ArmyId[], label: string): void {
  const [a, b] = pair;
  if (a === b) {
    throw new Error(`${label} must be 2 distinct armies`);
  }
  assertAvailable(list, a, label);
  assertAvailable(list, b, label);
}

// The minimax search in matchSuggestions.ts assumes equal, non-empty rosters
// that shrink in lockstep — an invariant this engine must guarantee, since the
// search itself has no way to detect a violation (Math.max/min over an empty
// candidate set silently returns -Infinity/Infinity instead of throwing).
function assertValidRosters(ourArmies: ArmyId[], theirArmies: ArmyId[]): void {
  if (ourArmies.length === 0 || ourArmies.length !== theirArmies.length) {
    throw new Error(
      `Match session requires equal, non-empty rosters on both sides (got ${ourArmies.length} of ours vs ${theirArmies.length} of theirs)`,
    );
  }
}

export function createSession(
  ourArmies: ArmyId[],
  theirArmies: ArmyId[],
  provider: MatchSuggestionProvider,
  matrixGrid: MatrixGridData,
): MatchSessionState {
  assertValidRosters(ourArmies, theirArmies);

  return {
    ourAvailable: [...ourArmies],
    theirAvailable: [...theirArmies],
    subRound: 1,
    phase: "our-defender",
    suggested: provider.suggestDefender(ourArmies, theirArmies, matrixGrid),
    working: {},
    history: [],
    refusedAttacker: null,
  };
}

export function confirmOurDefender(state: MatchSessionState, chosen: ArmyId): MatchSessionState {
  if (state.phase !== "our-defender") {
    throw new Error(`confirmOurDefender called outside the our-defender phase (current: ${state.phase})`);
  }
  assertAvailable(state.ourAvailable, chosen, "Our defender");

  return {
    ...state,
    ourAvailable: withoutArmy(state.ourAvailable, chosen),
    phase: "their-defender",
    suggested: null,
    working: { ...state.working, ourDefender: chosen },
  };
}

export function enterTheirDefender(
  state: MatchSessionState,
  revealed: ArmyId,
  provider: MatchSuggestionProvider,
  matrixGrid: MatrixGridData,
): MatchSessionState {
  if (state.phase !== "their-defender") {
    throw new Error(`enterTheirDefender called outside the their-defender phase (current: ${state.phase})`);
  }
  assertAvailable(state.theirAvailable, revealed, "Their defender");

  const theirAvailable = withoutArmy(state.theirAvailable, revealed);

  const ourDefender = state.working.ourDefender;
  if (!ourDefender) {
    throw new Error("Our defender must be set before entering their defender");
  }

  return {
    ...state,
    theirAvailable,
    phase: "our-attacker-pair",
    suggested: provider.suggestAttackerPair(state.ourAvailable, revealed, theirAvailable, ourDefender, matrixGrid),
    working: { ...state.working, theirDefender: revealed },
  };
}

export function confirmOurAttackerPair(state: MatchSessionState, chosenPair: [ArmyId, ArmyId]): MatchSessionState {
  if (state.phase !== "our-attacker-pair") {
    throw new Error(`confirmOurAttackerPair called outside the our-attacker-pair phase (current: ${state.phase})`);
  }
  assertDistinctAvailablePair(chosenPair, state.ourAvailable, "Our attacker pair");

  return {
    ...state,
    phase: "their-pick",
    suggested: null,
    working: { ...state.working, ourOfferedPair: chosenPair },
  };
}

export function enterTheirPick(state: MatchSessionState, picked: ArmyId): MatchSessionState {
  if (state.phase !== "their-pick") {
    throw new Error(`enterTheirPick called outside the their-pick phase (current: ${state.phase})`);
  }
  const offeredPair = state.working.ourOfferedPair;
  if (!offeredPair?.includes(picked)) {
    throw new Error(`Their pick "${picked}" was not one of our offered attackers`);
  }

  return {
    ...state,
    ourAvailable: withoutArmy(state.ourAvailable, picked),
    phase: "their-attacker-pair",
    suggested: null,
    working: { ...state.working, theirPick: picked },
  };
}

export function enterTheirAttackerPair(
  state: MatchSessionState,
  offeredPair: [ArmyId, ArmyId],
  provider: MatchSuggestionProvider,
  matrixGrid: MatrixGridData,
): MatchSessionState {
  if (state.phase !== "their-attacker-pair") {
    throw new Error(`enterTheirAttackerPair called outside the their-attacker-pair phase (current: ${state.phase})`);
  }
  assertDistinctAvailablePair(offeredPair, state.theirAvailable, "Their attacker pair");

  const ourDefender = state.working.ourDefender;
  if (!ourDefender) {
    throw new Error("Our defender must be set before entering their attacker pair");
  }

  return {
    ...state,
    phase: "our-accept",
    suggested: provider.suggestAcceptedAttacker(
      ourDefender,
      offeredPair,
      state.ourAvailable,
      state.theirAvailable,
      matrixGrid,
    ),
    working: { ...state.working, theirOfferedPair: offeredPair },
  };
}

export function confirmOurAccept(
  state: MatchSessionState,
  accepted: ArmyId,
  provider: MatchSuggestionProvider,
  matrixGrid: MatrixGridData,
): MatchSessionState {
  if (state.phase !== "our-accept") {
    throw new Error(`confirmOurAccept called outside the our-accept phase (current: ${state.phase})`);
  }
  const { ourDefender, theirDefender, ourOfferedPair, theirPick, theirOfferedPair } = state.working;
  if (!ourDefender || !theirDefender || !ourOfferedPair || !theirPick || !theirOfferedPair) {
    throw new Error("Sub-round is missing prior steps — cannot confirm acceptance");
  }
  if (!theirOfferedPair.includes(accepted)) {
    throw new Error(`Accepted attacker "${accepted}" was not one of their offered attackers`);
  }

  const theirAvailable = withoutArmy(state.theirAvailable, accepted);
  const history: SubRoundResult[] = [
    ...state.history,
    {
      subRound: state.subRound,
      ourDefender,
      theirDefender,
      ourOfferedPair,
      theirPick,
      theirOfferedPair,
      ourAccepted: accepted,
    },
  ];

  const canContinue = state.ourAvailable.length > 1 && theirAvailable.length > 1;

  if (canContinue) {
    return {
      ...state,
      theirAvailable,
      subRound: state.subRound + 1,
      phase: "our-defender",
      suggested: provider.suggestDefender(state.ourAvailable, theirAvailable, matrixGrid),
      working: {},
      history,
    };
  }

  if (state.ourAvailable.length !== 1 || theirAvailable.length !== 1) {
    throw new Error(
      `Unexpected roster imbalance at session end: ${state.ourAvailable.length} of ours vs ${theirAvailable.length} of theirs remain`,
    );
  }

  return {
    ...state,
    theirAvailable,
    phase: "complete",
    suggested: null,
    working: {},
    history,
    refusedAttacker: { ours: state.ourAvailable[0], theirs: theirAvailable[0] },
  };
}

export function isSessionComplete(state: MatchSessionState): boolean {
  return state.phase === "complete";
}
