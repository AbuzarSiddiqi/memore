"use client";
// Shell for all authenticated screens: guard + side nav + bottom nav + rails.
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/client";
import { BottomNav, SideNav, AppHeader, RightRail } from "@/components/nav";
import { MemoreMark, MemoreWordmark } from "@/components/brand";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user && !user.onboarded && pathname !== "/onboarding") router.replace("/onboarding");
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5">
        <div className="anim-floaty flex flex-col items-center gap-3">
          <MemoreMark size={72} />
          <MemoreWordmark size={26} />
        </div>
        <div className="text-[12px] muted font-bold tracking-widest uppercase">Loading the feed…</div>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen max-w-[1400px] mx-auto flex px-4">
      <SideNav />
      <div className="flex-1 min-w-0 flex flex-col px-0 lg:px-6">
        <AppHeader />
        <main className="flex-1 pb-32 lg:pb-10 max-w-2xl w-full mx-auto lg:mx-0 xl:mx-auto pt-2">{children}</main>
      </div>
      <RightRail />
      <BottomNav />
    </div>
  );
}
