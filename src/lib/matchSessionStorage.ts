import type { MatchSessionState } from "@/lib/matchSessionEngine";

export type SessionMode = "live" | "simulation";

// Only meaningful for mode: "simulation" — "live" sessions never carry
// either field. Distinct from SessionMode above to avoid confusing the
// two: SessionMode is live-vs-practice; OpponentBehavior is which
// algorithm plays the opponent's side within a practice session.
export type OpponentBehavior = "random" | "mirrored" | "similar";

// One app-wide slot per mode — only one match-mode session and one
// simulation session are ever active at a time (starting a session for a
// different opponent in the same mode silently replaces whatever was here
// before). Separate keys per mode let a live session and a practice
// session for the same opponent coexist without clobbering each other.
// The "live" key is unchanged from before mode separation existed, so a
// captain's in-progress live session isn't silently dropped by this
// change. Accessed via globalThis rather than window so this module stays
// trivially testable under a runtime with no DOM.
const STORAGE_KEYS: Record<SessionMode, string> = {
  live: "pairing-assistant:match-session",
  simulation: "pairing-assistant:simulation-session",
};

// The opponent id travels with the stored state (not inside
// MatchSessionState itself — the engine stays a pure game-mechanics module
// with no concept of "which opponent"). loadSession compares it against the
// opponent currently being viewed so a stale session for a different
// opponent is never mistakenly resumed.
interface StoredSession {
  opponentId: string;
  state: MatchSessionState;
  opponentBehavior?: OpponentBehavior;
  similarScoreTable?: Record<string, number>;
}

/** What `loadSession` returns on a hit — the engine state plus whichever opponent-behavior context was saved alongside it (both fields `undefined` for `mode: "live"`). */
export interface LoadedSession {
  state: MatchSessionState;
  opponentBehavior?: OpponentBehavior;
  similarScoreTable?: Record<string, number>;
}

export function saveSession(
  opponentId: string,
  state: MatchSessionState,
  mode: SessionMode,
  opponentContext?: { behavior: OpponentBehavior; similarScoreTable?: Record<string, number> },
): void {
  const payload: StoredSession = {
    opponentId,
    state,
    opponentBehavior: opponentContext?.behavior,
    similarScoreTable: opponentContext?.similarScoreTable,
  };
  try {
    globalThis.localStorage.setItem(STORAGE_KEYS[mode], JSON.stringify(payload));
  } catch {
    // Storage unavailable (quota exceeded, disabled site data, a
    // restrictive private-browsing context) — degrade to "not persisted
    // this step" rather than crashing the session mid-match.
  }
}

/** Returns the stored session for `mode` only if it belongs to `opponentId`; otherwise null. */
export function loadSession(opponentId: string, mode: SessionMode): LoadedSession | null {
  let raw: string | null;
  try {
    raw = globalThis.localStorage.getItem(STORAGE_KEYS[mode]);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const stored = JSON.parse(raw) as StoredSession;
    if (stored.opponentId !== opponentId) {
      return null;
    }
    return {
      state: stored.state,
      opponentBehavior: stored.opponentBehavior,
      similarScoreTable: stored.similarScoreTable,
    };
  } catch {
    return null;
  }
}

export function clearSession(mode: SessionMode): void {
  try {
    globalThis.localStorage.removeItem(STORAGE_KEYS[mode]);
  } catch {
    // See saveSession — storage may be unavailable; nothing to clear then.
  }
}
