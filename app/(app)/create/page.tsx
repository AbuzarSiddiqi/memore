"use client";
// CREATE MEME — minimal: upload → top/bottom text → Post.
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, useSession, useToast } from "@/lib/client";
import type { MemeView } from "@/lib/types";
import { NeoButton, Sheet } from "@/components/ui";

const CATEGORIES = ["college", "gaming", "anime", "football", "programming", "bollywood", "technology", "workplace", "indian", "chaos"];
const TEMPLATES = ["img-002", "img-013", "img-016", "img-023", "img-024", "img-072"].map((id) => `/memes/${id}.svg`);

type Upload = { url: string; thumbnail_url?: string; media_type: "image" | "video"; width?: number; height?: number; duration?: number };

async function uploadFile(file: File): Promise<Upload> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload failed. Try again.");
  return data;
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="mt-10 text-center hd muted text-sm">Loading studio…</div>}>
      <CreateInner />
    </Suspense>
  );
}

function CreateInner() {
  const params = useSearchParams();
  const remixId = params.get("remix");
  const { data: remixData } = useApi<{ meme: MemeView }>(remixId ? `/api/memes/${remixId}` : null);

  return (
    <div className="mt-2 pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/home" className="text-xl" aria-label="Back">←</Link>
          <h1 className="hd text-[22px]">{remixId ? "Remix" : "Create"}</h1>
        </div>
        <PostButton remixId={remixId} remixCategory={remixData?.meme.category} />
      </div>

      <Studio remixId={remixId} remixCategory={remixData?.meme.category} />

      {remixData && (
        <p className="text-[12px] muted mt-3 text-center">
          🔄 Remixed from @{remixData.meme.creator.username} — attribution stays forever.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- canvas studio
function Studio({ remixId, remixCategory }: { remixId: string | null; remixCategory?: string }) {
  void remixCategory;
  const toast = useToast();
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoPoster, setVideoPoster] = useState<string | null>(null);
  const [topText, setTopText] = useState("");
  const [bottomText, setBottomText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data: remixSource } = useApi<{ meme: MemeView }>(remixId ?? null);

  useEffect(() => {
    if (remixSource?.meme.media_type === "image") setBaseImage(remixSource.meme.media_url);
  }, [remixSource]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      if (file.type.startsWith("video")) {
        const duration = await new Promise<number>((resolve, reject) => {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.onloadedmetadata = () => resolve(v.duration);
          v.onerror = () => reject(new Error("That video couldn't be read."));
          v.src = URL.createObjectURL(file);
        });
        if (duration > 90) throw new Error("Keep videos under 90 seconds. Memes are fast.");
        const up = await uploadFile(file);
        setVideoUrl(up.url);
        setVideoPoster(up.thumbnail_url || null);
        setVideoDuration(duration);
        setBaseImage(null);
      } else {
        // Use instant zero-bandwidth local Object URL for canvas preview to prevent double upload!
        const localUrl = URL.createObjectURL(file);
        setBaseImage(localUrl);
        setVideoUrl(null);
        setVideoPoster(null);
      }
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImage) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const W = 800;
      const H = Math.round((img.height / img.width) * 800) || 800;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, W, H);
      const drawText = (text: string, top: boolean) => {
        if (!text.trim()) return;
        const size = W * 0.075;
        ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const x = W / 2;
        const y = top ? H * 0.03 : H - H * 0.03 - size * 1.15;
        ctx.lineWidth = size / 8;
        ctx.strokeStyle = "#080808";
        ctx.fillStyle = "#FFFFFF";
        const words = text.split(" ");
        const lines: string[] = [];
        let cur = "";
        for (const w of words) {
          if ((cur + " " + w).length > 20 && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
        }
        if (cur) lines.push(cur);
        lines.forEach((line, i) => {
          const ly = top ? y + i * size * 1.08 : y - (lines.length - 1 - i) * size * 1.08;
          ctx.strokeText(line, x, ly);
          ctx.fillText(line, x, ly);
        });
      };
      drawText(topText, true);
      drawText(bottomText, false);
    };
    img.src = baseImage;
  }, [baseImage, topText, bottomText]);

  useEffect(() => { draw(); }, [draw]);

  const ready = !!(baseImage || videoUrl);

  return (
    <div className="mt-5 space-y-4">
      {!ready ? (
        <>
          <div
            className="rounded-[24px] p-10 text-center cursor-pointer border border-[var(--line)]"
            style={{ background: "var(--surface)" }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
            aria-label="Tap to add image or video"
          >
            <span className="inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-3" style={{ background: "var(--surface-2)" }}>
              <span className="text-2xl">📤</span>
            </span>
            <div className="font-bold text-[14.5px]">Tap to add image or video</div>
            <p className="text-[11.5px] muted mt-1">PNG, JPEG, GIF, WebP · MP4, WebM · max 6MB / 40MB</p>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>

          <div>
            <div className="text-[12px] font-bold uppercase tracking-wide muted mb-2">Templates</div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {TEMPLATES.map((t) => (
                <button key={t} onClick={() => { setBaseImage(t); setVideoUrl(null); }} className="shrink-0" aria-label="Use template">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t} alt="" className="w-20 h-20 object-cover rounded-xl border border-[var(--line)] hover:border-[var(--lime)] transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-[24px] overflow-hidden border border-[var(--line)]" style={{ background: "var(--surface)" }}>
            {baseImage ? (
              <canvas ref={canvasRef} className="w-full h-auto block" aria-label="Meme preview" />
            ) : (
              <video src={videoUrl ?? ""} poster={videoPoster ?? undefined} data-poster={videoPoster ?? ""} controls className="w-full max-h-[420px]" aria-label="Video preview" />
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[12px] font-bold uppercase tracking-wide muted" htmlFor="top">Top text</label>
              <input id="top" className="neo-input mt-1.5" value={topText} onChange={(e) => setTopText(e.target.value)} maxLength={80} placeholder="Enter top text…" disabled={!!videoUrl} />
            </div>
            <div>
              <label className="text-[12px] font-bold uppercase tracking-wide muted" htmlFor="bottom">Bottom text</label>
              <input id="bottom" className="neo-input mt-1.5" value={bottomText} onChange={(e) => setBottomText(e.target.value)} maxLength={80} placeholder="Enter bottom text…" disabled={!!videoUrl} />
            </div>
          </div>

          <div className="flex gap-2">
            <NeoButton variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>Replace media</NeoButton>
            <NeoButton variant="ghost" size="sm" onClick={() => { setBaseImage(null); setVideoUrl(null); setVideoPoster(null); setTopText(""); setBottomText(""); }}>Start over</NeoButton>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </>
      )}
      {busy && <p className="text-[12px] muted">Uploading…</p>}
      {videoDuration ? null : null}
    </div>
  );
}

// ---------------------------------------------------------------- post button + launch sheet
function PostButton({ remixId, remixCategory }: { remixId: string | null; remixCategory?: string }) {
  const toast = useToast();
  const router = useRouter();
  const { refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [launched, setLaunched] = useState<MemeView | null>(null);

  return (
    <>
      <NeoButton variant="primary" onClick={() => setOpen(true)}>Post</NeoButton>
      <LaunchSheet
        open={open}
        onClose={() => setOpen(false)}
        remixId={remixId}
        remixCategory={remixCategory}
        onLaunched={(m) => { setLaunched(m); refresh(); }}
      />
      {launched && (
        <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-6" onClick={() => router.push(`/meme/${launched.id}`)}>
          <div className="text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-6xl mb-4 anim-floaty">🚨</div>
            <div className="hd text-3xl">Meme launched</div>
            <p className="text-sm muted mt-2">Entering the market at ✦20.</p>
            <div className="flex gap-3 justify-center mt-6">
              <NeoButton variant="primary" onClick={() => router.push(`/meme/${launched.id}`)}>View your meme</NeoButton>
              <NeoButton variant="ghost" onClick={() => router.push("/home")}>Feed</NeoButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LaunchSheet({ open, onClose, remixId, remixCategory, onLaunched }: {
  open: boolean; onClose: () => void; remixId: string | null; remixCategory?: string; onLaunched: (m: MemeView) => void;
}) {
  void remixCategory;
  const toast = useToast();
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState(remixCategory ?? "college");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (remixCategory) setCategory(remixCategory);
  }, [remixCategory]);

  const getMediaFromDom = async (): Promise<Upload | null> => {
    const canvas = document.querySelector("canvas[aria-label='Meme preview']") as HTMLCanvasElement | null;
    if (canvas) {
      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
      return uploadFile(new File([blob], "meme.png", { type: "image/png" }));
    }
    const video = document.querySelector("video[aria-label='Video preview']") as HTMLVideoElement | null;
    if (video?.src) {
      const poster = video.getAttribute("data-poster") || video.poster || video.src;
      return { url: video.src, thumbnail_url: poster, media_type: "video", width: 720, height: 1280 };
    }
    return null;
  };

  const launch = async () => {
    if (caption.trim().length < 3) return toast("Give your meme a caption (3+ chars).", "err");
    setBusy(true);
    try {
      const media = await getMediaFromDom();
      if (!media) { toast("Add an image or video first.", "err"); setBusy(false); return; }
      const r = await api<{ meme: MemeView }>("/api/memes", {
        json: {
          caption, category, media_type: media.media_type, media_url: media.url,
          thumbnail_url: media.thumbnail_url || media.url, width: media.width ?? 800, height: media.height ?? 800,
          duration: media.duration ?? null, tags: tags.split(/[,\s]+/).filter(Boolean),
          parent_meme_id: remixId,
        },
      });
      onLaunched(r.meme);
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label="Post your meme">
      <div className="hd text-[22px] mb-1">Post to MEMORE</div>
      <p className="text-sm muted mb-4">Your meme enters the market at ✦20.</p>
      <div className="space-y-3">
        <div>
          <label className="text-[12px] font-bold uppercase tracking-wide muted" htmlFor="caption">Caption *</label>
          <input id="caption" className="neo-input mt-1.5" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} placeholder="when the wifi drops during submission" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-bold uppercase tracking-wide muted" htmlFor="cat">Category</label>
            <select id="cat" className="neo-select mt-1.5" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-bold uppercase tracking-wide muted" htmlFor="tags">Tags</label>
            <input id="tags" className="neo-input mt-1.5" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="college, exam" />
          </div>
        </div>
        <NeoButton variant="primary" size="big" full disabled={busy} onClick={launch}>
          {busy ? "Launching…" : "🚀 Launch meme"}
        </NeoButton>
      </div>
    </Sheet>
  );
}
