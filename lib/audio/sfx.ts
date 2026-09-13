"use client";

/**
 * MEMORE — Centralized UI Sound Effect (SFX) Engine
 *
 * Architecture:
 * - Pure Web Audio API (AudioContext + AudioBufferSourceNode + GainNode).
 * - NEVER uses HTMLAudioElement (<audio> / new Audio()) for UI SFX.
 * - NEVER interacts with navigator.mediaSession or iOS Now Playing / mini-player.
 * - Auto-unlocks AudioContext on first legitimate user interaction (touch/pointer/click).
 * - Pre-decodes MP3s into memory-cached AudioBuffers for zero-latency (<1ms) playback.
 * - Disposes short-lived AudioBufferSourceNodes immediately upon completion.
 * - Central volume control & mute preference stored in localStorage.
 * - Built-in debouncing & concurrency limits to prevent audio spam.
 * - Graceful degradation: failure never breaks product/UI operations.
 */

export type SfxName =
  | "cash"
  | "invest"
  | "sell"
  | "dab"
  | "reaction"
  | "like"
  | "error"
  | "send"
  | "unsend"
  | "notification"
  | "click";

// Physical MP3 files in public/sfx/
const SFX_FILES: Record<string, string> = {
  cash: "/sfx/cash.mp3",
  invest: "/sfx/cash.mp3",
  sell: "/sfx/sell.mp3",
  dab: "/sfx/dab.mp3",
  reaction: "/sfx/dab.mp3",
  like: "/sfx/dab.mp3",
  error: "/sfx/error.mp3",
};

// Base per-sound balancing so sounds are pleasant and never overpower speech or media
const BASE_VOLUMES: Record<string, number> = {
  cash: 0.28,
  invest: 0.28,
  sell: 0.26,
  dab: 0.30,
  reaction: 0.30,
  like: 0.30,
  error: 0.22,
  send: 0.22,
  unsend: 0.24,
  notification: 0.25,
  click: 0.16,
};

// State storage keys
const STORAGE_KEY_MUTED = "memore_sfx_muted";
const STORAGE_KEY_VOLUME = "memore_sfx_volume";

// In-memory singletons
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
const bufferCache = new Map<string, AudioBuffer>();
const pendingFetches = new Map<string, Promise<AudioBuffer | null>>();
const lastTriggerTimes = new Map<string, number>();

// Concurrency tracking: maximum 2 overlapping sources per sound to prevent clipping
const activeSources = new Map<string, number>();

let isMutedCached: boolean | null = null;
let volumeCached: number | null = null;
let unlockListenersAttached = false;
let isPreloading = false;

/** Get or initialize the shared AudioContext lazily */
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return null;

    try {
      audioCtx = new AudioContextClass();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = getSfxVolume();
      masterGain.connect(audioCtx.destination);
    } catch {
      return null;
    }
  }

  return audioCtx;
}

/** Check if SFX is currently muted */
export function isSfxMuted(): boolean {
  if (typeof window === "undefined") return false;
  if (isMutedCached === null) {
    try {
      isMutedCached = localStorage.getItem(STORAGE_KEY_MUTED) === "true";
    } catch {
      isMutedCached = false;
    }
  }
  return isMutedCached;
}

/** Set SFX muted state */
export function setSfxMuted(muted: boolean) {
  isMutedCached = muted;
  try {
    localStorage.setItem(STORAGE_KEY_MUTED, muted ? "true" : "false");
  } catch {}
}

/** Get global SFX volume scale (0.0 to 1.0, default 1.0) */
export function getSfxVolume(): number {
  if (typeof window === "undefined") return 1.0;
  if (volumeCached === null) {
    try {
      const v = localStorage.getItem(STORAGE_KEY_VOLUME);
      volumeCached = v !== null ? Math.max(0, Math.min(1, parseFloat(v))) : 1.0;
      if (isNaN(volumeCached)) volumeCached = 1.0;
    } catch {
      volumeCached = 1.0;
    }
  }
  return volumeCached;
}

/** Set global SFX volume scale */
export function setSfxVolume(vol: number) {
  const clamped = Math.max(0, Math.min(1, vol));
  volumeCached = clamped;
  try {
    localStorage.setItem(STORAGE_KEY_VOLUME, clamped.toFixed(2));
  } catch {}

  if (masterGain && audioCtx) {
    try {
      masterGain.gain.setValueAtTime(clamped, audioCtx.currentTime);
    } catch {}
  }
}

/** Fetch and decode an audio buffer into memory cache */
async function loadBuffer(url: string): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(url);
  if (cached) return cached;

  const pending = pendingFetches.get(url);
  if (pending) return pending;

  const fetchPromise = (async () => {
    const ctx = getAudioContext();
    if (!ctx) return null;

    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      // Decode audio data off main thread into PCM buffer
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      bufferCache.set(url, audioBuf);
      return audioBuf;
    } catch (e) {
      // Audio decoding or network failure: fail silently, log debug
      if (process.env.NODE_ENV === "development") {
        console.debug(`[SFX] Failed to load sound from ${url}:`, e);
      }
      return null;
    } finally {
      pendingFetches.delete(url);
    }
  })();

  pendingFetches.set(url, fetchPromise);
  return fetchPromise;
}

