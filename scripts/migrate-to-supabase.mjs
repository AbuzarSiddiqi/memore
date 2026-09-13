import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mnfasawmfajfwquhymyl.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!key) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CREATOR_UUID_MAP = {
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

function toCanonicalUuid(userId) {
  return CREATOR_UUID_MAP[userId] || userId;
}

async function migrate() {
  console.log("🚀 Starting MEMORE / AURA Database Migration to Supabase Cloud...");
  console.log("Connecting to Supabase at:", url);

  const DB_FILE = path.join(process.cwd(), ".data", "db.json");
  if (!fs.existsSync(DB_FILE)) {
    console.error("No local .data/db.json found.");
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

  // Normalize IDs in memory
  for (const u of db.users) {
    if (CREATOR_UUID_MAP[u.id]) {
      const oldId = u.id;
      u.id = CREATOR_UUID_MAP[oldId];
      for (const m of db.memes) if (m.creator_id === oldId) m.creator_id = u.id;
      for (const h of db.holdings) if (h.user_id === oldId) h.user_id = u.id;
      for (const t of db.transactions) if (t.user_id === oldId) t.user_id = u.id;
      for (const c of db.comments) if (c.user_id === oldId) c.user_id = u.id;
    }
  }

  // 1. Sync Profiles
  console.log(`\n1. Syncing ${db.users.length} profiles to Supabase...`);
  for (const u of db.users) {
    const { error } = await supabase.from("profiles").upsert(
      {
        id: u.id,
        email: u.email,
        username: u.username,
        display_name: u.display_name,
        avatar_bg: u.avatar_bg,
        bio: u.bio || "",
        aura_balance: u.aura_balance,
        reputation: u.reputation || 0,
        level: u.level || 1,
        xp: u.xp || 0,
        role: u.role || "user",
        is_seed: u.is_seed || false,
        interests: u.interests || [],
        onboarded: u.onboarded || false,
        suspended: u.suspended || false,
        hunter_score: u.hunter?.score || 0,
        early_discoveries: u.hunter?.early_discoveries || 0,
        successful_picks: u.hunter?.successful_picks || 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) console.error(`Error syncing user ${u.username}:`, error.message);
  }
  console.log("✅ Profiles synchronized!");

  // 2. Sync Memes
  console.log(`\n2. Syncing ${db.memes.length} memes to Supabase...`);
  for (const m of db.memes) {
    const { error } = await supabase.from("memes").upsert(
      {
        id: m.id,
        creator_id: toCanonicalUuid(m.creator_id),
        caption: m.caption,
        description: m.description || "",
        category: m.category,
        tags: m.tags || [],
        media_type: m.media_type,
        media_url: m.media_url,
        thumbnail_url: m.thumbnail_url,
        width: m.width,
        height: m.height,
        duration: m.duration,
        initial_price: m.initial_price,
        current_price: m.current_price,
        net_invested: m.net_invested,
        total_invested: m.total_invested,
        total_sell_value: m.total_sell_value,
        open_price_24h: m.open_price_24h,
        all_time_high: m.all_time_high,
        volume_24h: m.volume_24h,
        momentum: m.momentum,
        views: m.views,
        saves: m.saves,
        remix_count: m.remix_count,
        battle_wins: m.battle_wins,
        battle_losses: m.battle_losses,
        status: m.status,
        parent_meme_id: m.parent_meme_id,
        epitaph: m.epitaph,
        source: m.source,
        source_url: m.source_url,
        source_handle: m.source_handle,
        dna_humor: m.dna.humor,
        dna_chaos: m.dna.chaos,
        dna_relatability: m.dna.relatability,
        dna_brainrot: m.dna.brainrot,
        dna_wholesome: m.dna.wholesome,
        dna_absurdity: m.dna.absurdity,
        created_at: m.created_at,
        updated_at: m.updated_at,
      },
      { onConflict: "id" }
    );
    if (error) console.error(`Error syncing meme ${m.id}:`, error.message);
  }
  console.log("✅ Memes synchronized!");

  // 3. Sync Holdings
  console.log(`\n3. Syncing ${db.holdings.length} holdings to Supabase...`);
  for (const h of db.holdings) {
    const { error } = await supabase.from("holdings").upsert(
      {
        user_id: toCanonicalUuid(h.user_id),
        meme_id: h.meme_id,
        quantity: h.quantity,
        invested_amount: h.invested_amount,
        avg_entry_price: h.avg_entry_price,
        realized_pnl: h.realized_pnl || 0,
        last_notif_value: h.last_notif_value || 0,
        last_notif_at: h.last_notif_at || 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,meme_id" }
    );
    if (error) console.error(`Error syncing holding ${h.user_id} - ${h.meme_id}:`, error.message);
  }
  console.log("✅ Holdings synchronized!");

  // 4. Sync Transactions
  console.log(`\n4. Syncing ${db.transactions.length} transactions to Supabase...`);
  const BATCH_SIZE = 50;
  for (let i = 0; i < db.transactions.length; i += BATCH_SIZE) {
    const batch = db.transactions.slice(i, i + BATCH_SIZE).map((t) => ({
      user_id: toCanonicalUuid(t.user_id),
      meme_id: t.meme_id,
      type: t.type,
      units: t.units,
      price: t.price,
      total_value: t.total_value,
      realized_pnl: t.realized_pnl || null,
      cost_basis: t.cost_basis || null,
      created_at: t.created_at,
    }));
    const { error } = await supabase.from("transactions").insert(batch);
    if (error) console.error(`Error inserting transactions batch ${i}:`, error.message);
  }
  console.log("✅ Transactions synchronized!");

  // 5. Sync Comments
  console.log(`\n5. Syncing ${db.comments.length} comments to Supabase...`);
  for (const c of db.comments) {
    const { error } = await supabase.from("comments").upsert(
      {
        id: c.id && c.id.length === 36 ? c.id : undefined,
        meme_id: c.meme_id,
        user_id: toCanonicalUuid(c.user_id),
        parent_id: c.parent_id || null,
        content: c.content,
        created_at: c.created_at,
      },
      { onConflict: "id" }
    );
    if (error) console.error(`Error syncing comment ${c.id}:`, error.message);
  }
  console.log("✅ Comments synchronized!");

  // 6. Upload authoritative Cloud Snapshot for Serverless Resiliency
  console.log("\n6. Uploading cloud snapshot to Supabase Storage...");
  const snapshotData = Buffer.from(JSON.stringify(db, null, 2));
  const { error: snapErr } = await supabase.storage.from("system").upload("cloud_db.json", snapshotData, {
    contentType: "application/json",
    upsert: true,
  });
  if (snapErr) {
    console.error("Snapshot upload error:", snapErr.message);
  } else {
    console.log("✅ Cloud snapshot persisted to system/cloud_db.json");
  }

  // Save the normalized local file too
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  console.log("✅ Local db.json updated with canonical UUIDs!");

  // 7. Verify live counts
  console.log("\n--- Live Verification ---");
  const tables = ["profiles", "memes", "holdings", "transactions", "comments"];
  for (const t of tables) {
    const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
    console.log(`Supabase ${t}: ${count} rows`);
  }
  console.log("\n🎉 Full migration complete! Database is now 100% production cloud-connected!");
}

migrate().catch(console.error);
