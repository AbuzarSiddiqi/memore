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
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const CREATORS = [
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

const PASSWORD = "MemeCreator2026!";

async function run() {
  console.log("Connecting to Supabase at:", url);

  // 1. Ensure Storage Bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const hasMemesBucket = buckets?.some((b) => b.name === "memes");
  if (!hasMemesBucket) {
    console.log("Creating public 'memes' storage bucket...");
    await supabase.storage.createBucket("memes", {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/webm"],
    });
    console.log("✅ 'memes' bucket created!");
  } else {
    console.log("✅ 'memes' storage bucket already exists!");
  }

  // 2. Create the 10 Creator Accounts in Supabase Auth
  for (const c of CREATORS) {
    // Check if user already exists
    const { data: existingList } = await supabase.auth.admin.listUsers();
    const existing = existingList?.users?.find((u) => u.email === c.email);

    let userId = existing?.id;
    if (!existing) {
      console.log(`Creating user in Supabase Auth: ${c.email}...`);
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: c.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: {
          username: c.username,
          display_name: c.display_name,
          avatar_bg: c.avatar_bg,
          bio: c.bio,
        },
      });

      if (error) {
        console.error(`Error creating ${c.email}:`, error.message);
        continue;
      }
      userId = created.user?.id;
      console.log(`✅ Created ${c.email} (ID: ${userId})`);
    } else {
      console.log(`User ${c.email} already exists in Auth.`);
    }

    // Ensure profile row exists in public.profiles
    if (userId) {
      await supabase.from("profiles").upsert(
        {
          id: userId,
          email: c.email,
          username: c.username,
          display_name: c.display_name,
          avatar_bg: c.avatar_bg,
          bio: c.bio,
          aura_balance: 100,
          reputation: 100,
          role: "admin",
          onboarded: true,
          interests: c.interests,
        },
        { onConflict: "id" }
      );
    }
  }

  console.log("\n🎉 All 10 creator accounts are provisioned in live Supabase Auth and Profiles!");
  console.log(`🔑 Login Password for all 10: ${PASSWORD}`);
}

run().catch(console.error);
