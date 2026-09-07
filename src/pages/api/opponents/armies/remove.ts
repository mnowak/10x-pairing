import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { removeArmyFromOpponent } from "@/lib/opponents";

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

  const result = await removeArmyFromOpponent(supabase, context.locals.user.id, opponentArmyId);

  if (!result.ok) {
    return context.redirect(`/dashboard/opponents/${opponentId}?error=${encodeURIComponent(result.error)}`);
  }

  return context.redirect(`/dashboard/opponents/${opponentId}`);
};
