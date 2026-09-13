// marketService — the single source of truth for AURA's virtual pricing engine.
// Deterministic, demand-based, server-authoritative. The client never computes
// prices or mutates balances; everything flows through here.
import { db, save, persistNow, uid } from "./db";
import { pushNotification, unlock } from "./notify";
import { addXpAndAura } from "./progression";
import type { Meme, MemeLabel, PricePoint, Profile, Holding, Transaction, Heat, HeatLevel, AuraCall } from "../types";

export const INITIAL_PRICE = 20;      // every meme launches at ✦20
export const SELL_SPREAD = 0.96;      // 4% sell spread keeps churn honest
export const PRICE_FLOOR = 1;         // memes can fall to ✦1
export const MIN_INVEST = 1;          // one double-tap = ✦1
export const BATTLE_STAKE = 5;        // fixed battle stake
export const CALL_REWARD = 5;         // aura for a won call
const HOUR = 3600_000;
const DAY = 24 * HOUR;

// ---- pricing ----------------------------------------------------------
// Concave curve: early Aura moves the price a lot, late Aura moves it less.
export function priceFromNet(net: number): number {
  const base = 1 + Math.max(0, net) / 120;
  const p = INITIAL_PRICE * Math.pow(base, 0.6);
  return Math.max(PRICE_FLOOR, Math.round(p * 10) / 10);
}

// ---- mutations --------------------------------------------------------
export interface TradeResult {
  transaction: Transaction;
  holding: Holding;
  meme: Meme;
  user: Profile;
}

// naive in-memory idempotency for double-tap bursts
const seenClientIds = new Map<string, number>();
export function isDuplicate(userId: string, clientId: string | undefined): boolean {
  if (!clientId) return false;
  const key = `${userId}:${clientId}`;
  if (seenClientIds.has(key)) return true;
  seenClientIds.set(key, Date.now());
  if (seenClientIds.size > 2000) {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [k, t] of seenClientIds) if (t < cutoff) seenClientIds.delete(k);
  }
  return false;
}

export function applyBuy(user: Profile, meme: Meme, amount: number): TradeResult {
  const d = db();
  amount = Math.floor(amount);
  if (!(amount >= MIN_INVEST)) throw new TradeError(`Minimum investment is ✦${MIN_INVEST}.`);
  if (amount > user.aura_balance) throw new TradeError("Not enough Aura.");
  if (meme.status !== "live") throw new TradeError("That meme is no longer available.");

  const price = meme.current_price;
  const units = amount / price;
  user.aura_balance -= amount;

  meme.net_invested += amount;
  meme.total_invested += amount;
  meme.volume_24h += amount;
  meme.current_price = priceFromNet(meme.net_invested);
  meme.all_time_high = Math.max(meme.all_time_high, meme.current_price);
  meme.updated_at = new Date().toISOString();

  const now = new Date().toISOString();
  let holding = d.holdings.find((h) => h.user_id === user.id && h.meme_id === meme.id);
  if (!holding) {
    holding = {
      id: uid(), user_id: user.id, meme_id: meme.id, quantity: 0,
      invested_amount: 0, avg_entry_price: 0, realized_pnl: 0,
      last_notif_value: 0, last_notif_at: 0, created_at: now, updated_at: now,
    };
    d.holdings.push(holding);
  }
  const newQty = holding.quantity + units;
  holding.avg_entry_price =
    (holding.avg_entry_price * holding.quantity + price * units) / newQty;
  holding.quantity = newQty;
  holding.invested_amount += amount;
  holding.updated_at = now;

  const tx: Transaction = {
    id: uid(), user_id: user.id, meme_id: meme.id, type: "buy",
    units, price, total_value: amount, realized_pnl: null, cost_basis: null, created_at: now,
  };
  d.transactions.push(tx);

  pushLivePoint(meme, amount);
  save();
  return { transaction: tx, holding, meme, user };
}

