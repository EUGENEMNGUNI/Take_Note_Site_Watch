// Creates the development test accounts through Supabase Auth (so passwords
// are hashed properly), then sets their role, home site and administrator
// scope. Run database/seed/seed.sql first: it creates the sample sites.
//
//   npm run seed:users
//
// Safe to run repeatedly: existing accounts are reused and re-configured.

import { createClient } from "@supabase/supabase-js";

const SITE_HEAD_OFFICE = "a0000000-0000-4000-8000-000000000001";
const SITE_DEPOT = "a0000000-0000-4000-8000-000000000002";

type SeedUser = {
  email: string;
  fullName: string;
  role: "admin" | "manager" | "employee";
  homeSiteId: string;
  /** Sites this user may administer (administrators only). */
  adminSiteIds: string[];
};

const USERS: SeedUser[] = [
  {
    email: "admin@sitewatch.test",
    fullName: "Test Administrator",
    role: "admin",
    homeSiteId: SITE_HEAD_OFFICE,
    adminSiteIds: [SITE_HEAD_OFFICE, SITE_DEPOT],
  },
  {
    email: "manager@sitewatch.test",
    fullName: "Test Site Manager",
    role: "manager",
    homeSiteId: SITE_HEAD_OFFICE,
    adminSiteIds: [],
  },
  {
    email: "employee1@sitewatch.test",
    fullName: "Test Employee One",
    role: "employee",
    homeSiteId: SITE_HEAD_OFFICE,
    adminSiteIds: [],
  },
  {
    email: "employee2@sitewatch.test",
    fullName: "Test Employee Two",
    role: "employee",
    homeSiteId: SITE_DEPOT,
    adminSiteIds: [],
  },
];

function fail(message: string): never {
  console.error(`seed-users: ${message}`);
  process.exit(1);
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD;

if (!url) fail("SUPABASE_URL is not set.");
if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is not set.");
if (!password || password.length < 12) {
  fail("SEED_PASSWORD must be set to at least 12 characters.");
}

const host = new URL(url).hostname;
const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
if (!isLocal && process.env.ALLOW_NON_LOCAL_SEED !== "yes") {
  fail(
    `Refusing to create test accounts on non-local project "${host}". ` +
      "Set ALLOW_NON_LOCAL_SEED=yes only for a throwaway project.",
  );
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserIdByEmail(email: string): Promise<string | undefined> {
  // Paged lookup; the seed set is tiny so a few pages are plenty.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`could not list users: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return undefined;
}

async function ensureUser(user: SeedUser): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: user.fullName },
  });

  if (data?.user) return data.user.id;

  const existing = await findUserIdByEmail(user.email);
  if (existing) return existing;
  return fail(`could not create ${user.email}: ${error?.message ?? "unknown error"}`);
}

// The sample sites must exist before profiles can point at them.
const { data: sites, error: sitesError } = await supabase
  .from("sites")
  .select("id")
  .in("id", [SITE_HEAD_OFFICE, SITE_DEPOT]);
if (sitesError) fail(`could not read sites: ${sitesError.message}`);
if ((sites?.length ?? 0) < 2) {
  fail("sample sites not found. Run database/seed/seed.sql first.");
}

for (const user of USERS) {
  const id = await ensureUser(user);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: user.fullName, role: user.role, home_site_id: user.homeSiteId })
    .eq("id", id);
  if (profileError) fail(`could not configure profile for ${user.email}: ${profileError.message}`);

  if (user.adminSiteIds.length > 0) {
    const { error: scopeError } = await supabase
      .from("admin_site_access")
      .upsert(
        user.adminSiteIds.map((site_id) => ({ admin_id: id, site_id })),
        { onConflict: "admin_id,site_id", ignoreDuplicates: true },
      );
    if (scopeError) fail(`could not grant scope to ${user.email}: ${scopeError.message}`);
  }

  console.log(`ok  ${user.role.padEnd(8)} ${user.email}`);
}

console.log("Done. Sign in with these emails and the SEED_PASSWORD you chose.");
