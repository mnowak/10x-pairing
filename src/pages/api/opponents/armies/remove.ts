import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getOpponentWithArmies, removeArmyFromOpponent } from "@/lib/opponents";

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
  const rawOpponentArmyId = form.get("opponent_army_id");
  const opponentArmyId = typeof rawOpponentArmyId === "string" ? rawOpponentArmyId : "";

  if (!opponentId) {
    return context.redirect(`/dashboard/opponents?error=${encodeURIComponent("Missing opponent")}`);
  }
  if (!opponentArmyId) {
    return context.redirect(`/dashboard/opponents/${opponentId}?error=${encodeURIComponent("Missing army to remove")}`);
  }

  let opponent;
  try {
    opponent = await getOpponentWithArmies(supabase, context.locals.user.id, opponentId);
  } catch {
    return context.redirect(
      `/dashboard/opponents/${opponentId}?error=${encodeURIComponent("Something went wrong loading that opponent")}`,
    );
  }
  if (!opponent?.armies.some((army) => army.id === opponentArmyId)) {
    return context.redirect(`/dashboard/opponents/${opponentId}?error=${encodeURIComponent("Army not found")}`);
  }

  const result = await removeArmyFromOpponent(supabase, context.locals.user.id, opponentArmyId);

  if (!result.ok) {
    return context.redirect(`/dashboard/opponents/${opponentId}?error=${encodeURIComponent(result.error)}`);
  }

  return context.redirect(`/dashboard/opponents/${opponentId}`);
};
