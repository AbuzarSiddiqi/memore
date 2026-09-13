// Builds the initial demo world so AURA feels alive on first boot.
// 30 accounts (28 marked SEED), 450 memes (330 images + 120 reels),
// small economy (memes launch at ✦20, users start at ✦100).
// Deterministic via mulberry32 so charts and rankings stay stable.
import crypto from "crypto";
import { dataDirReady } from "./db";
import { INITIAL_PRICE } from "./market";
import { ACHIEVEMENTS } from "./notify";
import type { Battle, DB, Meme, MemeDNA, Profile, PricePoint } from "../types";
import assets from "./meme-assets.json";

function hashPw(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 32).toString("hex")}`;
}
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + rand() * (b - a);
const round1 = (n: number) => Math.round(n * 10) / 10;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const iso = (d: Date) => d.toISOString();

const AVATAR_COLORS = ["#7C4DFF", "#315BEF", "#FF6B57", "#22A565", "#F59E0B", "#E5484D", "#0EA5E9", "#9333EA"];

const SEED_USERS: Array<{ u: string; d: string; bio: string; bal: number; lvl: number; rep: number; hunter: [number, number, number] }> = [
  { u: "priya_vibes", d: "Priya", bio: "college meme specialist. I call tops and bottoms. mostly bottoms. 📉", bal: 682, lvl: 12, rep: 4820, hunter: [1840, 47, 39] },
  { u: "prof_fail", d: "Prof. Fail", bio: "exams are a social construct", bal: 214, lvl: 8, rep: 2110, hunter: [920, 21, 15] },
  { u: "ctrl_alt_defeat", d: "Ctrl Alt Defeat", bio: "shipping bugs since 2019 💻", bal: 493, lvl: 10, rep: 3340, hunter: [1310, 33, 24] },
  { u: "anime_senpai", d: "Senpai", bio: "one episode never hurt nobody", bal: 361, lvl: 9, rep: 2870, hunter: [1105, 28, 19] },
  { u: "footy_fanatic", d: "Footy Fanatic", bio: "my team loses, my portfolio doesn't ⚽", bal: 559, lvl: 11, rep: 3990, hunter: [1560, 38, 31] },
  { u: "bollywood_banter", d: "Filmy Baanter", bio: "every scene needs a song break 🎬", bal: 187, lvl: 7, rep: 1880, hunter: [780, 17, 11] },
  { u: "gacha_goblin", d: "Gacha Goblin", bio: "whaling on memes now", bal: 129, lvl: 6, rep: 1420, hunter: [640, 14, 9] },
  { u: "hostel_houdini", d: "Hostel Houdini", bio: "magician with mess food 🍛", bal: 86, lvl: 5, rep: 990, hunter: [410, 9, 5] },
  { u: "chai_sultan", d: "Chai Sultan", bio: "cutting chai economics 🫖", bal: 308, lvl: 9, rep: 2440, hunter: [990, 25, 18] },
  { u: "missing_semester", d: "Missing Semester", bio: "attendance 40%, aura 100%", bal: 172, lvl: 7, rep: 1650, hunter: [720, 16, 10] },
  { u: "chaos_agent", d: "Chaos Agent", bio: "I invest where I should not 🌀", bal: 891, lvl: 15, rep: 7210, hunter: [2480, 61, 52] },
  { u: "minus_one_iq", d: "-1 IQ", bio: "smooth brain, strong hands", bal: 94, lvl: 5, rep: 1130, hunter: [380, 8, 4] },
  { u: "sigma_sharma", d: "Sigma Sharma", bio: "silent. strategic. snacking. 🗿", bal: 447, lvl: 10, rep: 3010, hunter: [1240, 30, 26] },
  { u: "derek_shipper", d: "Derek (Shipper)", bio: "deploys on friday, apologizes on monday", bal: 233, lvl: 8, rep: 1990, hunter: [810, 19, 13] },
  { u: "wooloo_watcher", d: "Wooloo Watcher", bio: "soft memes only, strong hands though", bal: 158, lvl: 6, rep: 1480, hunter: [590, 12, 8] },
  { u: "tendie_tosser", d: "Tendie Tosser", bio: "fried chicken funded by fried picks", bal: 121, lvl: 6, rep: 1220, hunter: [520, 11, 7] },
  { u: "gigachad_gita", d: "Gigachad Gita", bio: "reads the bhagavad gita, trades like it's a battle arc", bal: 612, lvl: 12, rep: 4510, hunter: [1720, 44, 37] },
  { u: "noonnoon_nina", d: "Nina Noon", bio: "lunch break liquidity provider", bal: 203, lvl: 7, rep: 1740, hunter: [760, 17, 12] },
  { u: "packet_cutter", d: "Packet Cutter", bio: "opens chips from the wrong side. chaos.", bal: 77, lvl: 4, rep: 880, hunter: [350, 7, 4] },
  { u: "wifi_waiver", d: "Wifi Waiver", bio: "connects to guest network out of principle", bal: 111, lvl: 5, rep: 1010, hunter: [430, 9, 6] },
  { u: "sasta_satoshi", d: "Sasta Satoshi", bio: "whitepaper reader, meme writer", bal: 356, lvl: 9, rep: 2620, hunter: [1020, 26, 20] },
  { u: "moye_moye_max", d: "Moye Moye Max", bio: "buying the exact top since 2021", bal: 63, lvl: 4, rep: 760, hunter: [290, 6, 3] },
  { u: "riski_rinku", d: "Riski Rinku", bio: "if it's not risky it's not funny", bal: 528, lvl: 11, rep: 3890, hunter: [1490, 36, 29] },
  { u: "sunday_scroller", d: "Sunday Scroller", bio: "400 memes deep since breakfast", bal: 149, lvl: 6, rep: 1390, hunter: [610, 13, 9] },
  { u: "pani_puri_pro", d: "Pani Puri Pro", bio: "one more, bhaiya. (15 more)", bal: 98, lvl: 5, rep: 950, hunter: [400, 8, 5] },
  { u: "grave digger", d: "Grave Digger", bio: "I buy things in the graveyard. respectfully. 🪦", bal: 71, lvl: 5, rep: 890, hunter: [370, 8, 5] },
  { u: "clipboard_king", d: "Clipboard King", bio: "team leader of group projects nobody joined", bal: 186, lvl: 7, rep: 1690, hunter: [740, 16, 11] },
  { u: "gyan_distributor", d: "Gyan Distributor", bio: "free advice, worth every paisa", bal: 265, lvl: 8, rep: 2170, hunter: [880, 20, 15] },
];

// DNA bases per category [humor, chaos, relatability, brainrot, wholesome, absurdity]
const DNA_BASE: Record<string, [number, number, number, number, number, number]> = {
  college: [80, 40, 85, 30, 35, 45],
  gaming: [70, 60, 60, 55, 30, 60],
  anime: [65, 55, 65, 60, 40, 65],
  football: [75, 50, 75, 25, 40, 40],
  programming: [85, 35, 90, 20, 30, 50],
  bollywood: [80, 65, 70, 35, 45, 70],
  technology: [70, 45, 75, 30, 30, 45],
  workplace: [80, 35, 90, 15, 35, 40],
  indian: [85, 55, 95, 25, 60, 55],
  chaos: [60, 95, 40, 85, 15, 95],
};

function dnaFor(cat: string): MemeDNA {
  const b = DNA_BASE[cat] ?? DNA_BASE.chaos;
  const j = () => Math.round(between(-12, 12));
  return {
    humor: Math.max(5, Math.min(99, b[0] + j())),
    chaos: Math.max(5, Math.min(99, b[1] + j())),
    relatability: Math.max(5, Math.min(99, b[2] + j())),
    brainrot: Math.max(5, Math.min(99, b[3] + j())),
    wholesome: Math.max(5, Math.min(99, b[4] + j())),
    absurdity: Math.max(5, Math.min(99, b[5] + j())),
  };
}

const DESCRIPTIONS = [
  "Classic. Timeless. AURA-certified.",
  "Uploaded from a hostel room at 3am.",
  "The market needed this one.",
  "Made during a lecture that shall remain unnamed.",
  "Remix it. Make it worse. Make it better.",
  "Someone said this wouldn't pop. The market disagreed.",
];

const COMMENTS: string[][] = [
  ["this is aura farming in plain sight", "early gang 🤝", "professor lied, portfolio died", "invested my whole vault lol"],
  ["bro studied 4 minutes before", "we all know that guy", "sold too early again 💀", "top signal"],
  ["one more game? one more game.", "the sleep loss is real", "this one is cooking"],
  ["works on MY machine too", "deploy on friday and find out", "devops aura +100"],
  ["127 bugs later…", "this chart is my last semester's grades", "never selling this one"],
  ["aunty radar never misses", "the whatsapp group is an exchange", "invested from the society terrace"],
  ["the pigeons KNOW", "birds aren't real, aura is", "chirp chirp buy buy"],
  ["the original. respect.", "this one started the whole family", "OG holders eat first"],
  ["speedrun any% any discipline", "world record pace honestly", "who speedruns this"],
  ["POV moments hitting too close", "why is this my life", "called it weeks ago"],
  ["he has seen everything", "cat market manipulation", "whale watching"],
  ["the audacity of this duck", "CEO behavior", "promotion when"],
];

export function seedWorld(): DB {
  dataDirReady();
  const now = Date.now();

  const mkUser = (u: Partial<Profile> & { username: string; display_name: string; bio: string }): Profile => {
    const { username, display_name, bio, ...rest } = u;
    return {
      id: `u_${username.replace(/\s/g, "_")}`, email: `${username.replace(/\s/g, "_")}@aura.demo`, password_hash: "",
      username, display_name, avatar_bg: pick(AVATAR_COLORS),
      bio, aura_balance: 100, reputation: 100, level: 1, xp: 60, role: "user",
      is_seed: true, interests: [], onboarded: true, suspended: false,
      hunter: { score: 0, early_discoveries: 0, successful_picks: 0 },
      created_at: iso(new Date(now - between(60, 200) * DAY)),
      ...rest,
    };
  };

  const users: Profile[] = [
    mkUser({ username: "demo_hunter", display_name: "Demo Hunter", email: "demo@aura.app", bio: "here to find memes before they're cool. 📉📈", aura_balance: 427, level: 3, xp: 240, reputation: 420, is_seed: false, interests: ["college", "gaming", "programming"], hunter: { score: 120, early_discoveries: 3, successful_picks: 2 }, password_hash: hashPw("aura1234") }),
    mkUser({ username: "admin", display_name: "MEMORE HQ", email: "admin@aura.app", bio: "keeping the market weird", role: "admin", aura_balance: 2000, level: 42, xp: 4200, reputation: 9999, is_seed: false, password_hash: hashPw("aura-admin-1") }),
    ...SEED_USERS.map((s) =>
      mkUser({ username: s.u, display_name: s.d, bio: `${s.bio}`, aura_balance: s.bal, level: s.lvl, xp: s.lvl * 80, reputation: s.rep, hunter: { score: s.hunter[0], early_discoveries: s.hunter[1], successful_picks: s.hunter[2] } })
    ),
  ];

  const memes: Meme[] = [];
  const price_history: Record<string, PricePoint[]> = {};
  const creatorPool = users.filter((u) => u.is_seed);

  assets.forEach((a, idx) => {
    const creator = creatorPool[idx % creatorPool.length];
    const ageH = idx < 30 ? between(3, 40) : idx < 110 ? between(48, 120) : between(120, 30 * 24);
    const created = new Date(now - ageH * HOUR);

    // small economy: most memes live between ✦6 and ✦300
    const roll = rand();
    let target: number;
    if (roll < 0.28) target = between(7, 26);        // still finding feet
    else if (roll < 0.7) target = between(24, 80);   // healthy mid
    else if (roll < 0.93) target = between(80, 260); // strong performer
    else target = between(260, 620);                 // legend tier
    // inverse of price curve: net = 120 * ((p/20)^(1/0.6) - 1)
    const net = round1(120 * (Math.pow(target / INITIAL_PRICE, 1 / 0.6) - 1));

    const meme: Meme = {
      id: a.id, creator_id: creator.id, caption: a.caption,
      description: pick(DESCRIPTIONS), category: a.category,
      tags: [a.category, a.media_type === "video" ? "reel" : "image", ...a.caption.toLowerCase().split(/\W+/).filter((w) => w.length > 4).slice(0, 2)],
      media_type: a.media_type as Meme["media_type"], media_url: a.media_url,
      thumbnail_url: a.thumbnail_url, width: a.width, height: a.height, duration: a.duration ?? null,
      initial_price: INITIAL_PRICE, current_price: round1(target),
      net_invested: net, total_invested: round1(net + between(2, 60)),
      total_sell_value: round1(between(0, net * 0.3)),
      open_price_24h: round1(target), all_time_high: round1(target * between(1.02, 1.2)),
      volume_24h: round1(between(1, 220)),
      momentum: round1(between(-0.5, 0.9)),
      views: Math.round(between(120, 4200) * (a.media_type === "video" ? 1.8 : 1)),
      saves: Math.round(between(2, 220)), remix_count: 0,
      battle_wins: Math.round(between(0, 5)), battle_losses: Math.round(between(0, 4)),
      status: "live", parent_meme_id: null, epitaph: null, source: "original", source_url: null, source_handle: null,
      dna: dnaFor(a.category),
      created_at: iso(created), updated_at: iso(created),
    };
    memes.push(meme);

    // history: hourly for the last ≤7 days + daily anchors before that
    const points: PricePoint[] = [];
    const hourlyCount = Math.min(168, Math.floor(Math.min(ageH, 168)));
    let p = INITIAL_PRICE * between(0.85, 1.05);
    const hourlyGrowth = Math.pow(target / p, 1 / Math.max(1, hourlyCount));
    for (let i = hourlyCount; i >= 1; i--) {
      p *= hourlyGrowth * (1 + (rand() - 0.485) * 0.09);
      p = Math.max(2, p);
      points.push({ t: now - i * HOUR, p: round1(p), v: 0 });
    }
    points.push({ t: now, p: meme.current_price, v: 0 });
    // daily anchors beyond the hourly window
    const dailyCount = Math.min(24, Math.floor((ageH - hourlyCount) / 24));
    let dp = INITIAL_PRICE * between(0.8, 1.0);
    const dailyGrowth = Math.pow(p / dp, 1 / Math.max(1, dailyCount));
    for (let j = dailyCount; j >= 1; j--) {
      dp *= dailyGrowth * (1 + (rand() - 0.485) * 0.05);
      dp = Math.max(2, dp);
      points.unshift({ t: now - (hourlyCount + j * 24) * HOUR, p: round1(dp), v: 0 });
    }
    // ~8% of memes are graveyard-bound: a glorious past, a dusty present
    if (rand() < 0.08) {
      meme.all_time_high = round1(between(60, 160));
      meme.current_price = round1(between(2, 6));
      meme.net_invested = -60;
      meme.momentum = -0.7;
      meme.open_price_24h = round1(meme.current_price * between(0.9, 1.05));
      points[points.length - 1].p = meme.current_price;
    }
    meme.open_price_24h = points[Math.max(0, points.length - 25)].p;
    price_history[meme.id] = points;
  });

  // remix family trees: pick 14 parents among curated images, children among later same-category memes
  const remixes: DB["remixes"] = [];
  const liveImgs = memes.filter((m) => m.media_type === "image");
  for (let i = 0; i < 14; i++) {
    const parent = liveImgs[Math.floor(i * (liveImgs.length / 14))];
    const childPool = liveImgs.filter((m) => m.category === parent.category && m.id !== parent.id && !m.parent_meme_id && m.created_at > parent.created_at);
    if (childPool.length < 2) continue;
    const child = childPool[Math.floor(rand() * childPool.length)];
    child.parent_meme_id = parent.id;
    parent.remix_count += 1;
    remixes.push({ id: `rx_${parent.id}_${child.id}`, original_meme_id: parent.id, remix_meme_id: child.id, creator_id: child.creator_id, created_at: child.created_at });
    // one grandchild
    const gcPool = liveImgs.filter((m) => m.category === parent.category && m.id !== child.id && m.id !== parent.id && !m.parent_meme_id && m.created_at > child.created_at);
    if (gcPool.length && rand() < 0.6) {
      const gc = gcPool[Math.floor(rand() * gcPool.length)];
      gc.parent_meme_id = child.id;
      child.remix_count += 1;
      remixes.push({ id: `rx_${child.id}_${gc.id}`, original_meme_id: child.id, remix_meme_id: gc.id, creator_id: gc.creator_id, created_at: gc.created_at });
    }
  }

  // holdings + transactions for seed users
  const holdings: DB["holdings"] = [];
  const transactions: DB["transactions"] = [];
  const traders = users.filter((u) => u.is_seed);
  for (const meme of memes) {
    const n = Math.floor(between(0, 7));
    const chosen = new Set<string>();
    while (chosen.size < Math.min(n, traders.length)) chosen.add(pick(traders).id);
    for (const uid of chosen) {
      const buyH = between(6, Math.max(10, Math.min(20 * 24, (now - new Date(meme.created_at).getTime()) / HOUR)));
      const hist = price_history[meme.id];
      const idxAt = Math.max(1, hist.length - Math.floor(buyH));
      const entryPrice = hist[Math.max(0, idxAt)].p;
      const amount = Math.round(between(1, 12));
      const units = amount / entryPrice;
      const buyAt = new Date(hist[Math.max(0, idxAt)].t);
      holdings.push({
        id: `h_${uid}_${meme.id}`, user_id: uid, meme_id: meme.id, quantity: units,
        invested_amount: amount, avg_entry_price: entryPrice, realized_pnl: 0,
        last_notif_value: units * meme.current_price, last_notif_at: 0,
        created_at: iso(buyAt), updated_at: iso(buyAt),
      });
      transactions.push({
        id: `t_b_${uid}_${meme.id}`, user_id: uid, meme_id: meme.id, type: "buy",
        units, price: entryPrice, total_value: amount, realized_pnl: null, cost_basis: null, created_at: iso(buyAt),
      });
      if (rand() < 0.3) {
        const sellUnits = units * between(0.4, 1);
        const sellIdx = Math.min(hist.length - 1, idxAt + Math.floor(between(3, 30)));
        const sellPrice = hist[sellIdx].p;
        const costBasis = round1(sellUnits * entryPrice);
        const proceeds = round1(sellUnits * sellPrice * 0.96);
        const h = holdings[holdings.length - 1];
        h.quantity -= sellUnits;
        h.realized_pnl = round1(h.realized_pnl + proceeds - costBasis);
        transactions.push({
          id: `t_s_${uid}_${meme.id}`, user_id: uid, meme_id: meme.id, type: "sell",
          units: sellUnits, price: sellPrice, total_value: proceeds,
          realized_pnl: round1(proceeds - costBasis), cost_basis: costBasis,
          created_at: iso(new Date(hist[sellIdx].t)),
        });
      }
    }
  }

  // demo user's starter portfolio + a legendary Biggest W
  const demo = users.find((u) => u.username === "demo_hunter")!;
  const demoPicks: Array<[string, number, number]> = [
    ["img-002", 4, 60], ["img-011", 3, 40], ["reel-004", 2, 20],
  ];
  for (const [memeId, amount, hoursAgo] of demoPicks) {
    const meme = memes.find((m) => m.id === memeId) ?? memes[0];
    const entryPrice = Math.max(4, meme.initial_price * 1.1);
    const units = amount / entryPrice;
    const at = iso(new Date(now - hoursAgo * HOUR));
    holdings.push({
      id: `h_demo_${memeId}`, user_id: demo.id, meme_id: meme.id, quantity: units,
      invested_amount: amount, avg_entry_price: entryPrice, realized_pnl: 0,
      last_notif_value: units * meme.current_price, last_notif_at: 0,
      created_at: at, updated_at: at,
    });
    transactions.push({
      id: `t_demo_${memeId}`, user_id: demo.id, meme_id: meme.id, type: "buy",
      units, price: entryPrice, total_value: amount, realized_pnl: null, cost_basis: null, created_at: at,
    });
  }
  // one closed legend trade: ✦3 → ✦82 (27.3x) — the Biggest W
  transactions.push({
    id: "t_demo_legend", user_id: demo.id, meme_id: "img-023", type: "sell",
    units: 0.15, price: 546.7, total_value: 82, realized_pnl: 79, cost_basis: 3,
    created_at: iso(new Date(now - 3 * DAY)),
  });

  // comments
  const comments: DB["comments"] = [];
  const commentTargets = memes.filter((m) => m.media_type === "image").slice(0, 60);
  commentTargets.forEach((meme, mi) => {
    const pool = COMMENTS[mi % COMMENTS.length];
    pool.slice(0, 2 + Math.floor(rand() * 3)).forEach((text, i) => {
      comments.push({
        id: `c_${meme.id}_${i}`, meme_id: meme.id, user_id: pick(traders).id,
        parent_id: null, content: text, created_at: iso(new Date(now - between(1, 60) * HOUR)),
      });
    });
  });

  // Instagram-sourced memes — real public posts/reels embedded via Instagram's
  // official embed endpoint, with attribution + link back to the creator.
  const IG_SEED = [
    { shortcode: "DCmdJqSRE94", kind: "p" as const, handle: "happinessproject", caption: "i'm just a chill guy — the original artwork that took over the internet" },
    { shortcode: "DBLZzA5xrxX", kind: "reel" as const, handle: "ianbrottman", caption: "Meme of the day, handpicked from the scroll mines 🧃" },
    { shortcode: "DatIta1s6Oo", kind: "reel" as const, handle: "ight", caption: "11 million followers of pure signal. Turn the sound on." },
    { shortcode: "CtQWHtcrz1f", kind: "p" as const, handle: "dobbyisafreedoggo", caption: "Use these responses responsibly. You're welcome. 😂" },
    { shortcode: "DbC7mw8jAyv", kind: "reel" as const, handle: "9gag", caption: "9GAG daily dose of dank. You know the vibe." },
    { shortcode: "DWWpIeWCoKJ", kind: "reel" as const, handle: "sovjet", caption: "the reel that lives in your head rent free" },
    { shortcode: "C8KO4xkxxO6", kind: "reel" as const, handle: "ianbrottman", caption: "dank memes, volume up, dignity down" },
  ];
  IG_SEED.forEach((ig, i) => {
    const creator = creatorPool[(assets.length + i) % creatorPool.length];
    const ageH = i < 3 ? between(3, 30) : between(30, 90);
    const created = new Date(now - ageH * HOUR);
    const target = between(24, 95);
    const net = round1(120 * (Math.pow(target / INITIAL_PRICE, 1 / 0.6) - 1));
    const url = `https://www.instagram.com/${ig.kind === "reel" ? "reel" : "p"}/${ig.shortcode}/`;
    const meme: Meme = {
      id: `ig_${ig.shortcode}`, creator_id: creator.id, caption: ig.caption,
      description: `Embedded from Instagram via the official embed — all credit to @${ig.handle}.`,
      category: "chaos",
      tags: ["instagram", ig.kind === "reel" ? "reel" : "post", ig.handle],
      media_type: ig.kind === "reel" ? "video" : "image",
      media_url: url, thumbnail_url: "/memes/ig-card.svg",
      width: 400, height: 500, duration: ig.kind === "reel" ? 15 : null,
      initial_price: INITIAL_PRICE, current_price: round1(target),
      net_invested: net, total_invested: round1(net + between(2, 40)),
      total_sell_value: 0, open_price_24h: round1(target * between(0.85, 0.98)),
      all_time_high: round1(target * 1.1), volume_24h: round1(between(8, 90)),
      momentum: round1(between(0.3, 0.9)), views: Math.round(between(300, 2600)),
      saves: Math.round(between(4, 60)), remix_count: 0,
      battle_wins: 0, battle_losses: 0, status: "live", parent_meme_id: null, epitaph: null,
      source: "instagram", source_url: url, source_handle: ig.handle,
      dna: dnaFor("chaos"),
      created_at: iso(created), updated_at: iso(created),
    };
    memes.push(meme);
    // short hourly history so sparklines/chart work immediately
    const pts: PricePoint[] = [];
    let hp = INITIAL_PRICE;
    const g = Math.pow(target / hp, 1 / 23);
    for (let s = 23; s >= 1; s--) {
      hp *= g * (1 + (rand() - 0.485) * 0.06);
      pts.push({ t: now - s * HOUR, p: round1(Math.max(4, hp)), v: 0 });
    }
    pts.push({ t: now, p: meme.current_price, v: 0 });
    meme.open_price_24h = pts[0].p;
    price_history[meme.id] = pts;
    // a few seed investors + a comment each
    for (const investor of pick3(traders)) {
      const entryPrice = INITIAL_PRICE * between(0.95, 1.1);
      const amount = Math.round(between(1, 6));
      holdings.push({
        id: `h_ig_${investor.id}_${meme.id}`, user_id: investor.id, meme_id: meme.id, quantity: amount / entryPrice,
        invested_amount: amount, avg_entry_price: entryPrice, realized_pnl: 0,
        last_notif_value: 0, last_notif_at: 0, created_at: iso(created), updated_at: iso(created),
      });
      transactions.push({
        id: `t_ig_${investor.id}_${meme.id}`, user_id: investor.id, meme_id: meme.id, type: "buy",
        units: amount / entryPrice, price: entryPrice, total_value: amount, realized_pnl: null,
        cost_basis: null, created_at: iso(created),
      });
    }
    comments.push({
      id: `c_ig_${meme.id}`, meme_id: meme.id, user_id: pick(traders).id, parent_id: null,
      content: i % 2 === 0 ? "the OG source itself, respect the embed 🫡" : "investing before this hits everyone's feed",
      created_at: iso(new Date(now - between(1, 12) * HOUR)),
    });
  });


  // follows
  const follows: DB["follows"] = [];
  const addFollow = (a: string, b: string, days: number) =>
    follows.push({ follower_id: a, following_id: b, created_at: iso(new Date(now - days * DAY)) });
  for (const u of traders) {
    for (const c of pick3(creatorPool)) if (u.id !== c.id) addFollow(u.id, c.id, between(1, 90));
  }
  addFollow(demo.id, users.find((u) => u.username === "priya_vibes")!.id, 12);
  addFollow(demo.id, users.find((u) => u.username === "ctrl_alt_defeat")!.id, 9);
  addFollow(demo.id, users.find((u) => u.username === "chaos_agent")!.id, 4);
  addFollow(users.find((u) => u.username === "chai_sultan")!.id, demo.id, 3);
  addFollow(users.find((u) => u.username === "prof_fail")!.id, demo.id, 6);

  // AURA Calls — some history, some open
  const calls: DB["calls"] = [];
  for (let i = 0; i < 14; i++) {
    const caller = pick(traders);
    const meme = pick(memes);
    if (calls.some((c) => c.user_id === caller.id && c.meme_id === meme.id)) continue;
    const target = rand() < 0.65 ? "VIRAL" : "FLOP";
    const priceAtCall = Math.max(3, meme.open_price_24h * between(0.85, 1.1));
    const ageH = between(24, 20 * 24);
    const resolvesAt = new Date(now - ageH * HOUR + 7 * DAY);
    const change = (meme.current_price - priceAtCall) / priceAtCall;
    const stillOpen = resolvesAt.getTime() > now;
    const won = target === "VIRAL" ? change >= 0.5 : change <= -0.3;
    calls.push({
      id: `call_${i}`, user_id: caller.id, meme_id: meme.id, target: target as "VIRAL" | "FLOP",
      price_at_call: round1(priceAtCall),
      status: stillOpen ? "open" : won ? "won" : "lost",
      resolves_at: iso(resolvesAt), created_at: iso(new Date(now - ageH * HOUR)),
    });
  }

  // Battles — one open with stakes, two resolved
  const imgMemes = memes.filter((m) => m.media_type === "image");
  const battles: Battle[] = [
    {
      id: "b_open_1", category: "funniest", meme_a_id: imgMemes[4].id, meme_b_id: imgMemes[11].id,
      status: "open", winner_id: null,
      stakes_a: [{ user_id: "u_priya_vibes", amount: 5, created_at: iso(new Date(now - HOUR)) }, { user_id: "u_chai_sultan", amount: 5, created_at: iso(new Date(now - 2 * HOUR)) }],
      stakes_b: [{ user_id: "u_ctrl_alt_defeat", amount: 5, created_at: iso(new Date(now - 90 * 60_000)) }],
      price_a_at_start: imgMemes[4].current_price, price_b_at_start: imgMemes[11].current_price,
      created_at: iso(new Date(now - 3 * HOUR)),
    },
    {
      id: "b_res_1", category: "most relatable", meme_a_id: imgMemes[0].id, meme_b_id: imgMemes[1].id,
      status: "resolved", winner_id: imgMemes[0].id, stakes_a: [{ user_id: "u_chaos_agent", amount: 5, created_at: iso(new Date(now - 3 * DAY)) }],
      stakes_b: [{ user_id: "u_prof_fail", amount: 5, created_at: iso(new Date(now - 3 * DAY)) }],
      price_a_at_start: imgMemes[0].open_price_24h, price_b_at_start: imgMemes[1].open_price_24h,
      created_at: iso(new Date(now - 4 * DAY)),
    },
    {
      id: "b_res_2", category: "most chaotic", meme_a_id: imgMemes[22].id, meme_b_id: imgMemes[24].id,
      status: "resolved", winner_id: imgMemes[24].id, stakes_a: [{ user_id: "u_sigma_sharma", amount: 5, created_at: iso(new Date(now - 5 * DAY)) }],
      stakes_b: [{ user_id: "u_riski_rinku", amount: 5, created_at: iso(new Date(now - 5 * DAY)) }, { user_id: "u_tendie_tosser", amount: 5, created_at: iso(new Date(now - 5 * DAY)) }],
      price_a_at_start: imgMemes[22].open_price_24h, price_b_at_start: imgMemes[24].open_price_24h,
      created_at: iso(new Date(now - 6 * DAY)),
    },
  ];
  imgMemes[0].battle_wins += 1;
  imgMemes[24].battle_wins += 1;

  // notifications for the demo user
  const notifications: DB["notifications"] = [
    { id: "n1", user_id: demo.id, type: "pick_up", title: "🚀 Your pick is exploding", message: "\"when bro says he studied\" is moving fast today.", meme_id: "img-002", read: false, created_at: iso(new Date(now - 40 * 60_000)) },
    { id: "n2", user_id: demo.id, type: "follow", title: "Chai Sultan followed you", message: "Follow because they find great memes.", meme_id: null, read: false, created_at: iso(new Date(now - 3 * HOUR)) },
    { id: "n3", user_id: demo.id, type: "mission", title: "🎯 Mission complete: INVEST IN 3 MEMES", message: "+✦5 and +10 XP.", meme_id: null, read: false, created_at: iso(new Date(now - 5 * HOUR)) },
    { id: "n4", user_id: demo.id, type: "battle_win", title: "⚔️ BATTLE WON", message: "Your pick took the crown. Payout ✦7.5.", meme_id: "img-023", read: true, created_at: iso(new Date(now - 3 * DAY)) },
  ];

  const saved_memes: DB["saved_memes"] = [
    { user_id: demo.id, meme_id: "img-013", created_at: iso(new Date(now - 1 * DAY)) },
    { user_id: demo.id, meme_id: "img-026", created_at: iso(new Date(now - 2 * DAY)) },
  ];

  const reports: DB["reports"] = [
    { id: "r1", reporter_id: users.find((u) => u.username === "minus_one_iq")!.id, target_type: "meme", target_id: memes[20].id, category: "spam", note: "posted the same meme 3 times in the group", status: "open", created_at: iso(new Date(now - 8 * HOUR)) },
  ];

  return {
    users, memes, holdings, transactions, price_history, comments, follows, remixes,
    calls, battles, notifications, saved_memes, reports, sessions: [],
    chats: [], chat_messages: [], message_reactions: [],
    achievements: ACHIEVEMENTS,
    user_achievements: [
      { user_id: demo.id, achievement_id: "first-invest", unlocked_at: iso(new Date(now - 26 * HOUR)) },
    ],
    user_daily: [],
    meta: { last_tick: now, tick_count: 0, version: 2 },
  };
}

