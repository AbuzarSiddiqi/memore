"use client";
// Admin dashboard — protected by role, demo moderation surface.
import { useState } from "react";
import { api, fmtAura, timeAgo, useApi, useToast } from "@/lib/client";
import type { MemeView, PublicUser } from "@/lib/types";
import { EmptyState, NeoButton, NeoCard, Skeleton, StatBox } from "@/components/ui";

interface AdminData {
  stats: { users: number; memes: number; transactions: number; open_reports: number };
  users: PublicUser[];
  memes: MemeView[];
  reports: Array<{ id: string; target_type: string; target_id: string; category: string; note: string; status: string; created_at: string; reporter: string }>;
}

export default function AdminPage() {
  const { data, loading, error, refresh } = useApi<AdminData>("/api/admin");
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (action: string, id: string) => {
    setBusy(action + id);
    try {
      await api("/api/admin", { json: { action, id } });
      toast("Done.", "ok");
      refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return <EmptyState emoji="🛡️" title="Admins only." message="This dashboard is protected." action={<NeoButton variant="primary" href="/home">BACK HOME</NeoButton>} />;
  }
  if (loading || !data) return <div className="mt-6 space-y-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>;

  return (
    <div className="mt-3 pb-10">
      <h1 className="hd text-3xl">🛡️ ADMIN</h1>
      <p className="text-sm muted mt-1">Keep the market weird, but not too weird.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
        <StatBox label="Users" value={data.stats.users} />
        <StatBox label="Live memes" value={data.stats.memes} />
        <StatBox label="Transactions" value={data.stats.transactions} />
        <StatBox label="Open reports" value={data.stats.open_reports} accent={data.stats.open_reports > 0 ? "var(--coral)" : undefined} />
      </div>

      <h2 className="hd text-xl mt-8 mb-3">🚩 REPORTS</h2>
      <div className="space-y-2">
        {data.reports.length === 0 && <p className="text-sm muted">Queue is clear. Suspicious.</p>}
        {data.reports.map((r) => (
          <NeoCard key={r.id} className="p-3 flex items-center gap-3 flex-wrap">
            <span className={`pill ${r.status === "open" ? "p-coral" : "p-lime"}`}>{r.status.toUpperCase()}</span>
            <span className="pill p-black !text-[10px]">{r.category}</span>
            <span className="text-sm flex-1 min-w-40">{r.note || <em>no note</em>}</span>
            <span className="text-[11px] muted">by @{r.reporter} · {timeAgo(r.created_at)}</span>
            {r.status === "open" && r.target_type === "meme" && (
              <NeoButton size="sm" variant="coral" disabled={busy === "remove_meme" + r.target_id} onClick={() => act("remove_meme", r.target_id)}>REMOVE MEME</NeoButton>
            )}
            {r.status === "open" && (
              <NeoButton size="sm" variant="ghost" disabled={busy === "resolve_report" + r.id} onClick={() => act("resolve_report", r.id)}>RESOLVE</NeoButton>
            )}
          </NeoCard>
        ))}
      </div>

      <h2 className="hd text-xl mt-8 mb-3">MEMES</h2>
      <NeoCard className="p-2 divide-y-2 divide-[var(--ink)]/10">
        {data.memes.slice(0, 20).map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover border-2 border-[var(--ink)]" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{m.caption}</div>
              <div className="text-[11px] muted">@{m.creator.username} · {fmtAura(m.current_price)} · {m.status}</div>
            </div>
            {m.status === "live" && (
              <NeoButton size="sm" variant="coral" disabled={busy === "remove_meme" + m.id} onClick={() => act("remove_meme", m.id)}>REMOVE</NeoButton>
            )}
          </div>
        ))}
      </NeoCard>

      <h2 className="hd text-xl mt-8 mb-3">USERS</h2>
      <NeoCard className="p-2 divide-y-2 divide-[var(--ink)]/10">
        {data.users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-2.5">
            <span className="rounded-full border-2 border-[var(--ink)] w-8 h-8" style={{ background: u.avatar_bg }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">@{u.username} {u.suspended && <span className="pill p-coral !text-[9px] !py-0">SUSPENDED</span>}</div>
              <div className="text-[11px] muted">{fmtAura(u.aura_balance)} · {u.meme_count} memes</div>
            </div>
            {u.role !== "admin" && (
              <NeoButton size="sm" variant={u.suspended ? "lime" : "coral"} disabled={busy === "suspend_user" + u.id} onClick={() => act("suspend_user", u.id)}>
                {u.suspended ? "UNSUSPEND" : "SUSPEND"}
              </NeoButton>
            )}
          </div>
        ))}
      </NeoCard>
    </div>
  );
}
