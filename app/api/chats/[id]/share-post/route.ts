import { NextRequest } from "next/server";
import { requireUser, ok, fail, rateLimit } from "@/lib/server/http";
import { ensureHydrated } from "@/lib/server/db";
import { sendMessage, expireChats, hydrateChats } from "@/lib/server/chats";

/** Shares a MEMORE post into the chat as a reference (post_id) — the meme
 * itself is never duplicated. The recipient can invest in it in place. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureHydrated();
  await hydrateChats();
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  if (!rateLimit(`chat-share:${user.id}`, 20, 60_000)) return fail("Too many shares. Chill.", 429);
  expireChats();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const result = await sendMessage(user, id, {
    type: "post",
    post_id: typeof body.post_id === "string" ? body.post_id : "",
    content: typeof body.content === "string" ? body.content : "",
  });
  if ("error" in result) return fail(result.error, result.status ?? 400);
  return ok({ message: result });
}
