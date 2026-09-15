"use client";
// MESSAGES — the inbox. Conversations are persistent contacts; the
// MESSAGES inside them are ephemeral (each one expires 24h after the server
// created it, per-message — see lib/server/chats.ts).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, useApi, useSession } from "@/lib/client";
import { getCachedChats, setCachedChats, sweepExpiredChats } from "@/lib/client-cache";
import { previewTextFor } from "@/lib/chat/display";
import type { ChatListItem } from "@/lib/types";
import { Avatar, EmptyState, NeoButton, Skeleton } from "@/components/ui";
import { ContactsSheet } from "@/components/chat";
import { Icon } from "@/components/icons";
import { Spark } from "@/components/brand";

function previewIcon(type: ChatListItem["preview_type"]): string {
  return type === "image" ? "📷 " : type === "video" ? "🎬 " : type === "post" ? "" : "";
}

function previewLabel(type: ChatListItem["preview_type"]): string {
  switch (type) {
    case "image": return "photo";
    case "video": return "video";
    case "sticker": return "sticker";
    case "post": return "Sent a MEMORE post";
    default: return "";
  }
}

export default function MessagesPage() {
  const { user } = useSession();
  const [cachedChats, setCachedState] = useState<ChatListItem[] | null>(null);
  const { data, loading, refresh } = useApi<{ chats: ChatListItem[] }>("/api/chats");
  const router = useRouter();
  const [picker, setPicker] = useState(false);

  // Instant hydration from persistent cache on mount
  useEffect(() => {
    let active = true;
    (async () => {
      void sweepExpiredChats();
      const cached = await getCachedChats(user?.id);
      if (active && cached && cached.length > 0) {
        setCachedState(cached);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  // Sync fresh server response to persistent cache
  useEffect(() => {
    if (data?.chats && user?.id) {
      setCachedChats(user.id, data.chats);
      setCachedState(data.chats);
    }
  }, [data?.chats, user?.id]);

  // Listen for cross-tab chat expiration
  useEffect(() => {
    const onExpired = (e: any) => {
      const deadId = e?.detail?.id;
      if (deadId) {
        setCachedState((prev) => (prev ? prev.filter((c) => c.id !== deadId) : null));
      }
    };
    window.addEventListener("memore:chat-expired", onExpired);
    return () => window.removeEventListener("memore:chat-expired", onExpired);
  }, []);

  // gentle polling: inbox refreshes while active
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refresh();
    }, 15000);
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const chats = data?.chats ?? cachedChats ?? [];
  const isInitialLoading = loading && chats.length === 0;

  // Previews arrive as CIPHERTEXT (the server can't read them either).
  // Decrypt the text ones locally; type-based labels need no decryption.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!user?.id || chats.length === 0) return;
    let alive = true;
    (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        chats.map(async (c) => {
          next[c.id] = await previewTextFor(user.id, c.id, c.other.id, c);
        })
      );
      if (alive) setPreviews(next);
    })();
    return () => { alive = false; };
  }, [user?.id, data?.chats, cachedChats]);

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
          <Spark size={10} color="#C8FF3D" /> MESSAGES DISAPPEAR AFTER 24H
        </span>
      </div>

      {loading && chats.length === 0 && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {chats.map((c) => {
        return (
          <Link key={c.id} href={`/messages/${c.id}`} className="block mb-2.5">
            <div className={`relative rounded-[20px] p-3.5 flex items-center gap-3 bg-[#131313] border border-[#232323] ${c.unread ? "border-[#7C4DFF]" : ""}`}>
              <div className="relative shrink-0">
                <Avatar name={c.other.display_name} bg={c.other.avatar_bg} size={44} />
                {c.unread > 0 && <span className="absolute -top-1 -right-1 badge-dot">{c.unread > 9 ? "9+" : c.unread}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[13.5px] truncate">@{c.other.username}</span>
                  {c.temp_chat && (
                    <span className="shrink-0 pill p-lime !text-[8px] !px-1.5 !py-0">TEMP</span>
                  )}
                </div>
                <div className={`text-[12px] truncate ${c.unread ? "text-white font-medium" : "muted"}`}>
                  {c.unread > 0 && <span className="text-[#C8FF3D] mr-1">●</span>}
                  {c.preview_type === "text" && c.last_ciphertext ? (
                    previews[c.id] ? (
                      <>{previews[c.id]}</>
                    ) : (
                      <span className="italic opacity-70">encrypted…</span>
                    )
                  ) : previewLabel(c.preview_type) ? (
                    <>{previewIcon(c.preview_type)}{previewLabel(c.preview_type)}</>
                  ) : (
                    <span className="italic opacity-70">start a chat</span>
                  )}
                </div>
                <div className="text-[10px] muted mt-0.5 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="clock" size={10} className="opacity-60" /> 24h after sending
                  </span>
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
