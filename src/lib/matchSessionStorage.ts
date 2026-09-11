import type { MatchSessionState } from "@/lib/matchSessionEngine";

// A single app-wide slot — only one match-mode session is ever active at a
// time (starting a session for a different opponent silently replaces
// whatever was here before). Accessed via globalThis rather than window so
// this module stays trivially testable under a runtime with no DOM.
const STORAGE_KEY = "pairing-assistant:match-session";

// The opponent id travels with the stored state (not inside
// MatchSessionState itself — the engine stays a pure game-mechanics module
// with no concept of "which opponent"). loadSession compares it against the
// opponent currently being viewed so a stale session for a different
// opponent is never mistakenly resumed.
interface StoredSession {
  opponentId: string;
  state: MatchSessionState;
}

export function saveSession(opponentId: string, state: MatchSessionState): void {
  const payload: StoredSession = { opponentId, state };
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** Returns the stored session only if it belongs to `opponentId`; otherwise null. */
export function loadSession(opponentId: string): MatchSessionState | null {
  let raw: string | null;
  try {
    raw = globalThis.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const stored = JSON.parse(raw) as StoredSession;
    return stored.opponentId === opponentId ? stored.state : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  globalThis.localStorage.removeItem(STORAGE_KEY);
}
