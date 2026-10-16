// Tests for the employee registration logic, using fake Supabase clients.
//
//   cd back-end && npm test
//
// The database side (scope checks, audit entry, who can call the function) is
// covered by rls_acceptance.sql. These tests cover the server side: the order
// of checks, error mapping, rollback, and that secrets never leak.

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  registerEmployee,
  RegisterEmployeeError,
} from "../../front-end/lib/server/register-employee";
import { generateTemporaryPassword } from "../../front-end/lib/server/password";
import { validateRegisterEmployee } from "../../front-end/lib/validators/employee";

const ACTOR_ID = "00000000-0000-4000-8000-0000000000a1";
const NEW_ID = "00000000-0000-4000-8000-0000000000e9";
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const PASSWORD = "Tmp-Pass-123!x";

const validInput = {
  fullName: "  Thandi Nkosi ",
  email: "  Thandi.Nkosi@Example.com ",
  homeSiteId: SITE_ID.toUpperCase(),
};

type ErrorLike = { code?: string; status?: number; message?: string };

type Setup = {
  user?: { id: string } | null;
  authError?: ErrorLike | null;
  scopeAllowed?: boolean | null;
  scopeError?: ErrorLike | null;
  site?: { id: string; is_active: boolean } | null;
  siteError?: ErrorLike | null;
  createError?: ErrorLike | null;
  profileError?: ErrorLike | null;
  deleteError?: ErrorLike | null;
};

function makeFakes(setup: Setup = {}) {
  const o: Required<Setup> = {
    user: { id: ACTOR_ID },
    authError: null,
    scopeAllowed: true,
    scopeError: null,
    site: { id: SITE_ID, is_active: true },
    siteError: null,
    createError: null,
    profileError: null,
    deleteError: null,
    ...setup,
  };

  const calls = {
    scope: [] as unknown[],
    createUser: [] as Array<Record<string, unknown>>,
    profile: [] as unknown[],
    deleteUser: [] as string[],
  };

  const caller = {
    auth: {
      getUser: async () => ({ data: { user: o.user }, error: o.authError }),
    },
    rpc: async (fn: string, args: unknown) => {
      calls.scope.push({ fn, args });
      return { data: o.scopeAllowed, error: o.scopeError };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: o.site, error: o.siteError }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  const admin = {
    auth: {
      admin: {
        createUser: async (args: Record<string, unknown>) => {
          calls.createUser.push(args);
          return o.createError
            ? { data: { user: null }, error: o.createError }
            : { data: { user: { id: NEW_ID } }, error: null };
        },
        deleteUser: async (id: string) => {
          calls.deleteUser.push(id);
          return { data: {}, error: o.deleteError };
        },
      },
    },
    rpc: async (fn: string, args: unknown) => {
      calls.profile.push({ fn, args });
      return o.profileError
        ? { data: null, error: o.profileError }
        : { data: { id: NEW_ID }, error: null };
    },
  } as unknown as SupabaseClient;

  return { caller, admin, calls, deps: { caller, admin, generatePassword: () => PASSWORD } };
}

async function expectError(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<RegisterEmployeeError> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof RegisterEmployeeError, "expected a RegisterEmployeeError");
  assert.equal(caught.status, status);
  assert.equal(caught.code, code);
  // Nothing sent back to the browser may contain the password or internals.
  assert.ok(!caught.message.includes(PASSWORD), "error message leaked the password");
  return caught;
}

// Capture console.error so expected failures do not clutter the test output,
// and so we can prove that nothing sensitive is logged.
const logged: string[] = [];
const originalError = console.error;
beforeEach(() => {
  logged.length = 0;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
});
afterEach(() => {
  console.error = originalError;
  for (const line of logged) {
    assert.ok(!line.includes(PASSWORD), `a log line contained the password: ${line}`);
    assert.ok(!/thandi/i.test(line), `a log line contained personal data: ${line}`);
  }
});

// ------------------------------------------------------------------ success

