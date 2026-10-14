import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "./env";

/**
 * Supabase client for Server Components, Server Functions and Route Handlers.
 * It acts as the signed-in user (session read from cookies), so Row Level
 * Security still applies. In this version of Next.js `cookies()` is async.
 *
 * To identify the caller on the server, use `supabase.auth.getUser()`, which
 * revalidates the token with Supabase. Do not trust `getSession()` for that:
 * it only reads the cookie.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore once the proxy refreshes sessions (planned in the
          // authentication step).
        }
      },
    },
  });
}
