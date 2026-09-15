import { NextRequest } from "next/server";
import { db, save } from "@/lib/server/db";
import { requireUser, ok, fail, rateLimit } from "@/lib/server/http";

const MIN_GAP_MS = 5 * 60 * 1000; // one write per 5 minutes at most (per user)

// POST /api/presence/heartbeat
// The ONLY persistent presence write. last_seen_at is stamped by the SERVER
// clock, never the client's, and is throttled: called when the app opens,
// when a backgrounded tab becomes visible again, and on real leave
// (sendBeacon, always allowed). There are no heartbeat timers, no
// per-second Postgres writes — online/typing state lives purely in Realtime.
export async function POST(_req: NextRequest, ctx?: unknown) {
  void ctx;
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  if (!rateLimit(`presence-hb:${user.id}`, 30, 60_000)) return ok({ skipped: true });

  let leaving = false;
  try {
    // sendBeacon posts a Blob, not JSON — accept both shapes
    leaving = !!(await _req.json?.().catch(() => ({})))?.leaving;
  } catch {
    leaving = false;
  }

  const d = db();
  const profile = d.users.find((u) => u.id === user.id);
  if (!profile) return ok({ skipped: true });

  const last = profile.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;
  const due = Date.now() - last >= MIN_GAP_MS;
  if (!leaving && !due) return ok({ skipped: true });

  profile.last_seen_at = new Date().toISOString(); // server clock, always
  save();
  return ok({ ok: true });
}
