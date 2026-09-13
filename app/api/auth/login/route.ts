import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { verifyPassword, createSession, SESSION_COOKIE } from "@/lib/server/auth";
import { ok, fail, humanError, rateLimit } from "@/lib/server/http";
import { publicUser } from "@/lib/server/views";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`login:${ip}`, 15, 15 * 60_000)) return fail("Too many attempts. Take a breather.", 429);
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const user = db().users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.password_hash))
      return fail("Wrong email or password.");
    if (user.suspended) return fail("This account is suspended.");
    const token = createSession(user.id);
    const res = NextResponse.json({ user: publicUser(user, user.id) });
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86_400 });
    return res;
  } catch (e) {
    return fail(humanError(e), 500);
  }
}
