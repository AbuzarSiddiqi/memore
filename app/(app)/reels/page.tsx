"use client";
// MEMORE REELS — swipe up: video reels, image posts and Instagram embeds.
// DOUBLE-TAP A REEL = INVEST AURA 1 (on native memes; IG embeds invest via chips).
// Comments open Instagram-style: the media shrinks to a small square (still
// playing) while the shared dark comment sheet slides up.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, fmtNum, useApi, useSession } from "@/lib/client";
import type { FeedResponse, MemeView } from "@/lib/types";
import { Avatar, ChangePct, NeoButton } from "@/components/ui";
import { CommentsSheet, type CommentRow, InvestSheet } from "@/components/meme";
import { Icon } from "@/components/icons";
import { AuraBurst, useTapInvest } from "@/components/aura-burst";
import { InstagramEmbed } from "@/components/instagram";
import { Spark } from "@/components/brand";

const TAP_MS = 260;
// home-feed rail style: same button type as the feed, but subtler and higher up
const railBtn = "neo-btn icon !bg-black/30 !border-0 backdrop-blur-md flex-col !w-11 !h-11 gap-0 opacity-90 text-white";
const railNum = "text-[9.5px] font-bold -mt-0.5";

function timeAgoShort(iso: string): string {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  const h = s / 3600;
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Rolling "top comments" ticker: cycles one comment at a time so it can be
 * read; the pill auto-sizes so the whole comment is always visible; tapping
 * opens the comments sheet. */
function CommentTicker({ memeId, active, refreshKey, onOpen }: { memeId: string; active: boolean; refreshKey: number; onOpen: () => void }) {
  const [rows, setRows] = useState<CommentRow[] | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    api<{ comments: CommentRow[] }>(`/api/memes/${memeId}/comments`)
      .then((d) => { if (alive) setRows(d.comments.slice(-5)); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [active, memeId, refreshKey]);

  const list = rows ?? [];
  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % list.length), 4500); // readable pause between jumps
    return () => clearInterval(t);
  }, [list.length]);

  if (!rows || list.length === 0) return null;
  const c = list[idx % list.length];
  const long = c.content.length > 70;
  return (
    <button
      className="block max-w-full text-left cursor-pointer"
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      aria-label="Open comments"
    >
      <span className="ticker-box relative flex items-center gap-2 overflow-hidden rounded-[18px] px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.5)", width: "fit-content", maxWidth: "100%" }}>
        <span className="shrink-0">
          <Avatar name={c.user.display_name} bg={c.user.avatar_bg} size={18} username={c.user.username} />
        </span>
        <span key={c.id} className={`ticker-roll whitespace-normal leading-snug text-white/90 ${long ? "text-[10px]" : "text-[11px]"}`}>
          <span className="hd font-bold text-white">{c.user.display_name.toLowerCase().replace(/\s/g, "")}</span>
          <span className="mx-1.5 opacity-40">·</span>
          {c.content}
        </span>
      </span>
    </button>
  );
}

/** Same rail as the home feed: ✦ aura button first, then comments/remix/details. */
function Rail({ meme, onComments, onInvest, dimmed }: { meme: MemeView; onComments: () => void; onInvest: () => void; dimmed?: boolean }) {
  return (
    <div className={`absolute right-2.5 bottom-28 z-10 flex flex-col gap-2.5 items-center reel-fade ${dimmed ? "reel-hidden" : "reel-shown"}`}>
      <button className={railBtn} onClick={(e) => { e.stopPropagation(); onInvest(); }} aria-label="Invest Aura in this meme">
        <Spark size={17} color="#C8FF3D" />
        <span className={railNum} style={{ color: "#C8FF3D" }}>{fmtNum(meme.total_invested)}</span>
      </button>
      <button className={railBtn} onClick={(e) => { e.stopPropagation(); onComments(); }} aria-label="Comments">
        <Icon name="comment" size={17} strokeWidth={2.2} />
        <span className={railNum}>{meme.comment_count}</span>
      </button>
      <Link href={`/create?remix=${meme.id}`} onClick={(e) => e.stopPropagation()} className={railBtn} aria-label="Remix">
        <Icon name="repeat" size={17} strokeWidth={2.2} />
      </Link>
      <Link href={`/meme/${meme.id}`} onClick={(e) => e.stopPropagation()} className={railBtn} aria-label="Details">
        <Icon name="chart" size={17} strokeWidth={2.2} />
      </Link>
    </div>
  );
}

