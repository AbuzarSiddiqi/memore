"use client";
// MEMORE meme components. The meme is the hero. DOUBLE-TAP = INVEST ✦1.
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import type { Heat, MemeView } from "@/lib/types";
import { api, fmtAura, fmtNum, fmtPct, timeAgo, useSession, useToast } from "@/lib/client";
import { playSfx } from "@/lib/sfx";
import { AuraBurst, useTapInvest } from "./aura-burst";
import { ShareSheet } from "./share";
import { Avatar, ChangePct, LabelPill, NeoButton, NeoCard, Sheet } from "./ui";
import { InstagramEmbed } from "./instagram";
import { Spark } from "./brand";
import { Icon, type IconName } from "./icons";

// ---------------------------------------------------------------- heat
const HEAT_STYLE: Record<Heat["level"], string> = {
  COLD: "",
  WARM: "p-blue",
  HOT: "p-yellow",
  VIRAL: "p-coral",
  LEGENDARY: "p-purple",
};
const HEAT_ICON: Record<Heat["level"], IconName> = {
  COLD: "snow", WARM: "sprout", HOT: "flame", VIRAL: "bolt", LEGENDARY: "storm",
};
export function HeatPill({ heat, className = "" }: { heat: Heat; className?: string }) {
  return (
    <span className={`pill ${HEAT_STYLE[heat.level]} ${className}`} title={`Heat ${heat.score}/100`}>
      <Icon name={HEAT_ICON[heat.level]} size={11} strokeWidth={2.4} /> {heat.level}
    </span>
  );
}

// ---------------------------------------------------------------- double-tap invest
export function DoubleTapZone({
  meme, children, className = "", onSingle, chipPosition = "bottom-left",
}: {
  meme: MemeView;
  children: React.ReactNode;
  className?: string;
  onSingle?: () => void;
  chipPosition?: "bottom-left" | "top-left";
}) {
  const { user } = useSession();
  const toast = useToast();
  const wrapRef = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { events, myInvested, tap } = useTapInvest(meme);
  const [pop, setPop] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const x = e.clientX - (rect?.left ?? 0);
    const y = e.clientY - (rect?.top ?? 0);

    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      if (!user) {
        toast("Log in to invest with double-taps.", "err");
        return;
      }
      tap(x, y);
      setPop(true);
      setTimeout(() => setPop(false), 420);
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      onSingle?.();
    }, 270);
  }, [user, toast, onSingle, tap]);

  useEffect(() => () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className}`} onClick={handleClick} role="presentation">
      {children}

      {myInvested > 0 && (
        <span
          className={`pill p-lime absolute z-10 pointer-events-none ${chipPosition === "bottom-left" ? "bottom-2.5 left-2.5" : "top-2.5 left-2.5"} ${pop ? "anim-pop" : ""}`}
          style={{ fontSize: 10.5 }}
        >
          ✦ {myInvested} invested by you
        </span>
      )}

      <AuraBurst events={events} />
    </div>
  );
}

// ---------------------------------------------------------------- media
export function MediaView({ meme, className = "", eager = false }: { meme: MemeView; className?: string; eager?: boolean }) {
  if (meme.media_type === "video") return <VideoMedia meme={meme} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={meme.media_url}
      alt={meme.caption}
      className={`meme-media ${className}`}
      loading={eager ? "eager" : "lazy"}
      draggable={false}
    />
  );
}

export function VideoMedia({ meme, className = "" }: { meme: MemeView; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = ref.current;
    const wrap = wrapRef.current;
    if (!video || !wrap) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio > 0.55) video.play().then(() => setPaused(false)).catch(() => {});
        else video.pause();
      },
      { threshold: [0, 0.55, 1] }
    );
    io.observe(wrap);
    return () => io.disconnect();
  }, []);

  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPaused(false); }
    else { v.pause(); setPaused(true); }
  }, []);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-black/85 text-white p-6 min-h-64 ${className}`}>
        <Icon name="video" size={30} strokeWidth={2} />
        <span className="hd font-bold text-sm">Video couldn&apos;t load.</span>
        <span className="text-xs opacity-70">Check your connection and try again.</span>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`relative bg-black ${className}`} style={{ aspectRatio: `${meme.width}/${meme.height}` }}>
      <video
        ref={ref}
        src={meme.media_url}
        poster={meme.thumbnail_url}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        className="meme-media absolute inset-0 w-full h-full object-cover"
        onError={() => setError(true)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration) setProgress(v.currentTime / v.duration);
        }}
        aria-label={meme.caption}
      />
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center text-white"><Icon name="play" size={26} filled /></span>
        </div>
      )}
      <div className="absolute top-2.5 right-2.5 flex gap-2 z-10">
        <button
          className="neo-btn icon !bg-black/55 !border-0 backdrop-blur-sm !text-white"
          onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          <Icon name={muted ? "volume-off" : "volume-on"} size={16} strokeWidth={2.2} />
        </button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15 z-10">
        <div className="h-full bg-[var(--lime)]" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- badges
