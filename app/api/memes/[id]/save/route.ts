import { NextRequest } from "next/server";
import { db, save } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { syncSavedMemeToSupabase, deleteSavedMemeFromSupabase, syncMemeToSupabase, toCanonicalUuid } from "@/lib/server/sync";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const { id } = await ctx.params;
  const meme = db().memes.find((m) => m.id === id && m.status === "live");
  if (!meme) return fail("That meme is no longer available.", 404);
  const d = db();
  const canonUserId = toCanonicalUuid(user.id);
  const existingIdx = d.saved_memes.findIndex(
    (s) => toCanonicalUuid(s.user_id) === canonUserId && s.meme_id === id
  );

  if (existingIdx >= 0) {
    d.saved_memes.splice(existingIdx, 1);
    meme.saves = Math.max(0, meme.saves - 1);
    save();
    await Promise.allSettled([
      deleteSavedMemeFromSupabase(canonUserId, id),
      syncMemeToSupabase(meme),
    ]);
    return ok({ saved: false, saves_count: meme.saves });
  }

  d.saved_memes.push({ user_id: canonUserId, meme_id: id, created_at: new Date().toISOString() });
  meme.saves += 1;
  save();
  await Promise.allSettled([
    syncSavedMemeToSupabase(canonUserId, id),
    syncMemeToSupabase(meme),
  ]);
  return ok({ saved: true, saves_count: meme.saves });
}

