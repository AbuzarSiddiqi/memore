import { NextRequest } from "next/server";
import { requireUser, ok, fail } from "@/lib/server/http";
import { listContacts } from "@/lib/server/chats";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  return ok({ contacts: listContacts(user) });
}
