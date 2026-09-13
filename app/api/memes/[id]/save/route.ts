import { NextRequest } from "next/server";
import { db, save } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const { id } = await ctx.params;
  const meme = db().memes.find((m) => m.id === id && m.status === "live");
  if (!meme) return fail("That meme is no longer available.", 404);
  const d = db();
  const existing = d.saved_memes.find((s) => s.user_id === user.id && s.meme_id === id);
  if (existing) {
    d.saved_memes = d.saved_memes.filter((s) => s !== existing);
    meme.saves = Math.max(0, meme.saves - 1);
    save();
    return ok({ saved: false });
  }
  d.saved_memes.push({ user_id: user.id, meme_id: id, created_at: new Date().toISOString() });
  meme.saves += 1;
  save();
  return ok({ saved: true });
}
