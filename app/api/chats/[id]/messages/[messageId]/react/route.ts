import { NextRequest } from "next/server";
import { requireUser, ok, fail, rateLimit } from "@/lib/server/http";
import { reactToMessage, expireChats } from "@/lib/server/chats";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; messageId: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  if (!rateLimit(`chat-react:${user.id}`, 40, 60_000)) return fail("Easy on the reactions.", 429);
  await expireChats();
  const { id, messageId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const reactionId = typeof body.reaction_id === "string" ? body.reaction_id : "";
  const result = await reactToMessage(user, id, messageId, reactionId);
  if ("error" in result) return fail(result.error, result.status ?? 400);
  return ok(result);
}
