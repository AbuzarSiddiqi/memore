"use client";
// AURA BURST — the signature double-tap-to-invest animation, shared by the feed
// (DoubleTapZone) and reels. A white spark detonates inside a neon shockwave,
// spraying money stacks upward. `useTapInvest` batches taps (~380ms) into one
// invest API call; `AuraBurst` renders the visuals at each tap point.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useSession, useToast } from "@/lib/client";
import { mutateMemeLocally } from "@/lib/client-cache";
import { playSfx } from "@/lib/sfx";
import type { MemeView } from "@/lib/types";

export interface AuraEvent { id: number; x: number; y: number }

/** Shared double-tap-to-invest logic (batches taps, one API call). */
export function useTapInvest(meme: MemeView, opts?: { prefix?: string; cap?: number }) {
  const prefix = opts?.prefix ?? "tap";
  const cap = opts?.cap ?? 5;
  const { user, refresh } = useSession();
  const toast = useToast();
  const [events, setEvents] = useState<AuraEvent[]>([]);
  const pending = useRef(0);
  const currentTotalInvested = useRef(meme.total_invested ?? 0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [myInvested, setMyInvested] = useState(meme.my_position?.invested_amount ?? 0);

  useEffect(() => {
    currentTotalInvested.current = Math.max(currentTotalInvested.current, meme.total_invested ?? 0);
  }, [meme.total_invested]);

  useEffect(() => {
    setMyInvested(meme.my_position?.invested_amount ?? 0);
  }, [meme.my_position?.invested_amount]);

  const flush = useCallback(async () => {
    const amount = pending.current;
    pending.current = 0;
    if (amount <= 0) return;
    try {
      const r = await api<{ position: { invested_amount: number } | null }>(`/api/memes/${meme.id}/invest`, {
        json: { amount, client_id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
      });
      if (r.position) {
        setMyInvested(r.position.invested_amount);
        mutateMemeLocally(meme.id, {
          total_invested: currentTotalInvested.current,
          my_position: r.position,
        });
      }
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("aura:traded"));
      setTimeout(() => refresh(), 600);
    } catch (e) {
      // server rejected the batch — roll back the optimistic counter
      currentTotalInvested.current = Math.max(0, currentTotalInvested.current - amount);
      setMyInvested((v) => Math.max(0, Math.round((v - amount) * 10) / 10));
      mutateMemeLocally(meme.id, {
        total_invested: currentTotalInvested.current,
      });
      toast((e as Error).message, "err");
    }
  }, [meme.id, prefix, refresh, toast]);

  const tap = useCallback((x: number, y: number) => {
    if (!user) return toast("Log in to invest with double-taps.", "err");
    if ((user.aura_balance ?? 0) < 1) {
      return toast("You're out of Aura — sell a position to free some up.", "err");
    }
    playSfx("cash");
    pending.current += 1;
    currentTotalInvested.current += 1;
    setMyInvested((v) => Math.round((v + 1) * 10) / 10);
    // Instant 0ms optimistic update across all cards, rails, and tabs
    mutateMemeLocally(meme.id, {
      total_invested: currentTotalInvested.current,
    });
    const id = Date.now() + Math.random();
    setEvents((f) => [...f.slice(-(cap - 1)), { id, x, y }]);
    setTimeout(() => setEvents((f) => f.filter((v) => v.id !== id)), 1100);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, 380);
  }, [user, toast, cap, meme.id, flush]);

  // Fire any pending investment if the slide unmounts mid-batch.
  useEffect(() => () => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      void flush();
    }
  }, [flush]);

  return { events, myInvested, tap };
}

