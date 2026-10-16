// Registers a new employee: creates the sign-in account with the secret key and
// sets their home site, on behalf of a signed-in administrator.
//
// This module deliberately has no Next.js imports so it can be tested with
// fake clients (tests/automated/register-employee.test.ts). The route handler
// at app/api/admin/employees/route.ts supplies the real ones.
//
// Order of checks (each one stops the request):
//   1. a signed-in user                      -> 401
//   2. valid input                           -> 400
//   3. the user administers the chosen site  -> 403
//   4. the site is active                    -> 422
//   5. create the account (secret key)       -> 409 if the email is taken
//   6. set name + home site, audit entry     -> account is deleted again if this fails
//
// Step 3 runs as the signed-in user, so Row Level Security and the database's
// own admin checks decide it. Only steps 5 and 6 use the secret key. The
// database function in step 6 repeats the scope check, so a bug here cannot
// register someone at a site the administrator does not manage.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  validateRegisterEmployee,
  type FieldErrors,
} from "../validators/employee";
import { generateTemporaryPassword } from "./password";

export class RegisterEmployeeError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: FieldErrors;

  constructor(status: number, code: string, message: string, fields?: FieldErrors) {
    super(message);
    this.name = "RegisterEmployeeError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export type RegisterEmployeeDeps = {
  /** Acts as the signed-in user (anon key + session cookie). Row Level Security applies. */
  caller: SupabaseClient;
  /** Acts as the service role (secret key). Bypasses Row Level Security. */
  admin: SupabaseClient;
  /** Replaceable in tests. */
  generatePassword?: () => string;
};

export type RegisterEmployeeResult = {
  employee: { id: string; email: string; fullName: string; homeSiteId: string };
  /** Shown to the administrator once. It is never stored or logged. */
  temporaryPassword: string;
};

type ErrorLike = { code?: string; status?: number; message?: string };

function isDuplicateEmail(error: ErrorLike): boolean {
  return (
    error.code === "email_exists" ||
    error.code === "user_already_exists" ||
    (error.status === 422 && /already/i.test(error.message ?? ""))
  );
}

async function rollbackAccount(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    // Logged with the id only (no email, no password) so an operator can clean up.
    console.error(
      "register-employee: ROLLBACK FAILED, orphaned account needs manual removal:",
      userId,
      (error as ErrorLike).code ?? (error as ErrorLike).status,
    );
  }
}

export async function registerEmployee(
  deps: RegisterEmployeeDeps,
  input: unknown,
): Promise<RegisterEmployeeResult> {
  const { caller, admin } = deps;

  // 1. Who is asking? getUser() re-checks the token with Supabase.
  const { data: auth, error: authError } = await caller.auth.getUser();
  const actor = auth?.user;
  if (authError || !actor) {
    throw new RegisterEmployeeError(401, "not_signed_in", "Sign in to continue.");
  }

  // 2. Input.
  const validated = validateRegisterEmployee(input);
  if (!validated.ok) {
    throw new RegisterEmployeeError(
      400,
      "invalid_input",
      "Check the highlighted fields.",
      validated.errors,
    );
  }
  const { fullName, email, homeSiteId } = validated.value;

  // 3. Is the caller an active administrator of this site? The database
  // function answers false for non-administrators and for unknown sites alike.
  const { data: allowed, error: scopeError } = await caller.rpc("admin_can_access_site", {
    p_site_id: homeSiteId,
  });
  if (scopeError) {
    console.error("register-employee: scope check failed", (scopeError as ErrorLike).code);
    throw new RegisterEmployeeError(500, "scope_check_failed", "Something went wrong. Try again.");
  }
  if (allowed !== true) {
    throw new RegisterEmployeeError(
      403,
      "forbidden",
      "You are not allowed to register employees at this site.",
    );
  }

  // 4. Fail early on an inactive site instead of creating and deleting an account.
  const { data: site, error: siteError } = await caller
    .from("sites")
    .select("id, is_active")
    .eq("id", homeSiteId)
    .maybeSingle();
  if (siteError) {
    console.error("register-employee: site lookup failed", (siteError as ErrorLike).code);
    throw new RegisterEmployeeError(500, "site_lookup_failed", "Something went wrong. Try again.");
  }
  if (!site || site.is_active !== true) {
    throw new RegisterEmployeeError(
      422,
      "site_inactive",
      "That site is inactive. Choose an active site.",
      { homeSiteId: "That site is inactive." },
    );
  }

  // 5. Create the sign-in account. The employee must change this password at
  // first sign-in: the flag lives in app_metadata, which users cannot edit.
  const temporaryPassword = (deps.generatePassword ?? generateTemporaryPassword)();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { must_change_password: true },
  });
  if (createError || !created?.user) {
    const details = (createError ?? {}) as ErrorLike;
    if (createError && isDuplicateEmail(details)) {
      throw new RegisterEmployeeError(
        409,
        "email_taken",
        "An account with this email address already exists.",
        { email: "An account with this email address already exists." },
      );
    }
    console.error("register-employee: create user failed", details.status, details.code);
    throw new RegisterEmployeeError(
      502,
      "account_creation_failed",
      "The account could not be created. Try again.",
    );
  }
  const userId = created.user.id;

  // 6. Name, home site and audit entry in one database call. If it fails the
  // account is removed, so a half-registered person never exists.
  const { data: profile, error: profileError } = await admin.rpc("register_employee_profile", {
    p_actor_id: actor.id,
    p_user_id: userId,
    p_full_name: fullName,
    p_home_site_id: homeSiteId,
  });
  if (profileError || !profile) {
    await rollbackAccount(admin, userId);
    const code = (profileError as ErrorLike | null)?.code;
    console.error("register-employee: profile step failed", code);
    if (code === "42501") {
      throw new RegisterEmployeeError(
        403,
        "forbidden",
        "You are not allowed to register employees at this site.",
      );
    }
    if (code === "P0002") {
      throw new RegisterEmployeeError(
        422,
        "site_inactive",
        "That site is no longer available. Choose another site.",
        { homeSiteId: "That site is no longer available." },
      );
    }
    throw new RegisterEmployeeError(500, "registration_failed", "Registration failed. Try again.");
  }

  return {
    employee: { id: userId, email, fullName, homeSiteId },
    temporaryPassword,
  };
}
