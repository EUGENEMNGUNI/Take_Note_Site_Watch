import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  registerEmployee,
  RegisterEmployeeError,
} from "@/lib/server/register-employee";

// POST /api/admin/employees
// Body (JSON): { "fullName": string, "email": string, "homeSiteId": uuid }
// Success 201: { employee: {...}, temporaryPassword }  (shown once, never cached)
// Failure:     { error: { code, message, fields? } }

const MAX_BODY_BYTES = 10_000;

function fail(status: number, code: string, message: string, fields?: unknown) {
  return NextResponse.json(
    { error: { code, message, ...(fields ? { fields } : {}) } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  // Browsers cannot send a cross-site request with this content type without
  // a preflight, which this route does not allow. Together with the same-origin
  // check below, that blocks cross-site request forgery.
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return fail(415, "unsupported_media_type", "Send the request as JSON.");
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!host || originHost !== host) {
      return fail(403, "bad_origin", "Cross-site requests are not allowed.");
    }
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return fail(413, "payload_too_large", "The request is too large.");
    }
    body = JSON.parse(text);
  } catch {
    return fail(400, "invalid_json", "The request body is not valid JSON.");
  }

  try {
    const result = await registerEmployee(
      { caller: await createClient(), admin: createAdminClient() },
      body,
    );
    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RegisterEmployeeError) {
      return fail(error.status, error.code, error.message, error.fields);
    }
    // Never echo internal details to the browser.
    console.error(
      "register-employee: unexpected error:",
      error instanceof Error ? `${error.name}: ${error.message}` : typeof error,
    );
    return fail(500, "internal_error", "Something went wrong. Try again.");
  }
}
