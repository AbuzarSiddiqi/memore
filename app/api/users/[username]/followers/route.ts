import { NextRequest } from "next/server";
import { db, ensureHydrated } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { publicUser } from "@/lib/server/views";
import { userBySlug } from "@/lib/server/auth";
import { toCanonicalUuid } from "@/lib/server/sync";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  await ensureHydrated();
  const viewer = await requireUser();
  const { username } = await ctx.params;
  const target = userBySlug(username);
  if (!target) return fail("User not found.", 404);

  const d = db();
  const canonTargetId = toCanonicalUuid(target.id);
  const followerRels = d.follows.filter((f) => toCanonicalUuid(f.following_id) === canonTargetId);
  const followerUsers = followerRels
    .map((f) => {
      const u = d.users.find((user) => toCanonicalUuid(user.id) === toCanonicalUuid(f.follower_id));
      return u ? publicUser(u, viewer?.id) : null;
    })
    .filter(Boolean);

  return ok({
    followers: followerUsers,
    total: followerUsers.length,
  });
}