function pick3<T>(arr: T[]): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < 3 && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}

export const CREATOR_ACCOUNTS = [
  { username: "dank_vault", display_name: "The Dank Vault 🏛️", email: "dankvault@aura.app", avatar_bg: "#7C4DFF", bio: "Curating top-tier dank memes. Double-tap to invest early.", interests: ["chaos", "gaming"] },
  { username: "tech_roasts", display_name: "Tech Roasts 💻", email: "techroasts@aura.app", avatar_bg: "#315BEF", bio: "Shipping bugs to production since Friday 5pm.", interests: ["programming", "technology"] },
  { username: "daily_dose", display_name: "Daily Dose ☕", email: "dailydose@aura.app", avatar_bg: "#F59E0B", bio: "Your daily dose of relatable everyday humor.", interests: ["college", "workplace"] },
  { username: "anime_senpai", display_name: "Anime Senpai ⛩️", email: "animesenpai@aura.app", avatar_bg: "#FF6B57", bio: "Tournament arcs, plot twists, and power-up memes.", interests: ["anime", "gaming"] },
  { username: "desi_vibes", display_name: "Desi Vibes 🫖", email: "desivibes@aura.app", avatar_bg: "#22A565", bio: "Cutting chai, Bollywood drama, and hostel survival.", interests: ["indian", "bollywood", "college"] },
  { username: "crypto_chuckle", display_name: "Crypto Chuckle 🪙", email: "cryptochuckle@aura.app", avatar_bg: "#0EA5E9", bio: "Buying the top, holding the bag, laughing through the charts.", interests: ["technology", "workplace"] },
  { username: "campus_life", display_name: "Campus Life 🎒", email: "campuslife@aura.app", avatar_bg: "#9333EA", bio: "8 AM lectures are a scam. Attendance 40%, Aura 100%.", interests: ["college", "workplace"] },
  { username: "absurd_humor", display_name: "Absurd Humor 🌀", email: "absurdhumor@aura.app", avatar_bg: "#E5484D", bio: "Zero logic. Pure chaos. Brainrot elevated to art.", interests: ["chaos"] },
  { username: "reels_central", display_name: "Reels Central 🎬", email: "reelscentral@aura.app", avatar_bg: "#FF7BAC", bio: "Short-form video memes. Swipe up, invest Aura.", interests: ["college", "chaos", "bollywood"] },
  { username: "gaming_glitches", display_name: "Gaming Glitches 🎮", email: "gamingglitches@aura.app", avatar_bg: "#C8FF3D", bio: "NPC moments, rage quits, and broken physics.", interests: ["gaming", "technology"] },
];

export function emptyWorld(): DB {
  const creatorHash = hashPw("MemeCreator2026!");
  const now = new Date().toISOString();
  const users: Profile[] = CREATOR_ACCOUNTS.map((c) => ({
    id: `u_${c.username}`,
    email: c.email,
    password_hash: creatorHash,
    username: c.username,
    display_name: c.display_name,
    avatar_bg: c.avatar_bg,
    bio: c.bio,
    aura_balance: 100,
    reputation: 100,
    level: 1,
    xp: 0,
    role: "admin",
    is_seed: false,
    interests: c.interests,
    onboarded: true,
    suspended: false,
    hunter: { score: 50, early_discoveries: 0, successful_picks: 0 },
    created_at: now,
  }));

  return {
    users,
    memes: [],
    holdings: [],
    transactions: [],
    price_history: {},
    comments: [],
    follows: [],
    remixes: [],
    calls: [],
    battles: [],
    notifications: [],
    saved_memes: [],
    reports: [],
    sessions: [],
    chats: [],
    chat_messages: [],
    message_reactions: [],
    achievements: ACHIEVEMENTS,
    user_achievements: [],
    user_daily: [],
    meta: { last_tick: Date.now(), tick_count: 0, version: 2 },
  };
}

