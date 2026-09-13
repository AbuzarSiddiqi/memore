"use client";
// MEMORE stickers — original cast (Sparky the ✦, the blob, Skully, the flame
// guy) + slang plaques, and the picker sheet. Frameless die-cut art: character
// on a soft halo with a caption plaque, so nothing clips and it reads clean
// against the dark chat. A few lightweight CSS animations.
import React, { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui";
import { STICKERS, STICKER_CATEGORY_LABELS, stickerDef, type StickerDef, type StickerCategory } from "@/lib/stickers";

const INK = "#0c0a12";

/** The recurring cast — each centered on (0,0), scaled into 120×120 art. */
function Sparky({ mood = "happy", color = "#C8FF3D", glasses = false, arms = "out" }: { mood?: "happy" | "shock" | "x" | "smug"; color?: string; glasses?: boolean; arms?: "out" | "up" | "pray" | "none" }) {
  return (
    <g>
      <path d="M0 -24 C 2.5 -11, 6 -5, 16 0 C 6 5, 2.5 11, 0 24 C -2.5 11, -6 5, -16 0 C -6 -5, -2.5 -11, 0 -24 Z" fill={color} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      {mood === "shock" ? (
        <>
          <circle cx={-4.5} cy={-2} r={2.7} fill="#fff" stroke={INK} strokeWidth={1.4} />
          <circle cx={4.5} cy={-2} r={2.7} fill="#fff" stroke={INK} strokeWidth={1.4} />
          <circle cx={-4.5} cy={-2} r={1} fill={INK} />
          <circle cx={4.5} cy={-2} r={1} fill={INK} />
          <ellipse cx={0} cy={5.5} rx={2.4} ry={3.2} fill={INK} />
        </>
      ) : mood === "x" ? (
        <path d="M-7 -5 L-2.5 -0.5 M-2.5 -5 L-7 -0.5 M2.5 -5 L7 -0.5 M7 -5 L2.5 -0.5" stroke={INK} strokeWidth={1.7} strokeLinecap="round" />
      ) : mood === "smug" ? (
        <>
          <path d="M-6.5 -3 L-1.5 -2.4 M2 -2.4 L6.5 -3" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
          <path d="M-3 4.5 C -1 6.2, 3 5.8, 5 4.2" stroke={INK} strokeWidth={1.7} fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx={-4} cy={-2} r={1.4} fill={INK} />
          <circle cx={4} cy={-2} r={1.4} fill={INK} />
          <path d="M-3.5 4 C -1.5 6.2, 1.5 6.2, 3.5 4" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </>
      )}
      {glasses && (
        <g>
          <rect x={-9.4} y={-4.8} width={7.8} height={5.6} rx={1.7} fill={INK} />
          <rect x={1.6} y={-4.8} width={7.8} height={5.6} rx={1.7} fill={INK} />
          <path d="M-1.6 -2.6 L1.6 -2.6" stroke={INK} strokeWidth={1.5} />
        </g>
      )}
      {arms === "out" && <path d="M-17 1 C -21 0, -23 -3, -22.5 -6 M17 1 C 21 0, 23 -3, 22.5 -6" stroke={INK} strokeWidth={2.3} fill="none" strokeLinecap="round" />}
      {arms === "up" && <path d="M-15 -3 C -19 -6, -20 -10, -19 -13 M15 -3 C 19 -6, 20 -10, 19 -13" stroke={INK} strokeWidth={2.3} fill="none" strokeLinecap="round" />}
      {arms === "pray" && <path d="M-13 3 C -17 5, -17 9, -13 10.5 L -1 7 M13 3 C 17 5, 17 9, 13 10.5 L 1 7" stroke={INK} strokeWidth={2.3} fill="none" strokeLinecap="round" />}
    </g>
  );
}

function Blob({ mood = "happy", color = "#C084FC" }: { mood?: "happy" | "huge" | "shrug" | "stern" | "flat"; color?: string }) {
  return (
    <g>
      <path d="M0 -19 C 11 -19, 17.5 -10, 17.5 1 C 17.5 11, 10 17.5, 0 17.5 C -10 17.5, -17.5 11, -17.5 1 C -17.5 -10, -11 -19, 0 -19 Z" fill={color} stroke={INK} strokeWidth={2.6} />
      {mood === "huge" ? (
        <>
          <circle cx={-5} cy={-3} r={4.4} fill="#fff" stroke={INK} strokeWidth={1.4} />
          <circle cx={5} cy={-3} r={4.4} fill="#fff" stroke={INK} strokeWidth={1.4} />
          <circle cx={-5} cy={-3} r={1.4} fill={INK} />
          <circle cx={5} cy={-3} r={1.4} fill={INK} />
          <ellipse cx={0} cy={6.5} rx={2.8} ry={3.6} fill={INK} />
        </>
      ) : mood === "shrug" ? (
        <>
          <path d="M-6.5 -3 L-2 -3 M2 -3 L6.5 -3" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
          <path d="M-4 6 L4 6" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
          <path d="M-18 -6 C -22 -3, -22 2, -19 5 M18 -6 C 22 -3, 22 2, 19 5" stroke={INK} strokeWidth={2.3} fill="none" strokeLinecap="round" />
        </>
      ) : mood === "stern" ? (
        <>
          <path d="M-6.5 -4 L-2 -3 M2 -3 L6.5 -4" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
          <path d="M-4 6.5 C -1.5 5.2, 1.5 5.2, 4 6.5" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
          <path d="M-18 4 C -14 8, -8 9, -3 8.5 M18 4 C 14 8, 8 9, 3 8.5" stroke={INK} strokeWidth={2.3} fill="none" strokeLinecap="round" />
        </>
      ) : mood === "flat" ? (
        <>
          <path d="M-6.5 -3.5 L-2 -3.5 M2 -3.5 L6.5 -3.5" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
          <path d="M-3.5 5.5 L3.5 5.5" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx={-4.5} cy={-3} r={1.5} fill={INK} />
          <circle cx={4.5} cy={-3} r={1.5} fill={INK} />
          <path d="M-4 4.5 C -2 6.8, 2 6.8, 4 4.5" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function Skully() {
  const g = { transform: "translate(-12 -12)" };
  return (
    <g transform="scale(1.95)">
      <path d="M12 3.4 C 16.6 3.4, 19.2 6.6, 19.2 10.6 C 19.2 13.4, 17.6 15 16 15.6 L 16 19 C 16 19.8, 15.4 20.4, 14.6 20.4 L 9.4 20.4 C 8.6 20.4, 8 19.8, 8 19 L 8 15.6 C 6.4 15, 4.8 13.4, 4.8 10.6 C 4.8 6.6, 7.4 3.4, 12 3.4 Z" fill="#E8E6F2" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" {...g} />
      <path d="M8 9.4 L10.6 12 M10.6 9.4 L8 12 M13.4 9.4 L16 12 M16 9.4 L13.4 12" stroke={INK} strokeWidth={1.2} strokeLinecap="round" {...g} />
      <path d="M10.8 20.4 L10.8 18.2 M13.2 20.4 L13.2 18.2" stroke={INK} strokeWidth={1.2} strokeLinecap="round" {...g} />
    </g>
  );
}

function FlameGuy({ chef = false }: { chef?: boolean }) {
  return (
    <g>
      <path d="M0 -22 C 2 -15, 9 -12, 9 -2 C 9 6.5, 5 11, 0 11 C -5 11, -9 6.5, -9 -2 C -9 -7, -5 -9.5, -3 -13.5 C -1.8 -11.2, -0.8 -10, 0 -10.4" fill="#FF8A2A" stroke={INK} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={-3} cy={-1} r={1.2} fill={INK} />
      <circle cx={3} cy={-1} r={1.2} fill={INK} />
      <path d="M-2.6 2.6 C -1.4 4.4, 1.4 4.4, 2.6 2.6" stroke={INK} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <path d="M-10 4 C -13 3, -14 0, -13 -2 M10 4 C 13 3, 14 0, 13 -2" stroke={INK} strokeWidth={2.1} fill="none" strokeLinecap="round" />
      {chef && (
        <g>
          <path d="M-8 -20 C -8 -25, -2 -26.5, 0 -24 C 2 -26.5, 8 -25, 8 -20 C 8 -18, 6 -17, 0 -17 C -6 -17, -8 -18, -8 -20 Z" fill="#fff" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <rect x={-5.5} y={-17.5} width={11} height={4.5} rx={1.5} fill="#fff" stroke={INK} strokeWidth={2} />
        </g>
      )}
    </g>
  );
}

/** Caption plaque with a tiny folded corner — text auto-shrinks to fit. */
function Plaque({ lines, color = "#C8FF3D", y = 90, size = 14 }: { lines: string[]; color?: string; y?: number; size?: number }) {
  const maxLen = Math.max(...lines.map((l) => l.length));
  const fs = Math.min(size, Math.floor((94 / maxLen) * 1.4) + 1);
  const h = lines.length > 1 ? 9 + lines.length * 13.5 : 21;
  return (
    <g>
      <rect x={6} y={y} width={108} height={h} rx={7} fill="#0d0b14" stroke={color} strokeWidth={1.8} transform="rotate(-0.8 60 100)" />
      <path d={`M${106} ${y + h} L ${114} ${y + h} L ${114} ${y + h - 7} Z`} fill={color} opacity={0.85} />
      {lines.map((l, i) => (
        <text key={i} x={60} y={y + 14.5 + i * 13.5} textAnchor="middle" fontSize={fs} fontWeight={800} fill={color} className="font-display" letterSpacing="0.5">{l}</text>
      ))}
    </g>
  );
}

const ART: Record<string, React.ReactNode> = {
  bro: (
    <>
      <path d="M24 20 C 28 16, 34 14, 40 14 M80 14 C 86 14, 92 16, 96 20" stroke="#C084FC" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <g transform="translate(60 46) scale(1.3)"><Sparky mood="shock" color="#C8FF3D" /></g>
      <Plaque lines={["BRO"]} />
    </>
  ),
  nahh: (
    <>
      <g transform="translate(56 44) rotate(-8) scale(1.3)"><Blob mood="flat" color="#C084FC" /></g>
      <path d="M86 32 C 95 28, 100 21, 101 12 C 96 17, 93 15, 92 10 C 90 17, 86 23, 79 26 Z" fill="#C084FC" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <Plaque lines={["NAHH"]} color="#C084FC" />
    </>
  ),
  bruh: (
    <>
      <g transform="translate(60 44)"><Skully /></g>
      <path d="M28 22 L 34 26 M92 22 L 86 26" stroke="#E8E6F2" strokeWidth={2.2} strokeLinecap="round" />
      <Plaque lines={["BRUH"]} color="#E8E6F2" />
    </>
  ),
  real: (
    <>
      <g transform="translate(60 44) scale(1.25)"><Blob mood="happy" color="#58E07C" /></g>
      <path d="M28 20 C 34 15, 44 13, 54 15 M66 14 C 74 13, 82 16, 86 20" stroke="#58E07C" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Plaque lines={["REAL"]} color="#58E07C" />
    </>
  ),
  "no-shot": (
    <>
      <g transform="translate(60 42) scale(1.3)"><Blob mood="huge" color="#fff" /></g>
      <path d="M32 18 L 40 25 M88 18 L 80 25" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <Plaque lines={["NO SHOT"]} color="#fff" />
    </>
  ),
  cooking: (
    <>
      <g className="stk-anim" style={{ animation: "stkSizzle 0.9s ease-in-out infinite" }}>
        <g transform="translate(60 40) scale(1.22)"><FlameGuy /></g>
        <path d="M30 64 C 41 60, 79 60, 90 64 L 85 73 C 72 77, 48 77, 35 73 Z" fill="#2a2a33" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
        <path d="M46 58 L 66 49 L 64 58 Z" fill="#C8FF3D" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      </g>
      <path d="M26 58 C 24 53, 27 50, 26 46 M94 58 C 96 53, 93 50, 94 46" stroke="#FF8A2A" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Plaque lines={["WE'RE COOKING"]} color="#FF8A2A" />
    </>
  ),
  "let-him-cook": (
    <>
      <g transform="translate(60 46) scale(1.3)"><FlameGuy chef /></g>
      <Plaque lines={["LET HIM COOK"]} color="#FF8A2A" />
    </>
  ),
  cooked: (
    <>
      <g transform="translate(60 46) scale(1.3)"><Sparky mood="x" color="#6B6473" /></g>
      <path d="M38 18 C 36 13, 39 10, 38 6 M72 16 C 70 11, 73 8, 72 4 M55 12 C 54 8, 56 5, 55 2" stroke="#8a8a94" strokeWidth={2.3} fill="none" strokeLinecap="round" />
      <Plaque lines={["YOU'RE COOKED"]} color="#8a8a94" />
    </>
  ),
  "down-bad": (
    <>
      <g className="stk-anim" style={{ animation: "stkSink 1.3s ease-in-out infinite" }}>
        <g transform="translate(60 40) rotate(148) scale(1.3)"><Blob mood="flat" color="#C084FC" /></g>
        <path d="M22 62 C 36 58, 46 64, 60 61 C 74 58, 84 64, 98 60" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        <path d="M42 70 C 50 68, 70 68, 78 70" stroke="#C084FC" strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={0.7} />
      </g>
      <Plaque lines={["DOWN BAD"]} color="#C084FC" y={82} />
    </>
  ),
  "what-bro-doing": (
    <>
      <g transform="translate(60 42) rotate(-24) scale(1.3)"><Blob mood="flat" color="#7DD3FC" /></g>
      <text x={18} y={28} fontSize={19} fontWeight={800} fill="#7DD3FC" className="font-display" transform="rotate(-12 18 28)">?</text>
      <text x={98} y={24} fontSize={16} fontWeight={800} fill="#7DD3FC" className="font-display" transform="rotate(14 98 24)">?</text>
      <Plaque lines={["WHAT IS BRO", "DOING"]} color="#7DD3FC" size={12.5} y={80} />
    </>
  ),
  "skill-issue": (
    <>
      <g transform="translate(60 44) scale(1.3)"><Blob mood="shrug" color="#FFD23F" /></g>
      <Plaque lines={["SKILL ISSUE"]} color="#FFD23F" />
    </>
  ),
  believer: (
    <>
      <g transform="translate(60 46) scale(1.25)"><Sparky mood="happy" arms="pray" /></g>
      <path d="M26 20 L 30 24 M94 20 L 90 24 M60 10 L 60 15 M42 14 L 45 18 M78 14 L 75 18" stroke="#C8FF3D" strokeWidth={2.2} strokeLinecap="round" />
      <Plaque lines={["WE HAVE A", "BELIEVER"]} size={13} y={80} />
    </>
  ),
  "to-the-moon": (
    <>
      <g className="stk-anim" style={{ animation: "stkFloat 1.7s ease-in-out infinite" }}>
        <g transform="translate(60 34) scale(1.12)"><Sparky mood="smug" arms="none" /></g>
        <g transform="translate(60 74)">
          <path d="M0 -16 C 6 -10, 7.5 -2, 5 6 L -5 6 C -7.5 -2, -6 -10, 0 -16 Z" fill="#C084FC" stroke={INK} strokeWidth={2.3} strokeLinejoin="round" />
          <circle cx={0} cy={-4} r={2.2} fill="#fff" stroke={INK} strokeWidth={1.4} />
          <path d="M-5 0 L -10 6 L -5 5.5 M5 0 L 10 6 L 5 5.5" fill="#7C4DFF" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
          <path d="M-3 7.5 C -3 10.5, -1.5 12.5, 0 14.5 C 1.5 12.5, 3 10.5, 3 7.5" fill="#C8FF3D" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        </g>
      </g>
      <circle cx={22} cy={22} r={2.2} fill="#fff" />
      <circle cx={96} cy={34} r={1.8} fill="#fff" />
      <circle cx={86} cy={14} r={2.6} fill="#FFD23F" />
      <path d="M14 50 C 18 48, 21 49, 24 52" stroke="#C8FF3D" strokeWidth={2} fill="none" strokeLinecap="round" />
      <Plaque lines={["TO THE MOON"]} />
    </>
  ),
  "diamond-hands": (
    <>
      <g className="stk-anim" style={{ animation: "stkGlow 1.2s ease-in-out infinite" }}>
        <g transform="translate(60 50)">
          <path d="M-18 2 L -9.5 -11 L 9.5 -11 L 18 2 L 0 19 Z" fill="#7DD3FC" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
          <path d="M-9.5 -11 L -4 2 L 0 19 M9.5 -11 L 4 2 M-18 2 L 18 2" stroke={INK} strokeWidth={1.4} opacity={0.65} />
          <path d="M-20 -8 L -24 -12 M20 -8 L 24 -12 M0 -16 L 0 -21" stroke="#7DD3FC" strokeWidth={2.3} strokeLinecap="round" />
          <path d="M-27 6 C -31 10, -31 14, -27 16 M27 6 C 31 10, 31 14, 27 16" stroke={INK} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <g transform="translate(0 -32) scale(1.1)"><Blob mood="flat" color="#C084FC" /></g>
          <g transform="translate(-8.5 -40)"><rect x={-6.5} y={-2} width={13} height={5.2} rx={2} fill={INK} /></g>
          <g transform="translate(8.5 -40)"><rect x={-6.5} y={-2} width={13} height={5.2} rx={2} fill={INK} /></g>
          <path d="M-1.5 -40 L 1.5 -40" stroke={INK} strokeWidth={1.6} />
        </g>
      </g>
      <Plaque lines={["DIAMOND HANDS"]} color="#7DD3FC" size={12.5} />
    </>
  ),
  "called-it": (
    <>
      <g transform="translate(57 46) scale(1.25)">
        <Sparky mood="smug" glasses />
        <path d="M18 -8 C 24 -12, 26 -17, 25 -22" stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" />
        <circle cx={25} cy={-25} r={2.3} fill="#FFD23F" stroke={INK} strokeWidth={1.6} />
      </g>
      <Plaque lines={["I CALLED IT"]} color="#FFD23F" />
    </>
  ),
  "aura-drain": (
    <>
      <g transform="translate(60 48) rotate(12) scale(1.3 0.78)"><Sparky mood="x" color="#8a8a94" /></g>
      <path d="M78 66 C 79 70, 77 72, 75 71 C 73 70, 74 67, 76 65" fill="#8a8a94" stroke={INK} strokeWidth={1.4} />
      <path d="M28 70 L 38 74 M92 70 L 82 74" stroke="#8a8a94" strokeWidth={2.2} strokeLinecap="round" />
      <Plaque lines={["AURA DRAINED"]} color="#8a8a94" size={13} />
    </>
  ),
  "common-w": (
    <>
      <g className="stk-anim" style={{ animation: "stkBounce 1.1s ease-in-out infinite" }}>
        <g transform="translate(60 46) scale(1.28)"><Sparky mood="happy" arms="up" /></g>
        <path d="M24 16 L 27 20 M96 16 L 93 20 M60 8 L 60 13 M40 12 L 42 16 M80 12 L 78 16" stroke="#FFD23F" strokeWidth={2.3} strokeLinecap="round" />
      </g>
      <Plaque lines={["COMMON W"]} color="#58E07C" />
    </>
  ),
  "big-l": (
    <>
      <g transform="translate(60 44) rotate(178) scale(1.25)"><Blob mood="happy" color="#FF4D5E" /></g>
      <text x={20} y={32} fontSize={21} fontWeight={800} fill="#FF4D5E" className="font-display" transform="rotate(-14 20 32)">L</text>
      <path d="M94 28 C 98 31, 98 35, 94 37" stroke="#FF4D5E" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Plaque lines={["BIG L"]} color="#FF4D5E" />
    </>
  ),
  "too-easy": (
    <>
      <g transform="translate(60 44) rotate(-6) scale(1.28)"><Sparky mood="smug" arms="none" /></g>
      <path d="M38 52 C 32 54, 30 58, 33 61 M82 52 C 88 54, 90 58, 87 61" stroke={INK} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <path d="M26 76 C 32 73, 38 74, 42 77 M78 76 C 84 73, 90 74, 94 77" stroke="#C8FF3D" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Plaque lines={["TOO EASY"]} />
    </>
  ),
  "its-over": (
    <>
      <g className="stk-anim" style={{ animation: "stkCollapse 2.2s ease-in-out infinite" }}>
        <g transform="translate(55 46) rotate(-14)"><Skully /></g>
        <path d="M26 28 C 30 31, 34 36, 35 40 M90 24 C 87 28, 85 33, 85 37" stroke="#E8E6F2" strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={0.8} />
      </g>
      <Plaque lines={["IT'S OVER"]} color="#E8E6F2" />
    </>
  ),
  "so-back": (
    <>
      <g className="stk-anim" style={{ animation: "stkRise 1.4s ease-in-out infinite" }}>
        <g transform="translate(60 44)">
          <Sparky mood="happy" arms="up" />
          <path d="M-36 10 C -22 4, 22 4, 36 10 L 36 34 L -36 34 Z" fill="#12100d" />
          <path d="M-36 10 C -22 4, 22 4, 36 10" stroke={INK} strokeWidth={2.8} fill="none" strokeLinecap="round" />
          <path d="M-26 14 L -22 18 M10 15 L 14 19 M-6 16 L -2 20" stroke="#58E07C" strokeWidth={2} strokeLinecap="round" />
        </g>
      </g>
      <Plaque lines={["WE ARE SO BACK"]} color="#58E07C" size={13} />
    </>
  ),
  "absolutely-not": (
    <>
      <g transform="translate(60 44) scale(1.3)"><Blob mood="stern" color="#C084FC" /></g>
      <path d="M26 18 L 39 31 M39 18 L 26 31" stroke="#FF4D5E" strokeWidth={3.2} strokeLinecap="round" />
      <Plaque lines={["ABSOLUTELY NOT"]} color="#FF4D5E" size={12.5} />
    </>
  ),
  // ---------- GEN-Z ----------
  sigma: (
    <>
      <g transform="translate(60 46) scale(1.3)"><Blob mood="flat" color="#C084FC" /></g>
      <g transform="translate(60 40)">
        <rect x={-12.5} y={-3} width={10.5} height={7} rx={2} fill={INK} />
        <rect x={2} y={-3} width={10.5} height={7} rx={2} fill={INK} />
        <path d="M-2 -0.5 L2 -0.5" stroke={INK} strokeWidth={1.8} />
        <path d="M-14 -24 L -8 -18 M14 -24 L 8 -18 M0 -28 L 0 -21" stroke="#C084FC" strokeWidth={2.4} strokeLinecap="round" />
      </g>
      <Plaque lines={["SIGMA"]} color="#C084FC" />
    </>
  ),
  rizz: (
    <>
      <g transform="translate(58 46) scale(1.28)">
        <Sparky mood="smug" color="#FF4D5E" />
        <path d="M2 -6 C 4.5 -8, 7 -7.5, 8.5 -5.5" stroke={INK} strokeWidth={1.7} fill="none" strokeLinecap="round" />
        <circle cx={-4.5} cy={-3} r={1.4} fill={INK} />
      </g>
      <path d="M88 20 C 92 16, 96 16, 99 19 M86 30 L 89 33 M97 28 L 94 32" stroke="#FF4D5E" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M28 22 C 33 18, 39 17, 44 19" stroke="#C8FF3D" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Plaque lines={["W RIZZ"]} color="#FF4D5E" />
    </>
  ),
  "no-cap": (
    <>
      <g transform="translate(60 48) scale(1.28)"><Blob mood="happy" color="#fff" /></g>
      <g transform="translate(60 28)">
        <path d="M-13 2 C -13 -7, -6 -12, 0 -12 C 6 -12, 13 -7, 13 2 Z" fill="#7C4DFF" stroke={INK} strokeWidth={2.3} strokeLinejoin="round" />
        <path d="M-13 2 C -20 2, -24 4, -24 6.5 L 13 6.5 C 16 6.5, 16 3, 13 2" fill="#5b3ad6" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      </g>
      <path d="M88 44 L 96 40 M92 52 L 99 49" stroke="#7C4DFF" strokeWidth={2.2} strokeLinecap="round" />
      <Plaque lines={["NO CAP"]} color="#C084FC" />
    </>
  ),
  bffr: (
    <>
      <g transform="translate(60 46)"><Blob mood="stern" color="#A9B1C2" /></g>
      <path d="M30 20 L 34 24 M90 20 L 86 24" stroke="#A9B1C2" strokeWidth={2.3} strokeLinecap="round" />
      <Plaque lines={["BFFR"]} color="#A9B1C2" />
    </>
  ),
  mid: (
    <>
      <g transform="translate(60 46) scale(1.22)"><Blob mood="flat" color="#9aa0a6" /></g>
      <g transform="translate(60 22)">
        <rect x={-20} y={-9} width={40} height={17} rx={4} fill="#0d0b14" stroke="#9aa0a6" strokeWidth={1.6} />
        <text x={0} y={5} textAnchor="middle" fontSize={10} fontWeight={800} fill="#9aa0a6" className="font-display">5 / 10</text>
      </g>
      <Plaque lines={["MID"]} color="#9aa0a6" />
    </>
  ),
  goated: (
    <>
      <g transform="translate(60 48) scale(1.28)">
        <Sparky mood="happy" color="#C8FF3D" />
        <path d="M-6 -22 C -9 -27, -8 -31, -4 -32 C -5 -28, -4 -25, -2 -23 M6 -22 C 9 -27, 8 -31, 4 -32 C 5 -28, 4 -25, 2 -23" fill="#E8E6F2" stroke={INK} strokeWidth={1.9} strokeLinejoin="round" />
      </g>
      <path d="M24 24 C 29 20, 35 18, 41 19 M79 19 C 85 18, 91 20, 96 24" stroke="#FFD23F" strokeWidth={2.3} fill="none" strokeLinecap="round" />
      <Plaque lines={["GOATED"]} color="#FFD23F" />
    </>
  ),
  "crashed-out": (
    <>
      <g transform="translate(60 46) rotate(-10) scale(1.28)">
        <Blob mood="flat" color="#FF4D5E" />
        <path d="M-5.5 -4.5 L -2 -1 M -2 -4.5 L -5.5 -1 M 2 -4.5 L 5.5 -1 M 5.5 -4.5 L 2 -1" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
        <path d="M-3.5 5.5 L 3.5 5.5" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
      </g>
      <path d="M24 26 L 32 22 L 28 30 L 36 27 M96 20 L 89 26 L 95 28" stroke="#FFD23F" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Plaque lines={["CRASHED OUT"]} color="#FF4D5E" size={12.5} />
    </>
  ),
  "its-giving": (
    <>
      <g transform="translate(56 46) scale(1.26)"><Sparky mood="happy" arms="none" /></g>
      <path d="M78 40 C 86 36, 92 38, 95 44" stroke={INK} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <path d="M92 30 C 96 26, 102 26, 105 30 C 108 34, 104 38, 98 37 C 92 36, 90 33, 92 30 Z" fill="#FFD23F" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      <path d="M30 22 C 35 18, 42 17, 48 19" stroke="#C8FF3D" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Plaque lines={["IT'S GIVING"]} color="#FFD23F" />
    </>
  ),
  delulu: (
    <>
      <g transform="translate(60 46) scale(1.28)"><Sparky mood="happy" color="#C084FC" /></g>
      <path d="M52 40 L 56 34 L 60 40 L 64 34 L 68 40" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" transform="translate(0 -12)" />
      <path d="M26 24 C 30 20, 36 20, 39 24 M82 18 C 86 14, 92 14, 95 18" stroke="#C084FC" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <path d="M96 40 C 100 38, 103 40, 103 43" stroke="#C8FF3D" strokeWidth={2} fill="none" strokeLinecap="round" />
      <Plaque lines={["DELUULU"]} color="#C084FC" />
    </>
  ),
  npc: (
    <>
      <g transform="translate(60 48) scale(1.28)"><Blob mood="flat" color="#9aa0a6" /></g>
      <g transform="translate(60 20)">
        <circle cx={-12} cy={0} r={2.2} fill="#9aa0a6" />
        <circle cx={0} cy={-3} r={2.2} fill="#9aa0a6" />
        <circle cx={12} cy={0} r={2.2} fill="#9aa0a6" />
      </g>
      <path d="M30 28 C 28 24, 30 21, 33 20 M90 28 C 92 24, 90 21, 87 20" stroke="#9aa0a6" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Plaque lines={["NPC"]} color="#9aa0a6" />
    </>
  ),
  fafo: (
    <>
      <g transform="translate(60 46)"><Skully /></g>
      <path d="M30 22 L 36 28 M90 22 L 84 28 M60 12 L 60 18" stroke="#FF8A2A" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M40 18 C 43 14, 47 14, 49 17 M71 17 C 74 14, 78 14, 80 18" stroke="#FF8A2A" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Plaque lines={["FAFO"]} color="#FF8A2A" />
    </>
  ),
  "sent-me": (
    <>
      <g transform="translate(60 46) rotate(90) scale(1.15)"><Skully /></g>
      <path d="M34 24 C 38 21, 42 21, 45 24 M75 24 C 78 21, 82 21, 86 24" stroke="#FFE04D" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <path d="M36 68 C 42 65, 78 65, 84 68" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Plaque lines={["SENT ME"]} color="#FFE04D" y={84} />
    </>
  ),
};

export function StickerArt({ id, size = 130 }: { id: string; size?: number }) {
  if (!stickerDef(id) || !ART[id]) return null;
  return (
    <div style={{ width: size, height: size }} className="shrink-0">
      <svg viewBox="0 0 120 120" width="100%" height="100%">
        {ART[id]}
      </svg>
    </div>
  );
}

const FAV_KEY = "memore-sticker-favs";
const RECENT_KEY = "memore-sticker-recent";

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(list) ? list.filter((x) => stickerDef(x)) : [];
  } catch {
    return [];
  }
}

export function recordStickerRecent(id: string): void {
  try {
    const next = [id, ...readList(RECENT_KEY).filter((x) => x !== id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* private mode */ }
}

/** MEMORE STICKERS — bottom sheet picker. RECENT / FAVORITES / category tabs;
 * long-press a sticker to favorite it; picking one sends it instantly. */
export function StickerSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const [tab, setTab] = useState<"recent" | "favorites" | StickerCategory>("recent");
  const [favs, setFavs] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const pressTimer = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setFavs(readList(FAV_KEY));
      setRecent(readList(RECENT_KEY));
      setTab("recent");
    }
  }, [open]);

  const clearPress = () => {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const list: StickerDef[] =
    tab === "recent" ? recent.map((id) => stickerDef(id)).filter(Boolean) as StickerDef[]
    : tab === "favorites" ? favs.map((id) => stickerDef(id)).filter(Boolean) as StickerDef[]
    : STICKERS.filter((s) => s.category === tab);

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    try { navigator.vibrate?.(12); } catch { /* no haptics */ }
  };

  const tabs: Array<{ id: "recent" | "favorites" | StickerCategory; label: string }> = [
    { id: "recent", label: "RECENT" },
    { id: "favorites", label: "FAVORITES" },
    ...STICKER_CATEGORY_LABELS.map((c) => ({ id: c.id, label: c.label })),
  ];

  return (
    <Sheet open={open} onClose={onClose} label="MEMORE stickers">
      <div className="sticker-sheet-body">
        <div className="mb-1 flex items-center justify-between">
          <div className="hd text-[19px] text-white">MEMORE STICKERS</div>
          <button onClick={onClose} aria-label="Close stickers" className="text-white/70 transition-transform active:scale-90">
            <svg viewBox="0 0 24 24" width={17} height={17} aria-hidden><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto no-scrollbar px-1 pb-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full border px-3 py-1 text-[10.5px] font-bold tracking-wider transition-colors ${
                tab === t.id ? "border-[#C8FF3D] bg-[#C8FF3D] text-[#0a0a0a]" : "border-[#7C4DFF]/70 text-white/70"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="max-h-[44vh] min-h-[190px] overflow-y-auto no-scrollbar pb-1">
          {list.length === 0 ? (
            <p className="py-10 text-center text-[12.5px] text-white/45">
              {tab === "favorites" ? "Nothing saved. Long-press a sticker to favorite it." : tab === "recent" ? "Send a sticker and it lands here." : "Empty. For now."}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {list.map((s) => (
                <button
                  key={s.id}
                  aria-label={`Sticker ${s.label}`}
                  className="relative rounded-2xl border border-white/[0.07] bg-white/[0.035] p-1 transition-transform active:scale-95"
                  onPointerDown={() => {
                    clearPress();
                    pressTimer.current = window.setTimeout(() => {
                      pressTimer.current = null;
                      toggleFav(s.id);
                    }, 480);
                  }}
                  onPointerUp={clearPress}
                  onPointerLeave={clearPress}
                  onPointerCancel={clearPress}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => { onPick(s.id); onClose(); }}
                >
                  <StickerArt id={s.id} size={104} />
                  {favs.includes(s.id) && (
                    <span className="absolute right-1.5 top-1 text-[12px] text-[#FFD23F]" aria-hidden>★</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="mt-1 text-center text-[10px] text-white/35">long-press a sticker to favorite it</p>
      </div>
    </Sheet>
  );
}
