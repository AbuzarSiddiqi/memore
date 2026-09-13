import { NextRequest } from "next/server";
import { db, save } from "@/lib/server/db";
import { ok, fail, requireUser } from "@/lib/server/http";
import { publicUser, memeView } from "@/lib/server/views";

async function requireAdmin() {
  const user = await requireUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return fail("Admins only.", 403);
  const d = db();
  return ok({
    stats: {
      users: d.users.length,
      memes: d.memes.filter((m) => m.status === "live").length,
      transactions: d.transactions.length,
      open_reports: d.reports.filter((r) => r.status === "open").length,
    },
    users: d.users.slice(0, 50).map((u) => publicUser(u)),
    memes: d.memes.slice(0, 60).map((m) => memeView(m)),
    reports: d.reports.slice(0, 40).map((r) => ({
      ...r,
      reporter: d.users.find((u) => u.id === r.reporter_id)?.username ?? "?",
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Admins only.", 403);
  const body = await req.json();
  const { action, id } = body as { action: string; id: string };
  const d = db();
  switch (action) {
    case "remove_meme": {
      const meme = d.memes.find((m) => m.id === id);
      if (!meme) return fail("Meme not found.", 404);
      meme.status = "removed";
      break;
    }
    case "suspend_user": {
      const u = d.users.find((x) => x.id === id);
      if (!u) return fail("User not found.", 404);
      u.suspended = !u.suspended;
      break;
    }
    case "resolve_report": {
      const r = d.reports.find((x) => x.id === id);
      if (!r) return fail("Report not found.", 404);
      r.status = "resolved";
      break;
    }
    default:
      return fail("Unknown admin action.");
  }
  save();
  return ok({ done: true });
}
