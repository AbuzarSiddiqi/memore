import { NextRequest } from "next/server";
import { db, save } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { publicUser } from "@/lib/server/views";
import { userBySlug } from "@/lib/server/auth";
import { pushNotification } from "@/lib/server/notify";
import { syncFollowToSupabase, deleteFollowFromSupabase, toCanonicalUuid } from "@/lib/server/sync";

export async function POST(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const { username } = await ctx.params;
  const target = userBySlug(username);
  if (!target) return fail("That user doesn't exist.", 404);
  if (target.id === user.id) return fail("You cannot follow yourself.");

  const body = await req.json().catch(() => ({}));
  const wantFollow = typeof body.follow === "boolean" ? body.follow : null;

  const d = db();
  const canonUserId = toCanonicalUuid(user.id);
  const canonTargetId = toCanonicalUuid(target.id);

  const existingIdx = d.follows.findIndex(
    (f) => toCanonicalUuid(f.follower_id) === canonUserId && toCanonicalUuid(f.following_id) === canonTargetId
  );

  let isNowFollowing = false;

  if (existingIdx >= 0 && wantFollow !== true) {
    // Unfollow
    d.follows.splice(existingIdx, 1);
    save();
    await deleteFollowFromSupabase(canonUserId, canonTargetId);
    isNowFollowing = false;
  } else if (existingIdx < 0 && wantFollow !== false) {
    // Follow
    d.follows.push({
      follower_id: canonUserId,
      following_id: canonTargetId,
      created_at: new Date().toISOString(),
    });
    pushNotification(target.id, "follow", `${user.display_name} followed you`, "Followed because they find great memes.", null);
    save();
    await syncFollowToSupabase(canonUserId, canonTargetId);
    isNowFollowing = true;
  } else {
    isNowFollowing = existingIdx >= 0;
  }

  const follower_count = d.follows.filter((f) => toCanonicalUuid(f.following_id) === canonTargetId).length;
  const following_count = d.follows.filter((f) => toCanonicalUuid(f.follower_id) === canonTargetId).length;
  const follows_you = d.follows.some(
    (f) => toCanonicalUuid(f.follower_id) === canonTargetId && toCanonicalUuid(f.following_id) === canonUserId
  );

  return ok({
    following: isNowFollowing,
    follower_count,
    following_count,
    follows_you,
    user: publicUser(target, user.id),
  });
}

