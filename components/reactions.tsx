"use client";
// MEMORE chat reactions — custom hand-drawn characters (no generic emoji),
// the long-press tray, the full-catalog picker, and the tiny pills that sit
// under a message.
import React, { useRef, useState } from "react";
import { REACTIONS, reactionDef, type ReactionDef } from "@/lib/reactions";
import type { MessageReactionSummary } from "@/lib/types";

/** The characters. Each is a few strokes so it stays readable at 14–20px. */
function Glyph({ r }: { r: ReactionDef }) {
  const p = { fill: "none", stroke: r.color, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const dot = (cx: number, cy: number) => <circle cx={cx} cy={cy} r="0.8" fill={r.color} stroke="none" />;
  switch (r.id) {
    case "aura": // the ✦ spark, with a face
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <path {...p} d="M12 2.6 C 12.9 7.8, 14.2 10.6, 20.4 12 C 14.2 13.4, 12.9 16.2, 12 21.4 C 11.1 16.2, 9.8 13.4, 3.6 12 C 9.8 10.6, 11.1 7.8, 12 2.6 Z" />
          {dot(10.2, 11.1)}
          {dot(13.8, 11.1)}
          <path {...p} strokeWidth={1.5} d="M10.4 13.7 C 11.2 14.5, 12.8 14.5, 13.6 13.7" />
        </svg>
      );
    case "w": // a tiny W celebrating with its arms up
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <path {...p} d="M4.8 9 L7.6 17.4 L12 10.6 L16.4 17.4 L19.2 9" />
          <path {...p} d="M3.6 7.6 C 2.8 5.8, 3 4.4, 4 3.4 M20.4 7.6 C 21.2 5.8, 21 4.4, 20 3.4" />
          <path {...p} strokeWidth={1.6} d="M8.4 3.2 L9 4.8 M12 2.4 L12 4.2 M15.6 3.2 L15 4.8" />
        </svg>
      );
    case "f": // F to pay respects — drooping, with a single tear
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <path {...p} d="M7.8 20.6 L7.8 4.8 C 11.8 3.6, 15.2 4.2, 16.2 6.4 M7.8 12 L13.6 12" />
          <path {...p} strokeWidth={1.5} d="M19.8 13.6 C 21 15.6, 20.2 17.2, 19 17 C 17.8 16.8, 17.6 15, 18.4 13.2 C 18.8 12.4, 19.4 12.8, 19.8 13.6 Z" fill={r.color} stroke="none" />
          <path {...p} strokeWidth={1.5} d="M5.6 22 C 7.8 22.5, 10.4 22.5, 12.4 22" />
        </svg>
      );
    case "cook": // a flame that is itself cooking
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <path {...p} d="M12 2.8 C 13.2 6.2, 17.4 8.2, 17.4 13 C 17.4 17.6, 15 20.6, 12 20.6 C 9 20.6, 6.6 17.6, 6.6 13 C 6.6 10.4, 8 8.8, 9.2 6.8 C 9.9 8.2, 10.8 8.9, 12 8.6" />
          {dot(10.3, 14)}
          {dot(13.7, 14)}
          <path {...p} strokeWidth={1.5} d="M10.7 16.4 C 11.4 17.5, 12.6 17.5, 13.3 16.4" />
        </svg>
      );
    case "dead": // MEMORE skull — X eyes, big grin
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <path {...p} d="M12 3.4 C 16.6 3.4, 19.2 6.6, 19.2 10.6 C 19.2 13.4, 17.6 15 16 15.6 L 16 19 C 16 19.8, 15.4 20.4, 14.6 20.4 L 9.4 20.4 C 8.6 20.4, 8 19.8, 8 19 L 8 15.6 C 6.4 15, 4.8 13.4, 4.8 10.6 C 4.8 6.6, 7.4 3.4, 12 3.4 Z" />
          <path {...p} strokeWidth={1.6} d="M8 9.4 L10.6 12 M10.6 9.4 L8 12 M13.4 9.4 L16 12 M16 9.4 L13.4 12" />
          <path {...p} strokeWidth={1.6} d="M10.8 20.4 L10.8 18.2 M13.2 20.4 L13.2 18.2" />
        </svg>
      );
    case "lol":
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <circle {...p} cx="12" cy="12" r="8.6" />
          <path {...p} strokeWidth={1.6} d="M7 9.4 L9 7.8 L11 9.4 M13 9.4 L15 7.8 L17 9.4" />
          <path d="M8 13 C 8.8 17.2, 15.2 17.2, 16 13 C 13.3 13.9, 10.7 13.9, 8 13 Z" fill={r.color} stroke="none" />
        </svg>
      );
    case "sus": // side-eye
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <circle {...p} cx="12" cy="12" r="8.6" />
          <circle {...p} strokeWidth={1.6} cx="8.8" cy="10.8" r="2" />
          <circle {...p} strokeWidth={1.6} cx="15.2" cy="10.8" r="2" />
          {dot(9.8, 10.8)}
          {dot(16.2, 10.8)}
          <path {...p} strokeWidth={1.6} d="M9 16.6 C 11 15.8, 13.4 15.8, 15.4 16.6" />
        </svg>
      );
    case "eyes":
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <ellipse {...p} cx="7.6" cy="12.8" rx="3" ry="4.2" />
          <ellipse {...p} cx="16.4" cy="11.2" rx="3" ry="4.2" />
          {dot(8.6, 13.8)}
          {dot(17.4, 12.2)}
        </svg>
      );
    case "cold": // chattering teeth + ice
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <circle {...p} cx="12" cy="13" r="7.6" />
          <path {...p} strokeWidth={1.6} d="M7.8 10.6 C 8.8 9.8, 9.8 9.8, 10.8 10.6 M13.2 10.6 C 14.2 9.8, 15.2 9.8, 16.2 10.6" />
          <path {...p} strokeWidth={1.6} d="M8.8 15.4 L15.2 15.4 M10.6 14.4 L10.6 16.6 M12.6 14.4 L12.6 16.6 M14.6 14.4 L14.6 16.6" />
          <path {...p} strokeWidth={1.6} d="M3.6 3.6 L5.8 5.8 M20.4 3.6 L18.2 5.8" />
        </svg>
      );
    case "rocket":
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <path {...p} d="M12 2.6 C 14.8 5.4, 16 9.2, 14.8 13.4 L 9.2 13.4 C 8 9.2, 9.2 5.4, 12 2.6 Z" />
          <circle {...p} strokeWidth={1.6} cx="12" cy="8.4" r="1.5" />
          <path {...p} strokeWidth={1.6} d="M9.2 13.4 L7 16.2 L9.8 15.6 M14.8 13.4 L17 16.2 L14.2 15.6" />
          <path {...p} strokeWidth={1.6} d="M10.5 16.6 C 10.5 18.4, 11 19.8, 12 21.2 C 13 19.8, 13.5 18.4, 13.5 16.6" />
        </svg>
      );
    case "crown":
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <path {...p} d="M4.8 16.6 L3.9 7.8 L8.9 11 L12 5 L15.1 11 L20.1 7.8 L19.2 16.6 C 13.7 15.4, 10.3 15.4, 4.8 16.6 Z" />
          <path {...p} strokeWidth={1.6} d="M7 19.4 C 10 18.7, 14 18.7, 17 19.4" />
        </svg>
      );
    case "heart": // plump MEMORE heart with a face
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <path {...p} d="M12 20.2 C 6.2 15.8, 3.4 11.8, 5.5 8.2 C 7.1 5.6, 10.3 5.9, 12 8.7 C 13.7 5.9, 16.9 5.6, 18.5 8.2 C 20.6 11.8, 17.8 15.8, 12 20.2 Z" />
          {dot(9.9, 10.9)}
          {dot(14.1, 10.9)}
          <path {...p} strokeWidth={1.5} d="M10.3 13.1 C 11.1 13.9, 12.9 13.9, 13.7 13.1" />
        </svg>
      );
    default:
      return null;
  }
}

