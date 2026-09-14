"use client";
// THE POST BUTTON — MEMORE's signature creation action. A chunky lime pill
// with a purple hard shadow and a hand-drawn underline that only shows on
// hover. Tapping it opens the compact "what are we posting?" sheet, which
// routes into the studio (image/video) or the text-meme composer.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, useOfflineStatus, useSession, useToast } from "@/lib/client";
import { seedPostToCaches } from "@/lib/client-cache";
import { TEXT_POST_LIMIT, TEXT_DRAFT_KEY } from "@/lib/limits";
import { oneLine, parseMentions } from "@/lib/text";
import type { MemeView } from "@/lib/types";
import { Avatar, NeoButton, Sheet } from "./ui";
import { Spark } from "./brand";

const CATEGORIES = ["college", "gaming", "anime", "football", "programming", "bollywood", "technology", "workplace", "indian", "chaos"];

// routes where the floating button would fight fullscreen UIs of their own
const HIDDEN_PREFIXES = ["/reels", "/messages", "/create", "/admin", "/onboarding", "/settings", "/battles"];

export function PostButton() {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  // subtle shrink while the feed is being flung — never a long hide (spec 22)
  const [flinging, setFlinging] = useState(false);
  const flingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastY = useRef(0);
  const lastT = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const t = performance.now();
      const dt = t - lastT.current;
      if (dt > 0) {
        const v = Math.abs(y - lastY.current) / dt; // px per ms
        if (v > 1.1) {
          setFlinging(true);
          if (flingTimer.current) clearTimeout(flingTimer.current);
          flingTimer.current = setTimeout(() => setFlinging(false), 300);
        }
      }
      lastY.current = y;
      lastT.current = t;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (flingTimer.current) clearTimeout(flingTimer.current);
    };
  }, []);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <>
      <button
        type="button"
        className={`post-fab ${flinging ? "post-fab-shrunk" : ""}`}
        aria-label="Create post"
        onClick={() => setCreateOpen(true)}
      >
        <Spark size={17} color="#0a0a0a" />
        <span className="post-fab-label">POST</span>
        {/* hand-drawn underline — draws itself in on hover/focus */}
        <svg className="post-fab-scribble" viewBox="0 0 64 10" aria-hidden preserveAspectRatio="none">
          <path d="M2 7 C 12 3, 22 8.5, 32 5.5 S 52 3, 62 6.5" fill="none" stroke="#7C4DFF" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </button>
      <CreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onText={() => { setCreateOpen(false); setTextOpen(true); }}
      />
      <TextComposer open={textOpen} onClose={() => setTextOpen(false)} />
    </>
  );
}

