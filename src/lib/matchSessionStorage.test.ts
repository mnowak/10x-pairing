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
    saveSession("opp-1", sampleState);
    expect(loadSession("opp-1")).toEqual(sampleState);
  });

  it("returns null when nothing has been saved", () => {
    expect(loadSession("opp-1")).toBeNull();
  });

  it("returns null when the stored session belongs to a different opponent", () => {
    saveSession("opp-1", sampleState);
    expect(loadSession("opp-2")).toBeNull();
  });

  it("returns null (not a throw) on corrupt stored data", () => {
    globalThis.localStorage.setItem("pairing-assistant:match-session", "{not valid json");
    expect(loadSession("opp-1")).toBeNull();
  });

  it("clearSession removes the stored session", () => {
    saveSession("opp-1", sampleState);
    clearSession();
    expect(loadSession("opp-1")).toBeNull();
  });
});
