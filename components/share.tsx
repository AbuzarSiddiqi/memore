"use client";
// The ONE share sheet — MEMORE-native, multi-select, search-first. Used from
// the feed rail, reels, and anywhere a meme can be sent to a chat.
import React, { useEffect, useRef, useState } from "react";
import { api, useApi, useToast } from "@/lib/client";
import { Sheet } from "@/components/ui";
import { Avatar } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Spark } from "@/components/brand";
import type { ChatOtherUser, MemeView } from "@/lib/types";

interface Person {
  username: string;
  display_name: string;
  avatar_bg: string;
  recent: boolean; // came from an active/recent chat
}

/** Send the meme to every selected conversation (creates chats on the fly). */
export function ShareSheet({ meme, open, onClose, onSent }: { meme: MemeView; open: boolean; onClose: () => void; onSent?: () => void }) {
  const toast = useToast();
  const chats = useApi<{ chats: Array<{ id: string; other: ChatOtherUser }> }>(open ? "/api/chats" : null);
  const contacts = useApi<{ contacts: ChatOtherUser[] }>(open ? "/api/chats/contacts" : null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSelected([]);
      setDragY(0);
    }
  }, [open]);

  const chatPeople: Person[] = (chats.data?.chats ?? []).map((c) => ({ ...c.other, recent: true }));
  const extraPeople: Person[] = (contacts.data?.contacts ?? [])
    .filter((c) => !chatPeople.some((p) => p.username === c.username))
    .slice(0, 12)
    .map((c) => ({ ...c, recent: false }));

  const match = (p: Person) => !q || p.username.includes(q.toLowerCase()) || p.display_name.toLowerCase().includes(q.toLowerCase());
  const recentList = chatPeople.filter(match);
  const extraList = extraPeople.filter(match);
  const searching = q.trim().length > 0;

  const toggle = (username: string) =>
    setSelected((sel) => (sel.includes(username) ? sel.filter((x) => x !== username) : [...sel, username]));

  const send = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    try {
      for (const username of selected) {
        const c = await api<{ id: string }>("/api/chats", { json: { username } });
        await api(`/api/chats/${c.id}/share-post`, { json: { post_id: meme.id, content: "look at this one" } });
      }
      toast(`RECEIPT SENT ✦`);
      onSent?.();
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const person = (p: Person) => {
    const isSel = selected.includes(p.username);
    return (
      <button key={p.username} onClick={() => toggle(p.username)} aria-label={`Send to @${p.username}${isSel ? " (selected)" : ""}`} className="flex flex-col items-center gap-1.5 transition-transform active:scale-95">
        <span className="relative">
          <Avatar name={p.display_name} bg={p.avatar_bg} size={50} />
          {isSel && (
            <>
              <span className="pointer-events-none absolute -inset-[3px] rounded-full border-2 border-[#C8FF3D]" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[#141020] bg-[#C8FF3D]">
                <Spark size={8} color="#0a0a0a" />
              </span>
            </>
          )}
        </span>
        <span className={`w-full truncate text-center text-[10.5px] font-bold ${isSel ? "text-[#C8FF3D]" : "text-white/80"}`}>@{p.username}</span>
      </button>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} label="Share">
      <div
        className="share-sheet-body"
        style={{ transform: `translateY(${dragY}px)`, transition: dragRef.current ? "none" : "transform 0.2s ease-out" }}
        onPointerDown={(e) => { dragRef.current = e.clientY; }}
        onPointerMove={(e) => {
          if (dragRef.current == null) return;
          const dy = e.clientY - dragRef.current;
          setDragY(dy > 0 ? dy : 0);
        }}
        onPointerUp={() => {
          if (dragY > 72) onClose();
          setDragY(0);
          dragRef.current = null;
        }}
        onPointerCancel={() => { setDragY(0); dragRef.current = null; }}
      >
        <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-white/25" aria-hidden />
        <div className="relative mb-2.5">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"><Icon name="search" size={15} strokeWidth={2.2} /></span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search people..."
            aria-label="Search people"
            className="w-full rounded-xl border border-[#7C4DFF]/60 bg-[#1c1726] py-2.5 pl-9 pr-3 text-[14px] text-white outline-none placeholder:text-white/35"
          />
        </div>

        <div className="max-h-[38vh] min-h-[140px] overflow-y-auto no-scrollbar">
          {recentList.length === 0 && extraList.length === 0 && (
            <p className="py-8 text-center text-[12.5px] text-white/45">{searching ? `No people for "${q}".` : "No one to send this to yet."}</p>
          )}
          {recentList.length > 0 && (
            <>
              <div className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">{searching ? "PEOPLE" : "RECENT"}</div>
              <div className="mb-2 grid grid-cols-4 gap-2">{recentList.map(person)}</div>
            </>
          )}
          {!searching && extraList.length > 0 && (
            <>
              <div className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">MORE PEOPLE</div>
              <div className="grid grid-cols-4 gap-2">{extraList.map(person)}</div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 -mx-5 mt-1 bg-gradient-to-t from-[#141020] via-[#141020] to-transparent px-5 pb-1 pt-2.5">
          <button
            onClick={send}
            disabled={selected.length === 0 || busy}
            className={`flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14px] font-extrabold tracking-wide transition-transform active:scale-[0.98] ${
              selected.length === 0 || busy ? "bg-[#2a2436] text-white/35" : "bg-[#C8FF3D] text-[#0a0a0a]"
            }`}
            style={selected.length > 0 && !busy ? { boxShadow: "2px 3px 0 rgba(10,10,10,0.8)" } : undefined}
          >
            <Spark size={14} color={selected.length === 0 || busy ? "#5a5468" : "#0a0a0a"} />
            {busy ? "SENDING..." : selected.length === 0 ? "SELECT PEOPLE" : `SEND TO ${selected.length}`}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
