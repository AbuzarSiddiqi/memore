// Cloud Synchronization Service — bridges MEMORE in-memory services to Supabase PostgreSQL & Storage.
// Ensures that investments, balances, memes, and profiles are persisted globally and fetchable across any device.
import { createAdminClient } from "@/lib/supabase/admin";
import type { DB, Holding, Meme, Profile, Transaction, Comment } from "../types";

export const CREATOR_UUID_MAP: Record<string, string> = {
  u_dank_vault: "c2539f71-47df-4831-b6f4-f24491a4a5de",
  dank_vault: "c2539f71-47df-4831-b6f4-f24491a4a5de",
  u_tech_roasts: "941c6be1-b978-4984-a842-cf1e2634c1a9",
  tech_roasts: "941c6be1-b978-4984-a842-cf1e2634c1a9",
  u_daily_dose: "c7cc5edf-59cd-4074-8cd1-8af57c59ffa7",
  daily_dose: "c7cc5edf-59cd-4074-8cd1-8af57c59ffa7",
  u_anime_senpai: "90014ba5-2986-4e57-8034-3b8abda45e55",
  anime_senpai: "90014ba5-2986-4e57-8034-3b8abda45e55",
  u_desi_vibes: "12fd76f4-7197-4ed1-b191-ee37fb6e917a",
  desi_vibes: "12fd76f4-7197-4ed1-b191-ee37fb6e917a",
  u_crypto_chuckle: "f5631021-239f-4bb7-90a9-556f456b9777",
  crypto_chuckle: "f5631021-239f-4bb7-90a9-556f456b9777",
  u_campus_life: "d3203e02-c0eb-4fff-b45a-1d89aa62375b",
  campus_life: "d3203e02-c0eb-4fff-b45a-1d89aa62375b",
  u_absurd_humor: "e6bbc46f-d512-4252-abbd-b68c7286842f",
  absurd_humor: "e6bbc46f-d512-4252-abbd-b68c7286842f",
  u_reels_central: "15699dc5-4900-4365-93ee-a77d3cc21dad",
  reels_central: "15699dc5-4900-4365-93ee-a77d3cc21dad",
  u_gaming_glitches: "3b9a3eb5-d82c-4d61-804f-11b53b478b93",
  gaming_glitches: "3b9a3eb5-d82c-4d61-804f-11b53b478b93",
};

export function toCanonicalUuid(userId: string): string {
  if (!userId) return userId;
  if (CREATOR_UUID_MAP[userId]) return CREATOR_UUID_MAP[userId];
  const withU = `u_${userId}`;
  if (CREATOR_UUID_MAP[withU]) return CREATOR_UUID_MAP[withU];
  return userId;
}

/** Sync a user holding & updated aura balance to Supabase PostgreSQL */
export async function syncHoldingToSupabase(holding: Holding, userBalance?: number): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  const canonUserId = toCanonicalUuid(holding.user_id);
  try {
    // 1. Upsert holding
    await admin.from("holdings").upsert(
      {
        user_id: canonUserId,
        meme_id: holding.meme_id,
        quantity: holding.quantity,
        invested_amount: holding.invested_amount,
        avg_entry_price: holding.avg_entry_price,
        realized_pnl: holding.realized_pnl,
        last_notif_value: holding.last_notif_value || 0,
        last_notif_at: holding.last_notif_at || 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,meme_id" }
    );

    // 2. Update user profile aura balance if provided
    if (userBalance != null) {
      await admin.from("profiles").update({ aura_balance: userBalance, updated_at: new Date().toISOString() }).eq("id", canonUserId);
    }
  } catch (err) {
    console.error("Supabase syncHolding error:", err);
  }
}

/** Sync a transaction (buy or sell) to Supabase PostgreSQL */
export async function syncTransactionToSupabase(tx: Transaction): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  const canonUserId = toCanonicalUuid(tx.user_id);
  try {
    await admin.from("transactions").insert({
      id: tx.id && tx.id.length === 36 ? tx.id : undefined,
      user_id: canonUserId,
      meme_id: tx.meme_id,
      type: tx.type,
      units: tx.units,
      price: tx.price,
      total_value: tx.total_value,
      realized_pnl: tx.realized_pnl ?? null,
      cost_basis: tx.cost_basis ?? null,
      created_at: tx.created_at,
    });
  } catch (err) {
    console.error("Supabase syncTransaction error:", err);
  }
}

