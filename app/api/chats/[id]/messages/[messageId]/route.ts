import { NextRequest } from "next/server";
import { requireUser, ok, fail, rateLimit } from "@/lib/server/http";
import { unsendMessage, expireChats } from "@/lib/server/chats";

// DELETE = unsend: the message is removed for everyone, permanently.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; messageId: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  if (!rateLimit(`chat-unsend:${user.id}`, 20, 60_000)) return fail("Slow down.", 429);
  await expireChats();
  const { id, messageId } = await ctx.params;
  const result = await unsendMessage(user, id, messageId);
  if ("error" in result) return fail(result.error, result.status ?? 400);
  return ok(result);
}
