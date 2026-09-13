"use client";
// MEMORE onboarding — 3 steps: Don't Just Scroll. Invest. → Pick Your Vibe → You're In.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, useSession, useToast } from "@/lib/client";
import { NeoButton, NeoCard } from "@/components/ui";
import { MemoreMark, Spark } from "@/components/brand";

const VIBES = [
  { id: "memes", label: "Memes", emoji: "😂", bg: "#7C4DFF" },
  { id: "dogs", label: "Dogs", emoji: "🐶", bg: "#C8FF3D" },
  { id: "cats", label: "Cats", emoji: "🐱", bg: "#FF5A5A" },
  { id: "tech", label: "Tech", emoji: "💻", bg: "#315BEF" },
  { id: "anime", label: "Anime", emoji: "⛩️", bg: "#FF9F1C" },
  { id: "crypto", label: "Crypto", emoji: "🪙", bg: "#22A565" },
  { id: "sports", label: "Sports", emoji: "⚽", bg: "#0EA5E9" },
  { id: "cartoons", label: "Cartoons", emoji: "🧽", bg: "#FFD43D" },
  { id: "movies", label: "Movies & TV", emoji: "🎬", bg: "#9333EA" },
  { id: "relatable", label: "Relatable", emoji: "🫠", bg: "#FF7BAC" },
  { id: "finance", label: "Finance", emoji: "📈", bg: "#1D9A5F" },
  { id: "chaos", label: "Chaos", emoji: "🌀", bg: "#555555" },
];

// vibe id → interest ids used by the feed
const VIBE_TO_INTERESTS: Record<string, string[]> = {
  memes: ["random/chaos"], dogs: ["chaos"], cats: ["chaos"], tech: ["technology", "programming"],
  anime: ["anime"], crypto: ["technology"], sports: ["football"], cartoons: ["bollywood"],
  movies: ["bollywood"], relatable: ["college", "work"], finance: ["work"], chaos: ["random/chaos", "chaos"],
  gaming: ["gaming"], college: ["college"], bollywood: ["bollywood"], indian: ["indian"],
};

const FAN = [
  { emoji: "🚀", title: "MOONING", sticker: "SMALL INVESTMENTS BIG WINS.", rotate: -8, tint: "#7C4DFF", bg: "#1E1435" },
  { emoji: "💎", title: "DIAMOND", sticker: "GOOD MEMES AGE WELL.", rotate: 3, tint: "#C8FF3D", bg: "#1A1A1A" },
  { emoji: "🎯", title: "EARLY", sticker: "INVEST EARLY.", rotate: 9, tint: "#22A565", bg: "#0D2E1C" },
];

const FEATURES = [
  { icon: "🌍", title: "Discover", text: "Find the next big meme before everyone else.", bg: "var(--purple)" },
  { icon: "📈", title: "Invest", text: "Back memes you believe in with Aura.", bg: "var(--lime)" },
  { icon: "🏆", title: "Compete", text: "Climb the ranks, earn rewards, build reputation.", bg: "var(--purple)" },
  { icon: "🫂", title: "Be part of it", text: "Join a community that turns memes into movement.", bg: "var(--lime)" },
];

