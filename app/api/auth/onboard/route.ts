import { NextRequest } from "next/server";
import { db, save } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { publicUser } from "@/lib/server/views";

const VALID = ["college", "gaming", "anime", "sports", "bollywood", "programming", "technology", "work", "indian", "random/chaos"];

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const body = await req.json();
  const interests = Array.isArray(body.interests) ? body.interests.filter((i: string) => VALID.includes(i)) : [];
  user.interests = interests;
  user.onboarded = true;
  save();
  return ok({ user: publicUser(user, user.id) });
}
