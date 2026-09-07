import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/db/database.types";
import type { TeamsError } from "@/lib/teams";

type TypedSupabaseClient = SupabaseClient<Database>;

const UNIQUE_VIOLATION = "23505";

export interface OpponentWithArmies extends Tables<"opponents"> {
  armies: Tables<"opponent_armies">[];
}

function findDuplicateInBatch(names: string[]): string | undefined {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) return name;
    seen.add(name);
  }
  return undefined;
}

export async function getOpponentsWithArmies(
  supabase: TypedSupabaseClient,
  captainId: string,
): Promise<OpponentWithArmies[]> {
  const { data, error } = await supabase
    .from("opponents")
    .select("*, armies:opponent_armies(*)")
    .eq("captain_id", captainId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function getOpponentWithArmies(
  supabase: TypedSupabaseClient,
  captainId: string,
  opponentId: string,
): Promise<OpponentWithArmies | null> {
  const { data, error } = await supabase
    .from("opponents")
    .select("*, armies:opponent_armies(*)")
    .eq("captain_id", captainId)
    .eq("id", opponentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function createOpponentWithArmies(
  supabase: TypedSupabaseClient,
  name: string,
  armyNames: string[],
): Promise<{ opponent: Tables<"opponents"> } | { error: TeamsError }> {
  const { data: opponent, error: opponentError } = await supabase.from("opponents").insert({ name }).select().single();

  if (opponentError) {
    return { error: { type: "unknown", message: opponentError.message } };
  }

  if (armyNames.length > 0) {
    const { error: armiesError } = await supabase
      .from("opponent_armies")
      .insert(armyNames.map((armyName) => ({ opponent_id: opponent.id, name: armyName })));

    if (armiesError) {
      if (armiesError.code === UNIQUE_VIOLATION) {
        return { error: { type: "duplicate_army", name: findDuplicateInBatch(armyNames) ?? armyNames[0] } };
      }
      return { error: { type: "unknown", message: armiesError.message } };
    }
  }

  return { opponent };
}

export async function addArmyToOpponent(
  supabase: TypedSupabaseClient,
  opponentId: string,
  armyName: string,
): Promise<{ army: Tables<"opponent_armies"> } | { error: TeamsError }> {
  const { data: army, error } = await supabase
    .from("opponent_armies")
    .insert({ opponent_id: opponentId, name: armyName })
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
