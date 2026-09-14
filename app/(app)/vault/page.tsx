"use client";
// VAULT — Your Aura. Holdings as rows with red Sell pills, per brand reference.
// Selling plays a "fly to the card" celebration: the sold value arcs from the
// sheet into the Available pill, which pops as the number lands.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, fmtAura, fmtPct, timeAgo, useApi, useSession, useToast } from "@/lib/client";
import type { MemeView } from "@/lib/types";
import { ChangePct, EmptyState, NeoCard, Skeleton } from "@/components/ui";
import { InvestSheet, SellSheet } from "@/components/meme";
import { TextThumb } from "@/components/text-meme";

interface VaultData {
  balance: number;
  invested_value: number;
  invested_cost: number;
  total_aura: number;
  today_pnl: number;
  overall_return_pct: number;
  win_rate: number | null;
  closed_trades: number;
  realized_pnl: number;
  holdings: Array<{
    meme: MemeView; quantity: number; invested_amount: number; avg_entry_price: number;
    current_value: number; pnl: number; pnl_pct: number; day_pnl: number; created_at: string;
  }>;
  transactions: Array<{ id: string; type: "buy" | "sell"; total_value: number; realized_pnl: number | null; created_at: string; meme: MemeView }>;
}

const TABS = ["Holdings", "History", "Achievements"] as const;

interface Fly { id: number; value: number; x: number; y: number; dx: number; dy: number }

/** The sold value leaping up from the sell button, falling onto the Available
 * pill, bouncing on it and merging in as the number pops (impact at ~55%). */
function AuraFlyer({ fly, onImpact, onLand }: { fly: Fly; onImpact: () => void; onLand: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const cbRef = useRef({ onImpact, onLand });
  cbRef.current = { onImpact, onLand };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const DUR = 950;
    const apexY = fly.dy - 96; // leap 96px above the pill before dropping onto it
    const anim = el.animate([
      { transform: "translate(-50%, -50%) scale(0.7) rotate(0deg)", opacity: 0.9, easing: "cubic-bezier(0.2, 0.75, 0.35, 1)" },
      { transform: `translate(calc(-50% + ${fly.dx * 0.18}px), calc(-50% + ${apexY}px)) scale(1.22) rotate(-7deg)`, opacity: 1, offset: 0.32, easing: "cubic-bezier(0.55, 0, 0.85, 0.45)" },
      { transform: `translate(calc(-50% + ${fly.dx}px), calc(-50% + ${fly.dy}px)) scale(0.8) rotate(3deg)`, opacity: 1, offset: 0.55, easing: "cubic-bezier(0.2, 0.6, 0.35, 1)" },
      { transform: `translate(calc(-50% + ${fly.dx}px), calc(-50% + ${fly.dy - 30}px)) scale(0.72) rotate(-2deg)`, opacity: 1, offset: 0.72, easing: "cubic-bezier(0.5, 0, 0.8, 0.5)" },
      { transform: `translate(calc(-50% + ${fly.dx}px), calc(-50% + ${fly.dy}px)) scale(0.4) rotate(0deg)`, opacity: 0.95 },
    ], { duration: DUR, fill: "forwards" });
    const impactT = setTimeout(() => cbRef.current.onImpact(), DUR * 0.55);
    anim.onfinish = () => cbRef.current.onLand();
    return () => { clearTimeout(impactT); anim.onfinish = null; anim.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly.id]);
  return (
    <span ref={ref} className="aura-fly aura-num" style={{ left: fly.x, top: fly.y }} aria-hidden>
      ✦ {fly.value}
    </span>
  );
}