function InfoOverlay({ meme, liveInvested, dimmed, onInvest, children }: { meme: MemeView; liveInvested?: number; dimmed?: boolean; onInvest: () => void; children?: React.ReactNode }) {
  const { user } = useSession();
  const myInvested = liveInvested ?? meme.my_position?.invested_amount ?? 0;

  return (
    <div className="absolute left-3 right-16 bottom-4 space-y-2 z-10">
      {/* ticker (children) stays fully visible even when idle-dimmed */}
      {children}
      <div className={`space-y-2 reel-fade ${dimmed ? "reel-hidden" : "reel-shown"}`}>
      <div className="flex items-center gap-2">
        <Avatar name={meme.creator.display_name} bg={meme.creator.avatar_bg} username={meme.creator.username} size={34} />
        <Link href={`/profile/${meme.creator.username}`} className="hd font-bold text-white text-[13px]" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>
          {meme.creator.display_name.toLowerCase().replace(/\s/g, "")}
        </Link>
        <span className="text-[11px] text-white/60">{timeAgoShort(meme.created_at)}</span>
      </div>
      <p className="text-[13px] text-white font-medium line-clamp-2" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>{meme.caption}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="pill p-yellow aura-num !text-[10px]">✦ {meme.current_price}</span>
        <span className="pill p-black !text-[10px]"><ChangePct value={meme.change_24h} className="text-[10.5px]" /></span>
        {meme.source === "instagram" && (
          <span className="pill !text-[9px]" style={{ background: "rgba(255,0,105,0.16)", borderColor: "rgba(255,0,105,0.4)", color: "#ff7ab0" }}>
            Instagram{meme.source_handle ? ` · @${meme.source_handle}` : ""}
          </span>
        )}
      </div>
      {myInvested > 0 && <span className="pill p-lime !text-[9.5px] aura-num">✦ {myInvested} invested by you</span>}
      {user && (
        <NeoButton variant="primary" size="sm" onClick={(e) => { e.stopPropagation(); onInvest(); }}>✦ Invest</NeoButton>
      )}
      </div>
    </div>
  );
}

