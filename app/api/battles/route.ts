import { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { memeView } from "@/lib/server/views";
import { placeStake, TradeError, BATTLE_STAKE } from "@/lib/server/market";

// MEME BATTLE — WHICH ONE MOONS? Stake ✦5 on your prediction; winners split the pot.
export async function GET() {
  const user = await requireUser();
  const d = db();
  const open = d.battles.filter((b) => b.status === "open");
  const battle = open.length ? open[Math.floor(Date.now() / 30_000) % open.length] : null;
  if (!battle) return ok({ battle: null, recent: [] });

  const a = d.memes.find((m) => m.id === battle.meme_a_id);
  const b = d.memes.find((m) => m.id === battle.meme_b_id);
  if (!a || !b) return ok({ battle: null, recent: [] });

  const recent = d.battles.filter((x) => x.status === "resolved").slice(-5).map((x) => {
    const wa = d.memes.find((m) => m.id === x.meme_a_id)!;
    const wb = d.memes.find((m) => m.id === x.meme_b_id)!;
    return {
      id: x.id, category: x.category, winner: x.winner_id,
      winner_caption: x.winner_id === wa.id ? wa.caption : wb.caption,
      stakes_a: x.stakes_a.length, stakes_b: x.stakes_b.length,
    };
  });

  const myStake = user
    ? [...battle.stakes_a.map((s) => ({ ...s, side: "a" as const })), ...battle.stakes_b.map((s) => ({ ...s, side: "b" as const }))].find((s) => s.user_id === user.id) ?? null
    : null;

  return ok({
    battle: {
      id: battle.id, category: battle.category,
      meme_a: memeView(a, user?.id), meme_b: memeView(b, user?.id),
      stakes_a: battle.stakes_a.length, stakes_b: battle.stakes_b.length,
      pot: [...battle.stakes_a, ...battle.stakes_b].reduce((s, x) => s + x.amount, 0),
      my_stake: myStake?.side ?? null,
      stake_cost: BATTLE_STAKE,
    },
    recent,
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const body = await req.json();
  const side = String(body.side) === "b" ? "b" : "a";
  const battleId = String(body.battle_id ?? "");
  try {
    placeStake(user, battleId, side);
    const d = db();
    const battle = d.battles.find((x) => x.id === battleId)!;
    return ok({
      staked: side,
      stakes_a: battle.stakes_a.length,
      stakes_b: battle.stakes_b.length,
      balance: user.aura_balance,
      total_stakes: battle.stakes_a.length + battle.stakes_b.length,
      meme_a: memeView(d.memes.find((m) => m.id === battle.meme_a_id)!, user.id),
      meme_b: memeView(d.memes.find((m) => m.id === battle.meme_b_id)!, user.id),
    });
  } catch (e) {
    if (e instanceof TradeError) return fail(e.message);
    return fail("Something went wrong. Your Aura was not changed.");
  }
}
