import "server-only";

import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type AppRole = "employee" | "admin";

export type ApiUserContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  profile: {
    id: string;
    full_name: string;
    role: AppRole;
    home_site_id: string | null;
    is_active: boolean;
  };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requireApiUser(
  allowedRoles?: readonly AppRole[],
): Promise<ApiUserContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new ApiError(`Could not verify your session: ${authError.message}`, 401);
  }
  if (!user) {
    throw new ApiError("Sign in to access this resource.", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, home_site_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new ApiError(`Could not load your account profile: ${profileError.message}`, 500);
  }
  if (!profile || (profile.role !== "employee" && profile.role !== "admin")) {
    throw new ApiError("Your account profile is missing or has an unsupported role.", 403);
  }
  if (!profile.is_active) {
    throw new ApiError("Your account is inactive. Contact your administrator.", 403);
  }
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    throw new ApiError("You are not allowed to perform this action.", 403);
  }

  return { supabase, user, profile };
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new ApiError("Cross-origin requests are not allowed.", 403);
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ApiError("Expected a JSON request body.", 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("The request body is not valid JSON.", 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("The request body must be an object.", 400);
  }

  return body as Record<string, unknown>;
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const databaseError = error as { code?: unknown; message?: unknown };
    const code = typeof databaseError.code === "string" ? databaseError.code : "";
    const message =
      typeof databaseError.message === "string"
        ? databaseError.message
        : "The database request failed.";
    const statusByCode: Record<string, number> = {
      "22023": 400,
      "23505": 409,
      "28000": 401,
      "42501": 403,
      P0002: 404,
    };

    return Response.json({ error: message }, { status: statusByCode[code] ?? 500 });
  }

  console.error("Unexpected API error:", error);
  return Response.json({ error: "An unexpected server error occurred." }, { status: 500 });
}

export function requireUuid(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new ApiError(`${label} must be a valid ID.`, 400);
  }

  return value;
}

export function optionalCoordinates(body: Record<string, unknown>): {
  latitude: number | null;
  longitude: number | null;
} {
  const latitude = body.latitude;
  const longitude = body.longitude;

  if (latitude === undefined && longitude === undefined) {
    return { latitude: null, longitude: null };
  }
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude)
  ) {
    throw new ApiError("Latitude and longitude must be supplied together as numbers.", 400);
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new ApiError("Coordinates are out of range.", 400);
  }

  return { latitude, longitude };
}

export function requireDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(`${label} must be a valid date in YYYY-MM-DD format.`, 400);
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== value
  ) {
    throw new ApiError(`${label} must be a valid date in YYYY-MM-DD format.`, 400);
  }

  return value;
}
