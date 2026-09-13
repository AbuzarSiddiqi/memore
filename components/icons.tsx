"use client";
// MEMORE doodle icon set — one hand-drawn stroke family, zero emojis.
// Every icon lives on a 24×24 grid, 2px round-capped strokes, so the whole
// app reads like it was inked with the same pen.
import React from "react";

export type IconName =
  | "home" | "chart" | "chart-down" | "lock" | "user" | "users" | "trophy" | "swords"
  | "bell" | "gear" | "shield" | "hand" | "search" | "upload" | "skull" | "target"
  | "flame" | "rocket" | "gem" | "sprout" | "egg" | "alert" | "brain" | "star"
  | "repeat" | "flag" | "megaphone" | "share" | "comment" | "ghost" | "clock"
  | "inbox" | "receipt" | "volume-off" | "volume-on" | "play" | "video" | "camera"
  | "coin" | "bird" | "paint" | "globe" | "spiral" | "crown" | "orb" | "bag"
  | "medal" | "bolt" | "storm" | "laugh" | "paw" | "cat" | "laptop" | "torii"
  | "ball" | "tv" | "clapper" | "melt" | "grave" | "sun" | "wallet" | "eye"
  | "snow" | "battery"
  | "arrow-left" | "arrow-right" | "check" | "x" | "dots" | "chevron-down" | "plus" | "minus";

