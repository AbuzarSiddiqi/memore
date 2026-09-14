"use client";
// MEME BATTLE — Which one moons? Stake ✦5 on your prediction.
import { useState } from "react";
import Link from "next/link";
import { api, fmtAura, useApi, useSession, useToast } from "@/lib/client";
import type { MemeView } from "@/lib/types";
import { HeatPill, InvestSheet } from "@/components/meme";
import { NavIcon } from "@/components/nav";
import { NeoButton, Skeleton } from "@/components/ui";
import { TextPostBody } from "@/components/text-meme";

interface BattleData {
  battle: {
    id: string; category: string;
    meme_a: MemeView; meme_b: MemeView;
    stakes_a: number; stakes_b: number;
    pot: number; my_stake: "a" | "b" | null; stake_cost: number;
  } | null;
  recent: Array<{ id: string; category: string; winner: string | null; winner_caption: string; stakes_a: number; stakes_b: number }>;
}

export default function BattlesPage() {
  const { data, loading, refresh } = useApi<BattleData>("/api/battles");
  const { user, refresh: refreshSession } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState<"a" | "b" | null>(null);

  const stake = async (side: "a" | "b") => {
    if (!data?.battle) return;
    setBusy(side);
    try {
      await api("/api/battles", { json: { battle_id: data.battle.id, side } });
      toast(`✦${data.battle.stake_cost} staked on ${side.toUpperCase()}. Winners split the pot.`, "ok");
      await refreshSession();
      refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  };

  const b = data?.battle;
  const pctA = b && b.stakes_a + b.stakes_b > 0 ? Math.round((b.stakes_a / (b.stakes_a + b.stakes_b)) * 100) : 50;

  return (
    <div className="mt-2 pb-10">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--lime)", color: "#0a0a0a" }}>
          <NavIcon name="swords" size={22} />
        </span>
        <div>
          <h1 className="hd text-[22px] leading-tight">Meme Battle</h1>
          <p className="text-[12.5px] muted">Which one moons?</p>
        </div>
      </div>

      {loading && <Skeleton className="h-96 w-full mt-5" />}

      {b && (
        <>
          <div className="flex justify-center mt-5">
            <span className="pill">⏱ 10 stakes to resolve · live</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5">
            <BattleCard meme={b.meme_a} side="A" staked={b.my_stake === "a"} disabled={!user || busy !== null || !!b.my_stake} onStake={() => stake("a")} onInvest={() => {}} />
            <BattleCard meme={b.meme_b} side="B" staked={b.my_stake === "b"} disabled={!user || busy !== null || !!b.my_stake} onStake={() => stake("b")} onInvest={() => {}} />
          </div>

          {/* total invested split */}
          <div className="mt-7 text-center">
            <div className="text-[12px] font-bold uppercase tracking-widest muted">Total invested</div>
            <div className="mt-2.5 h-3 rounded-full overflow-hidden flex">
              <div style={{ width: `${pctA}%`, background: "var(--lime)" }} />
              <div className="flex-1" style={{ background: "var(--purple)" }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[12px] font-bold">
              <span style={{ color: "var(--lime)" }}>{pctA}% · ✦{fmtAura(b.pot * pctA / 100).slice(2)}</span>
              <span style={{ color: "#b39aff" }}>{100 - pctA}% · ✦{fmtAura(b.pot * (100 - pctA) / 100).slice(2)}</span>
            </div>
          </div>

          <div className="text-center mt-5">
            {b.my_stake ? (
              <p className="text-sm font-bold" style={{ color: "var(--lime)" }}>You staked ✦{b.stake_cost} on {b.my_stake.toUpperCase()}. Winners split the pot.</p>
            ) : user ? (
              <p className="text-sm muted">Pick a side. ✦{b.stake_cost} to play. You can&apos;t stake on your own meme.</p>
            ) : (
              <p className="text-sm muted"><Link href="/login" className="underline font-bold">Log in</Link> to stake.</p>
            )}
          </div>
        </>
      )}

      {!loading && !b && (
        <div className="neo p-8 text-center mt-5">
          <div className="text-4xl mb-2">⚔️</div>
          <p className="hd text-lg">No open battle right now.</p>
          <p className="text-sm muted">Two memes are being chosen. Check back in a minute.</p>
        </div>
      )}

      <h2 className="hd text-lg mt-9 mb-3">Recent results</h2>
      <div className="space-y-2">
        {data?.recent.map((r) => (
          <Link key={r.id} href={`/meme/${r.winner ?? ""}`} className="neo-sm p-3 flex items-center gap-3">
            <span className="pill p-purple">{r.category}</span>
            <span className="text-[13px] font-semibold truncate flex-1">🏆 {r.winner_caption}</span>
            <span className="text-[11px] muted">{r.stakes_a + r.stakes_b} stakes</span>
          </Link>
        ))}
        {data?.recent.length === 0 && <p className="text-sm muted">No battles resolved yet.</p>}
      </div>
    </div>
  );
}

function BattleCard({ meme, side, staked, disabled, onStake }: {
  meme: MemeView; side: "A" | "B"; staked: boolean; disabled: boolean; onStake: () => void; onInvest: () => void;
}) {
  const [investOpen, setInvestOpen] = useState(false);
  return (
    <div>
      <Link href={`/meme/${meme.id}`} className="block">
        <div className="relative rounded-2xl overflow-hidden" style={{ outline: staked ? "3px solid var(--lime)" : "none", outlineOffset: 2 }}>
          {meme.media_type === "text" ? (
            <TextPostBody meme={meme} className="aspect-square overflow-hidden" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meme.thumbnail_url} alt={meme.caption} className="w-full aspect-square object-cover" />
          )}
        </div>
        <p className="text-[12.5px] font-bold mt-2 line-clamp-1 text-center">{meme.caption}</p>
      </Link>
      <div className="flex justify-center mt-1"><HeatPill heat={meme.heat} /></div>
      <button className={`neo-btn sm w-full mt-2.5 ${staked ? "lime" : "purple"}`} disabled={disabled} onClick={onStake}>
        {staked ? "Your pick ✓" : `Invest`}
      </button>
      <button className="neo-btn sm ghost w-full mt-1.5" onClick={() => setInvestOpen(true)}>✦ Add Aura</button>
      <InvestSheet meme={meme} open={investOpen} onClose={() => setInvestOpen(false)} />
    </div>
  );
}
