"use client";
// Meme Detail — full-bleed hero, floating rail, purple Invest. DOUBLE-TAP = ✦1.
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, fmtAura, fmtNum, fmtPct, timeAgo, useApi, useSession, useToast } from "@/lib/client";
import { getCachedMeme, setCachedMeme } from "@/lib/client-cache";
import type { MemeView, PublicUser, PricePoint } from "@/lib/types";
import { AreaChart } from "@/components/charts";
import { Avatar, ChangePct, NeoButton, NeoCard, SectionTitle, Skeleton } from "@/components/ui";
import { CallSheet, CommentSection, DoubleTapZone, HeatPill, InvestSheet, MediaView, ReportDialog, SellSheet, SmartMoneyLine } from "@/components/meme";
import { Spark } from "@/components/brand";
import { Icon } from "@/components/icons";
import { ShareSheet } from "@/components/share";

interface DetailData {
  meme: MemeView;
  comments: Array<{ id: string; content: string; created_at: string; user: { username: string; display_name: string; avatar_bg: string } }>;
  investors: Array<PublicUser & { position_value: number }>;
  remix_ids: string[];
  evolution: MemeView[];
  similar: MemeView[];
  series_1h: PricePoint[]; series_24h: PricePoint[]; series_7d: PricePoint[]; series_30d: PricePoint[]; series_all: PricePoint[];
}

const RANGES = { "1H": "series_1h", "24H": "series_24h", "7D": "series_7d", "30D": "series_30d", ALL: "series_all" } as const;

