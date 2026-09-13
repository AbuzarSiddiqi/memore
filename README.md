# AURA — Don't Like. Invest.

> A social network where meme discovery becomes a prediction game. **DOUBLE-TAP ANY MEME = INVEST ✦1.**

A production-quality **Progressive Web App** — Next.js (App Router) + TypeScript + Tailwind, in a loud **neo-brutalist** design language (thick black borders, hard offset shadows, purple / neon-lime / yellow / coral blocks, Space Grotesk).

---

## Quick start

```bash
cd aura
npm install
npm run dev        # → http://localhost:3000
```

The world seeds itself on first boot: **450 memes** (330 images + 120 real MP4 reels), **30 accounts** (28 clearly-marked SEED creators), 30 days of price history, holdings, calls, battles, a remix family tree, missions and live market stats.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Investor (starter portfolio) | `demo@aura.app` | `aura1234` |
| Admin (moderation at `/admin`) | `admin@aura.app` | `aura-admin-1` |

Sign up and you start with **✦100 virtual Aura** — every Aura counts.

---

## The signature interaction

## DOUBLE TAP → ✦1 AURA INVESTED

Not a like. Every double-tap on any meme (feed cards, reels, detail page) sends a server-validated invest request for ✦1, floats a **+✦1** animation from your fingertip, and updates a **“✦N invested by you”** chip on the meme. Rapid taps are batched per 380ms into one idempotent request (client-generated request IDs, server-side dedupe).

## The economy

- You start with **✦100**. Every meme launches at **✦20**.
- Pricing is a concave demand curve: `price = 20 × (1 + netInvested / 120)^0.6`, floor ✦1 — early Aura moves a meme a lot, late Aura less.
- Selling returns 96% (4% spread); instant round-trips lose money. Position math: `units = amount / price`, avg-entry weighted.
- **All Aura mutations are server-authoritative** (`lib/server/market.ts`): balance validation, oversell protection, rate limits (240 trades/min for taps, tighter for posts/uploads/calls), idempotency keys, upload MIME/size whitelists, suspended-user lockout. No user-to-user transfers.

## What's inside

| Area | What you get |
|---|---|
| **Home** | Media-first feed: For You, Following, Trending, 🕵️ **Hunter**, New, Rising, Undervalued, Chaos. Live event banner + daily missions strip. |
| **Meme Heat** | COLD → WARM → HOT → VIRAL → LEGENDARY, driven mostly by **velocity** (24h change, momentum, invest velocity), not total views. |
| **Hunter** | EARLY SIGNALS — small memes (low views, few investors) already moving, ranked by activity-vs-size. |
| **AURA Calls** | Publicly predict 🚀 VIRAL (+50% in 7d) or 📉 FLOP (−30% in 7d). Resolved automatically; wins pay ✦5 + reputation. |
| **Prediction IQ** | A second status axis (3–99) from call accuracy, early buys, realized returns and consistency. Fat bags don't earn respect; good predictions do. |
| **Smart Money** | “🧠 N high-IQ predictors are in · ✦X invested” on any meme the smart crowd has found. |
| **Meme DNA** | Humor / Chaos / Relatability / Brainrot / Wholesome / Absurdity traits + **DNA MATCH — %** similar-meme recommendations. |
| **Family Tree** | Remixes stay linked to their lineage (original → remixes → grandchildren) with attribution preserved. |
| **Battles** | WHICH ONE MOONS? Stake ✦5 on a side; winners split the whole pot (zero-sum PvP) when the battle resolves. |
| **Graveyard** | Tombstones for crashed memes: peak vs now, drawdown %, and an epitaph (“Diamond hands, paper meme.”). |
| **Biggest W / L** | Your best and worst exits as multipliers (✦3 → ✦82, 27.3×) on the profile. |
| **Achievements** | First Investment, Early Bird, 10X, Meme Hunter, **Diamond Hands** (held through a crash), **Perfect Exit** (sold ≤5% off the ATH), **Called the Top** (sold before a 30% dump)… |
| **Seasons** | SEASON 01 — THE FIRST WAVE. 30-day seasons banner the leaderboard; seasonal ranking keeps the top fresh. |
| **Titles** | 👑 AURA LEGEND, 🔮 MEME ORACLE, 💎 DIAMOND HANDS, 🏹 TREND HUNTER, 🛍️ BAGHOLDER — earned, shown next to your name. |
| **Daily missions** | Discover 5 memes · Invest in 3 · Find 1 early signal · Make 1 remix — auto-tracked, pays Aura + XP. |
| **Chaos events** | Rotating 2-hour live events: WILD HOUR, NEW MEMES ONLY, DOUBLE XP, CHAOS MODE — they reshape the feed. |
| **Reels** | Immersive vertical video (120 seeded clips): autoplay in view, tap to pause, double-tap = ✦1, quick ✦1/2/5 chips. |
| **Portfolio** | Profile = Prediction IQ + rank + win rate + early finds + current holdings, not just followers. |

## Architecture

```
app/
  (app)/…            home, reels, market, meme/[id], vault, create, battles,
                     leaderboard, graveyard, notifications, search, settings,
                     profile/[username], admin
  api/…              auth, memes (feed/create), invest (batched taps), sell,
                     call, battles (stakes), missions, graveyard, leaderboard,
                     notifications, search, upload, admin…
components/          neo-brutalist UI kit, SVG charts, nav, meme cards,
                     DoubleTapZone (batched micro-invests), invest/sell/call sheets
lib/
  server/            market (pricing/heat/graveyard/calls/battles/tick),
                     progression (IQ, titles, seasons, events, missions),
                     feed (ranking incl. hunter signals), notify, auth, seed
  client.tsx         session, toasts, api helper, formatting
public/              330 meme SVGs, 120 reels + posters, icons, manifest, sw.js
database/schema.sql  Postgres/Supabase schema + RLS starting point
scripts/gen-assets.mjs   regenerates all 450 memes (node scripts/gen-assets.mjs)
```

**Persistence** is a zero-config atomic JSON store (`.data/db.json`). Every mutation flows through the service layer, so moving to Supabase/Postgres means swapping the data layer only — `database/schema.sql` (calls, battle stakes, user_daily, DNA columns) plus `security definer` RPCs for `invest`/`sell` are the starting point.

**PWA**: manifest, service worker (shell cached, API network-first, nothing sensitive cached), generated icons + maskable, standalone mode, install shortcuts to Market / Vault / Create.

## Seeding philosophy

Seed content is hand-curated caption/punchline sets plus meme-format templates (nobody:/speedrun/POV/day-47…), rendered as bold graphic images and abstract animated reels — clearly labeled as demo data (seed creators wear a **SEED** badge). The external-trend-engine idea (Reddit etc.) is deliberately out of core: external momentum may inform humans later, never prices directly.

## Regenerate assets

```bash
node scripts/gen-assets.mjs   # ~330 SVGs fast; 120 reels need ffmpeg (~4 min)
```

> **AURA is a game.** Aura Points are virtual, non-transferable, and have no monetary value. 😂 Laugh → 🕵️ Discover → 🧠 Predict → ✦ Invest → 📈 Watch → 🏆 Prove it.
