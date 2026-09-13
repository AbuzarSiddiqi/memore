import { NextRequest } from "next/server";
import { requireUser, ok, fail, rateLimit } from "@/lib/server/http";
import { ensureHydrated } from "@/lib/server/db";
import { sendMessage, markRead, expireChats, hydrateChats, type SendInput } from "@/lib/server/chats";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureHydrated();
  await hydrateChats();
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  if (!rateLimit(`chat-msg:${user.id}`, 30, 60_000)) return fail("Too many messages. Breathe.", 429);
  expireChats(); // sending into an expired chat is rejected here
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const type: SendInput["type"] = ["text", "post", "image", "video", "sticker"].includes(body.type) ? body.type : "text";
  const input: SendInput = {
    type,
    content: typeof body.content === "string" ? body.content : "",
    post_id: typeof body.post_id === "string" ? body.post_id : undefined,
    media_url: typeof body.media_url === "string" ? body.media_url : undefined,
    sticker_id: typeof body.sticker_id === "string" ? body.sticker_id : undefined,
    reply_to_message_id: typeof body.reply_to_message_id === "string" ? body.reply_to_message_id : undefined,
  };
  const result = await sendMessage(user, id, input);
  if ("error" in result) return fail(result.error, result.status ?? 400);
  await markRead(user, id);
  return ok({ message: result });
}
