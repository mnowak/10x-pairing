import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { addArmyToOpponent, getOpponentWithArmies } from "@/lib/opponents";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/opponents?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const rawOpponentId = form.get("opponent_id");
  const opponentId = typeof rawOpponentId === "string" ? rawOpponentId : "";
  const rawArmy = form.get("army");
  const armyName = typeof rawArmy === "string" ? rawArmy.trim() : "";

  if (!opponentId) {
    return context.redirect(`/dashboard/opponents?error=${encodeURIComponent("Missing opponent")}`);
  }
  if (!armyName) {
    return context.redirect(`/dashboard/opponents/${opponentId}?error=${encodeURIComponent("Army name is required")}`);
  }

  let opponent;
  try {
    opponent = await getOpponentWithArmies(supabase, context.locals.user.id, opponentId);
  } catch {
    return context.redirect(
      `/dashboard/opponents/${opponentId}?error=${encodeURIComponent("Something went wrong loading that opponent")}`,
    );
  }
  if (!opponent) {
    return context.redirect(`/dashboard/opponents?error=${encodeURIComponent("Opponent not found")}`);
  }

  const result = await addArmyToOpponent(supabase, opponent.id, armyName);

  if ("error" in result) {
    const message =
      result.error.type === "duplicate_army"
        ? `"${result.error.name}" is already in that roster`
        : result.error.message;
    return context.redirect(`/dashboard/opponents/${opponent.id}?error=${encodeURIComponent(message)}`);
  }

  return context.redirect(`/dashboard/opponents/${opponent.id}`);
};