test("registers an employee and returns the temporary password once", async () => {
  const { deps, calls } = makeFakes();
  const result = await registerEmployee(deps, validInput);

  assert.deepEqual(result, {
    employee: {
      id: NEW_ID,
      email: "thandi.nkosi@example.com",
      fullName: "Thandi Nkosi",
      homeSiteId: SITE_ID,
    },
    temporaryPassword: PASSWORD,
  });

  assert.equal(calls.createUser.length, 1);
  assert.deepEqual(calls.createUser[0], {
    email: "thandi.nkosi@example.com",
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Thandi Nkosi" },
    app_metadata: { must_change_password: true },
  });

  assert.deepEqual(calls.profile, [
    {
      fn: "register_employee_profile",
      args: {
        p_actor_id: ACTOR_ID,
        p_user_id: NEW_ID,
        p_full_name: "Thandi Nkosi",
        p_home_site_id: SITE_ID,
      },
    },
  ]);
  assert.equal(calls.deleteUser.length, 0, "a successful registration must not roll back");
});

test("the role is never taken from the request", async () => {
  const { deps, calls } = makeFakes();
  await registerEmployee(deps, { ...validInput, role: "admin", app_metadata: { role: "admin" } });
  const sent = calls.createUser[0];
  assert.deepEqual(sent.app_metadata, { must_change_password: true });
  assert.ok(!JSON.stringify(sent).includes("admin"));
});

// ------------------------------------------------------------ authentication

test("rejects a caller who is not signed in, before anything else", async () => {
  const { deps, calls } = makeFakes({ user: null });
  await expectError(registerEmployee(deps, validInput), 401, "not_signed_in");
  assert.equal(calls.scope.length, 0);
  assert.equal(calls.createUser.length, 0);
});

test("rejects a session that Supabase says is invalid", async () => {
  const { deps, calls } = makeFakes({ authError: { message: "jwt expired" } });
  await expectError(registerEmployee(deps, validInput), 401, "not_signed_in");
  assert.equal(calls.createUser.length, 0);
});

// ---------------------------------------------------------------- validation

test("rejects invalid input with field errors and creates nothing", async () => {
  const { deps, calls } = makeFakes();
  const error = await expectError(
    registerEmployee(deps, { fullName: "A", email: "not-an-email", homeSiteId: "nope" }),
    400,
    "invalid_input",
  );
  assert.deepEqual(Object.keys(error.fields ?? {}).sort(), ["email", "fullName", "homeSiteId"]);
  assert.equal(calls.createUser.length, 0);
});

test("rejects a body that is not an object", async () => {
  for (const body of [null, undefined, "text", 42, [], [validInput]]) {
    const { deps, calls } = makeFakes();
    await expectError(registerEmployee(deps, body), 400, "invalid_input");
    assert.equal(calls.createUser.length, 0);
  }
});

// --------------------------------------------------------------- authorisation

test("rejects an employee or an administrator of another site", async () => {
  for (const scopeAllowed of [false, null]) {
    const { deps, calls } = makeFakes({ scopeAllowed });
    await expectError(registerEmployee(deps, validInput), 403, "forbidden");
    assert.equal(calls.createUser.length, 0, "no account may be created without scope");
  }
});

test("asks the database whether the caller administers the requested site", async () => {
  const { deps, calls } = makeFakes();
  await registerEmployee(deps, validInput);
  assert.deepEqual(calls.scope, [
    { fn: "admin_can_access_site", args: { p_site_id: SITE_ID } },
  ]);
});

test("a failing scope check fails closed", async () => {
  const { deps, calls } = makeFakes({ scopeError: { code: "XX000", message: "boom" } });
  await expectError(registerEmployee(deps, validInput), 500, "scope_check_failed");
  assert.equal(calls.createUser.length, 0);
});

test("rejects an inactive or unknown site before creating an account", async () => {
  for (const site of [{ id: SITE_ID, is_active: false }, null]) {
    const { deps, calls } = makeFakes({ site });
    const error = await expectError(registerEmployee(deps, validInput), 422, "site_inactive");
    assert.ok(error.fields?.homeSiteId);
    assert.equal(calls.createUser.length, 0);
  }
});

test("a failing site lookup fails closed", async () => {
  const { deps, calls } = makeFakes({ siteError: { code: "XX000" } });
  await expectError(registerEmployee(deps, validInput), 500, "site_lookup_failed");
  assert.equal(calls.createUser.length, 0);
});

// ------------------------------------------------------------ account creation

test("maps a duplicate email to 409 and does not run the profile step", async () => {
  for (const createError of [
    { code: "email_exists", status: 422, message: "x" },
    { code: "user_already_exists", status: 422, message: "x" },
    { status: 422, message: "A user with this email address has already been registered" },
  ]) {
    const { deps, calls } = makeFakes({ createError });
    const error = await expectError(registerEmployee(deps, validInput), 409, "email_taken");
    assert.ok(error.fields?.email);
    assert.equal(calls.profile.length, 0);
    assert.equal(calls.deleteUser.length, 0, "nothing was created, so nothing to roll back");
  }
});

