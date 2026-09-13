import { NextRequest } from "next/server";
import { db, save } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { publicUser } from "@/lib/server/views";

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const body = await req.json();
  if (body.display_name != null) {
    const dn = String(body.display_name).trim();
    if (dn.length < 2 || dn.length > 30) return fail("Display name must be 2–30 characters.");
    user.display_name = dn;
  }
  if (body.bio != null) user.bio = String(body.bio).slice(0, 160);
  if (body.avatar_bg != null && /^#[0-9A-Fa-f]{6}$/.test(String(body.avatar_bg))) user.avatar_bg = String(body.avatar_bg);
  if (body.interests != null && Array.isArray(body.interests)) user.interests = body.interests.slice(0, 10);
  save();
  return ok({ user: publicUser(user, user.id) });
}
