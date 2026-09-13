import { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { ok, requireUser } from "@/lib/server/http";
import { memeView, publicUser } from "@/lib/server/views";

export async function GET(req: NextRequest) {
  const viewer = await requireUser();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return ok({ memes: [], users: [], hashtags: [] });
  const d = db();

  const memes = d.memes
    .filter(
      (m) => m.status === "live" &&
        (m.caption.toLowerCase().includes(q) ||
          m.category.includes(q) ||
          m.tags.some((t) => t.includes(q)) ||
          m.id.toLowerCase().includes(q))
    )
    .slice(0, 12)
    .map((m) => memeView(m, viewer?.id));

  const users = d.users
    .filter(
      (u) => !u.suspended &&
        (u.username.toLowerCase().includes(q.replace("@", "")) || u.display_name.toLowerCase().includes(q.replace("@", "")))
    )
    .slice(0, 8)
    .map((u) => publicUser(u, viewer?.id));

  const hashtags = new Map<string, number>();
  for (const m of d.memes) for (const t of m.tags) if (t.includes(q.replace("#", ""))) hashtags.set(t, (hashtags.get(t) ?? 0) + 1);
  return ok({ memes, users, hashtags: [...hashtags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, count]) => ({ tag, count })) });
}
