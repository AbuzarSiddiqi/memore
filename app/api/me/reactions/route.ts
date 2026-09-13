import { NextRequest } from "next/server";
import { requireUser, ok, fail } from "@/lib/server/http";
import { db, save } from "@/lib/server/db";
import { REACTION_IDS } from "@/lib/reactions";
import { syncProfileToSupabase } from "@/lib/server/sync";

// PATCH — save the user's five quick-reaction slots (order = priority).
// Lives on the account so every device restores the same tray.
export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body.active_reactions) ? body.active_reactions : [];
  const clean = ([...new Set(raw.filter((x: unknown) => typeof x === "string" && REACTION_IDS.includes(x)))] as string[]).slice(0, 5);
  if (clean.length === 0) return fail("Pick at least one reaction.");
  const d = db();
  const u = d.users.find((x) => x.id === user.id);
  if (!u) return fail("Log in first.", 401);
  u.active_reactions = clean;
  save();
  await syncProfileToSupabase(u);
  return ok({ active_reactions: clean });
}

