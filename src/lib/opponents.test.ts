import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import {
  addArmyToOpponent,
  createOpponentWithArmies,
  getEstimateCountsForOpponentArmies,
  removeArmyFromOpponent,
} from "@/lib/opponents";
import { addArmyToTeam, getTeamWithArmies } from "@/lib/teams";
import { upsertEstimate } from "@/lib/matrix";
import {
  cleanupOpponent,
  describeSetupError,
  getCaptainId,
  getOpponentArmyId,
  signInCaptain,
} from "@/lib/testSupport/twoCaptains";

// Risk #3 (test-plan.md §2, row 3), defense-in-depth case: removeArmyFromOpponent's
// `captain_id`-scoped delete must keep a captain's delete from ever touching
// another captain's opponent army — independent of RLS. Distinct from the F1
// fix in context/archive/2026-09-07-remove-team-army/reviews/impl-review.md,
// which lives in the route handler and covers a same-captain/cross-opponent
// case, not this one.
describe("removeArmyFromOpponent — cross-captain delete protection (risk #3, defense-in-depth)", () => {
  let captainA: SupabaseClient<Database>;
  let captainB: SupabaseClient<Database>;
  let captainAId: string;
  let captainBId: string;

  beforeAll(async () => {
    captainA = await signInCaptain("a");
    captainB = await signInCaptain("b");
    captainAId = await getCaptainId(captainA);
    captainBId = await getCaptainId(captainB);
  });

  it("deletes the captain's own opponent army", async () => {
    const opponentResult = await createOpponentWithArmies(captainB, `Risk3 Own Delete ${crypto.randomUUID()}`, ["Tau"]);
    if ("error" in opponentResult) throw new Error(describeSetupError(opponentResult.error));
    const opponentId = opponentResult.opponent.id;

    try {
      const opponentArmyId = await getOpponentArmyId(captainB, opponentId);

      const result = await removeArmyFromOpponent(captainB, captainBId, opponentArmyId);
      expect(result).toEqual({ ok: true });

      const { data: stillThere } = await captainB
        .from("opponent_armies")
        .select("id")
        .eq("id", opponentArmyId)
        .maybeSingle();
      expect(stillThere).toBeNull();
    } finally {
      await cleanupOpponent(captainB, opponentId);
    }
  });

  it("does not delete another captain's opponent army", async () => {
    const opponentResult = await createOpponentWithArmies(captainB, `Risk3 Cross Delete ${crypto.randomUUID()}`, [
      "Tyranids",
    ]);
    if ("error" in opponentResult) throw new Error(describeSetupError(opponentResult.error));
    const opponentId = opponentResult.opponent.id;

    try {
      const opponentArmyId = await getOpponentArmyId(captainB, opponentId);

      await removeArmyFromOpponent(captainA, captainAId, opponentArmyId);

      const { data: stillThere } = await captainB
        .from("opponent_armies")
        .select("id")
        .eq("id", opponentArmyId)
        .maybeSingle();
      expect(stillThere).not.toBeNull();
    } finally {
      await cleanupOpponent(captainB, opponentId);
    }
  });
});