export function AuraBadge({ meme, size = "md" }: { meme: MemeView; size?: "sm" | "md" }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`aura-num ${size === "sm" ? "text-[12px]" : "text-[15px]"}`}>{fmtAura(meme.current_price)}</span>
      <ChangePct value={meme.change_24h} className={size === "sm" ? "text-[11px]" : "text-[13px]"} />
    </div>
  );
}

export function SmartMoneyLine({ meme, compact = false }: { meme: MemeView; compact?: boolean }) {
  if (meme.smart_money.legends <= 0) return null;
  if (compact) {
    return (
      <span className="pill" style={{ background: "rgba(124,77,255,0.16)", borderColor: "rgba(124,77,255,0.4)", color: "#b39aff" }} title="High Prediction IQ investors in this meme">
        <Icon name="brain" size={11} strokeWidth={2.4} /> {meme.smart_money.legends} · ✦{fmtAura(meme.smart_money.aura).slice(2)}
      </span>
    );
  }
  return (
    <div className="neo-sm px-3 py-2.5 flex items-center justify-between text-sm flex-wrap gap-1">
      <span className="hd font-bold text-xs flex items-center gap-1.5"><Icon name="brain" size={13} strokeWidth={2.3} /> Smart Money</span>
      <span className="text-xs muted">
        <b style={{ color: "var(--ink)" }}>{meme.smart_money.legends}</b> high-IQ predictor{meme.smart_money.legends === 1 ? "" : "s"} are in · <b style={{ color: "var(--ink)" }}>✦{fmtAura(meme.smart_money.aura).slice(2)}</b>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- follow button (with hand-drawn high-five)
// Shared follow state per creator: following someone on one post instantly
// updates every other post of the same person on screen.
const followState = new Map<string, boolean>();
const followSubs = new Map<string, Set<(v: boolean) => void>>();

function useFollowSync(username: string, initial?: boolean) {
  const [following, setFollowing] = useState<boolean | null>(() => {
    const known = followState.get(username);
    return known !== undefined ? known : initial ?? null;
  });
  useEffect(() => {
    const known = followState.get(username);
    if (known !== undefined) setFollowing(known);
    let subs = followSubs.get(username);
    if (!subs) {
      subs = new Set();
      followSubs.set(username, subs);
    }
    const fn = (v: boolean) => setFollowing(v);
    subs.add(fn);
    return () => { subs.delete(fn); };
  }, [username]);
  const publish = useCallback((v: boolean) => {
    followState.set(username, v);
    followSubs.get(username)?.forEach((fn) => fn(v));
  }, [username]);
  return { following, publish };
}

/** Two doodle hands that dab in from the sides and high-five exactly on the
 * button. Rendered through a portal in a fixed layer and re-measured every
 * frame, so the hands stay glued to the button even while the page scrolls. */
function HighFive({ x, y }: { x: number; y: number }) {
  const hand = (
    <path
      d="M8 32 C 6 26, 5 20, 6 14 C 6.5 11, 10 10.5, 11 13 L12 17 C 11.5 12, 12.5 6, 14.5 6 C 16.5 6, 17 11, 17 16 C 17.5 11, 18.5 7, 20.5 7 C 22.5 7, 22.5 12, 22.5 17 C 23 13.5, 24 10, 26 10.5 C 28 11, 27.5 15, 27 19 L26 26 C 25 31, 20 34, 15 34 C 11 34, 9 33, 8 32 Z"
      fill="rgba(200,255,61,0.16)" stroke="#C8FF3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
  );
  return (
    <div className="fixed inset-0 z-[80] pointer-events-none" aria-hidden>
      <span className="absolute h-[58px] w-[110px]" style={{ left: x - 55, top: y - 29, animation: "hfOut 0.25s ease 0.7s both" }}>
        {/* impact burst */}
        <svg viewBox="0 0 48 48" className="absolute left-1/2 top-1/2 h-10 w-10" style={{ animation: "hfBurst 0.5s ease-out 0.36s both" }}>
          <path d="M24 4 L24 14 M24 34 L24 44 M4 24 L14 24 M34 24 L44 24 M10 10 L17 17 M38 10 L31 17 M10 38 L17 31 M38 38 L31 31" stroke="#C8FF3D" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </svg>
      {/* left hand dabs in from the left */}
      <svg viewBox="0 0 40 40" className="absolute left-[16px] top-1.5 h-10 w-10" style={{ animation: "hfLeft 0.85s cubic-bezier(0.3, 0.9, 0.3, 1) both" }}>
        {hand}
      </svg>
      {/* right hand mirrors it from the right */}
      <svg viewBox="0 0 40 40" className="absolute right-[16px] top-1.5 h-10 w-10" style={{ animation: "hfRight 0.85s cubic-bezier(0.3, 0.9, 0.3, 1) both" }}>
        <g transform="translate(40,0) scale(-1,1)">{hand}</g>
      </svg>
      </span>
    </div>
  );
}

export function FollowButton({ username, initial }: { username: string; initial?: boolean }) {
  const { user, refresh } = useSession();
  const toast = useToast();
  const { following, publish } = useFollowSync(username, initial);
  const [celebrate, setCelebrate] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const isFollowing = following;

  // While celebrating, the button hides (visibility only — it stays measurable)
  // and the hands track its live position every frame.
  useEffect(() => {
    if (!celebrate) return;
    let raf = 0;
    const tick = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos((p) => (Math.abs(p.x - (r.left + r.width / 2)) > 0.5 || Math.abs(p.y - (r.top + r.height / 2)) > 0.5 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : p));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [celebrate]);

  const follow = async () => {
    if (!user) return toast("Log in first.", "err");
    try {
      // send the button's intent, not a toggle — a stale feed state can't
      // make the first click unfollow instead of follow
      const r = await api<{ following: boolean }>(`/api/users/${username}/follow`, { json: { follow: !isFollowing } });
      if (r.following) {
        const rect = btnRef.current?.getBoundingClientRect();
        setPos(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: window.innerWidth / 2, y: 200 });
        setCelebrate(true);
        setTimeout(() => playSfx("dab"), 380); // cha-ching lands on the high-five impact
        setTimeout(() => { publish(true); setCelebrate(false); refresh(); }, 900);
      } else {
        publish(false);
        refresh();
      }
    } catch (e) { toast((e as Error).message, "err"); }
  };
  if (user?.username === username) return null;
  return (
    <>
      {celebrate && createPortal(<HighFive x={pos.x} y={pos.y} />, document.body)}
      <button ref={btnRef} onClick={follow} className={`neo-btn sm ${isFollowing ? "ghost" : "lime"} ${celebrate ? "invisible" : ""}`} style={{ padding: "6px 16px" }}>
        {isFollowing ? "Following" : "Follow"}
      </button>
    </>
  );
}

// ---------------------------------------------------------------- floating action rail
function ActionRail({ meme, onInvest, onComments, onShare, onMenu }: { meme: MemeView; onInvest: () => void; onComments: () => void; onShare: () => void; onMenu: () => void }) {

  const railBtn = "neo-btn icon !bg-black/55 !border-0 backdrop-blur-sm flex-col !w-11 !h-11 gap-0";
  const railNum = "text-[9.5px] font-bold -mt-0.5";

  return (
    <div className="absolute right-2.5 bottom-3 z-10 flex flex-col gap-2.5 items-center">
      <button className={railBtn} onClick={(e) => { e.stopPropagation(); onInvest(); }} aria-label="Invest Aura in this meme">
        <Spark size={17} color="#C8FF3D" />
        <span className={railNum} style={{ color: "#C8FF3D" }}>{fmtNum(meme.total_invested)}</span>
      </button>
      <button className={railBtn} onClick={(e) => { e.stopPropagation(); onComments(); }} aria-label="Comments">
        <Icon name="comment" size={16} strokeWidth={2.2} />
        <span className={`${railNum} text-white`}>{meme.comment_count}</span>
      </button>
      <button className={railBtn} onClick={(e) => { e.stopPropagation(); onShare(); }} aria-label="Send this meme in a chat">
        <Icon name="share" size={16} strokeWidth={2.4} />
        <span className={`${railNum} text-white`}>{meme.saves > 99 ? "99+" : meme.saves}</span>
      </button>
      <button className={railBtn} onClick={(e) => { e.stopPropagation(); onMenu(); }} aria-label="More actions">
        <Icon name="dots" size={16} strokeWidth={2.6} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- more menu sheet
function MenuSheet({ meme, open, onClose, onInvest, onSell }: { meme: MemeView; open: boolean; onClose: () => void; onInvest: () => void; onSell: () => void }) {
  const toast = useToast();
  const { user, refresh } = useSession();
  const [saved, setSaved] = useState(!!meme.is_saved);
  const [reportOpen, setReportOpen] = useState(false);

  const save = async () => {
    if (!user) return toast("Log in first.", "err");
    const r = await api<{ saved: boolean }>(`/api/memes/${meme.id}/save`, { method: "POST" });
    setSaved(r.saved);
    refresh();
    onClose();
  };
  const share = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/meme/${meme.id}`); toast("Link copied.", "ok"); onClose(); }
    catch { /* noop */ }
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} label="More actions">
        <div className="hd text-lg mb-4">{meme.caption.slice(0, 40)}{meme.caption.length > 40 ? "…" : ""}</div>
        <div className="space-y-2">
          <button className="neo-btn primary w-full !justify-start" onClick={() => { onClose(); onInvest(); }}><Spark size={13} color="#0a0a0a" /> Invest Aura</button>
          {meme.my_position && <button className="neo-btn coral w-full !justify-start" onClick={() => { onClose(); onSell(); }}>Sell position</button>}
          <button className="neo-btn ghost w-full !justify-start" onClick={() => { onClose(); window.location.href = `/create?remix=${meme.id}`; }}><Icon name="repeat" size={15} /> Remix this meme</button>
          <button className="neo-btn ghost w-full !justify-start" onClick={save}>{saved ? <><Icon name="star" size={15} filled strokeWidth={1.8} /> Saved</> : <><Icon name="star" size={15} /> Save to watchlist</>}</button>
          <button className="neo-btn ghost w-full !justify-start" onClick={share}><Icon name="share" size={15} /> Copy link</button>
          <button className="neo-btn ghost w-full !justify-start" onClick={() => { onClose(); setReportOpen(true); }}><Icon name="flag" size={15} /> Report</button>
        </div>
      </Sheet>
      <ReportDialog memeId={meme.id} open={reportOpen} onClose={() => setReportOpen(false)} />
    </>
  );
}

// ---------------------------------------------------------------- call sheet
export function CallSheet({ meme, open, onClose }: { meme: MemeView; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const myCall = meme.my_call;

  const call = async (target: "VIRAL" | "FLOP") => {
    setBusy(true);
    try {
      await api(`/api/memes/${meme.id}/call`, { json: { target } });
      await refresh();
      toast(target === "VIRAL" ? "Call placed: VIRAL. Prove it." : "Call placed: FLOP. Bold.", "ok");
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label="Make an AURA Call">
      <div className="hd text-xl mb-1">My Call</div>
      <p className="text-sm muted mb-4 line-clamp-1">{meme.caption}</p>
      {myCall ? (
        <div className="neo-sm p-4 text-center" style={{ background: myCall.status === "won" ? "var(--lime)" : myCall.status === "lost" ? "#ffecec" : "#fff7d6" }}>
          <div className="hd font-bold text-xs uppercase muted inline-flex items-center gap-1.5">
            {myCall.status === "won" ? <><Icon name="trophy" size={12} /> Call won</> : myCall.status === "lost" ? <><Icon name="skull" size={12} /> Call missed</> : "Open call"}
          </div>
          <div className="aura-num text-2xl mt-1 inline-flex items-center gap-2 justify-center">
            {myCall.target === "VIRAL" ? <><Icon name="rocket" size={20} /> VIRAL</> : <><Icon name="chart-down" size={20} /> FLOP</>}
          </div>
          {myCall.status === "open" && <p className="text-xs muted mt-2">Resolves in 7 days. Reputation on the line.</p>}
        </div>
      ) : (
        <>
          <p className="text-sm muted mb-4">Predict publicly. Right calls build your Prediction IQ. Resolves in 7 days.</p>
          <div className="grid grid-cols-2 gap-3">
            <button className="neo-btn lime big" disabled={busy} onClick={() => call("VIRAL")}>
              <Icon name="rocket" size={18} /> VIRAL<span className="block text-[11px] font-normal">+50% in 7 days</span>
            </button>
            <button className="neo-btn coral big" disabled={busy} onClick={() => call("FLOP")}>
              <Icon name="chart-down" size={18} /> FLOP<span className="block text-[11px] font-normal">−30% in 7 days</span>
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- cards
export function MemeCard({ meme, onChanged }: { meme: MemeView; onChanged?: () => void }) {
  const router = useRouter();
  const [investOpen, setInvestOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const mine = meme.my_position;

  return (
    <NeoCard className="overflow-hidden anim-rise">
      {/* creator row */}
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5">
        <Avatar name={meme.creator.display_name} bg={meme.creator.avatar_bg} username={meme.creator.username} size={36} />
        <div className="min-w-0 flex-1">
          <Link href={`/profile/${meme.creator.username}`} className="font-bold text-[13.5px] truncate block hover:underline">
            {meme.creator.display_name.toLowerCase().replace(/\s/g, "")}
          </Link>
          <div className="text-[11px] muted">{timeAgo(meme.created_at)}</div>
        </div>
        <FollowButton username={meme.creator.username} initial={!!meme.creator.is_following} />
      </div>

      {/* caption — part of the card click target that opens the detail page */}
      <p className="px-3.5 pt-2.5 pb-2 text-[14px] leading-snug font-medium cursor-pointer" onClick={() => router.push(`/meme/${meme.id}`)}>{meme.caption}</p>

      {/* media + rail — DOUBLE-TAP = INVEST ✦1 */}
      <div className="px-3">
        <div className="relative rounded-2xl overflow-hidden">
          <DoubleTapZone meme={meme} onSingle={() => router.push(`/meme/${meme.id}`)}>
            {meme.source === "instagram"
              ? <InstagramEmbed url={meme.source_url!} handle={meme.source_handle} />
              : <MediaView meme={meme} />}
          </DoubleTapZone>
          <ActionRail meme={meme} onInvest={() => setInvestOpen(true)} onComments={() => setCommentsOpen(true)} onShare={() => setShareOpen(true)} onMenu={() => setMenuOpen(true)} />
        </div>
      </div>

      <div className="px-3.5 py-3 flex items-center gap-2 flex-wrap cursor-pointer" onClick={() => router.push(`/meme/${meme.id}`)}>
        <span className="pill">✦ {meme.category}</span>
        {meme.source === "instagram" && <span className="pill" style={{ background: "rgba(255,0,105,0.14)", borderColor: "rgba(255,0,105,0.4)", color: "#ff7ab0" }}><Icon name="camera" size={11} strokeWidth={2.3} /> Instagram</span>}
        <HeatPill heat={meme.heat} />
        <ChangePct value={meme.change_24h} className="text-[13px]" />
        <span className="text-[11px] muted">· {fmtNum(meme.views)} views</span>
        {meme.label && <LabelPill label={meme.label} />}
      </div>

      <InvestSheet meme={meme} open={investOpen} onClose={() => setInvestOpen(false)} onDone={onChanged} />
      <SellSheet meme={meme} open={sellOpen} onClose={() => setSellOpen(false)} onDone={onChanged} />
      <MenuSheet meme={meme} open={menuOpen} onClose={() => setMenuOpen(false)} onInvest={() => setInvestOpen(true)} onSell={() => setSellOpen(true)} />
      {commentsOpen && <CommentsSheet meme={meme} onClose={() => { setCommentsOpen(false); onChanged?.(); }} />}
      {shareOpen && <ShareSheet meme={meme} open onClose={() => setShareOpen(false)} onSent={onChanged} />}
    </NeoCard>
  );
}

export function VideoMemeCard({ meme, onChanged }: { meme: MemeView; onChanged?: () => void }) {
  const router = useRouter();
  const [investOpen, setInvestOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const mine = meme.my_position;

  return (
    <NeoCard className="overflow-hidden anim-rise">
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5">
        <Avatar name={meme.creator.display_name} bg={meme.creator.avatar_bg} username={meme.creator.username} size={36} />
        <div className="min-w-0 flex-1">
          <Link href={`/profile/${meme.creator.username}`} className="font-bold text-[13.5px] truncate block hover:underline">
            {meme.creator.display_name.toLowerCase().replace(/\s/g, "")}
          </Link>
          <div className="text-[11px] muted">{timeAgo(meme.created_at)}</div>
        </div>
        <FollowButton username={meme.creator.username} initial={!!meme.creator.is_following} />
      </div>

      <p className="px-3.5 pt-2.5 pb-2 text-[14px] leading-snug font-medium cursor-pointer" onClick={() => router.push(`/meme/${meme.id}`)}>{meme.caption}</p>

      <div className="px-3">
        <div className="relative rounded-2xl overflow-hidden">
          <DoubleTapZone meme={meme} onSingle={() => router.push(`/meme/${meme.id}`)}>
            {meme.source === "instagram"
              ? <InstagramEmbed url={meme.source_url!} handle={meme.source_handle} />
              : <MediaView meme={meme} />}
          </DoubleTapZone>
          <ActionRail meme={meme} onInvest={() => setInvestOpen(true)} onComments={() => setCommentsOpen(true)} onShare={() => setShareOpen(true)} onMenu={() => setMenuOpen(true)} />
        </div>
      </div>

      <div className="px-3.5 py-3 flex items-center gap-2 flex-wrap">
        <span className="pill">✦ {meme.category}</span>
        <HeatPill heat={meme.heat} />
        <ChangePct value={meme.change_24h} className="text-[13px]" />
        <span className="text-[11px] muted">· {fmtNum(meme.views)} views</span>
        {mine && <button className="neo-btn sm coral !py-1.5" onClick={() => setSellOpen(true)}>Sell</button>}
      </div>

      <InvestSheet meme={meme} open={investOpen} onClose={() => setInvestOpen(false)} onDone={onChanged} />
      <SellSheet meme={meme} open={sellOpen} onClose={() => setSellOpen(false)} onDone={onChanged} />
      <MenuSheet meme={meme} open={menuOpen} onClose={() => setMenuOpen(false)} onInvest={() => setInvestOpen(true)} onSell={() => setSellOpen(true)} />
      {commentsOpen && <CommentsSheet meme={meme} onClose={() => { setCommentsOpen(false); onChanged?.(); }} />}
      {shareOpen && <ShareSheet meme={meme} open onClose={() => setShareOpen(false)} onSent={onChanged} />}
    </NeoCard>
  );
}

// ---------------------------------------------------------------- invest sheet (white, per reference)
const QUICK = [1, 5, 10, 25];

export function InvestSheet({ meme, open, onClose, onDone }: { meme: MemeView; open: boolean; onClose: () => void; onDone?: () => void }) {
  const { user, refresh } = useSession();
  const toast = useToast();
  const [amount, setAmount] = useState(1);
  const [custom, setCustom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const balance = user?.aura_balance ?? 0;
  const eff = custom != null ? Math.floor(Number(custom) || 0) : amount;
  const tooMuch = eff > balance;
  const units = eff / meme.current_price;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ invested: number }>(`/api/memes/${meme.id}/invest`, { json: { amount: eff, client_id: `sheet-${Date.now()}` } });
      setDone(r.invested);
      playSfx("cash");
      // let any listening page (home, reels) refetch counts immediately
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("aura:traded"));
      await refresh();
      onDone?.();
      setTimeout(() => { setDone(null); onClose(); }, 1300);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label="Invest in this meme">
      {done != null ? (
        <div className="text-center py-10 relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="anim-burst inline-flex items-center justify-center w-20 h-20 rounded-[62%_38%_55%_45%] border-2 border-[#0a0a0a]" style={{ background: "var(--lime)" }} aria-hidden>
              <Spark size={38} color="#0a0a0a" />
            </span>
          </div>
          <div className="hd text-2xl mb-2 anim-pop">Investment confirmed</div>
          <div className="aura-num text-3xl pos">+{fmtAura(done)} invested</div>
          <div className="text-sm muted mt-2">You found it early. Now we watch.</div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between mb-4">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={meme.thumbnail_url} alt="" className="w-14 h-14 rounded-2xl object-cover" />
            </div>
          </div>
          <div className="hd text-[22px] mb-5 -mt-10 text-center">Invest in this meme?</div>

          <div className="flex items-center justify-center gap-5 mb-4">
            <button className="neo-btn ghost icon !w-11 !h-11 !rounded-full" onClick={() => { setCustom(null); setAmount((a) => Math.max(1, a - 1)); }} aria-label="Decrease amount">−</button>
            {custom != null ? (
              <input
                autoFocus
                type="number"
                min={1}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="neo-input w-24 text-center aura-num text-2xl !border-0 !bg-transparent p-0"
                style={{ boxShadow: "none" }}
                aria-label="Custom amount"
              />
            ) : (
              <button className="flex items-center gap-1.5 min-w-20 justify-center" onClick={() => setCustom(String(amount))} aria-label="Edit amount">
                <Spark size={26} color="#0a0a0a" />
                <span className="aura-num text-4xl">{amount}</span>
              </button>
            )}
            <button className="neo-btn ghost icon !w-11 !h-11 !rounded-full" onClick={() => { setCustom(null); setAmount((a) => a + 1); }} aria-label="Increase amount">+</button>
          </div>

          <div className="flex gap-2 justify-center mb-5">
            {QUICK.map((q) => (
              <button key={q} className={`chip ${!custom && amount === q ? "active" : ""}`} onClick={() => { setCustom(null); setAmount(q); }}>+{q}</button>
            ))}
          </div>

          <div className="text-center text-sm muted mb-4">
            Available Aura <b style={{ color: tooMuch ? "#e5484d" : "#0a0a0a" }}>✦ {balance}</b>
            {meme.my_position && <> · your position <b style={{ color: "#0a0a0a" }}>✦ {meme.my_position.invested_amount}</b></>}
          </div>

          <NeoButton variant="lime" size="big" full disabled={busy || tooMuch || eff < 1} onClick={submit}>
            {tooMuch ? "Not enough Aura" : `Invest ✦ ${eff}`}
          </NeoButton>
          <p className="text-[11px] muted text-center mt-3">Virtual points — no real money. Double-tap any meme to invest ✦1 instantly.</p>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- sell sheet
const PCTS = [25, 50, 75, 100];

export function SellSheet({ meme, open, onClose, onDone, onSold }: { meme: MemeView; open: boolean; onClose: () => void; onDone?: () => void; onSold?: (r: { returned: number; pnl: number }, from: { x: number; y: number }) => void }) {
  const { refresh } = useSession();
  const toast = useToast();
  const [pct, setPct] = useState(100);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ returned: number; pnl: number } | null>(null);

  const position = meme.my_position;
  const units = ((position?.quantity ?? 0) * pct) / 100;
  const proceeds = Math.round(units * meme.current_price * 0.96 * 10) / 10;

  const submit = async (from?: { x: number; y: number }) => {
    setBusy(true);
    try {
      const r = await api<{ returned: number; pnl: number }>(`/api/memes/${meme.id}/sell`, { json: { percent: pct } });
      playSfx("sell");
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("aura:traded"));
      if (onSold) {
        // Caller owns the celebration (e.g. vault's fly-to-card) and closing.
        onSold(r, from ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.75 });
        await refresh();
        onDone?.();
      } else {
        setDone(r);
        await refresh();
        onDone?.();
        setTimeout(() => { setDone(null); onClose(); }, 1500);
      }
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  if (!position) return null;

  return (
    <Sheet open={open} onClose={onClose} label="Sell your position">
      {done ? (
        <div className="text-center py-10 relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="anim-burst inline-flex items-center justify-center w-20 h-20 rounded-[38%_62%_40%_60%] border-2 border-[#0a0a0a]" style={{ background: done.pnl >= 0 ? "var(--lime)" : "#ffecec", color: "#0a0a0a" }} aria-hidden>
              <Icon name={done.pnl >= 0 ? "rocket" : "battery"} size={34} strokeWidth={2.2} />
            </span>
          </div>
          <div className="hd text-2xl mb-2 anim-pop">Position sold</div>
          <div className={`aura-num text-3xl ${done.pnl >= 0 ? "pos" : "neg"}`}>
            {done.pnl >= 0 ? "+" : ""}{fmtAura(done.pnl)} P/L
          </div>
          <div className="text-sm muted mt-2">{fmtAura(done.returned)} Aura returned to your vault</div>
        </div>
      ) : (
        <>
          <div className="hd text-[22px] mb-4">Sell your position</div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="neo-sm p-2.5 text-center">
              <div className="text-[10px] hd uppercase muted">Position</div>
              <div className="aura-num text-sm">{position.quantity.toFixed(3)} u</div>
            </div>
            <div className="neo-sm p-2.5 text-center">
              <div className="text-[10px] hd uppercase muted">Value</div>
              <div className="aura-num text-sm">{fmtAura(position.current_value)}</div>
            </div>
            <div className="neo-sm p-2.5 text-center">
              <div className="text-[10px] hd uppercase muted">P/L</div>
              <div className={`aura-num text-sm ${position.pnl >= 0 ? "pos" : "neg"}`}>{fmtAura(position.pnl)}</div>
            </div>
          </div>
          <div className="flex gap-2 justify-center mb-4">
            {PCTS.map((p) => (
              <button key={p} className={`chip ${pct === p ? "active" : ""}`} onClick={() => setPct(p)}>{p}%</button>
            ))}
          </div>
          <div className="neo-sm p-3 mb-4 flex items-center justify-between">
            <span className="hd font-bold text-sm">Estimated proceeds</span>
            <span className="aura-num text-lg">{fmtAura(proceeds)}</span>
          </div>
          <NeoButton variant="coral" size="big" full disabled={busy} onClick={(e) => submit({ x: e.currentTarget.getBoundingClientRect().left + e.currentTarget.getBoundingClientRect().width / 2, y: e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2 })}>Sell {pct}%</NeoButton>
          <p className="text-[11px] muted text-center mt-3">A 4% sell spread keeps the market honest.</p>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- comment section
export function CommentSection({ memeId, initial }: { memeId: string; initial: Array<{ id: string; content: string; created_at: string; user: { username: string; display_name: string; avatar_bg: string } }> }) {
  const { user } = useSession();
  const toast = useToast();
  const [comments, setComments] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await api<{ comment: typeof comments[number] }>(`/api/memes/${memeId}/comments`, { json: { content: text } });
      setComments((c) => [...c, r.comment]);
      setText("");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="comments" className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="space-y-3 flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {comments.length === 0 && <p className="text-sm muted">No comments yet. Be the first contrarian.</p>}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5 items-start">
            <Avatar name={c.user.display_name} bg={c.user.avatar_bg} size={32} username={c.user.username} />
            <div className="neo-sm px-3 py-2 flex-1">
              <div className="text-xs hd font-bold">{c.user.display_name.toLowerCase().replace(/\s/g, "")}</div>
              <p className="text-sm">{c.content}</p>
            </div>
          </div>
        ))}
      </div>
      {user ? (
        <div className="flex gap-2 pt-2 shrink-0">
          <input
            className="neo-input"
            placeholder="Add a comment…"
            value={text}
            maxLength={280}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            aria-label="Add a comment"
          />
          <NeoButton variant="primary" onClick={submit} disabled={busy || !text.trim()}>Post</NeoButton>
        </div>
      ) : (
        <p className="text-sm muted pt-2 shrink-0"><Link href="/login" className="underline">Log in</Link> to join the conversation.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- comment sheet (Instagram-style, shared by feed + reels)
export type CommentRow = { id: string; content: string; created_at: string; user: { username: string; display_name: string; avatar_bg: string } };

/** Dark Instagram-style comment sheet. variant "reels" anchors it directly
 * under the shrunk still-playing media square; "feed" is a tall bottom sheet
 * over the post. Body scroll is locked while open; exit animates, then unmounts. */
export function CommentsSheet({ meme, onClose, variant = "feed" }: { meme: MemeView; onClose: () => void; variant?: "reels" | "feed" }) {
  const [initial, setInitial] = useState<CommentRow[] | null>(null);
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 240); // let the exit animation play, then unmount
  };
  useEffect(() => {
    let alive = true;
    api<{ comments: CommentRow[] }>(`/api/memes/${meme.id}/comments`)
      .then((d) => { if (alive) setInitial(d.comments); })
      .catch(() => { if (alive) setInitial([]); });
    return () => { alive = false; };
  }, [meme.id]);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div className="fixed inset-0 z-[70]" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={`absolute inset-0 bg-black/55 ${closing ? "c-fade-out" : "c-fade-in"}`} onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Comments · ${meme.caption}`}
        className={`absolute bottom-0 left-0 right-0 mx-auto max-w-[460px] flex flex-col bg-[#131313] border-t border-x border-[#232323] rounded-t-[26px] text-white shadow-[0_-12px_44px_rgba(0,0,0,0.7)] ${closing ? "c-slide-down" : "c-slide-up"}`}
        style={variant === "reels" ? { top: "calc(64px + 34vh + 12px)" } : { maxHeight: "72vh" }}
      >
        <div className="pt-2.5 pb-1 flex justify-center shrink-0 cursor-pointer" onClick={close} aria-label="Close comments">
          <span className="w-10 h-1 rounded-full bg-white/25" />
        </div>
        <div className="px-4 pb-2.5 flex items-center justify-between shrink-0 border-b border-[#232323]">
          <span className="hd font-bold text-[15px]">Comments</span>
          <span className="text-[11px] muted">{initial ? `${initial.length} so far` : ""}</span>
        </div>
        <div className="flex-1 min-h-0 px-4 pt-3 pb-4 flex flex-col">
          {initial == null ? (
            <div className="py-8 text-center hd muted text-sm">LOADING COMMENTS…</div>
          ) : (
            <CommentSection memeId={meme.id} initial={initial} />
          )}
        </div>
      </div>
    </div>
  );
}

export function MemeCardSkeleton() {
  return (
    <NeoCard className="p-3.5">
      <div className="flex items-center gap-3 mb-3">
        <div className="skeleton w-9 h-9 rounded-full" />
        <div className="skeleton h-4 w-28" />
      </div>
      <div className="skeleton h-4 w-2/3 mb-2.5" />
      <div className="skeleton w-full h-56" />
      <div className="skeleton h-3.5 w-1/2 mt-3" />
    </NeoCard>
  );
}

export function PositionStrip({ meme }: { meme: MemeView }) {
  const p = meme.my_position;
  if (!p) return null;
  return (
    <div className="neo-sm px-3 py-2 flex items-center justify-between text-sm" style={{ background: "var(--lime)", color: "#0a0a0a", borderColor: "var(--lime)" }}>
      <span className="hd font-bold">Your position</span>
      <span className="aura-num">{fmtAura(p.current_value)} ({fmtPct(p.pnl_pct)})</span>
    </div>
  );
}

// ---------------------------------------------------------------- report dialog
const REPORT_REASONS = [
  ["spam", "Spam"], ["harassment", "Harassment"], ["hate", "Hate"], ["sexual", "Sexual content"],
  ["violence", "Violence"], ["copyright", "Copyright"], ["other", "Other"],
] as const;

export function ReportDialog({ memeId, open, onClose }: { memeId: string; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("spam");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/memes/${memeId}/report`, { json: { category: reason, note, target_type: "meme" } });
      toast("Report sent to the mods.", "ok");
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label="Report meme">
      <div className="hd text-xl mb-4">Report this meme</div>
      <div className="space-y-2 mb-4">
        {REPORT_REASONS.map(([id, label]) => (
          <button key={id} className={`chip ${reason === id ? "active" : ""}`} onClick={() => setReason(id)} aria-pressed={reason === id}>{label}</button>
        ))}
      </div>
      <textarea className="neo-input mb-4" rows={2} placeholder="Anything the mods should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      <NeoButton variant="coral" full onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send report"}</NeoButton>
    </Sheet>
  );
}
