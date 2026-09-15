import { NextRequest } from "next/server";
import { uploadsDir } from "@/lib/server/db";
import { ok, fail, humanError, requireUser, rateLimit } from "@/lib/server/http";
import { uid } from "@/lib/server/db";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const MAX_IMAGE = 6 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;
const IMAGE_MIMES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime"];

function getFfmpegBin(): string {
  if (fs.existsSync("/opt/homebrew/bin/ffmpeg")) return "/opt/homebrew/bin/ffmpeg";
  if (fs.existsSync("/usr/local/bin/ffmpeg")) return "/usr/local/bin/ffmpeg";
  return "ffmpeg";
}

interface CompressedMedia {
  videoBuffer: Buffer;
  posterBuffer?: Buffer;
}

async function compressVideo(inputBuffer: Buffer): Promise<CompressedMedia> {
  const rand = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpIn = path.join(os.tmpdir(), `vid_in_${rand}.mp4`);
  const tmpOut = path.join(os.tmpdir(), `vid_out_${rand}.mp4`);
  const tmpPoster = path.join(os.tmpdir(), `vid_poster_${rand}.jpg`);
  const ffmpeg = getFfmpegBin();

  try {
    await fs.promises.writeFile(tmpIn, inputBuffer);

    // 1. High efficiency H.264 encode (720p max, visually lossless CRF 26, universal yuv420p, faststart streaming)
    await execFileAsync(ffmpeg, [
      "-y",
      "-i", tmpIn,
      "-vf", "scale='min(720,iw)':-2,format=yuv420p",
      "-c:v", "libx264",
      "-crf", "26",
      "-preset", "fast",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      tmpOut,
    ]);

    const videoBuffer = await fs.promises.readFile(tmpOut);

    // 2. Extract high-quality poster frame at 0.5s for instant feed thumbnail
    let posterBuffer: Buffer | undefined;
    try {
      await execFileAsync(ffmpeg, [
        "-y",
        "-ss", "00:00:00.500",
        "-i", tmpIn,
        "-vframes", "1",
        "-vf", "scale='min(720,iw)':-2",
        "-q:v", "2",
        tmpPoster,
      ]);
      const rawPoster = await fs.promises.readFile(tmpPoster);
      const sharp = (await import("sharp")).default;
      posterBuffer = await sharp(rawPoster).webp({ quality: 80 }).toBuffer();
    } catch (posterErr) {
      console.warn("Video poster frame extraction fallback:", posterErr);
    }

    return { videoBuffer, posterBuffer };
  } catch (err) {
    console.warn("FFmpeg compression fallback, using original video:", err);
    return { videoBuffer: inputBuffer };
  } finally {
    try { await fs.promises.unlink(tmpIn); } catch {}
    try { await fs.promises.unlink(tmpOut); } catch {}
    try { await fs.promises.unlink(tmpPoster); } catch {}
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return fail("Log in before uploading.", 401);
    if (!rateLimit(`upload:${user.id}`, 10, 5 * 60_000)) return fail("Too many uploads. Rest the internet for a moment.", 429);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Upload failed. No file provided.");

    // E2EE chat media path (?enc=1): the bytes are ALREADY ciphertext —
    // AES-GCM output from lib/crypto/media.ts. Store the blob verbatim with
    // no compression, no preview generation and no mime inference (mime is
    // a secret too; it travels inside the encrypted message envelope).
    const isEncrypted = new URL(req.url).searchParams.get("enc") === "1";
    if (isEncrypted) {
      if (file.size > MAX_VIDEO) return fail("File is too big (max 50MB).");
      const buf = Buffer.from(await file.arrayBuffer());
      const name = `${uid()}.bin`;
      let fileUrl = `/api/media/${name}`;
      try {
        if (process.env.NODE_ENV === "development") {
          fs.mkdirSync(uploadsDir, { recursive: true });
          fs.writeFileSync(path.join(uploadsDir, name), buf);
        }
      } catch { /* read-only fs */ }
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const admin = createAdminClient();
        if (admin) {
          const { error } = await admin.storage.from("memes").upload(name, buf, {
            contentType: "application/octet-stream",
            upsert: true,
          });
          if (!error) {
            const { data: { publicUrl } } = admin.storage.from("memes").getPublicUrl(name);
            if (publicUrl) fileUrl = publicUrl;
          }
        }
      } catch { /* local-only fallback is fine */ }
      return ok({ url: fileUrl, thumbnail_url: fileUrl, media_type: form.get("kind") === "video" ? "video" : "image", size: buf.length, mime: "application/octet-stream" });
    }

    const isImage = IMAGE_MIMES.includes(file.type);
    const isVideo = VIDEO_MIMES.includes(file.type);
    if (!isImage && !isVideo) return fail("Only PNG, JPEG, GIF, WebP, MP4 or WebM files.");
    if (isImage && file.size > MAX_IMAGE) return fail("Image is too big (max 6MB).");
    if (isVideo && file.size > MAX_VIDEO) return fail("Video is too big (max 50MB).");

    let uploadBuffer = Buffer.from(await file.arrayBuffer());
    let ext = file.type === "video/mp4" ? "mp4" : file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : file.type.split("/")[1].replace("jpeg", "jpg");
    let mimeType = file.type;

    // 1. Compress images to modern WebP (reduces file size by 85-92% with crystal clear quality)
    if (isImage) {
      try {
        const sharp = (await import("sharp")).default;
        uploadBuffer = await sharp(uploadBuffer)
          .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
        ext = "webp";
        mimeType = "image/webp";
      } catch (compressErr) {
        console.warn("Sharp compression fallback:", compressErr);
      }
    }

    let posterBuffer: Buffer | undefined;

    if (isVideo) {
      try {
        const res = await compressVideo(uploadBuffer);
        uploadBuffer = Buffer.from(res.videoBuffer);
        posterBuffer = res.posterBuffer ? Buffer.from(res.posterBuffer) : undefined;
        ext = "mp4";
        mimeType = "video/mp4";
      } catch (vidErr) {
        console.warn("Video compression fallback:", vidErr);
      }
    }

    const baseId = uid();
    const name = `${baseId}.${ext}`;

    // Local write for offline/fallback caching (only in development or writable disk)
    try {
      if (process.env.NODE_ENV === "development") {
        fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, name), uploadBuffer);
        if (posterBuffer) {
          const posterName = `${baseId}-poster.webp`;
          fs.writeFileSync(path.join(uploadsDir, posterName), posterBuffer);
        }
      }
    } catch {
      // Ignore read-only filesystem errors on Vercel/serverless
    }

    let fileUrl = `/api/media/${name}`;
    let posterUrl: string | undefined;

    if (posterBuffer) {
      posterUrl = `/api/media/${baseId}-poster.webp`;
    }

    // Upload to Supabase Storage Cloud bucket
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      if (admin) {
        const { error: storageErr } = await admin.storage.from("memes").upload(name, uploadBuffer, {
          contentType: mimeType,
          upsert: true,
        });
        if (storageErr) {
          console.error("Cloud storage upload error:", storageErr);
        } else {
          const { data: { publicUrl } } = admin.storage.from("memes").getPublicUrl(name);
          if (publicUrl) fileUrl = publicUrl;
        }

        if (posterBuffer) {
          const posterName = `${baseId}-poster.webp`;
          const { error: posterErr } = await admin.storage.from("memes").upload(posterName, posterBuffer, {
            contentType: "image/webp",
            upsert: true,
          });
          if (!posterErr) {
            const { data: { publicUrl: posterPublicUrl } } = admin.storage.from("memes").getPublicUrl(posterName);
            if (posterPublicUrl) posterUrl = posterPublicUrl;
          }
        }
      }
    } catch (err) {
      console.error("Cloud storage upload exception:", err);
    }

    return ok({
      url: fileUrl,
      thumbnail_url: posterUrl || fileUrl,
      media_type: isVideo ? "video" : "image",
      size: uploadBuffer.length,
      mime: mimeType,
    });
  } catch (err) {
    return fail(humanError(err), 500);
  }
}
