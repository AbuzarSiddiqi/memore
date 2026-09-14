"use client";
// MEME HUNTER — find the next big thing before everyone else.
import { useState } from "react";
import Link from "next/link";
import { fmtAura, fmtNum, useApi } from "@/lib/client";
import type { MemeView } from "@/lib/types";
import { NavIcon } from "@/components/nav";
import { ChangePct, EmptyState, Skeleton } from "@/components/ui";
import { TextThumb } from "@/components/text-meme";

const TABS = [
  { id: "hunter", label: "Early Signals" },
  { id: "undervalued", label: "Underrated" },
  { id: "rising", label: "All Picks" },
] as const;

export default function HunterPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("hunter");
  const { data, loading } = useApi<{ memes: MemeView[] }>(`/api/memes?tab=${tab}&limit=14`);
  const rows = data?.memes ?? [];

  return (
    <div className="mt-2 pb-10">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--lime)", color: "#0a0a0a" }}>
          <NavIcon name="target" size={22} />
        </span>
        <div>
          <h1 className="hd text-[22px] leading-tight">Meme Hunter</h1>
          <p className="text-[12.5px] muted">Find the next big thing before everyone else.</p>
        </div>
      </div>

      <div className="flex gap-2 mt-5 overflow-x-auto no-scrollbar" role="tablist" aria-label="Hunter tabs">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`chip ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        {loading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[76px]" />)}
        {!loading && rows.length === 0 && (
          <EmptyState emoji="🎯" title="No signals in this scope." message="Shift the tabs — the hunt never stops." />
        )}
        {!loading && rows.map((m) => (
          <Link key={m.id} href={`/meme/${m.id}`} className="neo-sm p-2.5 flex items-center gap-3 hover:border-[var(--lime)] transition-colors">
            {m.media_type === "text"
              ? <TextThumb meme={m} className="w-[52px] h-[52px]" />
              : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.thumbnail_url} alt="" className="w-[52px] h-[52px] rounded-xl object-cover" loading="lazy" />
              )}
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-bold truncate">{m.caption}</div>
              <div className="text-[11px] muted mt-0.5">{fmtNum(m.views)} views · {m.investor_count} investors</div>
            </div>
            <div className="text-right shrink-0 flex flex-col items-end gap-1">
              <ChangePct value={m.change_24h} className="text-[13px]" />
              <span className="text-[11px] muted aura-num">{fmtAura(m.current_price)}</span>
              {tab === "hunter" && <span className="pill p-lime !text-[9px] !py-0 !px-1.5">🎯 Early Signal</span>}
            </div>
          </Link>
        ))}
      </div>

      <p className="text-[11px] muted text-center mt-8">
        Signals come from velocity, not total views. Be early, not lucky. (Okay, both.)
      </p>
    </div>
  );
}
