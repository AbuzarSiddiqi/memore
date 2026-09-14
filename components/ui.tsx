"use client";
// Neo-brutalist UI primitives used across every screen.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { MemeLabel } from "@/lib/types";
import { Icon, IconSticker, type IconName } from "./icons";

export function NeoCard({ className = "", children, style }: { className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className={`neo ${className}`} style={style}>{children}</div>;
}

type BtnVariant = "primary" | "lime" | "yellow" | "coral" | "purple" | "ghost" | "default";
export function NeoButton({
  children, onClick, variant = "default", size, className = "", disabled, type = "button", full, href, ariaLabel,
}: {
  children: React.ReactNode; onClick?: (e: React.MouseEvent) => void; variant?: BtnVariant;
  size?: "sm" | "big"; className?: string; disabled?: boolean; type?: "button" | "submit"; full?: boolean;
  href?: string; ariaLabel?: string;
}) {
  const cls = `neo-btn ${variant !== "default" ? variant : ""} ${size ?? ""} ${full ? "w-full" : ""} ${className}`;
  if (href && !disabled) return <Link href={href} className={cls} aria-label={ariaLabel} onClick={onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>}>{children}</Link>;
  return <button type={type} className={cls} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>{children}</button>;
}

export function Pill({ children, color = "" }: { children: React.ReactNode; color?: string }) {
  return <span className={`pill ${color ? `p-${color}` : ""}`}>{children}</span>;
}

const LABEL_STYLE: Record<MemeLabel, { icon: IconName; color: string }> = {
  RISING: { icon: "flame", color: "yellow" },
  EXPLODING: { icon: "rocket", color: "coral" },
  UNDERVALUED: { icon: "gem", color: "blue" },
  FRESH: { icon: "sprout", color: "lime" },
  COOLING: { icon: "alert", color: "" },
  CRASHING: { icon: "skull", color: "black" },
  SMART_PICK: { icon: "brain", color: "purple" },
  EARLY: { icon: "egg", color: "yellow" },
};
export function LabelPill({ label }: { label: MemeLabel }) {
  const s = LABEL_STYLE[label];
  if (!s) return null;
  return <Pill color={s.color}><Icon name={s.icon} size={11} strokeWidth={2.4} /> {label.replace("_", " ")}</Pill>;
}

export function ChangePct({ value, className = "", digits = 1 }: { value: number; className?: string; digits?: number }) {
  const up = value >= 0;
  return (
    <span className={`chg ${up ? "up" : "down"} ${className}`}>
      <Icon name={up ? "chart" : "chart-down"} size={11} strokeWidth={2.6} /> {Math.abs(value).toFixed(digits)}%
    </span>
  );
}

export function Avatar({ name, bg, size = 40, username }: { name: string; bg: string; size?: number; username?: string }) {
  const initials = (name || "?").slice(0, 2).toUpperCase();
  const inner = (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-full font-display font-bold shrink-0"
      style={{ width: size, height: size, background: bg, color: "#fff", fontSize: size * 0.38, border: "2.5px solid var(--ink)" }}
    >
      {initials}
    </span>
  );
  if (username) return <Link href={`/profile/${username}`} className="shrink-0">{inner}</Link>;
  return inner;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function FeedSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading memes">
      {[0, 1].map((i) => (
        <NeoCard key={i} className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="w-11 h-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="w-full h-64" />
          <Skeleton className="h-4 w-3/4 mt-4" />
          <Skeleton className="h-9 w-full mt-4" />
        </NeoCard>
      ))}
    </div>
  );
}

export function EmptyState({ icon = "eye", emoji, title, message, action }: { icon?: IconName; emoji?: string; title: string; message?: string; action?: React.ReactNode }) {
  return (
    <NeoCard className="p-10 text-center">
      <div className="mb-3 flex justify-center">
        {emoji ? <span className="text-5xl select-none" role="img">{emoji}</span> : <IconSticker name={icon} size={62} />}
      </div>
      <div className="hd text-xl mb-1">{title}</div>
      {message && <p className="muted text-sm mb-5">{message}</p>}
      {action}
    </NeoCard>
  );
}

let scrollLockCount = 0;
function lockBodyScroll() {
  if (typeof document === "undefined") return;
  scrollLockCount++;
  if (scrollLockCount === 1) {
    document.body.style.overflow = "hidden";
  }
}
function unlockBodyScroll() {
  if (typeof document === "undefined") return;
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = "";
  }
}

export function Sheet({ open, onClose, children, label, dark = false }: { open: boolean; onClose: () => void; children: React.ReactNode; label: string; dark?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Stay mounted through the exit animation instead of vanishing (flicker).
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const isLocked = useRef(false);
  // keep the latest close handler without re-running the open lifecycle —
  // re-running it would steal focus from inputs on every parent re-render
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      if (!isLocked.current) {
        lockBodyScroll();
        isLocked.current = true;
      }
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
      document.addEventListener("keydown", onKey);
      ref.current?.focus();
      return () => {
        document.removeEventListener("keydown", onKey);
        if (isLocked.current) {
          unlockBodyScroll();
          isLocked.current = false;
        }
      };
    }
    if (!mounted) return;
    if (isLocked.current) {
      unlockBodyScroll();
      isLocked.current = false;
    }
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, 240);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  // Always ensure cleanup on unmount
  useEffect(() => {
    return () => {
      if (isLocked.current) {
        unlockBodyScroll();
        isLocked.current = false;
      }
    };
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className={`sheet-backdrop ${closing ? "closing" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className={`sheet ${dark ? "sheet-dark" : ""} ${closing ? "sheet-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={ref}
        style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
      >
        <div className="sheet-grab" />
        {children}
      </div>
    </div>,
    document.body
  );
}

export function StatBox({ label, value, accent, sub }: { label: string; value: React.ReactNode; accent?: string; sub?: string }) {
  return (
    <div className="neo-sm p-3" style={accent ? { background: accent } : undefined}>
      <div className="text-[11px] font-bold uppercase tracking-wide opacity-70 hd">{label}</div>
      <div className="aura-num text-xl mt-0.5">{value}</div>
      {sub && <div className="text-[11px] mt-0.5 opacity-70">{sub}</div>}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block w-5 h-5 border-[3px] border-current border-t-transparent rounded-full animate-spin ${className}`} aria-label="Loading" />
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3 mt-8 first:mt-0">
      <h2 className="hd text-xl sm:text-2xl">{children}</h2>
      {right}
    </div>
  );
}
