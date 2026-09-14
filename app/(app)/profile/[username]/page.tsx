"use client";
// Profile — meme identity per reference: avatar, Edit Profile, 3 stat cards, tabs, meme grid.
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, fmtAura, fmtPct, timeAgo, useApi, useSession, useToast } from "@/lib/client";
import { getCachedProfile, setCachedProfile } from "@/lib/client-cache";
import type { Meme, MemeView, PublicUser } from "@/lib/types";
import { Avatar, ChangePct, EmptyState, NeoButton, NeoCard, Skeleton, Sheet } from "@/components/ui";

import { MemeCard } from "@/components/meme";
import { TextThumb, TextTile } from "@/components/text-meme";
import { NavIcon } from "@/components/nav";

interface ProfileData {
  user: PublicUser;
  prediction_iq: number;
  rank: number;
  win_rate: number | null;
  call_record: { total: number; won: number };
  biggest_w: { from: number; to: number; mult: number; meme: Meme | null } | null;
  biggest_l: { from: number; to: number; mult: number; meme: Meme | null } | null;
  season: { id: number; name: string };
  memes: MemeView[];
  holdings: Array<{ meme: MemeView; quantity: number; current_value: number; pnl: number; pnl_pct: number; invested_amount: number }>;
  achievements: Array<{ achievement: { id: string; name: string; description: string; icon: string }; unlocked_at: string }>;
  transactions: Array<{ id: string; type: "buy" | "sell"; total_value: number; realized_pnl: number | null; created_at: string; meme: MemeView }>;
  creator_stats: { aura_generated: number; investors: number; memes: number; viral: number };
  battle_record: { wins: number; losses: number };
}

const TABS = ["Posts", "Calls", "Achievements"] as const;

