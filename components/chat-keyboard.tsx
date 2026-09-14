"use client";
// MEMORE ChatKeyboard — the in-app keyboard for iPhone. iOS 26's native
// keyboard is unusable inside a full-screen PWA chat (it shoves the page
// around and reports garbage viewport sizes), so on iOS the composer input is
// read-only and this keyboard types into it instead. It lives INSIDE the
// chat's flex column, so the message list simply shrinks around it — no
// viewport math, no native keyboard, no form-assistant bar. Android and
// desktop never see it: they keep the native input.

import { useCallback, useRef, useState } from "react";

const LETTER_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];
const NUM_ROW = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const SYM_ROWS = [
  ["-", "/", ":", ";", "(", ")", "$", "&", "@", '"'],
  ["?", "!", ".", ",", "'", "+"],
];
const EMOJIS = [
  "😀", "😂", "🥲", "😍", "🤔", "😎", "🥳", "😭", "😤", "😡",
  "🔥", "💯", "👀", "💀", "🤡", "🙏", "👏", "👍", "❤️", "✨",
  "🎉", "🫡", "🤝", "🚀",
];

type Shift = { once: boolean; caps: boolean }; // once = capitalise next letter

export function ChatKeyboard({
  value,
  onInsert,
  onBackspace,
  onSend,
  onClose,
}: {
  value: string;
  onInsert: (ch: string) => void;
  onBackspace: () => void;
  onSend: () => void;
  onClose: () => void;
}) {
  const [layer, setLayer] = useState<"abc" | "123" | "emoji">("abc");
  const [shift, setShift] = useState<Shift>({ once: true, caps: false });
  const shiftResetTimer = useRef<number | null>(null);
  const repDelay = useRef<number | null>(null);
  const repRepeat = useRef<number | null>(null);

  const buzz = useCallback(() => { try { navigator.vibrate?.(8); } catch { /* unsupported */ } }, []);

  // An empty draft (just sent or fully deleted) always re-arms the capital.
  const shiftOn = shift.caps || shift.once || value === "";

  const insert = useCallback((raw: string) => {
    const ch = shiftOn && /^[a-z]$/.test(raw) ? raw.toUpperCase() : raw;
    onInsert(ch);
    if (shift.once) setShift((s) => ({ ...s, once: false }));
  }, [shiftOn, shift.once, onInsert]);

  const tapSpace = useCallback(() => {
    onInsert(" ");
    if (/[.!?]$/.test(value)) setShift((s) => ({ ...s, once: true }));
  }, [value, onInsert]);

  const tapShift = useCallback(() => {
    if (shiftResetTimer.current) {
      window.clearTimeout(shiftResetTimer.current);
      shiftResetTimer.current = null;
      setShift({ once: false, caps: true }); // double-tap = caps lock
      return;
    }
    shiftResetTimer.current = window.setTimeout(() => { shiftResetTimer.current = null; }, 280);
    setShift((s) => (s.caps ? { once: false, caps: false } : { once: !s.once, caps: false }));
  }, []);

  const startRepeat = useCallback(() => {
    onBackspace();
    repDelay.current = window.setTimeout(() => {
      repRepeat.current = window.setInterval(onBackspace, 55);
    }, 380);
  }, [onBackspace]);

  const endRepeat = useCallback(() => {
    if (repDelay.current) window.clearTimeout(repDelay.current);
    if (repRepeat.current) window.clearInterval(repRepeat.current);
    repDelay.current = null;
    repRepeat.current = null;
  }, []);

  const key = useCallback(
    (
      label: React.ReactNode,
      onPress: () => void,
      extra = "",
      wide = false,
      onRelease?: () => void,
    ) => (
      <button
        type="button"
        aria-label={typeof label === "string" ? label : "key"}
        className={`kb-key ${extra} ${wide ? "flex-[1.6]" : "flex-1"}`}
        onPointerDown={(e) => { e.preventDefault(); buzz(); onPress(); }}
        onPointerUp={() => onRelease?.()}
        onPointerLeave={() => onRelease?.()}
        onPointerCancel={() => onRelease?.()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {label}
      </button>
    ),
    [buzz],
  );

  const shiftLabel = (
    <span className={shiftOn ? "text-[#C8FF3D]" : ""} style={shift.caps ? { borderBottom: "2px solid #C8FF3D" } : undefined}>
      ⇧
    </span>
  );

  return (
    <div
      className="kb-root relative z-30 shrink-0 border-t border-[#7C4DFF]/70 bg-[#0c0c0c] px-1.5 pt-1.5"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
    >
      <button
        type="button"
        aria-label="Hide keyboard"
        className="absolute right-2 top-1 z-10 flex h-6 w-9 items-center justify-center rounded-md text-[13px] text-[#C084FC] transition-transform active:scale-90"
        onPointerDown={(e) => { e.preventDefault(); onClose(); }}
      >
        ⌄
      </button>

      {layer === "emoji" ? (
        <div className="grid grid-cols-8 gap-1 pb-0.5 pt-1">
          {EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              className="kb-key !h-10 text-[20px]"
              onPointerDown={(e) => { e.preventDefault(); buzz(); onInsert(em); }}
            >
              {em}
            </button>
          ))}
          <button
            type="button"
            aria-label="Backspace"
            className="kb-key kb-key-special !h-10 text-[14px]"
            onPointerDown={(e) => { e.preventDefault(); buzz(); onBackspace(); }}
          >
            ⌫
          </button>
        </div>
      ) : layer === "abc" ? (
        <>
          <div className="flex gap-1 pb-1.5">
            {LETTER_ROWS[0].map((c) => key(shiftOn ? c.toUpperCase() : c, () => insert(c)))}
          </div>
          <div className="flex gap-1 pb-1.5 px-4">
            {LETTER_ROWS[1].map((c) => key(shiftOn ? c.toUpperCase() : c, () => insert(c)))}
          </div>
          <div className="flex gap-1 pb-1.5">
            {/* eslint-disable react-hooks/refs -- ref access only happens inside the pointer handlers */}
            {key(shiftLabel, tapShift, "kb-key-special", true)}
            {LETTER_ROWS[2].map((c) => key(shiftOn ? c.toUpperCase() : c, () => insert(c)))}
            {key("⌫", startRepeat, "kb-key-special", true, endRepeat)}
            {/* eslint-enable react-hooks/refs */}
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-1 pb-1.5">
            {NUM_ROW.map((c) => key(c, () => insert(c)))}
          </div>
          <div className="flex gap-1 pb-1.5">
            {SYM_ROWS[0].map((c) => key(c, () => insert(c)))}
          </div>
          <div className="flex gap-1 pb-1.5">
            {/* eslint-disable react-hooks/refs -- ref access only happens inside the pointer handlers */}
            {SYM_ROWS[1].map((c) => key(c, () => insert(c)))}
            {key("⌫", startRepeat, "kb-key-special", true, endRepeat)}
            {/* eslint-enable react-hooks/refs */}
          </div>
        </>
      )}

      <div className="flex gap-1.5">
        {key(
          layer === "abc" ? "?123" : "ABC",
          () => setLayer((l) => (l === "abc" ? "123" : "abc")),
          "kb-key-special text-[13px]",
          true,
        )}
        {key(
          "😂",
          () => setLayer((l) => (l === "emoji" ? "abc" : "emoji")),
          `kb-key-special text-[15px] ${layer === "emoji" ? "!bg-[#C8FF3D] !text-[#0a0a0a]" : ""}`,
        )}
        {key("space", () => (layer === "abc" ? tapSpace() : onInsert(" ")), "flex-[4] !text-[13px]")}
        {key("↵", onSend, "kb-key-send flex-[1.6]")}
      </div>
    </div>
  );
}
