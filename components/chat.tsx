"use client";
// Chat UI pieces shared by the Messages screens and the feed's send-to flow.
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApi, useSession } from "@/lib/client";
import { Avatar, Sheet } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Spark } from "@/components/brand";
import type { ChatOtherUser, MemeView } from "@/lib/types";

/** Hand-drawn clock + live remaining time, computed locally from the server's
 * expires_at (the server stays the only authority on actual expiration). */
export function ChatClock({ expiresAt, remainingMs, subtle = false }: { expiresAt?: string; remainingMs?: number; subtle?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = remainingMs != null ? remainingMs : expiresAt ? Math.max(0, new Date(expiresAt).getTime() - now) : 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const urgent = ms < 10 * 60_000;
  return (
    <span className={`inline-flex items-center gap-1 aura-num ${urgent ? "text-[#C8FF3D]" : ""}`} style={urgent ? { textShadow: "0 0 10px rgba(200,255,61,0.6)" } : undefined}>
      <svg viewBox="0 0 24 24" width={subtle ? 11 : 13} height={subtle ? 11 : 13} aria-hidden>
        <circle cx="12" cy="13" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 9v4.2l2.6 1.6M8 3.2 C10 2, 14 2, 16 3.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {h.toString().padStart(2, "0")}h {m.toString().padStart(2, "0")}m
    </span>
  );
}

let cachedContactsList: ChatOtherUser[] = [];

/** Contacts sheet: pick a person to start a chat (or to send something to). */
export function ContactsSheet({ open, onClose, title = "START SOMETHING", onPicked }: { open: boolean; onClose: () => void; title?: string; onPicked: (username: string) => void }) {
  const { data, loading } = useApi<{ contacts: ChatOtherUser[] }>(open ? "/api/chats/contacts" : null);
  if (data?.contacts && data.contacts.length > 0) {
    cachedContactsList = data.contacts;
  }
  const [q, setQ] = useState("");
  const contacts = data?.contacts ?? cachedContactsList;
  const list = contacts.filter(
    (c) => !q || c.username.includes(q.toLowerCase()) || c.display_name.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <div className="hd text-[20px] mb-1">{title}</div>
      <p className="text-[11.5px] muted mb-3">Pick a person. The chat self-destructs in 24h.</p>
      <input className="neo-input mb-3" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[46vh] overflow-y-auto no-scrollbar space-y-2">
        {loading && list.length === 0 && <div className="text-[12px] muted text-center py-4">Loading people…</div>}
        {list.map((c) => (
          <button key={c.id} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-black/5 text-left" onClick={() => onPicked(c.username)}>
            <Avatar name={c.display_name} bg={c.avatar_bg} size={36} />
            <span className="min-w-0">
              <span className="block font-bold text-[13px] truncate">{c.display_name.toLowerCase().replace(/\s/g, "")}</span>
              <span className="block text-[11px] muted">@{c.username}</span>
            </span>
          </button>
        ))}
        {!loading && list.length === 0 && <p className="text-[12px] muted text-center py-4">Nobody by that name.</p>}
      </div>
    </Sheet>
  );
}

/** Meme-share bubble body: preview card + invest entry point. */
export function SharedPostCard({ meme, children }: { meme: MemeView; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden border-2 border-[#0a0a0a] bg-[#0d0d0d] text-white w-[210px]">
      <div className="px-2.5 pt-1.5 flex items-center gap-1 text-[9px] font-bold tracking-[0.18em] text-white/60">
        <Spark size={9} color="#C8FF3D" /> MEMORE POST
      </div>
      <Link href={`/meme/${meme.id}`} className="block px-2.5 pt-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={meme.thumbnail_url} alt={meme.caption} className="w-full h-[120px] object-cover rounded-xl" loading="lazy" />
      </Link>
      <div className="px-2.5 py-2 flex items-center gap-1.5 flex-wrap">
        <span className="pill p-yellow !text-[9px]">✦ {meme.current_price}</span>
        {meme.heat && <span className="pill p-black !text-[9px]">{meme.heat.level}</span>}
      </div>
      {children}
    </div>
  );
}
