import { NextRequest } from "next/server";
import { db, uid, save } from "@/lib/server/db";
import { ok, fail, requireUser, rateLimit } from "@/lib/server/http";
import { commentView } from "@/lib/server/views";
import { pushNotification } from "@/lib/server/notify";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await ctx.params;
  const comments = db()
    .comments.filter((c) => c.meme_id === id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(commentView);
  return ok({ comments });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  if (!rateLimit(`comment:${user.id}`, 12, 60_000)) return fail("Too many comments. Breathe.", 429);
  const { id } = await ctx.params;
  const meme = db().memes.find((m) => m.id === id && m.status === "live");
  if (!meme) return fail("That meme is no longer available.", 404);
  const body = await req.json();
  const content = String(body.content ?? "").trim().slice(0, 280);
  const parent_id = body.parent_id ? String(body.parent_id) : null;
  if (!content) return fail("Say something (anything).");

  const comment = {
    id: uid(), meme_id: id, user_id: user.id, parent_id,
    content, created_at: new Date().toISOString(),
  };
  db().comments.push(comment);
  if (meme.creator_id !== user.id) {
    pushNotification(meme.creator_id, "comment", `💬 ${user.username} commented`, `"${content.slice(0, 60)}"`, meme.id);
  }
  save();

  // Sync comment to Supabase
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    if (admin) {
      let userUuid = user.id;
      const { data: prof } = await admin.from("profiles").select("id").eq("email", user.email).single();
      if (prof?.id) userUuid = prof.id;

      await admin.from("comments").upsert({
        id: comment.id,
        meme_id: comment.meme_id,
        user_id: userUuid,
        parent_id: comment.parent_id,
        content: comment.content,
        created_at: comment.created_at,
      }, { onConflict: "id" });
    }
  } catch (err) {
    console.error("Supabase comment sync error:", err);
  }

  return ok({ comment: commentView(comment) });
}
