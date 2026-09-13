// Authentication: scrypt password hashing + stateless cryptographically signed cookie sessions.
import crypto from "crypto";
import { cookies } from "next/headers";
import { db, save, uid } from "./db";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "../types";

export const SESSION_COOKIE = "aura_session";
const DAY = 86_400_000;
const SESSION_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || "memore-secret-key-2026-aura-auth";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

/** Create a stateless cryptographically signed session token that survives server restarts */
export function createSession(userId: string): string {
  const exp = Date.now() + 30 * DAY; // 30 days valid
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  const token = `${payload}.${sig}`;
  
  db().sessions.push({ token, user_id: userId, created_at: new Date().toISOString() });
  if (db().sessions.length > 400) db().sessions.splice(0, db().sessions.length - 400);
  save();
  return token;
}

export function verifySessionToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const [userId, expStr, sig] = parts;
      const exp = parseInt(expStr, 10);
      if (isNaN(exp) || Date.now() > exp) return null;
      const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(`${userId}.${expStr}`).digest("hex");
      if (crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) {
        return userId;
      }
    }
  } catch {}
  // Fallback for legacy random tokens
  const session = db().sessions.find((s) => s.token === token);
  return session ? session.user_id : null;
}

export function destroySession(token: string) {
  const d = db();
  d.sessions = d.sessions.filter((s) => s.token !== token);
  save();
}

export async function currentUser(): Promise<Profile | null> {
  const store = await cookies();
  const isLoggedOut = store.get("logged_out")?.value === "1";
  if (isLoggedOut) {
    return null;
  }

  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const userId = verifySessionToken(token);
    if (userId) {
      let user = db().users.find((u) => u.id === userId);
      if (!user) {
        try {
          const admin = createAdminClient();
          if (admin) {
            const { data: profData } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
            if (profData) {
              user = {
                id: profData.id,
                email: profData.email,
                password_hash: "",
                username: profData.username,
                display_name: profData.display_name || profData.username,
                avatar_bg: profData.avatar_bg || "#7C4DFF",
                bio: profData.bio || "",
                aura_balance: Number(profData.aura_balance) || STARTER_AURA,
                reputation: profData.reputation || 0,
                level: profData.level || 1,
                xp: profData.xp || 0,
                role: profData.role || "user",
                is_seed: profData.is_seed || false,
                interests: profData.interests || [],
                onboarded: profData.onboarded ?? true,
                suspended: profData.suspended ?? false,
                hunter: { score: profData.hunter_score || 0, early_discoveries: profData.early_discoveries || 0, successful_picks: profData.successful_picks || 0 },
                created_at: profData.created_at || new Date().toISOString(),
              };
              db().users.push(user);
            }
          }
        } catch {}
      }
      if (user && !user.suspended) return user;
    }
  }

  // Check Supabase Auth session (handles Google OAuth & Supabase Auth users)
  try {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { data: { user: sbUser } } = await supabase.auth.getUser();
      if (sbUser && sbUser.email) {
        let user = db().users.find((u) => u.id === sbUser.id || u.email.toLowerCase() === sbUser.email!.toLowerCase());
        if (!user) {
          // Attempt to fetch existing profile from Supabase PostgreSQL
          let profData: any = null;
          try {
            const { data } = await supabase.from("profiles").select("*").or(`id.eq.${sbUser.id},email.eq.${sbUser.email.toLowerCase()}`).single();
            profData = data;
          } catch {}

          if (profData) {
            user = {
              id: profData.id,
              email: profData.email,
              password_hash: "",
              username: profData.username,
              display_name: profData.display_name || profData.username,
              avatar_bg: profData.avatar_bg || "#7C4DFF",
              bio: profData.bio || "",
              aura_balance: Number(profData.aura_balance) || STARTER_AURA,
              reputation: profData.reputation || 0,
              level: profData.level || 1,
              xp: profData.xp || 0,
              role: profData.role || "user",
              is_seed: profData.is_seed || false,
              interests: profData.interests || [],
              onboarded: profData.onboarded || false,
              suspended: profData.suspended || false,
              hunter: { score: profData.hunter_score || 0, early_discoveries: profData.early_discoveries || 0, successful_picks: profData.successful_picks || 0 },
              created_at: profData.created_at || new Date().toISOString(),
            };
          } else {
            const rawName = sbUser.user_metadata?.username || sbUser.email.split("@")[0] || `user_${sbUser.id.slice(0, 5)}`;
            const username = rawName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
            user = {
              id: sbUser.id,
              email: sbUser.email.toLowerCase(),
              password_hash: "",
              username,
              display_name: sbUser.user_metadata?.display_name || sbUser.user_metadata?.full_name || username,
              avatar_bg: sbUser.user_metadata?.avatar_bg || "#7C4DFF",
              bio: "",
              aura_balance: STARTER_AURA,
              reputation: 0,
              level: 1,
              xp: 0,
              role: "user",
              is_seed: false,
              interests: [],
              onboarded: false,
              suspended: false,
              hunter: { score: 0, early_discoveries: 0, successful_picks: 0 },
              created_at: new Date().toISOString(),
            };
          }
          db().users.push(user);
          save();
        }
        if (!user.suspended) return user;
      }
    }
  } catch {
    // Supabase check failed or not configured, continue with local
  }

  return null;
}

export function userBySlug(username: string): Profile | undefined {
  return db().users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

export function newUserId() {
  return uid();
}

export const STARTER_AURA = 100;