export function applySell(user: Profile, meme: Meme, units: number): TradeResult {
  const d = db();
  const holding = d.holdings.find((h) => h.user_id === user.id && h.meme_id === meme.id);
  if (!holding || holding.quantity <= 1e-9)
    throw new TradeError("You don't own a position in this meme.");
  if (!(units > 0) || units > holding.quantity + 1e-9)
    throw new TradeError("You don't own enough of this meme to sell that amount.");
  if (meme.status !== "live") throw new TradeError("That meme is no longer available.");

  const price = meme.current_price;
  const proceeds = round1(units * price * SELL_SPREAD);
  const costBasis = round1(units * holding.avg_entry_price);
  const pnl = round1(proceeds - costBasis);

  user.aura_balance = round1(user.aura_balance + proceeds);
  holding.quantity -= units;
  holding.invested_amount = round1(Math.max(0, holding.invested_amount - costBasis));
  holding.realized_pnl = round1(holding.realized_pnl + pnl);
  holding.updated_at = new Date().toISOString();

  meme.net_invested = Math.max(-800_000, meme.net_invested - proceeds);
  meme.total_sell_value += proceeds;
  meme.volume_24h += proceeds;
  meme.current_price = priceFromNet(meme.net_invested);
  meme.updated_at = new Date().toISOString();

  const tx: Transaction = {
    id: uid(), user_id: user.id, meme_id: meme.id, type: "sell",
    units, price, total_value: proceeds, realized_pnl: pnl, cost_basis: costBasis,
    created_at: new Date().toISOString(),
  };
  d.transactions.push(tx);

  // PERFECT EXIT — sold within 5% of the meme's all-time high
  if (meme.all_time_high > 0 && price >= meme.all_time_high * 0.95) {
    unlock(user.id, "perfect-exit");
  }

  pushLivePoint(meme, proceeds);
  save();
  return { transaction: tx, holding, meme, user };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export class TradeError extends Error {}

// ---- derived metrics --------------------------------------------------
export function change24h(meme: Meme): number {
  if (meme.open_price_24h <= 0) return 0;
  return ((meme.current_price - meme.open_price_24h) / meme.open_price_24h) * 100;
}
export function changeAll(meme: Meme): number {
  return ((meme.current_price - meme.initial_price) / meme.initial_price) * 100;
}

export function labelFor(meme: Meme): MemeLabel | null {
  const ageH = (Date.now() - new Date(meme.created_at).getTime()) / HOUR;
  const c24 = change24h(meme);
  const ratio = meme.current_price / meme.initial_price;
  if (ageH < 48) return "FRESH";
  if (c24 > 80) return "EXPLODING";
  if (c24 > 15) return "RISING";
  if (c24 < -35) return "CRASHING";
  if (c24 < -8) return "COOLING";
  if (ratio < 2.2 && meme.volume_24h > 60) return "UNDERVALUED";
  if (meme.dna.humor > 75 && changeAll(meme) > 120) return "SMART_PICK";
  if (ageH < 96 && c24 > 2) return "EARLY";
  return null;
}

export function investorCount(memeId: string): number {
  return db().holdings.filter((h) => h.meme_id === memeId && h.quantity > 1e-9).length;
}

// ---- Meme Heat: velocity over volume ----------------------------------
const HEAT_LEVELS: Array<{ min: number; level: HeatLevel }> = [
  { min: 80, level: "LEGENDARY" },
  { min: 60, level: "VIRAL" },
  { min: 38, level: "HOT" },
  { min: 18, level: "WARM" },
  { min: -1, level: "COLD" },
];

export function heatOf(meme: Meme, commentCount = 0): Heat {
  const ageH = Math.max(1, (Date.now() - new Date(meme.created_at).getTime()) / HOUR);
  const velocity = change24h(meme);                       // growth rate — the most important signal
  const velocityAbs = Math.max(0, velocity);
  const investVelocity = meme.volume_24h / Math.max(1, meme.current_price); // trades relative to size
  const newInvestors = investorCount(meme.id);
  let score = 0;
  score += Math.min(25, Math.abs(meme.momentum) * 18 + (meme.momentum > 0 ? 7 : 0));
  score += Math.min(25, velocityAbs * 0.35);
  score += Math.min(18, Math.log10(1 + meme.volume_24h) * 6.5);
  score += Math.min(10, Math.log10(1 + meme.views) * 2.6);
  score += Math.min(9, Math.log10(1 + newInvestors * 4) * 3.4);
  score += Math.min(8, Math.log10(1 + commentCount * 3) * 3.6);
  score += Math.min(6, Math.log10(1 + meme.saves) * 2.6);
  score += Math.min(8, investVelocity * 2.2);
  score -= Math.min(10, ageH / 72);                       // old silence cools
  score = Math.max(0, Math.round(score));
  const level = HEAT_LEVELS.find((h) => score >= h.min)!.level;
  return { level, score };
}

// ---- graveyard ---------------------------------------------------------
const EPITAPHS = [
  "Everyone thought this would moon.",
  "The group chat lied.",
  "Bought the top. Held the bag.",
  "It had one good day.",
  "Heat: gone. Aura: gone. Dignity: pending.",
  "This was someone's 10x, in their dreams.",
  "The chart spoke. Nobody listened.",
  "Peak comedy, peak price, then physics happened.",
  "Diamond hands, paper meme.",
  "RIP to a real one.",
];

export function graveyardCandidates() {
  return db().memes
    .filter((m) => {
      if (m.status === "removed") return true;
      const drawdown = m.all_time_high > 0 ? m.all_time_high / Math.max(1, m.current_price) : 1;
      return m.current_price <= 6 || drawdown >= 3;
    })
    .sort((a, b) => {
      const da = a.all_time_high / Math.max(1, a.current_price);
      const dbb = b.all_time_high / Math.max(1, b.current_price);
      return dbb - da;
    })
    .slice(0, 24);
}

export function epitaphFor(memeId: string): string {
  const meme = db().memes.find((m) => m.id === memeId);
  if (meme?.epitaph) return meme.epitaph;
  const idx = Math.abs(hashStr(memeId)) % EPITAPHS.length;
  const e = EPITAPHS[idx];
  if (meme) meme.epitaph = e;
  return e;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// ---- AURA Calls --------------------------------------------------------
export function makeCall(user: Profile, meme: Meme, target: "VIRAL" | "FLOP"): AuraCall {
  const d = db();
  const existing = d.calls.find((c) => c.user_id === user.id && c.meme_id === meme.id && c.status === "open");
  if (existing) throw new TradeError("You already have an open call on this meme.");
  const call: AuraCall = {
    id: uid(), user_id: user.id, meme_id: meme.id, target,
    price_at_call: meme.current_price, status: "open",
    resolves_at: new Date(Date.now() + 7 * DAY).toISOString(),
    created_at: new Date().toISOString(),
  };
  d.calls.push(call);
  pushNotification(user.id, "call_won", target === "VIRAL" ? "📣 Call placed: VIRAL" : "📣 Call placed: FLOP",
    `"${meme.caption}" — resolves in 7 days at ✦${call.price_at_call}.`, meme.id);
  save();
  return call;
}

function resolveDueCalls(now: number) {
  const d = db();
  for (const call of d.calls) {
    if (call.status !== "open" || new Date(call.resolves_at).getTime() > now) continue;
    const meme = d.memes.find((m) => m.id === call.meme_id);
    if (!meme) { call.status = "lost"; continue; }
    const change = (meme.current_price - call.price_at_call) / call.price_at_call;
    const won = call.target === "VIRAL" ? change >= 0.5 : change <= -0.3;
    call.status = won ? "won" : "lost";
    const user = d.users.find((u) => u.id === call.user_id);
    if (user) {
      user.reputation += won ? 5 : -2;
      if (won) {
        addXpAndAura(user, CALL_REWARD, 20);
        pushNotification(user.id, "call_won", "📣 CALL WON", `Your ${call.target} call on "${meme.caption}" was right. +✦${CALL_REWARD} and reputation.`, meme.id);
      } else {
        pushNotification(user.id, "call_lost", "📣 Call missed", `Your ${call.target} call on "${meme.caption}" didn't land. Rebuild the reputation.`, meme.id);
      }
    }
  }
}

// ---- Battles: stake Aura on which one moons -----------------------------
export function placeStake(user: Profile, battleId: string, side: "a" | "b") {
  const d = db();
  const battle = d.battles.find((b) => b.id === battleId && b.status === "open");
  if (!battle) throw new TradeError("That battle already ended.");
  const memeA = d.memes.find((m) => m.id === battle.meme_a_id)!;
  const memeB = d.memes.find((m) => m.id === battle.meme_b_id)!;
  if (memeA.creator_id === user.id || memeB.creator_id === user.id)
    throw new TradeError("You can't stake on your own meme.");
  if (user.aura_balance < BATTLE_STAKE) throw new TradeError("Not enough Aura.");
  const all = [...battle.stakes_a, ...battle.stakes_b];
  if (all.some((s) => s.user_id === user.id)) throw new TradeError("You already staked in this battle.");

  user.aura_balance = round1(user.aura_balance - BATTLE_STAKE);
  (side === "a" ? battle.stakes_a : battle.stakes_b).push({
    user_id: user.id, amount: BATTLE_STAKE, created_at: new Date().toISOString(),
  });
  save();
}

function resolveDueBattles(now: number) {
  const d = db();
  const pool = d.memes.filter((m) => m.status === "live");
  for (const battle of d.battles) {
    if (battle.status !== "open") continue;
    const totalStakes = battle.stakes_a.length + battle.stakes_b.length;
    const age = now - new Date(battle.created_at).getTime();
    if (totalStakes < 10 && age < DAY) continue;

    const memeA = d.memes.find((m) => m.id === battle.meme_a_id)!;
    const memeB = d.memes.find((m) => m.id === battle.meme_b_id)!;
    const growthA = (memeA.current_price - battle.price_a_at_start) / battle.price_a_at_start;
    const growthB = (memeB.current_price - battle.price_b_at_start) / battle.price_b_at_start;
    const winner = growthA >= growthB ? memeA : memeB;
    const loser = growthA >= growthB ? memeB : memeA;
    battle.status = "resolved";
    battle.winner_id = winner.id;
    winner.battle_wins += 1;
    loser.battle_losses += 1;

    // winners split the whole pot proportionally to their stake (zero-sum PvP)
    const pot = round1([...battle.stakes_a, ...battle.stakes_b].reduce((s, st) => s + st.amount, 0));
    const winners = growthA >= growthB ? battle.stakes_a : battle.stakes_b;
    const winnerTotal = winners.reduce((s, st) => s + st.amount, 0) || 1;
    for (const st of winners) {
      const payout = Math.floor((st.amount / winnerTotal) * pot * 100) / 100; // house keeps dust
      const u = d.users.find((x) => x.id === st.user_id);
      if (!u) continue;
      u.aura_balance = round1(u.aura_balance + payout);
      u.reputation += 10;
      addXpAndAura(u, 0, 15);
      pushNotification(u.id, "battle_win", "⚔️ BATTLE WON", `Your pick "${winner.caption}" mooned. Payout ✦${payout}.`, winner.id);
    }

    const wCreator = d.users.find((u) => u.id === winner.creator_id);
    if (wCreator) pushNotification(wCreator.id, "battle_win", "⚔️ Your meme won a Battle", `"${winner.caption}" took the ${battle.category} crown.`, winner.id);

    // open a fresh battle
    if (pool.length > 4) {
      const ma = pool[Math.floor(Math.random() * pool.length)];
      let mb = pool[Math.floor(Math.random() * pool.length)];
      let guard = 0;
      while ((mb.id === ma.id || ma.creator_id === mb.creator_id) && guard++ < 20) mb = pool[Math.floor(Math.random() * pool.length)];
      if (ma.id !== mb.id)
        d.battles.push({
          id: uid(), category: ["funniest", "most relatable", "best remix", "most chaotic", "best original"][Math.floor(Math.random() * 5)],
          meme_a_id: ma.id, meme_b_id: mb.id, status: "open", winner_id: null,
          stakes_a: [], stakes_b: [], price_a_at_start: ma.current_price, price_b_at_start: mb.current_price,
          created_at: new Date().toISOString(),
        });
    }
  }
}

// ---- price history ----------------------------------------------------
export function pushLivePoint(meme: Meme, volumeDelta: number) {
  const d = db();
  const hist = d.price_history[meme.id] ?? (d.price_history[meme.id] = []);
  const now = Date.now();
  const last = hist[hist.length - 1];
  if (last && now - last.t < 60_000) {
    last.p = meme.current_price;
    last.v += volumeDelta;
  } else {
    hist.push({ t: now, p: meme.current_price, v: volumeDelta });
  }
  if (hist.length > 300) hist.splice(0, hist.length - 300);
}

export function getSeries(memeId: string, range: "1H" | "24H" | "7D" | "30D" | "ALL"): PricePoint[] {
  const hist = db().price_history[memeId] ?? [];
  const now = Date.now();
  const spans: Record<string, number> = { "1H": HOUR, "24H": DAY, "7D": 7 * DAY, "30D": 30 * DAY, ALL: Infinity };
  const span = spans[range];
  const from = span === Infinity ? 0 : now - span;
  const pts = hist.filter((p) => p.t >= from);
  const stride = Math.max(1, Math.ceil(pts.length / 240));
  const out: PricePoint[] = [];
  for (let i = 0; i < pts.length; i += stride) out.push(pts[i]);
  const meme = db().memes.find((m) => m.id === memeId);
  if (meme && (!out.length || out[out.length - 1].t < now - 60_000))
    out.push({ t: now, p: meme.current_price, v: 0 });
  return out;
}

// ---- the pulse: simulated market activity ------------------------------
const TICK_MS = 45_000;
const MAX_CATCHUP = 40;

export function ensureMarketFresh() {
  const d = db();
  const now = Date.now();
  let last = d.meta?.last_tick ?? now;
  if (now - last < TICK_MS) return;
  let ticks = 0;
  while (now - last >= TICK_MS && ticks < MAX_CATCHUP) {
    runTick(new Date(last + TICK_MS));
    last += TICK_MS;
    ticks++;
  }
  d.meta.last_tick = last;
  persistNow();
}

function runTick(at: Date) {
  const d = db();
  d.meta.tick_count = (d.meta.tick_count ?? 0) + 1;
  const nowMs = at.getTime();

  for (const meme of d.memes) {
    if (meme.status !== "live") continue;
    const noise = Math.random() * 2 - 1;
    const ratio = meme.current_price / meme.initial_price;

    let momentum = meme.momentum * 0.9 + noise * 0.22;
    if (ratio > 10) momentum -= 0.08;
    if (meme.current_price <= PRICE_FLOOR * 1.2) momentum += 0.15;
    meme.momentum = Math.max(-1, Math.min(1, momentum));

    const scale = Math.max(0.6, meme.current_price / 30);
    const drift = Math.round(meme.momentum * 14 * scale * 10) / 10 + Math.round(noise * 5 * scale * 10) / 10;
    meme.net_invested = round1(meme.net_invested + drift);
    meme.current_price = priceFromNet(meme.net_invested);
    meme.all_time_high = Math.max(meme.all_time_high, meme.current_price);
    meme.volume_24h = round1(meme.volume_24h * 0.995);
    meme.updated_at = at.toISOString();

    const hist = d.price_history[meme.id] ?? (d.price_history[meme.id] = []);
    const lastPt = hist[hist.length - 1];
    if (lastPt && nowMs - lastPt.t < 60_000) lastPt.p = meme.current_price;
    else hist.push({ t: nowMs, p: meme.current_price, v: 0 });
    if (hist.length > 300) hist.splice(0, hist.length - 300);

    const dayAgo = nowMs - DAY;
    let open = meme.open_price_24h;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i].t <= dayAgo) { open = hist[i].p; break; }
      open = hist[i].p;
    }
    meme.open_price_24h = open;
  }

  resolveDueCalls(nowMs);
  resolveDueBattles(nowMs);
  behaviorAchievements(nowMs);
  generateTickNotifications();
  save();
}