/** Preload all physical UI sound effects into memory */
export async function preloadCommonSfx(): Promise<void> {
  if (typeof window === "undefined" || isPreloading) return;
  isPreloading = true;

  try {
    const uniqueUrls = Array.from(new Set(Object.values(SFX_FILES)));
    await Promise.allSettled(uniqueUrls.map((url) => loadBuffer(url)));
  } catch {}
}

/**
 * Handle iOS Safari audio unlock on first user interaction.
 * Resumes suspended AudioContext and preloads sounds without blocking the UI.
 */
export function setupAudioUnlock() {
  if (typeof window === "undefined" || unlockListenersAttached) return;
  unlockListenersAttached = true;

  const unlock = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        void ctx.resume();
      }
      // Kick off background preload of common sounds
      void preloadCommonSfx();
    } catch {}

    // Clean up event listeners once unlocked
    const events = ["pointerdown", "touchstart", "touchend", "click", "keydown"];
    for (const evt of events) {
      window.removeEventListener(evt, unlock, { capture: true });
    }
  };

  const events = ["pointerdown", "touchstart", "touchend", "click", "keydown"];
  for (const evt of events) {
    window.addEventListener(evt, unlock, { capture: true, passive: true, once: true });
  }

  // Handle visibility changes: stop audio node spam when tab/app is in background
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && audioCtx && audioCtx.state === "running") {
      // Backgrounded: no persistent audio playback
      activeSources.clear();
    }
  });
}

// Auto-attach unlock listener in browser
if (typeof window !== "undefined") {
  setupAudioUnlock();
}

/**
 * Synthesizes ultra-low-latency UI micro-sounds (send, unsend, click, notification)
 * via Web Audio API oscillators and envelope shaping.
 * 0 bytes network payload, instant (<0.5ms) response, pure UI audio.
 */
function playSynthesizedSfx(ctx: AudioContext, name: SfxName, volume: number): void {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.connect(masterGain || ctx.destination);

  if (name === "send") {
    // Crisp ascending blip (520Hz -> 820Hz, 50ms)
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(820, now + 0.045);

    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.055);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } else if (name === "unsend") {
    // Soft descending whoosh (380Hz -> 140Hz, 70ms)
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.065);

    gain.gain.linearRampToValueAtTime(volume * 0.9, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.075);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } else if (name === "click") {
    // Subtle 15ms mechanical click (bandpass pulse)
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.015);

    gain.gain.linearRampToValueAtTime(volume * 0.7, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.016);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.018);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } else if (name === "notification") {
    // Pleasant dual chime (D5: 587Hz -> A5: 880Hz, 120ms total)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    osc2.frequency.setValueAtTime(880.0, now + 0.05);

    gain.gain.linearRampToValueAtTime(volume * 0.8, now + 0.01);
    gain.gain.setValueAtTime(volume * 0.8, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc1.connect(gain);
    osc2.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.05);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.12);

    osc2.onended = () => {
      osc1.disconnect();
      osc2.disconnect();
      gain.disconnect();
    };
  }
}

/**
 * Main sound trigger function.
 * Pure Web Audio API: instant, zero-latency, no media controls or Apple mini-player.
 *
 * @param name Name of the sound to play (e.g. "invest", "reaction", "sell", "error", "send", "unsend")
 */
export function playSfx(name: SfxName) {
  try {
    if (typeof window === "undefined" || isSfxMuted()) return;

    // Concurrency & Debouncing: prevent spamming same sound within 40ms
    const nowMs = performance.now();
    const lastTrigger = lastTriggerTimes.get(name) ?? 0;
    if (nowMs - lastTrigger < 40) return;
    lastTriggerTimes.set(name, nowMs);

    // Limit overlapping instances of the exact same sound to 2
    const currentActive = activeSources.get(name) ?? 0;
    if (currentActive >= 2) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    // Resume if suspended by browser policy
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const baseVol = BASE_VOLUMES[name] ?? 0.25;
    const effectiveVolume = baseVol * getSfxVolume();
    if (effectiveVolume <= 0.001) return;

    const url = SFX_FILES[name];

    // If sound has a physical MP3 file
    if (url) {
      const buffer = bufferCache.get(url);
      if (buffer) {
        // Instant playback from decoded memory buffer
        playBuffer(ctx, name, buffer, effectiveVolume);
      } else {
        // Buffer not yet cached: load and play immediately
        void loadBuffer(url).then((b) => {
          if (b && ctx.state === "running") {
            playBuffer(ctx, name, b, effectiveVolume);
          }
        });
      }
      return;
    }

    // Synthesized UI micro-sound for actions without physical MP3s
    playSynthesizedSfx(ctx, name, effectiveVolume);
  } catch (err) {
    // Audio is purely an enhancement; never break the product action
    if (process.env.NODE_ENV === "development") {
      console.debug(`[SFX] playSfx(${name}) ignored:`, err);
    }
  }
}

/** Play a decoded AudioBuffer through a short-lived source node */
function playBuffer(ctx: AudioContext, name: string, buffer: AudioBuffer, volume: number) {
  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1.0; // Play at exact intended speed

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);

    source.connect(gainNode);
    gainNode.connect(masterGain || ctx.destination);

    // Track active concurrency
    activeSources.set(name, (activeSources.get(name) ?? 0) + 1);

    source.onended = () => {
      try {
        source.disconnect();
        gainNode.disconnect();
      } catch {}
      const active = activeSources.get(name) ?? 1;
      activeSources.set(name, Math.max(0, active - 1));
    };

    source.start(0);
  } catch {}
}
