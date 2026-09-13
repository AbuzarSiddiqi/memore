// Notifications + achievements. Kept small and side-effect friendly.
import { db, save, uid } from "./db";
import { syncNotificationToSupabase } from "./sync";
import type { NotificationType, AuraNotification } from "../types";

export function pushNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  memeId: string | null = null
) {
  const d = db();
  // light anti-spam: same user+type+message within 30 min is dropped
  const cutoff = Date.now() - 30 * 60_000;
  if (
    d.notifications.some(
      (n) => n.user_id === userId && n.type === type && n.message === message &&
        new Date(n.created_at).getTime() > cutoff
    )
  )
    return;
  const notif: AuraNotification = {
    id: uid(), user_id: userId, type, title, message, meme_id: memeId,
    read: false, created_at: new Date().toISOString(),
  };
  d.notifications.push(notif);
  if (d.notifications.length > 800) d.notifications.splice(0, d.notifications.length - 800);
  save();
  void syncNotificationToSupabase(notif);
}


export const ACHIEVEMENTS = [
  { id: "first-invest", name: "First Investment", description: "Make your first investment.", icon: "🪙" },
  { id: "early-bird", name: "Early Bird", description: "Invest in a meme before it gains 50%.", icon: "🐦" },
  { id: "ten-x", name: "10X", description: "Sell a position for a 10x virtual return.", icon: "🚀" },
  { id: "meme-hunter", name: "Meme Hunter", description: "Discover 10 memes before they hit 2x.", icon: "🏹" },
  { id: "aura-legend", name: "Aura Legend", description: "Hold ✦5,000 Aura at once.", icon: "👑" },
  { id: "creator", name: "Creator", description: "Post your first meme.", icon: "🎨" },
  { id: "viral", name: "Viral", description: "Have a meme enter the Trending tab.", icon: "🔥" },
  { id: "remixer", name: "Remixer", description: "Remix your first meme.", icon: "🔄" },
  { id: "diamond-hands", name: "Diamond Hands", description: "Held through a major crash.", icon: "💎" },
  { id: "perfect-exit", name: "Perfect Exit", description: "Sold within 5% of the all-time high.", icon: "🎯" },
  { id: "called-the-top", name: "Called the Top", description: "Sold right before a major decline.", icon: "📈" },
];

export function unlock(userId: string, achievementId: string) {
  const d = db();
  if (d.user_achievements.some((ua) => ua.user_id === userId && ua.achievement_id === achievementId)) return;
  const ach = ACHIEVEMENTS.find((a) => a.id === achievementId);
  d.user_achievements.push({ user_id: userId, achievement_id: achievementId, unlocked_at: new Date().toISOString() });
  pushNotification(userId, "achievement", `🏆 Achievement unlocked: ${ach?.name ?? achievementId}`, ach?.description ?? "");
  save();
}

// Cheap, event-driven checks after notable actions.
export function checkAchievements(userId: string) {
  const d = db();
  const user = d.users.find((u) => u.id === userId);
  if (!user) return;

  if (d.transactions.some((t) => t.user_id === userId && t.type === "buy")) unlock(userId, "first-invest");
  if (user.aura_balance >= 5_000) unlock(userId, "aura-legend");

  // Early Bird: bought while price < 1.5x initial
  const buys = d.transactions.filter((t) => t.user_id === userId && t.type === "buy");
  for (const b of buys) {
    const meme = d.memes.find((m) => m.id === b.meme_id);
    if (meme && b.price < meme.initial_price * 1.5) { unlock(userId, "early-bird"); break; }
  }
  // 10X: sold at a price ≥ 10x the meme's initial value
  for (const s of d.transactions.filter((t) => t.user_id === userId && t.type === "sell")) {
    const meme = d.memes.find((m) => m.id === s.meme_id);
    if (meme && s.price / (meme.initial_price) >= 10) { unlock(userId, "ten-x"); break; }
  }
  // Meme Hunter: 10 buys at under 2x
  const earlyPicks = new Set(
    buys.filter((b) => {
      const meme = d.memes.find((m) => m.id === b.meme_id);
      return meme && b.price < meme.initial_price * 2;
    }).map((b) => b.meme_id)
  );
  if (earlyPicks.size >= 10) unlock(userId, "meme-hunter");
  if (d.memes.some((m) => m.creator_id === userId)) unlock(userId, "creator");
  if (d.remixes.some((r) => r.creator_id === userId)) unlock(userId, "remixer");
}
