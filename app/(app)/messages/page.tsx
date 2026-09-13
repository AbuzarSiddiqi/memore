"use client";
// MESSAGES — MEMORE's 24-hour disappearing conversations. Every chat here dies
// 24 hours after it started; the server is the only clock that matters.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, useApi, useSession } from "@/lib/client";
import type { ChatListItem } from "@/lib/types";
import { Avatar, EmptyState, NeoButton, Skeleton } from "@/components/ui";
import { ChatClock, ContactsSheet } from "@/components/chat";
import { Icon } from "@/components/icons";
import { Spark } from "@/components/brand";

function previewIcon(type: ChatListItem["preview_type"]): string {
  return type === "image" ? "📷 " : type === "video" ? "🎬 " : type === "post" ? "" : "";
}

export default function MessagesPage() {
  const { user } = useSession();
  const { data, loading, refresh } = useApi<{ chats: ChatListItem[] }>("/api/chats");
  const router = useRouter();
  const [picker, setPicker] = useState(false);
  const [, force] = useState(0);

  // gentle polling: inbox refreshes every 8s while open
  useEffect(() => {
    const t = setInterval(() => refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  // local clock for the remaining-time labels (server stays authoritative)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const chats = data?.chats ?? [];
  const startChat = async (username: string) => {
    const r = await api<{ id: string }>("/api/chats", { json: { username } });
    setPicker(false);
    router.push(`/messages/${r.id}`);
  };

  return (
    <div className="mt-2 pb-24">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="hd text-[24px]">MESSAGES</h1>
        <span className="pill p-black !text-[10px] inline-flex items-center gap-1">
          <Spark size={10} color="#C8FF3D" /> ALL CHATS EXPIRE IN 24H
        </span>
      </div>

      {loading && chats.length === 0 && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {chats.map((c) => {
        const remaining = Math.max(0, new Date(c.expires_at).getTime() - Date.now());
        if (remaining <= 0) return null; // server already killed it; skip the corpse
        return (
          <Link key={c.id} href={`/messages/${c.id}`} className="block mb-2.5">
            <div className={`relative rounded-[20px] p-3.5 flex items-center gap-3 bg-[#131313] border border-[#232323] ${c.unread ? "border-[#7C4DFF]" : ""}`}>
              <div className="relative shrink-0">
                <Avatar name={c.other.display_name} bg={c.other.avatar_bg} size={44} />
                {c.unread > 0 && <span className="absolute -top-1 -right-1 badge-dot">{c.unread > 9 ? "9+" : c.unread}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[13.5px] truncate">@{c.other.username}</div>
                <div className={`text-[12px] truncate ${c.unread ? "text-white font-medium" : "muted"}`}>
                  {c.unread > 0 && <span className="text-[#C8FF3D] mr-1">●</span>}
                  {previewIcon(c.preview_type)}{c.preview}
                </div>
                <div className="text-[10px] muted mt-0.5 flex items-center gap-2">
                  <ChatClock remainingMs={remaining} subtle />
                  {c.muted && <Icon name="bell" size={11} className="opacity-60" />}
                </div>
              </div>
              {c.unread > 0 && (
                <span className="shrink-0 pill p-lime !text-[9px]">{c.unread} new</span>
              )}
            </div>
          </Link>
        );
      })}

      {!loading && chats.length === 0 && (
        <div className="mt-6">
          <EmptyState
            emoji="✦"
            title="No active chats."
            message="Start something. It'll be gone tomorrow."
            action={<NeoButton variant="lime" onClick={() => setPicker(true)}>START A CHAT</NeoButton>}
          />
        </div>
      )}

      {chats.length > 0 && (
        <div className="mt-4 flex justify-center">
          <NeoButton variant="primary" onClick={() => setPicker(true)}>+ START A CHAT</NeoButton>
        </div>
      )}

      {user && !user.onboarded && <p className="text-[11px] muted text-center mt-4">Finish onboarding first.</p>}
      <p className="text-[10.5px] muted text-center mt-6 px-8 leading-relaxed">
        Every chat lives for exactly 24 hours. Then the messages, the photos, the receipts — gone. No archives. No takebacks.
      </p>

      <ContactsSheet open={picker} onClose={() => setPicker(false)} onPicked={startChat} />
    </div>
  );
}
