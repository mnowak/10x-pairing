import { describe, expect, it } from "vitest";
// @ts-expect-error -- Vite's `?raw` suffix returns source text without
// executing the module's imports, sidestepping `astro:env/server` (only
// resolvable inside Astro's own build pipeline, not this test runtime).
import teamsIndexSource from "./teams/index.ts?raw";
// @ts-expect-error -- see above
import opponentsIndexSource from "./opponents/index.ts?raw";

// Risk #4 (test-plan.md §2, row 4) forward-looking guard: no route deletes a
// whole teams/opponents row today (context/changes/data-integrity/research.md
// confirmed this via a full route listing) — the schema's cascade chain
// would silently wipe every estimate under that team/opponent if one
// existed without its own confirmation, exactly the class of bug
// FR-017/FR-019 already had to be retrofitted once to cover for army-level
// removal. This guards only the two known "whole resource" route files
// below (checked as source text, not by importing them, since importing
// pulls in astro:env/server) — it does not scan for a hypothetical new
// route file elsewhere. It also only matches `export const/function DELETE`
// — the convention every route file in this codebase uses — not other valid
// ways to export a handler (e.g. `export { h as DELETE }`, a default-export
// object). Revisit if that convention ever stops being consistent.
const DELETE_EXPORT_PATTERN = /export\s+(const|function)\s+DELETE\b/;

describe("no team-/opponent-level delete route exists", () => {
  it("teams/index.ts has no DELETE handler", () => {
    expect(DELETE_EXPORT_PATTERN.test(teamsIndexSource)).toBe(false);
  });

  it("opponents/index.ts has no DELETE handler", () => {
    expect(DELETE_EXPORT_PATTERN.test(opponentsIndexSource)).toBe(false);
  });
});
