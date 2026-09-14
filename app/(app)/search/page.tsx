"use client";
// Global search: memes, people, hashtags.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fmtAura, useSession } from "@/lib/client";
import { Avatar, ChangePct, EmptyState, NeoCard } from "@/components/ui";
import { TextThumb } from "@/components/text-meme";

const TRENDING_SEARCHES = ["college", "engineering", "bollywood", "football", "anime", "chai", "css", "monday", "pigeons"];

const searchCache = new Map<string, { data: any; timestamp: number }>();

export default function SearchPage() {
  const { user } = useSession();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ memes: MemeLite[]; users: UserLite[]; hashtags: Array<{ tag: string; count: number }> } | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const norm = q.trim().toLowerCase();
    if (norm.length < 2) {
      setResults(null);
      return;
    }

    const hit = searchCache.get(norm);
    if (hit && Date.now() - hit.timestamp < 60_000) {
      setResults(hit.data);
      return;
    }

    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(norm)}`);
        if (res.ok) {
          const data = await res.json();
          searchCache.set(norm, { data, timestamp: Date.now() });
          setResults(data);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mt-3 pb-10">
      <h1 className="hd text-3xl">SEARCH</h1>
      <input
        ref={inputRef}
        className="neo-input mt-4 text-lg"
        placeholder="memes, @users, #hashtags, meme ids…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search MEMORE"
      />

      {!results && (
        <>
          <h2 className="hd text-lg mt-6 mb-3">TRENDING SEARCHES</h2>
          <div className="flex flex-wrap gap-2">
            {TRENDING_SEARCHES.map((t) => (
              <button key={t} className="chip" onClick={() => setQ(t)}>{t}</button>
            ))}
          </div>
        </>
      )}

      {loading && <p className="text-sm muted mt-4">Searching…</p>}

      {results && (
        <div className="mt-6 space-y-6">
          {results.users.length > 0 && (
            <section>
              <h2 className="hd text-lg mb-2">HUNTERS &amp; CREATORS</h2>
              <div className="space-y-2">
                {results.users.map((u) => (
                  <Link key={u.id} href={`/profile/${u.username}`} className="neo-sm p-3 flex items-center gap-3 bg-[var(--surface)]">
                    <Avatar name={u.display_name} bg={u.avatar_bg} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="hd font-bold text-sm">@{u.username}</div>
                      <div className="text-xs muted truncate">{u.bio || u.display_name}</div>
                    </div>
                    <div className="aura-num text-sm">{fmtAura(u.aura_balance)}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {results.hashtags.length > 0 && (
            <section>
              <h2 className="hd text-lg mb-2">HASHTAGS</h2>
              <div className="flex flex-wrap gap-2">
                {results.hashtags.map((h) => (
                  <button key={h.tag} className="chip" onClick={() => setQ(h.tag)}>#{h.tag} · {h.count}</button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="hd text-lg mb-2">MEMES</h2>
            {results.memes.length === 0 ? (
              <EmptyState emoji="🔍" title="No memes found." message="For now." />
            ) : (
              <div className="space-y-2">
                {results.memes.map((m) => (
                  <Link key={m.id} href={`/meme/${m.id}`} className="neo-sm p-3 flex items-center gap-3 bg-[var(--surface)]">
                    {m.media_type === "text"
                      ? <TextThumb meme={m} className="w-12 h-12" />
                      : m.thumbnail_url?.match(/\.(mp4|webm|mov|m4v)(\?.*)?$/i) ? (
                        <video src={`${m.thumbnail_url}#t=0.001`} muted playsInline preload="metadata" className="w-12 h-12 rounded-xl object-cover border-2 border-[var(--ink)] pointer-events-none" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.thumbnail_url} alt="" className="w-12 h-12 rounded-xl object-cover border-2 border-[var(--ink)]" />
                      )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold line-clamp-1">{m.caption}</div>
                      <div className="text-[11px] muted">@{m.creator.username} · {m.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="aura-num text-sm">{fmtAura(m.current_price)}</div>
                      <ChangePct value={m.change_24h} className="text-[11px]" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

interface MemeLite { id: string; caption: string; thumbnail_url: string; media_type?: string; current_price: number; change_24h: number; category: string; creator: { username: string } }
interface UserLite { id: string; username: string; display_name: string; bio: string; avatar_bg: string; aura_balance: number }
