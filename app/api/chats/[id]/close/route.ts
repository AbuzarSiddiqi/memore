import { requireUser, ok, fail } from "@/lib/server/http";
import { closeTempChat } from "@/lib/server/chats";

// POST /api/chats/[id]/close — the user left a TEMP CHAT: the server purges
// its messages (ciphertext + reactions + media). Deliberately NEVER deletes the
// conversation, its participants, or the chat-list contact. No-op when TEMP
// CHAT is off.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const { id } = await ctx.params;
  const r = await closeTempChat(user, id);
  if ("error" in r) return fail(r.error, r.status);
  return ok({ purged: r.purged, temp_chat: true });
}
