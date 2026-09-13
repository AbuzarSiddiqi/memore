import { NextRequest } from "next/server";
import { db, save } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { publicUser } from "@/lib/server/views";
import { userBySlug } from "@/lib/server/auth";
import { pushNotification } from "@/lib/server/notify";

export async function POST(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const { username } = await ctx.params;
  const target = userBySlug(username);
  if (!target) return fail("That user doesn't exist.", 404);
  if (target.id === user.id) return fail("You already follow yourself. Metaphysically.");

  // The client may send its intent ({ follow: true/false }) so a stale UI
  // label can never cause an accidental unfollow on the first click.
  // Without a body the endpoint keeps the old toggle behavior.
  const body = await req.json().catch(() => ({}));
  const wantFollow = typeof body.follow === "boolean" ? body.follow : null;

  const d = db();
  const existing = d.follows.find((f) => f.follower_id === user.id && f.following_id === target.id);
  if (existing && wantFollow !== true) {
    d.follows = d.follows.filter((f) => f !== existing);
    save();
    return ok({ following: false });
  }
  if (!existing) {
    d.follows.push({ follower_id: user.id, following_id: target.id, created_at: new Date().toISOString() });
    pushNotification(target.id, "follow", `${user.display_name} followed you`, "Follow because they find great memes.", null);
    save();
  }
  return ok({ following: true });
}
