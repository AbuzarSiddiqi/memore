import { NextRequest } from "next/server";
import { requireUser, ok, fail } from "@/lib/server/http";
import { ensureHydrated } from "@/lib/server/db";
import { getChatDetail, expireChats, markRead, hydrateChats } from "@/lib/server/chats";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureHydrated();
  await hydrateChats();
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  expireChats(); // the server decides when a chat is dead — never the client
  const { id } = await ctx.params;
  const result = getChatDetail(user, id);
  if ("error" in result) return fail(result.error, result.status ?? 400);
  // opening the chat marks it read
  markRead(user, id);
  return ok(result);
}
