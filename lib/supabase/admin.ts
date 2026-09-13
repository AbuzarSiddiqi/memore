import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, getSupabaseUrl } from "./client";

export function getServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function createAdminClient() {
  const key = getServiceRoleKey();
  if (!isSupabaseConfigured() || !key) {
    return null;
  }

  return createClient(
    getSupabaseUrl(),
    key,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
