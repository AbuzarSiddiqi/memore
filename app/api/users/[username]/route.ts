import { NextRequest } from "next/server";
import { db, ensureHydrated } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { memeView, publicUser } from "@/lib/server/views";
import { userBySlug } from "@/lib/server/auth";
import { biggestWinsLosses, predictionIQ, rankOf, seasonInfo } from "@/lib/server/progression";
import { change24h } from "@/lib/server/market";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  await ensureHydrated();
  const viewer = await requireUser();
  const { username } = await ctx.params;
  const user = userBySlug(username);
  if (!user) return fail("That user doesn't exist.", 404);

  const d = db();
  const memes = d.memes
    .filter((m) => m.creator_id === user.id && m.status === "live")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((m) => memeView(m, viewer?.id));

  const holdings = d.holdings
    .filter((h) => h.user_id === user.id && h.quantity > 1e-9)
    .map((h) => {
      const meme = d.memes.find((m) => m.id === h.meme_id)!;
      const current_value = h.quantity * meme.current_price;
      return {
        meme: memeView(meme, viewer?.id),
        quantity: h.quantity,
        invested_amount: Math.round(h.invested_amount * 10) / 10,
        current_value: Math.round(current_value * 10) / 10,
        pnl: Math.round((current_value - h.invested_amount) * 10) / 10,
        pnl_pct: h.invested_amount > 0 ? ((current_value - h.invested_amount) / h.invested_amount) * 100 : 0,
      };
    })
    .sort((a, b) => b.current_value - a.current_value);

  const achievements = d.user_achievements
    .filter((ua) => ua.user_id === user.id)
    .map((ua) => ({ ...ua, achievement: d.achievements.find((a) => a.id === ua.achievement_id)! }))
    .filter((x) => x.achievement);

  const myCalls = d.calls.filter((c) => c.user_id === user.id && c.status !== "open");
  const callsWon = myCalls.filter((c) => c.status === "won").length;

  const txs = d.transactions
    .filter((t) => t.user_id === user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20)
    .map((t) => ({ ...t, meme: memeView(d.memes.find((m) => m.id === t.meme_id)!, viewer?.id) }));

  const sells = d.transactions.filter((t) => t.user_id === user.id && t.type === "sell");
  const wins = sells.filter((t) => (t.realized_pnl ?? 0) > 0).length;

  const { biggest_w, biggest_l } = biggestWinsLosses(user.id);

  return ok({
    user: publicUser(user, viewer?.id),
    prediction_iq: predictionIQ(user.id),
    rank: rankOf(user.id),
    win_rate: sells.length > 0 ? (wins / sells.length) * 100 : null,
    call_record: { total: myCalls.length, won: callsWon },
    biggest_w,
    biggest_l,
    season: seasonInfo(),
    memes,
    holdings,
    achievements,
    transactions: txs,
    creator_stats: {
      aura_generated: Math.round(memes.reduce((s, m) => s + m.total_invested, 0)),
      investors: new Set(d.holdings.filter((h) => memes.some((m) => m.id === h.meme_id)).map((h) => h.user_id)).size,
      memes: memes.length,
      viral: memes.filter((m) => m.heat.level === "VIRAL" || m.heat.level === "LEGENDARY").length,
    },
    battle_record: {
      wins: memes.reduce((s, m) => s + m.battle_wins, 0),
      losses: memes.reduce((s, m) => s + m.battle_losses, 0),
    },
  });
}
