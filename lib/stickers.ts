// MEMORE sticker catalog — original characters + slang plaques, server-safe
// plain data (artwork lives in components/stickers.tsx).
export type StickerCategory = "reactions" | "slang" | "memes" | "aura" | "wl" | "chaos" | "genz";

export interface StickerDef {
  id: string;
  label: string; // caption printed on the sticker
  category: StickerCategory;
  animated?: boolean; // lightweight CSS motion, only on special ones
}

export const STICKERS: StickerDef[] = [
  // REACTIONS
  { id: "bro", label: "BRO", category: "reactions" },
  { id: "nahh", label: "NAHH", category: "reactions" },
  { id: "bruh", label: "BRUH", category: "reactions" },
  { id: "real", label: "REAL", category: "reactions" },
  { id: "no-shot", label: "NO SHOT", category: "reactions" },
  // SLANG
  { id: "cooking", label: "WE'RE COOKING", category: "slang", animated: true },
  { id: "let-him-cook", label: "LET HIM COOK", category: "slang" },
  { id: "cooked", label: "YOU'RE COOKED", category: "slang" },
  { id: "down-bad", label: "DOWN BAD", category: "slang", animated: true },
  // MEMES
  { id: "what-bro-doing", label: "WHAT IS BRO DOING", category: "memes" },
  { id: "skill-issue", label: "SKILL ISSUE", category: "memes" },
  { id: "believer", label: "WE HAVE A BELIEVER", category: "memes" },
  // AURA
  { id: "to-the-moon", label: "TO THE MOON", category: "aura", animated: true },
  { id: "diamond-hands", label: "DIAMOND HANDS", category: "aura", animated: true },
  { id: "called-it", label: "I CALLED IT", category: "aura" },
  { id: "aura-drain", label: "AURA DRAINED", category: "aura" },
  // W / L
  { id: "common-w", label: "COMMON W", category: "wl", animated: true },
  { id: "big-l", label: "BIG L", category: "wl" },
  { id: "too-easy", label: "TOO EASY", category: "wl" },
  // CHAOS
  { id: "its-over", label: "IT'S OVER", category: "chaos", animated: true },
  { id: "so-back", label: "WE ARE SO BACK", category: "chaos", animated: true },
  { id: "absolutely-not", label: "ABSOLUTELY NOT", category: "chaos" },
  // GEN-Z
  { id: "sigma", label: "SIGMA", category: "genz" },
  { id: "rizz", label: "W RIZZ", category: "genz" },
  { id: "no-cap", label: "NO CAP", category: "genz" },
  { id: "bffr", label: "BFFR", category: "genz" },
  { id: "mid", label: "MID", category: "genz" },
  { id: "goated", label: "GOATED", category: "genz" },
  { id: "crashed-out", label: "CRASHED OUT", category: "genz" },
  { id: "its-giving", label: "IT'S GIVING", category: "genz" },
  { id: "delulu", label: "DELUULU", category: "genz" },
  { id: "npc", label: "NPC", category: "genz" },
  { id: "fafo", label: "FAFO", category: "genz" },
  { id: "sent-me", label: "SENT ME", category: "genz" },
];

export const STICKER_IDS = STICKERS.map((s) => s.id);

export const STICKER_CATEGORY_LABELS: Array<{ id: StickerCategory; label: string }> = [
  { id: "reactions", label: "REACTIONS" },
  { id: "slang", label: "SLANG" },
  { id: "memes", label: "MEMES" },
  { id: "aura", label: "AURA" },
  { id: "wl", label: "W / L" },
  { id: "chaos", label: "CHAOS" },
];

export function stickerDef(id: string): StickerDef | undefined {
  return STICKERS.find((s) => s.id === id);
}
