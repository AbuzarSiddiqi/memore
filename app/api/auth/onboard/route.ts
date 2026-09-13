import { NextRequest } from "next/server";
import { db, save } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { publicUser } from "@/lib/server/views";
import { syncProfileToSupabase } from "@/lib/server/sync";

const VALID = ["college", "gaming", "anime", "sports", "bollywood", "programming", "technology", "work", "indian", "random/chaos"];

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const body = await req.json().catch(() => ({}));
  const interests = Array.isArray(body?.interests) ? body.interests.filter((i: string) => VALID.includes(i)) : [];
  user.interests = interests.length > 0 ? interests : user.interests;
  user.onboarded = true;
  save();
  await syncProfileToSupabase(user);
  return ok({ user: publicUser(user, user.id) });
}
