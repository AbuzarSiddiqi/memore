import { NextRequest } from "next/server";
import { db, uid, save, ensureHydrated } from "@/lib/server/db";
import { ok, fail, humanError, requireUser, rateLimit } from "@/lib/server/http";
import { getFeed, type FeedTab } from "@/lib/server/feed";
import { memeView, publicUser } from "@/lib/server/views";
import { eventAndSeason } from "@/lib/server/feed";
import { pushNotification, checkAchievements } from "@/lib/server/notify";
import { trackMission } from "@/lib/server/progression";
import { priceFromNet } from "@/lib/server/market";
import type { Meme } from "@/lib/types";

const TABS: FeedTab[] = ["foryou", "following", "trending", "new", "rising", "undervalued", "hunter", "chaos", "saved", "mix"];
const CATEGORIES = ["college", "gaming", "anime", "football", "programming", "bollywood", "technology", "workplace", "indian", "chaos"];

export async function GET(req: NextRequest) {
  await ensureHydrated();
  const user = await requireUser();
  const url = new URL(req.url);
  const tab = (url.searchParams.get("tab") ?? "foryou") as FeedTab;
  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
  const limit = Math.min(24, Math.max(2, parseInt(url.searchParams.get("limit") ?? "6", 10) || 6));
  if (!TABS.includes(tab)) return fail("Unknown feed tab.");
  const result = getFeed(tab, page, limit, user);
  return ok({ ...result, page, event: eventAndSeason().event, season: eventAndSeason().season });
}

export async function POST(req: NextRequest) {
  try {
    await ensureHydrated();
    const user = await requireUser();
    if (!user) return fail("Log in first.", 401);
    if (!rateLimit(`create:${user.id}`, 8, 60_000)) return fail("Easy there — too many posts in a minute.", 429);
    const body = await req.json();
    const caption = String(body.caption ?? "").trim();
    const category = String(body.category ?? "").trim();
    const media_type = body.media_type === "video" ? "video" : "image";
    const media_url = String(body.media_url ?? "");
    const parent_meme_id = body.parent_meme_id ? String(body.parent_meme_id) : null;
    const tags = Array.isArray(body.tags)
      ? body.tags.slice(0, 6).map((t: string) => String(t).toLowerCase().replace(/[^a-z0-9_]/g, "")).filter(Boolean)
      : [];
    const description = String(body.description ?? "").slice(0, 280);

    if (caption.length < 3) return fail("Give your meme a caption (3+ chars).");
    if (!CATEGORIES.includes(category)) return fail("Pick a category.");
    if (!media_url) return fail("Upload media first.");
    if (media_type === "video" && !media_url.startsWith("/api/media/") && !media_url.startsWith("http"))
      return fail("Video upload failed. Try again.");

    const d = db();
    let parent: Meme | null = null;
    if (parent_meme_id) {
      parent = d.memes.find((m) => m.id === parent_meme_id && m.status === "live") ?? null;
      if (!parent) return fail("The meme you're remixing is no longer available.");
    }

    const jitter = () => 55 + Math.floor(Math.random() * 25);
    const meme: Meme = {
      id: `m_${uid().slice(0, 8)}`, creator_id: user.id, caption,
      description, category, tags,
      media_type, media_url,
      thumbnail_url: body.thumbnail_url ? String(body.thumbnail_url) : media_url,
      width: Number(body.width) || 800, height: Number(body.height) || 800,
      duration: body.duration ? Number(body.duration) : null,
      initial_price: 20, current_price: 20, net_invested: 0,
      total_invested: 0, total_sell_value: 0, open_price_24h: 20, all_time_high: 20,
      volume_24h: 0, momentum: 0.35, views: 0, saves: 0, remix_count: 0,
      battle_wins: 0, battle_losses: 0, status: "live", parent_meme_id, epitaph: null, source: "original", source_url: null, source_handle: null,
      dna: {
        humor: jitter(), chaos: parent ? Math.round(parent.dna.chaos * 0.7 + jitter() * 0.3) : jitter(),
        relatability: jitter(), brainrot: jitter(),
        wholesome: jitter(), absurdity: jitter(),
      },
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    meme.current_price = priceFromNet(0);
    d.memes.push(meme);

    if (parent) {
      d.remixes.push({ id: uid(), original_meme_id: parent.id, remix_meme_id: meme.id, creator_id: user.id, created_at: meme.created_at });
      parent.remix_count += 1;
      trackMission(user.id, "remix", meme.id);
      if (parent.creator_id !== user.id) {
        pushNotification(parent.creator_id, "remix", `🔄 ${user.username} remixed your meme`, `"${parent.caption}" just got a remix: "${caption}"`, meme.id);
      }
    }

    pushNotification(user.id, "achievement", "🚨 MEME LAUNCHED", `"${caption}" entered the Aura Market at ✦20.`, meme.id);
    checkAchievements(user.id);
    save();

    // Sync directly to Supabase
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      if (admin) {
        let creatorUuid = user.id;
        const { data: prof } = await admin.from("profiles").select("id").eq("email", user.email).single();
        if (prof?.id) creatorUuid = prof.id;

        await admin.from("memes").upsert({
          id: meme.id,
          creator_id: creatorUuid,
          caption: meme.caption,
          description: meme.description || "",
          category: meme.category,
          tags: meme.tags,
          media_type: meme.media_type,
          media_url: meme.media_url,
          thumbnail_url: meme.thumbnail_url,
          width: meme.width,
          height: meme.height,
          duration: meme.duration,
          initial_price: meme.initial_price,
          current_price: meme.current_price,
          status: meme.status,
          source: meme.source,
          dna_humor: meme.dna.humor,
          dna_chaos: meme.dna.chaos,
          dna_relatability: meme.dna.relatability,
          dna_brainrot: meme.dna.brainrot,
          dna_wholesome: meme.dna.wholesome,
          dna_absurdity: meme.dna.absurdity,
          created_at: meme.created_at,
          updated_at: meme.updated_at,
        }, { onConflict: "id" });
      }
    } catch (err) {
      console.error("Supabase meme sync error:", err);
    }

    return ok({ meme: memeView(meme, user.id) });
  } catch (e) {
    return fail(humanError(e), 500);
  }
}
