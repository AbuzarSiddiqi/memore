"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, useSession, useToast } from "@/lib/client";
import { NeoButton } from "@/components/ui";
import { MemoreMark, MemoreWordmark } from "@/components/brand";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { PublicUser } from "@/lib/types";

export const STARTER_CREATORS = [
  { username: "dank_vault", name: "The Dank Vault 🏛️", email: "dankvault@aura.app", theme: "Dank / Top Tier" },
  { username: "tech_roasts", name: "Tech Roasts 💻", email: "techroasts@aura.app", theme: "Programming & Tech" },
  { username: "daily_dose", name: "Daily Dose ☕", email: "dailydose@aura.app", theme: "Everyday Relatable" },
  { username: "anime_senpai", name: "Anime Senpai ⛩️", email: "animesenpai@aura.app", theme: "Anime & Gaming" },
  { username: "desi_vibes", name: "Desi Vibes 🫖", email: "desivibes@aura.app", theme: "Bollywood & Campus" },
  { username: "crypto_chuckle", name: "Crypto Chuckle 🪙", email: "cryptochuckle@aura.app", theme: "Market Tops & Hodl" },
  { username: "campus_life", name: "Campus Life 🎒", email: "campuslife@aura.app", theme: "College & Exams" },
  { username: "absurd_humor", name: "Absurd Humor 🌀", email: "absurdhumor@aura.app", theme: "Chaos & Surreal" },
  { username: "reels_central", name: "Reels Central 🎬", email: "reelscentral@aura.app", theme: "Video Memes & Reels" },
  { username: "gaming_glitches", name: "Gaming Glitches 🎮", email: "gamingglitches@aura.app", theme: "NPCs & Broken Physics" },
];

export const CREATOR_PASSWORD = "MemeCreator2026!";

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z"
      />
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.6 7.2C.6 9.2 0 11.5 0 14s.6 4.8 1.6 6.8l3.7-2.9z"
      />
      <path
        fill="#34A853"
        d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.3L1.6 16C3.5 19.8 7.4 23 12 23z"
      />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const toast = useToast();
  const { setUser } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreators, setShowCreators] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body = mode === "login" ? { email, password } : { email, password, username };
      const r = await api<{ user: PublicUser }>(url, { json: body });
      setUser(r.user);
      toast(mode === "login" ? `Welcome back, @${r.user.username}!` : "Welcome to MEMORE.", "ok");
      router.replace(r.user.onboarded ? "/home" : "/onboarding");
    } catch (err) {
      toast((err as Error).message, "err");
      setBusy(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (!isSupabaseConfigured()) {
      toast("Supabase keys not yet set in .env.local. Add your project URL & Anon key to activate Google Login.", "err");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      toast("Supabase client unavailable.", "err");
      return;
    }
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/home`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) {
        toast(error.message, "err");
        setBusy(false);
      }
    } catch (e) {
      toast((e as Error).message, "err");
      setBusy(false);
    }
  };

  const selectCreator = (c: typeof STARTER_CREATORS[0]) => {
    setEmail(c.email);
    setPassword(CREATOR_PASSWORD);
    toast(`Loaded @${c.username} (${c.name})`, "ok");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8 flex flex-col items-center gap-3">
        <MemoreMark size={64} />
        <MemoreWordmark size={26} />
      </Link>
      <div className="w-full max-w-sm">
        <h1 className="hd text-[26px] mb-1 text-center">{mode === "login" ? "Welcome back" : "Join MEMORE"}</h1>
        <p className="text-sm muted mb-6 text-center">
          {mode === "login" ? "Your picks missed you." : "Start with ✦100 Aura. Double-tap memes to invest ✦1."}
        </p>

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={busy}
          className="neo-btn sm w-full !bg-white !text-[#0a0a0a] flex items-center justify-center gap-2.5 font-bold py-3 mb-5 hover:bg-neutral-100 transition-colors"
        >
          <GoogleIcon size={19} />
          <span>Continue with Google</span>
        </button>

        <div className="relative flex items-center justify-center my-5">
          <div className="border-t border-[var(--line)] w-full" />
          <span className="bg-[var(--bg)] px-3 text-[11px] font-bold uppercase tracking-wider muted absolute">
            Or with email
          </span>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label htmlFor="username" className="text-xs font-bold uppercase tracking-wide muted">Username</label>
              <input
                id="username"
                className="neo-input mt-1.5"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="meme_lord"
                autoComplete="username"
                required
                minLength={3}
                maxLength={20}
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="text-xs font-bold uppercase tracking-wide muted">Email</label>
            <input
              id="email"
              type="email"
              className="neo-input mt-1.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="text-xs font-bold uppercase tracking-wide muted">Password</label>
            <input
              id="password"
              type="password"
              className="neo-input mt-1.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6+ characters"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
            />
          </div>
          <NeoButton type="submit" variant="primary" size="big" full disabled={busy}>
            {busy ? "Hold on…" : mode === "login" ? "Log in" : "Claim ✦100"}
          </NeoButton>
        </form>

        {/* 10 Starter Meme Creator Accounts Quick-Selector */}
        {mode === "login" && (
          <div className="mt-6 pt-5 border-t border-[var(--line)]/50 text-center">
            <button
              type="button"
              onClick={() => setShowCreators(!showCreators)}
              className="text-xs font-bold text-[var(--lime)] hover:underline flex items-center justify-center gap-1.5 mx-auto"
            >
              <span>⚡ 10 Starter Creator Accounts</span>
              <span className="text-[10px] opacity-80">{showCreators ? "▲" : "▼"}</span>
            </button>

            {showCreators && (
              <div className="mt-3 text-left space-y-1.5 p-2.5 rounded-xl border-2 border-[var(--ink)] bg-[var(--surface)] max-h-56 overflow-y-auto no-scrollbar">
                <p className="text-[11px] muted mb-1 px-1">
                  Click any account to autofill (Password: <code>{CREATOR_PASSWORD}</code>):
                </p>
                {STARTER_CREATORS.map((c) => (
                  <button
                    key={c.username}
                    type="button"
                    onClick={() => selectCreator(c)}
                    className="w-full text-left p-2 rounded-lg hover:bg-black/20 flex items-center justify-between transition-colors border border-transparent hover:border-[var(--line)]"
                  >
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>@{c.username}</span>
                        <span className="pill !text-[8.5px] !py-0 !px-1">{c.theme}</span>
                      </div>
                      <div className="text-[10.5px] muted">{c.email}</div>
                    </div>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[var(--lime)] text-black">
                      Use
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-sm mt-8">
        {mode === "login" ? (
          <>New here? <Link href="/signup" className="hd font-bold underline">Sign up</Link></>
        ) : (
          <>Already investing? <Link href="/login" className="hd font-bold underline">Log in</Link></>
        )}
      </p>
      <p className="text-[11px] muted mt-6 max-w-xs text-center">Aura Points are virtual with no real-world value. The only thing at risk is your pride.</p>
    </div>
  );
}
