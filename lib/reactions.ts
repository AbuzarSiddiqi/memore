// MEMORE reaction catalog — shared by the server (id validation) and the UI
// (glyphs live in components/reactions.tsx). Custom MEMORE characters, not
// generic emoji, and each carries its own identity color: lime for the Aura
// spark, orange for fire, red for the heart, gold for the crown, and so on.
export interface ReactionDef {
  id: string;
  label: string;
  color: string; // identity ink used for glyph, stamp border, and count text
  group: "reactions" | "love" | "wl" | "memore";
}

export const REACTIONS: ReactionDef[] = [
  { id: "aura", group: "memore", label: "Aura", color: "#C8FF3D" }, // brand lime
  { id: "w", group: "reactions", label: "W", color: "#58E07C" }, // win green
  { id: "f", group: "memore", label: "F", color: "#A9B1C2" }, // steel — pay respects
  { id: "cook", group: "memore", label: "Cooking", color: "#FF8A2A" }, // fire orange
  { id: "dead", group: "memore", label: "Dead", color: "#C084FC" }, // spooky lilac
  { id: "lol", group: "reactions", label: "LOL", color: "#FFE04D" }, // laugh yellow
  { id: "heart", group: "love", label: "Heart", color: "#FF4D5E" }, // red
  { id: "sus", group: "reactions", label: "Sus", color: "#F472B6" }, // pink flag
  { id: "eyes", group: "reactions", label: "Eyes", color: "#FFFFFF" },
  { id: "cold", group: "reactions", label: "Cold", color: "#7DD3FC" }, // ice
  { id: "rocket", group: "wl", label: "Rocket", color: "#6E96FF" }, // deep sky
  { id: "crown", group: "wl", label: "Crown", color: "#FFD23F" }, // gold
];

export const REACTION_IDS = REACTIONS.map((r) => r.id);

// The five favorites that ship in every long-press tray (order matters).
export const DEFAULT_TRAY = ["aura", "w", "f", "cook", "dead"];

export function reactionDef(id: string): ReactionDef | undefined {
  return REACTIONS.find((r) => r.id === id);
}