const AURA_BURST_CSS = `
  @keyframes floatUp {
    0% { opacity: 0; transform: translate(-50%, -30%) scale(0.7); }
    25% { opacity: 1; transform: translate(-50%, -60%) scale(1.15); }
    100% { opacity: 0; transform: translate(-50%, -220%) scale(1); }
  }
  @keyframes burstFlash {
    0% { opacity: 0.95; transform: translate(-50%, -50%) scale(0.25); }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
  }
  @keyframes burstRing {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.2); }
    18% { opacity: 1; }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.9); }
  }
  @keyframes burstStar {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.15) rotate(-30deg); }
    30% { opacity: 1; transform: translate(-50%, -50%) scale(1.25) rotate(-8deg); }
    62% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(-8deg); }
    100% { opacity: 0; transform: translate(-50%, -130%) scale(0.85) rotate(0deg); }
  }
  @keyframes burstGlint {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3) rotate(0deg); }
    22% { opacity: 1; }
    100% { opacity: 0; transform: translate(calc(-50% + var(--gx)), calc(-50% + var(--gy))) scale(0.1) rotate(140deg); }
  }
  @keyframes burstFlame {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3, 0.4); }
    25% { opacity: 0.95; }
    100% { opacity: 0; transform: translate(calc(-50% + var(--fx)), calc(-50% + var(--fy))) scale(0.9, 0.35); }
  }
  @keyframes burstBill {
    0% { opacity: 0; transform: translate(-50%, -50%) rotate(0deg) scale(0.4); }
    16% { opacity: 1; transform: translate(calc(-50% + var(--bx) * 0.3), calc(-50% + var(--by) * 0.34)) rotate(calc(var(--br) * 0.4)) scale(1.08); }
    100% { opacity: 0; transform: translate(calc(-50% + var(--bx)), calc(-50% + var(--by))) rotate(var(--br)) scale(0.96); }
  }
`;

// Deterministic per-event randomness so React re-renders don't reshuffle mid-flight.
function rand(seed: number, i: number, min: number, max: number): number {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return min + (v - Math.floor(v)) * (max - min);
}

/** Crisp 4-point star glint (the MEMORE spark shape). */
function Glint({ size, color, style }: { size: number; color: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <path d="M12 1.5c1 5.6 4.9 9.5 10.5 10.5-5.6 1-9.5 4.9-10.5 10.5C11 16.9 7.1 13 1.5 12 7.1 11 11 7.1 12 1.5z" fill={color} />
    </svg>
  );
}

function MoneyStack({ rot }: { rot: number }) {
  return (
    <span className="absolute" style={{ transform: `rotate(${rot}deg)` }} aria-hidden>
      {/* back bills of the stack */}
      <span className="absolute rounded-[3px]" style={{ left: 2, top: -4, width: 28, height: 16, background: "linear-gradient(160deg,#A8D81E,#7FA812)", border: "1px solid rgba(10,10,10,0.5)" }} />
      <span className="absolute rounded-[3px]" style={{ left: 1, top: -2, width: 28, height: 16, background: "linear-gradient(160deg,#BFEC2E,#94C41A)", border: "1px solid rgba(10,10,10,0.5)" }} />
      {/* top bill */}
      <span className="absolute flex items-center justify-center rounded-[3px] aura-num"
        style={{ width: 28, height: 16, background: "linear-gradient(160deg,#E9FF7A 0%,#C8FF3D 55%,#A3D621 100%)", border: "1px solid rgba(10,10,10,0.6)", boxShadow: "0 2px 6px rgba(0,0,0,0.5)", color: "#0a0a0a", fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5 }}>
        ✦1
      </span>
      <span className="absolute rounded-full" style={{ left: 3.5, top: 4.5, width: 7, height: 7, border: "1px solid rgba(10,10,10,0.45)" }} />
    </span>
  );
}

