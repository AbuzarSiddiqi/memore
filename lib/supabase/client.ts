import { createBrowserClient } from "@supabase/ssr";

export const DEFAULT_SUPABASE_URL = "https://mnfasawmfajfwquhymyl.supabase.co";
export const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_awlGYb9wAYjZ9YF1By2c4Q_cd0uG__Z";

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return (
    !!url &&
    url !== "https://your-project-id.supabase.co" &&
    !!key &&
    key !== "your-supabase-anon-key"
  );
}

export function createClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }
  return createBrowserClient(
    getSupabaseUrl(),
    getSupabaseAnonKey()
  );
}
