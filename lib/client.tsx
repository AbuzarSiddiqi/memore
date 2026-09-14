"use client";
// Client-side foundation: session context, toasts, api helper, formatting.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { PublicUser } from "./types";
import { playSfx } from "./sfx";
import { dedupRequest, getMemoryCache, getMemoryCacheAge, setMemoryCache, purgeUserPrivateCache } from "./client-cache";

// ---------- api ----------
export const UNAUTHORIZED_EVENT = "aura:unauthorized";

export async function api<T = any>(url: string, opts?: RequestInit & { json?: unknown }): Promise<T> {
  const isGet = !opts?.method || opts.method.toUpperCase() === "GET";

  const execute = async () => {
    const init: RequestInit = { ...opts };
    if (opts?.json !== undefined) {
      init.method = opts.method ?? "POST";
      init.headers = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
      init.body = JSON.stringify(opts.json);
    }
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    // Server says our session is gone (e.g. reseed, expiry) — re-sync session
    // state so the UI logs out instead of showing ghost "Log in first" errors.
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong.");
    return data as T;
  };

  // Deduplicate identical concurrent GET requests
  if (isGet) {
    return dedupRequest<T>(url, execute);
  }
  return execute();
}

export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const initialCache = url ? getMemoryCache<T>(url) : null;
  const [data, setData] = useState<T | null>(initialCache);
  const [loading, setLoading] = useState<boolean>(!initialCache);
  const [error, setError] = useState<string | null>(null);
  // state, not a ref: bumping a ref never re-renders, so refresh() was a no-op
  const [tick, setTick] = useState(0);
  const hasData = useRef(!!initialCache);
  const prevUrlRef = useRef(url);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  if (prevUrlRef.current !== url) {
    prevUrlRef.current = url;
    const freshCache = url ? getMemoryCache<T>(url) : null;
    setData(freshCache);
    setLoading(!freshCache);
    hasData.current = !!freshCache;
  }

  useEffect(() => {
    if (!url) return;
    let alive = true;
    // Check if memory has a fresh copy
    const cached = getMemoryCache<T>(url);
    const age = getMemoryCacheAge(url);
    if (cached) {
      setData(cached);
      hasData.current = true;
      setLoading(false);
      // Skip redundant network fetch if data is fresh (< 4s old) and refresh wasn't explicitly clicked
      if (tick === 0 && age !== null && age < 4000) {
        return;
      }
    } else if (!hasData.current) {
      setLoading(true);
    }

    api<T>(url)
      .then((d) => {
        if (alive) {
          hasData.current = true;
          setData(d);
          setError(null);
          setMemoryCache(url, d);
        }
      })
      .catch((e) => {
        if (alive) {
          // If we already have cached data, don't destroy it on network error
          if (!hasData.current) setError(e.message);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);

  return { data, loading, error, refresh, setData };
}

// ---------- session ----------
interface SessionCtx {
  user: PublicUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: PublicUser | null) => void;
}
const SessionContext = createContext<SessionCtx>({ user: null, loading: true, refresh: async () => {}, setUser: () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const d = await api<{ user: PublicUser | null }>("/api/auth/me");
      setUser(d.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  // Any API 401 (stale session after a reseed/expiry) forces a session re-sync.
  useEffect(() => {
    const onUnauthorized = () => { void refresh(); };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [refresh]);
  return (
    <SessionContext.Provider value={{ user, loading, refresh, setUser }}>
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  return useContext(SessionContext);
}

export async function clientLogout(userId?: string) {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
  } catch {}
  try {
    await purgeUserPrivateCache(userId || "me");
  } catch {}
  if (typeof window !== "undefined") {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("sb-") || key.includes("supabase") || key.includes("auth"))) {
          localStorage.removeItem(key);
        }
      }
    } catch {}
    try {
      sessionStorage.clear();
    } catch {}
  }
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {}
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

// ---------- offline status ----------
export function useOfflineStatus(): boolean {
  const [offline, setOffline] = useState(() => (typeof navigator !== "undefined" ? !navigator.onLine : false));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOff = () => setOffline(true);
    const onOn = () => setOffline(false);
    window.addEventListener("offline", onOff);
    window.addEventListener("online", onOn);
    return () => {
      window.removeEventListener("offline", onOff);
      window.removeEventListener("online", onOn);
    };
  }, []);
  return offline;
}

// ---------- toasts ----------
type Toast = { id: number; msg: string; kind: "ok" | "err" | "info" };
const ToastContext = createContext<{ push: (msg: string, kind?: Toast["kind"]) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    if (kind === "err") playSfx("error");
    setToasts((t) => [...t.slice(-3), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "err" ? "err" : t.kind === "ok" ? "ok" : ""}`}>{t.msg}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  return useContext(ToastContext).push;
}

// ---------- formatting ----------
export function fmtAura(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const s = abs >= 1000
    ? Math.round(abs).toLocaleString("en-US")
    : String(Math.round(abs * 10) / 10);
  return `${sign}✦ ${s}`;
}
export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
export function fmtPct(n: number, digits = 1): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}
export function timeAgo(iso: string): string {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = s / 60; if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60; if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24; if (d < 7) return `${Math.floor(d)}d ago`;
  const w = d / 7; if (w < 5) return `${Math.floor(w)}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------- count up ----------
export function useCountUp(value: number, duration = 500): number {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (from === to) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}
