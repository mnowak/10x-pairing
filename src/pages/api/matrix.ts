import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { upsertEstimate } from "@/lib/matrix";
import { COLOR_BANDS, type ColorBand } from "@/lib/colorBands";

const VALID_BANDS = new Set<string>(COLOR_BANDS.map((range) => range.band));

function isColorBand(value: unknown): value is ColorBand {
  return typeof value === "string" && VALID_BANDS.has(value);
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ ok: false, error: "Supabase is not configured" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { teamArmyId, opponentArmyId, band } = body as Record<string, unknown>;

  if (typeof teamArmyId !== "string" || !teamArmyId) {
    return Response.json({ ok: false, error: "teamArmyId is required" }, { status: 400 });
  }
  if (typeof opponentArmyId !== "string" || !opponentArmyId) {
    return Response.json({ ok: false, error: "opponentArmyId is required" }, { status: 400 });
  }
  if (!isColorBand(band)) {
    return Response.json({ ok: false, error: "band must be a valid color band" }, { status: 400 });
  }

  const result = await upsertEstimate(supabase, context.locals.user.id, teamArmyId, opponentArmyId, band);

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true });
};