export default function MemeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [cachedMeme, setCachedMemeState] = useState<MemeView | null>(null);
  const { data, loading, error, refresh } = useApi<DetailData>(`/api/memes/${id}`);
  const { user, refresh: refreshSession } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [range, setRange] = useState<keyof typeof RANGES>("24H");
  const [investOpen, setInvestOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // 1. Instant Cache-First Hydration on mount
  useEffect(() => {
    let active = true;
    (async () => {
      const c = await getCachedMeme(id);
      if (active && c) setCachedMemeState(c);
    })();
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (data?.meme) {
      setCachedMemeState(data.meme);
      void setCachedMeme(id, data.meme);
    }
  }, [data?.meme, id]);

  const m = data?.meme ?? cachedMeme;

  if (loading && !m) {
    return (
      <div className="mt-4 space-y-4">
        <Skeleton className="w-full h-96" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!loading && (error || !m)) {
    return (
      <NeoCard className="mt-10 p-8 text-center">
        <div className="text-4xl mb-2">👻</div>
        <p className="hd text-lg">That meme is no longer available.</p>
        <NeoButton variant="primary" className="mt-4" href="/home">Back to feed</NeoButton>
      </NeoCard>
    );
  }
  if (!m) return null;

  const series = data ? data[RANGES[range]] : undefined;
  const mine = m.my_position;
  const isSaved = saved ?? !!m.is_saved;
  const evolutionRoots = (data?.evolution ?? []).filter((e) => !e.parent_meme_id);
  const remixesOfRoot = (data?.evolution ?? []).filter((e) => e.parent_meme_id === evolutionRoots[0]?.id);
  const grandChildren = (data?.evolution ?? []).filter((e) => e.parent_meme_id && e.parent_meme_id !== evolutionRoots[0]?.id);
  const similar = data?.similar ?? [];
  const investors = data?.investors ?? [];

  const save = async () => {
    if (!user) return toast("Log in first.", "err");
    const r = await api<{ saved: boolean }>(`/api/memes/${m.id}/save`, { method: "POST" });
    setSaved(r.saved);
    toast(r.saved ? "Saved to your watchlist." : "Removed.", "ok");
  };

  const railBtn = "neo-btn icon !bg-black/55 !border-0 backdrop-blur-sm flex-col !w-11 !h-11 gap-0";
  const railNum = "text-[9.5px] font-bold -mt-0.5 text-white";

  return (
    <div className="pb-10">
      {/* full-bleed hero */}
      <div className="-mx-4 -mt-2 relative bg-black">
        <DoubleTapZone meme={m}>
          <MediaView meme={m} eager />
        </DoubleTapZone>

        {/* top controls */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
          <button onClick={() => router.back()} className="neo-btn icon !bg-black/55 !border-0 backdrop-blur-sm" aria-label="Back">←</button>
          <div className="flex gap-2">
            <button className={railBtn} onClick={() => setCallOpen(true)} aria-label="Make a call"><Icon name="megaphone" size={16} strokeWidth={2.2} /></button>
            <button className={railBtn} onClick={() => setReportOpen(true)} aria-label="Report"><Icon name="flag" size={16} strokeWidth={2.2} /></button>
          </div>
        </div>

        {/* right rail */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2.5 items-center">
          <button className={railBtn} onClick={() => setInvestOpen(true)} aria-label="Invest">
            <Spark size={17} color="#C8FF3D" />
            <span className={railNum} style={{ color: "#C8FF3D" }}>{fmtNum(m.total_invested)}</span>
          </button>
          <a href="#comments" className={railBtn} aria-label="Comments">
            <Icon name="comment" size={16} strokeWidth={2.2} />
            <span className={railNum}>{m.comment_count}</span>
          </a>
          <button className={railBtn} onClick={() => setShareOpen(true)} aria-label="Share">
            <Icon name="share" size={16} strokeWidth={2.2} />
            <span className={railNum}>{m.saves}</span>
          </button>
          <button className={railBtn} onClick={save} aria-label={isSaved ? "Unsave" : "Save"}>
            <Icon name="star" size={16} strokeWidth={2.2} filled={isSaved} style={isSaved ? { color: "#FFD23F" } : undefined} />
          </button>
        </div>

        {/* creator strip over media bottom */}
        <div className="absolute left-3 right-3 bottom-3 z-10 flex items-center gap-2.5 bg-black/45 backdrop-blur-sm rounded-2xl px-3 py-2.5">
          <Avatar name={m.creator.display_name} bg={m.creator.avatar_bg} username={m.creator.username} size={34} />
          <div className="min-w-0 flex-1">
            <Link href={`/profile/${m.creator.username}`} className="font-bold text-[13px] text-white block truncate hover:underline">
              {m.creator.display_name.toLowerCase().replace(/\s/g, "")}
            </Link>
            <div className="text-[10.5px] text-white/60">{timeAgo(m.created_at)} · {m.investor_count} investors</div>
          </div>
          {user?.id !== m.creator.id && <FollowInline username={m.creator.username} initial={!!m.creator.is_following} />}
        </div>
      </div>

      {/* caption + hashtags */}
      <p className="text-[15px] font-medium mt-4">{m.caption}</p>
      {m.description && <p className="text-[13px] muted mt-1">{m.description}</p>}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className="pill">#{m.category}</span>
        <span className="pill">#memore</span>
        <HeatPill heat={m.heat} />
        {m.label && <span className="pill">{m.label}</span>}
        {m.my_call && (
          <span className={`pill ${m.my_call.status === "won" ? "p-lime" : m.my_call.status === "lost" ? "p-coral" : "p-yellow"}`}>
            {m.my_call.target}{m.my_call.status === "won" ? " ✓" : m.my_call.status === "lost" ? " ✗" : ""}
          </span>
        )}
      </div>

      {/* value + actions */}
      <div className="flex items-center justify-between gap-3 mt-4">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-widest muted">Current value</div>
          <div className="flex items-baseline gap-2.5">
            <span className="aura-num text-[34px]">{fmtAura(m.current_price)}</span>
            <ChangePct value={m.change_24h} className="text-[14px]" />
          </div>
          <div className="text-[11.5px] muted mt-0.5">launched at {fmtAura(m.initial_price)} · all-time <span className={m.change_all >= 0 ? "pos" : "neg"}>{fmtPct(m.change_all)}</span></div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <NeoButton variant="purple" size="big" onClick={() => setInvestOpen(true)}>✦ Invest</NeoButton>
          {mine && <NeoButton variant="coral" size="sm" onClick={() => setSellOpen(true)}>Sell position</NeoButton>}
        </div>
      </div>

      {mine && (
        <div className="neo-sm px-3 py-2.5 mt-3 flex items-center justify-between" style={{ background: "var(--lime)", color: "#0a0a0a", borderColor: "var(--lime)" }}>
          <span className="hd font-bold text-xs">YOUR POSITION · {mine.quantity.toFixed(3)}u @ {fmtAura(mine.avg_entry_price)}</span>
          <span className="aura-num text-sm">{fmtAura(mine.current_value)} ({fmtPct(mine.pnl_pct)})</span>
        </div>
      )}

      <div className="mt-3"><SmartMoneyLine meme={m} /></div>

      {/* chart */}
      <div className="flex items-center justify-between gap-2 mt-7 mb-3">
        <h2 className="hd text-lg">Aura chart</h2>
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(RANGES) as Array<keyof typeof RANGES>).map((r) => (
            <button key={r} className={`chip !px-3 !py-1.5 !text-[11px] ${range === r ? "active" : ""}`} onClick={() => setRange(r)} aria-pressed={range === r}>{r}</button>
          ))}
        </div>
      </div>
      <NeoCard className="p-4">
        {series ? (
          <AreaChart points={series} up={m.change_all >= 0} />
        ) : (
          <div className="h-44 flex items-center justify-center text-xs muted hd">LOADING AURA CHART…</div>
        )}
      </NeoCard>

      {/* stats row */}
      <div className="grid grid-cols-4 gap-2 mt-3">
        <MiniStat label="Invested" value={fmtAura(m.total_invested)} />
        <MiniStat label="24h vol" value={fmtAura(m.volume_24h)} />
        <MiniStat label="ATH" value={fmtAura(m.all_time_high)} />
        <MiniStat label="Views" value={fmtNum(m.views)} />
      </div>

      {/* dna */}
      <SectionTitle right={<span className="text-[11px] muted">gameplay signal</span>}>Meme DNA</SectionTitle>
      <NeoCard className="p-4 space-y-3">
        {([
          ["Humor", m.dna.humor, "var(--coral)"],
          ["Chaos", m.dna.chaos, "var(--purple)"],
          ["Relatability", m.dna.relatability, "var(--blue)"],
          ["Brainrot", m.dna.brainrot, "var(--yellow)"],
          ["Wholesome", m.dna.wholesome, "var(--pos)"],
          ["Absurdity", m.dna.absurdity, "#FF7BAC"],
        ] as const).map(([label, v, color]) => (
          <div key={label} className="dna-row items-center">
            <span className="text-[13px] font-semibold">{label}</span>
            <span className="aura-num text-[13px]">{v}</span>
            <div className="dna-bar progress-track">
              <div className="progress-fill" style={{ width: `${v}%`, background: color }} />
            </div>
          </div>
        ))}
      </NeoCard>

      {/* similar */}
      {similar.length > 0 && (
        <>
          <SectionTitle>DNA matches</SectionTitle>
          <div className="grid grid-cols-3 gap-2.5">
            {similar.map((s) => (
              <Link key={s.id} href={`/meme/${s.id}`} className="neo-sm p-2 text-center hover:border-[var(--lime)] transition-colors">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.thumbnail_url} alt="" className="w-full h-20 object-cover rounded-lg" loading="lazy" />
                <div className="aura-num text-[11px] mt-1.5" style={{ color: "var(--lime)" }}>{s.dna_match}% match</div>
                <div className="text-[10px] truncate muted">{s.caption}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* evolution */}
      {(data?.evolution?.length ?? 0) > 1 && (
        <>
          <SectionTitle>Family tree</SectionTitle>
          <NeoCard className="p-5">
            <div className="flex flex-col items-center gap-4">
              {evolutionRoots.map((root) => (
                <div key={root.id} className="w-full flex flex-col items-center gap-4">
                  <EvolutionNode meme={root} tag="Original" />
                  <div className="text-xl muted" aria-hidden>↓</div>
                  <div className="flex flex-wrap justify-center gap-3">
                    {remixesOfRoot.map((r) => <EvolutionNode key={r.id} meme={r} tag="Remix" />)}
                  </div>
                  {grandChildren.length > 0 && (
                    <>
                      <div className="text-xl muted" aria-hidden>↓</div>
                      <div className="flex flex-wrap justify-center gap-3">
                        {grandChildren.map((r) => <EvolutionNode key={r.id} meme={r} tag="Remix" />)}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </NeoCard>
        </>
      )}

      {/* investors */}
      {investors.length > 0 && (
        <>
          <SectionTitle>Top investors</SectionTitle>
          <NeoCard className="p-4">
            <div className="flex flex-wrap gap-2.5">
              {investors.map((inv) => (
                <Link key={inv.id} href={`/profile/${inv.username}`} className="flex items-center gap-2 neo-sm px-2.5 py-1.5">
                  <Avatar name={inv.display_name} bg={inv.avatar_bg} size={24} />
                  <span className="text-[11px] hd font-bold">{inv.display_name.toLowerCase().replace(/\s/g, "")}</span>
                  <span className="text-[10px] aura-num muted">{fmtAura(inv.position_value)}</span>
                </Link>
              ))}
            </div>
          </NeoCard>
        </>
      )}

      {/* comments */}
      <SectionTitle right={<span className="text-xs muted">{data?.comments?.length ?? m.comment_count}</span>}>Comments</SectionTitle>
      {data?.comments ? (
        <CommentSection memeId={m.id} initial={data.comments} />
      ) : (
        <div className="py-8 text-center hd muted text-xs">LOADING COMMENTS…</div>
      )}

      <InvestSheet meme={m} open={investOpen} onClose={() => setInvestOpen(false)} onDone={() => { refresh(); refreshSession(); }} />
      <SellSheet meme={m} open={sellOpen} onClose={() => setSellOpen(false)} onDone={() => { refresh(); refreshSession(); }} />
      <CallSheet meme={m} open={callOpen} onClose={() => { setCallOpen(false); refresh(); }} />
      <ReportDialog memeId={m.id} open={reportOpen} onClose={() => setReportOpen(false)} />
      {shareOpen && <ShareSheet meme={m} open onClose={() => setShareOpen(false)} />}
    </div>
  );
}

function FollowInline({ username, initial }: { username: string; initial: boolean }) {
  const { user, refresh } = useSession();
  const toast = useToast();
  const [following, setFollowing] = useState<boolean | null>(initial);
  const follow = async () => {
    if (!user) return toast("Log in first.", "err");
    const r = await api<{ following: boolean }>(`/api/users/${username}/follow`, { method: "POST" });
    setFollowing(r.following);
    refresh();
  };
  if (user?.username === username) return null;
  return (
    <button onClick={follow} className={`neo-btn sm ${following ? "ghost" : "lime"}`} style={{ padding: "5px 14px", fontSize: 12 }}>
      {following ? "Following" : "Follow"}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <NeoCard className="p-2.5 text-center">
      <div className="text-[9px] font-extrabold uppercase tracking-wide muted">{label}</div>
      <div className="aura-num text-[13.5px] mt-0.5">{value}</div>
    </NeoCard>
  );
}

function EvolutionNode({ meme, tag }: { meme: MemeView; tag: string }) {
  return (
    <Link href={`/meme/${meme.id}`} className="neo-sm p-2 w-28 text-center hover:border-[var(--lime)] transition-colors">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={meme.thumbnail_url} alt="" className="w-full h-20 object-cover rounded-lg" loading="lazy" />
      <div className="text-[9px] hd font-bold mt-1 muted uppercase">{tag}</div>
      <div className="text-[10.5px] font-bold truncate">{meme.caption}</div>
      <div className="aura-num text-[11px]">{fmtAura(meme.current_price)}</div>
    </Link>
  );
}
