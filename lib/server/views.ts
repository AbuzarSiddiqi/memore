// Maps raw DB records into the public API shapes (never leak password hashes).
import { db } from "./db";
import { change24h, changeAll, heatOf, labelFor, round1 } from "./market";
import { predictionIQ, titleFor } from "./progression";
import type { AuraCall, Meme, MemeView, PositionView, Profile, PublicUser } from "../types";

export function publicUser(u: Profile, viewerId?: string | null): PublicUser {
  const d = db();
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    avatar_bg: u.avatar_bg,
    bio: u.bio,
    aura_balance: round1(u.aura_balance),
    reputation: u.reputation,
    level: u.level,
    xp: u.xp,
    role: u.role,
    is_seed: u.is_seed,
    interests: u.interests,
    onboarded: u.onboarded,
    suspended: u.suspended,
    active_reactions: u.active_reactions,
    hunter: u.hunter,
    prediction_iq: predictionIQ(u.id),
    title: titleFor(u.id),
    created_at: u.created_at,
    followers: d.follows.filter((f) => f.following_id === u.id).length,
    following: d.follows.filter((f) => f.follower_id === u.id).length,
    meme_count: d.memes.filter((m) => m.creator_id === u.id && m.status === "live").length,
    is_following: viewerId
      ? d.follows.some((f) => f.follower_id === viewerId && f.following_id === u.id)
      : undefined,
  };
}

export function positionFor(userId: string | null | undefined, memeId: string): PositionView | null {
  if (!userId) return null;
  const h = db().holdings.find((x) => x.user_id === userId && x.meme_id === memeId);
  if (!h || h.quantity <= 1e-9) return null;
  const meme = db().memes.find((m) => m.id === memeId)!;
  const current_value = h.quantity * meme.current_price;
  return {
    quantity: round1(h.quantity * 1000) / 1000,
    invested_amount: round1(h.invested_amount),
    avg_entry_price: round1(h.avg_entry_price),
    current_value: round1(current_value),
    pnl: round1(current_value - h.invested_amount),
    pnl_pct: h.invested_amount > 0 ? ((current_value - h.invested_amount) / h.invested_amount) * 100 : 0,
  };
}

// Smart Money: high-Prediction-IQ investors already in this meme
function smartMoneyFor(memeId: string): { legends: number; aura: number } {
  const d = db();
  let legends = 0, aura = 0;
  for (const h of d.holdings) {
    if (h.meme_id !== memeId || h.quantity <= 1e-9) continue;
    if (predictionIQ(h.user_id) >= 75) {
      legends += 1;
      aura += h.quantity * (d.memes.find((m) => m.id === memeId)?.current_price ?? 0);
    }
  }
  return { legends, aura: round1(aura) };
}

function myCallFor(userId: string | null | undefined, memeId: string): MemeView["my_call"] {
  if (!userId) return null;
  const c: AuraCall | undefined = db().calls.find((x) => x.user_id === userId && x.meme_id === memeId);
  if (!c) return null;
  return { target: c.target, status: c.status };
}

// DNA MATCH: cosine similarity of trait vectors, as a %
export function dnaMatch(a: Meme, b: Meme): number {
  const keys = ["humor", "chaos", "relatability", "brainrot", "wholesome", "absurdity"] as const;
  let dot = 0, ma = 0, mb = 0;
  for (const k of keys) {
    dot += a.dna[k] * b.dna[k];
    ma += a.dna[k] * a.dna[k];
    mb += b.dna[k] * b.dna[k];
  }
  if (!ma || !mb) return 0;
  return Math.round((dot / (Math.sqrt(ma) * Math.sqrt(mb))) * 100);
}

export function memeView(m: Meme, viewerId?: string | null): MemeView {
  const d = db();
  const creator = d.users.find((u) => u.id === m.creator_id)!;
  const commentCount = d.comments.filter((c) => c.meme_id === m.id).length;
  // compact sparkline: last 12 sampled history points
  const hist = d.price_history[m.id] ?? [];
  const stride = Math.max(1, Math.floor(hist.length / 12));
  const spark: number[] = [];
  for (let i = Math.max(0, hist.length - 12 * stride); i < hist.length; i += stride) spark.push(hist[i].p);
  if (spark.length < 2) spark.push(m.open_price_24h, m.current_price);
  return {
    ...m,
    creator: publicUser(creator),
    change_24h: change24h(m),
    change_all: changeAll(m),
    investor_count: d.holdings.filter((h) => h.meme_id === m.id && h.quantity > 1e-9).length,
    comment_count: commentCount,
    label: labelFor(m),
    heat: heatOf(m, commentCount),
    smart_money: smartMoneyFor(m.id),
    spark,
    is_saved: viewerId ? d.saved_memes.some((s) => s.user_id === viewerId && s.meme_id === m.id) : undefined,
    my_position: positionFor(viewerId, m.id),
    my_call: myCallFor(viewerId, m.id),
  };
}

export function similarMemes(meme: Meme, viewerId: string | null | undefined, limit = 3): MemeView[] {
  return db().memes
    .filter((m) => m.id !== meme.id && m.status === "live" && m.parent_meme_id !== meme.id && meme.parent_meme_id !== m.id)
    .map((m) => ({ m, match: dnaMatch(meme, m) }))
    .sort((a, b) => b.match - a.match)
    .slice(0, limit)
    .map(({ m, match }) => ({ ...memeView(m, viewerId), dna_match: match }));
}

export function commentView(c: DBComment) {
  const d = db();
  const u = d.users.find((x) => x.id === c.user_id)!;
  return {
    id: c.id, meme_id: c.meme_id, parent_id: c.parent_id, content: c.content,
    created_at: c.created_at,
    user: { id: u.id, username: u.username, display_name: u.display_name, avatar_bg: u.avatar_bg, level: u.level },
  };
}
type DBComment = { id: string; meme_id: string; user_id: string; parent_id: string | null; content: string; created_at: string };