export default function Onboarding() {
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useSession();
  const [step, setStep] = useState(0);
  const [vibes, setVibes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    try {
      const interests = [...new Set(vibes.flatMap((v) => VIBE_TO_INTERESTS[v] ?? []))].slice(0, 6);
      await api("/api/auth/onboard", { json: { interests } });
      await refresh();
      router.replace("/home");
    } catch (e) {
      toast((e as Error).message, "err");
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setVibes((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 5 ? [...cur, id] : cur));

  return (
    <div className="min-h-screen flex flex-col px-5 max-w-md mx-auto" style={{ paddingTop: "max(20px, calc(env(safe-area-inset-top, 0px) + 16px))", paddingBottom: "max(24px, calc(env(safe-area-inset-bottom, 0px) + 20px))" }}>
      {/* progress header */}
      <div className="flex items-center justify-between mb-6">
        {step === 0 ? (
          <Link href="/" className="text-sm muted hover:text-white">Skip</Link>
        ) : (
          <button onClick={() => setStep((s) => s - 1)} className="text-xl" aria-label="Back">←</button>
        )}
        {step > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-extrabold tracking-widest" style={{ color: "var(--lime)" }}>STEP {step === 1 ? 1 : 3} OF 3</span>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((i) => (
                <span key={i} className="h-1.5 w-10 rounded-full" style={{ background: i <= step ? "var(--lime)" : "#2a2a2a" }} />
              ))}
            </div>
          </div>
        )}
        {step === 0 && <span />}
        <button onClick={() => setStep(3)} className="text-sm muted hover:text-white">{step === 0 ? "" : "Skip"}</button>
      </div>

      {step === 0 && (
        <div className="flex-1 flex flex-col">
          <h1 className="font-display font-extrabold text-[44px] leading-[0.95]">
            <span className="text-white">DON&apos;T JUST</span><br />
            <span className="text-white">SCROLL.</span><br />
            <span style={{ color: "var(--lime)" }}>INVEST.</span>
          </h1>
          <p className="muted italic mt-2 text-sm" style={{ fontFamily: "var(--font-display)" }}>Memes have potential.</p>

          {/* fanned meme cards */}
          <div className="relative h-44 my-7">
            {FAN.map((f, i) => (
              <div
                key={i}
                className="absolute top-2 rounded-2xl overflow-hidden border-[3px] border-[#0a0a0a] shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center p-2 text-center"
                style={{ width: 108, height: 138, left: `${8 + i * 30}%`, transform: `rotate(${f.rotate}deg)`, zIndex: i, background: f.bg }}
              >
                <span className="text-3xl mb-1">{f.emoji}</span>
                <span className="text-[10px] font-black tracking-wider text-white/80">{f.title}</span>
                <span
                  className="absolute bottom-1.5 left-1.5 right-1.5 text-center text-[7.5px] font-extrabold py-1 rounded-lg leading-tight"
                  style={{ background: f.tint, color: f.tint === "#C8FF3D" || f.tint === "#FFD43D" ? "#0a0a0a" : "#fff" }}
                >
                  {f.sticker}
                </span>
              </div>
            ))}
            <span className="absolute -top-1 right-1 anim-floaty"><Spark size={22} color="#C8FF3D" /></span>
          </div>

          <div className="space-y-3.5 mb-8">
            {[
              "Invest in memes you believe in",
              "Watch them grow (or flop)",
              "Compete, earn and climb the ranks",
              "Be a part of meme culture",
            ].map((t) => (
              <div key={t} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--lime)" }}>
                  <Spark size={13} color="#0a0a0a" />
                </span>
                <span className="text-[14.5px] font-medium text-white/90">{t}</span>
              </div>
            ))}
          </div>

          <div className="mt-auto">
            <NeoButton variant="primary" size="big" full onClick={() => setStep(1)}>Get Started</NeoButton>
            <p className="text-center text-sm muted mt-4">
              Already have an account? <Link href="/login" className="font-bold underline" style={{ color: "var(--lime)" }}>Log in</Link>
            </p>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex-1 flex flex-col">
          <h1 className="font-display font-extrabold text-[40px] leading-[0.95]">
            <span className="text-white">PICK YOUR</span><br />
            <span style={{ color: "var(--lime)" }}>VIBE.</span>
          </h1>
          <p className="muted mt-2 text-[15px]">Choose topics you&apos;re into.<br />We&apos;ll personalize your meme feed.</p>

          <div className="grid grid-cols-3 gap-2.5 mt-6">
            {VIBES.map((v) => {
              const sel = vibes.includes(v.id);
              return (
                <button
                  key={v.id}
                  onClick={() => toggle(v.id)}
                  aria-pressed={sel}
                  className="relative rounded-2xl overflow-hidden border-2 text-left"
                  style={{
                    borderColor: sel ? "var(--lime)" : "#2a2a2a",
                    background: sel ? v.bg : "#141414",
                    opacity: sel ? 1 : 0.85,
                  }}
                >
                  <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-extrabold"
                    style={{ borderColor: sel ? "#0a0a0a" : "#555", background: sel ? "var(--lime)" : "transparent", color: "#0a0a0a" }}>
                    {sel ? "✓" : ""}
                  </span>
                  <span className="block h-16 flex items-center justify-center text-4xl pt-3 text-center">{v.emoji}</span>
                  <span className="block px-2 pb-2">
                    <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: sel ? "rgba(10,10,10,0.75)" : "#0a0a0a", color: "#fff" }}>
                      {v.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-auto pt-6">
            <NeoButton variant="purple" size="big" full disabled={busy} onClick={() => setStep(2)}>
              Continue →
            </NeoButton>
            <p className="text-center text-[11px] muted mt-3">Pick up to 5. Same interests, bigger memes.</p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between">
            <h1 className="font-display font-extrabold text-[44px] leading-[0.95]">
              <span className="text-white">YOU&apos;RE</span><br />
              <span style={{ color: "var(--lime)" }}>IN!</span>
            </h1>
            <MemoreMark size={72} />
          </div>
          <p className="muted italic mt-2 text-sm" style={{ fontFamily: "var(--font-display)" }}>Same memes. Bigger moves.</p>

          <div className="grid grid-cols-2 gap-3 mt-6">
            {FEATURES.map((f) => (
              <NeoCard key={f.title} className="p-4">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background: f.bg, color: f.bg === "var(--lime)" ? "#0a0a0a" : "#fff" }}>
                  {f.icon}
                </span>
                <div className="font-bold text-[15px]">{f.title}</div>
                <p className="text-[12.5px] muted mt-0.5 leading-snug">{f.text}</p>
              </NeoCard>
            ))}
          </div>

          <div className="neo-sm p-3.5 mt-5 flex items-center justify-between">
            <span className="text-sm muted">Starter Aura</span>
            <span className="aura-num text-xl" style={{ color: "var(--lime)" }}>✦ 100</span>
          </div>

          <div className="mt-auto pt-6">
            <NeoButton variant="purple" size="big" full disabled={busy} onClick={finish}>
              {busy ? "Opening the feed…" : "Let's Go! →"}
            </NeoButton>
            <p className="text-center text-[11px] muted mt-3">See you on the leaderboard. 👑</p>
          </div>
        </div>
      )}
    </div>
  );
}
