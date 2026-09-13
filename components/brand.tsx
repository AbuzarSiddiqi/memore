"use client";
// MEMORE brand. The mark mirrors the master logo: purple rounded square,
// thick black outline, chunky lime M with pointed peaks and a deep centre V,
// and the black aura-spark nested between the peaks. ✦ = aura · ↗ = growth.
import React from "react";

/** 4-point curved spark (aura) */
export function Spark({ size = 16, color = "currentColor", className = "" }: { size?: number; color?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 1.6c.9 4.7 2.3 7.6 4.5 9 1.4.9 3.2 1.4 5.9 1.4-4.7.9-7.6 2.3-9 4.5-.9 1.4-1.4 3.2-1.4 5.9-.9-4.7-2.3-7.6-4.5-9C6.1 12.5 4.3 12 1.6 12c4.7-.9 7.6-2.3 9-4.5.9-1.4 1.4-3.2 1.4-5.9Z"
        fill={color}
      />
    </svg>
  );
}

// Chunky angular M (viewBox 100×100). Miter-clip joins keep the peaks nearly
// pointed without the miter spike blowing past the tile.
const M_PATH = "M26 74V26l24 33L74 26v48";

/** The app mark: transparent app logo with no background */
export function MemoreMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/appicon/logo-nobg.png"
      alt="MEMORE"
      width={size}
      height={size}
      className={`object-contain shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** MEMORE wordmark with the spark-O */
export function MemoreWordmark({ size = 20, color = "currentColor", className = "" }: { size?: number; color?: string; className?: string }) {
  return (
    <span className={`wordmark inline-flex items-center ${className}`} style={{ fontSize: size, lineHeight: 1, color }} aria-label="MEMORE">
      MEM
      <Spark size={size * 0.72} color={color} className="mx-[1px] mt-[0.08em]" />
      RE
    </span>
  );
}

/** Full lockup: mark + wordmark + optional tagline */
export function MemoreLogo({ markSize = 42, wordSize = 23, tagline = false, className = "" }: { markSize?: number; wordSize?: number; tagline?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <MemoreMark size={markSize} />
      <span className="inline-flex flex-col leading-none">
        <MemoreWordmark size={wordSize} />
        {tagline && (
          <span className="muted" style={{ fontSize: Math.max(8, wordSize * 0.42), fontWeight: 700, letterSpacing: "0.22em", marginTop: 3 }}>
            DON&apos;T LIKE. INVEST.
          </span>
        )}
      </span>
    </span>
  );
}
