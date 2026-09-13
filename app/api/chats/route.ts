import { NextRequest } from "next/server";
import { requireUser, ok, fail, rateLimit } from "@/lib/server/http";
import { getOrCreateConversation, listChats, expireChats } from "@/lib/server/chats";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  expireChats(); // server-authoritative cleanup, idempotent
  return ok({ chats: listChats(user), unread: chatUnreadSafe(user) });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  if (!rateLimit(`chat-create:${user.id}`, 20, 60_000)) return fail("Slow down.", 429);
  expireChats();
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim();
  if (!username) return fail("Pick someone to chat with.");
  const result = getOrCreateConversation(user, username);
  if ("error" in result) return fail(result.error);
  return ok({ id: result.conversation.id, expires_at: result.conversation.expires_at, other: result.other.username });
}

function chatUnreadSafe(user: Parameters<typeof listChats>[0]): number {
  return listChats(user).reduce((s, c) => s + (c.muted ? 0 : c.unread), 0);
}
