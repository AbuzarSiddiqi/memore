"use client";
// Navigation: dark minimal bottom bar + desktop side rail + right contextual rail.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, fmtAura, useSession, useApi } from "@/lib/client";
import { MemoreLogo, MemoreMark, MemoreWordmark, Spark } from "@/components/brand";
import { Icon, type IconName } from "@/components/icons";
import { ChangePct, NeoCard } from "./ui";
import type { MemeView } from "@/lib/types";

interface MobileNavItem { href: string; label: string; icon: IconName; emphasize?: boolean }
const MOBILE_NAV: MobileNavItem[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/market", label: "Market", icon: "chart" },
  { href: "/reels", label: "Memes", icon: "sprout", emphasize: true },
  { href: "/vault", label: "Vault", icon: "bag" },
  { href: "/profile", label: "Profile", icon: "user" },
];

export function NavIcon({ name, size = 22 }: { name: string; size?: number }) {
  if (name === "spark") return <Spark size={size} color="currentColor" />;
  return <Icon name={name as IconName} size={size} />;
}

/* --- hand-drawn pieces (sketch style, per the navbar reference) --- */

/** Wobbly white outline drawn twice around the whole bar. */
function SketchFrame() {
  return (
    <svg viewBox="0 0 400 76" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <path
        d="M14 24 C 10 11, 46 7, 96 6 C 172 4, 252 4, 330 7 C 366 8, 391 12, 389 26 C 392 43, 390 58, 381 64 C 342 71, 266 70, 198 71 C 126 72, 50 71, 19 66 C 9 61, 8 42, 14 24 Z"
        fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="2.2" strokeLinecap="round" vectorEffect="non-scaling-stroke"
      />
      <path
        d="M17 25 C 14 15, 48 10, 98 9 C 174 7, 250 7, 328 10 C 362 11, 387 14, 386 27 C 388 43, 387 56, 379 61 C 342 68, 268 67, 200 68 C 130 69, 54 68, 23 64 C 13 60, 12 43, 17 25 Z"
        fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="1.4" strokeLinecap="round" vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Rough lime scribble ring drawn around the active tab's icon. */
function SketchRing() {
  return (
    <svg viewBox="0 0 52 52" className="pointer-events-none absolute left-1/2 top-1/2 h-[44px] w-[44px] -translate-x-1/2 -translate-y-1/2 -rotate-6" aria-hidden>
      <path
        d="M26 6 C 38 5, 47 13, 46 25 C 45 38, 36 46, 25 46 C 13 46, 6 37, 7 25 C 8 13, 15 7, 26 6 Z"
        fill="rgba(200,255,61,0.10)" stroke="#C8FF3D" strokeWidth="2.2" strokeLinecap="round"
      />
    </svg>
  );
}

/** Three little lime emphasis strokes (the sketch's "!!" marks). */
function SketchDashes({ side }: { side: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 20 30"
      className={`pointer-events-none absolute h-5 w-3.5 ${side === "left" ? "-left-5 -top-1" : "-right-5 -top-1"}`}
      style={side === "right" ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden
    >
      <path d="M16 4 L6 8 M17 15 L5 15 M16 26 L6 22" stroke="#C8FF3D" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Hand-drawn purple circle: wobbly ink blob instead of a perfect CSS circle. */
function SketchPurpleBlob() {
  return (
    <svg viewBox="0 0 72 72" className="block h-full w-full" aria-hidden>
      <path
        d="M37 3 C 52 2, 68 11, 69 31 C 70 51, 57 69, 36 69 C 16 69, 3 55, 3 36 C 3 15, 20 4, 37 3 Z"
        fill="#7C4DFF" stroke="#0a0a0a" strokeWidth="3" strokeLinejoin="round"
      />
      <path d="M16 20 C 23 11, 38 8, 50 13" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  // When a chat conversation opens, the whole bar gets "erased" (fast wipe)
  // and redrawn when you come back.
  const inChat = pathname.startsWith("/messages/");
  const [mounted, setMounted] = useState(!inChat);
  const [visible, setVisible] = useState(!inChat);
  // center-button launch: diamond spins + blob grows, a purple veil expands
  // from the button, then the reels page is revealed behind it.
  const [launching, setLaunching] = useState(false);
  const [veilOut, setVeilOut] = useState(false);

  useEffect(() => {
    if (inChat) {
      setVisible(false); // erase…
      const t = setTimeout(() => setMounted(false), 260); // …then remove
      return () => clearTimeout(t);
    }
    if (!mounted) setMounted(true);
    requestAnimationFrame(() => setVisible(true)); // redraw
  }, [inChat, mounted]);

  const openReels = () => {
    if (launching) return;
    setLaunching(true);
    setTimeout(() => router.push("/reels"), 400);
    setTimeout(() => setVeilOut(true), 720);
    setTimeout(() => { setLaunching(false); setVeilOut(false); }, 1040);
  };

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 lg:hidden" aria-label="Primary">
      {launching && (
        <div className={`nav-veil fixed inset-0 z-[80] ${veilOut ? "nav-veil-out" : ""}`} style={{ pointerEvents: "none" }} aria-hidden>
          <div className="nav-veil-circle" />
        </div>
      )}
      {mounted && (
        <div
          className={`nav-erase relative mx-3 mb-3 mx-auto flex max-w-lg items-center bg-[#0b0b0b] px-2 pt-4 ${visible ? "nav-erase-on" : "nav-erase-off"}`}
          style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom, 0px))" }}
        >
          <SketchFrame />
          {MOBILE_NAV.map((item) =>
            item.emphasize ? (
              <Link key={item.href} href={item.href} aria-label="Open Memes — swipe memes" className="relative z-10 -mt-10 flex flex-1 flex-col items-center" onClick={(e) => { e.preventDefault(); openReels(); }}>
                <span className={`relative flex h-[62px] w-[62px] items-center justify-center transition-transform active:scale-95 ${launching ? "nav-btn-launch" : ""}`}>
                  <SketchPurpleBlob />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Spark size={27} color="#C8FF3D" />
                  </span>
                </span>
                <span className="font-display mt-1.5 text-[15px] leading-none text-white">{item.label}</span>
              </Link>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`relative flex flex-1 flex-col items-center gap-1.5 pb-1 pt-1 ${pathname.startsWith(item.href) ? "text-[#C8FF3D]" : "text-white/85"}`}
              >
                <span className="relative flex h-[26px] w-[26px] items-center justify-center">
                  {pathname.startsWith(item.href) && (
                    <>
                      <SketchRing />
                      <SketchDashes side="left" />
                      <SketchDashes side="right" />
                    </>
                  )}
                  <NavIcon name={item.icon} size={22} />
                </span>
                <span className="font-display text-[15px] leading-none">{item.label}</span>
              </Link>
            )
          )}
        </div>
      )}
    </nav>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, refresh } = useSession();

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    await refresh();
    router.push("/");
  };

  const items = [
    { href: "/home", label: "Home", icon: "home" },
    { href: "/reels", label: "Reels", icon: "spark" },
    { href: "/market", label: "Market", icon: "chart" },
    { href: "/hunter", label: "Meme Hunter", icon: "target" },
    { href: "/create", label: "Create", icon: "upload" },
    { href: "/vault", label: "Vault", icon: "lock" },
    { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
    { href: "/battles", label: "Battles", icon: "swords" },
    { href: "/notifications", label: "Notifications", icon: "bell" },
    { href: "/graveyard", label: "Graveyard", icon: "skull" },
    { href: user ? `/profile/${user.username}` : "/profile", label: "Profile", icon: "user" },
  ];

  return (
    <nav className="hidden lg:flex flex-col gap-0.5 w-60 shrink-0 sticky top-0 h-screen py-6 pr-3" aria-label="Primary">
      <Link href="/home" className="px-3 mb-6 block">
        <MemoreLogo markSize={46} wordSize={25} tagline />
      </Link>
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={`side-item ${pathname === it.href || (it.href !== "/home" && pathname.startsWith(it.href)) ? "active" : ""}`}>
          <NavIcon name={it.icon} size={19} />
          {it.label}
        </Link>
      ))}
      <div className="mt-auto flex flex-col gap-0.5">
        <Link href="/search" className={`side-item ${pathname === "/search" ? "active" : ""}`}>
          <NavIcon name="search" size={19} /> Search
        </Link>
        <Link href="/settings" className={`side-item ${pathname === "/settings" ? "active" : ""}`}>
          <NavIcon name="gear" size={19} /> Settings
        </Link>
        {user?.role === "admin" && (
          <Link href="/admin" className="side-item"><NavIcon name="shield" size={19} /> Admin</Link>
        )}
        <button onClick={logout} className="side-item text-left"><NavIcon name="hand" size={19} /> Logout</button>
      </div>
    </nav>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const { data, refresh } = useApi<{ unread: number; chatUnread: number }>("/api/notifications");
  const chatUnread = data?.chatUnread ?? 0;
  const unread = data?.unread ?? 0;
  // in a chat conversation the top bar gets erased, like the bottom nav
  const inChat = pathname.startsWith("/messages/");
  const [mounted, setMounted] = useState(!inChat);
  const [visible, setVisible] = useState(!inChat);
  useEffect(() => {
    const t = setInterval(refresh, 15000); // keep the badges fresh
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (inChat) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 260);
      return () => clearTimeout(t);
    }
    if (!mounted) setMounted(true);
    requestAnimationFrame(() => setVisible(true));
  }, [inChat, mounted]);
  return (
    <>
      {/* the header is fixed for the erase animation — this spacer holds its layout space */}
      <div className="app-header-spacer lg:hidden shrink-0" aria-hidden />
      <header className="fixed top-0 inset-x-0 z-40 lg:hidden" aria-label="Primary header">
      {mounted && (
      <div className={`nav-erase bg-[var(--bg-app)] app-header-pad pb-2.5 px-4 ${visible ? "nav-erase-on" : "nav-erase-off"}`}>
      <div className="flex items-center justify-between gap-2 h-9">
        <Link href="/home" aria-label="MEMORE home">
          <MemoreLogo markSize={36} wordSize={21} />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/create" className="neo-btn icon" aria-label="Upload a meme" title="Upload a meme">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
          <Link href="/search" className="neo-btn icon" aria-label="Search">
            <NavIcon name="search" size={17} />
          </Link>
          <Link href="/messages" className="neo-btn icon relative" aria-label={`Messages${chatUnread ? `, ${chatUnread} unread` : ""}`} title="Messages — all chats expire in 24h">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 11.5 a8.4 7.5 0 0 1 -8.9 7.4 c-1.2 0-2.4-.2-3.4-.6 L4 20 l1.8-4.1 A7.3 6.6 0 0 1 4.6 11.4 C4.6 7.1 8.3 4 12.5 4 s8.5 3.3 8.5 7.5" />
              <path d="M8.5 10.5 h.01 M12.5 10.5 h.01 M16.5 10.5 h.01" strokeWidth="2.6" />
            </svg>
            {chatUnread > 0 && <span className="badge-dot">{chatUnread > 9 ? "9+" : chatUnread}</span>}
          </Link>
          <Link href="/notifications" className="neo-btn icon relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
            <NavIcon name="bell" size={17} />
            {unread > 0 && <span className="badge-dot">{unread > 9 ? "9+" : unread}</span>}
          </Link>
        </div>
      </div>
      </div>
      )}
    </header>
    </>
  );
}

