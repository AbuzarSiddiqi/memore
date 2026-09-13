"use client";
// Settings — profile, appearance, privacy, session.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useSession, useToast } from "@/lib/client";
import { NeoButton, NeoCard, SectionTitle } from "@/components/ui";

const COLORS = ["#7C4DFF", "#315BEF", "#FF6B57", "#22A565", "#F59E0B", "#E5484D", "#0EA5E9", "#9333EA"];

export default function SettingsPage() {
  const { user, refresh, setUser } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [bg, setBg] = useState("#7C4DFF");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name);
      setBio(user.bio);
      setBg(user.avatar_bg);
    }
  }, [user]);

  const save = async () => {
    setBusy(true);
    try {
      await api("/api/settings", { method: "PATCH", json: { display_name: displayName, bio, avatar_bg: bg } });
      await refresh();
      toast("Profile updated. Looking sharp.", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
  };

  if (!user) return null;

  return (
    <div className="mt-3 pb-10">
      <h1 className="hd text-3xl">SETTINGS</h1>

      <SectionTitle>PROFILE</SectionTitle>
      <NeoCard className="p-5 space-y-4">
        <div>
          <label className="text-xs hd font-bold uppercase muted" htmlFor="dn">Display name</label>
          <input id="dn" className="neo-input mt-1" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={30} />
        </div>
        <div>
          <label className="text-xs hd font-bold uppercase muted" htmlFor="bio">Bio</label>
          <textarea id="bio" className="neo-input mt-1" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} placeholder="What kind of meme entity are you?" />
        </div>
        <div>
          <span className="text-xs hd font-bold uppercase muted">Avatar color</span>
          <div className="flex gap-2 mt-2 flex-wrap">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setBg(c)} aria-label={`Avatar color ${c}`} aria-pressed={bg === c}
                className="w-9 h-9 rounded-full border-[3px] border-[var(--ink)]"
                style={{ background: c, boxShadow: bg === c ? "3px 3px 0 var(--ink)" : undefined, transform: bg === c ? "scale(1.12)" : undefined }} />
            ))}
          </div>
        </div>
        <NeoButton variant="primary" onClick={save} disabled={busy}>{busy ? "SAVING…" : "SAVE PROFILE"}</NeoButton>
      </NeoCard>
      <SectionTitle>APPEARANCE</SectionTitle>
      <NeoCard className="p-5 flex items-center justify-between text-sm">
        <span className="hd font-bold">Theme</span>
        <span className="muted">Dark — the way memes were meant to be seen</span>
      </NeoCard>

      <SectionTitle>NOTIFICATIONS &amp; PRIVACY</SectionTitle>
      <NeoCard className="p-5 text-sm space-y-3">
        <p className="muted">Notification preferences live server-side for market alerts. Muted and blocked account management is coming in a future update — report tools are live on every meme.</p>
        <div className="flex items-center justify-between">
          <span className="hd font-bold">Interests</span>
          <span className="text-xs muted">{user.interests.length ? user.interests.join(", ") : "none selected"}</span>
        </div>
      </NeoCard>

      <SectionTitle>ACCOUNT</SectionTitle>
      <NeoCard className="p-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="hd font-bold">Signed in as</span>
          <span>{user.display_name} · @{user.username} · {user.role === "admin" ? "ADMIN" : "MEMBER"}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {user.role === "admin" && <NeoButton variant="purple" href="/admin">ADMIN DASHBOARD</NeoButton>}
          <NeoButton variant="coral" onClick={logout}>LOG OUT</NeoButton>
        </div>
      </NeoCard>

      <p className="text-[11px] muted text-center mt-6 leading-relaxed">
        MEMORE is a social game. Aura Points are virtual, non-transferable, and have no monetary value.<br />
        Don&apos;t Like. Invest. (virtually)
      </p>
    </div>
  );
}