// Risk #4/#5 (test-plan.md §2, rows 4-5): removeArmyFromOpponent's cascade
// must actually delete every referencing pairing_matrix_estimates row, and
// getEstimateCountsForOpponentArmies must predict that count exactly under
// normal (non-concurrent) conditions. See context/changes/data-integrity/research.md.
describe("removeArmyFromOpponent / getEstimateCountsForOpponentArmies — data-integrity (risks #4, #5)", () => {
  let captainA: SupabaseClient<Database>;
  let captainAId: string;

  beforeAll(async () => {
    captainA = await signInCaptain("a");
    captainAId = await getCaptainId(captainA);
  });

  it("reports zero estimates and removes cleanly when none exist", async () => {
    const opponentResult = await createOpponentWithArmies(
      captainA,
      `DataIntegrity Zero Opponent ${crypto.randomUUID()}`,
      [],
    );
    if ("error" in opponentResult) throw new Error(describeSetupError(opponentResult.error));
    const opponentId = opponentResult.opponent.id;

    try {
      const armyResult = await addArmyToOpponent(captainA, opponentId, "Zero Army");
      if ("error" in armyResult) throw new Error(describeSetupError(armyResult.error));
      const opponentArmyId = armyResult.army.id;

      const counts = await getEstimateCountsForOpponentArmies(captainA, captainAId, [opponentArmyId]);
      expect(counts[opponentArmyId] ?? 0).toBe(0);

      const result = await removeArmyFromOpponent(captainA, captainAId, opponentArmyId);
      expect(result).toEqual({ ok: true });
    } finally {
      await cleanupOpponent(captainA, opponentId);
    }
  });

  it("count matches the actual number of rows the cascade deletes", async () => {
    const opponentResult = await createOpponentWithArmies(
      captainA,
      `DataIntegrity Multi Opponent ${crypto.randomUUID()}`,
      [],
    );
    if ("error" in opponentResult) throw new Error(describeSetupError(opponentResult.error));
    const opponentId = opponentResult.opponent.id;

    // Populated incrementally so a failure partway through setup only
    // cleans up the team armies actually created — see this phase's
    // impl-review F1.
    const teamArmyIds: string[] = [];
    try {
      const armyResult = await addArmyToOpponent(captainA, opponentId, "Multi Army");
      if ("error" in armyResult) throw new Error(describeSetupError(armyResult.error));
      const opponentArmyId = armyResult.army.id;

      const existingTeam = await getTeamWithArmies(captainA, captainAId);
      if (!existingTeam) throw new Error("Captain A has no seeded team — check supabase/seed.sql");

      // Two distinct team armies, since (team_army_id, opponent_army_id) is
      // unique — this is how two real estimate rows get created against the
      // one opponent army under test.
      const teamArmyOneResult = await addArmyToTeam(
        captainA,
        existingTeam.id,
        `DataIntegrity TA1 ${crypto.randomUUID()}`,
      );
      if ("error" in teamArmyOneResult) throw new Error(describeSetupError(teamArmyOneResult.error));
      teamArmyIds.push(teamArmyOneResult.army.id);
      const teamArmyTwoResult = await addArmyToTeam(
        captainA,
        existingTeam.id,
        `DataIntegrity TA2 ${crypto.randomUUID()}`,
      );
      if ("error" in teamArmyTwoResult) throw new Error(describeSetupError(teamArmyTwoResult.error));
      teamArmyIds.push(teamArmyTwoResult.army.id);

      const estimateOne = await upsertEstimate(
        captainA,
        captainAId,
        teamArmyOneResult.army.id,
        opponentArmyId,
        "green",
      );
      expect(estimateOne).toEqual({ ok: true });
      const estimateTwo = await upsertEstimate(captainA, captainAId, teamArmyTwoResult.army.id, opponentArmyId, "red");
      expect(estimateTwo).toEqual({ ok: true });

      const counts = await getEstimateCountsForOpponentArmies(captainA, captainAId, [opponentArmyId]);
      expect(counts[opponentArmyId]).toBe(2);

      const result = await removeArmyFromOpponent(captainA, captainAId, opponentArmyId);
      expect(result).toEqual({ ok: true });

      const { data: remaining } = await captainA
        .from("pairing_matrix_estimates")
        .select("id")
        .eq("opponent_army_id", opponentArmyId);
      expect(remaining).toEqual([]);
    } finally {
      for (const teamArmyId of teamArmyIds) {
        await captainA.from("team_armies").delete().eq("id", teamArmyId);
      }
      await cleanupOpponent(captainA, opponentId);
    }
  });

  // Gap 2 (research.md): the confirmation count is a page-load-time
  // snapshot, never refetched before delete — an accepted trade-off, not a
  // bug (context/archive/2026-09-07-remove-team-army/plan.md:33). This pins
  // that the gap is real and reproducible, not that it should stay this way.
  describe("known limitations (accepted, not a regression)", () => {
    it("the shown count can undercount what actually gets deleted under concurrent writes", async () => {
      const opponentResult = await createOpponentWithArmies(
        captainA,
        `DataIntegrity Stale Opponent ${crypto.randomUUID()}`,
        [],
      );
      if ("error" in opponentResult) throw new Error(describeSetupError(opponentResult.error));
      const opponentId = opponentResult.opponent.id;

      // Populated incrementally so a failure partway through setup only
      // cleans up the team armies actually created — see this phase's
      // impl-review F1.
      const teamArmyIds: string[] = [];
      try {
        const armyResult = await addArmyToOpponent(captainA, opponentId, "Stale Army");
        if ("error" in armyResult) throw new Error(describeSetupError(armyResult.error));
        const opponentArmyId = armyResult.army.id;

        const existingTeam = await getTeamWithArmies(captainA, captainAId);
        if (!existingTeam) throw new Error("Captain A has no seeded team — check supabase/seed.sql");

        const teamArmyOneResult = await addArmyToTeam(
          captainA,
          existingTeam.id,
          `DataIntegrity Stale TA1 ${crypto.randomUUID()}`,
        );
        if ("error" in teamArmyOneResult) throw new Error(describeSetupError(teamArmyOneResult.error));
        teamArmyIds.push(teamArmyOneResult.army.id);
        const teamArmyTwoResult = await addArmyToTeam(
          captainA,
          existingTeam.id,
          `DataIntegrity Stale TA2 ${crypto.randomUUID()}`,
        );
        if ("error" in teamArmyTwoResult) throw new Error(describeSetupError(teamArmyTwoResult.error));
        teamArmyIds.push(teamArmyTwoResult.army.id);

        const estimateOne = await upsertEstimate(
          captainA,
          captainAId,
          teamArmyOneResult.army.id,
          opponentArmyId,
          "yellow",
        );
        expect(estimateOne).toEqual({ ok: true });

        // Confirmation dialog would show this count...
        const shownCounts = await getEstimateCountsForOpponentArmies(captainA, captainAId, [opponentArmyId]);
        const shownCount = shownCounts[opponentArmyId] ?? 0;

        // ...but meanwhile, in another tab, a second estimate is added for
        // the same opponent army before the captain clicks "Confirm."
        const estimateTwo = await upsertEstimate(
          captainA,
          captainAId,
          teamArmyTwoResult.army.id,
          opponentArmyId,
          "dark-green",
        );
        expect(estimateTwo).toEqual({ ok: true });

        const { count: actualCountBeforeDelete } = await captainA
          .from("pairing_matrix_estimates")
          .select("id", { count: "exact", head: true })
          .eq("opponent_army_id", opponentArmyId);
        expect(actualCountBeforeDelete ?? 0).toBeGreaterThan(shownCount);

        const result = await removeArmyFromOpponent(captainA, captainAId, opponentArmyId);
        expect(result).toEqual({ ok: true });

        const { data: remaining } = await captainA
          .from("pairing_matrix_estimates")
          .select("id")
          .eq("opponent_army_id", opponentArmyId);
        expect(remaining).toEqual([]);
      } finally {
        for (const teamArmyId of teamArmyIds) {
          await captainA.from("team_armies").delete().eq("id", teamArmyId);
        }
        await cleanupOpponent(captainA, opponentId);
      }
    });
  });
});