/** Sync updated meme pricing & metrics to Supabase PostgreSQL */
export async function syncMemeToSupabase(meme: Meme): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  const canonCreatorId = toCanonicalUuid(meme.creator_id);
  try {
    await admin.from("memes").upsert(
      {
        id: meme.id,
        creator_id: canonCreatorId,
        caption: meme.caption,
        description: meme.description || "",
        category: meme.category,
        tags: meme.tags,
        media_type: meme.media_type,
        media_url: meme.media_url,
        thumbnail_url: meme.thumbnail_url,
        width: meme.width,
        height: meme.height,
        duration: meme.duration,
        initial_price: meme.initial_price,
        current_price: meme.current_price,
        net_invested: meme.net_invested,
        total_invested: meme.total_invested,
        total_sell_value: meme.total_sell_value,
        open_price_24h: meme.open_price_24h,
        all_time_high: meme.all_time_high,
        volume_24h: meme.volume_24h,
        momentum: meme.momentum,
        views: meme.views,
        saves: meme.saves,
        remix_count: meme.remix_count,
        battle_wins: meme.battle_wins,
        battle_losses: meme.battle_losses,
        status: meme.status,
        parent_meme_id: meme.parent_meme_id,
        epitaph: meme.epitaph,
        source: meme.source,
        source_url: meme.source_url,
        source_handle: meme.source_handle,
        dna_humor: meme.dna.humor,
        dna_chaos: meme.dna.chaos,
        dna_relatability: meme.dna.relatability,
        dna_brainrot: meme.dna.brainrot,
        dna_wholesome: meme.dna.wholesome,
        dna_absurdity: meme.dna.absurdity,
        created_at: meme.created_at,
        updated_at: meme.updated_at,
      },
      { onConflict: "id" }
    );
  } catch (err) {
    console.error("Supabase syncMeme error:", err);
  }
}

/** Sync user profile updates (level, xp, aura, bio) to Supabase PostgreSQL */
export async function syncProfileToSupabase(p: Profile): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  const canonId = toCanonicalUuid(p.id);
  try {
    await admin.from("profiles").upsert(
      {
        id: canonId,
        email: p.email,
        username: p.username,
        display_name: p.display_name,
        avatar_bg: p.avatar_bg,
        bio: p.bio || "",
        aura_balance: p.aura_balance,
        reputation: p.reputation,
        level: p.level,
        xp: p.xp,
        role: p.role,
        is_seed: p.is_seed,
        interests: p.interests,
        onboarded: p.onboarded,
        suspended: p.suspended,
        hunter_score: p.hunter.score,
        early_discoveries: p.hunter.early_discoveries,
        successful_picks: p.hunter.successful_picks,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  } catch (err) {
    console.error("Supabase syncProfile error:", err);
  }
}

/** Sync comment to Supabase PostgreSQL */
export async function syncCommentToSupabase(comment: Comment): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  const canonUserId = toCanonicalUuid(comment.user_id);
  try {
    await admin.from("comments").upsert(
      {
        id: comment.id,
        meme_id: comment.meme_id,
        user_id: canonUserId,
        parent_id: comment.parent_id,
        content: comment.content,
        created_at: comment.created_at,
      },
      { onConflict: "id" }
    );
  } catch (err) {
    console.error("Supabase syncComment error:", err);
  }
}

const CLOUD_STATE_FILE = "cloud_db.json";

/** Persist authoritative cloud snapshot to Supabase Cloud Storage (ensures serverless resilience) */
export async function persistSnapshotToSupabase(state: DB): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  try {
    const serialized = Buffer.from(JSON.stringify(state));
    await admin.storage.from("system").upload(CLOUD_STATE_FILE, serialized, {
      contentType: "application/json",
      upsert: true,
    });
  } catch (err) {
    console.warn("Supabase persistSnapshot warning:", err);
  }
}