test("hides the details of other account creation failures", async () => {
  const { deps, calls } = makeFakes({
    createError: { status: 500, code: "unexpected_failure", message: "secret internal detail" },
  });
  const error = await expectError(registerEmployee(deps, validInput), 502, "account_creation_failed");
  assert.ok(!error.message.includes("secret internal detail"));
  assert.equal(calls.profile.length, 0);
});

// -------------------------------------------------------------------- rollback

test("deletes the new account if the profile step is refused", async () => {
  const { deps, calls } = makeFakes({ profileError: { code: "42501", message: "nope" } });
  await expectError(registerEmployee(deps, validInput), 403, "forbidden");
  assert.deepEqual(calls.deleteUser, [NEW_ID]);
});

test("deletes the new account if the site vanished before the profile step", async () => {
  const { deps, calls } = makeFakes({ profileError: { code: "P0002" } });
  await expectError(registerEmployee(deps, validInput), 422, "site_inactive");
  assert.deepEqual(calls.deleteUser, [NEW_ID]);
});

test("deletes the new account on any other profile failure", async () => {
  const { deps, calls } = makeFakes({ profileError: { code: "XX000", message: "db down" } });
  await expectError(registerEmployee(deps, validInput), 500, "registration_failed");
  assert.deepEqual(calls.deleteUser, [NEW_ID]);
});

test("reports a failed rollback to the operator without leaking data", async () => {
  const { deps, calls } = makeFakes({
    profileError: { code: "XX000" },
    deleteError: { code: "unexpected_failure", status: 500 },
  });
  await expectError(registerEmployee(deps, validInput), 500, "registration_failed");
  assert.deepEqual(calls.deleteUser, [NEW_ID]);
  const alert = logged.find((line) => line.includes("ROLLBACK FAILED"));
  assert.ok(alert, "an operator alert must be logged");
  assert.ok(alert.includes(NEW_ID), "the alert must name the orphaned account id");
  // The afterEach hook also proves it holds no password or personal data.
});

// ------------------------------------------------------------------ validators

test("validator normalises valid input", () => {
  const result = validateRegisterEmployee(validInput);
  assert.ok(result.ok);
  assert.deepEqual(result.value, {
    fullName: "Thandi Nkosi",
    email: "thandi.nkosi@example.com",
    homeSiteId: SITE_ID,
  });
});

test("validator rejects bad names, emails and site ids", () => {
  const bad: Array<[Record<string, unknown>, string]> = [
    [{ ...validInput, fullName: " " }, "fullName"],
    [{ ...validInput, fullName: "A" }, "fullName"],
    [{ ...validInput, fullName: "x".repeat(101) }, "fullName"],
    [{ ...validInput, fullName: "Line\nBreak" }, "fullName"],
    [{ ...validInput, fullName: 42 }, "fullName"],
    [{ ...validInput, email: "" }, "email"],
    [{ ...validInput, email: "a@b" }, "email"],
    [{ ...validInput, email: "two words@example.com" }, "email"],
    [{ ...validInput, email: `${"a".repeat(250)}@example.com` }, "email"],
    [{ ...validInput, homeSiteId: "" }, "homeSiteId"],
    [{ ...validInput, homeSiteId: "11111111-1111-4111-8111-11111111111" }, "homeSiteId"],
    [{ ...validInput, homeSiteId: null }, "homeSiteId"],
  ];
  for (const [input, field] of bad) {
    const result = validateRegisterEmployee(input);
    assert.ok(!result.ok, `expected ${JSON.stringify(input)} to be rejected`);
    assert.ok(result.errors[field as keyof typeof result.errors], `expected an error for ${field}`);
  }
});

// -------------------------------------------------------------------- password

test("temporary passwords are long, mixed and avoid look-alike characters", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const password = generateTemporaryPassword();
    assert.equal(password.length, 16);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /[0-9]/);
    assert.match(password, /[!@#$%&*?]/);
    assert.doesNotMatch(password, /[0OIl1]/);
    seen.add(password);
  }
  assert.equal(seen.size, 300, "passwords must not repeat");
});

test("temporary passwords shorter than 12 characters are refused", () => {
  assert.throws(() => generateTemporaryPassword(8));
  assert.equal(generateTemporaryPassword(24).length, 24);
});
