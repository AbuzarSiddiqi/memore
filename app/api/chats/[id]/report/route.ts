import { NextRequest } from "next/server";
import { db, save, uid } from "@/lib/server/db";
import { requireUser, ok, fail } from "@/lib/server/http";

/** Reports a conversation. The chat content may vanish after 24h, but the
 * report (metadata only) persists for moderation. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const d = db();
  const chat = d.chats.find((c) => c.id === id && c.participants.includes(user.id));
  if (!chat) return fail("Chat not found.", 404);
  const other = chat.participants.find((p) => p !== user.id) ?? "";
  d.reports.push({
    id: uid(),
    reporter_id: user.id,
    target_type: "chat",
    target_id: id,
    category: "other",
    note: String(body.note ?? "Reported conversation").slice(0, 200) + (other ? ` (participant: ${other})` : ""),
    status: "open",
    created_at: new Date().toISOString(),
  });
  save();
  return ok({ reported: true });
}
