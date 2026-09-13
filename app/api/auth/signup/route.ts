import { NextRequest, NextResponse } from "next/server";
import { db, uid, save } from "@/lib/server/db";
import { hashPassword, createSession, SESSION_COOKIE, STARTER_AURA } from "@/lib/server/auth";
import { ok, fail, humanError, rateLimit } from "@/lib/server/http";
import { publicUser } from "@/lib/server/views";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`signup:${ip}`, 10, 15 * 60_000)) return fail("Too many attempts. Take a breather.", 429);
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const display_name = String(body.display_name ?? "").trim() || username;

    if (!/^\S+@\S+\.\S+$/.test(email)) return fail("That email doesn't look right.");
    if (!/^[a-z0-9_]{3,20}$/.test(username))
      return fail("Username must be 3–20 chars: letters, numbers, underscores.");
    if (password.length < 6) return fail("Password needs at least 6 characters.");

    const d = db();
    if (d.users.some((u) => u.email === email)) return fail("That email is already on AURA.");
    if (d.users.some((u) => u.username === username)) return fail("That username is taken.");

    const isFirstUser = d.users.length === 0;
    const colors = ["#7C4DFF", "#315BEF", "#FF6B57", "#22A565", "#F59E0B", "#E5484D"];
    const user = {
      id: uid(), email, password_hash: hashPassword(password), username,
      display_name, avatar_bg: colors[Math.floor(Math.random() * colors.length)],
      bio: "", aura_balance: STARTER_AURA, reputation: 0, level: 1, xp: 0,
      role: isFirstUser ? ("admin" as const) : ("user" as const), is_seed: false, interests: [], onboarded: false, suspended: false,
      hunter: { score: 0, early_discoveries: 0, successful_picks: 0 },
      created_at: new Date().toISOString(),
    };
    d.users.push(user);
    save();
    const token = createSession(user.id);
    const res = NextResponse.json({ user: publicUser(user, user.id), starter_aura: STARTER_AURA });
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86_400 });
    res.cookies.set("logged_out", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return fail(humanError(e), 500);
  }
}
