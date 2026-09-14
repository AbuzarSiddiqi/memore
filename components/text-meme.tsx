"use client";
// TEXT MEME components — a first-class MEMORE post format. The text is the
// hero: dark charcoal card, chunky display type, hand-drawn corner strokes,
// restrained accents. No images required; all Aura/invest interactions reuse
// the existing post system.
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MemeView } from "@/lib/types";
import { api, fmtAura, fmtNum, timeAgo, useSession, useToast } from "@/lib/client";
import { oneLine } from "@/lib/text";
import { CommentsSheet, DoubleTapZone, FollowButton, HeatPill, InvestSheet, ReportDialog, SellSheet } from "./meme";
import { ShareSheet } from "./share";
import { Avatar, ChangePct, NeoCard, Sheet } from "./ui";
import { Icon } from "./icons";
import { Spark } from "./brand";

export function isTextPost(m: { media_type?: string | null }): boolean {
  return m.media_type === "text";
}

// ---------------------------------------------------------------- safe rich text
// Line breaks and paragraphs render structurally; #hashtags and @mentions
// linkify. Text is emitted as React text nodes — user HTML is never parsed,
// so XSS is impossible by construction. Selection stays enabled (spec 30).

const TOKEN = /(#([a-zA-Z0-9_]{1,30})|@([a-zA-Z0-9_]{3,30}))/g;

function renderLine(line: string) {
  const parts = line.split(TOKEN);
  return parts.map((part, i) => {
    if (!part) return null;
    if (i % 4 === 1 && part.startsWith("#")) {
      return (
        <Link
          key={i}
          href={`/search?q=${encodeURIComponent(part)}`}
          className="text-[var(--lime)] font-bold hover:underline"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {part}
        </Link>
      );
    }
    if (i % 4 === 1 && part.startsWith("@")) {
      return (
        <Link
          key={i}
          href={`/profile/${part.slice(1)}`}
          className="text-[#b39aff] font-bold hover:underline"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {part}
        </Link>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className={`whitespace-pre-wrap break-words ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i} className={i > 0 ? "mt-3.5" : undefined}>
          {p.split("\n").map((line, j, arr) => (
            <React.Fragment key={j}>
              {renderLine(line)}
              {j < arr.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the text card
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Hand-drawn corner stroke — one wobbly bracket inked into a corner. */
function CornerStroke({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 34 34" className="pointer-events-none absolute -top-1.5 -left-1.5 h-8 w-8" style={{ transform: "rotate(-4deg)" }} aria-hidden>
      <path d="M6 28 C 4 18, 4 12, 7 6 C 13 3, 22 3, 28 6" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Occasional sticker-like accent — deterministic per post, never on all of them. */
function TextSticker({ id }: { id: string }) {
  const variant = hashId(id) % 4;
  if (variant !== 0) return null;
  const purple = hashId(id) % 8 < 4;
  const color = purple ? "#7C4DFF" : "#C8FF3D";
  return (
    <svg viewBox="0 0 30 30" className="pointer-events-none absolute -top-2 -right-2 h-7 w-7 anim-floaty" style={{ transform: "rotate(12deg)" }} aria-hidden>
      <path
        d="M15 3 C 16 9, 20 13, 26 14 C 20 16, 16 20, 15 26 C 14 20, 10 16, 4 14 C 10 13, 14 9, 15 3 Z"
        fill={purple ? "rgba(124,77,255,0.2)" : "rgba(200,255,61,0.18)"}
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TextPostBody({
  meme,
  size = "md",
  clamp = false,
  className = "",
}: {
  meme: Pick<MemeView, "id" | "caption" | "tags">;
  size?: "md" | "lg";
  clamp?: boolean;
  className?: string;
}) {
  const h = hashId(meme.id);
  const accent = h % 3 === 0 ? "#7C4DFF" : "#C8FF3D";
  const textCls = size === "lg" ? "text-[19px] leading-[1.42]" : "text-[17px] leading-[1.4]";
  return (
    <div
      className={`relative select-text bg-[#141414] border-2 border-[#2d2d2d] px-5 py-5 sm:px-6 ${className}`}
      style={{ borderRadius: "26px 20px 25px 22px / 22px 26px 20px 26px", boxShadow: "4px 4px 0 rgba(124, 77, 255, 0.14)" }}
    >
      <CornerStroke color={accent} />
      <TextSticker id={meme.id} />
      {clamp ? (
        <div className="relative max-h-[19rem] overflow-hidden">
          <RichText text={meme.caption} className={`font-display font-semibold text-white ${textCls}`} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14" style={{ background: "linear-gradient(to bottom, transparent, #141414 82%)" }} aria-hidden />
          <div className="absolute right-0 -bottom-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white/45">read full post ↓</div>
        </div>
      ) : (
        <RichText text={meme.caption} className={`font-display font-semibold text-white ${textCls}`} />
      )}
      {meme.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mt-4">
          {meme.tags.slice(0, 6).map((t) => (
            <span key={t} className="text-[11px] font-bold text-white/40 font-display">#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- feed card
function TextActionRow({ meme, onInvest, onComments, onShare, onMenu }: { meme: MemeView; onInvest: () => void; onComments: () => void; onShare: () => void; onMenu: () => void }) {
  const btn = "neo-btn icon !w-11 !h-11 !bg-[#141414] flex-col !gap-0";
  const num = "text-[9.5px] font-bold -mt-0.5";
  return (
    <div className="flex items-center justify-between gap-1.5 px-1 pt-0.5">
      <button className={btn} onClick={onInvest} aria-label="Invest Aura in this text meme">
        <Spark size={16} color="#C8FF3D" />
        <span className={num} style={{ color: "#C8FF3D" }}>{fmtNum(meme.total_invested)}</span>
      </button>
      <button className={btn} onClick={onComments} aria-label="Comments">
        <Icon name="comment" size={15} strokeWidth={2.2} />
        <span className={num}>{meme.comment_count}</span>
      </button>
      <button className={btn} onClick={onShare} aria-label="Send this text meme in a chat">
        <Icon name="share" size={15} strokeWidth={2.4} />
        <span className={num}>{meme.saves > 99 ? "99+" : meme.saves}</span>
      </button>
      <button className={btn} onClick={onMenu} aria-label="More actions">
        <Icon name="dots" size={15} strokeWidth={2.6} />
      </button>
      <span className="flex items-center gap-1.5 aura-num text-[13px] ml-1" title="Current Aura price">
        <Spark size={12} color="#C8FF3D" /> {fmtAura(meme.current_price)}
        <ChangePct value={meme.change_24h} className="text-[11px]" />
      </span>
    </div>
  );
}

function TextMenuSheet({ meme, open, onClose, onInvest, onSell }: { meme: MemeView; open: boolean; onClose: () => void; onInvest: () => void; onSell: () => void }) {
  const toast = useToast();
  const { user, refresh } = useSession();
  const [saved, setSaved] = React.useState(!!meme.is_saved);
  const [reportOpen, setReportOpen] = React.useState(false);

  const save = async () => {
    if (!user) return toast("Log in first.", "err");
    const r = await api<{ saved: boolean }>(`/api/memes/${meme.id}/save`, { method: "POST" });
    setSaved(r.saved);
    refresh();
    onClose();
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/meme/${meme.id}`); toast("Link copied.", "ok"); onClose(); } catch { /* noop */ }
  };
  const copyText = async () => {
    try { await navigator.clipboard.writeText(meme.caption); toast("Text copied.", "ok"); onClose(); } catch { /* noop */ }
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} label="More actions">
        <div className="hd text-lg mb-4">{oneLine(meme.caption, 44)}</div>
        <div className="space-y-2">
          <button className="neo-btn primary w-full !justify-start" onClick={() => { onClose(); onInvest(); }}><Spark size={13} color="#0a0a0a" /> Invest Aura</button>
          {meme.my_position && <button className="neo-btn coral w-full !justify-start" onClick={() => { onClose(); onSell(); }}>Sell position</button>}
          <button className="neo-btn ghost w-full !justify-start" onClick={save}>{saved ? <><Icon name="star" size={15} filled strokeWidth={1.8} /> Saved</> : <><Icon name="star" size={15} /> Save to watchlist</>}</button>
          <button className="neo-btn ghost w-full !justify-start" onClick={copyText}><Icon name="comment" size={15} /> Copy text</button>
          <button className="neo-btn ghost w-full !justify-start" onClick={copyLink}><Icon name="share" size={15} /> Copy link</button>
          <button className="neo-btn ghost w-full !justify-start" onClick={() => { onClose(); setReportOpen(true); }}><Icon name="flag" size={15} /> Report</button>
        </div>
      </Sheet>
      <ReportDialog memeId={meme.id} open={reportOpen} onClose={() => setReportOpen(false)} />
    </>
  );
}

export function TextMemeCard({ meme, onChanged }: { meme: MemeView; onChanged?: () => void }) {
  const router = useRouter();
  const [investOpen, setInvestOpen] = React.useState(false);
  const [sellOpen, setSellOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [commentsOpen, setCommentsOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);

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
        <span className="pill p-black !text-[9.5px] mr-1" title="Text meme">Aa TEXT</span>
        <FollowButton username={meme.creator.username} initial={!!meme.creator.is_following} />
      </div>

      {/* the text meme itself — double-tap = invest ✦1, text stays selectable.
          the invested chip is rendered inline below instead of overlaying text. */}
      <div className="px-3 pt-3">
        <DoubleTapZone meme={meme} chipPosition="none" onSingle={() => router.push(`/meme/${meme.id}`)}>
          <TextPostBody meme={meme} clamp={meme.caption.length > 320} />
        </DoubleTapZone>
      </div>

      {/* actions — compact row UNDER the text, never covering it */}
      <div className="px-3 pt-3">
        <TextActionRow meme={meme} onInvest={() => setInvestOpen(true)} onComments={() => setCommentsOpen(true)} onShare={() => setShareOpen(true)} onMenu={() => setMenuOpen(true)} />
      </div>

      <div className="px-3.5 py-3 flex items-center gap-2 flex-wrap cursor-pointer" onClick={() => router.push(`/meme/${meme.id}`)}>
        {meme.my_position && (
          <span className="pill p-lime !text-[9.5px] aura-num">✦ {meme.my_position.invested_amount} invested by you</span>
        )}
        <span className="pill">✦ {meme.category}</span>
        <HeatPill heat={meme.heat} />
        <ChangePct value={meme.change_24h} className="text-[13px]" />
        <span className="text-[11px] muted">· {fmtNum(meme.views)} views</span>
        {meme.my_position && <button className="neo-btn sm coral !py-1.5" onClick={(e) => { e.stopPropagation(); setSellOpen(true); }}>Sell</button>}
      </div>

      <InvestSheet meme={meme} open={investOpen} onClose={() => setInvestOpen(false)} onDone={onChanged} />
      <SellSheet meme={meme} open={sellOpen} onClose={() => setSellOpen(false)} onDone={onChanged} />
      <TextMenuSheet meme={meme} open={menuOpen} onClose={() => setMenuOpen(false)} onInvest={() => setInvestOpen(true)} onSell={() => setSellOpen(true)} />
      {commentsOpen && <CommentsSheet meme={meme} onClose={() => { setCommentsOpen(false); onChanged?.(); }} />}
      {shareOpen && <ShareSheet meme={meme} open onClose={() => setShareOpen(false)} onSent={onChanged} />}
    </NeoCard>
  );
}

// ---------------------------------------------------------------- tiles & thumbs
/** Square tile for the profile grid — shows the opening lines of the text. */
export function TextTile({ meme, className = "" }: { meme: Pick<MemeView, "id" | "caption">; className?: string }) {
  const preview = oneLine(meme.caption, 120);
  return (
    <div className={`relative bg-[#141414] border-2 border-[#2d2d2d] p-2.5 overflow-hidden ${className}`} style={{ borderRadius: "14px 11px 13px 12px / 12px 14px 11px 13px" }}>
      <span className="font-display font-extrabold text-[26px] leading-none" style={{ color: "rgba(200,255,61,0.9)" }}>Aa</span>
      <p className="text-[9.5px] leading-snug text-white/75 mt-1.5 line-clamp-4">{preview}</p>
      <span className="absolute bottom-1.5 right-2 text-[8.5px] font-extrabold tracking-wider text-white/35">TEXT</span>
    </div>
  );
}

/** Small rounded thumbnail replacement for list rows (market, search, vault, rail). */
export function TextThumb({ meme, className = "" }: { meme: Pick<MemeView, "id" | "caption">; className?: string }) {
  return (
    <div className={`relative bg-[#141414] border-2 border-[#2d2d2d] flex items-center justify-center overflow-hidden ${className}`} style={{ borderRadius: "12px 9px 11px 10px / 10px 12px 9px 11px" }}>
      <span className="font-display font-extrabold" style={{ color: "rgba(200,255,61,0.9)", fontSize: "1.35em" }}>Aa</span>
      <span className="absolute bottom-0.5 right-1 text-[7px] font-extrabold tracking-wider text-white/35">TXT</span>
    </div>
  );
}

/** Compact preview used inside chat bubbles for shared text memes. */
export function TextPostPreview({ meme }: { meme: MemeView }) {
  return (
    <div className="rounded-2xl overflow-hidden border-2 border-[#0a0a0a] bg-[#141414] text-white w-[210px]">
      <div className="px-2.5 pt-1.5 flex items-center gap-1 text-[9px] font-bold tracking-[0.18em] text-white/60">
        <Spark size={9} color="#C8FF3D" /> TEXT MEME
      </div>
      <Link href={`/meme/${meme.id}`} className="block px-3 py-2">
        <p className="font-display font-semibold text-[13px] leading-snug whitespace-pre-wrap line-clamp-6 select-text">{meme.caption}</p>
      </Link>
      <div className="px-2.5 py-2 flex items-center gap-1.5 flex-wrap">
        <span className="pill p-yellow !text-[9px]">✦ {meme.current_price}</span>
        {meme.heat && <span className="pill p-black !text-[9px]">{meme.heat.level}</span>}
        <ChangePct value={meme.change_24h} className="text-[9.5px]" />
      </div>
    </div>
  );
}

/** Reels-style full-screen text slide body (double-tap = invest handled by caller). */
export function TextReelBody({ meme, dimmed }: { meme: MemeView; dimmed?: boolean }) {
  return (
    <div className="h-full w-full flex items-center justify-center px-5" style={{ background: "radial-gradient(120% 90% at 50% 10%, #171717 0%, #0a0a0a 70%)" }}>
      <div className={`w-full max-w-lg transition-opacity duration-300 ${dimmed ? "opacity-30" : "opacity-100"}`}>
        <TextPostBody meme={meme} size="lg" />
      </div>
    </div>
  );
}
