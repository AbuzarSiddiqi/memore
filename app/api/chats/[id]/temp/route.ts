import { NextRequest } from "next/server";
import { requireUser, ok, fail } from "@/lib/server/http";
import { setTempChat } from "@/lib/server/chats";

// POST /api/chats/[id]/temp — toggle the conversation-level TEMP CHAT mode.
// The conversation itself never expires; only the lifetime of messages inside
// it changes (they purge when the chat is closed).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const enabled = !!body.enabled;
  const r = await setTempChat(user, id, enabled);
  if (typeof r !== "boolean") return fail(r.error, r.status);
  return ok({ temp_chat: r });
}