function Burst({ ev }: { ev: AuraEvent }) {
  const glints = [0, 1, 2, 3, 4, 5, 6, 7];
  const flames = [0, 1, 2, 3];
  const bills = [0, 1, 2, 3, 4];
  return (
    <span className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden>
      {/* white impact flash */}
      <span className="absolute rounded-full" style={{
        left: ev.x, top: ev.y, width: 56, height: 56,
        background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(233,213,255,0.55) 45%, transparent 70%)",
        animation: "burstFlash 0.4s ease-out forwards",
      }} />
      {/* double neon shockwave — crisp white + purple halo */}
      <span className="absolute rounded-full" style={{
        left: ev.x, top: ev.y, width: 68, height: 68,
        border: "1.5px solid rgba(255,255,255,0.95)",
        boxShadow: "0 0 14px rgba(255,255,255,0.55)",
        animation: "burstRing 0.6s cubic-bezier(0.2,0.8,0.3,1) forwards",
      }} />
      <span className="absolute rounded-full" style={{
        left: ev.x, top: ev.y, width: 68, height: 68,
        border: "1.5px solid #A855F7",
        boxShadow: "0 0 20px rgba(168,85,247,0.8), inset 0 0 10px rgba(168,85,247,0.4)",
        animation: "burstRing 0.72s cubic-bezier(0.2,0.8,0.3,1) 0.07s forwards",
      }} />
      {/* neon fire licks around the star */}
      {flames.map((i) => (
        <span key={`f${i}`} className="absolute rounded-full" style={{
          left: ev.x, top: ev.y, width: 10, height: 26,
          background: "linear-gradient(to top, rgba(124,58,237,0.95) 0%, #A855F7 40%, rgba(233,213,255,0.95) 82%, transparent 100%)",
          filter: "blur(2px)",
          ["--fx" as string]: `${rand(ev.id, i, -34, 34)}px`,
          ["--fy" as string]: `${rand(ev.id, i + 5, -72, -40)}px`,
          animation: `burstFlame 0.7s ease-out ${(i * 60) / 1000}s forwards`,
        }} />
      ))}
      {/* money stacks tossed into the air */}
      {bills.map((i) => (
        <span key={`b${i}`} className="absolute" style={{
          left: ev.x, top: ev.y,
          ["--bx" as string]: `${rand(ev.id, i + 9, -64, 64)}px`,
          ["--by" as string]: `${rand(ev.id, i + 13, -160, -95)}px`,
          ["--br" as string]: `${rand(ev.id, i + 17, -50, 50)}deg`,
          animation: `burstBill 0.95s cubic-bezier(0.16,0.9,0.3,1) ${(i * 65) / 1000}s forwards`,
        }}>
          <MoneyStack rot={0} />
        </span>
      ))}
      {/* star glints shooting outward */}
      {glints.map((i) => {
        const angle = (i / glints.length) * Math.PI * 2 + rand(ev.id, i + 21, -0.2, 0.2);
        const dist = rand(ev.id, i + 25, 52, 92);
        return (
          <span key={`g${i}`} className="absolute" style={{
            left: ev.x, top: ev.y,
            ["--gx" as string]: `${Math.cos(angle) * dist}px`,
            ["--gy" as string]: `${Math.sin(angle) * dist}px`,
            animation: `burstGlint 0.62s ease-out ${(i * 22) / 1000}s forwards`,
          }}>
            <Glint size={rand(ev.id, i + 29, 8, 14) | 0} color={i % 3 === 0 ? "#C8FF3D" : i % 3 === 1 ? "#FFFFFF" : "#C084FC"} />
          </span>
        );
      })}
      {/* the hero: MEMORE spark, white core with neon violet aura */}
      <span className="absolute" style={{
        left: ev.x, top: ev.y,
        filter: "drop-shadow(0 0 10px rgba(255,255,255,0.95)) drop-shadow(0 0 26px rgba(168,85,247,0.95))",
        animation: "burstStar 0.95s cubic-bezier(0.16,1.1,0.3,1) forwards",
      }}>
        <Glint size={54} color="#FFFFFF" />
      </span>
    </span>
  );
}

/** Full double-tap burst layer: spark detonation + money stacks + ✦1 chip. */
export function AuraBurst({ events }: { events: AuraEvent[] }) {
  return (
    <>
      {events.map((ev) => (
        <span key={ev.id}>
          <Burst ev={ev} />
          <span className="pointer-events-none absolute z-20 aura-num font-bold text-xl"
            style={{ left: ev.x, top: ev.y, transform: "translate(-50%,-50%)", color: "#C8FF3D", textShadow: "0 0 12px rgba(168,85,247,0.9), 0 2px 10px rgba(0,0,0,0.7)", animation: "floatUp 0.85s ease-out forwards" }}>
            +✦1
          </span>
        </span>
      ))}
      <style jsx global>{AURA_BURST_CSS}</style>
    </>
  );
}
