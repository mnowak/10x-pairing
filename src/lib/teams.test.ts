import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { addArmyToTeam, getEstimateCountsForTeamArmies, getTeamWithArmies, removeArmyFromTeam } from "@/lib/teams";
import { addArmyToOpponent, createOpponentWithArmies } from "@/lib/opponents";
import { upsertEstimate } from "@/lib/matrix";
import { cleanupOpponent, describeSetupError, getCaptainId, signInCaptain } from "@/lib/testSupport/twoCaptains";

// Risk #4/#5 (test-plan.md §2, rows 4-5): removeArmyFromTeam's cascade must
// actually delete every referencing pairing_matrix_estimates row, and
// getEstimateCountsForTeamArmies must predict that count exactly under
// normal (non-concurrent) conditions. See context/changes/data-integrity/research.md.
describe("removeArmyFromTeam / getEstimateCountsForTeamArmies — data-integrity (risks #4, #5)", () => {
  let captainA: SupabaseClient<Database>;
  let captainAId: string;

  beforeAll(async () => {
    captainA = await signInCaptain("a");
    captainAId = await getCaptainId(captainA);
  });

  it("reports zero estimates and removes cleanly when none exist", async () => {
    const existingTeam = await getTeamWithArmies(captainA, captainAId);
    if (!existingTeam) throw new Error("Captain A has no seeded team — check supabase/seed.sql");
    const addArmyResult = await addArmyToTeam(captainA, existingTeam.id, `DataIntegrity Zero ${crypto.randomUUID()}`);
    if ("error" in addArmyResult) throw new Error(describeSetupError(addArmyResult.error));
    const teamArmyId = addArmyResult.army.id;

    try {
      const counts = await getEstimateCountsForTeamArmies(captainA, captainAId, [teamArmyId]);
      expect(counts[teamArmyId] ?? 0).toBe(0);

      const result = await removeArmyFromTeam(captainA, captainAId, teamArmyId);
      expect(result).toEqual({ ok: true });
    } finally {
      // Backstop only — the assertions above already remove it on the
      // success path; this guards against leaking the row if the test fails
      // before removeArmyFromTeam runs.
      await captainA.from("team_armies").delete().eq("id", teamArmyId);
    }
  });

  it("count matches the actual number of rows the cascade deletes", async () => {
    const existingTeam = await getTeamWithArmies(captainA, captainAId);
    if (!existingTeam) throw new Error("Captain A has no seeded team — check supabase/seed.sql");
    const addArmyResult = await addArmyToTeam(captainA, existingTeam.id, `DataIntegrity Multi ${crypto.randomUUID()}`);
    if ("error" in addArmyResult) throw new Error(describeSetupError(addArmyResult.error));
    const teamArmyId = addArmyResult.army.id;

    let opponentId: string | undefined;
    try {
      const opponentResult = await createOpponentWithArmies(
        captainA,
        `DataIntegrity Opponent ${crypto.randomUUID()}`,
        [],
      );
      if ("error" in opponentResult) throw new Error(describeSetupError(opponentResult.error));
      opponentId = opponentResult.opponent.id;

      // Two distinct opponent armies, since (team_army_id, opponent_army_id)
      // is unique — this is how two real estimate rows get created against
      // the one team army under test.
      const armyOneResult = await addArmyToOpponent(captainA, opponentId, "Necrons");
      if ("error" in armyOneResult) throw new Error(describeSetupError(armyOneResult.error));
      const armyTwoResult = await addArmyToOpponent(captainA, opponentId, "Orks");
      if ("error" in armyTwoResult) throw new Error(describeSetupError(armyTwoResult.error));

      const estimateOne = await upsertEstimate(captainA, captainAId, teamArmyId, armyOneResult.army.id, "green");
      expect(estimateOne).toEqual({ ok: true });
      const estimateTwo = await upsertEstimate(captainA, captainAId, teamArmyId, armyTwoResult.army.id, "red");
      expect(estimateTwo).toEqual({ ok: true });

      const counts = await getEstimateCountsForTeamArmies(captainA, captainAId, [teamArmyId]);
      expect(counts[teamArmyId]).toBe(2);

      const result = await removeArmyFromTeam(captainA, captainAId, teamArmyId);
      expect(result).toEqual({ ok: true });

      const { data: remaining } = await captainA
        .from("pairing_matrix_estimates")
        .select("id")
        .eq("team_army_id", teamArmyId);
      expect(remaining).toEqual([]);
    } finally {
      if (opponentId) await cleanupOpponent(captainA, opponentId);
      await captainA.from("team_armies").delete().eq("id", teamArmyId);
    }
  });

  // Gap 2 (research.md): the confirmation count is a page-load-time
  // snapshot, never refetched before delete — an accepted trade-off, not a
  // bug (context/archive/2026-09-07-remove-team-army/plan.md:33). This pins
  // that the gap is real and reproducible, not that it should stay this way.
  describe("known limitations (accepted, not a regression)", () => {
    it("the shown count can undercount what actually gets deleted under concurrent writes", async () => {
      const existingTeam = await getTeamWithArmies(captainA, captainAId);
      if (!existingTeam) throw new Error("Captain A has no seeded team — check supabase/seed.sql");
      const addArmyResult = await addArmyToTeam(
        captainA,
        existingTeam.id,
        `DataIntegrity Stale ${crypto.randomUUID()}`,
      );
      if ("error" in addArmyResult) throw new Error(describeSetupError(addArmyResult.error));
      const teamArmyId = addArmyResult.army.id;

      let opponentId: string | undefined;
      try {
        const opponentResult = await createOpponentWithArmies(
          captainA,
          `DataIntegrity Stale Opponent ${crypto.randomUUID()}`,
          [],
        );
        if ("error" in opponentResult) throw new Error(describeSetupError(opponentResult.error));
        opponentId = opponentResult.opponent.id;

        const armyOneResult = await addArmyToOpponent(captainA, opponentId, "Tau");
        if ("error" in armyOneResult) throw new Error(describeSetupError(armyOneResult.error));
        const estimateOne = await upsertEstimate(captainA, captainAId, teamArmyId, armyOneResult.army.id, "yellow");
        expect(estimateOne).toEqual({ ok: true });

        // Confirmation dialog would show this count...
        const shownCounts = await getEstimateCountsForTeamArmies(captainA, captainAId, [teamArmyId]);
        const shownCount = shownCounts[teamArmyId] ?? 0;

        // ...but meanwhile, in another tab, a second estimate is added for
        // the same army before the captain clicks "Confirm."
        const armyTwoResult = await addArmyToOpponent(captainA, opponentId, "Tyranids");
        if ("error" in armyTwoResult) throw new Error(describeSetupError(armyTwoResult.error));
        const estimateTwo = await upsertEstimate(captainA, captainAId, teamArmyId, armyTwoResult.army.id, "dark-green");
        expect(estimateTwo).toEqual({ ok: true });

        const { count: actualCountBeforeDelete } = await captainA
          .from("pairing_matrix_estimates")
          .select("id", { count: "exact", head: true })
          .eq("team_army_id", teamArmyId);
        expect(actualCountBeforeDelete ?? 0).toBeGreaterThan(shownCount);

        const result = await removeArmyFromTeam(captainA, captainAId, teamArmyId);
        expect(result).toEqual({ ok: true });

        const { data: remaining } = await captainA
          .from("pairing_matrix_estimates")
          .select("id")
          .eq("team_army_id", teamArmyId);
        expect(remaining).toEqual([]);
      } finally {
        if (opponentId) await cleanupOpponent(captainA, opponentId);
        await captainA.from("team_armies").delete().eq("id", teamArmyId);
      }
    });
  });
});
