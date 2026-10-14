import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client that uses the SERVICE ROLE key and therefore BYPASSES Row
 * Level Security. Only use it in trusted server code, after you have checked
 * the caller yourself, for jobs no user could do: creating accounts, granting
 * administrator scope, retention clean-up, scheduled alert checks.
 *
 * The `server-only` import makes the build fail if this file is ever pulled
 * into a Client Component. The key must never be exposed to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for the admin client.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
