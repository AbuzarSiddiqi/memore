"use client";
// CHAT — one 24-hour conversation. Clean, compact mobile messaging UI with a
// quiet MEMORE hand-drawn accent: wobbly ink lines, lime + purple, handwritten
// type. The server's clock decides when it all disappears.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, useApi, useSession, useToast, timeAgo } from "@/lib/client";
import { getCachedMessages, appendCachedMessages, purgeConversationMessagesLocal, getCachedChats, removeCachedMessage, updateCachedMessageReactions } from "@/lib/client-cache";
import { playSfx } from "@/lib/sfx";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

import type { ChatDetail, ChatMessageView, ChatReplyRef, MemeView } from "@/lib/types";
import { REACTION_IDS } from "@/lib/reactions";
import { Avatar, NeoButton, Sheet } from "@/components/ui";
import { InvestSheet } from "@/components/meme";
import { ReactionStamps, ReactionTray, armClickGuard } from "@/components/reactions";
import { StickerArt, StickerSheet, recordStickerRecent } from "@/components/stickers";
import { ShareSheet } from "@/components/share";
import { Icon, type IconName } from "@/components/icons";
import { Spark } from "@/components/brand";

// E2EE + presence
import { encryptMessagePayload, forgetDecrypted } from "@/lib/crypto/engine";
import { encryptMedia, decryptMedia } from "@/lib/crypto/media";
import { hydrateForDisplay, rememberMediaKey, mediaKeyFor } from "@/lib/chat/display";
import { presenceHub, usePeerPresence, usePeerTyping, useTypingBroadcaster } from "@/lib/realtime/presence";

function presenceLabel(status: string): string {
  switch (status) {
    case "viewing_meme": return "viewing a meme";
    case "investing": return "investing";
    case "browsing": return "browsing";
    case "away": return "away";
    default: return "online";
  }
}

/** Decrypted private media viewer: fetch the ciphertext blob, decrypt it
 * locally (AES-GCM, key from the message envelope), render a local blob URL.
 * The plaintext bytes never hit any server or persistent cache. */
function useDecryptedMediaUrl(messageId: string | null, mediaUrl: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!mediaUrl || !messageId) return;
    const keys = mediaKeyFor(messageId);
    if (!keys) return; // payload not decrypted yet — nothing to show
    let alive = true;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await fetch(mediaUrl);
        if (!res.ok) return;
        const cipher = await res.arrayBuffer();
        const blob = await decryptMedia(cipher, keys.key, keys.iv);
        if (!alive) return;
        objectUrl = URL.createObjectURL(new Blob([blob], { type: keys.mime }));
        setUrl(objectUrl);
      } catch {
        // wrong key / corrupt blob — leave the placeholder visible
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [messageId, mediaUrl]);
  return url;
}

