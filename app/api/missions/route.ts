import { ok, fail, requireUser } from "@/lib/server/http";
import { missionsFor } from "@/lib/server/progression";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  return ok({ missions: missionsFor(user.id) });
}