/** Hydrate in-memory state from Supabase on cold-start/serverless boot */
export async function hydrateFromSupabase(): Promise<DB | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  try {
    // Query authoritative PostgreSQL tables directly — real Supabase data ONLY
    const { data: dbMemes, error: memeErr } = await admin.from("memes").select("*").order("created_at", { ascending: false });
    if (memeErr) console.error("[Supabase Sync] Error fetching memes:", memeErr);
    const { data: dbProfiles } = await admin.from("profiles").select("*");
    const { data: dbHoldings } = await admin.from("holdings").select("*");
    const { data: dbTransactions } = await admin.from("transactions").select("*");
    const { data: dbComments } = await admin.from("comments").select("*");

    console.log(`[Supabase Sync] Hydrated ${dbMemes?.length || 0} real memes and ${dbProfiles?.length || 0} profiles from PostgreSQL.`);
    // Form structured DB object
    const reconstructedMemes: Meme[] = (dbMemes || []).map((m: any) => ({
        id: m.id,
        creator_id: m.creator_id,
        caption: m.caption,
        description: m.description || "",
        category: m.category,
        tags: m.tags || [],
        media_type: m.media_type,
        media_url: m.media_url,
        thumbnail_url: m.thumbnail_url || m.media_url,
        width: m.width || 800,
        height: m.height || 800,
        duration: m.duration,
        initial_price: Number(m.initial_price) || 20,
        current_price: Number(m.current_price) || 20,
        net_invested: Number(m.net_invested) || 0,
        total_invested: Number(m.total_invested) || 0,
        total_sell_value: Number(m.total_sell_value) || 0,
        open_price_24h: Number(m.open_price_24h) || 20,
        all_time_high: Number(m.all_time_high) || 20,
        volume_24h: Number(m.volume_24h) || 0,
        momentum: Number(m.momentum) || 0.35,
        views: Number(m.views) || 0,
        saves: Number(m.saves) || 0,
        remix_count: Number(m.remix_count) || 0,
        battle_wins: Number(m.battle_wins) || 0,
        battle_losses: Number(m.battle_losses) || 0,
        status: m.status || "live",
        parent_meme_id: m.parent_meme_id,
        epitaph: m.epitaph,
        source: m.source || "original",
        source_url: m.source_url,
        source_handle: m.source_handle,
        dna: {
          humor: m.dna_humor || 50,
          chaos: m.dna_chaos || 50,
          relatability: m.dna_relatability || 50,
          brainrot: m.dna_brainrot || 50,
          wholesome: m.dna_wholesome || 50,
          absurdity: m.dna_absurdity || 50,
        },
        created_at: m.created_at,
        updated_at: m.updated_at,
      }));

      const reconstructedUsers: Profile[] = (dbProfiles || []).map((p: any) => ({
        id: p.id,
        email: p.email,
        password_hash: "",
        username: p.username,
        display_name: p.display_name || p.username,
        avatar_bg: p.avatar_bg || "#7C4DFF",
        bio: p.bio || "",
        aura_balance: Number(p.aura_balance) || 100,
        reputation: p.reputation || 0,
        level: p.level || 1,
        xp: p.xp || 0,
        role: p.role || "user",
        is_seed: p.is_seed || false,
        interests: p.interests || [],
        onboarded: p.onboarded || false,
        suspended: p.suspended || false,
        hunter: {
          score: p.hunter_score || 0,
          early_discoveries: p.early_discoveries || 0,
          successful_picks: p.successful_picks || 0,
        },
        created_at: p.created_at,
      }));

      const reconstructedHoldings: Holding[] = (dbHoldings || []).map((h: any) => ({
        id: h.id,
        user_id: h.user_id,
        meme_id: h.meme_id,
        quantity: Number(h.quantity),
        invested_amount: Number(h.invested_amount),
        avg_entry_price: Number(h.avg_entry_price),
        realized_pnl: Number(h.realized_pnl) || 0,
        last_notif_value: Number(h.last_notif_value) || 0,
        last_notif_at: Number(h.last_notif_at) || 0,
        created_at: h.created_at,
        updated_at: h.updated_at,
      }));

      const reconstructedTransactions: Transaction[] = (dbTransactions || []).map((t: any) => ({
        id: t.id,
        user_id: t.user_id,
        meme_id: t.meme_id,
        type: t.type,
        units: Number(t.units),
        price: Number(t.price),
        total_value: Number(t.total_value),
        realized_pnl: t.realized_pnl ? Number(t.realized_pnl) : null,
        cost_basis: t.cost_basis ? Number(t.cost_basis) : null,
        created_at: t.created_at,
      }));

      const reconstructedComments: Comment[] = (dbComments || []).map((c: any) => ({
        id: c.id,
        meme_id: c.meme_id,
        user_id: c.user_id,
        parent_id: c.parent_id,
        content: c.content,
        created_at: c.created_at,
      }));

      return {
        users: reconstructedUsers,
        memes: reconstructedMemes,
        holdings: reconstructedHoldings,
        transactions: reconstructedTransactions,
        price_history: {},
        comments: reconstructedComments,
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
        achievements: [],
        user_achievements: [],
        user_daily: [],
        meta: { last_tick: Date.now(), tick_count: 0, version: 2 },
      };
  } catch (err) {
    console.error("Supabase hydration error:", err);
  }
  return null;
}