function EncryptedImage({ msg }: { msg: ChatMessageView }) {
  const url = useDecryptedMediaUrl(msg.id, msg.media_url);
  if (!url) {
    return (
      <span className="mb-1 flex h-[100px] w-[150px] items-center justify-center rounded-lg bg-[#141414] text-[11px] text-white/40">
        decrypting…
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="mb-1 max-w-[190px] rounded-lg" loading="lazy" />;
}

function EncryptedVideo({ msg }: { msg: ChatMessageView }) {
  const url = useDecryptedMediaUrl(msg.id, msg.media_url);
  if (!url) {
    return (
      <span className="mb-1 flex h-[100px] w-[150px] items-center justify-center rounded-lg bg-[#141414] text-[11px] text-white/40">
        decrypting…
      </span>
    );
  }
  return <video src={url} controls className="mb-1 max-w-[190px] rounded-lg" preload="metadata" />;
}

const TRAY_KEY = "memore-chat-reactions";
const REPLY_THRESHOLD = 64; // px of pull before a swipe becomes a reply

/** Short quote line for a reply reference (message or post). */
function quoteText(q: { type: ChatMessageView["type"]; content: string; sticker_id?: string | null; post?: { caption: string } | null }): string {
  if (q.type === "sticker") return "sticker";
  if (q.type === "image") return "photo";
  if (q.type === "video") return "video";
  if (q.type === "post") return `MEMORE POST${q.post?.caption ? ` · ${q.post.caption}` : ""}`;
  return q.content || "…";
}

function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Barely-there screen edge removed — the chat is now frameless, edge-to-edge
 * like Instagram's chat. (ScreenFrame deleted 2026-09-15 per user.) */

/** One thin, slightly imperfect purple line under the header. */
function HeaderRule() {
  return (
    <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="mx-4 h-[2.5px] w-auto shrink-0" style={{ width: "calc(100% - 32px)" }} aria-hidden>
      <path d="M0.5 2.2 C 18 1, 45 3.1, 70 1.7 C 82 1.1, 92 2.5, 99.5 1.9" fill="none" stroke="rgba(124,77,255,0.85)" strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Hand-drawn ephemeral indicator — there is no conversation-wide countdown
 * (each message owns its 24h lifetime and expires silently), so the header
 * just states the mode. */
function HeaderClock({ tempChat }: { tempChat: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-[#C8FF3D] aura-num">
      {tempChat ? (
        <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden>
          <path d="M13.5 3 C 9 4.5, 8.5 9, 12 11 C 8 12, 7 17, 11 19.5 C 6.5 19, 4.5 14.5, 6.5 11 C 4 8, 6 4, 9.5 3.4 C 11 3, 12.5 2.8, 13.5 3 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 9 C 19 10, 19.5 15, 15.5 17.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden>
          <circle cx="12" cy="13" r="8.4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M12 9.4v4l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span className="font-display font-bold">{tempChat ? "temporary chat" : "24h messages"}</span>
    </span>
  );
}

/** Wobbly comic ink bubble. The ENTIRE silhouette — body, wobble, and tail —
 * is ONE continuous hand-drawn path drawn in measured pixel space, so the tail
 * is always connected to the bubble (never a glued-on triangle) and the paint
 * covers the full box (tall messages never crop). The first bubble of a run
 * gets a curled flick tail; ~1/3 of the others get a sharp comic dialog-box
 * corner, both seeded from the message id so shapes feel randomly sketched.
 * Mine is lime with charcoal ink, theirs is charcoal with purple ink. */
function BubbleFrame({ mine, tail, beak = false, seed = 0 }: { mine: boolean; tail: boolean; beak?: boolean; seed?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const kind = tail ? "flick" : beak ? "beak" : "none";
  const d = size.w > 0 && size.h > 0 ? bubbleOutline(size.w, size.h, seed, kind, mine) : "";
  const fill = mine ? "#C8FF3D" : "#161616";
  const ink = mine ? "rgba(10,10,10,0.72)" : "#7C4DFF";
  return (
    <span ref={ref} className="pointer-events-none absolute -inset-2.5 block" aria-hidden>
      {d && (
        <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} className="absolute left-0 top-0 overflow-visible">
          <path d={d} fill={fill} stroke={ink} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

/** One continuous hand-drawn bubble outline in pixel space. (0,0) is 10px
 * outside the text box on every side, leaving room for the ink and the tail
 * tip. Clockwise: top → right → bottom → left, each edge a slightly wavy
 * cubic; the sender's bottom corner is replaced by the tail. */
function bubbleOutline(w: number, h: number, seed: number, kind: "none" | "flick" | "beak", mine: boolean): string {
  const m = 10;
  const x0 = m, y0 = m;
  const x1 = Math.max(w - m, x0 + 40);
  const y1 = Math.max(h - m, y0 + 26);
  const r = Math.min(17, Math.max(11, (y1 - y0) / 3.2));
  // deterministic ±v px jitter from the message seed
  const j = (i: number, v: number) => ((((seed >> (i * 2)) & 3) / 3) - 0.5) * 2 * v;
  const wT = j(1, 1.3), wR = j(2, 1.3), wB = j(3, 1.3), wL = j(4, 1.3);
  const tail = kind !== "none";
  const onRight = mine;              // mine → tail at bottom-right, theirs → bottom-left
  const sharp = kind === "beak";     // sharp dialog point vs curled flick
  const F = (n: number) => n.toFixed(1);
  const tipY = y1 + 6.2;
  const ey = y1 - (sharp ? 9 : 13);  // where the straight edge hands off to the tail

  let d = `M ${F(x0 + r + j(5, 1.5))} ${F(y0 + j(6, 1))}`;
  // top edge + top-right corner
  d += ` C ${F(x0 + (x1 - x0) * 0.3)} ${F(y0 + wT)}, ${F(x0 + (x1 - x0) * 0.72)} ${F(y0 - wT)}, ${F(x1 - r + j(7, 1.5))} ${F(y0 + j(8, 0.6))}`;
  d += ` C ${F(x1 - r * 0.35)} ${F(y0)}, ${F(x1 + wR)} ${F(y0 + r * 0.35)}, ${F(x1 + wR)} ${F(y0 + r)}`;

  if (tail && onRight) {
    // right edge stops above the corner, sweeps out to the tip, returns to the bottom edge
    d += ` C ${F(x1 + wR)} ${F(y0 + (y1 - y0) * 0.48)}, ${F(x1 + wR * 0.5)} ${F(y1 - r * 1.35)}, ${F(x1 + j(9, 1))} ${F(ey)}`;
    d += sharp
      ? ` C ${F(x1 + 2.5)} ${F(ey + 4.5)}, ${F(x1 + 6)} ${F(y1 + 0.5)}, ${F(x1 + 6)} ${F(tipY)}`
      : ` C ${F(x1 + 2)} ${F(ey + 5)}, ${F(x1 + 7.6)} ${F(y1 - 1)}, ${F(x1 + 6.4)} ${F(tipY)}`;
    d += sharp
      ? ` C ${F(x1 + 2.2)} ${F(y1 + 3)}, ${F(x1 - 4)} ${F(y1 + 1.8)}, ${F(x1 - 13)} ${F(y1 + wB)}`
      : ` C ${F(x1 + 0.8)} ${F(y1 + 2.6)}, ${F(x1 - 6)} ${F(y1 + 1.6)}, ${F(x1 - 15)} ${F(y1 + wB)}`;
    d += ` C ${F(x0 + (x1 - x0) * 0.62)} ${F(y1 + wB)}, ${F(x0 + (x1 - x0) * 0.34)} ${F(y1 - wB)}, ${F(x0 + r + j(10, 1.5))} ${F(y1 + j(11, 1))}`;
  } else {
    // right edge + bottom-right corner
    d += ` C ${F(x1 + wR)} ${F(y0 + (y1 - y0) * 0.48)}, ${F(x1 + wR * 0.6)} ${F(y1 - r)}, ${F(x1 - r * 0.35 + j(9, 1.5))} ${F(y1 + j(10, 1))}`;
    if (tail) {
      // bottom edge stops short of the bottom-left corner — the tail lives
      // there, an exact mirror of the sent flick: bottom edge → tip → left edge
      d += ` C ${F(x0 + (x1 - x0) * 0.68)} ${F(y1 + wB)}, ${F(x0 + 24)} ${F(y1 - wB)}, ${F(x0 + 15)} ${F(y1 + wB)}`;
      d += sharp
        ? ` C ${F(x0 + 4)} ${F(y1 + 1.8)}, ${F(x0 - 2.2)} ${F(y1 + 3)}, ${F(x0 - 6)} ${F(tipY)}`
        : ` C ${F(x0 + 6)} ${F(y1 + 1.6)}, ${F(x0 - 0.8)} ${F(y1 + 2.6)}, ${F(x0 - 6.4)} ${F(tipY)}`;
      d += sharp
        ? ` C ${F(x0 - 6)} ${F(y1 + 0.5)}, ${F(x0 - 2.5)} ${F(y1 - 4.5)}, ${F(x0 + wL + j(12, 1))} ${F(ey)}`
        : ` C ${F(x0 - 7.6)} ${F(y1 - 1)}, ${F(x0 - 2)} ${F(y1 - 8)}, ${F(x0 + wL + j(12, 1))} ${F(ey)}`;
    } else {
      d += ` C ${F(x0 + (x1 - x0) * 0.66)} ${F(y1 + wB)}, ${F(x0 + (x1 - x0) * 0.32)} ${F(y1 - wB)}, ${F(x0 + r + j(10, 1.5))} ${F(y1 + j(11, 1))}`;
    }
  }

  if (tail && !onRight) {
    // left edge starts where the tail handed back
    d += ` C ${F(x0 + wL)} ${F(y1 - (sharp ? 5.5 : 8.5))}, ${F(x0 + wL)} ${F(y0 + (y1 - y0) * 0.52)}, ${F(x0 + j(12, 1.5))} ${F(y0 + r)}`;
  } else {
    // bottom-left corner + left edge
    d += ` C ${F(x0 + j(11, 0.5))} ${F(y1)}, ${F(x0 + wL)} ${F(y1 - r * 0.4)}, ${F(x0 + wL)} ${F(y1 - r)}`;
    d += ` C ${F(x0 + wL)} ${F(y0 + (y1 - y0) * 0.52)}, ${F(x0 + wL * 0.5)} ${F(y0 + r * 0.8)}, ${F(x0 + j(12, 1.5))} ${F(y0 + r)}`;
  }
  // top-left corner, close
  d += ` C ${F(x0 + wL * 0.4)} ${F(y0 + r * 0.2)}, ${F(x0 + r * 0.4)} ${F(y0)}, ${F(x0 + r + j(5, 1.5))} ${F(y0 + j(6, 1))} Z`;
  return d;
}

/** Dynamic hand-drawn purple doodle border for the composer input wrapper.
 * The SVG path fits the measured width and height, preserving 18px wobbly corner curves
 * and subtle natural waviness along top/bottom/sides, so text NEVER escapes the border. */
function ComposerDoodleBorder({ width, height }: { width: number; height: number }) {
  const w = Math.max(width, 60);
  const h = Math.max(height, 42);
  const d = `
    M 18 2.5
    C ${w * 0.3} 1.6, ${w * 0.7} 3.2, ${w - 18} 2.4
    C ${w - 6} 2, ${w - 1.5} 7, ${w - 1.8} 18
    C ${w - 2.2} ${h * 0.45}, ${w - 1.6} ${h * 0.75}, ${w - 2} ${h - 18}
    C ${w - 2.2} ${h - 6}, ${w - 7} ${h - 1.8}, ${w - 18} ${h - 2.4}
    C ${w * 0.7} ${h - 3}, ${w * 0.3} ${h - 1.6}, 18 ${h - 2.5}
    C 7 ${h - 2.2}, 1.8 ${h - 7}, 2.2 ${h - 18}
    C 2.4 ${h * 0.55}, 1.6 ${h * 0.3}, 2 18
    C 1.8 7, 7 2.2, 18 2.5 Z
  `;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <path
        d={d}
        fill="#101010"
        stroke="rgba(124,77,255,0.92)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Small wobbly circle used by the composer buttons. */
function WobblyCircle({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <path
        d="M20 2.8 C 29 2.4, 37.2 8.4, 37.4 19.4 C 37.8 30.4, 29.4 37.6, 19.6 37.2 C 9.8 37, 2.6 30, 2.9 19.8 C 3.2 9.6, 11 3.2, 20 2.8 Z"
        fill={fill} stroke={stroke} strokeWidth="1.8" strokeLinecap="round"
      />
    </svg>
  );
}

/** Marker doodles in the reserved outer lane — every bubble is shifted 10px
 * inward from its outer side (sent → right, received → left), and the marks
 * center in that lane: ~4-6px clear of the wobble ink, never touching the
 * avatar (received) or the screen edge (sent), and always inside the bubble's
 * own vertical band. Tail/beak bubbles get one quiet mid-height mark so
 * nothing fights the tail or the avatar; others get one of six random strokes
 * at a random height, about half with a second tiny cross-ink slash. */
function BubbleAccents({ mine, seed, tail }: { mine: boolean; seed: number; tail: boolean }) {
  const ink = mine ? "rgba(200,255,61,0.85)" : "rgba(150,112,255,0.9)";
  const alt = mine ? "rgba(150,112,255,0.75)" : "rgba(200,255,61,0.7)";
  // Anchor by the mark's own width: its INNER edge lands 5px clear of the
  // box edge, so no stroke ever crosses the ink line (which bulges ~2.4px out).
  const out = (w: number) => (mine ? { right: -(w + 5) } : { left: -(w + 5) }) as React.CSSProperties;

  if (tail) {
    // the tail already decorates the bottom corner — one quiet mark mid-height
    const t = seed % 3;
    return (
      <>
        {t === 0 && (
          <svg viewBox="0 0 10 13" className="pointer-events-none absolute -rotate-6 h-[13px] w-[10px]" style={{ top: "55%", ...out(10) }} aria-hidden>
            <path d="M2.5 10.5 L6.5 2.5 M5.5 11.5 L9 4.5" stroke={ink} strokeWidth="1.9" strokeLinecap="round" fill="none" />
          </svg>
        )}
        {t === 1 && (
          <svg viewBox="0 0 11 11" className="pointer-events-none absolute rotate-12 h-[11px] w-[11px]" style={{ top: "48%", ...out(11) }} aria-hidden>
            <path d="M5.5 1 L5.5 10 M1 5.5 L10 5.5" stroke={ink} strokeWidth="1.9" strokeLinecap="round" fill="none" />
          </svg>
        )}
        {t === 2 && (
          <svg viewBox="0 0 10 13" className="pointer-events-none absolute h-[13px] w-[10px]" style={{ top: "52%", ...out(10) }} aria-hidden>
            <path d="M8.5 2.5 C 4 1, 1.8 5, 4 8 C 5.8 10.4, 9 8.6, 8.2 6.2 C 7.7 4.6, 5.6 4.7, 5.3 6.2" stroke={ink} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          </svg>
        )}
      </>
    );
  }

  const v = seed % 6;
  const companion = seed % 2 === 0;
  return (
    <>
      {v === 0 && (
        // double slashes, upper
        <svg viewBox="0 0 10 13" className="pointer-events-none absolute -rotate-6 h-[13px] w-[10px]" style={{ top: "12%", ...out(10) }} aria-hidden>
          <path d="M2.5 10.5 L6.5 2.5 M5.5 11.5 L9 4.5" stroke={ink} strokeWidth="1.9" strokeLinecap="round" fill="none" />
        </svg>
      )}
      {v === 1 && (
        // triple ticks, upper-middle
        <svg viewBox="0 0 9 15" className="pointer-events-none absolute rotate-3 h-[15px] w-[9px]" style={{ top: "32%", ...out(9) }} aria-hidden>
          <path d="M1.5 12 L4.5 3.5 M3.5 13 L6.5 5 M5.5 11.5 L8 6.5" stroke={ink} strokeWidth="1.9" strokeLinecap="round" fill="none" />
        </svg>
      )}
      {v === 2 && (
        // swirl, middle
        <svg viewBox="0 0 10 13" className="pointer-events-none absolute h-[13px] w-[10px]" style={{ top: "50%", ...out(10) }} aria-hidden>
          <path d="M8.5 2.5 C 4 1, 1.8 5, 4 8 C 5.8 10.4, 9 8.6, 8.2 6.2 C 7.7 4.6, 5.6 4.7, 5.3 6.2" stroke={ink} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      )}
      {v === 3 && (
        // plus-sparkle, lower
        <svg viewBox="0 0 11 11" className="pointer-events-none absolute rotate-12 h-[11px] w-[11px]" style={{ top: "68%", ...out(11) }} aria-hidden>
          <path d="M5.5 1 L5.5 10 M1 5.5 L10 5.5" stroke={ink} strokeWidth="1.9" strokeLinecap="round" fill="none" />
        </svg>
      )}
      {v === 4 && (
        // double slashes, lower
        <svg viewBox="0 0 10 13" className="pointer-events-none absolute rotate-6 h-[13px] w-[10px]" style={{ top: "80%", ...out(10) }} aria-hidden>
          <path d="M2.5 2.5 L6.5 10.5 M5.5 1.5 L9 8.5" stroke={ink} strokeWidth="1.9" strokeLinecap="round" fill="none" />
        </svg>
      )}
      {v === 5 && (
        // open C-curve, upper-middle
        <svg viewBox="0 0 11 10" className="pointer-events-none absolute h-[10px] w-[11px]" style={{ top: "42%", ...out(11) }} aria-hidden>
          <path d="M9 1.5 C 4 2.5, 2 5.5, 3.5 8.5" stroke={ink} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      )}
      {companion && (
        // tiny second stroke in the cross ink, opposite half of the bubble
        <svg viewBox="0 0 7 11" className="pointer-events-none absolute h-[11px] w-[7px] -rotate-6" style={{ top: v <= 2 ? "74%" : "18%", ...out(7) }} aria-hidden>
          <path d="M2 9 L5 2" stroke={alt} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      )}
    </>
  );
}

/** Reply quote for bubble-free messages (stickers, shared posts). Tap = jump
 * to the message it answers. */
function QuoteInline({ refr, mine, username, onJump }: { refr: ChatReplyRef; mine: boolean; username: string; onJump: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onJump(); }}
      aria-label="Jump to original message"
      className={`mb-1 flex w-full items-center gap-1.5 border-l-2 pl-1.5 text-left ${mine ? "border-[#0a0a0a]/50" : "border-[#7C4DFF]"}`}
    >
      {refr.post && (
        refr.post.media_type === "text"
          ? <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-[#141414] font-display text-[8px] font-extrabold text-[#C8FF3D]">Aa</span>
          : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={refr.post.thumbnail_url} alt="" className="h-4 w-4 rounded-[3px] object-cover" loading="lazy" />
          )
      )}
      <span className="truncate text-[10.5px] font-bold text-[#C8FF3D]">
        ↳ {mine ? "you" : `@${username}`} · {quoteText(refr)}
      </span>
    </button>
  );
}

/** Reply arrow revealed while swiping a message. */
function ReplyArrow({ mine }: { mine: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
      <path
        d="M9 5 L4 10 L9 15 M4 10 L13.5 10 C 17.8 10, 20 12.8, 20 17 L 20 19"
        fill="none" stroke={mine ? "#C8FF3D" : "#C084FC"} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const toast = useToast();
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false); // animated exit before route change
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState<number>(16);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [kbFocused, setKbFocused] = useState(false); // native keyboard open → tighten the composer's bottom padding
  const [menu, setMenu] = useState(false);
  const [sharePost, setSharePost] = useState(false);
  const [investMeme, setInvestMeme] = useState<MemeView | null>(null);
  const [attach, setAttach] = useState(false);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 42 });
  const [animatingMsgIds, setAnimatingMsgIds] = useState<Record<string, "zuup" | "receive" | "unsend" | "sticker">>({});
  const [doubleTapBurst, setDoubleTapBurst] = useState<{ msgId: string; x: number; y: number } | null>(null);
  const isNearBottomRef = useRef(true);
  const initialScrollDone = useRef(false);
  const [reactTo, setReactTo] = useState<{ msgId: string; rect: DOMRect } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(["aura", "w", "f", "cook", "dead"]);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [shareMeme, setShareMeme] = useState<MemeView | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageView | null>(null);
  const [swipe, setSwipe] = useState<{ msgId: string; dx: number } | null>(null);
  const pressTimer = useRef<number | null>(null);
  const gestRef = useRef<{ id: string; msg: ChatMessageView; x: number; y: number; dir: 1 | -1; mode: "idle" | "swipe" | "react"; dx: number } | null>(null);
  const reactElRef = useRef<HTMLElement | null>(null);
  const hoverRef = useRef(0);
  const lastTapRef = useRef<{ id: string; t: number } | null>(null);
  const trayCentersRef = useRef<number[] | null>(null);
  const trayBandRef = useRef<{ top: number; bottom: number; left: number; right: number } | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [clickShield, setClickShield] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileKind = useRef<"image" | "video">("image");
  const listRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const lastSyncCursorRef = useRef<string>("");

  // ── Swipe-back gesture state (Instagram-style edge swipe to go back) ──
  const edgeSwipeRef = useRef<{
    startX: number;
    startY: number;
    dx: number;
    locked: "none" | "horizontal" | "vertical";
    velocityHistory: Array<{ x: number; t: number }>;
    pointerId: number;
  } | null>(null);
  const [screenDx, setScreenDx] = useState(0); // realtime swipe offset for the whole chat screen

  // 1. Instant Cache-First Hydration on mount (Frame 0 rendering).
  // The cache stores CIPHERTEXT; hydrate decrypts in memory before display.
  useEffect(() => {
    let active = true;
    (async () => {
      const cached = await getCachedMessages(id);
      if (!active) return;
      if (cached && cached.length > 0) {
        lastSyncCursorRef.current = cached[cached.length - 1].created_at;
        const allChats = await getCachedChats(user?.id);
        const chatMeta = allChats?.find((c) => c.id === id);
        const display = await hydrateForDisplay(user?.id ?? "", cached);
        if (!active) return;
        setDetail((prev) => {
          if (prev) return prev;
          return {
            conversation: {
              id,
              created_at: chatMeta?.last_at || new Date().toISOString(),
              temp_chat: !!chatMeta?.temp_chat,
            },
            other: chatMeta?.other || { id: "", username: "", display_name: "", avatar_bg: "#222" },
            messages: display,
          };
        });
      }
    })();
    return () => { active = false; };
  }, [id, user?.id]);

  // 2. Cursor-based incremental synchronization.
  // A load() whose fetch started before an in-flight send committed returns a
  // snapshot WITHOUT the new message — replacing state with it made sent
  // messages flicker out and back. Responses are therefore MERGED into the
  // current list (server rows win on conflicts; a locally-cached copy with
  // real content beats a content-"" server row), and loads are serialized.
  const loadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const load = useCallback(async () => {
    const run = loadQueueRef.current.then(async () => {
      if (!alive.current) return;
      try {
        const cursor = lastSyncCursorRef.current;
        const url = cursor ? `/api/chats/${id}?after=${encodeURIComponent(cursor)}` : `/api/chats/${id}`;
        const d = await api<ChatDetail>(url);
        if (!alive.current) return;
        setGone(null);

        // drop locally-cached messages whose own expires_at has passed — the
        // local echo of the server-authoritative expiration (the server already
        // excludes them from this response)
        const pruneExpired = (ms: ChatMessageView[]) => ms.filter((m) => !m.expires_at || new Date(m.expires_at).getTime() > Date.now());
        const mergeMessages = (prevMsgs: ChatMessageView[], next: ChatMessageView[]) => {
          const byId = new Map(prevMsgs.map((m) => [m.id, m]));
          for (const m of next) {
            const prev = byId.get(m.id);
            byId.set(m.id, prev && !m.content && prev.content ? { ...m, content: prev.content } : m);
          }
          return pruneExpired([...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)));
        };

        if (d.is_delta) {
          if (d.messages && d.messages.length > 0) {
            // cache the CIPHERTEXT first, then decrypt for display (memory only)
            const updated = pruneExpired(await appendCachedMessages(id, d.messages));
            lastSyncCursorRef.current = updated[updated.length - 1].created_at;
            const display = pruneExpired(await hydrateForDisplay(user?.id ?? "", updated));
            setDetail((prev) => {
              if (!prev) return { ...d, messages: display };
              return {
                ...prev,
                conversation: { ...prev.conversation, ...d.conversation },
                other: d.other,
                messages: mergeMessages(prev.messages, display),
              };
            });
          } else if (d.conversation.other_read_at) {
            setDetail((prev) => {
              if (!prev) return prev;
              const otherRead = d.conversation.other_read_at!;
              return {
                ...prev,
                conversation: { ...prev.conversation, ...d.conversation },
                messages: pruneExpired(prev.messages).map((m) =>
                  m.sender_id === user?.id && otherRead >= m.created_at ? { ...m, seen: true } : m
                ),
              };
            });
          } else {
            // nothing new — still reap locally expired messages (per-message
            // lifetimes mean the thread can silently shrink between polls)
            setDetail((prev) => (prev ? { ...prev, messages: pruneExpired(prev.messages) } : prev));
          }
        } else {
          const updated = pruneExpired(await appendCachedMessages(id, d.messages));
          if (updated.length > 0) {
            lastSyncCursorRef.current = updated[updated.length - 1].created_at;
          }
          const display = pruneExpired(await hydrateForDisplay(user?.id ?? "", updated));
          setDetail((prev) => ({ ...d, messages: mergeMessages(prev?.messages ?? [], display) }));
        }
      } catch (e) {
        if (!alive.current) return;
        const msg = (e as Error).message || "";
        if (msg === "expired" || msg.includes("disappeared") || msg.includes("Too late")) {
          setGone("expired");
          void purgeConversationMessagesLocal(id);
        }
      }
    });
    loadQueueRef.current = run.catch(() => {});
    return run;
  }, [id, user?.id]);

  useEffect(() => {
    alive.current = true;
    load();
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load();
    }, 5000);
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Listen for cross-tab message-expiration sweeps: expired messages are
  // removed from state, but the conversation/contact NEVER goes away.
  useEffect(() => {
    const onExpired = (e: any) => {
      if (e?.detail?.id === id) {
        setDetail((prev) => {
          if (!prev) return prev;
          const dead = new Set<string>(e.detail.messageIds ?? []);
          forgetDecrypted(user?.id ?? "", [...dead]);
          return { ...prev, messages: prev.messages.filter((m) => !dead.has(m.id)) };
        });
      }
    };
    window.addEventListener("memore:messages-expired", onExpired);
    return () => window.removeEventListener("memore:messages-expired", onExpired);
  }, [id, user?.id]);

  // Realtime delivery: the peer pushes the CIPHERTEXT envelope on the
  // conversation's broadcast channel; we reconcile it against the server
  // cache (idempotent by message id) and decrypt locally. The 5s delta poll
  // above remains the offline/reconnect safety net.
  useEffect(() => {
    if (!user?.id) return;
    const off = presenceHub().onChatMessage(id, (msg) => {
      if (!msg || msg.conversation_id !== id) return;
      void (async () => {
        // merge into the ciphertext cache (idempotent by id), then re-hydrate
        const merged = await appendCachedMessages(id, [msg as unknown as ChatMessageView]);
        if (msg.created_at > (lastSyncCursorRef.current || "")) {
          lastSyncCursorRef.current = msg.created_at;
        }
        const display = await hydrateForDisplay(user.id, merged);
        setDetail((prev) => {
          if (!prev) return prev;
          const lastNew = display[display.length - 1]?.id;
          const lastOld = prev.messages[prev.messages.length - 1]?.id;
          if (display.length === prev.messages.length && lastNew === lastOld) return prev;
          return { ...prev, messages: display };
        });
      })();
    });
    return () => {
      off();
      presenceHub().leaveChat(id);
    };
  }, [id, user?.id]);

  // Typing indicator (inbound) + broadcaster (outbound) — realtime only.
  const peerTyping = usePeerTyping(id, user?.id);
  const broadcastTyping = useTypingBroadcaster(id);

  // Peer presence for the header — instant via Realtime, zero Postgres.
  const { status: peerStatus } = usePeerPresence(detail?.other.id || undefined);

  // VIEWING_MEME: transient Realtime status while a MEMORE post is open from
  // this chat (invest/share sheets). Cleared as soon as the view closes.
  const viewingMeme = !!investMeme || !!shareMeme;
  useEffect(() => {
    presenceHub().setStatus(viewingMeme ? "viewing_meme" : "online");
    return () => presenceHub().setStatus("online");
  }, [viewingMeme]);

  // TEMP CHAT close: leaving the chat tells the server to purge its messages.
  // Server-authoritative; the conversation and contact always survive. The
  // local cache is cleaned best-effort after the request.
  const tempRef = useRef(false);
  useEffect(() => {
    tempRef.current = !!detail?.conversation.temp_chat;
  }, [detail?.conversation.temp_chat]);
  useEffect(() => {
    const leave = () => {
      if (!tempRef.current) return;
      void fetch(`/api/chats/${id}/close`, { method: "POST", keepalive: true }).then(() => {
        void purgeConversationMessagesLocal(id);
      }).catch(() => { /* offline — the server still owns the purge decision */ });
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [id]);

  // 1. Independent message scroller — only listRef scrolls, never window or document.
  const scrollToEnd = useCallback((smooth = false) => {
    const el = listRef.current;
    if (el) {
      if (smooth) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, []);

  // Animated close: play the horizontal slide-out, THEN swap routes.
  const goBack = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => router.push("/messages"), 280);
  }, [leaving, router]);

  // ── Interactive swipe-back gesture ──
  // Activates from the left ~24px edge of the chat screen. Uses direction-locking
  // so vertical scrolls and per-message swipe-to-reply gestures are never hijacked.
  // Velocity detection allows fast flicks to dismiss even below the distance threshold.
  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;

    const EDGE_ZONE = 24;       // px from left edge to start listening
    const THRESHOLD_RATIO = 0.3; // 30% of viewport width
    const THRESHOLD_MIN = 80;    // minimum px threshold
    const THRESHOLD_MAX = 120;   // maximum px threshold
    const VELOCITY_DISMISS = 800; // px/s — fast flick overrides distance
    const LOCK_DISTANCE = 10;    // px of movement before direction-lock decision

    const getThreshold = () => Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, window.innerWidth * THRESHOLD_RATIO));

    const onDown = (e: PointerEvent) => {
      // Only activate from the left edge zone, and only for primary pointer
      if (e.button !== 0) return;
      const rect = el.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      if (localX > EDGE_ZONE) return;
      // Don't interfere with interactive elements
      if ((e.target as HTMLElement).closest("button, a, input, textarea, video, [data-react], .react-tray")) return;

      edgeSwipeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        dx: 0,
        locked: "none",
        velocityHistory: [{ x: e.clientX, t: e.timeStamp }],
        pointerId: e.pointerId,
      };
    };

    const onMove = (e: PointerEvent) => {
      const g = edgeSwipeRef.current;
      if (!g || e.pointerId !== g.pointerId) return;

      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;

      // Direction-lock decision
      if (g.locked === "none") {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LOCK_DISTANCE) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          // Vertical — cancel edge swipe, let scroll handle it
          g.locked = "vertical";
          edgeSwipeRef.current = null;
          setScreenDx(0);
          return;
        }
        if (dx < 0) {
          // Swiping left — not a back gesture
          edgeSwipeRef.current = null;
          setScreenDx(0);
          return;
        }
        g.locked = "horizontal";
        // Prevent vertical scroll from competing
        e.preventDefault();
      }

      if (g.locked !== "horizontal") return;
      e.preventDefault();

      // Track movement (clamped to 0..viewport width)
      g.dx = Math.max(0, dx);

      // Velocity tracking (keep last 5 samples)
      g.velocityHistory.push({ x: e.clientX, t: e.timeStamp });
      if (g.velocityHistory.length > 5) g.velocityHistory.shift();

      // Update the screen position in realtime
      setScreenDx(g.dx);
    };

    const onUp = (e: PointerEvent) => {
      const g = edgeSwipeRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      edgeSwipeRef.current = null;

      if (g.locked !== "horizontal" || g.dx < 5) {
        setScreenDx(0);
        return;
      }

      // Compute velocity from the last few samples
      const hist = g.velocityHistory;
      let velocity = 0;
      if (hist.length >= 2) {
        const first = hist[0];
        const last = hist[hist.length - 1];
        const dt = (last.t - first.t) / 1000; // seconds
        if (dt > 0) velocity = (last.x - first.x) / dt; // px/s
      }

      const threshold = getThreshold();
      const shouldDismiss = g.dx >= threshold || velocity > VELOCITY_DISMISS;

      if (shouldDismiss) {
        // Animate from current finger position → fully off-screen.
        // DO NOT call setScreenDx(0) here — a React re-render would
        // wipe the inline transform and snap the chat back to x=0
        // before the CSS transition can play.  The component will
        // unmount when router.push fires, so no cleanup needed.
        const el2 = screenRef.current;
        if (el2) {
          el2.style.transition = "transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)";
          el2.style.transform = "translate3d(100%, 0, 0)";
        }
        window.setTimeout(() => {
          router.push("/messages");
        }, 220);
      } else {
        // Spring back from current finger position → origin.
        // Defer setScreenDx(0) until transitionend so React doesn't
        // fight the CSS transition mid-flight.
        const el2 = screenRef.current;
        if (el2) {
          el2.style.transition = "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)";
          el2.style.transform = "translate3d(0, 0, 0)";
          const cleanup = () => {
            el2.style.transition = "";
            el2.style.transform = "";
            el2.style.animation = "";
            setScreenDx(0);
            el2.removeEventListener("transitionend", cleanup);
          };
          el2.addEventListener("transitionend", cleanup);
        } else {
          setScreenDx(0);
        }
      }
    };

    const onCancel = (e: PointerEvent) => {
      const g = edgeSwipeRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      edgeSwipeRef.current = null;
      // Spring back — defer state reset to after transition
      const el2 = screenRef.current;
      if (el2) {
        el2.style.transition = "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)";
        el2.style.transform = "translate3d(0, 0, 0)";
        const cleanup = () => {
          el2.style.transition = "";
          el2.style.transform = "";
          el2.style.animation = "";
          setScreenDx(0);
          el2.removeEventListener("transitionend", cleanup);
        };
        el2.addEventListener("transitionend", cleanup);
      } else {
        setScreenDx(0);
      }
    };

    // Use capture phase on pointerdown to catch it before message gesture handlers
    el.addEventListener("pointerdown", onDown, { capture: false });
    // Move/up on window so we track even if pointer leaves the element
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [router]);

  // Dynamic font sizing with hysteresis:
  // NORMAL: 16px (compact / 1-2 lines)
  // LONG: 15px (starts using significant vertical space, ~3 lines)
  // VERY LONG: 14px (approaches max composer height, ~4 lines)
  // EXTREMELY LONG: 13px (clamped at max height with long text)
  const getNextFontSize = useCallback((currentSize: number, val: string, scrollH: number): number => {
    if (!val) return 16;
    const len = val.length;
    const lineBreaks = (val.match(/\n/g) || []).length;
    const score = len + lineBreaks * 28;

    if (currentSize === 16) {
      if (score >= 90 || scrollH >= 88) return 15;
      return 16;
    }
    if (currentSize === 15) {
      if (score <= 65 && scrollH < 75) return 16;
      if (score >= 155 || scrollH >= 115) return 14;
      return 15;
    }
    if (currentSize === 14) {
      if (score <= 125 && scrollH < 100) return 15;
      if (score >= 225 || (scrollH >= 128 && len >= 200)) return 13;
      return 14;
    }
    // currentSize === 13
    if (score <= 190) return 14;
    return 13;
  }, []);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;

    // Reset height to auto to measure actual scrollHeight
    el.style.height = "auto";
    const scrollH = el.scrollHeight;

    const nextSize = el.value ? getNextFontSize(fontSize, el.value, scrollH) : 16;
    if (nextSize !== fontSize) {
      setFontSize(nextSize);
    }

    const MIN_H = 42;
    const MAX_H = 128;
    const targetH = Math.min(Math.max(scrollH, MIN_H), MAX_H);

    el.style.height = `${targetH}px`;
    const isOverflowing = scrollH > MAX_H;
    el.style.overflowY = isOverflowing ? "auto" : "hidden";

    // Keep newest typed line visible when typing near the end
    if (isOverflowing && el.selectionEnd >= el.value.length - 2) {
      el.scrollTop = el.scrollHeight;
    }
  }, [fontSize, getNextFontSize]);

  useIsomorphicLayoutEffect(() => {
    adjustTextareaHeight();
  }, [text, adjustTextareaHeight]);

  useEffect(() => {
    window.addEventListener("resize", adjustTextareaHeight);
    return () => window.removeEventListener("resize", adjustTextareaHeight);
  }, [adjustTextareaHeight]);

  // Measure actual composer wrapper dimensions so the purple doodle border scales seamlessly
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setWrapperSize({ width: Math.round(width), height: Math.round(height) });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When composer height changes, keep messages anchored if already near bottom
  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const ro = new ResizeObserver(() => {
      if (isNearBottomRef.current && listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
    ro.observe(composer);
    return () => ro.disconnect();
  }, []);

  // Near-bottom tracking on the independent message scroller
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const threshold = 120;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom <= threshold;
  }, []);

  // Visual Viewport synchronization:
  // Dynamically tracks keyboard height and viewport offset smoothly.
  // Setting el.style.top to vv.offsetTop keeps the header anchored directly
  // at the top of the visible screen without jumping or disappearing off-screen.
  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;

    let rafId = 0;
    const syncViewport = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const vv = window.visualViewport;
        if (!vv) {
          el.style.height = "100dvh";
          el.style.top = "0px";
          return;
        }

        el.style.height = `${vv.height}px`;
        el.style.top = `${vv.offsetTop}px`;

        if (isNearBottomRef.current && listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      });
    };

    syncViewport();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);

    return () => {
      cancelAnimationFrame(rafId);
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
    };
  }, []);

  // Keep newest messages in view when message count increases (only if already near bottom)
  useEffect(() => {
    if (isNearBottomRef.current) scrollToEnd(false);
  }, [detail?.messages.length, scrollToEnd]);

  // Initial scroll to bottom when messages first load
  useEffect(() => {
    if (detail?.messages && detail.messages.length > 0 && !initialScrollDone.current) {
      scrollToEnd(false);
      initialScrollDone.current = true;
    }
  }, [detail?.messages, scrollToEnd]);

  // ----- reactions: HOLD → tray (R1 armed) → glide over slots → release applies -----
  const clearPress = useCallback(() => {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);
  useEffect(() => clearPress, [clearPress]);

  // slot order: account first (restores on any device), then this device's copy
  useEffect(() => {
    const fromAccount = (user?.active_reactions ?? []).filter((x) => REACTION_IDS.includes(x));
    if (fromAccount.length > 0) {
      setFavorites(fromAccount);
      return;
    }
    try {
      const raw = localStorage.getItem(TRAY_KEY);
      if (raw) {
        const list = JSON.parse(raw) as string[];
        if (Array.isArray(list) && list.length > 0) {
          setFavorites(list.filter((x) => REACTION_IDS.includes(x)).slice(0, 5));
          return;
        }
      }
    } catch { /* no saved slots */ }
  }, [user?.active_reactions]);

  const saveSlots = (next: string[]) => {
    setFavorites(next);
    try { localStorage.setItem(TRAY_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    api("/api/me/reactions", { method: "PATCH", json: { active_reactions: next } }).catch(() => { /* offline — local copy keeps it */ });
  };

  // measure the tray's slot centers so finger x maps onto a reaction
  useEffect(() => {
    if (!reactTo) {
      trayCentersRef.current = null;
      trayBandRef.current = null;
      return;
    }
    const t = window.setTimeout(() => {
      const tray = document.querySelector(".react-tray");
      if (!tray) return;
      const band = tray.getBoundingClientRect();
      trayBandRef.current = { top: band.top, bottom: band.bottom, left: band.left, right: band.right };
      const centers = [...tray.querySelectorAll("button[data-react]")].map((b) => {
        const r = b.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      trayCentersRef.current = centers.length === 5 ? centers : null;
    }, 60);
    return () => window.clearTimeout(t);
  }, [reactTo, pickerOpen]);

  const finishReact = (apply: boolean) => {
    const g = gestRef.current;
    if (reactElRef.current) reactElRef.current.style.touchAction = "";
    armClickGuard();
    setClickShield(true);
    window.setTimeout(() => setClickShield(false), 140);
    if (apply && g && hoverRef.current >= 0 && hoverRef.current < favorites.length) {
      const rid = favorites[hoverRef.current];
      if (rid) react(g.id, rid);
    }
    gestRef.current = null;
    hoverRef.current = -1;
    setHoverIdx(null);
    setReactTo(null);
    setPickerOpen(false);
  };

  /** One gesture handler per reactable message:
   * tap → nothing · double-tap → R1 · hold 420ms → tray + unsend (Case A: no move = open)
   * hold + glide → slot follows the finger · release → apply (Case B: slide to select)
   * vertical movement before hold → normal scroll (Case C) · horizontal → swipe-to-reply */
  const msgGestures = (m: ChatMessageView) => {
    const isMine = m.sender_id === user?.id;
    const dir: 1 | -1 = isMine ? -1 : 1; // incoming swipes right, outgoing left
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if ((e.target as HTMLElement).closest("button, a, input, video")) return;
        clearPress();
        const el = e.currentTarget;
        gestRef.current = { id: m.id, msg: m, x: e.clientX, y: e.clientY, dir, mode: "idle", dx: 0 };
        reactElRef.current = el;
        hoverRef.current = -1;
        setHoverIdx(null);

        pressTimer.current = window.setTimeout(() => {
          pressTimer.current = null;
          const g = gestRef.current;
          if (!g || g.mode !== "idle") return;
          g.mode = "react";
          // Case A & B: Open tray and UNSEND button. DO NOT auto-select reaction.
          hoverRef.current = -1;
          setHoverIdx(null);
          try { navigator.vibrate?.(15); } catch {}
          setReactTo({ msgId: m.id, rect: el.getBoundingClientRect() });
          setPickerOpen(false);
        }, 420);
      },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        const g = gestRef.current;
        if (!g || g.id !== m.id) return;
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;

        if (g.mode === "idle") {
          // If vertical scroll displacement > 8px before timer: CANCEL long-press! (Allow normal scroll)
          if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
            gestRef.current = null;
            clearPress();
            return;
          }
          // Horizontal reply swipe
          if (Math.abs(dx) > 8 && Math.sign(dx) === g.dir) {
            g.mode = "swipe";
            g.dx = 0;
            clearPress();
          } else if (Math.abs(dx) > 12) {
            gestRef.current = null;
            clearPress();
            return;
          }
          return;
        }

        if (g.mode === "swipe") {
          g.dx = Math.min(Math.abs(dx), 96);
          if (g.dx >= REPLY_THRESHOLD) {
            try { navigator.vibrate?.(11); } catch {}
            setReplyTo(g.msg);
            gestRef.current = null;
            setSwipe(null);
            return;
          }
          setSwipe({ msgId: m.id, dx: g.dx });
          return;
        }

        if (g.mode === "react") {
          // Slide-to-select proximity hit-testing
          const x = e.clientX;
          const y = e.clientY;

          // Check if hovering over unsend button
          const unsendEl = document.querySelector(".react-tray [data-unsend='true']");
          if (unsendEl) {
            const uRect = unsendEl.getBoundingClientRect();
            if (x >= uRect.left && x <= uRect.right && y >= uRect.top && y <= uRect.bottom) {
              if (hoverRef.current !== 999) {
                hoverRef.current = 999;
                setHoverIdx(null);
                try { navigator.vibrate?.(6); } catch {}
              }
              return;
            }
          }

          const centers = trayCentersRef.current;
          const band = trayBandRef.current;
          if (centers && band) {
            if (y >= band.top - 40 && y <= band.bottom + 40 && x >= band.left - 30 && x <= band.right + 30) {
              let idx = 0;
              let best = Infinity;
              centers.forEach((cx, i) => {
                const d = Math.abs(x - cx);
                if (d < best) { best = d; idx = i; }
              });
              if (idx !== hoverRef.current) {
                hoverRef.current = idx;
                setHoverIdx(idx);
                try { navigator.vibrate?.(6); } catch {}
              }
              return;
            }
          }

          if (hoverRef.current !== -1) {
            hoverRef.current = -1;
            setHoverIdx(null);
          }
        }
      },
      onPointerUp: () => {
        const g = gestRef.current;
        clearPress();
        if (g?.mode === "react") {
          if (hoverRef.current === 999) {
            // Releasing over UNSEND button
            unsend(g.id);
            setReactTo(null);
            setHoverIdx(null);
          } else if (hoverRef.current >= 0 && hoverRef.current < favorites.length) {
            // Releasing after sliding over a reaction
            finishReact(true);
          } else {
            // CASE A: Held without moving!
            // Tray and UNSEND button remain open for direct tapping!
          }
          gestRef.current = null;
          return;
        }

        if (g && g.mode === "idle") {
          const now = Date.now();
          if (lastTapRef.current && lastTapRef.current.id === m.id && now - lastTapRef.current.t < 320) {
            lastTapRef.current = null;
            gestRef.current = null;
            try { navigator.vibrate?.(10); } catch {}
            const rid = favorites[0] ?? "aura";
            setDoubleTapBurst({ msgId: m.id, x: g.x, y: g.y });
            setTimeout(() => setDoubleTapBurst(null), 600);
            react(m.id, rid);
            return;
          }
          lastTapRef.current = { id: m.id, t: now };
        }

        if (g && g.mode === "swipe" && g.dx >= REPLY_THRESHOLD) {
          setReplyTo(g.msg);
        }
        gestRef.current = null;
        setSwipe(null);
      },
      onPointerCancel: () => {
        clearPress();
        gestRef.current = null;
        setSwipe(null);
      },
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    };
  };

  const react = async (msgId: string, reactionId: string) => {
    playSfx("reaction");
    setReactTo(null);
    setPickerOpen(false);
    // Optimistic local reaction update
    setDetail((prev) => {
      if (!prev) return prev;
      const targetMsg = prev.messages.find((m) => m.id === msgId);
      if (!targetMsg) return prev;
      const currentReactions = targetMsg.reactions || [];
      const existing = currentReactions.find((r) => r.reaction_id === reactionId);
      let nextReactions;
      if (existing?.mine) {
        // Toggle off
        nextReactions = currentReactions
          .map((r) => (r.reaction_id === reactionId ? { ...r, count: r.count - 1, mine: false } : r))
          .filter((r) => r.count > 0);
      } else {
        // Remove previous user reaction if any
        const cleaned = currentReactions
          .map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false } : r))
          .filter((r) => r.count > 0);
        const idx = cleaned.findIndex((r) => r.reaction_id === reactionId);
        if (idx >= 0) {
          cleaned[idx] = { ...cleaned[idx], count: cleaned[idx].count + 1, mine: true };
          nextReactions = cleaned;
        } else {
          nextReactions = [...cleaned, { reaction_id: reactionId, count: 1, mine: true }];
        }
      }
      return {
        ...prev,
        messages: prev.messages.map((m) => (m.id === msgId ? { ...m, reactions: nextReactions } : m)),
      };
    });

    try {
      const res = await api<{ reactions: any[] }>(`/api/chats/${id}/messages/${msgId}/react`, {
        json: { reaction_id: reactionId },
      });
      if (res?.reactions) {
        setDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === msgId ? { ...m, reactions: res.reactions } : m)),
          };
        });
        void updateCachedMessageReactions(id, msgId, res.reactions);
      }
    } catch (e) {
      toast((e as Error).message, "err");
      await load();
    }
  };

  const swipeStyle = (m: ChatMessageView): React.CSSProperties => {
    const dir = m.sender_id === user?.id ? -1 : 1;
    const swiping = swipe?.msgId === m.id;
    return {
      transform: `translateX(${swiping ? (swipe?.dx ?? 0) * dir : 0}px)`,
      transition: swiping ? "none" : "transform 0.18s ease-out",
    };
  };

  const send = async (payload: { type: "text" | "image" | "video" | "post" | "sticker"; content?: string; media_url?: string; post_id?: string; sticker_id?: string; reply_to_message_id?: string; media?: { key: string; iv: string; mime: string } }) => {
    if (busy) return;
    setBusy(true);
    broadcastTyping(false); // sending ends the typing burst
    const optId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const currentReply = replyTo;
    const anim = payload.type === "sticker" ? "sticker" : "zuup";

    // ── Encrypt ONCE, here, before anything optimistic. No plaintext ever
    // leaves the device: if encryption fails we show a clean error and send
    // NOTHING (no plaintext fallback, no half-sent optimistic bubble).
    let wire: { ciphertext: string; to_device: string | null; encryption_version: string } | null = null;
    const peerId = detail?.other.id;
    const hasSecret = !!payload.content || !!payload.media;
    if (payload.type !== "sticker" && hasSecret) {
      if (!peerId) {
        toast("Chat isn't ready yet. Try again.", "err");
        setBusy(false);
        return;
      }
      try {
        wire = await encryptMessagePayload(user?.id ?? "", peerId, {
          v: 1,
          ...(payload.content ? { text: payload.content } : {}),
          ...(payload.media ? { media: payload.media } : {}),
        });
      } catch {
        toast("Couldn't secure this message. Try again.", "err");
        setBusy(false);
        return;
      }
    }

    // Optimistic outgoing message
    const optimisticMsg: ChatMessageView = {
      id: optId,
      conversation_id: id,
      sender_id: user?.id || "me",
      type: payload.type,
      content: payload.content || "",
      ciphertext: wire?.ciphertext ?? "",
      encryption_version: wire?.encryption_version ?? "",
      post_id: payload.post_id ?? null,
      media_url: payload.media_url ?? null,
      post: null,
      sticker_id: payload.sticker_id ?? null,
      reply_to_message_id: payload.reply_to_message_id ?? currentReply?.id ?? null,
      created_at: new Date().toISOString(),
      seen: false,
      reactions: [],
      reply_to: currentReply ? { id: currentReply.id, sender_id: currentReply.sender_id, type: currentReply.type, content: currentReply.content, sticker_id: currentReply.sticker_id ?? null, post: currentReply.post ?? null } : null,
    };

    // 1. Mark animation for signature ZUUP
    setAnimatingMsgIds((prev) => ({ ...prev, [optId]: anim }));
    // 2. Play send SFX immediately (0ms non-blocking)
    playSfx("send");
    // 3. Clear reply state
    setReplyTo(null);
    // 4. Append optimistic message immediately
    setDetail((prev) => (prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : prev));
    // 5. Scroll to bottom
    isNearBottomRef.current = true;
    requestAnimationFrame(() => {
      scrollToEnd(false);
    });

    try {
      const res = await api<{ message: ChatMessageView }>(`/api/chats/${id}/messages`, {
        json: {
          type: payload.type,
          ciphertext: wire?.ciphertext ?? "",
          to_device: wire?.to_device ?? undefined,
          content: payload.content,
          post_id: payload.post_id,
          media_url: payload.media_url,
          sticker_id: payload.sticker_id,
          reply_to_message_id: payload.reply_to_message_id ?? currentReply?.id,
        },
      });
      if (res?.message) {
        // our own media keys don't need decrypting — register them directly
        rememberMediaKey(res.message.id, payload.media);
        const sent: ChatMessageView = {
          ...res.message,
          // the wire response carries no plaintext — restore OUR local view
          content: payload.content ?? "",
          media_key: payload.media?.key ?? null,
          media_iv: payload.media?.iv ?? null,
          media_mime: payload.media?.mime ?? null,
          reply_to: optimisticMsg.reply_to,
        };
        setDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === optId ? sent : m)),
          };
        });
        // persist the SENDER'S copy (content intact) in the device-private
        // cache — it can never be re-derived from the peer envelope
        await appendCachedMessages(id, [sent]);
        lastSyncCursorRef.current = res.message.created_at;
      }
      await load();
    } catch (e) {
      setDetail((prev) => (prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== optId) } : prev));
      toast((e as Error).message, "err");
      if ((e as Error).message.includes("disappeared")) {
        setGone("expired");
        void purgeConversationMessagesLocal(id);
      }
    } finally {
      setBusy(false);
      setTimeout(() => {
        setAnimatingMsgIds((prev) => {
          const next = { ...prev };
          delete next[optId];
          return next;
        });
      }, 350);
    }
  };

  const sendSticker = async (stickerId: string) => {
    recordStickerRecent(stickerId);
    await send({ type: "sticker", sticker_id: stickerId });
  };

  const unsend = async (msgId: string) => {
    playSfx("unsend");
    setReactTo(null);
    setPickerOpen(false);

    // 1. Play unsend shrink-and-poof animation
    setAnimatingMsgIds((prev) => ({ ...prev, [msgId]: "unsend" }));

    // 2. Wait 180ms for CSS animation to finish
    await new Promise((r) => setTimeout(r, 180));

    // 3. Remove from local state and cache
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: prev.messages.filter((m) => m.id !== msgId),
      };
    });
    void removeCachedMessage(id, msgId);
    forgetDecrypted(user?.id ?? "", [msgId]); // drop the session plaintext too

    try {
      await api(`/api/chats/${id}/messages/${msgId}`, { method: "DELETE" });
      toast("Unsent. Gone for good.", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
      await load();
    } finally {
      setAnimatingMsgIds((prev) => {
        const next = { ...prev };
        delete next[msgId];
        return next;
      });
    }
  };


  // tap a reply quote → jump to the message it answers inside the independent message scroller
  const [flashId, setFlashId] = useState<string | null>(null);
  const jumpToMessage = (msgId: string) => {
    const el = document.getElementById(`chat-msg-${msgId}`);
    const list = listRef.current;
    if (!el || !list) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offset = elRect.top - listRect.top + list.scrollTop - (listRect.height / 2) + (elRect.height / 2);
    list.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
    setFlashId(msgId);
    try { navigator.vibrate?.(8); } catch { /* no haptics */ }
    window.setTimeout(() => setFlashId((f) => (f === msgId ? null : f)), 1600);
  };

  const sendingLockRef = useRef(false);
  const sendText = useCallback(async () => {
    if (sendingLockRef.current) return;
    if (!text.trim() || busy) return;

    sendingLockRef.current = true;
    setTimeout(() => { sendingLockRef.current = false; }, 300);

    const t = text;
    setText("");
    setFontSize(16);

    // CRITICAL: reset dimensions immediately and keep textarea focused so iOS never dismisses the keyboard
    if (textareaRef.current) {
      textareaRef.current.style.height = "42px";
      textareaRef.current.style.overflowY = "hidden";
      textareaRef.current.focus({ preventScroll: true });
    }

    try {
      await send({ type: "text", content: t });
    } finally {
      if (textareaRef.current && document.activeElement !== textareaRef.current) {
        textareaRef.current.focus({ preventScroll: true });
      }
    }
  }, [text, busy, send]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      // 1. Encrypt the bytes LOCALLY before any upload — the server and the
      // storage bucket only ever see AES-GCM ciphertext.
      const kind: "image" | "video" = fileKind.current === "video" || file.type.startsWith("video/") ? "video" : "image";
      const enc = await encryptMedia(await file.arrayBuffer());
      const mime = file.type || (kind === "video" ? "video/mp4" : "image/jpeg");
      // 2. Upload the ciphertext (enc=1: no compression, no mime inference).
      const form = new FormData();
      form.append("file", new Blob([enc.blob], { type: "application/octet-stream" }), "media.bin");
      form.append("kind", kind);
      const up = await api<{ url: string; media_type: "image" | "video" }>("/api/upload?enc=1", { body: form });
      // 3. The media key rides INSIDE the Signal-encrypted envelope.
      await send({ type: up.media_type, media_url: up.url, content: text, media: { key: enc.key, iv: enc.iv, mime } });
      setText("");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  if (gone) {
    return (
      <div className="font-display fixed inset-0 z-[70] bg-[#0b0b0b] flex flex-col items-center justify-center gap-4 text-center px-8" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <svg viewBox="0 0 24 24" width={56} height={56} aria-hidden>
          <circle cx="12" cy="13" r="8.5" fill="none" stroke="#C8FF3D" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 9v4.2l2.6 1.6M8 3.2 C10 2, 14 2, 16 3.2" fill="none" stroke="#C8FF3D" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4 4 L7 7 M20 4 L17 7" stroke="#7C4DFF" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <div className="hd text-[24px] text-white">CHAT EXPIRED</div>
        <p className="text-[13px] text-[#C8FF3D]">24 hours. Then gone.</p>
        <NeoButton variant="primary" onClick={() => router.push("/messages")}>Back to Messages</NeoButton>
      </div>
    );
  }

  type Run = { mine: boolean; msgs: ChatMessageView[] };
  const blocks: Array<{ kind: "day"; label: string } | { kind: "run"; run: Run }> = [];
  {
    let cur: Run | null = null;
    let lastDay = "";
    for (const m of detail?.messages ?? []) {
      const day = new Date(m.created_at).toDateString();
      const mine = m.sender_id === user?.id;
      if (!cur || cur.mine !== mine || day !== lastDay) {
        if (cur) blocks.push({ kind: "run", run: cur });
        if (day !== lastDay) {
          blocks.push({ kind: "day", label: dayLabel(m.created_at) });
          lastDay = day;
        }
        cur = { mine, msgs: [] };
      }
      cur.msgs.push(m);
    }
    if (cur) blocks.push({ kind: "run", run: cur });
  }

  const reactMine = reactTo ? detail?.messages.find((x) => x.id === reactTo.msgId)?.sender_id === user?.id : false;

  return (
    <>
      <div
        ref={screenRef}
        className={`chat-screen font-display fixed inset-x-0 z-[65] bg-[#0b0b0b] text-white flex flex-col overflow-hidden max-w-2xl mx-auto ${leaving ? "chat-leave" : "chat-enter"}`}
        style={{
          top: "0px",
          height: "100dvh",
          willChange: screenDx > 0 ? "transform" : undefined,
          ...(screenDx > 0 ? { transform: `translate3d(${screenDx}px, 0, 0)`, transition: "none", animation: "none" } : {}),
        }}
      >
        {clickShield && <div className="absolute inset-0 z-[80]" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} />}

      {/* header — PERMANENTLY STICKED at top of chat flex column */}
      <div ref={headerRef} className="shrink-0 z-40 bg-[#0b0b0b]">
        <header className="relative z-10 flex shrink-0 items-center gap-2.5 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <button onClick={goBack} aria-label="Back to Messages" className="shrink-0 text-white transition-transform active:scale-90">
          <Icon name="arrow-left" size={21} strokeWidth={2.4} />
        </button>
        <Avatar name={detail?.other.display_name ?? "?"} bg={detail?.other.avatar_bg ?? "#7C4DFF"} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-[16.5px] leading-tight text-white">@{detail?.other.username ?? "…"}</div>
          {/* Realtime presence: TYPING beats everything, then live status,
              then the throttled server-stamped last seen. No noise. */}
          <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] leading-none text-white/50">
            {peerTyping ? (
              <span className="font-bold text-[#C8FF3D]">typing…</span>
            ) : peerStatus !== "offline" ? (
              <>
                <span className={`h-1.5 w-1.5 rounded-full ${peerStatus === "away" ? "bg-white/35" : "bg-[#C8FF3D]"}`} />
                <span className={peerStatus === "away" ? "" : "text-[#C8FF3D]"}>{presenceLabel(peerStatus)}</span>
              </>
            ) : detail?.other.last_seen_at ? (
              <span>last seen {timeAgo(detail.other.last_seen_at)}</span>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-white/25" /> offline
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <HeaderClock tempChat={!!detail?.conversation.temp_chat} />
          <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="mt-0.5 h-[4px] w-[104px]" aria-hidden>
            <path d="M2 4 C 22 1.5, 48 5.2, 68 2.8 C 80 1.6, 90 3.4, 98 2.4" fill="none" stroke="rgba(200,255,61,0.75)" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="mt-0.5 whitespace-nowrap text-[9.5px] leading-none text-white/40">
            {detail?.conversation.temp_chat ? "purges when you leave" : "messages vanish after 24h"}
          </span>
        </div>
        <button onClick={() => setMenu(true)} aria-label="Chat menu" className="shrink-0 py-1 pl-1 text-white/85 transition-transform active:scale-90">
          <span className="mb-1 block h-1 w-1 rounded-full bg-current" />
          <span className="mb-1 block h-1 w-1 rounded-full bg-current" />
          <span className="block h-1 w-1 rounded-full bg-current" />
        </button>
        </header>

        <HeaderRule />
      </div>

      {/* messages — INDEPENDENT scrollable message scroller */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="relative z-10 flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 pb-3 flex flex-col"
        style={{
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
        }}
      >
        {/* mt-auto hugs the composer when the thread is short, scrolls normally when it grows */}
        <div className="mt-auto flex flex-col space-y-3">
          {blocks.map((b, bi) =>
            b.kind === "day" ? (
              <div key={`d${bi}`} className="flex items-center gap-3 py-1" aria-hidden>
                <span className="h-px flex-1 bg-white/15" />
                <span className="text-[13px] text-white/55">{b.label}</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>
            ) : (
              <div key={`r${b.run.msgs[0]?.id}`} className={`flex w-full ${b.run.mine ? "justify-end" : "justify-start gap-2"}`}>
                {!b.run.mine && (
                  <span className="mt-0.5 shrink-0 self-start">
                    <Avatar name={detail?.other.display_name ?? "?"} bg={detail?.other.avatar_bg ?? "#7C4DFF"} size={26} />
                  </span>
                )}
                <div className={`flex min-w-0 flex-col gap-[7px] ${b.run.mine ? "items-end max-w-[85%]" : "items-start flex-1"}`}>
                  {b.run.msgs.map((m, mi) => {
                    const tail = mi === 0;
                    // ~1 in 3 non-run-start bubbles gets the comic dialog corner
                    const beak = !tail && hashId(m.id) % 3 === 0;
                    const gestures = msgGestures(m);
                    const selected = reactTo?.msgId === m.id ? "msg-selected" : "";
                    const animKind = animatingMsgIds[m.id];
                    // shared posts live in their own card — never inside a bubble
                    if (m.type === "post" && m.post) {
                      const postAnim = animKind === "zuup" ? "msg-anim-zuup" : animKind === "receive" ? "msg-anim-receive" : animKind === "unsend" ? "msg-anim-unsend" : "";
                      return (
                        <div key={m.id} id={`chat-msg-${m.id}`} className={`flex flex-col ${b.run.mine ? "items-end" : "items-start"} ${flashId === m.id ? "msg-flash" : ""} ${postAnim}`}>
                          <div
                            className={`msg-press relative ${selected}`}
                            {...gestures}
                            style={swipeStyle(m)}
                          >
                            {m.reply_to && <QuoteInline refr={m.reply_to} mine={b.run.mine} username={detail?.other.username ?? ""} onJump={() => jumpToMessage(m.reply_to!.id)} />}
                            <SharedBubble meme={m.post} onInvest={() => setInvestMeme(m.post!)} onShare={() => setShareMeme(m.post)} />
                            {animKind === "zuup" && b.run.mine && (
                              <span className="speed-stroke absolute -bottom-1 -right-3 text-[#C8FF3D] font-mono text-[11px] select-none pointer-events-none" aria-hidden>//</span>
                            )}
                            {doubleTapBurst?.msgId === m.id && (
                              <span className="aura-burst-mini absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                                <Spark size={28} color="#C8FF3D" />
                              </span>
                            )}
                            {swipe?.msgId === m.id && (
                              <span className={`absolute top-1/2 -translate-y-1/2 ${m.sender_id === user?.id ? "-left-9" : "-right-9"}`} style={{ opacity: Math.min(1, swipe.dx / REPLY_THRESHOLD) }} aria-hidden>
                                <ReplyArrow mine={b.run.mine} />
                              </span>
                            )}
                          </div>
                          <ReactionStamps reactions={m.reactions ?? []} mine={b.run.mine} variant="card" onToggle={(rid) => react(m.id, rid)} />
                          <div className="mt-2 flex items-center gap-1 text-[10px] text-white/40">
                            {timeShort(m.created_at)}
                            {b.run.mine && <span title={m.seen ? "Seen" : "Sent"}>{m.seen ? "✓✓" : "✓"}</span>}
                          </div>
                        </div>
                      );
                    }
                    // stickers are standalone visual messages — no bubble
                    if (m.type === "sticker" && m.sticker_id) {
                      const stickerAnim = animKind === "sticker" || animKind === "zuup" ? "sticker-anim-pop" : animKind === "receive" ? "msg-anim-receive" : animKind === "unsend" ? "msg-anim-unsend" : "";
                      return (
                        <div key={m.id} id={`chat-msg-${m.id}`} className={`flex flex-col ${b.run.mine ? "items-end" : "items-start"} ${flashId === m.id ? "msg-flash" : ""} ${stickerAnim}`}>
                          <div
                            className={`msg-press relative ${selected}`}
                            {...gestures}
                            style={swipeStyle(m)}
                          >
                            {m.reply_to && <QuoteInline refr={m.reply_to} mine={b.run.mine} username={detail?.other.username ?? ""} onJump={() => jumpToMessage(m.reply_to!.id)} />}
                            <StickerArt id={m.sticker_id} size={136} />
                            {doubleTapBurst?.msgId === m.id && (
                              <span className="aura-burst-mini absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                                <Spark size={28} color="#C8FF3D" />
                              </span>
                            )}
                            {swipe?.msgId === m.id && (
                              <span className={`absolute top-1/2 -translate-y-1/2 ${m.sender_id === user?.id ? "-left-9" : "-right-9"}`} style={{ opacity: Math.min(1, swipe.dx / REPLY_THRESHOLD) }} aria-hidden>
                                <ReplyArrow mine={b.run.mine} />
                              </span>
                            )}
                          </div>
                          <ReactionStamps reactions={m.reactions ?? []} mine={b.run.mine} onToggle={(rid) => react(m.id, rid)} />
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-white/40">
                            {timeShort(m.created_at)}
                            {b.run.mine && <span title={m.seen ? "Seen" : "Sent"}>{m.seen ? "✓✓" : "✓"}</span>}
                          </div>
                        </div>
                      );
                    }
                    const bubbleAnim = animKind === "zuup" ? "msg-anim-zuup" : animKind === "receive" ? "msg-anim-receive" : animKind === "unsend" ? "msg-anim-unsend" : "";
                    return (
                      <div key={m.id} id={`chat-msg-${m.id}`} className={`flex max-w-[92%] flex-col ${b.run.mine ? "self-end items-end" : "self-start items-start"} ${flashId === m.id ? "msg-flash" : ""} ${bubbleAnim}`}>
                        <div
                          className={`msg-press relative min-w-[92px] max-w-full ${b.run.mine ? "mr-[10px]" : "ml-[10px]"} ${selected}`}
                          {...gestures}
                          style={swipeStyle(m)}
                        >
                          <BubbleFrame mine={b.run.mine} tail={tail} beak={beak} seed={hashId(m.id)} />
                          <BubbleAccents mine={b.run.mine} seed={hashId(m.id)} tail={tail || beak} />
                          {animKind === "zuup" && b.run.mine && (
                            <span className="speed-stroke absolute -bottom-1 -right-3 text-[#C8FF3D] font-mono text-[11px] select-none pointer-events-none" aria-hidden>//</span>
                          )}
                          {doubleTapBurst?.msgId === m.id && (
                            <span className="aura-burst-mini absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                              <Spark size={28} color="#C8FF3D" />
                            </span>
                          )}
                          <div className="relative max-w-full min-w-0 px-4 py-2.5">
                            {m.reply_to && (
                              <button
                                onClick={(e) => { e.stopPropagation(); jumpToMessage(m.reply_to!.id); }}
                                aria-label="Jump to original message"
                                className={`mb-1 block w-full border-l-2 pl-1.5 text-left ${b.run.mine ? "border-[#0a0a0a]/45" : "border-[#7C4DFF]"}`}
                              >
                                <div className="flex items-center gap-1">
                                  {m.reply_to.post && (
                                    m.reply_to.post.media_type === "text"
                                      ? <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] bg-[#141414] font-display text-[7px] font-extrabold text-[#C8FF3D]">Aa</span>
                                      : (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={m.reply_to.post.thumbnail_url} alt="" className="h-3.5 w-3.5 rounded-[3px] object-cover" loading="lazy" />
                                      )
                                  )}
                                  <span className={`truncate text-[10px] font-bold ${b.run.mine ? "text-[#0a0a0a]/60" : "text-[#C8FF3D]"}`}>
                                    ↳ {b.run.mine ? "you" : `@${detail?.other.username ?? ""}`} · {quoteText(m.reply_to)}
                                  </span>
                                </div>
                              </button>
                            )}
                            {m.type === "image" && m.media_url && <EncryptedImage msg={m} />}
                            {m.type === "video" && m.media_url && <EncryptedVideo msg={m} />}
                            {m.content && (
                              <p
                                className={`whitespace-pre-wrap text-[16px] leading-snug ${b.run.mine ? "text-[#0a0a0a]" : "text-white/95"}`}
                                style={{
                                  overflowWrap: "anywhere",
                                  wordBreak: "break-word",
                                  maxWidth: "100%",
                                }}
                              >
                                {m.content}
                              </p>
                            )}
                            <div className={`mt-0.5 flex items-center justify-end gap-1 whitespace-nowrap text-[10px] leading-none ${b.run.mine ? "text-[#0a0a0a]/60" : "text-white/45"}`}>
                              {timeShort(m.created_at)}
                              {b.run.mine && <span className="font-bold" title={m.seen ? "Seen" : "Sent"}>{m.seen ? "✓✓" : "✓"}</span>}
                            </div>
                          </div>
                          {swipe?.msgId === m.id && (
                            <span className={`absolute top-1/2 -translate-y-1/2 ${m.sender_id === user?.id ? "-left-9" : "-right-9"}`} style={{ opacity: Math.min(1, swipe.dx / REPLY_THRESHOLD) }} aria-hidden>
                              <ReplyArrow mine={b.run.mine} />
                            </span>
                          )}
                        </div>
                        <ReactionStamps reactions={m.reactions ?? []} mine={b.run.mine} onToggle={(rid) => react(m.id, rid)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
          {detail && detail.messages.length === 0 && (
            <div className="flex flex-col items-center gap-2.5 py-10 text-center">
              <svg viewBox="0 0 24 24" width={40} height={40} aria-hidden>
                <circle cx="12" cy="13" r="8.4" fill="none" stroke="rgba(124,77,255,0.9)" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M12 9.4v4l2.5 1.5" fill="none" stroke="#C8FF3D" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 4 L7.5 7.5 M20 4 L16.5 7.5" stroke="#C8FF3D" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M3.5 20.5 C 8 18.5, 16 18.5, 20.5 20.5" fill="none" stroke="rgba(124,77,255,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2.5" />
              </svg>
              <div className="hd text-[16px] text-white">{detail.conversation.temp_chat ? "TEMP CHAT CLEANED ITSELF" : "THE MEMES HAVE DISAPPEARED"}</div>
              <p className="max-w-[240px] text-[12px] leading-snug text-white/45">
                {detail.conversation.temp_chat
                  ? "You left, so the receipts burned. Say something new."
                  : "Every message lives 24 hours after it's sent. No bags. No messages. Just vibes."}
              </p>
              <span className="text-[11px] font-bold tracking-widest text-[#C8FF3D]">START A CHAT ↓</span>
            </div>
          )}
        </div>
      </div>

      {/* composer — shrink-0 at bottom of chat flex column */}
      <div
        ref={composerRef}
        className="relative z-30 shrink-0 bg-[#0b0b0b] px-3.5 pt-2"
        style={{
          paddingBottom: kbFocused
            ? "8px"
            : "max(12px, calc(env(safe-area-inset-bottom, 0px) - 6px))",
        }}
      >
        {attach && (
          <div className="absolute bottom-[calc(100%+6px)] left-3 right-3 z-30 space-y-0.5 rounded-[16px] border border-[#2a2a2a] bg-[#131313] p-1.5">
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[15px] hover:bg-white/5" onClick={() => { setSharePost(true); setAttach(false); }}>
              <Spark size={13} color="#C8FF3D" /> Share MEMORE post
            </button>
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[15px] hover:bg-white/5" onClick={() => { fileKind.current = "image"; fileRef.current?.click(); setAttach(false); }}>
              <Icon name="camera" size={14} /> Photo
            </button>
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[15px] hover:bg-white/5" onClick={() => { fileKind.current = "video"; fileRef.current?.click(); setAttach(false); }}>
              <Icon name="video" size={14} /> Video
            </button>
          </div>
        )}
        {replyTo && (
          <div className="reply-bar-enter mb-1.5 flex items-center gap-2 rounded-[14px] border border-[#7C4DFF]/70 bg-[#141020] px-3 py-1.5">
            <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden className="shrink-0">
              <path d="M9 5 L4 10 L9 15 M4 10 L13.5 10 C 17.8 10, 20 12.8, 20 17 L 20 19" fill="none" stroke="#C8FF3D" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] font-bold leading-tight text-[#C8FF3D]">
                replying to {replyTo.sender_id === user?.id ? "yourself" : `@${detail?.other.username ?? ""}`}
              </div>
              <div className="truncate text-[11.5px] leading-tight text-white/65">{quoteText(replyTo)}</div>
            </div>
            <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="shrink-0 text-white/60 transition-transform active:scale-90">
              <Icon name="x" size={14} strokeWidth={2.4} />
            </button>
          </div>
        )}
        <div
          className="flex items-end gap-2"
          onPointerDown={(e) => {
            // Prevent tapping empty composer gaps/background from blurring textarea and turning off keyboard
            if ((e.target as HTMLElement).tagName !== "TEXTAREA" && (e.target as HTMLElement).tagName !== "INPUT") {
              e.preventDefault();
            }
          }}
        >
          <button onClick={() => setAttach((a) => !a)} aria-label="Attach" className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center text-white/90 transition-transform active:scale-90">
            <WobblyCircle fill="#101010" stroke="#7C4DFF" />
            <span className="relative"><Icon name="plus" size={19} strokeWidth={2.6} /></span>
          </button>
          <div
            ref={wrapperRef}
            className="relative flex min-h-[42px] min-w-0 flex-1 rounded-[20px] bg-[#101010]"
            style={{ boxSizing: "border-box" }}
          >
            <ComposerDoodleBorder width={wrapperSize.width} height={wrapperSize.height} />
            <textarea
              ref={textareaRef}
              rows={1}
              className="relative z-10 w-full min-w-0 resize-none bg-transparent px-3.5 py-[9px] text-white outline-none placeholder:text-white/35 leading-[1.35] no-scrollbar"
              style={{
                boxSizing: "border-box",
                height: "42px",
                minHeight: "42px",
                maxHeight: "128px",
                fontSize: `${fontSize}px`,
                transition: "font-size 0.12s ease-out",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
              placeholder="say something..."
              value={text}
              maxLength={10000}
              onChange={(e) => {
                setText(e.target.value);
                broadcastTyping(e.target.value.length > 0); // debounced realtime broadcast — never per keystroke
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendText();
                }
              }}
              onFocus={(e) => {
                setKbFocused(true);
                e.target.scrollIntoView = () => {};
              }}
              onBlur={() => setKbFocused(false)}
              aria-label="Message"
              enterKeyHint="send"
            />
          </div>
          <button
            onClick={() => { (document.activeElement as HTMLElement | null)?.blur?.(); setStickersOpen(true); }}
            aria-label="Stickers"
            className="relative mb-[2px] flex h-[38px] w-[38px] shrink-0 items-center justify-center text-white/90 transition-transform active:scale-90"
          >
            <WobblyCircle fill="#101010" stroke="#7C4DFF" />
            <span className="relative">
              <svg viewBox="0 0 24 24" width={17} height={17} aria-hidden>
                <path d="M5.6 4.4 C 5.7 3.5, 6.4 3, 7.3 3 L 14.9 3.2 L 20.6 8.9 L 20.8 18 C 20.8 19.3, 19.9 20.3, 18.6 20.4 L 7.4 20.7 C 6.1 20.8, 5.4 19.9, 5.3 18.7 L 5.1 5.6 Z" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" />
                <path d="M14.7 3.4 L 14.9 6.7 C 15 7.9, 15.9 8.7, 17.1 8.7 L 20.3 8.7" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" />
              </svg>
              <span className="absolute left-1/2 top-[47%] -translate-x-1/2 -translate-y-1/2"><Spark size={7} color="#C8FF3D" /></span>
            </span>
          </button>
          <button
            type="button"
            aria-label="Send message"
            className="relative flex h-[48px] w-[48px] shrink-0 items-center justify-center text-[#0a0a0a] transition-transform active:scale-95 before:absolute before:-inset-2 before:content-['']"
            onPointerDown={(e) => {
              // CRITICAL: preventDefault prevents iOS from blurring the textarea!
              // Keyboard stays open and message sends immediately on first tap.
              e.preventDefault();
              sendText();
            }}
            onClick={(e) => {
              e.preventDefault();
              sendText();
            }}
          >
            <WobblyCircle fill="#C8FF3D" stroke="rgba(10,10,10,0.7)" />
            <span className="relative"><Icon name="arrow-right" size={23} strokeWidth={2.8} /></span>
          </button>
        </div>
      </div>

      {reactTo && (
        <>
          <div
            className="fixed inset-0 z-[85] bg-black/30 backdrop-blur-[1px]"
            onPointerDown={() => { setReactTo(null); setPickerOpen(false); }}
          />
          <ReactionTray
            rect={reactTo.rect}
            favorites={favorites}
            pickerOpen={pickerOpen}
            hoverIdx={hoverIdx}
            isMine={reactMine}
            onUnsend={() => unsend(reactTo.msgId)}
            onPick={(rid) => react(reactTo.msgId, rid)}
            onMore={() => setPickerOpen(true)}
            onSlotsChange={saveSlots}
            onClose={() => { setReactTo(null); setPickerOpen(false); }}
          />
        </>
      )}

      <StickerSheet open={stickersOpen} onClose={() => setStickersOpen(false)} onPick={sendSticker} />

      {shareMeme && <ShareSheet meme={shareMeme} open onClose={() => setShareMeme(null)} onSent={() => { load(); toast("RECEIPT SENT ✦", "ok"); }} />}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/mp4,video/webm"
        className="hidden"
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }}
      />

      {sharePost && (
        <PostPickerSheet
          open
          onClose={() => setSharePost(false)}
          onPicked={async (postId) => {
            setSharePost(false);
            await send({ type: "post", post_id: postId, content: text });
            setText("");
          }}
        />
      )}
      {investMeme && <InvestSheet meme={investMeme} open onClose={() => setInvestMeme(null)} onDone={() => { load(); toast("Invested from the chat. Degenerate.", "ok"); }} />}

      <ChatMenuSheet
        id={id}
        open={menu}
        onClose={() => setMenu(false)}
        username={detail?.other.username ?? ""}
        tempChat={!!detail?.conversation.temp_chat}
        onTempChange={(enabled) => setDetail((prev) => (prev ? { ...prev, conversation: { ...prev.conversation, temp_chat: enabled } } : prev))}
      />
      <style jsx global>{`
        /* the chat's sheets all wear the dark MEMORE skin (they render through a
           portal to document.body, so scoping them under .chat-screen never works) */
        .chat-screen ::selection { background: rgba(124, 77, 255, 0.45); color: #fff; }
        .chat-screen input, .chat-screen textarea { caret-color: #fff; -webkit-tap-highlight-color: transparent; }
        .chat-screen input:focus-visible, .chat-screen textarea:focus-visible { outline: none; box-shadow: none; }
        .chat-screen .msg-press { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: pan-y; }
        .chat-screen .msg-selected { filter: brightness(1.2) drop-shadow(0 0 9px rgba(200, 255, 61, 0.4)); outline: 2px solid rgba(200, 255, 61, 0.7); outline-offset: 2px; border-radius: 12px; }
        .chat-screen .msg-flash { animation: chatMsgFlash 1.5s ease; }
        @keyframes chatMsgFlash { 0%, 55% { filter: brightness(1.22) drop-shadow(0 0 10px rgba(200, 255, 61, 0.5)); } 100% { filter: none; } }
      `}</style>
    </div>
    </>
  );
}

/** Pick one of your posts (or a trending one) to share into the chat. */
function PostPickerSheet({ open, onClose, onPicked }: { open: boolean; onClose: () => void; onPicked: (postId: string) => void }) {
  const { user } = useSession();
  const mine = useApi<{ posts: MemeView[] }>(open && user ? `/api/users/${user.username}` : null);
  const market = useApi<{ trending: MemeView[] }>(open ? "/api/market" : null);
  const own = (mine.data?.posts ?? []).slice(0, 8);
  const trending = (market.data?.trending ?? []).filter((t) => !own.some((p) => p.id === t.id)).slice(0, 6);

  const row = (m: MemeView) => (
    <button key={m.id} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-white/5 text-left" onClick={() => onPicked(m.id)}>
      {m.media_type === "text"
        ? <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#141414] border border-[#2d2d2d] font-display text-[15px] font-extrabold text-[#C8FF3D]">Aa</span>
        : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.thumbnail_url} alt="" className="w-11 h-11 object-cover rounded-xl" loading="lazy" />
        )}
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[13px] truncate">{m.caption}</span>
        <span className="block text-[11px] muted aura-num">✦ {m.current_price}</span>
      </span>
      <Spark size={14} color="#C8FF3D" />
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} label="Share a MEMORE post" dark>
      <div className="hd text-[20px] mb-1">SEND THE RECEIPT</div>
      <p className="text-[11.5px] muted mb-3">The chat gets a reference. The meme stays on the market.</p>
      <div className="max-h-[46vh] overflow-y-auto no-scrollbar space-y-1">
        {own.length > 0 && <div className="text-[10px] font-bold uppercase tracking-widest muted px-1 pt-1">Your posts</div>}
        {own.map(row)}
        {trending.length > 0 && <div className="text-[10px] font-bold uppercase tracking-widest muted px-1 pt-2">Trending</div>}
        {trending.map(row)}
        {!mine.loading && own.length === 0 && trending.length === 0 && <p className="text-[12px] muted text-center py-4">Nothing worth sharing. Yet.</p>}
      </div>
    </Sheet>
  );
}

/** Shared MEMORE post card: compact, same border language as the feed card —
 * thin purple sketch outline, untouched meme image, and a few tiny marker
 * accents OUTSIDE the border (never over the image). */
function SharedBubble({ meme, onInvest, onShare }: { meme: MemeView; onInvest: () => void; onShare: () => void }) {
  return (
    <div className="relative w-[min(240px,100%)]">
      {/* sketch accents, kept outside the frame */}
      <svg viewBox="0 0 28 28" className="pointer-events-none absolute -left-3 -top-2.5 h-6 w-6 -rotate-6" aria-hidden>
        <path d="M5 19 C 8 13, 11 9, 16 4 M9 23 C 12 18, 15 14, 19 10" stroke="rgba(150,112,255,0.8)" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
      <svg viewBox="0 0 28 28" className="pointer-events-none absolute -bottom-2 -right-3 h-6 w-6 rotate-3" aria-hidden>
        <path d="M6 18 L13 8 M11 20 L18 11 M17 22 L23 14" stroke="rgba(200,255,61,0.75)" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
      <svg viewBox="0 0 64 10" className="pointer-events-none absolute -bottom-[5px] left-5 h-2 w-[54px]" aria-hidden>
        <path d="M2 6 C 18 8.6, 40 8, 62 4.5" stroke="rgba(150,112,255,0.7)" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <path
          d="M4.5 4 C 28 2.2, 72 2.4, 95.5 4.2 C 97.8 22, 98 72, 95.8 95.6 C 72 97.8, 28 97.6, 4.4 95.8 C 2.2 72, 2 24, 4.5 4 Z"
          fill="#101010" stroke="#7C4DFF" strokeWidth="1.7" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative px-3 pt-2 pb-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[9.5px] font-bold tracking-[0.16em] text-white/70">
            <Spark size={10} color="#C8FF3D" /> {meme.media_type === "text" ? "TEXT MEME" : "MEMORE POST"}
          </span>
          <Icon name="dots" size={12} strokeWidth={2.6} className="text-white/45" />
        </div>
        {meme.media_type === "text" ? (
          <Link href={`/meme/${meme.id}`} className="block select-text">
            <p className="font-display font-semibold text-[13.5px] leading-snug whitespace-pre-wrap text-white line-clamp-7">{meme.caption}</p>
          </Link>
        ) : (
          <>
            <Link href={`/meme/${meme.id}`} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={meme.thumbnail_url} alt={meme.caption} className="h-[128px] w-full rounded-md object-cover" loading="lazy" />
            </Link>
            {meme.caption && <p className="mt-1.5 truncate text-[14px] text-white">&ldquo;{meme.caption}&rdquo;</p>}
          </>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex items-center gap-1 text-[#C8FF3D]">
            <Spark size={12} color="#C8FF3D" />
            <span className="aura-num text-[13px]">{meme.current_price}</span>
          </span>
          {meme.heat && (
            <span className="rounded-full border border-[#7C4DFF]/80 px-2 py-px text-[10px] font-bold text-[#C084FC]">{meme.heat.level}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onShare(); }}
            aria-label="Share this post"
            className="ml-auto flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[#7C4DFF]/80 text-white/85 transition-transform active:scale-90"
          >
            <Icon name="share" size={12} strokeWidth={2.2} />
          </button>
          <button
            className="relative flex items-center gap-1 rounded-full bg-[#C8FF3D] px-3 py-[5px] text-[12px] font-bold text-[#0a0a0a] transition-transform active:scale-95"
            style={{ boxShadow: "1.5px 2px 0 rgba(10,10,10,0.85)" }}
            onClick={(e) => { e.stopPropagation(); onInvest(); }}
          >
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <path
                d="M10 4.2 C 32 2, 70 2.2, 90 4.4 C 96.4 6, 98.2 10, 97.7 15 C 98.2 20, 95.4 24.6, 88.8 26 C 66 27.8, 32 27.6, 11.2 25.8 C 4.4 24.2, 2 20, 2.5 15 C 2 10, 4.2 5.8, 10 4.2 Z"
                fill="none" stroke="rgba(10,10,10,0.78)" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="relative"><Spark size={13} color="#0a0a0a" /></span> INVEST
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatMenuSheet({ id, open, onClose, username, tempChat, onTempChange }: {
  id: string;
  open: boolean;
  onClose: () => void;
  username: string;
  tempChat: boolean;
  onTempChange: (enabled: boolean) => void;
}) {
  const toast = useToast();
  const [muted, setMuted] = useState<boolean | null>(null);
  const [tempBusy, setTempBusy] = useState(false);
  const toggleTemp = async () => {
    if (tempBusy) return;
    setTempBusy(true);
    try {
      const r = await api<{ temp_chat: boolean }>(`/api/chats/${id}/temp`, { json: { enabled: !tempChat } });
      onTempChange(r.temp_chat);
      toast(r.temp_chat ? "TEMP CHAT ON. Messages burn when you leave." : "TEMP CHAT OFF. Messages live 24h.", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setTempBusy(false);
    }
  };
  const act = async (kind: "mute" | "block" | "report") => {
    try {
      if (kind === "mute") {
        const r = await api<{ muted: boolean }>(`/api/chats/${id}/mute`, { method: "POST" });
        setMuted(r.muted);
        toast(r.muted ? "Muted. Peace." : "Unmuted.", "ok");
      } else if (kind === "block") {
        const r = await api<{ blocked: boolean }>(`/api/users/${username}/block`, { method: "POST" });
        toast(r.blocked ? "Blocked. They're gone." : "Unblocked.", "ok");
        onClose();
      } else {
        await api(`/api/chats/${id}/report`, { json: { note: "Reported from chat" } });
        toast("Reported. Our guys will look at it.", "ok");
        onClose();
      }
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const rows: Array<{ icon: IconName; label: string; kind: "mute" | "block" | "report" }> = [
    { icon: "bell", label: muted ? "Unmute" : "Mute", kind: "mute" },
    { icon: "shield", label: "Block", kind: "block" },
    { icon: "flag", label: "Report", kind: "report" },
  ];
  return (
    <Sheet open={open} onClose={onClose} label="Chat options" dark>
      <div className="hd text-[20px] mb-3">Chat options</div>

      {/* TEMP CHAT — conversation-level mode: messages purge when the chat closes */}
      <button
        className={`mb-3 flex w-full items-center gap-3 rounded-[16px] border p-3 text-left transition-transform active:scale-[0.99] ${tempChat ? "border-[#C8FF3D]/70 bg-[#141a08]" : "border-[#2a2a2a] bg-[#131313]"}`}
        onClick={toggleTemp}
        disabled={tempBusy}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#7C4DFF]/70 text-[#C8FF3D]">
          <svg viewBox="0 0 24 24" width={17} height={17} aria-hidden>
            <path d="M13.5 3 C 9 4.5, 8.5 9, 12 11 C 8 12, 7 17, 11 19.5 C 6.5 19, 4.5 14.5, 6.5 11 C 4 8, 6 4, 9.5 3.4 C 11 3, 12.5 2.8, 13.5 3 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 9 C 19 10, 19.5 15, 15.5 17.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[14px] font-bold text-white">TEMP CHAT</span>
          <span className="block text-[11px] leading-snug muted">{tempChat ? "ON — everything here burns when you leave" : "OFF — messages disappear 24h after sending"}</span>
        </span>
        <span className={`shrink-0 pill !text-[10px] font-bold ${tempChat ? "p-lime" : "p-black"}`}>{tempChat ? "ON" : "OFF"}</span>
      </button>

      <div className="space-y-1">
        {rows.map((r) => (
          <button key={r.kind} className="neo-btn ghost w-full !justify-start" onClick={() => act(r.kind)}>
            <Icon name={r.icon} size={15} /> {r.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] muted mt-3">Blocking works even after the messages are gone.</p>
    </Sheet>
  );
}