export function RightRail() {
  const { user } = useSession();
  const { data } = useApi<{ trending: MemeView[]; season: { id: number; name: string } }>("/api/market");
  const { data: vault } = useApi<{ total_aura: number; invested_value: number; today_pnl: number }>("/api/vault");
  const trending = data?.trending ?? [];

  return (
    <aside className="hidden xl:flex flex-col gap-4 w-80 shrink-0 sticky top-0 h-screen py-6 overflow-y-auto no-scrollbar" aria-label="Market snapshot">
      {user && vault && (
        <NeoCard className="p-4" style={{ background: "var(--purple)", borderColor: "var(--purple)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">Your Aura</div>
          <div className="aura-num text-3xl text-[var(--lime)] mt-0.5">{fmtAura(vault.total_aura)}</div>
          <div className="flex items-center gap-2 mt-2 text-xs text-white/80">
            <span>In positions {fmtAura(vault.invested_value)}</span>
            <span className={vault.today_pnl >= 0 ? "pos" : "neg"}>Today {vault.today_pnl >= 0 ? "+" : ""}{fmtAura(vault.today_pnl)}</span>
          </div>
        </NeoCard>
      )}
      <NeoCard className="p-4">
        <div className="hd text-base mb-3 flex items-center gap-1.5"><Icon name="flame" size={16} strokeWidth={2.3} /> Trending</div>
        <div className="space-y-3">
          {trending.map((m, i) => (
            <Link key={m.id} href={`/meme/${m.id}`} className="flex items-center gap-3 group">
              <span className="hd font-bold text-sm w-4 muted">{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.thumbnail_url} alt="" className="w-11 h-11 object-cover rounded-xl" loading="lazy" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate group-hover:underline">{m.caption}</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="aura-num">{fmtAura(m.current_price)}</span>
                  <ChangePct value={m.change_24h} className="text-[11px]" />
                </div>
              </div>
            </Link>
          ))}
          {trending.length === 0 && <div className="skeleton h-20" />}
        </div>
      </NeoCard>
      {data?.season && (
        <p className="text-[11px] muted px-1 leading-relaxed">
          Season {String(data.season.id).padStart(2, "0")} · {data.season.name} — MEMORE is a game. Aura Points are virtual and have no real-world value.
        </p>
      )}
    </aside>
  );
}
