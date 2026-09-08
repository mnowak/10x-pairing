import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/db/database.types";
import { MAX_ROSTER_SIZE } from "@/lib/rosterLimits";

type TypedSupabaseClient = SupabaseClient<Database>;

export interface TeamWithArmies extends Tables<"teams"> {
  armies: Tables<"team_armies">[];
}

export type TeamsError = { type: "duplicate_army"; name: string } | { type: "unknown"; message: string };

const UNIQUE_VIOLATION = "23505";

/**
 * Returns the captain's team (with its roster) or null if they have none yet.
 * Uses limit(1) rather than maybeSingle() because "one team per captain" is
 * enforced only at the UI layer (F-01 left it unconstrained in the DB) — this
 * must not throw if more than one row is ever found.
 */
export async function getTeamWithArmies(
  supabase: TypedSupabaseClient,
  captainId: string,
): Promise<TeamWithArmies | null> {
  const { data, error } = await supabase
    .from("teams")
    .select("*, armies:team_armies(*)")
    .eq("captain_id", captainId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw error;
  }

  if (data.length === 0) {
    return null;
  }

  return data[0];
}

function findDuplicateInBatch(names: string[]): string | undefined {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) return name;
    seen.add(name);
  }
  return undefined;
}

export async function createTeamWithArmies(
  supabase: TypedSupabaseClient,
  name: string,
  armyNames: string[],
): Promise<{ team: Tables<"teams"> } | { error: TeamsError }> {
  if (armyNames.length > MAX_ROSTER_SIZE) {
    return { error: { type: "unknown", message: `A team can have at most ${MAX_ROSTER_SIZE} armies` } };
  }

  const { data: team, error: teamError } = await supabase.from("teams").insert({ name }).select().single();

  if (teamError) {
    return { error: { type: "unknown", message: teamError.message } };
  }

  if (armyNames.length > 0) {
    const { error: armiesError } = await supabase
      .from("team_armies")
      .insert(armyNames.map((armyName) => ({ team_id: team.id, name: armyName })));

    if (armiesError) {
      if (armiesError.code === UNIQUE_VIOLATION) {
        return { error: { type: "duplicate_army", name: findDuplicateInBatch(armyNames) ?? armyNames[0] } };
      }
      return { error: { type: "unknown", message: armiesError.message } };
    }
  }

  return { team };
}

export async function addArmyToTeam(
  supabase: TypedSupabaseClient,
  teamId: string,
  armyName: string,
): Promise<{ army: Tables<"team_armies"> } | { error: TeamsError }> {
  const { count, error: countError } = await supabase
    .from("team_armies")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);

  if (countError) {
    return { error: { type: "unknown", message: countError.message } };
  }
  if (count !== null && count >= MAX_ROSTER_SIZE) {
    return {
      error: { type: "unknown", message: `Your roster already has ${MAX_ROSTER_SIZE} armies — the maximum` },
    };
  }

  const { data: army, error } = await supabase
    .from("team_armies")
    .insert({ team_id: teamId, name: armyName })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: { type: "duplicate_army", name: armyName } };
    }
    return { error: { type: "unknown", message: error.message } };
  }

  return { army };
}

export async function removeArmyFromTeam(
  supabase: TypedSupabaseClient,
  captainId: string,
  teamArmyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("team_armies").delete().eq("id", teamArmyId).eq("captain_id", captainId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/**
 * Batched estimate counts for a set of team armies, keyed by team_army_id.
 * Grouped in application code (small roster sizes at this project's scale)
 * rather than a DB-side aggregate — one query, not N+1.
 */
export async function getEstimateCountsForTeamArmies(
  supabase: TypedSupabaseClient,
  captainId: string,
  teamArmyIds: string[],
): Promise<Record<string, number>> {
  if (teamArmyIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("pairing_matrix_estimates")
    .select("team_army_id")
    .eq("captain_id", captainId)
    .in("team_army_id", teamArmyIds);

  if (error) {
    throw error;
  }

  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.team_army_id] = (counts[row.team_army_id] ?? 0) + 1;
  }
  return counts;
}
