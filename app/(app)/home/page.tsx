"use client";
// MEMORE Home — media-first feed. DOUBLE-TAP ANY MEME = INVEST ✦1.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, useSession } from "@/lib/client";
import type { EventView, FeedResponse, MissionView, SeasonView } from "@/lib/types";
import { MemeCard, VideoMemeCard } from "@/components/meme";
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
  const [tab, setTab] = useState<string>("foryou");
  const [pages, setPages] = useState<FeedResponse["memes"][]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [missions, setMissions] = useState<MissionView[]>([]);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (p: number, t: string, replace: boolean) => {
    setLoading(true);
    try {
      const r = await api<FeedResponse>(`/api/memes?tab=${t}&page=${p}&limit=6`);
      setPages((prev) => (replace ? [r.memes] : [...prev, r.memes]));
      setHasMore(r.has_more);
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
    if (loading || !hasMore || page === 0) return;
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

  const memes = pages.flat();
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

      {/* feed */}
      <div className="space-y-5">
        {memes.map((m) =>
          m.media_type === "video" ? <VideoMemeCard key={m.id} meme={m} onChanged={refresh} /> : <MemeCard key={m.id} meme={m} onChanged={refresh} />
        )}
        {loading && <FeedSkeleton />}
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
