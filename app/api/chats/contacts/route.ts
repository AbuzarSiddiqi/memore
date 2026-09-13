import { NextRequest } from "next/server";
import { requireUser, ok, fail } from "@/lib/server/http";
import { ensureHydrated } from "@/lib/server/db";
import { listContacts, hydrateChats } from "@/lib/server/chats";

export async function GET() {
  await ensureHydrated();
  await hydrateChats();
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  return ok({ contacts: listContacts(user) });
}
