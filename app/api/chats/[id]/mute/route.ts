import { NextRequest } from "next/server";
import { requireUser, ok, fail } from "@/lib/server/http";
import { toggleMute } from "@/lib/server/chats";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const { id } = await ctx.params;
  const muted = await toggleMute(user, id);
  if (typeof muted !== "boolean") return fail(muted.error, muted.status ?? 400);
  return ok({ muted });
}
