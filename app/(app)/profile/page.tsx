"use client";
// /profile → redirect to my profile
import { useEffect } from "react";
import { useSession } from "@/lib/client";
import { useRouter } from "next/navigation";

export default function ProfileIndex() {
  const { user, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user) router.replace(`/profile/${user.username}`);
  }, [loading, user, router]);
  return <div className="mt-10 text-center hd muted text-sm">FINDING YOU…</div>;
}
