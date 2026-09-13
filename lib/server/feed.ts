// Feed ranking for every Home tab + Market sections. 70% social, 30% signals.
import { db } from "./db";
import { change24h, changeAll } from "./market";
import { currentEvent, seasonInfo } from "./progression";
import { memeView } from "./views";
import type { EventView, MarketSection, Meme, MemeView, Profile, SeasonView } from "../types";

const DAY = 86_400_000;

function live(): Meme[] {
  return db().memes.filter((m) => m.status === "live").sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function scoreForYou(m: Meme, user: Profile | null): number {
  let s = 0;
  if (user) {
    if (user.interests.includes(m.category)) s += 3;
    if (user.interests.includes("random/chaos")) s += 1;
    const followsCreator = db().follows.some((f) => f.follower_id === user.id && f.following_id === m.creator_id);
    if (followsCreator) s += 2.5;
    if (db().holdings.some((h) => h.user_id === user.id && h.meme_id === m.id)) s += 1.5;
  }
  s += Math.max(-1, Math.min(1.5, m.momentum)) * 2;
  s += Math.min(1.5, change24h(m) / 40);
  const ageDays = (Date.now() - new Date(m.created_at).getTime()) / DAY;
  s += Math.max(0, 1.2 - ageDays / 12);
  s += ((hash(m.id + (user?.id ?? "")) % 100) / 100) * 0.8;
  return s;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function shuffleSeeded<T extends { id: string }>(arr: T[]): T[] {
  const day = Math.floor(Date.now() / DAY);
  return [...arr].sort((a, b) => hash(a.id + day) % 1000 - hash(b.id + day) % 1000);
}

export type FeedTab = "foryou" | "following" | "trending" | "new" | "rising" | "undervalued" | "hunter" | "chaos" | "saved" | "mix";

export function getFeed(tab: FeedTab, page: number, limit: number, user: Profile | null): { memes: MemeView[]; has_more: boolean } {
  const event = currentEvent();
  let list: Meme[];
  switch (tab) {
    case "following": {
      const ids = new Set(db().follows.filter((f) => f.follower_id === user?.id).map((f) => f.following_id));
      list = live().filter((m) => ids.has(m.creator_id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    }
    case "trending":
      list = [...live()].sort((a, b) => heatScore(b) - heatScore(a));
      break;
    case "new":
      list = [...live()].sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    case "rising": {
      const risingList = [...live()].filter((m) => change24h(m) > 6).sort((a, b) => b.momentum - a.momentum);
      list = risingList.length > 0 ? risingList : [...live()].sort((a, b) => b.momentum - a.momentum);
      break;
    }
    case "undervalued": {
      const median = medianPrice();
      const under = [...live()]
        .filter((m) => m.current_price < median && m.volume_24h > 8)
        .sort((a, b) => b.volume_24h / b.current_price - a.volume_24h / a.current_price);
      list = under.length > 0 ? under : [...live()].sort((a, b) => a.current_price - b.current_price);
      break;
    }
    case "hunter": {
      const median = medianPrice();
      const hunted = [...live()]
        .filter((m) => {
          const ageH = (Date.now() - new Date(m.created_at).getTime()) / 3_600_000;
          return ageH < 96 && m.views < 4000 && (m.momentum > 0.15 || change24h(m) > 8) && m.current_price < median * 1.4;
        })
        .sort((a, b) => signalScore(b) - signalScore(a));
      list = hunted.length > 0 ? hunted : [...live()].sort((a, b) => signalScore(b) - signalScore(a));
      break;
    }
    case "chaos": {
      const day = Math.floor(Date.now() / DAY);
      list = [...live()].sort((a, b) => hash(a.id + day) - hash(b.id + day));
      break;
    }
    case "saved": {
      const ids = new Set(db().saved_memes.filter((s) => s.user_id === user?.id).map((s) => s.meme_id));
      list = [...live()].filter((m) => ids.has(m.id)).sort((a, b) => change24h(b) - change24h(a));
      break;
    }
    case "mix": {
      // Reels view: prioritize newest real video memes, then newest other memes
      const vids = live().filter((m) => m.media_type === "video").sort((a, b) => b.created_at.localeCompare(a.created_at));
      const others = live().filter((m) => m.media_type !== "video").sort((a, b) => b.created_at.localeCompare(a.created_at));
      list = [...vids, ...others];
      if (list.length === 0) list = live().sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    }
    default: {
      // Instagram-style Home feed: newest released posts appear first
      list = [...live()].sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    }
  }
  const start = page * limit;
  const slice = list.slice(start, start + limit);
  return { memes: slice.map((m) => memeView(m, user?.id)), has_more: start + limit < list.length };
}

function heatScore(m: Meme): number {
  return m.volume_24h * 2 + Math.abs(change24h(m)) * 30 + m.momentum * 400;
}

// activity relative to size — the early-signal engine
function signalScore(m: Meme): number {
  const velocity = change24h(m);
  return velocity * 2 + m.momentum * 150 + (m.volume_24h / Math.max(1, m.current_price)) * 25 - m.views / 200;
}

function medianPrice(): number {
  const prices = live().map((m) => m.current_price).sort((a, b) => a - b);
  return prices[Math.floor(prices.length / 2)] ?? 30;
}

// ---- market sections ---------------------------------------------------
export function marketSections(user: Profile | null): MarketSection[] {
  const all = live();
  const byChange = [...all].sort((a, b) => change24h(b) - change24h(a));
  const fresh = all
    .filter((m) => Date.now() - new Date(m.created_at).getTime() < 2 * DAY)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const median = medianPrice();
  const undervalued = all.filter((m) => m.current_price < median).sort((a, b) => b.volume_24h - a.volume_24h);
  const smart = [...all].sort((a, b) => b.dna.humor * 0.6 + changeAll(b) * 0.05 - (a.dna.humor * 0.6 + changeAll(a) * 0.05));
  const signals = all
    .filter((m) => {
      const ageH = (Date.now() - new Date(m.created_at).getTime()) / 3_600_000;
      return ageH < 96 && m.views < 6000 && (m.momentum > 0.15 || change24h(m) > 6);
    })
    .sort((a, b) => signalScore(b) - signalScore(a));
  return [
    { id: "gainers", title: "🚀 TOP GAINERS", subtitle: "Largest 24h Aura gains", memes: byChange.slice(0, 6).map((m) => memeView(m, user?.id)) },
    { id: "losers", title: "📉 TOP LOSERS", subtitle: "Cooling off today", memes: byChange.slice(-6).reverse().map((m) => memeView(m, user?.id)) },
    { id: "traded", title: "🔥 MOST TRADED", subtitle: "Highest Aura volume", memes: [...all].sort((a, b) => b.volume_24h - a.volume_24h).slice(0, 6).map((m) => memeView(m, user?.id)) },
    { id: "hunter", title: "🕵️ EARLY SIGNALS", subtitle: "Small memes moving like they're about to blow", memes: signals.slice(0, 6).map((m) => memeView(m, user?.id)) },
    { id: "fresh", title: "🆕 FRESH DROPS", subtitle: "Launched in the last 48 hours", memes: fresh.slice(0, 6).map((m) => memeView(m, user?.id)) },
    { id: "undervalued", title: "💎 UNDERVALUED", subtitle: "Strong activity, low value", memes: undervalued.slice(0, 6).map((m) => memeView(m, user?.id)) },
    { id: "smart", title: "🧠 SMART PICKS", subtitle: "Strong historical signals — never a guarantee", memes: smart.slice(0, 6).map((m) => memeView(m, user?.id)) },
  ];
}

export function trending(limit: number, user: Profile | null): MemeView[] {
  return [...live()]
    .sort((a, b) => heatScore(b) - heatScore(a))
    .slice(0, limit)
    .map((m) => memeView(m, user?.id));
}

export function eventAndSeason(): { event: EventView; season: SeasonView } {
  return { event: currentEvent(), season: seasonInfo() };
}
