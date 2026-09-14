"use client";
// MEMORE Home — media-first feed. DOUBLE-TAP ANY MEME = INVEST ✦1.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, useOfflineStatus, useSession } from "@/lib/client";
import { getCachedFeed, setCachedFeed, getMemoryCache } from "@/lib/client-cache";
import type { EventView, FeedResponse, MissionView, SeasonView } from "@/lib/types";
import { MemeCard, VideoMemeCard } from "@/components/meme";
import { TextMemeCard } from "@/components/text-meme";
import { EmptyState, FeedSkeleton } from "@/components/ui";

const TABS = [
  { id: "foryou", label: "For You" },
  { id: "following", label: "Following" },
  { id: "trending", label: "Trending" },
  { id: "hunter", label: "Early Signals" },
  { id: "new", label: "New" },
  { id: "rising", label: "Rising" },
  { id: "undervalued", label: "Underrated" },
  { id: "chaos", label: "Chaos" },
] as const;

export default function HomePage() {
  const { user } = useSession();
  const isOffline = useOfflineStatus();
  const [tab, setTab] = useState<string>("foryou");
  const [pages, setPages] = useState<FeedResponse["memes"][]>(() => {
    if (typeof window !== "undefined") {
      const mem = getMemoryCache<any[]>("feed:foryou");
      if (mem && mem.length > 0) return [mem];
    }
    return [];
  });
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const mem = getMemoryCache<any[]>("feed:foryou");
      if (mem && mem.length > 0) return false;
    }
    return true;
  });
  const [missions, setMissions] = useState<MissionView[]>([]);
  const sentinel = useRef<HTMLDivElement>(null);

  // 1. Instant Cache-First Hydration on mount and tab switch
  useEffect(() => {
    let active = true;
    (async () => {
      const mem = getMemoryCache<any[]>(`feed:${tab}`);
      if (mem && mem.length > 0) {
        if (active) {
          setPages([mem]);
          setLoading(false);
        }
        return;
      }
      const cached = await getCachedFeed(tab);
      if (active && cached && cached.length > 0) {
        setPages([cached]);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tab]);

  const loadPage = useCallback(async (p: number, t: string, replace: boolean) => {
    // Only show skeleton if neither memory nor IndexedDB has cached posts for this tab
    if (replace) {
      const mem = getMemoryCache<any[]>(`feed:${t}`);
      if (mem && mem.length > 0) {
        setPages([mem]);
        setLoading(false);
      } else {
        const idb = await getCachedFeed(t);
        if (idb && idb.length > 0) {
          setPages([idb]);
          setLoading(false);
        } else {
          setLoading(true);
        }
      }
    }
    try {
      const r = await api<FeedResponse>(`/api/memes?tab=${t}&page=${p}&limit=6`);
      if (r && Array.isArray(r.memes)) {
        setPages((prev) => {
          const next = replace ? [r.memes] : [...prev, r.memes];
          const all = Array.from(new Map(next.flat().map((m) => [m.id, m])).values());
          // Update persistent cache for this tab
          void setCachedFeed(t, all);
          // Seed Reels mix cache with video memes
          const vids = all.filter((m) => m.media_type === "video");
          if (vids.length > 0) {
            const existingMix = getMemoryCache<any[]>("feed:mix") ?? [];
            const mergedMix = Array.from(new Map([...vids, ...existingMix].map((m) => [m.id, m])).values());
            void setCachedFeed("mix", mergedMix);
          }
          return next;
        });
        setHasMore(r.has_more);
      }
    } catch (err) {
      console.warn("Feed load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMissions = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api<{ missions: MissionView[] }>("/api/missions");
      setMissions(r.missions);
    } catch { /* optional sugar */ }
  }, [user]);

  useEffect(() => {
    setPage(0);
    loadPage(0, tab, true);
  }, [tab, loadPage]);

  useEffect(() => { loadMissions(); }, [loadMissions]);

  useEffect(() => {
    if (loading || !hasMore) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        const next = page + 1;
        setPage(next);
        loadPage(next, tab, false);
      }
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loading, hasMore, page, tab, loadPage]);

  const memes = Array.from(new Map(pages.flat().map((m) => [m.id, m])).values());
  const refresh = useCallback(() => { loadPage(0, tab, true); loadMissions(); }, [tab, loadPage, loadMissions]);

  // realtime counts: any invest/sell anywhere (double-tap, sheets) refetches the
  // feed so the ✦ totals on the rail buttons stay live.
  useEffect(() => {
    const onTraded = () => { setTimeout(() => refresh(), 500); };
    window.addEventListener("aura:traded", onTraded);
    return () => window.removeEventListener("aura:traded", onTraded);
  }, [refresh]);

  const doneMissions = missions.filter((m) => m.done).length;

  return (
    <div>
      {/* tabs */}
      <div className="sticky top-[var(--app-header-h)] z-30 -mx-4 px-4 pt-1 pb-2.5 bg-[var(--bg-app)]/95 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="Feed tabs">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`chip ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* daily missions — slim strip */}
      {user && missions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 -mx-4 px-4">
          {missions.map((m) => (
            <div key={m.id} className="neo-sm px-3 py-2 flex items-center gap-2 shrink-0" title={m.hint}>
              <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: m.done ? "var(--lime)" : "var(--ink)" }}>
                {m.done ? "✓" : "○"} {m.name}
              </span>
              <span className="text-[10px] muted aura-num">{m.progress}/{m.need}</span>
              <span className="pill p-lime !text-[9px] !py-0 !px-1.5">+✦{m.reward}</span>
            </div>
          ))}
          <div className="shrink-0 flex items-center text-[10px] muted px-1">{doneMissions}/{missions.length} done</div>
        </div>
      )}

      {tab === "hunter" && memes.length === 0 && !loading && (
        <div className="mt-4">
          <EmptyState emoji="🎯" title="No early signals right now." message="The hunt continues — signals appear when small memes start moving." />
        </div>
      )}
      {tab === "following" && memes.length === 0 && !loading && (
        <div className="mt-4">
          <EmptyState
            emoji="👥"
            title="Your following feed is empty."
            message="Follow creators whose predictions you trust."
            action={<Link href="/leaderboard" className="neo-btn primary">Find creators</Link>}
          />
        </div>
      )}

      {/* offline notice */}
      {isOffline && (
        <div className="mb-3 px-3.5 py-2 rounded-2xl border border-[var(--coral)] bg-[#221013] text-[11.5px] font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--coral)] animate-pulse" /> OFFLINE — SHOWING CACHED MEMES
        </div>
      )}

      {/* feed */}
      <div className="space-y-5">
        {memes.map((m) =>
          m.media_type === "video" ? <VideoMemeCard key={m.id} meme={m} onChanged={refresh} />
          : m.media_type === "text" ? <TextMemeCard key={m.id} meme={m} onChanged={refresh} />
          : <MemeCard key={m.id} meme={m} onChanged={refresh} />
        )}
        {loading && memes.length === 0 && <FeedSkeleton />}
        {loading && memes.length > 0 && (
          <div className="py-4 text-center text-xs muted hd">LOADING MORE MEMES…</div>
        )}
        {!loading && memes.length === 0 && tab !== "following" && tab !== "hunter" && (
          <EmptyState emoji="🫥" title="No memes found." message="For now." action={<Link href="/create" className="neo-btn primary">Create the first one</Link>} />
        )}
      </div>
      <div ref={sentinel} className="h-2" />

      {tab === "foryou" && memes.length > 0 && (
        <p className="text-center text-[12px] muted mt-8">
          <b>Double-tap any meme to invest ✦1.</b> <Link href="/reels" className="underline font-bold">Open Reels →</Link>
        </p>
      )}
    </div>
  );
}