const TITLE_PILLS: Record<string, { label: string; cls: string }> = {
  AURA_LEGEND: { label: "👑 AURA LEGEND", cls: "p-purple" },
  MEME_ORACLE: { label: "🔮 MEME ORACLE", cls: "p-yellow" },
  DIAMOND_HANDS: { label: "💎 DIAMOND HANDS", cls: "p-blue" },
  TREND_HUNTER: { label: "🏹 TREND HUNTER", cls: "p-lime" },
  BAGHOLDER: { label: "🛍️ BAGHOLDER", cls: "p-coral" },
};

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const router = useRouter();
  const [cachedProfile, setCachedProfileState] = useState<ProfileData | null>(null);
  const { data, loading, error } = useApi<ProfileData>(`/api/users/${username}`);
  const { user: me } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Posts");
  const [following, setFollowing] = useState<boolean | null>(null);
  const [socialSheet, setSocialSheet] = useState<"followers" | "following" | null>(null);
  const [socialUsers, setSocialUsers] = useState<PublicUser[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const c = await getCachedProfile(username);
      if (active && c) setCachedProfileState(c);
    })();
    return () => { active = false; };
  }, [username]);

  useEffect(() => {
    if (data) {
      setCachedProfileState(data);
      void setCachedProfile(username, data);
    }
  }, [data, username]);

  const profile = data ?? cachedProfile;

  if (loading && !profile) return <div className="mt-6 space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!loading && (error || !profile)) return <EmptyState emoji="👻" title="That user doesn't exist." message="Yet." action={<NeoButton variant="primary" href="/home">Back home</NeoButton>} />;
  if (!profile) return null;

  const u = profile.user;
  const isMe = me?.id === u.id;
  const isFollowing = following ?? !!u.is_following;
  const titlePill = u.title ? TITLE_PILLS[u.title] : null;

  const openSocialList = async (type: "followers" | "following") => {
    setSocialSheet(type);
    setSocialLoading(true);
    try {
      const res = await api<{ followers?: PublicUser[]; following?: PublicUser[] }>(`/api/users/${username}/${type}`);
      setSocialUsers(type === "followers" ? (res.followers ?? []) : (res.following ?? []));
    } catch {
      setSocialUsers([]);
    } finally {
      setSocialLoading(false);
    }
  };

  const follow = async () => {
    if (!me) return toast("Log in first.", "err");
    const prevFollowing = isFollowing;
    const prevFollowers = u.followers ?? 0;
    const nextFollowing = !prevFollowing;
    const nextFollowers = Math.max(0, prevFollowers + (nextFollowing ? 1 : -1));

    // Optimistic UI update
    setFollowing(nextFollowing);
    if (profile) {
      setCachedProfileState({
        ...profile,
        user: {
          ...profile.user,
          is_following: nextFollowing,
          followers: nextFollowers,
        },
      });
    }

    try {
      const r = await api<{
        following: boolean;
        follower_count: number;
        following_count: number;
        follows_you?: boolean;
      }>(`/api/users/${u.username}/follow`, { json: { follow: nextFollowing } });

      setFollowing(r.following);
      if (profile) {
        const updated: ProfileData = {
          ...profile,
          user: {
            ...profile.user,
            is_following: r.following,
            followers: r.follower_count,
            following: r.following_count,
            follows_you: r.follows_you ?? profile.user.follows_you,
          },
        };
        setCachedProfileState(updated);
        void setCachedProfile(username, updated);
      }
    } catch (e) {
      // Rollback on failure
      setFollowing(prevFollowing);
      if (profile) {
        setCachedProfileState({
          ...profile,
          user: {
            ...profile.user,
            is_following: prevFollowing,
            followers: prevFollowers,
          },
        });
      }
      toast((e as Error).message, "err");
    }
  };

  const startChat = async () => {
    if (!me) return toast("Log in first.", "err");
    try {
      const r = await api<{ id: string }>("/api/chats", { json: { username: u.username } });
      router.push(`/messages/${r.id}`);
    } catch (e) { toast((e as Error).message, "err"); }
  };

  return (
    <div className="mt-2 pb-10">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <Avatar name={u.display_name} bg={u.avatar_bg} size={72} />
        <div className="flex items-center gap-2">
          {isMe ? (
            <>
              <Link href="/settings" className="neo-btn icon" aria-label="Settings"><NavIcon name="gear" size={17} /></Link>
              <Link href="/settings" className="neo-btn lime" style={{ padding: "9px 20px" }}>Edit Profile</Link>
            </>
          ) : (
            <>
              <NeoButton size="sm" variant={isFollowing ? "ghost" : "lime"} onClick={follow} className="!px-5">
                {isFollowing ? "Following" : "Follow"}
              </NeoButton>
              <NeoButton size="sm" variant="primary" onClick={startChat} className="!px-4">Message</NeoButton>
            </>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="hd text-[22px]">{u.display_name.toLowerCase().replace(/\s/g, "")}.exe</h1>
          {titlePill && <span className={`pill ${titlePill.cls}`}>{titlePill.label}</span>}
          {u.is_seed && <span className="pill !text-[9px]" title="Official demo/seed account">SEED</span>}
        </div>
        <div className="text-[13px] muted">@{u.username}</div>
        <p className="text-[13.5px] mt-1.5">{u.bio || "Investing in memes, not just watching them."}</p>
        <div className="text-[12.5px] muted mt-1.5 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => openSocialList("followers")}
            className="hover:underline transition-opacity active:opacity-70 focus:outline-none"
            aria-label="View followers"
          >
            <b style={{ color: "var(--ink)" }}>{u.followers ?? 0}</b> Followers
          </button>
          <span>·</span>
          <button
            onClick={() => openSocialList("following")}
            className="hover:underline transition-opacity active:opacity-70 focus:outline-none"
            aria-label="View following"
          >
            <b style={{ color: "var(--ink)" }}>{u.following ?? 0}</b> Following
          </button>
          {u.follows_you && (
            <span className="pill !text-[9.5px] !py-0.5 !px-2 bg-white/10 text-white/70">
              Follows you
            </span>
          )}
          <span>·</span>
          <span>LVL {u.level}</span>
        </div>
      </div>


      {/* 3 stat cards */}
      <div className="grid grid-cols-3 gap-2.5 mt-4">
        <div className="rounded-2xl p-3" style={{ background: "var(--lime)", color: "#0a0a0a" }}>
          <div className="text-[9.5px] font-extrabold uppercase">Prediction IQ</div>
          <div className="aura-num text-[24px] leading-tight">{profile.prediction_iq}</div>
        </div>
        <NeoCard className="p-3">
          <div className="text-[9.5px] font-extrabold uppercase muted">Global rank</div>
          <div className="aura-num text-[24px] leading-tight">#{profile.rank}</div>
        </NeoCard>
        <NeoCard className="p-3">
          <div className="text-[9.5px] font-extrabold uppercase muted">Win rate</div>
          <div className="aura-num text-[24px] leading-tight">{profile.win_rate != null ? `${profile.win_rate.toFixed(0)}%` : "—"}</div>
        </NeoCard>
      </div>

      {/* aura + season line */}
      <div className="flex items-center justify-between mt-3 text-[13px]">
        <span className="aura-num" style={{ color: "var(--lime)" }}>✦ {fmtAura(u.aura_balance)} Aura</span>
        <span className="muted text-[11.5px]">S{String(profile.season.id).padStart(2, "0")} · {profile.season.name}</span>
      </div>

      {/* tabs */}
      <div className="flex gap-2 mt-5 overflow-x-auto no-scrollbar" role="tablist" aria-label="Profile sections">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`chip ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "Posts" && (
          profile.memes.length === 0 ? (
            <EmptyState emoji="🎨" title="No memes posted." message={isMe ? "Your first masterpiece awaits." : "For now."} action={isMe ? <NeoButton variant="primary" href="/create">Create one</NeoButton> : undefined} />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {profile.memes.map((m) => (
                <Link key={m.id} href={`/meme/${m.id}`} className="relative rounded-xl overflow-hidden border border-[var(--line)] group">
                  {m.media_type === "text" ? (
                    <TextTile meme={m} className="w-full aspect-square group-hover:opacity-80 transition-opacity" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumbnail_url} alt={m.caption} className="w-full aspect-square object-cover group-hover:opacity-80 transition-opacity" loading="lazy" />
                  )}
                  {m.media_type === "video" && <span className="absolute top-1.5 right-1.5 text-[11px]">▶️</span>}
                </Link>
              ))}
            </div>
          )
        )}

        {tab === "Calls" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <MiniStat label="Calls won" value={profile.call_record.total > 0 ? `${profile.call_record.won}/${profile.call_record.total}` : "—"} />
              <MiniStat label="Battle record" value={`${profile.battle_record.wins}W-${profile.battle_record.losses}L`} />
              <MiniStat label="Early finds" value={String(u.hunter.early_discoveries)} />
            </div>
            {profile.biggest_w && (
              <NeoCard className="p-3.5">
                <div className="text-[10px] font-extrabold uppercase" style={{ color: "var(--lime)" }}>🏆 Biggest W</div>
                <div className="aura-num text-lg mt-0.5">{fmtAura(profile.biggest_w.from)} → {fmtAura(profile.biggest_w.to)} <span className="text-sm muted">({profile.biggest_w.mult.toFixed(1)}×)</span></div>
                {profile.biggest_w.meme && <div className="text-[12px] muted truncate">{profile.biggest_w.meme.caption}</div>}
              </NeoCard>
            )}
            {profile.biggest_l && (
              <NeoCard className="p-3.5">
                <div className="text-[10px] font-extrabold uppercase" style={{ color: "var(--neg)" }}>💀 Biggest L</div>
                <div className="aura-num text-lg mt-0.5">{fmtAura(profile.biggest_l.from)} → {fmtAura(profile.biggest_l.to)} <span className="text-sm muted">({profile.biggest_l.mult.toFixed(1)}×)</span></div>
                {profile.biggest_l.meme && <div className="text-[12px] muted truncate">{profile.biggest_l.meme.caption}</div>}
              </NeoCard>
            )}
            {profile.holdings.length > 0 && (
              <NeoCard className="p-3.5">
                <div className="hd text-sm mb-2">Current holdings</div>
                <div className="space-y-1.5">
                  {profile.holdings.slice(0, 5).map((h) => (
                    <Link key={h.meme.id} href={`/meme/${h.meme.id}`} className="flex items-center gap-2 text-[13px] group">
                      {h.meme.media_type === "text"
                        ? <TextThumb meme={h.meme} className="w-7 h-7" />
                        : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.meme.thumbnail_url} alt="" className="w-7 h-7 rounded-lg object-cover" />
                        )}
                      <span className="truncate flex-1 group-hover:underline">{h.meme.caption}</span>
                      <ChangePct value={h.pnl_pct} className="text-[12px]" />
                    </Link>
                  ))}
                </div>
              </NeoCard>
            )}
            <NeoCard className="p-3.5">
              <div className="hd text-sm mb-2">Recent activity</div>
              <div className="space-y-2">
                {profile.transactions.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-[12.5px]">
                    <span className={`pill ${t.type === "buy" ? "p-blue" : "p-coral"} !text-[9px] !py-0`}>{t.type.toUpperCase()}</span>
                    <span className="truncate flex-1 muted">{t.meme.caption}</span>
                    <span className="aura-num">{t.type === "buy" ? "−" : "+"}{fmtAura(t.total_value).slice(2)}</span>
                  </div>
                ))}
                {profile.transactions.length === 0 && <p className="text-[12.5px] muted">No trades yet.</p>}
              </div>
            </NeoCard>
          </div>
        )}

        {tab === "Achievements" && (
          <div className="grid grid-cols-2 gap-2.5">
            {profile.achievements.length === 0 && <p className="text-sm muted col-span-full">No achievements yet. Go be great.</p>}
            {profile.achievements.map((a) => (
              <NeoCard key={a.achievement.id} className="p-4 text-center">
                <div className="text-3xl">{a.achievement.icon}</div>
                <div className="hd font-bold text-[13px] mt-1">{a.achievement.name}</div>
                <div className="text-[11px] muted mt-0.5 leading-snug">{a.achievement.description}</div>
                <div className="text-[10px] muted mt-1">{timeAgo(a.unlocked_at)}</div>
              </NeoCard>
            ))}
          </div>
        )}
      </div>

      {/* creator impact — quiet footer row */}
      <div className="flex items-center justify-center gap-6 mt-8 text-center">
        <div><div className="aura-num text-base">{fmtAura(profile.creator_stats.aura_generated)}</div><div className="text-[10px] muted font-bold uppercase">Aura generated</div></div>
        <div><div className="aura-num text-base">{profile.creator_stats.memes}</div><div className="text-[10px] muted font-bold uppercase">Memes</div></div>
        <div><div className="aura-num text-base">{fmtPct(profile.win_rate ?? 0, 0)}</div><div className="text-[10px] muted font-bold uppercase">Win rate</div></div>
      </div>

      <Sheet
        open={socialSheet !== null}
        onClose={() => setSocialSheet(null)}
        label={socialSheet === "followers" ? "Followers" : "Following"}
      >
        <div className="space-y-3 pb-4">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
            <h2 className="hd text-[17px]">
              {socialSheet === "followers" ? `Followers (${u.followers ?? 0})` : `Following (${u.following ?? 0})`}
            </h2>
          </div>
          {socialLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : socialUsers.length === 0 ? (
            <div className="py-8 text-center text-[13px] muted">
              {socialSheet === "followers" ? "No followers yet." : "Not following anyone yet."}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto no-scrollbar">
              {socialUsers.map((su) => (
                <div key={su.id} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-white/[0.03] border border-[var(--line)]">
                  <Link
                    href={`/profile/${su.username}`}
                    onClick={() => setSocialSheet(null)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-85 transition-opacity"
                  >
                    <Avatar name={su.display_name} bg={su.avatar_bg} size={36} />
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-bold truncate leading-tight">{su.display_name}</div>
                      <div className="text-[11.5px] muted truncate">@{su.username}</div>
                    </div>
                  </Link>
                  {me?.id !== su.id && (
                    <NeoButton
                      size="sm"
                      variant={su.is_following ? "ghost" : "lime"}
                      className="!px-3 !py-1 !text-[11px]"
                      onClick={async () => {
                        try {
                          const res = await api<{ following: boolean }>(`/api/users/${su.username}/follow`, {
                            json: { follow: !su.is_following },
                          });
                          setSocialUsers((prev) =>
                            prev.map((item) => (item.id === su.id ? { ...item, is_following: res.following } : item))
                          );
                        } catch (err) {
                          toast((err as Error).message, "err");
                        }
                      }}
                    >
                      {su.is_following ? "Following" : "Follow"}
                    </NeoButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}


function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <NeoCard className="p-3 text-center">
      <div className="text-[9.5px] font-extrabold uppercase muted">{label}</div>
      <div className="aura-num text-lg mt-0.5">{value}</div>
    </NeoCard>
  );
}
