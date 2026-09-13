import { NextRequest } from "next/server";
import { requireUser, ok, fail } from "@/lib/server/http";
import { ensureHydrated } from "@/lib/server/db";
import { getChatDetail, expireChats, markRead, hydrateChats } from "@/lib/server/chats";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureHydrated();
  await hydrateChats();
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  expireChats(); // the server decides when a chat is dead — never the client
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const after = url.searchParams.get("after") || undefined;
  const before = url.searchParams.get("before") || undefined;
  const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = !isNaN(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;

  const result = getChatDetail(user, id, { after, before, limit });
  if ("error" in result) return fail(result.error, result.status ?? 400);
  // opening or syncing the chat marks it read if unread exists
  await markRead(user, id);
  return ok(result);
}
