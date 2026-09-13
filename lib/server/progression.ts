// progression — Prediction IQ, titles, XP, seasons, chaos events, daily missions.
import { db, save, uid } from "./db";
import { pushNotification } from "./notify";
import { changeAll } from "./market";
import type { MissionView, PublicUser, SeasonView, UserDaily, UserTitle } from "../types";

// ---------------------------------------------------------------- XP / aura
export function addXpAndAura(user: { aura_balance: number; xp: number; level: number }, aura: number, xp: number) {
  user.aura_balance = Math.round((user.aura_balance + aura) * 10) / 10;
  user.xp += xp;
  const newLevel = Math.max(1, Math.floor(user.xp / 100) + 1);
  if (newLevel > user.level) user.level = newLevel;
}

// ---------------------------------------------------------------- Prediction IQ
// A second dimension of status: how good are you at predicting meme culture,
// independent of how much Aura you happen to hold.
const iqCache = new Map<string, { tick: number; iq: number }>();

export function predictionIQ(userId: string): number {
  const d = db();
  const cached = iqCache.get(userId);
  if (cached && cached.tick === d.meta.tick_count) return cached.iq;

  const user = d.users.find((u) => u.id === userId);
  if (!user) return 50;

  const myCalls = d.calls.filter((c) => c.user_id === userId && c.status !== "open");
  const wonCalls = myCalls.filter((c) => c.status === "won").length;
  const callAccuracy = myCalls.length >= 3 ? wonCalls / myCalls.length : myCalls.length > 0 ? (wonCalls / myCalls.length) * (myCalls.length / 3) : 0;

  const buys = d.transactions.filter((t) => t.user_id === userId && t.type === "buy");
  const earlyBuys = buys.filter((b) => {
    const meme = d.memes.find((m) => m.id === b.meme_id);
    return meme && b.price <= meme.initial_price * 1.5;
  });
  const earlyRate = buys.length >= 5 ? Math.min(1, earlyBuys.length / Math.max(1, buys.length * 0.5)) : (earlyBuys.length / 5) * 0.5;

  const sells = d.transactions.filter((t) => t.user_id === userId && t.type === "sell");
  const realized = sells.reduce((s, t) => s + (t.realized_pnl ?? 0), 0);
  const costBasis = sells.reduce((s, t) => s + (t.cost_basis ?? 0), 0);
  const roi = costBasis > 0 ? realized / costBasis : 0;
  const returnScore = Math.max(-1, Math.min(1, roi / 2)); // 2x realized ROI maxes this out

  const consistency = Math.min(1, myCalls.length / 12);

  let iq = 40;
  iq += 26 * callAccuracy;
  iq += 16 * earlyRate;
  iq += 18 * (returnScore + 1) / 2;
  iq += 8 * consistency;
  iq = Math.max(3, Math.min(99, Math.round(iq)));

  iqCache.set(userId, { tick: d.meta.tick_count, iq });
  return iq;
}

// ---------------------------------------------------------------- Titles
export function titleFor(userId: string): UserTitle {
  const d = db();
  const user = d.users.find((u) => u.id === userId);
  if (!user) return null;
  const portfolio = d.holdings
    .filter((h) => h.user_id === userId && h.quantity > 1e-9)
    .reduce((s, h) => s + h.quantity * (d.memes.find((m) => m.id === h.meme_id)?.current_price ?? 0), 0);
  if (user.aura_balance + portfolio >= 5000) return "AURA_LEGEND";
  if (predictionIQ(userId) >= 85) return "MEME_ORACLE";
  if (d.user_achievements.some((ua) => ua.user_id === userId && ua.achievement_id === "diamond-hands")) return "DIAMOND_HANDS";
  if (user.hunter.early_discoveries >= 15) return "TREND_HUNTER";
  const worst = d.holdings
    .filter((h) => h.user_id === userId && h.quantity > 1e-9)
    .map((h) => {
      const meme = d.memes.find((m) => m.id === h.meme_id)!;
      return h.invested_amount > 0 ? (h.quantity * meme.current_price - h.invested_amount) / h.invested_amount : 0;
    });
  if (worst.some((r) => r <= -0.6)) return "BAGHOLDER";
  return null;
}

export const TITLE_LABELS: Record<Exclude<UserTitle, null>, { label: string; emoji: string }> = {
  AURA_LEGEND: { label: "AURA LEGEND", emoji: "👑" },
  MEME_ORACLE: { label: "MEME ORACLE", emoji: "🔮" },
  DIAMOND_HANDS: { label: "DIAMOND HANDS", emoji: "💎" },
  TREND_HUNTER: { label: "TREND HUNTER", emoji: "🏹" },
  BAGHOLDER: { label: "BAGHOLDER", emoji: "🛍️" },
};

// ---------------------------------------------------------------- Seasons
const SEASON_START = new Date("2026-08-15").getTime();
const SEASON_LEN = 30 * 86_400_000;
const SEASON_NAMES = ["THE FIRST WAVE", "SECOND SPLASH", "THE GREAT MIGRATION", "BRAINROT RENAISSANCE", " AGE OF LEGENDS"];

export function seasonInfo(now = Date.now()): SeasonView {
  const id = Math.max(1, Math.floor((now - SEASON_START) / SEASON_LEN) + 1);
  const endsAt = SEASON_START + id * SEASON_LEN;
  return { id, name: SEASON_NAMES[(id - 1) % SEASON_NAMES.length], ends_at: new Date(endsAt).toISOString() };
}

