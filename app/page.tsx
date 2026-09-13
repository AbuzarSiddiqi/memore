import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser, SESSION_COOKIE } from "@/lib/server/auth";
import { MemoreMark, MemoreWordmark, Spark } from "@/components/brand";

export default async function Splash() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await currentUser();
    if (user) redirect(user.onboarded ? "/home" : "/onboarding");
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#C8FF3D" }}>
      {/* top bar */}
      <header className="flex items-center justify-between px-5 py-5" style={{ paddingTop: "max(20px, calc(env(safe-area-inset-top, 0px) + 16px))" }}>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.18em] text-black/60">
          <Spark size={12} color="#0a0a0a" /> DON&apos;T LIKE. INVEST.
        </span>
        <div className="flex gap-2">
          <Link href="/login" className="neo-btn sm dark">Log in</Link>
        </div>
      </header>

      {/* hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 -mt-6">
        <div className="anim-floaty">
          <MemoreMark size={148} />
        </div>
        <div className="mt-8 text-black">
          <MemoreWordmark size={56} />
        </div>
        <p className="mt-2 text-black font-extrabold text-sm tracking-[0.28em]">DON&apos;T LIKE. INVEST.</p>

        <p className="mt-14 text-black/70 italic font-bold text-lg leading-tight" style={{ fontFamily: "var(--font-display)" }}>
          More memes. More possibilities.
        </p>
        <svg width="150" height="10" viewBox="0 0 150 10" className="mt-1" aria-hidden>
          <path d="M2 7 C 40 2, 90 2, 148 6" stroke="#0a0a0a" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.55" />
        </svg>

        <div className="flex flex-col gap-3 mt-12 w-full max-w-xs">
          <Link href="/signup" className="neo-btn big dark w-full">Get Started</Link>
          <p className="text-black/60 text-[13px]">
            Already have an account? <Link href="/login" className="underline font-bold text-black">Log in</Link>
          </p>
        </div>
      </main>

      {/* footer */}
      <footer className="px-6 pb-7 pt-4 flex items-center justify-between text-black/50 text-[11px]" style={{ paddingBottom: "max(24px, calc(env(safe-area-inset-bottom, 0px) + 16px))" }}>
        <span>M = memes · ✦ = aura · ↗ = growth</span>
        <span className="max-w-[190px] text-right leading-snug">Virtual points only. No real money. All glory.</span>
      </footer>
    </div>
  );
}
