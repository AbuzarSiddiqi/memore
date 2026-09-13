// Small HTTP helpers shared by all API routes.
import { NextResponse } from "next/server";
import { currentUser } from "./auth";
import { ensureMarketFresh } from "./market";
import type { Profile } from "../types";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function humanError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong. Your Aura was not changed.";
}

/** Authenticates the caller and advances the simulated market. */
export async function requireUser(): Promise<Profile | null> {
  ensureMarketFresh();
  return currentUser();
}

// naive in-memory rate limiter (per process) — demo-grade protection
const buckets = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}
