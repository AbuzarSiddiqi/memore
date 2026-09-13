"use client";
// Notification center — grouped, iconed, anti-spam by design.
import { useEffect } from "react";
import Link from "next/link";
import { api, timeAgo, useApi, useSession } from "@/lib/client";
import type { AuraNotification } from "@/lib/types";
import { EmptyState, NeoCard, Skeleton } from "@/components/ui";

const ICONS: Record<string, string> = {
  invest_made: "✦", pick_up: "🚀", pick_down: "📉", trending: "🔥",
  remix: "🔄", follow: "👤", battle_win: "⚔️", achievement: "🏆", comment: "💬",
};

export default function NotificationsPage() {
  const { user } = useSession();
  const { data, loading, refresh } = useApi<{ notifications: AuraNotification[]; unread: number }>("/api/notifications");

  useEffect(() => {
    if (data && data.unread > 0) {
      api("/api/notifications", { method: "POST", json: {} }).then(() => refresh());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.unread]);

  if (!user) return null;

  return (
    <div className="mt-3 pb-10">
      <h1 className="hd text-3xl">NOTIFICATIONS</h1>
      <p className="text-sm muted mt-1">Your picks, your people, your glory.</p>

      <div className="mt-4 space-y-2">
        {loading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        {data?.notifications.length === 0 && (
          <EmptyState emoji="📭" title="Nothing yet." message="Invest in a meme and the market will start talking to you." />
        )}
        {data?.notifications.map((n) => {
          const inner = (
            <NeoCard className={`p-3.5 flex items-start gap-3 ${!n.read ? "" : "opacity-70"}`} style={!n.read ? { background: "var(--yellow)" } : undefined}>
              <span className="text-2xl" aria-hidden>{ICONS[n.type] ?? "✦"}</span>
              <div className="flex-1 min-w-0">
                <div className="hd font-bold text-sm">{n.title}</div>
                <p className="text-sm mt-0.5">{n.message}</p>
                <div className="text-[11px] muted mt-1">{timeAgo(n.created_at)}</div>
              </div>
              {!n.read && <span className="w-2.5 h-2.5 rounded-full bg-[var(--coral)] border-2 border-[var(--ink)] mt-1.5" aria-label="unread" />}
            </NeoCard>
          );
          return n.meme_id ? <Link key={n.id} href={`/meme/${n.meme_id}`} className="block">{inner}</Link> : <div key={n.id}>{inner}</div>;
        })}
      </div>
    </div>
  );
}