// DIAMOND HANDS — held through a crash of ≥40% from entry, still holding
// CALLED THE TOP — sold, then the price dropped ≥30% within 24h
function behaviorAchievements(nowMs: number) {
  const d = db();
  for (const h of d.holdings) {
    if (h.quantity <= 1e-9) continue;
    const held = nowMs - new Date(h.created_at).getTime();
    if (held < 3 * DAY) continue;
    if (h.avg_entry_price > 0) {
      const meme = d.memes.find((m) => m.id === h.meme_id);
      if (meme && meme.current_price <= h.avg_entry_price * 0.6) unlock(h.user_id, "diamond-hands");
    }
  }
  const sells = d.transactions.filter(
    (t) => t.type === "sell" && nowMs - new Date(t.created_at).getTime() < DAY
  );
  for (const s of sells) {
    const meme = d.memes.find((m) => m.id === s.meme_id);
    if (meme && meme.current_price <= s.price * 0.7) unlock(s.user_id, "called-the-top");
  }
}

function generateTickNotifications() {
  const d = db();
  const now = Date.now();
  const COOLDOWN = 6 * HOUR;
  for (const h of d.holdings) {
    if (h.quantity <= 1e-9) continue;
    const meme = d.memes.find((m) => m.id === h.meme_id);
    if (!meme || meme.status !== "live") continue;
    const value = h.quantity * meme.current_price;
    const gainPct = h.last_notif_value > 0 ? ((value - h.last_notif_value) / h.last_notif_value) * 100 : 0;
    if (now - h.last_notif_at < COOLDOWN) continue;
    const c24 = change24h(meme);
    if (c24 > 30 && gainPct > 12) {
      pushNotification(h.user_id, "pick_up", "🚀 Your pick is exploding", `"${trim(meme.caption)}" is up ${c24.toFixed(0)}% today. Position: ✦${round1(value)}`, meme.id);
      h.last_notif_value = value; h.last_notif_at = now;
    } else if (c24 < -20 && gainPct < -8) {
      pushNotification(h.user_id, "pick_down", "📉 Your pick is losing Aura", `"${trim(meme.caption)}" is down ${Math.abs(c24).toFixed(0)}% today. Hold or sell?`, meme.id);
      h.last_notif_value = value; h.last_notif_at = now;
    }
  }
}

function trim(s: string, n = 42) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

// ---- market overview ---------------------------------------------------
export function marketStats() {
  const d = db();
  const live = d.memes.filter((m) => m.status === "live");
  const auraInCirculation = d.users.reduce((s, u) => s + u.aura_balance, 0);
  const investedTotal = d.holdings.reduce((s, h) => s + (h.quantity > 1e-9 ? h.quantity * (d.memes.find((m) => m.id === h.meme_id)?.current_price ?? 0) : 0), 0);
  const activeInvestors = new Set(d.holdings.filter((h) => h.quantity > 1e-9).map((h) => h.user_id)).size;
  const tradedToday = live.filter((m) => m.volume_24h > 0).length;
  const sortedByChange = [...live].sort((a, b) => change24h(b) - change24h(a));
  return {
    aura_in_circulation: round1(auraInCirculation),
    invested_total: round1(investedTotal),
    active_investors: activeInvestors,
    memes_traded_today: tradedToday,
    biggest_gainer: sortedByChange[0]?.id ?? null,
    biggest_loser: sortedByChange[sortedByChange.length - 1]?.id ?? null,
    meme_count: live.length,
    user_count: d.users.length,
  };
}