const P: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3.5 11.2 12 4l8.5 7.2" />
      <path d="M5.6 10.4V20h12.8v-9.6" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M5 16.5l4.4-5.4 3.4 3L18.6 7" />
      <path d="M18.6 10.6V7h-3.6" />
    </>
  ),
  "chart-down": (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M5 7.5l4.4 5.4 3.4-3 5.8 7" />
      <path d="M18.6 13.4V17h-3.6" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="3" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <circle cx="12" cy="15.2" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.8 20.4c1.5-3.3 4.1-5 7.2-5s5.7 1.7 7.2 5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.4" />
      <path d="M2.8 19.8c1.3-2.9 3.6-4.4 6.2-4.4s4.9 1.5 6.2 4.4" />
      <path d="M15.5 5.5a3.4 3.4 0 0 1 0 6" />
      <path d="M17.5 15.6c1.8.5 3.1 1.9 3.9 4" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H4.5a3.5 3.5 0 0 0 3.6 3.9M16 5h3.5a3.5 3.5 0 0 1-3.6 3.9" />
      <path d="M12 13v3.5M8.5 20.5h7" />
      <path d="M12 16.5c-1.8 0-2.8 1.4-3.2 4M12 16.5c1.8 0 2.8 1.4 3.2 4" />
    </>
  ),
  swords: (
    <>
      <path d="M4.5 4 12 11.5M4.5 4v3.4M4.5 4h3.4" />
      <path d="M19.5 4 12 11.5M19.5 4v3.4M19.5 4h-3.4" />
      <path d="M6.4 17.6 9 15M17.6 17.6 15 15M4.5 19.5 8.2 15.8M19.5 19.5l-3.7-3.7" />
    </>
  ),
  bell: (
    <>
      <path d="M6.2 10.2a5.8 5.8 0 0 1 11.6 0c0 3.9 1.5 5.3 1.5 5.3H4.7s1.5-1.4 1.5-5.3Z" />
      <path d="M10 19a2.1 2.1 0 0 0 4 0" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3v2.6M12 18.4V21M21 12h-2.6M5.6 12H3M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9M18.4 18.4l-1.9-1.9M7.5 7.5 5.6 5.6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 19 6v5.4c0 4.3-2.9 7.4-7 9.4-4.1-2-7-5.1-7-9.4V6l7-2.8Z" />
      <path d="M9.2 11.8l2 2 3.6-3.9" />
    </>
  ),
  hand: (
    <>
      <path d="M5.2 12V7.2a1.5 1.5 0 0 1 3 0v3.6M8.2 10.8V5.6a1.5 1.5 0 0 1 3 0v5M11.2 10.6V6.4a1.5 1.5 0 0 1 3 0v5.4M14.2 11.8V8.4a1.5 1.5 0 0 1 3 0v6a6.4 6.4 0 0 1-6.4 6.4h-.4a6.4 6.4 0 0 1-5.2-2.7l-2.3-3.4a1.6 1.6 0 0 1 2.5-2L7 14.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.3" />
      <path d="M15.8 15.8 21 21" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V4.5M12 4.5 7.8 8.7M12 4.5l4.2 4.2" />
      <path d="M4.5 15v3a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5v-3" />
    </>
  ),
  skull: (
    <>
      <path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.3 4.3 2.9 5.3V19a2 2 0 0 0 2 2h4.2a2 2 0 0 0 2-2v-3.7c1.6-1 2.9-2.8 2.9-5.3a7 7 0 0 0-7-7Z" />
      <circle cx="9.3" cy="10.6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="10.6" r="1.5" fill="currentColor" stroke="none" />
      <path d="M10.6 21v-2.2M13.4 21v-2.2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="7.8" />
      <circle cx="12" cy="12" r="3.9" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  flame: (
    <>
      <path d="M12 3.5c.6 2.8-.4 4.5-1.9 6C8.5 11.2 7 12.8 7 15.4A5 5 0 0 0 12 20.5a5 5 0 0 0 5-5.1c0-1.9-.8-3.2-1.7-4.4-.5.9-1.1 1.4-1.9 1.8.3-3.4-.2-6.6-1.4-9.3Z" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 3.5c2.6 1.4 4.2 4 4.2 7.3 0 1.7-.4 3.2-1.1 4.6H8.9a10.4 10.4 0 0 1-1.1-4.6c0-3.3 1.6-5.9 4.2-7.3Z" />
      <circle cx="12" cy="9.6" r="1.7" />
      <path d="M8.9 13.5 6.4 16c-.9.9-.9 2.4-.9 3.5 1.1 0 2.6 0 3.5-.9l2.4-2.4M15.1 13.5l2.5 2.5c.9.9.9 2.4.9 3.5-1.1 0-2.6 0-3.5-.9l-2.4-2.4" />
      <path d="M12 17.5v3" />
    </>
  ),
  gem: (
    <>
      <path d="M7 4h10l3.5 5L12 20.5 3.5 9 7 4Z" />
      <path d="M3.5 9h17M9.5 4 8 9l4 11.5L16 9l-1.5-5" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 20.5v-7" />
      <path d="M12 13.5C12 10 9.8 7.5 6 7c.3 3.8 2.4 6.5 6 6.5Z" />
      <path d="M12 11.5c.2-3.4 2.2-5.6 6-6-.3 3.6-2.3 6-6 6Z" />
      <path d="M8.5 20.5h7" />
    </>
  ),
  egg: (
    <>
      <path d="M12 3.5c3.2 0 5.5 4 5.5 8.2 0 4.6-2.3 8-5.5 8s-5.5-3.4-5.5-8C6.5 7.5 8.8 3.5 12 3.5Z" />
      <path d="M9.5 9.5c.8.8.8 2 0 2.8M14.5 9.5c-.8.8-.8 2 0 2.8" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 21 19.5H3L12 4Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  brain: (
    <>
      <path d="M11.2 4.5a3 3 0 0 0-5.6 1.2 3 3 0 0 0-1.9 4.7 3.2 3.2 0 0 0 .7 5A3 3 0 0 0 9.5 19c.9.4 1.7.1 1.7-1V4.5Z" />
      <path d="M12.8 4.5a3 3 0 0 1 5.6 1.2 3 3 0 0 1 1.9 4.7 3.2 3.2 0 0 1-.7 5A3 3 0 0 1 14.5 19c-.9.4-1.7.1-1.7-1V4.5Z" />
    </>
  ),
  star: (
    <path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8L12 3.8Z" />
  ),
  repeat: (
    <>
      <path d="M4 9a5 5 0 0 1 5-5h9.5" />
      <path d="M15.5 1.5 19 4l-3.5 2.5" />
      <path d="M20 15a5 5 0 0 1-5 5H5.5" />
      <path d="M8.5 22.5 5 20l3.5-2.5" />
    </>
  ),
  flag: (
    <>
      <path d="M5.5 21V4" />
      <path d="M5.5 5c2.2-1.6 4.3-1.6 6.5 0s4.3 1.6 6.5 0v8c-2.2 1.6-4.3 1.6-6.5 0s-4.3-1.6-6.5 0" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H8l8.5 4.5v-15L8 9H5.5A1.5 1.5 0 0 0 4 10.5Z" />
      <path d="M19.5 9.5a4 4 0 0 1 0 5" />
      <path d="M8.5 15.5 10 20.5" />
    </>
  ),
  share: (
    <>
      <path d="M20.6 3.4 L4 10.6 L10.9 13.3 L13.5 20 L20.6 3.4 Z" />
      <path d="M10.9 13.3 L20.6 3.4" />
      <path d="M12.6 8.9 C 12.9 10.3, 13.4 10.9, 14.8 11.3 C 13.4 11.7, 12.9 12.3, 12.6 13.7 C 12.3 12.3, 11.8 11.7, 10.4 11.3 C 11.8 10.9, 12.3 10.3, 12.6 8.9 Z" fill="currentColor" stroke="none" />
    </>
  ),
  comment: (
    <>
      <path d="M4 8a3.5 3.5 0 0 1 3.5-3.5h9A3.5 3.5 0 0 1 20 8v5a3.5 3.5 0 0 1-3.5 3.5H10L5.2 20l.6-3.7A3.5 3.5 0 0 1 4 13V8Z" />
      <path d="M8.5 9.8h.01M12 9.8h.01M15.5 9.8h.01" strokeWidth="2.6" />
    </>
  ),
  ghost: (
    <>
      <path d="M5 20V11a7 7 0 0 1 14 0v9l-2.3-1.8L14.4 20l-2.4-1.8L9.6 20l-2.3-1.8L5 20Z" />
      <circle cx="9.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5V12l3 2.4" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13.5 6 5h12l2 8.5" />
      <path d="M4 13.5h4.5l1 2.5h5l1-2.5H20V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4.5Z" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12V21l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21V3.5Z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </>
  ),
  "volume-off": (
    <>
      <path d="M4 10v4h3l4.5 4V6L7 10H4Z" />
      <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
    </>
  ),
  "volume-on": (
    <>
      <path d="M4 10v4h3l4.5 4V6L7 10H4Z" />
      <path d="M15 9.5a4 4 0 0 1 0 5M17.5 7.5a7 7 0 0 1 0 9" />
    </>
  ),
  play: <path d="M8 5.5 18.5 12 8 18.5v-13Z" />,
  video: (
    <>
      <rect x="3" y="6.5" width="13" height="11" rx="2.5" />
      <path d="m16 11 5-3v8l-5-3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.4-2h5.2L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8Z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.2c1.7.8 2.6.9 4.3.4-.6 1.9-1.7 2.9-3.5 3.2M12 16.8c-1.7-.8-2.6-.9-4.3-.4.6-1.9 1.7-2.9 3.5-3.2" />
      <path d="M12 7.5v9" />
    </>
  ),
  bird: (
    <>
      <path d="M20 5.5c-.8 7-4.7 10.5-10.4 10.5H5.5L4 13.5c3.5-.5 5.5-2 6.6-4.4.8.6 1.6.8 2.5.6C14.5 7 17 5.8 20 5.5Z" />
      <path d="M9.5 16c.5 1.8.2 3.2-.9 4.5M7 13.5 5 15" />
    </>
  ),
  paint: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 1.9-.9 1.5-2-.5-1.4.3-2.5 1.9-2.5h1.8c2 0 3.3-1.2 3.3-3.5C20.5 7 16.7 3.5 12 3.5Z" />
      <circle cx="8" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="7" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M3.8 12h16.4" />
      <path d="M12 3.8c2.3 2.2 3.5 5 3.5 8.2s-1.2 6-3.5 8.2c-2.3-2.2-3.5-5-3.5-8.2s1.2-6 3.5-8.2Z" />
    </>
  ),
  spiral: (
    <>
      <path d="M12 12.2c0-1.4 1.1-2.4 2.4-2.2 1.6.2 2.6 1.6 2.4 3.4-.3 2.3-2.3 3.9-4.9 3.6-3-.4-5-2.9-4.6-6.2C7.8 7 10.9 4.6 14.8 5c4.2.4 7 3.9 6.5 8.2" />
    </>
  ),
  crown: (
    <>
      <path d="M4 8.5 8 12l4-6 4 6 4-3.5-1.6 10H5.6L4 8.5Z" />
      <path d="M6.5 21h11" />
    </>
  ),
  orb: (
    <>
      <circle cx="12" cy="10" r="6" />
      <path d="M9 5.5c-1 1.2-1.5 2.7-1.4 4.4M12 16v2.5M8.5 20.5h7M9.8 18.5h4.4" />
    </>
  ),
  bag: (
    <>
      <path d="M5.5 8.5h13l-1 12h-11l-1-12Z" />
      <path d="M8.8 11V7a3.2 3.2 0 0 1 6.4 0v4" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="14.5" r="5.3" />
      <path d="m12 12.4.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3.9-1.8Z" />
      <path d="M8.5 10.4 5 3.5h4.5L12 8l2.5-4.5H19l-3.5 6.9" />
    </>
  ),
  bolt: <path d="M13.5 3 6 13.5h4.5L10 21l7.5-10.5H13L13.5 3Z" />,
  storm: (
    <>
      <path d="M7 14.5a4.5 4.5 0 0 1-.4-9A5.5 5.5 0 0 1 17 7.5a3.6 3.6 0 0 1 .5 7H7Z" />
      <path d="M12.5 14 10 18h3.5L11 22.5" />
    </>
  ),
  laugh: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M8 13.5c.6 2 2 3.2 4 3.2s3.4-1.2 4-3.2c-2.6.8-5.4.8-8 0Z" fill="currentColor" stroke="none" />
      <path d="M8.2 9.2c.8-.9 1.9-.9 2.7 0M13.1 9.2c.8-.9 1.9-.9 2.7 0" />
    </>
  ),
  paw: (
    <>
      <ellipse cx="7" cy="9.5" rx="1.7" ry="2.2" />
      <ellipse cx="12" cy="7.8" rx="1.7" ry="2.2" />
      <ellipse cx="17" cy="9.5" rx="1.7" ry="2.2" />
      <path d="M12 12c2.8 0 5 2 5 4.4 0 1.9-1.3 3.1-3 3.1-1 0-1.4-.4-2-.4s-1 .4-2 .4c-1.7 0-3-1.2-3-3.1C7 14 9.2 12 12 12Z" />
    </>
  ),
  cat: (
    <>
      <path d="M4.5 5 7 8.5a7.5 7.5 0 0 1 10 0L19.5 5c.4 2.6.5 5-.3 7A8 8 0 0 1 12 20a8 8 0 0 1-7.2-8c-.8-2-.7-4.4-.3-7Z" />
      <path d="M9.3 13h.01M14.7 13h.01" strokeWidth="2.6" />
      <path d="M10.8 16.2c.8.5 1.6.5 2.4 0" />
    </>
  ),
  laptop: (
    <>
      <rect x="4.5" y="5" width="15" height="10.5" rx="1.8" />
      <path d="M2.5 18.5h19" />
      <path d="M10 8.5l-2 2 2 2M14 8.5l2 2-2 2" />
    </>
  ),
  torii: (
    <>
      <path d="M3.5 6.5c5.5-1.8 11.5-1.8 17 0M4.5 9.5h15" />
      <path d="M6.5 6.8 6 20.5M17.5 6.8l.5 13.7" />
      <path d="M9.5 9.5v5h5v-5" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 8.2l3.4 2.5-1.3 4h-4.2l-1.3-4L12 8.2Z" />
      <path d="M12 3.8v4.4M4.4 9.9l4.2.8M19.6 9.9l-4.2.8M7.5 19.3l2.4-3.6M16.5 19.3l-2.4-3.6" />
    </>
  ),
  tv: (
    <>
      <rect x="3.5" y="7" width="17" height="13" rx="2.5" />
      <path d="m8 3.5 4 3.5 4-3.5" />
      <path d="M8 11.5h3M8 15h5" />
    </>
  ),
  clapper: (
    <>
      <rect x="3.5" y="9" width="17" height="11" rx="2" />
      <path d="M3.8 9 5 4.5l15.5 2.1-.6 2.4" />
      <path d="m8.2 5.2 2.2 3M12.7 5.8l2.2 3M17.2 6.4l2 2.8" />
    </>
  ),
  melt: (
    <>
      <path d="M5 11.5a7 7 0 0 1 14 0v6c0 1.6-1 2.5-2.3 2.5-1 0-1.5-.5-2.4-.5-.8 0-1.2.8-2.3.8s-1.5-.8-2.3-.8c-.9 0-1.4.5-2.4.5C6 20.5 5 19.6 5 18v-6.5Z" />
      <path d="M9.3 10.2h.01M14.7 10.2h.01" strokeWidth="2.6" />
      <path d="M9.5 14c1.6 1 3.4 1 5 0" />
    </>
  ),
  grave: (
    <>
      <path d="M6.5 20.5V10a5.5 5.5 0 0 1 11 0v10.5" />
      <path d="M4.5 20.5h15" />
      <path d="M12 8.5v6M9.8 10.5h4.4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3.5V6M12 18v2.5M20.5 12H18M6 12H3.5M18 6l-1.8 1.8M7.8 16.2 6 18M18 18l-1.8-1.8M7.8 7.8 6 6" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11v2.5" />
      <path d="M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5h13a.5.5 0 0 0 .5-.5V8a.5.5 0 0 0-.5-.5H4Z" />
      <circle cx="16" cy="13.7" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  eye: (
    <>
      <path d="M3 12s3.4-6 9-6 9 6 9 6-3.4 6-9 6-9-6-9-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  snow: (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
      <path d="M12 6.4l1.8-1.8M12 6.4l-1.8-1.8M12 17.6l1.8 1.8M12 17.6l-1.8 1.8" />
    </>
  ),
  battery: (
    <>
      <rect x="3" y="8" width="15.5" height="8" rx="2" />
      <path d="M21.5 11v2" strokeWidth="2.6" />
      <path d="M6 11v2M9 11v2" />
    </>
  ),
  "arrow-left": (
    <>
      <path d="M19.5 12H5" />
      <path d="m11 6-6 6 6 6" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M4.5 12H19" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5L19.5 6.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  dots: (
    <>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  "chevron-down": <path d="m5.5 9 6.5 6.5L18.5 9" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
};

export function Icon({
  name, size = 18, strokeWidth = 2, className = "", style, filled = false, ariaHidden = true,
}: {
  name: IconName; size?: number; strokeWidth?: number; className?: string;
  style?: React.CSSProperties; filled?: boolean; ariaHidden?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
    >
      {P[name]}
    </svg>
  );
}

/** Big tilted sticker circle used by empty states / hero icons. */
export function IconSticker({ name, size = 64, bg = "var(--lime)", color = "#0a0a0a", rotate = -6, className = "" }: {
  name: IconName; size?: number; bg?: string; color?: string; rotate?: number; className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[36%_64%_38%_62%/60%_36%_64%_40%] border-2 border-[#0a0a0a] shrink-0 ${className}`}
      style={{ width: size, height: size, background: bg, color, transform: `rotate(${rotate}deg)`, boxShadow: "3px 3px 0 rgba(0,0,0,0.55)" }}
      aria-hidden
    >
      <Icon name={name} size={Math.round(size * 0.52)} strokeWidth={2.1} />
    </span>
  );
}

/** icon per notification type (type strings come from the API) */
export const NOTIFICATION_ICONS: Record<string, IconName> = {
  invest_made: "coin",
  pick_up: "rocket",
  pick_down: "chart-down",
  trending: "flame",
  remix: "repeat",
  follow: "user",
  battle_win: "swords",
  achievement: "trophy",
  comment: "comment",
  call_won: "megaphone",
  call_lost: "megaphone",
  mission: "target",
};

/** icon per achievement id (ids come from the API; stored icon field ignored) */
export const ACHIEVEMENT_ICONS: Record<string, IconName> = {
  "first-invest": "coin",
  "early-bird": "bird",
  "ten-x": "rocket",
  "meme-hunter": "target",
  "aura-legend": "crown",
  creator: "paint",
  viral: "flame",
  remixer: "repeat",
  "diamond-hands": "gem",
  "perfect-exit": "target",
  "called-the-top": "chart",
};

/** icon per profile title id */
export const TITLE_ICONS: Record<string, IconName> = {
  AURA_LEGEND: "crown",
  MEME_ORACLE: "orb",
  DIAMOND_HANDS: "gem",
  TREND_HUNTER: "target",
  BAGHOLDER: "bag",
};
