"use client";
// Hand-rolled SVG charts — playful, branded, zero dependencies.
import React, { useMemo, useState } from "react";
import type { PricePoint } from "@/lib/types";
import { fmtAura } from "@/lib/client";

export function Sparkline({ points, width = 120, height = 36, up }: { points: { p: number }[]; width?: number; height?: number; up?: boolean }) {
  if (points.length < 2) return <svg width={width} height={height} aria-hidden />;
  const ps = points.map((p) => p.p);
  const min = Math.min(...ps), max = Math.max(...ps);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - 3 - ((p.p - min) / span) * (height - 6)).toFixed(1)}`).join(" ");
  const color = up === false ? "var(--neg)" : "var(--pos)";
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AreaChart({ points, height = 220, up }: { points: PricePoint[]; height?: number; up: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = height;
  const chart = useMemo(() => {
    if (points.length < 2) return null;
    const ps = points.map((p) => p.p);
    const min = Math.min(...ps), max = Math.max(...ps);
    const pad = (max - min) * 0.12 || 10;
    const lo = min - pad, hi = max + pad;
    const span = hi - lo;
    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (p: number) => H - 8 - ((p - lo) / span) * (H - 24);
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.p).toFixed(1)}`).join(" ");
    const area = `${line} L${W},${H} L0,${H} Z`;
    return { line, area, lo, hi, min, max, x, y };
  }, [points, H]);

  if (!chart) return <div className="text-sm muted py-10 text-center">Not enough history yet. Invest and watch.</div>;
  const color = up ? "var(--pos)" : "var(--neg)";
  const hoverPt = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      {hoverPt && (
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 pill p-black pointer-events-none z-10"
        >
          {fmtAura(hoverPt.p)} · {new Date(hoverPt.t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" })}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        role="img"
        aria-label="Aura value chart"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.target as SVGElement).closest("svg")!.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(frac * (points.length - 1)))));
        }}
      >
        <defs>
          <linearGradient id="auraFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="var(--ink)" strokeOpacity="0.12" strokeWidth="1.5" strokeDasharray="5 6" />
        ))}
        <path d={chart.area} fill="url(#auraFill)" />
        <path d={chart.line} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover != null && (
          <g>
            <line x1={chart.x(hover)} y1="0" x2={chart.x(hover)} y2={H} stroke="var(--ink)" strokeWidth="2" strokeDasharray="4 4" />
            <circle cx={chart.x(hover)} cy={chart.y(points[hover].p)} r="6" fill={color} stroke="var(--ink)" strokeWidth="3" />
          </g>
        )}
      </svg>
      <div className="flex justify-between text-[11px] font-bold muted mt-1 hd">
        <span>LOW {fmtAura(chart.min)}</span>
        <span>HIGH {fmtAura(chart.max)}</span>
      </div>
    </div>
  );
}
