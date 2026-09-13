"use client";
// Instagram embed via Instagram's official public embed iframe.
// We only embed public posts/reels through Instagram's own endpoint,
// with visible attribution and a link back to the original.
import React, { useState } from "react";
import Link from "next/link";

export function igEmbedSrc(url: string): string {
  // https://www.instagram.com/p/<code>/ or /reel/<code>/ → + /embed (captioned for posts)
  const clean = url.split("?")[0].replace(/\/+$/, "");
  return clean.includes("/p/") ? `${clean}/embed/captioned/` : `${clean}/embed/`;
}

export function InstagramEmbed({ url, handle, compact = false }: { url: string; handle: string | null; compact?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="w-full flex flex-col items-center" style={{ background: "#000" }}>
      <div className="relative w-full max-w-[380px]">
        {!loaded && (
          <div className="absolute inset-0 skeleton !rounded-none" style={{ minHeight: compact ? 380 : 470 }} aria-hidden />
        )}
        <iframe
          src={igEmbedSrc(url)}
          title={handle ? `Instagram post by @${handle}` : "Instagram post"}
          className={`w-full border-0 transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
          style={{ height: compact ? 420 : 500, maxWidth: 380 }}
          scrolling="no"
          onLoad={() => setLoaded(true)}
          loading="lazy"
          allowFullScreen
        />
      </div>
      {handle && (
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] muted py-1.5 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          via Instagram <b style={{ color: "var(--lime)" }}>@{handle}</b> ↗
        </Link>
      )}
    </div>
  );
}
