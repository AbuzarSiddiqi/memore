import { NextRequest } from "next/server";
import { db, uid, save } from "@/lib/server/db";
import { ok, fail, requireUser, rateLimit } from "@/lib/server/http";
import type { ReportCategory } from "@/lib/types";

const CATEGORIES: ReportCategory[] = ["spam", "harassment", "hate", "sexual", "violence", "copyright", "other"];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  if (!rateLimit(`report:${user.id}`, 10, 60 * 60_000)) return fail("Too many reports. The mods heard you.", 429);
  const { id } = await ctx.params;
  const body = await req.json();
  const category = String(body.category) as ReportCategory;
  if (!CATEGORIES.includes(category)) return fail("Pick a report category.");
  const target_type = body.target_type === "comment" ? "comment" : body.target_type === "user" ? "user" : "meme";
  const target = db().memes.find((m) => m.id === id) ?? (target_type === "comment" ? db().comments.find((c) => c.id === id) : null);
  if (!target) return fail("That content is no longer available.", 404);

  db().reports.push({
    id: uid(), reporter_id: user.id, target_type, target_id: id,
    category, note: String(body.note ?? "").slice(0, 300),
    status: "open", created_at: new Date().toISOString(),
  });
  save();
  return ok({ reported: true });
}
