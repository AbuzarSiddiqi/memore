import { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { ok, fail, humanError, requireUser, rateLimit } from "@/lib/server/http";
import { applyBuy, isDuplicate, TradeError } from "@/lib/server/market";
import { memeView, positionFor } from "@/lib/server/views";
import { pushNotification } from "@/lib/server/notify";
import { trackMission } from "@/lib/server/progression";

// Invest endpoint — powers both the sheet (arbitrary amounts) and the
// double-tap interaction (amount: 1). Fully server-authoritative.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return fail("Log in first.", 401);
    if (!rateLimit(`trade:${user.id}`, 240, 60_000)) return fail("Slow down — too many trades per minute.", 429);
    const { id } = await ctx.params;
    const meme = db().memes.find((m) => m.id === id && m.status === "live");
    if (!meme) return fail("That meme is no longer available.", 404);
    const body = await req.json();
    const clientId = body.client_id ? String(body.client_id) : undefined;
    if (isDuplicate(user.id, clientId)) {
      return ok({ invested: 0, duplicate: true, price: meme.current_price, balance: user.aura_balance, position: positionFor(user.id, meme.id), meme: memeView(meme, user.id) });
    }
    const amount = Math.floor(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) return fail("Enter a valid amount of Aura.");

    const ageH = (Date.now() - new Date(meme.created_at).getTime()) / 3_600_000;
    const result = applyBuy(user, meme, amount);
    trackMission(user.id, "invest", meme.id);
    if (ageH < 48) trackMission(user.id, "early", meme.id);

    // Asynchronously sync trade to Supabase Cloud
    const { syncHoldingToSupabase, syncTransactionToSupabase, syncMemeToSupabase } = await import("@/lib/server/sync");
    void syncHoldingToSupabase(result.holding, user.aura_balance);
    void syncTransactionToSupabase(result.transaction);
    void syncMemeToSupabase(meme);

    if (meme.creator_id !== user.id) {
      pushNotification(meme.creator_id, "invest_made", `✦ ${amount} invested in your meme`, `${user.username} believes in "${meme.caption}".`, meme.id);
    }
    return ok({
      invested: amount,
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
