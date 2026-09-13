// Cloud Synchronization Service — bridges MEMORE in-memory services to Supabase PostgreSQL & Storage.
// Ensures that investments, balances, memes, and profiles are persisted globally and fetchable across any device.
import { createAdminClient } from "@/lib/supabase/admin";
import type { DB, Holding, Meme, Profile, Transaction, Comment } from "../types";

export const CREATOR_UUID_MAP: Record<string, string> = {
  u_dank_vault: "dc588c3f-ec55-4ef0-ab0c-6ce8fa748be7",
  u_tech_roasts: "b364e151-c849-4c05-961d-f2a03733a93b",
  u_daily_dose: "40a87765-5e7a-4e77-a195-4b6815cec647",
  u_anime_senpai: "928515e7-e012-41a6-8e27-13a89a75cffa",
  u_desi_vibes: "ce36bbcd-f3f5-49c9-902b-cfed2bee425d",
  u_crypto_chuckle: "2e3c58a5-3627-45ff-869b-6aab8e037973",
  u_campus_life: "5ab796b8-e4c5-48b6-aa1c-0c17ffb91753",
  u_absurd_humor: "c3a95623-310b-4306-a991-b2217b493f65",
  u_reels_central: "15c81a0a-be0e-453b-b8fe-9b4a803e531f",
  u_gaming_glitches: "2de8fd64-f05e-45d2-930d-fd1e6e331f5a",
};

export function toCanonicalUuid(userId: string): string {
  return CREATOR_UUID_MAP[userId] || userId;
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
    // 1. Try downloading cloud state snapshot
    const { data, error } = await admin.storage.from("system").download(CLOUD_STATE_FILE);
    if (!error && data) {
      const text = await data.text();
      const parsed = JSON.parse(text) as DB;
      if (parsed && Array.isArray(parsed.memes) && Array.isArray(parsed.users)) {
        return parsed;
      }
    }

    // 2. Alternatively, reconstruct state directly from PostgreSQL tables
    const { data: dbMemes } = await admin.from("memes").select("*");
    const { data: dbProfiles } = await admin.from("profiles").select("*");
    const { data: dbHoldings } = await admin.from("holdings").select("*");
    const { data: dbTransactions } = await admin.from("transactions").select("*");
    const { data: dbComments } = await admin.from("comments").select("*");

    if (dbMemes && dbMemes.length > 0) {
      console.log(`[Supabase Sync] Hydrated ${dbMemes.length} memes and ${dbProfiles?.length || 0} profiles from PostgreSQL.`);
      // Form structured DB object
      const reconstructedMemes: Meme[] = dbMemes.map((m: any) => ({
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
    }
  } catch (err) {
    console.error("Supabase hydration error:", err);
  }
  return null;
}
