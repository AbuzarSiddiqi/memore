"use client";
// THE GRAVEYARD — where failed memes rest in pieces.
import Link from "next/link";
import { fmtAura, useApi } from "@/lib/client";
import { ChangePct, EmptyState, NeoCard, Skeleton } from "@/components/ui";

interface GraveMeme {
  id: string; caption: string; thumbnail_url: string; current_price: number; all_time_high: number;
  epitaph: string; creator_username: string; drawdown_pct: number; change_24h: number; investor_count: number;
}

export default function GraveyardPage() {
  const { data, loading } = useApi<{ memes: GraveMeme[] }>("/api/graveyard");

  return (
    <div className="mt-3 pb-10">
      <div className="neo-lg p-6 text-center" style={{ background: "var(--ink)", color: "var(--surface)" }}>
        <div className="text-5xl mb-2 anim-floaty">🪦</div>
        <h1 className="hd text-3xl">THE GRAVEYARD</h1>
        <p className="text-sm mt-2 opacity-80 max-w-sm mx-auto">
          Here lie the memes that peaked too soon. Visit them. Learn from them. Do not invest like them.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        {data?.memes.length === 0 && (
          <EmptyState emoji="🌤️" title="The graveyard is empty." message="Every meme is alive and kicking. Enjoy it while it lasts." />
        )}
        {data?.memes.map((m) => (
          <Link key={m.id} href={`/meme/${m.id}`} className="block">
            <NeoCard className="p-3 flex items-center gap-3" style={{ background: "var(--surface)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.thumbnail_url}
                alt=""
                className="w-20 h-20 rounded-xl object-cover border-[3px] border-[var(--ink)]"
                style={{ filter: "grayscale(0.85) contrast(1.05)" }}
                loading="lazy"
              />
              <div className="flex-1 min-w-0">
                <div className="hd font-bold text-sm line-clamp-1">🪦 {m.caption}</div>
                <p className="text-xs italic muted mt-0.5 line-clamp-1">&ldquo;{m.epitaph}&rdquo;</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="pill !text-[10px] !py-0.5">PEAK {fmtAura(m.all_time_high)}</span>
                  <span className="pill p-black !text-[10px] !py-0.5">NOW {fmtAura(m.current_price)}</span>
                  <span className="pill p-coral !text-[10px] !py-0.5">−{m.drawdown_pct}%</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <ChangePct value={m.change_24h} className="text-xs" />
                <div className="text-[10px] muted mt-1">@{m.creator_username}</div>
              </div>
            </NeoCard>
          </Link>
        ))}
      </div>

      <p className="text-[11px] muted text-center mt-8">
        Losing is part of the game. The graveyard keeps it funny.
      </p>
    </div>
  );
}
