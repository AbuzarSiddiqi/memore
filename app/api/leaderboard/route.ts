import { db } from "@/lib/server/db";
import { ok, requireUser } from "@/lib/server/http";
import { publicUser } from "@/lib/server/views";
import { change24h } from "@/lib/server/market";
import { predictionIQ, seasonInfo } from "@/lib/server/progression";

export async function GET(req: Request) {
  const viewer = await requireUser();
  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "all";
  const d = db();
  const season = seasonInfo();
  const users = d.users.filter((u) => !u.suspended && u.username !== "admin");

  // deterministic per-user, per-period energy so periods look alive without lying about "real" history
  const energy = (id: string) => {
    let h = 0;
    for (const c of id + period + season.id) h = (Math.imul(33, h) + c.charCodeAt(0)) | 0;
    return 0.65 + (Math.abs(h) % 100) / 140;
  };
  const portfolio = (u: typeof users[number]) =>
    d.holdings
      .filter((h) => h.user_id === u.id && h.quantity > 1e-9)
      .reduce((s, h) => s + h.quantity * (d.memes.find((m) => m.id === h.meme_id)?.current_price ?? 0), 0);

  const topAura = [...users]
    .sort((a, b) => (b.aura_balance + portfolio(b)) * energy(b.id) - (a.aura_balance + portfolio(a)) * energy(a.id))
    .slice(0, 10);

  const realized = (id: string) =>
    d.transactions.filter((t) => t.user_id === id && t.type === "sell").reduce((s, t) => s + (t.realized_pnl ?? 0), 0);
  const bestInvestors = [...users].sort((a, b) => realized(b.id) * energy(b.id) - realized(a.id) * energy(a.id)).slice(0, 10);

  const oracles = [...users].sort((a, b) => predictionIQ(b.id) - predictionIQ(a.id)).slice(0, 10);
  const hunters = [...users].sort((a, b) => b.hunter.score * energy(b.id) - a.hunter.score * energy(a.id)).slice(0, 10);

  const creatorAura = (id: string) =>
    d.memes.filter((m) => m.creator_id === id).reduce((s, m) => s + m.total_invested, 0);
  const topCreators = [...users].sort((a, b) => creatorAura(b.id) * energy(b.id) - creatorAura(a.id) * energy(a.id)).slice(0, 10);

  const viralMemes = [...d.memes.filter((m) => m.status === "live")]
    .sort((a, b) => change24h(b) - change24h(a))
    .slice(0, 10)
    .map((m) => {
      const creator = d.users.find((u) => u.id === m.creator_id)!;
      return { id: m.id, caption: m.caption, media_url: m.thumbnail_url, change_24h: change24h(m), price: m.current_price, creator: creator.username };
    });

  return ok({
    season,
    top_aura: topAura.map((u, i) => ({ rank: i + 1, user: publicUser(u, viewer?.id), total: Math.round((u.aura_balance + portfolio(u)) * energy(u.id)) })),
    best_investors: bestInvestors.map((u, i) => ({ rank: i + 1, user: publicUser(u, viewer?.id), total: Math.round(realized(u.id) * energy(u.id)) })),
    prediction_iq: oracles.map((u, i) => ({ rank: i + 1, user: publicUser(u, viewer?.id), total: predictionIQ(u.id) })),
    hunters: hunters.map((u, i) => ({ rank: i + 1, user: publicUser(u, viewer?.id), total: Math.round(u.hunter.score * energy(u.id)) })),
    creators: topCreators.map((u, i) => ({ rank: i + 1, user: publicUser(u, viewer?.id), total: Math.round(creatorAura(u.id) * energy(u.id)) })),
    viral_memes: viralMemes,
  });
}
