"use client";
// MEMORE Market — light screen per brand reference: ranked lists + sparklines.
import { useState } from "react";
import Link from "next/link";
import { fmtAura, useApi } from "@/lib/client";
import type { MemeView } from "@/lib/types";
import { Sparkline } from "@/components/charts";
import { NavIcon } from "@/components/nav";
import { EmptyState, Skeleton } from "@/components/ui";

const TABS = [
  { id: "gainers", label: "Top Gainers", feed: "rising" },
  { id: "trending", label: "Trending", feed: "trending" },
  { id: "new", label: "New", feed: "new" },
  { id: "watchlist", label: "Watchlist", feed: "saved" },
] as const;

export default function MarketPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("gainers");
  const feedTab = TABS.find((t) => t.id === tab)!.feed;
  const { data, loading } = useApi<{ memes: MemeView[] }>(`/api/memes?tab=${feedTab}&limit=12`);

  const rows = data?.memes ?? [];

  return (
    <div className="-mx-4 px-4 pt-3 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="hd text-[26px]">Market</h1>
        <div className="flex items-center gap-2">
          <Link href="/graveyard" className="neo-btn icon !bg-transparent" aria-label="Graveyard" title="The Graveyard">
            <NavIcon name="skull" size={18} />
          </Link>
          <Link href="/search" className="neo-btn icon !bg-transparent" aria-label="Search">
            <NavIcon name="search" size={18} />
          </Link>
        </div>
      </div>

      <div className="flex gap-2 mt-4 overflow-x-auto no-scrollbar" role="tablist" aria-label="Market tabs">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`chip ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-1">
        {loading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 mb-2" />)}
        {!loading && rows.length === 0 && (
          <EmptyState
            emoji={tab === "watchlist" ? "⭐" : "📊"}
            title={tab === "watchlist" ? "Your watchlist is empty." : "Nothing here yet."}
            message={tab === "watchlist" ? "Save memes from the ⋯ menu to track them here." : "Check another tab."}
          />
        )}
        {!loading && rows.map((m, i) => (
          <Link key={m.id} href={`/meme/${m.id}`} className="flex items-center gap-3 p-2.5 -mx-2 rounded-2xl hover:bg-white/[0.04] transition-colors">
            <span className="hd font-extrabold text-[15px] w-5 text-center muted">{i + 1}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.thumbnail_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-[var(--line)]" loading="lazy" />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold truncate">{m.caption}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="pill !text-[9px] !py-0 !px-1.5">✦ {m.category}</span>
                <span className="text-[11px] muted truncate hidden min-[380px]:inline">{m.investor_count} investors</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <ChangePct value={m.change_24h} className="text-[13px]" />
              <div className="text-[11px] muted aura-num">{fmtAura(m.current_price)}</div>
            </div>
            <div className="shrink-0 w-16 opacity-80">
              <Sparkline points={m.spark.map((p) => ({ p }))} width={64} height={30} up={m.change_24h >= 0} />
            </div>
          </Link>
        ))}
      </div>

      {/* hunter + battles entries */}
      <div className="grid grid-cols-2 gap-3 mt-6">
        <Link href="/hunter" className="neo p-4 hover:border-[var(--lime)] transition-colors">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--lime)", color: "#0a0a0a" }}>
              <NavIcon name="target" size={17} />
            </span>
            <span className="font-bold text-[14px]">Meme Hunter</span>
          </div>
          <p className="text-[11.5px] muted mt-2 leading-snug">Find the next big thing before everyone else.</p>
        </Link>
        <Link href="/battles" className="neo p-4 hover:border-[var(--purple)] transition-colors">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--purple)", color: "#fff" }}>
              <NavIcon name="swords" size={17} />
            </span>
            <span className="font-bold text-[14px]">Meme Battle</span>
          </div>
          <p className="text-[11.5px] muted mt-2 leading-snug">Which one moons? Stake ✦5, split the pot.</p>
        </Link>
      </div>
    </div>
  );
}

function ChangePct({ value, className = "" }: { value: number; className?: string }) {
  const up = value >= 0;
  return (
    <span className={`chg ${up ? "up" : "down"} ${className}`}>
      {up ? "↑" : "↓"} {up ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}
