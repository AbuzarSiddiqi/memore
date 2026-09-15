import { NextRequest } from "next/server";
import { requireUser, ok, fail, rateLimit } from "@/lib/server/http";
import { ensureHydrated } from "@/lib/server/db";
import { getOrCreateConversation, listChats, expireChats, isNotProvisioned } from "@/lib/server/chats";

const NOT_PROVISIONED = "Chat storage isn't provisioned yet. Run database/migration_v6_e2ee_chat.sql in the Supabase SQL Editor.";

export async function GET() {
  await ensureHydrated();
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  try {
    await expireChats(); // server-authoritative cleanup, idempotent
    const chats = await listChats(user);
    const unread = chats.reduce((s, c) => s + (c.muted ? 0 : c.unread), 0);
    return ok({ chats, unread });
  } catch (err) {
    return fail(isNotProvisioned(err) ? NOT_PROVISIONED : "The chat store is unavailable. Try again.", 503);
  }
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  if (!rateLimit(`chat-create:${user.id}`, 20, 60_000)) return fail("Slow down.", 429);
  await expireChats();
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim();
  if (!username) return fail("Pick someone to chat with.");
  const result = await getOrCreateConversation(user, username);
  if ("error" in result) return fail(result.error);
  return ok({ id: result.conversation.id, temp_chat: !!result.conversation.temp_chat, other: result.other.username });
}
