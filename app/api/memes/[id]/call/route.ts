import { NextRequest } from "next/server";
import { ok, fail, humanError, requireUser, rateLimit } from "@/lib/server/http";
import { db } from "@/lib/server/db";
import { makeCall, TradeError } from "@/lib/server/market";
import { memeView } from "@/lib/server/views";
import { trackMission } from "@/lib/server/progression";

// AURA Calls — publicly predict VIRAL or FLOP, reputation on the line.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return fail("Log in first.", 401);
    if (!rateLimit(`call:${user.id}`, 20, 60 * 60_000)) return fail("Too many calls. The oracle needs rest.", 429);
    const { id } = await ctx.params;
    const meme = db().memes.find((m) => m.id === id && m.status === "live");
    if (!meme) return fail("That meme is no longer available.", 404);
    const body = await req.json();
    const target = String(body.target ?? "").toUpperCase();
    if (target !== "VIRAL" && target !== "FLOP") return fail("Call VIRAL or FLOP.");

    const call = makeCall(user, meme, target);
    trackMission(user.id, "call", meme.id);
    return ok({
      call: { target: call.target, status: call.status, resolves_at: call.resolves_at, price_at_call: call.price_at_call },
      meme: memeView(meme, user.id),
    });
  } catch (e) {
    if (e instanceof TradeError) return fail(e.message);
    return fail(humanError(e), 500);
  }
}