// ---------------------------------------------------------------- what are we posting?
function CreateSheet({ open, onClose, onText }: { open: boolean; onClose: () => void; onText: () => void }) {
  const router = useRouter();

  const go = (kind: "image" | "video") => {
    onClose();
    router.push(`/create?mode=${kind}`);
  };

  return (
    <Sheet open={open} onClose={onClose} label="Create a post" dark>
      <div className="hd text-[22px] mb-0.5">What are we posting?</div>
      <p className="text-sm muted mb-4">Pick a format — memes in any shape enter the Aura Market at ✦20.</p>
      <div className="space-y-2.5">
        <button className="create-type" onClick={() => go("image")} autoFocus>
          <span className="create-type-ic" style={{ background: "rgba(200,255,61,0.14)", borderColor: "rgba(200,255,61,0.4)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C8FF3D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M4 18l5-5 4 4 3-3 4 4" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="hd block text-[15.5px]">MEME</span>
            <span className="block text-[11.5px] muted">Image — upload or pick a template</span>
          </span>
          <span className="text-lg muted" aria-hidden>→</span>
        </button>
        <button className="create-type" onClick={() => go("video")}>
          <span className="create-type-ic" style={{ background: "rgba(124,77,255,0.16)", borderColor: "rgba(124,77,255,0.45)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b39aff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="2.5" y="5" width="14" height="14" rx="3" /><path d="M16.5 10.5 L21.5 7.5 V16.5 L16.5 13.5 Z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="hd block text-[15.5px]">VIDEO</span>
            <span className="block text-[11.5px] muted">Video meme — up to 90 seconds</span>
          </span>
          <span className="text-lg muted" aria-hidden>→</span>
        </button>
        <button className="create-type" onClick={onText}>
          <span className="create-type-ic" style={{ background: "rgba(255,212,61,0.13)", borderColor: "rgba(255,212,61,0.4)" }}>
            <span className="font-display font-extrabold text-[19px]" style={{ color: "var(--yellow)" }}>Aa</span>
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="hd block text-[15.5px]">TEXT MEME</span>
            <span className="block text-[11.5px] muted">No image needed — the words ARE the meme</span>
          </span>
          <span className="text-lg muted" aria-hidden>→</span>
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- text composer
/** Keeps the composer visible above the mobile keyboard: tracks the visual
 * viewport and lifts the sheet by whatever the on-screen keyboard covers. */
function useKeyboardLift(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const el = ref.current;
      if (!el) return;
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.transform = covered > 24 ? `translateY(${-covered}px)` : "";
    };
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    apply();
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      if (ref.current) ref.current.style.transform = "";
    };
  }, [active]);
  return ref;
}

function getMentionQuery(text: string, cursorPos: number): { query: string; start: number; end: number } | null {
  const textBeforeCursor = text.slice(0, cursorPos);
  const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
  if (!match) return null;
  const query = match[1];
  const atIndex = textBeforeCursor.lastIndexOf("@");
  const textAfterCursor = text.slice(cursorPos);
  const afterMatch = textAfterCursor.match(/^[a-zA-Z0-9_]*/);
  const end = cursorPos + (afterMatch ? afterMatch[0].length : 0);
  return { query, start: atIndex, end };
}

export function TextComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const { refresh } = useSession();
  const offline = useOfflineStatus();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("chaos");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [launched, setLaunched] = useState<MemeView | null>(null);
  const [draftNotice, setDraftNotice] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const liftRef = useKeyboardLift(open);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<{ query: string; start: number; end: number } | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ id: string; username: string; display_name: string; avatar_bg: string }>>([]);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState<Map<string, { userId: string; username: string }>>(new Map());
  const searchAbortRef = useRef<AbortController | null>(null);

  // Debounced search for real database users when typing @mention
  useEffect(() => {
    if (!mentionQuery) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(mentionQuery.query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (Array.isArray(data.users)) {
          setSuggestions(data.users);
          setActiveSuggestionIdx(0);
        }
      } catch {
        // Ignored if aborted
      }
    }, 140);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mentionQuery?.query]);

  const checkMentionAtCursor = (val: string, target?: HTMLTextAreaElement | null) => {
    const el = target || taRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? val.length;
    const q = getMentionQuery(val, pos);
    setMentionQuery(q);
  };

  const selectUser = (u: { id: string; username: string }) => {
    if (!mentionQuery) return;
    const before = text.slice(0, mentionQuery.start);
    const after = text.slice(mentionQuery.end);
    const replacement = `@${u.username} `;
    const nextText = before + replacement + after;
    setText(nextText);

    setSelectedMentions((prev) => {
      const next = new Map(prev);
      next.set(u.username.toLowerCase(), { userId: u.id, username: u.username });
      return next;
    });

    setSuggestions([]);
    setMentionQuery(null);

    const nextPos = mentionQuery.start + replacement.length;
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.focus();
        taRef.current.setSelectionRange(nextPos, nextPos);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        if (suggestions[activeSuggestionIdx]) {
          e.preventDefault();
          selectUser(suggestions[activeSuggestionIdx]);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuggestions([]);
        setMentionQuery(null);
        return;
      }
    }
  };

  // restore a local draft (offline saves / unpublished thoughts)
  useEffect(() => {
    if (!open || launched) return;
    try {
      const draft = localStorage.getItem(TEXT_DRAFT_KEY);
      if (draft && draft.trim() && draft !== text) {
        setText(draft);
        setDraftNotice(true);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(TEXT_DRAFT_KEY, text);
      toast("DRAFT SAVED.", "ok");
    } catch {
      toast("Couldn't save the draft locally.", "err");
    }
  }, [text, toast]);

  const clearDraft = () => {
    try { localStorage.removeItem(TEXT_DRAFT_KEY); } catch {}
  };

  const publish = async () => {
    const trimmed = text.trim();
    if (!trimmed) return toast("Write something first — even one unhinged line.", "err");
    if (trimmed.length > TEXT_POST_LIMIT) return toast(`Text memes cap at ${TEXT_POST_LIMIT} characters. Trim the take.`, "err");
    if (offline) return toast("You're offline — save a draft and publish when back online.", "err");
    setBusy(true);
    try {
      // Validate mentioned users from state against text
      const mentionedUsernames = parseMentions(trimmed);
      const mentionsPayload: Array<{ userId: string; username: string }> = [];
      for (const uname of mentionedUsernames) {
        const lower = uname.toLowerCase();
        if (selectedMentions.has(lower)) {
          const m = selectedMentions.get(lower)!;
          mentionsPayload.push({ userId: m.userId, username: m.username });
        }
      }

      // Server is authoritative: only after this succeeds does the post exist.
      const r = await api<{ meme: MemeView }>("/api/memes", {
        json: {
          caption: text,
          media_type: "text",
          category,
          tags: tags.split(/[,\s]+/).filter(Boolean),
          mentions: mentionsPayload,
        },
      });
      clearDraft();
      await seedPostToCaches(r.meme);
      // let any listening pages (home, reels) refetch live counts
      window.dispatchEvent(new CustomEvent("aura:traded"));
      await refresh();
      setLaunched(r.meme);
      playLaunchPop();
    } catch (e) {
      // nothing was optimistically inserted — the composer keeps the user's
      // text exactly as typed so nothing is lost
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    // keep unsent text as a draft so it survives an accidental dismiss
    if (!launched && text.trim()) {
      try { localStorage.setItem(TEXT_DRAFT_KEY, text); } catch {}
    }
    setText("");
    setTags("");
    setSuggestions([]);
    setMentionQuery(null);
    setSelectedMentions(new Map());
    setLaunched(null);
    setDraftNotice(false);
    onClose();
  };

  const count = text.length;
  const near = count >= TEXT_POST_LIMIT - 30;

  return (
    <Sheet open={open} onClose={close} label="Write a text meme" dark>
      <div ref={liftRef} className="transition-transform duration-150">
        {launched ? (
          <div className="text-center py-10 relative">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="anim-burst inline-flex items-center justify-center w-20 h-20 rounded-[62%_38%_55%_45%] border-2 border-[#0a0a0a]" style={{ background: "var(--lime)" }} aria-hidden>
                <Spark size={38} color="#0a0a0a" />
              </span>
            </div>
            <div className="hd text-2xl mb-2 anim-pop">Text meme launched</div>
            <p className="text-sm muted mt-1 italic">“{oneLine(launched.caption, 60)}”</p>
            <div className="aura-num text-2xl mt-2">✦ 20 <span className="text-sm font-body font-normal muted">opening price</span></div>
            <div className="flex gap-3 justify-center mt-6">
              <NeoButton variant="primary" onClick={() => { close(); router.push(`/meme/${launched.id}`); }}>View post</NeoButton>
              <NeoButton variant="ghost" onClick={close}>Done</NeoButton>
            </div>
          </div>
        ) : (
          <>
            <div className="hd text-[22px] mb-1">What's the meme?</div>
            <p className="text-[12.5px] muted mb-3">Text-only post. Line breaks, #hashtags and @mentions work. No image needed.</p>

            <div className="relative">
              {suggestions.length > 0 && (
                <div
                  className="absolute left-0 right-0 bottom-full mb-2 z-30 max-h-52 overflow-y-auto bg-[#181818] border-2 border-[#333] rounded-2xl shadow-[0_8px_28px_rgba(0,0,0,0.7)] p-1.5 anim-rise"
                  style={{ backdropFilter: "blur(12px)" }}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/50 px-2.5 py-1 flex items-center justify-between border-b border-white/5 mb-1">
                    <span>Tag a real user</span>
                    <span className="text-[9px] text-[#b39aff]">✦ DATABASE</span>
                  </div>
                  <div className="space-y-0.5">
                    {suggestions.map((u, idx) => {
                      const isSelected = idx === activeSuggestionIdx;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                            isSelected
                              ? "bg-[#7C4DFF]/30 border border-[#7C4DFF]"
                              : "hover:bg-white/5 border border-transparent"
                          }`}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            selectUser(u);
                          }}
                        >
                          <Avatar name={u.display_name} bg={u.avatar_bg} username={u.username} size={28} />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-[13px] text-white truncate flex items-center gap-1.5">
                              <span>@{u.username}</span>
                            </div>
                            <div className="text-[11px] text-white/55 truncate">{u.display_name}</div>
                          </div>
                          <span className="text-xs text-[#C8FF3D] font-mono">✦</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <textarea
                ref={taRef}
                className="neo-input font-display !text-[16.5px] leading-relaxed min-h-[132px] resize-y"
                placeholder={"Write something unhinged…\n\nbro said it was a small bug\nfour hours later: everything is on fire"}
                value={text}
                maxLength={TEXT_POST_LIMIT}
                onChange={(e) => {
                  setText(e.target.value);
                  checkMentionAtCursor(e.target.value, e.target);
                  if (draftNotice) setDraftNotice(false);
                }}
                onKeyDown={handleKeyDown}
                onKeyUp={(e) => checkMentionAtCursor(text, e.currentTarget)}
                onClick={(e) => checkMentionAtCursor(text, e.currentTarget)}
                aria-label="Text meme content"
                autoFocus={typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches}
              />
              <span className={`absolute right-3 bottom-2.5 text-[11px] font-bold aura-num pointer-events-none ${near ? "text-[var(--coral)]" : "muted"}`} aria-hidden>
                {count} / {TEXT_POST_LIMIT}
              </span>
            </div>
            {draftNotice && <p className="text-[11px] mt-1.5" style={{ color: "var(--lime)" }}>Draft restored.</p>}
            <div className="sr-only" aria-live="polite">{count} of {TEXT_POST_LIMIT} characters</div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wide muted" htmlFor="tcat">Category</label>
                <select id="tcat" className="neo-select mt-1.5" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wide muted" htmlFor="ttags">Tags</label>
                <input id="ttags" className="neo-input mt-1.5" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="programming, chaos" />
              </div>
            </div>

            {offline && (
              <div className="mt-3 px-3.5 py-2 rounded-2xl border border-[var(--coral)] bg-[#221013] text-[11.5px] font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--coral)] animate-pulse" /> OFFLINE — publish when you're back online
              </div>
            )}

            <div className="flex gap-2 mt-4">
              {offline ? (
                <NeoButton variant="yellow" size="big" full disabled={!text.trim()} onClick={saveDraft}>Save draft</NeoButton>
              ) : (
                <NeoButton variant="lime" size="big" full disabled={busy || !text.trim() || count > TEXT_POST_LIMIT} onClick={publish}>
                  {busy ? "Publishing…" : <>Post <Spark size={14} color="#0a0a0a" /></>}
                </NeoButton>
              )}
              {!offline && text.trim() && (
                <NeoButton variant="ghost" onClick={saveDraft} aria-label="Save draft locally">Save draft</NeoButton>
              )}
            </div>
            <p className="text-[11px] muted text-center mt-3">Enters the Aura Market at ✦20 — don't like, invest.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

function playLaunchPop() {
  // tiny haptic nod where supported (no-op elsewhere)
  try { navigator.vibrate?.(18); } catch {}
}
