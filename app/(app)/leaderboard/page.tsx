"use client";
// LEADERBOARD — seasonal competition across aura, IQ, hunters, creators.
import { useState } from "react";
import Link from "next/link";
import { fmtAura, useApi } from "@/lib/client";
import type { PublicUser, SeasonView } from "@/lib/types";
import { Avatar, NeoCard, Skeleton } from "@/components/ui";

const TABS = [
  { id: "top_aura", label: "🏆 TOP AURA" },
  { id: "prediction_iq", label: "🧠 PREDICTION IQ" },
  { id: "best_investors", label: "📈 BEST INVESTORS" },
  { id: "hunters", label: "🏹 HUNTERS" },
  { id: "creators", label: "🎨 TOP CREATORS" },
] as const;

export default function LeaderboardPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("top_aura");
  const { data, loading } = useApi<{
    season: SeasonView;
    top_aura: Row[]; prediction_iq: Row[]; best_investors: Row[]; hunters: Row[]; creators: Row[];
    viral_memes: Array<{ id: string; caption: string; media_url: string; change_24h: number; price: number; creator: string }>;
  }>("/api/leaderboard");

  const rows = data?.[tab] ?? [];

  return (
    <div className="mt-3 pb-10">
      <h1 className="hd text-3xl">LEADERBOARD</h1>

      {data?.season && (
        <div className="neo-lg mt-3 p-4 flex items-center justify-between gap-3" style={{ background: "var(--purple)" }}>
          <div>
            <div className="hd text-[10px] uppercase text-white/70 tracking-widest">SEASON {String(data.season.id).padStart(2, "0")}</div>
            <div className="hd text-xl text-[var(--lime)]" style={{ textShadow: "2px 2px 0 #080808" }}>{data.season.name}</div>
          </div>
          <div className="text-right text-xs text-white/80">
            ends {new Date(data.season.ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}<br />
            <span className="opacity-70">seasonal ranks reset</span>
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-4 overflow-x-auto no-scrollbar" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`chip ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <NeoCard className="mt-4 divide-y-2 divide-[var(--ink)]/10 p-2">
        {loading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 m-2" />)}
        {!loading && rows.length === 0 && <p className="text-sm muted p-4">No champions yet. History is watching.</p>}
        {!loading && rows.map((r) => (
          <Link key={r.user.id} href={`/profile/${r.user.username}`} className="flex items-center gap-3 p-3 hover:bg-black/5 rounded-xl">
            <span className="hd font-bold text-lg w-8 text-center">
              {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`}
            </span>
            <Avatar name={r.user.display_name} bg={r.user.avatar_bg} size={42} />
            <div className="flex-1 min-w-0">
              <div className="hd font-bold text-sm truncate">@{r.user.username}</div>
              <div className="text-[11px] muted">IQ {r.user.prediction_iq} · {r.user.hunter.successful_picks} successful picks · LVL {r.user.level}</div>
            </div>
            <div className="aura-num text-sm sm:text-base">
              {tab === "prediction_iq" ? r.total : fmtAura(r.total)}
            </div>
          </Link>
        ))}
      </NeoCard>

      {tab === "top_aura" && (
        <>
          <h2 className="hd text-xl mt-8 mb-3">🔥 MOST VIRAL MEMES</h2>
          <div className="space-y-2">
            {data?.viral_memes.map((m, i) => (
              <Link key={m.id} href={`/meme/${m.id}`} className="neo-sm p-2.5 flex items-center gap-3 bg-[var(--surface)]">
                <span className="hd font-bold muted w-5">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.media_url} alt="" className="w-10 h-10 rounded-lg object-cover border-2 border-[var(--ink)]" loading="lazy" />
                <span className="text-sm font-semibold truncate flex-1">{m.caption}</span>
                <span className="text-xs hd font-bold">by @{m.creator}</span>
                <span className={`aura-num text-xs ${m.change_24h >= 0 ? "pos" : "neg"}`}>{m.change_24h >= 0 ? "+" : ""}{m.change_24h.toFixed(0)}%</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="text-[11px] muted text-center mt-6">
        Respect comes from Prediction IQ, not just a fat Aura bag. Today / Week / Month views are simulated for the demo.
      </p>
    </div>
  );
}

interface Row { rank: number; user: PublicUser; total: number }
