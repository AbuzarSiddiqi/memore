import { NextRequest } from "next/server";
import { db, uid, save, persistNow, ensureHydrated } from "@/lib/server/db";
import { ok, fail, humanError, requireUser, rateLimit } from "@/lib/server/http";
import { getFeed, type FeedTab } from "@/lib/server/feed";
import { memeView, publicUser } from "@/lib/server/views";
import { eventAndSeason } from "@/lib/server/feed";
import { pushNotification, checkAchievements } from "@/lib/server/notify";
import { trackMission } from "@/lib/server/progression";
import { priceFromNet } from "@/lib/server/market";
import { shouldAttemptTextTableSync, noteTextTableSyncResult, invalidateSnapshotTextCache } from "@/lib/server/sync";
import { TEXT_POST_LIMIT, TEXT_POST_MIN } from "@/lib/limits";
import { oneLine, parseHashtags } from "@/lib/text";
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
  return ok(
    { ...result, page, event: eventAndSeason().event, season: eventAndSeason().season },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    await ensureHydrated();
    const user = await requireUser();
    if (!user) return fail("Log in first.", 401);
    if (!rateLimit(`create:${user.id}`, 8, 60_000)) return fail("Easy there — too many posts in a minute.", 429);
    const body = await req.json();
    const caption = String(body.caption ?? "").trim();
    const media_type = body.media_type === "video" ? "video" : body.media_type === "text" ? "text" : "image";
    const media_url = String(body.media_url ?? "");
    const parent_meme_id = body.parent_meme_id ? String(body.parent_meme_id) : null;
    const description = String(body.description ?? "").slice(0, 280);

    if (media_type === "text") {
      // TEXT MEME — the text itself is the content and lives in `caption`
      // (existing convention). Server-authoritative length checks: never
      // silently truncate, reject instead.
      if (caption.length < TEXT_POST_MIN) return fail("Write something first — even one unhinged line.");
      if (caption.length > TEXT_POST_LIMIT) return fail(`Text memes cap at ${TEXT_POST_LIMIT} characters. Trim the take.`);
    } else {
      if (caption.length < 3) return fail("Give your meme a caption (3+ chars).");
    }
    const category = String(body.category ?? "").trim() || "chaos";
    const bodyTags = Array.isArray(body.tags)
      ? body.tags.slice(0, 6).map((t: string) => String(t).toLowerCase().replace(/[^a-z0-9_]/g, "")).filter(Boolean)
      : [];
    const tags = [...new Set([...bodyTags, ...parseHashtags(caption)])].slice(0, 6);
    if (!CATEGORIES.includes(category)) return fail("Pick a category.");
    if (media_type !== "text" && !media_url) return fail("Upload media first.");
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
    d.memes.unshift(meme);

    if (parent) {
      d.remixes.push({ id: uid(), original_meme_id: parent.id, remix_meme_id: meme.id, creator_id: user.id, created_at: meme.created_at });
      parent.remix_count += 1;
      trackMission(user.id, "remix", meme.id);
      if (parent.creator_id !== user.id) {
        pushNotification(parent.creator_id, "remix", `🔄 ${user.username} remixed your meme`, `"${oneLine(parent.caption)}" just got a remix: "${oneLine(caption)}"`, meme.id);
      }
    }

    pushNotification(user.id, "achievement", "🚨 MEME LAUNCHED", `"${oneLine(caption)}" entered the Aura Market at ✦20.`, meme.id);
    checkAchievements(user.id);
    save();
    // text memes persist through the snapshot channel — upload it immediately
    // instead of waiting out the 400ms save debounce
    if (meme.media_type === "text") persistNow();

    // Sync directly to Supabase. Text memes sync directly to the table (with
    // automatic fallback if the table schema has not been migrated yet) and persist
    // through the local store + Supabase Storage snapshot.
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      if (admin) {
        let creatorUuid = user.id;
        const { data: prof } = await admin.from("profiles").select("id").eq("email", user.email).maybeSingle();
        if (prof?.id) {
          creatorUuid = prof.id;
        } else {
          await admin.from("profiles").upsert({
            id: creatorUuid,
            email: user.email,
            username: user.username,
            display_name: user.display_name,
            avatar_bg: user.avatar_bg,
            aura_balance: user.aura_balance,
            reputation: user.reputation,
            level: user.level,
            xp: user.xp,
            role: user.role,
            is_seed: false,
            interests: user.interests,
            onboarded: user.onboarded,
            suspended: user.suspended,
            hunter_score: user.hunter?.score || 0,
            early_discoveries: user.hunter?.early_discoveries || 0,
            successful_picks: user.hunter?.successful_picks || 0,
          }, { onConflict: "id" });
        }

        const isText = meme.media_type === "text";
        const memePayload = {
          id: meme.id,
          creator_id: creatorUuid,
          caption: meme.caption,
          description: meme.description || "",
          category: meme.category,
          tags: meme.tags,
          media_type: meme.media_type,
          media_url: meme.media_url || (isText ? "text://" : ""),
          thumbnail_url: meme.thumbnail_url || (isText ? "text://" : ""),
          width: meme.width,
          height: meme.height,
          duration: meme.duration,
          initial_price: meme.initial_price,
          current_price: meme.current_price,
          net_invested: meme.net_invested,
          total_invested: meme.total_invested,
          total_sell_value: meme.total_sell_value,
          open_price_24h: meme.open_price_24h,
          all_time_high: meme.all_time_high,
          volume_24h: meme.volume_24h,
          momentum: meme.momentum,
          views: meme.views,
          saves: meme.saves,
          remix_count: meme.remix_count,
          battle_wins: meme.battle_wins,
          battle_losses: meme.battle_losses,
          status: meme.status,
          source: meme.source || (isText ? "text" : "original"),
          dna_humor: meme.dna.humor,
          dna_chaos: meme.dna.chaos,
          dna_relatability: meme.dna.relatability,
          dna_brainrot: meme.dna.brainrot,
          dna_wholesome: meme.dna.wholesome,
          dna_absurdity: meme.dna.absurdity,
          created_at: meme.created_at,
          updated_at: meme.updated_at,
        };

        const upsert = await admin.from("memes").upsert(memePayload, { onConflict: "id" }).select("id").maybeSingle();
        if (upsert.error && isText) {
          noteTextTableSyncResult(upsert.error);
          // Fallback when Supabase memes table constraint check (media_type IN ('image', 'video')) has not been migrated
          await admin.from("memes").upsert({
            ...memePayload,
            media_type: "image",
            source: "text",
            media_url: "text://",
            thumbnail_url: "text://",
          }, { onConflict: "id" });
        }

        invalidateSnapshotTextCache();
        // Ensure in-memory state and cloud state are immediately synchronized
        await ensureHydrated(true);
      }
    } catch (err) {
      console.error("Supabase meme sync error:", err);
    }

    return ok({ meme: memeView(meme, user.id) });
  } catch (e) {
    return fail(humanError(e), 500);
  }
}
