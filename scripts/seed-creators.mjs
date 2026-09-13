import fs from "fs";
import path from "path";
import crypto from "crypto";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

const CREATORS = [
  {
    username: "dank_vault",
    display_name: "The Dank Vault 🏛️",
    email: "dankvault@aura.app",
    avatar_bg: "#7C4DFF",
    bio: "Curating top-tier dank memes. Double-tap to invest early.",
    interests: ["chaos", "gaming"],
  },
  {
    username: "tech_roasts",
    display_name: "Tech Roasts 💻",
    email: "techroasts@aura.app",
    avatar_bg: "#315BEF",
    bio: "Shipping bugs to production since Friday 5pm.",
    interests: ["programming", "technology"],
  },
  {
    username: "daily_dose",
    display_name: "Daily Dose ☕",
    email: "dailydose@aura.app",
    avatar_bg: "#F59E0B",
    bio: "Your daily dose of relatable everyday humor.",
    interests: ["college", "workplace"],
  },
  {
    username: "anime_senpai",
    display_name: "Anime Senpai ⛩️",
    email: "animesenpai@aura.app",
    avatar_bg: "#FF6B57",
    bio: "Tournament arcs, plot twists, and power-up memes.",
    interests: ["anime", "gaming"],
  },
  {
    username: "desi_vibes",
    display_name: "Desi Vibes 🫖",
    email: "desivibes@aura.app",
    avatar_bg: "#22A565",
    bio: "Cutting chai, Bollywood drama, and hostel survival.",
    interests: ["indian", "bollywood", "college"],
  },
  {
    username: "crypto_chuckle",
    display_name: "Crypto Chuckle 🪙",
    email: "cryptochuckle@aura.app",
    avatar_bg: "#0EA5E9",
    bio: "Buying the top, holding the bag, laughing through the charts.",
    interests: ["technology", "workplace"],
  },
  {
    username: "campus_life",
    display_name: "Campus Life 🎒",
    email: "campuslife@aura.app",
    avatar_bg: "#9333EA",
    bio: "8 AM lectures are a scam. Attendance 40%, Aura 100%.",
    interests: ["college", "workplace"],
  },
  {
    username: "absurd_humor",
    display_name: "Absurd Humor 🌀",
    email: "absurdhumor@aura.app",
    avatar_bg: "#E5484D",
    bio: "Zero logic. Pure chaos. Brainrot elevated to art.",
    interests: ["chaos"],
  },
  {
    username: "reels_central",
    display_name: "Reels Central 🎬",
    email: "reelscentral@aura.app",
    avatar_bg: "#FF7BAC",
    bio: "Short-form video memes. Swipe up, invest Aura.",
    interests: ["college", "chaos", "bollywood"],
  },
  {
    username: "gaming_glitches",
    display_name: "Gaming Glitches 🎮",
    email: "gamingglitches@aura.app",
    avatar_bg: "#C8FF3D",
    bio: "NPC moments, rage quits, and broken physics.",
    interests: ["gaming", "technology"],
  },
];

const SHARED_PASSWORD = "MemeCreator2026!";
const password_hash = hashPassword(SHARED_PASSWORD);

const DB_FILE = path.join(process.cwd(), ".data", "db.json");

if (!fs.existsSync(DB_FILE)) {
  console.error("Database file not found at:", DB_FILE);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
db.users = db.users || [];

let added = 0;
for (const c of CREATORS) {
  const existingIdx = db.users.findIndex((u) => u.username === c.username || u.email === c.email);
  const userRecord = {
    id: `u_${c.username}`,
    email: c.email,
    password_hash,
    username: c.username,
    display_name: c.display_name,
    avatar_bg: c.avatar_bg,
    bio: c.bio,
    aura_balance: 100,
    reputation: 100,
    level: 1,
    xp: 0,
    role: "admin", // All 10 creators get full posting and admin rights
    is_seed: false,
    interests: c.interests,
    onboarded: true,
    suspended: false,
    hunter: { score: 50, early_discoveries: 0, successful_picks: 0 },
    created_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    db.users[existingIdx] = { ...db.users[existingIdx], ...userRecord };
  } else {
    db.users.push(userRecord);
    added++;
  }
}

fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log(`✅ Successfully provisioned ${CREATORS.length} meme creator accounts (${added} new)!`);
console.log(`🔑 All 10 accounts use password: ${SHARED_PASSWORD}`);
