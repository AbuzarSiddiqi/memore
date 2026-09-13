import { requireUser, ok, fail } from "@/lib/server/http";
import { ensureHydrated } from "@/lib/server/db";
import { listContacts } from "@/lib/server/chats";

export async function GET() {
  await ensureHydrated();
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  return ok({ contacts: listContacts(user) });
}
