// Diagnoses the Supabase connection and prints what to fix. Never prints keys.
//
//   cd back-end && npm run check:connection
//
// Reads back-end/.env (loaded by the npm script) and front-end/.env.local.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const backEnvPath = resolve(here, "../.env");
const frontEnvPath = resolve(here, "../../front-end/.env.local");

let problems = 0;
const ok = (msg: string) => console.log(`  ok   ${msg}`);
const fix = (msg: string) => {
  problems++;
  console.log(`  FIX  ${msg}`);
};
const section = (title: string) => console.log(`\n${title}`);

type KeyKind = "publishable" | "secret" | "legacy-jwt" | "unknown" | "empty";

function keyKind(value: string | undefined): KeyKind {
  if (!value) return "empty";
  if (value.startsWith("sb_publishable_")) return "publishable";
  if (value.startsWith("sb_secret_")) return "secret";
  if (value.startsWith("eyJ")) return "legacy-jwt";
  return "unknown";
}

function parseEnvFile(path: string): Record<string, string> | null {
  if (!existsSync(path)) return null;
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (m) values[m[1]] = m[2].trim();
  }
  return values;
}

/** Catches the usual copy/paste slips without revealing the value. */
function lintValue(name: string, value: string | undefined, where: string): boolean {
  if (!value) {
    fix(`${name} is empty in ${where}.`);
    return false;
  }
  if (/^["']|["']$/.test(value)) {
    fix(`${name} in ${where} is wrapped in quotes. Remove them.`);
    return false;
  }
  if (/[<>]/.test(value)) {
    fix(`${name} in ${where} still has < > brackets. Remove them.`);
    return false;
  }
  if (/\s/.test(value)) {
    fix(`${name} in ${where} contains a space. Remove it.`);
    return false;
  }
  return true;
}

function lintUrl(name: string, value: string | undefined, where: string): boolean {
  if (!lintValue(name, value, where)) return false;
  const url = value as string;
  if (!/^https?:\/\//.test(url)) {
    fix(`${name} in ${where} must start with https://`);
    return false;
  }
  if (url.endsWith("/")) {
    fix(`${name} in ${where} ends with "/". Remove it.`);
    return false;
  }
  if (/\/(rest|auth)\/v1/.test(url)) {
    fix(`${name} in ${where} must be just the project address, without /rest/v1 or /auth/v1.`);
    return false;
  }
  if (/127\.0\.0\.1|localhost/.test(url)) {
    fix(
      `${name} in ${where} points at a local Supabase (${url}). ` +
        "For your hosted project use https://<project-ref>.supabase.co",
    );
    return false;
  }
  ok(`${name} in ${where} looks valid (${new URL(url).hostname})`);
  return true;
}

// -------------------------------------------------------------- back-end/.env
section("1. back-end/.env");
if (!existsSync(backEnvPath)) {
  fix("back-end/.env does not exist. Run: cp .env.example .env (inside back-end), then fill it in.");
} else {
  ok("file found");
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const urlOk = lintUrl("SUPABASE_URL", url, "back-end/.env");
let keyOk = lintValue("SUPABASE_SERVICE_ROLE_KEY", serviceKey, "back-end/.env");

if (keyOk) {
  const kind = keyKind(serviceKey);
  if (kind === "publishable") {
    fix("SUPABASE_SERVICE_ROLE_KEY holds the PUBLISHABLE key. It needs the SECRET key (sb_secret_...).");
    keyOk = false;
  } else if (kind === "unknown") {
    fix("SUPABASE_SERVICE_ROLE_KEY is not in a known format (expected sb_secret_... or a legacy eyJ... key).");
    keyOk = false;
  } else {
    ok(`SUPABASE_SERVICE_ROLE_KEY is a ${kind} key (${serviceKey!.length} characters)`);
  }
}

const seedPassword = process.env.SEED_PASSWORD;
if (!seedPassword || seedPassword.length < 12) {
  fix("SEED_PASSWORD must be set to at least 12 characters (needed for npm run seed:users).");
} else {
  ok("SEED_PASSWORD is set");
}
if (urlOk && process.env.ALLOW_NON_LOCAL_SEED !== "yes") {
  fix("ALLOW_NON_LOCAL_SEED=yes is missing (needed for npm run seed:users on a hosted project).");
}

// ----------------------------------------------------- front-end/.env.local
section("2. front-end/.env.local");
const front = parseEnvFile(frontEnvPath);
if (!front) {
  fix("front-end/.env.local does not exist. Run: cp .env.example .env.local (inside front-end), then fill it in.");
} else {
  ok("file found");
  lintUrl("NEXT_PUBLIC_SUPABASE_URL", front.NEXT_PUBLIC_SUPABASE_URL, "front-end/.env.local");
  if (url && front.NEXT_PUBLIC_SUPABASE_URL && url !== front.NEXT_PUBLIC_SUPABASE_URL) {
    fix("NEXT_PUBLIC_SUPABASE_URL (front-end) and SUPABASE_URL (back-end) are different projects.");
  }

  const anon = front.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (lintValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", anon, "front-end/.env.local")) {
    const kind = keyKind(anon);
    if (kind === "secret" || (serviceKey && anon === serviceKey)) {
      fix(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY holds a SECRET key. Anything NEXT_PUBLIC_ is sent to every browser. " +
          "Remove it, use the publishable key here, and replace the secret key in Supabase.",
      );
    } else if (kind === "unknown") {
      fix("NEXT_PUBLIC_SUPABASE_ANON_KEY is not in a known format (expected sb_publishable_... or a legacy eyJ... anon key).");
    } else {
      ok(`NEXT_PUBLIC_SUPABASE_ANON_KEY is a ${kind} key`);
    }
  }

  const frontService = front.SUPABASE_SERVICE_ROLE_KEY;
  if (lintValue("SUPABASE_SERVICE_ROLE_KEY", frontService, "front-end/.env.local")) {
    if (keyKind(frontService) === "publishable") {
      fix("front-end SUPABASE_SERVICE_ROLE_KEY holds the PUBLISHABLE key. It needs the SECRET key.");
    } else {
      ok("SUPABASE_SERVICE_ROLE_KEY is set");
    }
  }
}

// ------------------------------------------------------------- live checks
if (!(urlOk && keyOk)) {
  console.log("\nSkipping the live checks until the settings above are fixed.");
} else {
  const base = url as string;
  const key = serviceKey as string;

  section("3. Reaching Supabase");
  let reachable = false;
  try {
    const res = await fetch(`${base}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      ok(`project answered (HTTP ${res.status})`);
      reachable = true;
    } else if (res.status === 401 || res.status === 403) {
      fix(`Supabase rejected the key (HTTP ${res.status}). Copy the secret key again from Project Settings, API Keys. If you replaced it, use the NEW one.`);
    } else if (res.status === 404) {
      fix("HTTP 404: the project address is wrong or the project no longer exists. Check SUPABASE_URL.");
    } else {
      fix(`Unexpected answer from Supabase (HTTP ${res.status}).`);
    }
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    fix(
      `Could not connect (${detail}). Check your internet, VPN or firewall, the spelling of SUPABASE_URL, ` +
        "and that the project is not paused (Supabase free projects pause after a week of no use; use Restore project in the dashboard).",
    );
  }

  if (reachable) {
    const supabase = createClient(base, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    section("4. Database tables");
    const tables = [
      "profiles",
      "sites",
      "admin_site_access",
      "attendance",
      "alerts",
      "leave_requests",
      "leave_documents",
      "audit_log",
    ];
    const missing: string[] = [];
    for (const table of tables) {
      const { error } = await supabase.from(table).select("*").limit(1);
      if (!error) continue;
      if (error.code === "PGRST205" || error.code === "42P01" || /schema cache|does not exist/i.test(error.message)) {
        missing.push(table);
      } else if (/invalid api key|jwt/i.test(error.message)) {
        fix(`Supabase rejected the key while reading ${table}: ${error.message}`);
        break;
      } else if (/permission denied/i.test(error.message)) {
        fix(
          `Permission denied on ${table}. The key used is probably not the secret/service_role key, ` +
            "or the migrations' grants were changed.",
        );
      } else {
        fix(`Could not read ${table}: ${error.message}`);
      }
    }
    if (missing.length === tables.length) {
      fix("No tables found. Run the migrations in database/schema in order (0001 to 0006) in the Supabase SQL Editor.");
    } else if (missing.length > 0) {
      fix(
        `Missing tables: ${missing.join(", ")}. Run the migration files in order: ` +
          "0002 creates profiles, sites and admin_site_access; 0003 audit_log; 0004 attendance and alerts; 0005 leave tables.",
      );
    } else {
      ok("all 8 tables exist");
    }

    if (missing.length === 0) {
      section("5. Data");
      const { data: sites, error: sitesError } = await supabase.from("sites").select("id,name");
      if (sitesError) {
        fix(`Could not read sites: ${sitesError.message}`);
      } else if (!sites || sites.length === 0) {
        fix("The sites table is empty. Run database/seed/seed.sql in the SQL Editor.");
      } else {
        ok(`${sites.length} site(s): ${sites.map((s) => s.name).join(", ")}`);
      }

      const { data: users, error: usersError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (usersError) {
        fix(
          `Could not list users: ${usersError.message}. ` +
            "If it mentions the key or JWT, the secret key is wrong or was deleted.",
        );
      } else {
        ok(`${users.users.length} sign-in account(s) exist`);
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("email,role,home_site_id");
      if (profilesError) {
        fix(`Could not read profiles: ${profilesError.message}`);
      } else if (!profiles || profiles.length === 0) {
        fix("No profiles yet. Run: npm run seed:users");
      } else {
        for (const p of profiles) {
          const home = p.home_site_id ? "home site set" : "NO home site (an admin cannot see this user)";
          console.log(`        ${p.email}  ${p.role}  ${home}`);
        }
        ok(`${profiles.length} profile(s)`);
      }
    }
  }
}

console.log(
  problems === 0
    ? "\nAll checks passed."
    : `\n${problems} thing(s) to fix. Fix the first one, then run this check again.`,
);
process.exit(problems === 0 ? 0 : 1);
