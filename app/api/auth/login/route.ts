import { NextRequest, NextResponse } from "next/server";
import { db, ensureHydrated } from "@/lib/server/db";
import { verifyPassword, createSession, SESSION_COOKIE, STARTER_AURA } from "@/lib/server/auth";
import { ok, fail, humanError, rateLimit } from "@/lib/server/http";
import { publicUser } from "@/lib/server/views";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`login:${ip}`, 15, 15 * 60_000)) return fail("Too many attempts. Take a breather.", 429);
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    await ensureHydrated();
    const d = db();
    let user = d.users.find((u) => u.email === email);

    let authenticated = false;
    if (user && user.password_hash && verifyPassword(password, user.password_hash)) {
      authenticated = true;
    }

    // Verify against Supabase Auth (supports all Supabase-provisioned admin accounts)
    if (!authenticated) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const admin = createAdminClient();
        if (admin) {
          const { data: authData, error: authErr } = await admin.auth.signInWithPassword({ email, password });
          if (!authErr && authData?.user) {
            authenticated = true;
            if (!user) {
              const { data: prof } = await admin.from("profiles").select("*").eq("id", authData.user.id).maybeSingle();
              if (prof) {
                user = {
                  id: prof.id,
                  email: prof.email,
                  password_hash: "",
                  username: prof.username,
                  display_name: prof.display_name || prof.username,
                  avatar_bg: prof.avatar_bg || "#7C4DFF",
                  bio: prof.bio || "",
                  aura_balance: Number(prof.aura_balance) || STARTER_AURA,
                  reputation: prof.reputation || 0,
                  level: prof.level || 1,
                  xp: prof.xp || 0,
                  role: prof.role || "user",
                  is_seed: prof.is_seed || false,
                  interests: prof.interests || [],
                  onboarded: prof.onboarded ?? true,
                  suspended: prof.suspended ?? false,
                  hunter: { score: prof.hunter_score || 0, early_discoveries: prof.early_discoveries || 0, successful_picks: prof.successful_picks || 0 },
                  created_at: prof.created_at || new Date().toISOString(),
                };
                d.users.push(user);
              }
            }
          }
        }
      } catch (err) {
        console.warn("Supabase Auth login check warning:", err);
      }
    }

    if (!authenticated || !user) {
      return fail("Wrong email or password.");
    }
    if (user.suspended) return fail("This account is suspended.");

    const token = createSession(user.id);
    const res = NextResponse.json({ user: publicUser(user, user.id) });
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86_400 });
    res.cookies.set("logged_out", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return fail(humanError(e), 500);
  }
}
