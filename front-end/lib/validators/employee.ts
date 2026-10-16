// Validation for registering an employee. Pure functions with no framework or
// Supabase imports, so the same rules can run in the browser form and on the
// server. The server always re-validates: never trust the browser.

export type RegisterEmployeeInput = {
  fullName: string;
  email: string;
  homeSiteId: string;
};

export type FieldErrors = Partial<Record<keyof RegisterEmployeeInput, string>>;

export type ValidationResult =
  | { ok: true; value: RegisterEmployeeInput }
  | { ok: false; errors: FieldErrors };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Deliberately simple: one @, no spaces, a dot in the domain. The real test of
// an address is whether Supabase accepts it.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Control characters (including newlines) have no place in a person's name.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function validateRegisterEmployee(input: unknown): ValidationResult {
  const errors: FieldErrors = {};

  const raw =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const fullName = typeof raw.fullName === "string" ? raw.fullName.trim() : "";
  if (fullName.length < 2) {
    errors.fullName = "Enter the employee's full name (at least 2 characters).";
  } else if (fullName.length > 100) {
    errors.fullName = "Full name must be 100 characters or fewer.";
  } else if (CONTROL_CHARS.test(fullName)) {
    errors.fullName = "Full name contains characters that are not allowed.";
  }

  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  if (email.length === 0) {
    errors.email = "Enter the employee's email address.";
  } else if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  const homeSiteId = typeof raw.homeSiteId === "string" ? raw.homeSiteId.trim() : "";
  if (!UUID_PATTERN.test(homeSiteId)) {
    errors.homeSiteId = "Choose the employee's home site.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { fullName, email, homeSiteId: homeSiteId.toLowerCase() } };
}
