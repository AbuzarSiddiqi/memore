import { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { ok, fail, humanError, requireUser, rateLimit } from "@/lib/server/http";
import { applySell, TradeError } from "@/lib/server/market";
import { memeView, positionFor } from "@/lib/server/views";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return fail("Log in first.", 401);
    if (!rateLimit(`trade:${user.id}`, 30, 60_000)) return fail("Slow down — too many trades per minute.", 429);
    const { id } = await ctx.params;
    const meme = db().memes.find((m) => m.id === id && m.status === "live");
    if (!meme) return fail("That meme is no longer available.", 404);
    const body = await req.json();

    let units: number;
    if (body.percent != null) {
      const pct = Math.max(0, Math.min(100, Number(body.percent)));
      const holding = db().holdings.find((h) => h.user_id === user.id && h.meme_id === id);
      if (!holding) return fail("You don't own a position in this meme.");
      units = (pct / 100) * holding.quantity;
    } else {
      units = Number(body.units);
    }
    if (!Number.isFinite(units) || units <= 0) return fail("Enter a valid amount to sell.");

    const result = applySell(user, meme, units);

    // Asynchronously sync trade to Supabase Cloud
    const { syncHoldingToSupabase, syncTransactionToSupabase, syncMemeToSupabase } = await import("@/lib/server/sync");
    void syncHoldingToSupabase(result.holding, user.aura_balance);
    void syncTransactionToSupabase(result.transaction);
    void syncMemeToSupabase(meme);

    return ok({
      returned: result.transaction.total_value,
      pnl: result.transaction.realized_pnl,
      price: result.transaction.price,
      balance: user.aura_balance,
      position: positionFor(user.id, meme.id),
      meme: memeView(meme, user.id),
    });
  } catch (e) {
    if (e instanceof TradeError) return fail(e.message);
    return fail(humanError(e), 500);
  }
}
