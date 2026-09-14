// Text-meme helpers shared by server (validation, previews) and client (rendering).
// Pure functions only — no "use client", no React.

/** Collapse a multiline text post into a one-line preview (for notifications,
 * chat list rows, meta contexts — never rendered as the post itself). */
export function oneLine(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1).trimEnd() + "…" : flat;
}

/** Hashtags inside a text post: #word → word (sanitized like existing tags). */
export function parseHashtags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/#([a-zA-Z0-9_]{1,30})/g)) {
    const tag = m[1].toLowerCase();
    if (tag) out.add(tag);
  }
  return [...out].slice(0, 6);
}

/** Mentions inside a text post: @username (no validation of existence here). */
export function parseMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/@([a-zA-Z0-9_]{3,30})/g)) out.add(m[1]);
  return [...out];
}
