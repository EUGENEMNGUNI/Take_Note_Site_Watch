// Environment access for the Supabase clients.
//
// NEXT_PUBLIC_* values are inlined into the browser bundle at build time, but
// only when they are written out literally as `process.env.NEXT_PUBLIC_X`.
// Do not read them through a variable or a destructure, or they will be
// undefined in the browser.

export function getSupabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy front-end/.env.example to front-end/.env.local and fill them in.",
    );
  }

  return { url, anonKey };
}