// ---------------------------------------------------------------- Chaos events
const EVENTS = [
  { id: "wild", name: "WILD HOUR", emoji: "🌪️", description: "Heat spreads faster. Nothing is safe, everything is signal." },
  { id: "fresh", name: "NEW MEMES ONLY", emoji: "🆕", description: "The feed only shows memes under 48 hours old. Be early or be nothing." },
  { id: "double", name: "DOUBLE XP", emoji: "✌️", description: "All XP earnings doubled while this event runs." },
  { id: "chaos", name: "CHAOS MODE", emoji: "🌀", description: "Your algorithm has been temporarily fired. Again." },
];

export function currentEvent(now = Date.now()) {
  const slot = Math.floor(now / (2 * 86_400_000 / 24)); // rotates every 2 hours
  return { ...EVENTS[slot % EVENTS.length] };
}

export function xpMultiplier(): number {
  return currentEvent().id === "double" ? 2 : 1;
}

// ---------------------------------------------------------------- Daily missions
const DAY_MS = 86_400_000;

function todayKey(userId: string): string {
  return `${userId}:${new Date().toISOString().slice(0, 10)}`;
}

export function dailyFor(userId: string): UserDaily {
  const d = db();
  let rec = d.user_daily.find((u) => u.key === todayKey(userId));
  if (!rec) {
    // prune old days
    d.user_daily = d.user_daily.filter((u) => u.key.endsWith(new Date().toISOString().slice(0, 10)));
    rec = { key: todayKey(userId), views: [], invests: 0, early: 0, remixes: 0, calls: 0, completed: [] };
    d.user_daily.push(rec);
  }
  return rec;
}

export const MISSIONS = [
  { id: "discover5", name: "DISCOVER 5 MEMES", hint: "Open 5 different memes", need: 5, reward: 3, progress: (u: UserDaily) => u.views.length },
  { id: "invest3", name: "INVEST IN 3 MEMES", hint: "Any amount counts — even a double-tap", need: 3, reward: 5, progress: (u: UserDaily) => u.invests },
  { id: "early1", name: "FIND 1 EARLY SIGNAL", hint: "Invest in a meme under 48h old", need: 1, reward: 4, progress: (u: UserDaily) => u.early },
  { id: "remix1", name: "MAKE 1 REMIX", hint: "Remix any meme", need: 1, reward: 5, progress: (u: UserDaily) => u.remixes },
] as const;

export function missionsFor(userId: string): MissionView[] {
  const rec = dailyFor(userId);
  return MISSIONS.map((m) => {
    const progress = Math.min(m.need, m.progress(rec));
    const done = progress >= m.need;
    return {
      id: m.id, name: m.name, hint: m.hint,
      progress, need: m.need, reward: m.reward,
      done: done || rec.completed.includes(m.id),
    };
  });
}

export function trackMission(
  userId: string,
  kind: "view" | "invest" | "early" | "remix" | "call",
  memeId?: string
) {
  const d = db();
  const user = d.users.find((u) => u.id === userId);
  if (!user) return;
  const rec = dailyFor(userId);
  if (kind === "view" && memeId && !rec.views.includes(memeId)) rec.views.push(memeId);
  if (kind === "invest") rec.invests += 1;
  if (kind === "early") rec.early += 1;
  if (kind === "remix") rec.remixes += 1;
  if (kind === "call") rec.calls += 1;

  for (const m of MISSIONS) {
    if (rec.completed.includes(m.id)) continue;
    if (m.progress(rec) >= m.need) {
      rec.completed.push(m.id);
      const mult = xpMultiplier();
      addXpAndAura(user, m.reward, Math.round(10 * mult));
      pushNotification(userId, "mission", `🎯 Mission complete: ${m.name}`, `+✦${m.reward} and +${10 * mult} XP.`, memeId ?? null);
    }
  }
  save();
}

// ---------------------------------------------------------------- rank
export function rankOf(userId: string): number {
  const d = db();
  const worth = (id: string) => {
    const u = d.users.find((x) => x.id === id)!;
    const portfolio = d.holdings
      .filter((h) => h.user_id === id && h.quantity > 1e-9)
      .reduce((s, h) => s + h.quantity * (d.memes.find((m) => m.id === h.meme_id)?.current_price ?? 0), 0);
    return u.aura_balance + portfolio;
  };
  const sorted = [...d.users].sort((a, b) => worth(b.id) - worth(a.id));
  return sorted.findIndex((u) => u.id === userId) + 1;
}

// ---------------------------------------------------------------- biggest W / L
export function biggestWinsLosses(userId: string) {
  const d = db();
  const sells = d.transactions.filter((t) => t.user_id === userId && t.type === "sell" && t.cost_basis && t.cost_basis > 0);
  const withMult = sells.map((t) => ({
    tx: t,
    meme: d.memes.find((m) => m.id === t.meme_id),
    mult: t.total_value / (t.cost_basis ?? 1),
  }));
  const sorted = [...withMult].sort((a, b) => b.mult - a.mult);
  const best = sorted[0] ?? null;
  // only report a Biggest L if it's a genuinely different (losing) trade
  const worstCandidate = sorted[sorted.length - 1] ?? null;
  const worst = worstCandidate && best && worstCandidate.tx.id !== best.tx.id && worstCandidate.mult <= 1 ? worstCandidate : null;
  return {
    biggest_w: best ? { from: best.tx.cost_basis!, to: best.tx.total_value, mult: best.mult, meme: best.meme } : null,
    biggest_l: worst ? { from: worst.tx.cost_basis!, to: worst.tx.total_value, mult: worst.mult, meme: worst.meme } : null,
  };
}
