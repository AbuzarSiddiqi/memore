import { NextRequest } from "next/server";
import { db, ensureHydrated } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { memeView, commentView, publicUser, similarMemes } from "@/lib/server/views";
import { getSeries } from "@/lib/server/market";
import { trackMission } from "@/lib/server/progression";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureHydrated();
  const user = await requireUser();
  const { id } = await ctx.params;
  const d = db();
  const meme = d.memes.find((m) => m.id === id);
  if (!meme) return fail("That meme is no longer available.", 404);
  meme.views += 1;
  if (user) trackMission(user.id, "view", meme.id);

  const comments = d.comments
    .filter((c) => c.meme_id === id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(commentView);

  const investors = d.holdings
    .filter((h) => h.meme_id === id && h.quantity > 1e-9)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 12)
    .map((h) => {
      const u = d.users.find((x) => x.id === h.user_id);
      if (!u) return null;
      return { ...publicUser(u), position_value: Math.round(h.quantity * meme.current_price * 10) / 10 };
    })
    .filter(Boolean);

  const children = d.remixes.filter((r) => r.original_meme_id === id).map((r) => r.remix_meme_id);
  const rootId = (() => {
    let cur = meme;
    const seen = new Set<string>();
    while (cur.parent_meme_id && !seen.has(cur.id)) {
      seen.add(cur.id);
      const p = d.memes.find((m) => m.id === cur.parent_meme_id);
      if (!p) break;
      cur = p;
    }
    return cur.id;
  })();
  const tree = d.memes.filter((m) => {
    if (m.id === rootId) return true;
    let cur = m;
    const seen = new Set<string>();
    while (cur.parent_meme_id && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.parent_meme_id === rootId) return true;
      const p = d.memes.find((x) => x.id === cur.parent_meme_id);
      if (!p) break;
      cur = p;
    }
    return false;
  });

  return ok({
    meme: memeView(meme, user?.id),
    comments,
    investors,
    remix_ids: children,
    evolution: tree.map((m) => memeView(m, user?.id)),
    similar: similarMemes(meme, user?.id),
    series_1h: getSeries(id, "1H"),
    series_24h: getSeries(id, "24H"),
    series_7d: getSeries(id, "7D"),
    series_30d: getSeries(id, "30D"),
    series_all: getSeries(id, "ALL"),
  });
}
