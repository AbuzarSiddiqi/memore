import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/lib/server/auth";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);

  // Sign out of Supabase on the server
  try {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
  } catch {}

  const res = NextResponse.json({ ok: true });
  // Clear aura session
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });

  // Clear all Supabase auth cookies
  const allCookies = store.getAll();
  for (const c of allCookies) {
    if (c.name.startsWith("sb-") || c.name.includes("supabase") || c.name.includes("auth")) {
      res.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
  }

  // Set explicit logged_out marker cookie so currentUser() won't revive session
  res.cookies.set("logged_out", "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86_400 });

  return res;
}