export default function VaultPage() {
  const { data, loading, error, refresh } = useApi<VaultData>("/api/vault");
  const { user, refresh: refreshSession } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Holdings");
  const [sellMeme, setSellMeme] = useState<MemeView | null>(null);
  const toast = useToast();
  // fly-to-card celebration state
  const availableRef = useRef<HTMLSpanElement>(null);
  const [fly, setFly] = useState<Fly | null>(null);
  // the whole purple card holds its pre-sell numbers until the value lands
  const [frozenCard, setFrozenCard] = useState<{ balance: number; invested: number; total: number } | null>(null);
  const [balancePop, setBalancePop] = useState(false);

  // Keep Available Aura honest: refetch whenever the tab regains focus.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const handleSold = (r: { returned: number; pnl: number }, from: { x: number; y: number }) => {
    if (!data) return;
    const pill = availableRef.current?.getBoundingClientRect();
    const to = pill
      ? { x: pill.left + pill.width / 2, y: pill.top + pill.height / 2 }
      : { x: window.innerWidth / 2, y: 130 };
    setFrozenCard({ balance: data.balance, invested: data.invested_value, total: data.total_aura });
    setFly({ id: Date.now(), value: r.returned, x: from.x, y: from.y, dx: to.x - from.x, dy: to.y - from.y });
    setSellMeme(null); // sheet slides away while the value flies
    refresh();
    void refreshSession();
  };

  const handleFlyImpact = () => {
    // the chip just hit the pill: reveal the new numbers with the collision pop
    setFrozenCard(null);
    setBalancePop(true);
    setTimeout(() => setBalancePop(false), 750);
  };

  const handleFlyLand = () => {
    setFly(null);
  };

  if (error) return <p className="neg text-sm mt-10 text-center">{error}</p>;
  if (loading || !data) {
    return (
      <div className="mt-4 space-y-4">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const sellable = data.holdings.filter((h) => h.pnl_pct < 0);
  const shown = frozenCard ?? { balance: data.balance, invested: data.invested_value, total: data.total_aura };

  return (
    <div className="mt-2 pb-10">
      <style jsx global>{`
        @keyframes vaultPillPop {
          0% { transform: scale(1); }
          35% { transform: scale(1.22); box-shadow: 0 0 0 5px rgba(200, 255, 61, 0.35), 0 0 26px rgba(200, 255, 61, 0.65); }
          70% { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
        @keyframes vaultLandRing {
          0% { opacity: 0.9; transform: translate(-50%, -50%) scale(0.3); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.9); }
        }
        .aura-fly {
          position: fixed; z-index: 90; pointer-events: none;
          display: inline-flex; align-items: center; justify-content: center;
          padding: 7px 13px; border-radius: 999px;
          background: linear-gradient(160deg, #E9FF7A 0%, #C8FF3D 60%, #A3D621 100%);
          border: 1.5px solid rgba(10, 10, 10, 0.65);
          color: #0a0a0a; font-weight: 800; font-size: 14px; white-space: nowrap;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45), 0 0 18px rgba(168, 85, 247, 0.45);
        }
        .vault-pop { display: inline-flex; animation: vaultPillPop 0.75s cubic-bezier(0.3, 0.7, 0.3, 1.2); }
        .vault-ring {
          position: absolute; left: 50%; top: 50%; width: 64px; height: 64px;
          border-radius: 999px; border: 1.5px solid #C8FF3D; pointer-events: none;
          animation: vaultLandRing 0.6s ease-out forwards;
        }
      `}</style>
      {fly && <AuraFlyer fly={fly} onImpact={handleFlyImpact} onLand={handleFlyLand} />}
      {/* purple aura card */}
      <div className="rounded-[24px] p-5" style={{ background: "var(--purple)" }}>
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Your Aura</div>
        <div className="aura-num text-[44px] leading-none mt-1" style={{ color: "var(--lime)" }}>✦ {shown.total % 1 === 0 ? shown.total.toLocaleString() : shown.total.toFixed(1)}</div>
        <div className="flex gap-2 mt-3.5 flex-wrap">
          <span ref={availableRef} className={`pill relative ${balancePop ? "vault-pop" : ""}`} style={{ background: "rgba(10,10,10,0.35)", borderColor: "transparent", color: "#fff" }}>
            {balancePop && <span className="vault-ring" aria-hidden />}
            Available ✦ {fmtAura(shown.balance).slice(2)}
          </span>
          <span className="pill" style={{ background: "rgba(10,10,10,0.35)", borderColor: "transparent", color: "#fff" }}>In positions ✦ {fmtAura(shown.invested).slice(2)}</span>
          <span className={`pill ${data.today_pnl >= 0 ? "p-lime" : "p-coral"}`}>{data.today_pnl >= 0 ? "+" : ""}{fmtAura(data.today_pnl)} today</span>
        </div>
      </div>

      {/* stat tiles */}
      <div className="grid grid-cols-3 gap-2.5 mt-3">
        <div className="rounded-2xl p-3" style={{ background: "var(--lime)", color: "#0a0a0a" }}>
          <div className="flex items-center gap-1 text-[10px] font-extrabold uppercase">🧠 Prediction IQ</div>
          <div className="aura-num text-[26px] leading-tight">{user?.prediction_iq ?? "—"}</div>
          <div className="flex items-end gap-[3px] h-5 mt-1" aria-hidden>
            {[40, 65, 50, 80, 62, 90].map((h, i) => (
              <span key={i} className="w-[5px] rounded-sm bg-black/70" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <NeoCard className="p-3">
          <div className="text-[10px] font-extrabold uppercase muted">Global rank</div>
          <div className="aura-num text-[22px] mt-1">#{data.closed_trades + 257}</div>
        </NeoCard>
        <NeoCard className="p-3">
          <div className="text-[10px] font-extrabold uppercase muted">Win rate</div>
          <div className="aura-num text-[22px] mt-1">{data.win_rate != null ? `${data.win_rate.toFixed(0)}%` : "—"}</div>
        </NeoCard>
        <NeoCard className="p-3">
          <div className="text-[10px] font-extrabold uppercase muted">Early finds</div>
          <div className="aura-num text-[22px] mt-1">{user?.hunter.early_discoveries ?? 0}</div>
        </NeoCard>
        <NeoCard className="p-3">
          <div className="text-[10px] font-extrabold uppercase muted">Total P/L</div>
          <div className={`aura-num text-[22px] mt-1 ${data.realized_pnl >= 0 ? "pos" : "neg"}`}>{data.realized_pnl >= 0 ? "+" : ""}{fmtAura(data.realized_pnl).slice(2)}</div>
        </NeoCard>
        <NeoCard className="p-3">
          <div className="text-[10px] font-extrabold uppercase muted">Return</div>
          <div className={`aura-num text-[22px] mt-1 ${data.overall_return_pct >= 0 ? "pos" : "neg"}`}>{fmtPct(data.overall_return_pct, 0)}</div>
        </NeoCard>
      </div>

      {/* tabs */}
      <div className="flex gap-2 mt-6 overflow-x-auto no-scrollbar" role="tablist" aria-label="Vault sections">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`chip ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "Holdings" && (
          data.holdings.length === 0 ? (
            <EmptyState emoji="🔐" title="Your Vault is empty." message="Find a meme you believe in." action={<Link href="/market" className="neo-btn primary">Explore market</Link>} />
          ) : (
            <div className="space-y-2.5">
              {data.holdings.map((h) => (
                <NeoCard key={h.meme.id} className="p-2.5 flex items-center gap-3">
                  <Link href={`/meme/${h.meme.id}`}>
                    {h.meme.media_type === "text"
                      ? <TextThumb meme={h.meme} className="w-12 h-12" />
                      : h.meme.thumbnail_url?.match(/\.(mp4|webm|mov|m4v)(\?.*)?$/i)
                        ? <video src={`${h.meme.thumbnail_url}#t=0.001`} muted playsInline preload="metadata" className="w-12 h-12 rounded-xl object-cover pointer-events-none" />
                        : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.meme.thumbnail_url} alt="" className="w-12 h-12 rounded-xl object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/meme/${h.meme.id}`} className="font-bold text-[13.5px] line-clamp-1 hover:underline">{h.meme.caption}</Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <ChangePct value={h.pnl_pct} className="text-[13px]" />
                      <span className="text-[11px] muted truncate">{fmtAura(h.current_value)} · {h.quantity.toFixed(2)}u</span>
                    </div>
                  </div>
                  <button
                    className="neo-btn sm coral"
                    onClick={() => setSellMeme(h.meme)}
                  >
                    Sell
                  </button>
                </NeoCard>
              ))}
              {sellable.length === 0 && data.holdings.length > 0 && (
                <p className="text-[11px] muted text-center">All green. Undisturbed. Keep holding.</p>
              )}
            </div>
          )
        )}

        {tab === "History" && (
          data.transactions.length === 0 ? (
            <EmptyState emoji="🧾" title="No transactions yet." message="Double-tap a meme to start." />
          ) : (
            <div className="space-y-1.5">
              {data.transactions.map((t) => (
                <NeoCard key={t.id} className="p-2.5 flex items-center gap-3">
                  <span className={`pill ${t.type === "buy" ? "p-blue" : "p-coral"}`}>{t.type.toUpperCase()}</span>
                  <Link href={`/meme/${t.meme.id}`} className="text-[13px] font-semibold truncate flex-1 hover:underline">{t.meme.caption}</Link>
                  <div className="text-right shrink-0">
                    <div className={`aura-num text-[13px] ${t.realized_pnl != null ? (t.realized_pnl >= 0 ? "pos" : "neg") : ""}`}>
                      {t.type === "buy" ? "−" : "+"}{fmtAura(t.total_value).slice(2)}
                    </div>
                    <div className="text-[10px] muted">{timeAgo(t.created_at)}</div>
                  </div>
                </NeoCard>
              ))}
            </div>
          )
        )}

        {tab === "Achievements" && <AchievementsMini username={user?.username ?? null} />}
      </div>

      {sellMeme && (
        <SellSheet meme={sellMeme} open={!!sellMeme} onClose={() => setSellMeme(null)} onDone={refresh} onSold={handleSold} />
      )}
    </div>
  );
}

function AchievementsMini({ username }: { username: string | null }) {
  const { data } = useApi<{ achievements: Array<{ achievement: { id: string; name: string; description: string; icon: string }; unlocked_at: string }> }>(
    username ? `/api/users/${username}` : null
  );
  if (!data?.achievements.length) return <EmptyState emoji="🏆" title="No achievements yet." message="Go be great." />;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {data.achievements.map((a) => (
        <NeoCard key={a.achievement.id} className="p-3.5 text-center">
          <div className="text-3xl">{a.achievement.icon}</div>
          <div className="hd font-bold text-[13px] mt-1">{a.achievement.name}</div>
          <div className="text-[11px] muted mt-0.5 leading-snug">{a.achievement.description}</div>
        </NeoCard>
      ))}
    </div>
  );
}
