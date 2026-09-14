import { NextRequest } from "next/server";
import { db, ensureHydrated } from "@/lib/server/db";
import { ok } from "@/lib/server/http";

export async function GET(req: NextRequest) {
  await ensureHydrated();
  const rawQ = new URL(req.url).searchParams.get("q") ?? "";
  const q = rawQ.trim().toLowerCase().replace(/^@/, "");
  const d = db();

  let matchedUsers = d.users.filter((u) => !u.suspended);

  if (q.length > 0) {
    matchedUsers = matchedUsers.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q)
    );

    // Sort: exact username match first, then username startsWith, then display_name startsWith
    matchedUsers.sort((a, b) => {
      const aU = a.username.toLowerCase();
      const bU = b.username.toLowerCase();
      if (aU === q && bU !== q) return -1;
      if (bU === q && aU !== q) return 1;
      const aStarts = aU.startsWith(q);
      const bStarts = bU.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aU.localeCompare(bU);
    });
  }

  const users = matchedUsers.slice(0, 8).map((u) => ({
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    avatar_bg: u.avatar_bg,
  }));

  return ok({ users });
}
