import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "./env";

/**
 * Supabase client for Client Components. Uses the public anon key, so it can
 * only do what Row Level Security allows for the signed-in user.
 */
export function createClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  return createBrowserClient(url, anonKey);
}
