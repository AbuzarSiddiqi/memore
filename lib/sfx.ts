"use client";
// SFX — tiny central sound module. Every effect is a lazy singleton <Audio>,
// restarted on retrigger so rapid taps re-fire instantly (slot-machine feel).
// Sounds only ever enhance an interaction; failures are silently swallowed.
export type SfxName = "cash" | "error" | "sell" | "dab";

const FILES: Record<SfxName, string> = {
  cash: "/sfx/cash.mp3",
  error: "/sfx/error.mp3",
  sell: "/sfx/sell.mp3",
  dab: "/sfx/dab.mp3",
};

const VOLUME: Record<SfxName, number> = { cash: 0.7, error: 0.55, sell: 0.75, dab: 0.8 };

const players = new Map<SfxName, HTMLAudioElement>();

export function playSfx(name: SfxName) {
  try {
    if (typeof window === "undefined") return;
    let a = players.get(name);
    if (!a) {
      a = new Audio(FILES[name]);
      a.preload = "auto";
      players.set(name, a);
    }
    a.currentTime = 0;
    a.volume = VOLUME[name];
    void a.play().catch(() => { /* needs a user gesture first — fine */ });
  } catch { /* audio is a bonus, never break the interaction */ }
}