export function ReactionGlyph({ id, size = 18 }: { id: string; size?: number }) {
  const r = reactionDef(id);
  if (!r) return null;
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <Glyph r={r} />
    </span>
  );
}

/** Reaction stamps: bigger hand-drawn badges sitting ON the bottom edge of a
 * bubble or shared post card (overlapping it slightly, like a wax seal).
 * Tapping a stamp toggles/sets your reaction. */
export function ReactionStamps({ reactions, mine, variant = "bubble", onToggle }: {
  reactions: MessageReactionSummary[];
  mine: boolean;
  variant?: "bubble" | "card";
  onToggle: (reactionId: string) => void;
}) {
  if (reactions.length === 0) return null;
  const place = variant === "card"
    ? (mine ? "-mt-[7px] mr-2.5 justify-end" : "-mt-[7px] ml-3.5 justify-start")
    : (mine ? "-mt-[4px] mr-1.5 justify-end" : "-mt-[4px] ml-2.5 justify-start");
  return (
    <div className={`relative z-10 flex max-w-[150px] flex-wrap items-center gap-1 ${place}`}>
      {reactions.map((r) => {
        const c = reactionDef(r.reaction_id)?.color ?? "#C084FC";
        return (
          <button
            key={r.reaction_id}
            onClick={(e) => { e.stopPropagation(); onToggle(r.reaction_id); }}
            aria-label={`Reaction ${reactionDef(r.reaction_id)?.label ?? r.reaction_id}${r.mine ? " (yours — tap to remove)" : ""}`}
            className={`flex items-center border-2 font-bold leading-none transition-transform active:scale-90 ${
              r.count > 1 ? "gap-1 px-2 py-[5px]" : "h-[28px] w-[28px] justify-center"
            }`}
            style={{
              borderColor: c,
              background: r.mine ? `${c}2b` : "#161616",
              color: c,
              borderRadius: r.count > 1 ? "999px" : "48% 52% 44% 56% / 56% 46% 54% 44%",
              boxShadow: "1.5px 2px 0 rgba(10,10,10,0.8)",
            }}
          >
            <ReactionGlyph id={r.reaction_id} size={r.count > 1 ? 16 : 17} />
            {r.count > 1 && <span className="aura-num">{r.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

const TRAY_W = 250;
const TRAY_H = 56;

/** Long-press tray: five FIXED slots + "+". The hovered slot (hold + glide)
 * enlarges with a spring pop; release applies it. "+" opens the customizer. */
export function ReactionTray({
  rect,
  favorites,
  pickerOpen,
  hoverIdx = null,
  onPick,
  onMore,
  onSlotsChange,
  onClose,
}: {
  rect: DOMRect;
  favorites: string[];
  pickerOpen: boolean;
  hoverIdx?: number | null;
  onPick: (id: string) => void;
  onMore: () => void;
  onSlotsChange: (next: string[]) => void;
  onClose: () => void;
}) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const h = pickerOpen ? 252 : TRAY_H;
  const below = rect.top < h + 84; // not enough room above (header) → below
  const top = below ? rect.bottom + 12 : rect.top - h - 12;
  const left = Math.min(Math.max(rect.left + rect.width / 2 - TRAY_W / 2, 10), vw - TRAY_W - 10);
  const trayDefs = favorites.map((id) => reactionDef(id)).filter(Boolean) as ReactionDef[];

  return (
    <div
      className="react-tray absolute z-40"
      style={{ top, left, width: TRAY_W }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative" style={{ minHeight: TRAY_H }}>
        {/* sketch accents + wobbly charcoal panel */}
        <svg viewBox="0 0 28 28" className="pointer-events-none absolute -left-2 -top-2 h-5 w-5 -rotate-6" aria-hidden>
          <path d="M6 19 C 9 13, 12 9, 17 5 M10 22 C 12 18, 15 14, 18 11" stroke="rgba(150,112,255,0.75)" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute -right-1.5 -top-2 h-4 w-4 rotate-6" aria-hidden>
          <path d="M6 16 L12 7 M11 18 L17 10" stroke="rgba(200,255,61,0.7)" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <path
            d="M4.5 6 C 28 3, 72 3.4, 95.5 5.4 C 98.4 26, 98.2 72, 95.6 93.4 C 72 96.8, 28 96.6, 4.6 94.2 C 2 72, 2.2 26, 4.5 6 Z"
            fill="#161616" stroke="rgba(124,77,255,0.9)" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(2px 3px 0 rgba(10,10,10,0.8))" }}
          />
        </svg>

        {!pickerOpen ? (
          <div className="relative flex items-center justify-between gap-0.5 px-2.5 py-2">
            {trayDefs.map((r, i) => {
              const hovered = hoverIdx === i;
              return (
                <button
                  key={r.id}
                  data-react={r.id}
                  aria-label={r.label}
                  className={`flex h-[38px] w-[38px] items-center justify-center rounded-xl transition-transform hover:bg-white/5 active:scale-90 ${
                    hovered ? "scale-[1.22] bg-white/10 ring-2 ring-[#C8FF3D]" : ""
                  }`}
                  onClick={() => {
                    if (Date.now() < clickGuardUntil) return;
                    onPick(r.id);
                  }}
                >
                  <span key={hovered ? "h" : "n"} className={`relative inline-block h-[22px] w-[22px] ${hovered ? "react-pop" : ""}`}>
                    <ReactionGlyph id={r.id} size={22} />
                  </span>
                </button>
              );
            })}
            <span className="mx-0.5 h-6 w-px bg-white/15" aria-hidden />
            <button
              aria-label="Customize reactions"
              className="relative flex h-[34px] w-[34px] items-center justify-center text-white/85 transition-transform active:scale-90"
              onClick={() => {
                if (Date.now() < clickGuardUntil) return;
                onMore();
              }}
            >
              <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                <path d="M20 3 C 28.6 2.6, 36.8 8.6, 37 19.6 C 37.4 30, 29.2 37, 19.8 36.6 C 10.4 36.2, 3.4 29.6, 3.7 19.8 C 4 10, 11.4 3.4, 20 3 Z" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden>
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : (
          <ReactionCustomizer slots={favorites} onChange={onSlotsChange} />
        )}

        {/* notch pointing at the message */}
        <svg
          viewBox="0 0 16 10"
          className="pointer-events-none absolute left-1/2 h-[9px] w-4 -translate-x-1/2"
          style={below ? { top: -8, transform: "translateX(-50%) scaleY(-1)" } : { bottom: -8 }}
          aria-hidden
        >
          <path d="M2 1 C 6 2, 10 5.5, 14 9.4 C 10.6 7, 5.4 7, 2 1 Z" fill="#161616" stroke="rgba(124,77,255,0.9)" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

/** Block the synthetic click that fires right after release-to-apply so it can
 * never double-fire on a tray button or whatever sits beneath the tray. */
let clickGuardUntil = 0;
export function armClickGuard(ms = 450) {
  clickGuardUntil = Date.now() + ms;
}

/** CUSTOMIZE REACTIONS — five fixed slots: tap a slot to arm it, tap a library
 * reaction to replace it, hold + drag slots to reorder. Saves automatically. */
export function ReactionCustomizer({ slots, onChange }: { slots: string[]; onChange: (next: string[]) => void }) {
  const [tab, setTab] = useState<"all" | ReactionDef["group"]>("all");
  const [armed, setArmed] = useState(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<number | null>(null);
  const startXRef = useRef(0);

  const groups: Array<{ id: "all" | ReactionDef["group"]; label: string }> = [
    { id: "all", label: "ALL" },
    { id: "reactions", label: "REACTIONS" },
    { id: "love", label: "LOVE" },
    { id: "wl", label: "W / L" },
    { id: "memore", label: "MEMORE" },
  ];
  const library = REACTIONS.filter((r) => tab === "all" || r.group === tab);

  const replace = (id: string) => {
    if (slots[armed] === id) {
      setArmed((a) => Math.min(a + 1, slots.length - 1));
      return;
    }
    const next = [...slots];
    const existing = next.indexOf(id);
    if (existing >= 0) next[existing] = next[armed]; // swap the two slots
    next[armed] = id;
    try { navigator.vibrate?.(8); } catch { /* no haptics */ }
    onChange(next);
    setArmed((a) => Math.min(a + 1, slots.length - 1));
  };

  const clearHold = () => {
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const onSlotDown = (i: number, e: React.PointerEvent) => {
    clearHold();
    startXRef.current = e.clientX;
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      setDragFrom(i);
      try { navigator.vibrate?.(10); } catch { /* no haptics */ }
      (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
    }, 220);
  };
  const onSlotMove = (i: number, e: React.PointerEvent) => {
    if (dragFrom !== i) return;
    setDragX(e.clientX - startXRef.current);
    const row = rowRef.current;
    if (!row) return;
    const rb = row.getBoundingClientRect();
    const step = rb.width / slots.length;
    const target = Math.max(0, Math.min(slots.length - 1, Math.floor((e.clientX - rb.left) / step)));
    if (target !== dragFrom) {
      const next = [...slots];
      const [moved] = next.splice(dragFrom, 1);
      next.splice(target, 0, moved);
      onChange(next);
      setDragFrom(target);
      try { navigator.vibrate?.(5); } catch { /* no haptics */ }
    }
  };
  const onSlotUp = (i: number) => {
    clearHold();
    if (dragFrom === i) setDragFrom(null);
  };

  return (
    <div className="relative px-3 pb-3 pt-2">
      <div className="hd mb-1 text-[12px] tracking-[0.14em] text-white/60">CUSTOMIZE REACTIONS</div>
      <div ref={rowRef} className="mb-1 flex justify-between gap-1">
        {slots.map((id, i) => {
          const def = reactionDef(id);
          if (!def) return null;
          const lifted = dragFrom === i;
          return (
            <div key={`${id}-${i}`} className="flex flex-col items-center gap-0.5">
              <button
                aria-label={`Slot ${i + 1}: ${def.label}`}
                className={`flex h-[42px] w-[42px] items-center justify-center rounded-xl border-2 transition-transform ${lifted ? "scale-110" : ""} ${
                  armed === i ? "border-[#C8FF3D] bg-white/10" : "border-[#7C4DFF]/70 bg-white/[0.04]"
                }`}
                style={lifted ? { transform: `translateX(${dragX * 0.25}px) scale(1.15)`, boxShadow: "2px 3px 0 rgba(10,10,10,0.8)" } : undefined}
                onPointerDown={(e) => onSlotDown(i, e)}
                onPointerMove={(e) => onSlotMove(i, e)}
                onPointerUp={() => onSlotUp(i)}
                onPointerCancel={() => onSlotUp(i)}
                onClick={() => {
                  if (Date.now() < clickGuardUntil) return;
                  setArmed(i);
                  try { navigator.vibrate?.(6); } catch { /* no haptics */ }
                }}
              >
                <ReactionGlyph id={id} size={24} />
              </button>
              <span className={`text-[8.5px] font-bold ${armed === i ? "text-[#C8FF3D]" : "text-white/35"}`}>{i + 1}</span>
            </div>
          );
        })}
      </div>
      <p className="mb-1.5 text-[9.5px] leading-tight text-white/40">
        slot {armed + 1} armed — pick a reaction below to replace it · hold + drag slots to reorder
      </p>
      <div className="-mx-1 mb-1.5 flex gap-1 overflow-x-auto no-scrollbar px-1">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => setTab(g.id)}
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[9.5px] font-bold tracking-wider transition-colors ${
              tab === g.id ? "border-[#C8FF3D] bg-[#C8FF3D] text-[#0a0a0a]" : "border-[#7C4DFF]/70 text-white/60"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="grid max-h-[118px] grid-cols-6 gap-1 overflow-y-auto no-scrollbar">
        {library.map((r) => {
          const inUse = slots.indexOf(r.id);
          return (
            <button
              key={r.id}
              aria-label={r.label}
              onClick={() => replace(r.id)}
              className={`relative flex h-[40px] items-center justify-center rounded-xl border transition-transform active:scale-90 ${
                inUse >= 0 ? "border-white/15 bg-white/[0.03] opacity-50" : "border-[#7C4DFF]/50 bg-white/[0.04]"
              }`}
            >
              <ReactionGlyph id={r.id} size={20} />
              {inUse >= 0 && <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#C8FF3D] text-[8px] font-extrabold text-[#0a0a0a]">{inUse + 1}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}