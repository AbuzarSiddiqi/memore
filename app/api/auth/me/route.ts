import { ok, requireUser } from "@/lib/server/http";
import { publicUser } from "@/lib/server/views";

export async function GET() {
  const user = await requireUser();
  if (!user) return ok({ user: null });
  return ok({ user: publicUser(user, user.id) });
}
