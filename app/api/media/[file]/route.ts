import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { uploadsDir } from "@/lib/server/db";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[a-zA-Z0-9._-]+$/.test(file)) return new NextResponse("Not found", { status: 404 });
  const full = path.join(uploadsDir, file);
  if (!fs.existsSync(full)) return new NextResponse("Not found", { status: 404 });
  const ext = file.split(".").pop() ?? "";
  const buf = fs.readFileSync(full);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