function VideoSlide({ meme, active, commentsOpen, onComments, onInvest, dim, dataTick }: { meme: MemeView; active: boolean; commentsOpen: boolean; onComments: () => void; onInvest: () => void; dim: boolean; dataTick: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(false); // reels start unmuted
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const { events, tap, myInvested } = useTapInvest(meme, { prefix: "reel" });
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayDim = commentsOpen || dim;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active && !paused) {
      v.play().catch(() => {
        // browser blocked unmuted autoplay — fall back to muted playback
        setMuted(true);
        v.muted = true;
        v.play().catch(() => {});
      });
    } else v.pause();
  }, [active, paused]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current); }, []);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { v.play(); setPaused(false); } else { v.pause(); setPaused(true); }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (commentsOpen) return;
    if (clickTimer.current) {
      // Double tap: invest, cancel the pending single-tap play/pause.
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      const rect = wrapRef.current?.getBoundingClientRect();
      tap(e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0));
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      toggle();
    }, TAP_MS);
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full bg-black overflow-hidden" onClick={handleClick}>
      {/* media box: full-bleed normally, small still-playing square when comments open */}
      <div className={`reel-media absolute overflow-hidden bg-black ${commentsOpen ? "top-[64px] left-1/2 -translate-x-1/2 w-[64%] h-[34%] rounded-[22px] shadow-[0_12px_44px_rgba(0,0,0,0.65)]" : "inset-0"}`}>
        <video
          ref={ref}
          src={meme.media_url}
          poster={meme.thumbnail_url}
          muted={muted}
          loop
          playsInline
          preload={active ? "auto" : "none"}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress(v.currentTime / v.duration);
          }}
          className="absolute inset-0 w-full h-full object-contain cursor-pointer"
          aria-label={meme.caption}
        />
        {/* ambient blur: strongest at the very edges, fading into the reel */}
        <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
          <div className="reel-ambient absolute top-0 inset-x-0 h-[18%]" style={{ maskImage: "linear-gradient(to bottom, black 25%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black 25%, transparent)" }} />
          <div className="reel-ambient absolute bottom-0 inset-x-0 h-[18%]" style={{ maskImage: "linear-gradient(to top, black 25%, transparent)", WebkitMaskImage: "linear-gradient(to top, black 25%, transparent)" }} />
        </div>
        {/* paused overlay: mute above play — only when the reel is stopped */}
        {paused && !commentsOpen && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3.5 pointer-events-none z-20 reel-fade ${dim ? "reel-hidden" : "reel-shown"}`}>
            <button
              className="neo-btn icon pointer-events-auto !bg-black/55 !border-0 !w-11 !h-11 !rounded-full text-white backdrop-blur-sm"
              onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              <Icon name={muted ? "volume-off" : "volume-on"} size={18} />
            </button>
            <button
              className="neo-btn icon pointer-events-auto !bg-black/55 !border-0 !w-16 !h-16 !rounded-full text-white backdrop-blur-sm"
              onClick={(e) => { e.stopPropagation(); toggle(); }}
              aria-label="Play"
            >
              <Icon name="play" size={28} filled />
            </button>
          </div>
        )}
        {/* progress bar sits on the media box in both modes */}
        <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white/15 z-10 pointer-events-none">
          <div className="h-full bg-[#C8FF3D]" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <AuraBurst events={events} />
      <Rail meme={meme} onComments={onComments} onInvest={onInvest} dimmed={overlayDim} />
      <InfoOverlay meme={meme} liveInvested={myInvested} dimmed={overlayDim} onInvest={onInvest}>
        <CommentTicker memeId={meme.id} active={active} refreshKey={dataTick} onOpen={onComments} />
      </InfoOverlay>
    </div>
  );
}

function ImageSlide({ meme, active, commentsOpen, onComments, onInvest, dim, dataTick }: { meme: MemeView; active: boolean; commentsOpen: boolean; onComments: () => void; onInvest: () => void; dim: boolean; dataTick: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { events, tap, myInvested } = useTapInvest(meme, { prefix: "reel" });
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current); }, []);

  const handleClick = (e: React.MouseEvent) => {
    if (commentsOpen) return;
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      const rect = wrapRef.current?.getBoundingClientRect();
      tap(e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0));
      return;
    }
    clickTimer.current = setTimeout(() => { clickTimer.current = null; }, TAP_MS);
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full bg-black overflow-hidden cursor-pointer" onClick={handleClick}>
      {/* media box: full-bleed normally, small square when comments open */}
      <div className={`reel-media absolute overflow-hidden bg-black ${commentsOpen ? "top-[64px] left-1/2 -translate-x-1/2 w-[64%] h-[34%] rounded-[22px] shadow-[0_12px_44px_rgba(0,0,0,0.65)]" : "inset-0"}`}>
        <div className="absolute inset-0 blur-2xl opacity-30 scale-110" style={{ backgroundImage: `url(${meme.media_url})`, backgroundSize: "cover", backgroundPosition: "center" }} aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={meme.media_url} alt={meme.caption} className="absolute inset-0 w-full h-full object-contain" draggable={false} />
        {/* ambient blur: strongest at the very edges, fading into the reel */}
        <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
          <div className="reel-ambient absolute top-0 inset-x-0 h-[18%]" style={{ maskImage: "linear-gradient(to bottom, black 25%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black 25%, transparent)" }} />
          <div className="reel-ambient absolute bottom-0 inset-x-0 h-[18%]" style={{ maskImage: "linear-gradient(to top, black 25%, transparent)", WebkitMaskImage: "linear-gradient(to top, black 25%, transparent)" }} />
        </div>
      </div>
      <AuraBurst events={events} />
      <Rail meme={meme} onComments={onComments} onInvest={onInvest} dimmed={commentsOpen || dim} />
      <InfoOverlay meme={meme} liveInvested={myInvested} dimmed={commentsOpen || dim} onInvest={onInvest}>
        <CommentTicker memeId={meme.id} active={active} refreshKey={dataTick} onOpen={onComments} />
      </InfoOverlay>
    </div>
  );
}

function InstagramSlide({ meme, commentsOpen, onComments, onInvest, dim }: { meme: MemeView; commentsOpen: boolean; onComments: () => void; onInvest: () => void; dim: boolean }) {  return (
    <div className="relative h-full w-full bg-black overflow-hidden">
      <div className={`reel-media absolute inset-x-0 flex items-start justify-center overflow-hidden ${commentsOpen ? "top-[52px] bottom-[calc(64px+34vh+12px)]" : "top-[52px] bottom-[168px]"}`}>
        <InstagramEmbed url={meme.source_url!} handle={meme.source_handle} />
      </div>
      <Rail meme={meme} onComments={onComments} onInvest={onInvest} dimmed={commentsOpen || dim} />
      <InfoOverlay meme={meme} dimmed={commentsOpen || dim} onInvest={onInvest} />
    </div>
  );
}

export default function ReelsPage() {
  const { data, loading, refresh } = useApi<FeedResponse>("/api/memes?tab=mix&limit=24");
  const [active, setActive] = useState(0);
  const [commentsFor, setCommentsFor] = useState<MemeView | null>(null);
  const [investFor, setInvestFor] = useState<MemeView | null>(null);
  // realtime-ish counts: bumped by sheet closes and double-tap trades, plus a
  // slow silent poll so prices/counts from other users drift in.
  const [dataTick, setDataTick] = useState(0);
  const bumpFeed = useCallback(() => { refresh(); setDataTick((t) => t + 1); }, [refresh]);
  // touch-idle: overlays fade away so the reel gets the screen; any touch
  // anywhere brings everything back instantly.
  const [uiIdle, setUiIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => refresh(), 12000);
    const onTraded = () => { setTimeout(() => refresh(), 500); };
    window.addEventListener("aura:traded", onTraded);
    return () => { clearInterval(t); window.removeEventListener("aura:traded", onTraded); };
  }, [refresh]);

  const wake = useCallback(() => {
    setUiIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setUiIdle(true), 2600);
  }, []);

  useEffect(() => {
    if (commentsFor) {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      setUiIdle(false);
    } else wake();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [commentsFor, wake]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.idx)); }),
      { threshold: 0.6 }
    );
    c.querySelectorAll("[data-idx]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [data]);

  const memes = data?.memes ?? [];

  return (
    <div
      className="fixed inset-0 z-[60] bg-black"
      onPointerDownCapture={wake}
      onTouchStartCapture={wake}
      onWheelCapture={wake}
      onScrollCapture={wake}
    >
      <style jsx global>{`
        /* reels comment choreography — one motion, video + sheet together */
        .reel-media { transition: all 0.32s cubic-bezier(0.22, 0.9, 0.3, 1); }
        /* touch-idle fade: fast on show, gentle on hide; dims to a ghost, never fully gone */
        .reel-fade { transition: opacity 0.55s ease; }
        .reel-shown { opacity: 1; transition: opacity 0.12s ease; }
        .reel-hidden { opacity: 0.22; pointer-events: none; }
        @keyframes tickerIn { from { transform: translateY(95%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .ticker-roll { display: inline-block; animation: tickerIn 0.45s cubic-bezier(0.2, 0.9, 0.3, 1); }
        /* comment jumps in and lands with a bouncy overshoot */
        @keyframes tickerJump {
          0% { transform: translateY(115%) scale(0.85); opacity: 0; }
          50% { transform: translateY(-22%) scale(1.08); opacity: 1; }
          72% { transform: translateY(10%) scale(0.96); }
          88% { transform: translateY(-4%) scale(1.02); }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .ticker-roll { display: inline-block; animation: tickerJump 0.6s cubic-bezier(0.3, 0.7, 0.3, 1) both; }
        .reel-ambient {
          backdrop-filter: blur(14px) saturate(1.15);
          -webkit-backdrop-filter: blur(14px) saturate(1.15);
        }
      `}</style>
      <div className={`absolute top-3 left-3 right-3 z-20 flex items-center justify-between reel-fade ${uiIdle ? "reel-hidden" : "reel-shown"}`}>
        <Link href="/home" className="neo-btn sm !bg-black/55 !border-0 text-white backdrop-blur-sm !rounded-full" aria-label="Back to feed">
          <Icon name="arrow-left" size={16} /> Feed
        </Link>
        <span className="pill p-black !text-[10px]"><Spark size={11} color="#C8FF3D" /> REELS · swipe up</span>
      </div>
      <div ref={containerRef} className={`h-full w-full snap-y snap-mandatory no-scrollbar ${commentsFor ? "overflow-hidden" : "overflow-y-scroll"}`}>
        {loading && <div className="h-full flex items-center justify-center text-white hd">LOADING REELS…</div>}
        {memes.map((m, i) => (
          <div key={m.id} data-idx={i} className="h-full w-full snap-start snap-always">
            {m.source === "instagram" ? <InstagramSlide meme={m} commentsOpen={commentsFor?.id === m.id} onComments={() => setCommentsFor(m)} onInvest={() => setInvestFor(m)} dim={uiIdle} />
              : m.media_type === "video" ? <VideoSlide meme={m} active={i === active} commentsOpen={commentsFor?.id === m.id} onComments={() => setCommentsFor(m)} onInvest={() => setInvestFor(m)} dim={uiIdle} dataTick={dataTick} />
                : <ImageSlide meme={m} active={i === active} commentsOpen={commentsFor?.id === m.id} onComments={() => setCommentsFor(m)} onInvest={() => setInvestFor(m)} dim={uiIdle} dataTick={dataTick} />}
          </div>
        ))}
        {!loading && memes.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-white">
            <p className="hd text-xl">No reels yet.</p>
            <NeoButton variant="lime" href="/create">Create one</NeoButton>
          </div>
        )}
      </div>
      {commentsFor && <CommentsSheet meme={commentsFor} variant="reels" onClose={() => { setCommentsFor(null); bumpFeed(); }} />}
      {investFor && <InvestSheet meme={investFor} open onClose={() => { setInvestFor(null); bumpFeed(); }} />}
    </div>
  );
}
