import { NextRequest } from "next/server";
import { db, save } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { chatUnreadTotal, expireChats } from "@/lib/server/chats";
import { syncNotificationReadToSupabase } from "@/lib/server/sync";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const list = db()
    .notifications.filter((n) => n.user_id === user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);
  await expireChats();
  return ok({ notifications: list, unread: list.filter((n) => !n.read).length, chatUnread: await chatUnreadTotal(user) });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const body = await req.json().catch(() => ({}));
  const d = db();
  for (const n of d.notifications) {
    if (n.user_id !== user.id) continue;
    if (body.id) {
      if (n.id === body.id) n.read = true;
    } else {
      n.read = true;
    }
  }
  save();
  void syncNotificationReadToSupabase(user.id, body.id);
  return ok({ ok: true });
}

