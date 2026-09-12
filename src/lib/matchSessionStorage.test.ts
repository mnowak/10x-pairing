import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, loadSession, saveSession } from "@/lib/matchSessionStorage";
import type { MatchSessionState } from "@/lib/matchSessionEngine";

// The @cloudflare/vitest-pool-workers runtime has no DOM/localStorage, so
// this in-memory fake stands in for it — matching matchSessionStorage.ts's
// choice to read globalThis.localStorage rather than window.localStorage.
class FakeStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const sampleState: MatchSessionState = {
  ourAvailable: ["o1", "o2"],
  theirAvailable: ["t1", "t2"],
  subRound: 1,
  phase: "our-defender",
  suggested: "o1",
  working: {},
  history: [],
  refusedAttacker: null,
};

beforeEach(() => {
  globalThis.localStorage = new FakeStorage();
});

describe("matchSessionStorage", () => {
  it("round-trips a saved session through load for the same opponent", () => {
    saveSession("opp-1", sampleState, "live");
    expect(loadSession("opp-1", "live")).toEqual({
      state: sampleState,
      opponentBehavior: undefined,
      similarScoreTable: undefined,
    });
  });

  it("returns null when nothing has been saved", () => {
    expect(loadSession("opp-1", "live")).toBeNull();
  });

  it("returns null when the stored session belongs to a different opponent", () => {
    saveSession("opp-1", sampleState, "live");
    expect(loadSession("opp-2", "live")).toBeNull();
  });

  it("returns null (not a throw) on corrupt stored data", () => {
    globalThis.localStorage.setItem("pairing-assistant:match-session", "{not valid json");
    expect(loadSession("opp-1", "live")).toBeNull();
  });

  it("clearSession removes the stored session for that mode", () => {
    saveSession("opp-1", sampleState, "live");
    clearSession("live");
    expect(loadSession("opp-1", "live")).toBeNull();
  });

  it("keeps a live session and a simulation session for the same opponent separate", () => {
    const simulationState: MatchSessionState = { ...sampleState, subRound: 2 };
    saveSession("opp-1", sampleState, "live");
    saveSession("opp-1", simulationState, "simulation", { behavior: "mirrored" });

    expect(loadSession("opp-1", "live")?.state).toEqual(sampleState);
    expect(loadSession("opp-1", "simulation")?.state).toEqual(simulationState);
  });

  it("clearing one mode's session leaves the other mode's session intact", () => {
    saveSession("opp-1", sampleState, "live");
    saveSession("opp-1", sampleState, "simulation", { behavior: "random" });

    clearSession("simulation");

    expect(loadSession("opp-1", "live")?.state).toEqual(sampleState);
    expect(loadSession("opp-1", "simulation")).toBeNull();
  });

  it("persists and restores the chosen opponentBehavior alongside a simulation session", () => {
    saveSession("opp-1", sampleState, "simulation", { behavior: "mirrored" });
    expect(loadSession("opp-1", "simulation")).toEqual({
      state: sampleState,
      opponentBehavior: "mirrored",
      similarScoreTable: undefined,
    });
  });

  it("persists and restores a Similar-mode session's generated score table verbatim", () => {
    const table = { "o1:t1": 5, "o1:t2": 18 };
    saveSession("opp-1", sampleState, "simulation", { behavior: "similar", similarScoreTable: table });
    expect(loadSession("opp-1", "simulation")).toEqual({
      state: sampleState,
      opponentBehavior: "similar",
      similarScoreTable: table,
    });
  });

  it("a live-mode session is unaffected by the new opponent-behavior fields — they stay undefined", () => {
    saveSession("opp-1", sampleState, "live");
    const loaded = loadSession("opp-1", "live");
    expect(loaded?.opponentBehavior).toBeUndefined();
    expect(loaded?.similarScoreTable).toBeUndefined();
  });
});
