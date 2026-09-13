import { db } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { memeView } from "@/lib/server/views";
import { round1 } from "@/lib/server/market";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const d = db();

  const holdings = d.holdings
    .filter((h) => h.user_id === user.id && h.quantity > 1e-9 && d.memes.some((m) => m.id === h.meme_id))
    .map((h) => {
      const meme = d.memes.find((m) => m.id === h.meme_id)!;
      const current_value = h.quantity * meme.current_price;
      return {
        meme: memeView(meme, user.id),
        quantity: h.quantity,
        invested_amount: round1(h.invested_amount),
        avg_entry_price: round1(h.avg_entry_price),
        current_value: round1(current_value),
        pnl: round1(current_value - h.invested_amount),
        pnl_pct: h.invested_amount > 0 ? ((current_value - h.invested_amount) / h.invested_amount) * 100 : 0,
        day_pnl: round1(h.quantity * (meme.current_price - meme.open_price_24h)),
        created_at: h.created_at,
      };
    });

  const invested_value = holdings.reduce((s, h) => s + h.current_value, 0);
  const invested_cost = holdings.reduce((s, h) => s + h.invested_amount, 0);
  const today_pnl = holdings.reduce((s, h) => s + h.day_pnl, 0);

  const myTxs = d.transactions
    .filter((t) => t.user_id === user.id && d.memes.some((m) => m.id === t.meme_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const sells = myTxs.filter((t) => t.type === "sell");
  const wins = sells.filter((t) => (t.realized_pnl ?? 0) > 0).length;
  const closed = sells.length;
  const best = sells.reduce((b, t) => ((t.realized_pnl ?? 0) > (b?.realized_pnl ?? -Infinity) ? t : b), sells[0]);
  const worst = sells.reduce((w, t) => ((t.realized_pnl ?? 0) < (w?.realized_pnl ?? Infinity) ? t : w), sells[0]);

  const view = (t: typeof myTxs[number]) => ({
    ...t,
    meme: memeView(d.memes.find((m) => m.id === t.meme_id)!, user.id),
  });

  return ok({
    balance: user.aura_balance,
    invested_value: round1(invested_value),
    invested_cost: round1(invested_cost),
    total_aura: round1(user.aura_balance + invested_value),
    today_pnl,
    overall_return_pct: invested_cost > 0 ? ((invested_value - invested_cost) / invested_cost) * 100 : 0,
    win_rate: closed > 0 ? (wins / closed) * 100 : null,
    closed_trades: closed,
    realized_pnl: round1(sells.reduce((s, t) => s + (t.realized_pnl ?? 0), 0)),
    best_tx: best ? { ...view(best), pnl: best.realized_pnl } : null,
    worst_tx: worst ? { ...view(worst), pnl: worst.realized_pnl } : null,
    holdings,
    transactions: myTxs.slice(0, 60).map(view),
  });
}
