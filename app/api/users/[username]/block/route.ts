import { NextRequest } from "next/server";
import { db, save } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { userBySlug } from "@/lib/server/auth";

/** Block/unblock a user. Blocked users' conversations vanish from your list
 * and they can't start new ones — this survives the 24-hour wipe. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const { username } = await ctx.params;
  const target = userBySlug(username);
  if (!target) return fail("That user doesn't exist.", 404);
  if (target.id === user.id) return fail("You can't block yourself.");

  const blocked = new Set(user.blocked ?? []);
  if (blocked.has(target.id)) {
    blocked.delete(target.id);
    user.blocked = [...blocked];
  } else {
    blocked.add(target.id);
    user.blocked = [...blocked];
  }
  save();
  return ok({ blocked: blocked.has(target.id) });
}
