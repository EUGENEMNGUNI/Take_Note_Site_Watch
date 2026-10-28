import { connection } from "next/server";

import {
  ApiError,
  apiErrorResponse,
  assertSameOrigin,
  readJsonObject,
  requireApiUser,
  requireUuid,
} from "@/lib/backend/http";

const CATEGORIES = ["hazard", "accident"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;
const STATUSES = ["open", "investigating", "monitoring", "resolved"] as const;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ApiError(`${label} must be one of: ${allowed.join(", ")}.`, 400);
  }
  return value as T;
}

// Employees see the incidents they reported; managers see their whole site.
export async function GET() {
  await connection();
  try {
    const { supabase } = await requireApiUser(["employee", "manager"]);
    const { data, error } = await supabase
      .from("incidents")
      .select("id, ref_no, site_id, reported_by, category, priority, status, details, location, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return Response.json({ incidents: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase } = await requireApiUser(["employee", "manager"]);
    const body = await readJsonObject(request);

    const category = oneOf(body.category, CATEGORIES, "Category");
    const priority = oneOf(body.priority, PRIORITIES, "Priority");
    const details = typeof body.details === "string" ? body.details.trim() : "";
    if (details.length < 1 || details.length > 2000) {
      throw new ApiError("Details must be between 1 and 2000 characters.", 400);
    }
    const location =
      typeof body.location === "string" && body.location.trim() ? body.location.trim() : null;
    if (location && location.length > 200) {
      throw new ApiError("Location must not exceed 200 characters.", 400);
    }

    const { data, error } = await supabase.rpc("report_incident", {
      p_category: category,
      p_priority: priority,
      p_details: details,
      p_location: location,
    });
    if (error) throw error;
    return Response.json({ incident: data }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase } = await requireApiUser(["manager", "admin"]);
    const body = await readJsonObject(request);
    const incidentId = requireUuid(body.incidentId, "Incident");
    const status = oneOf(body.status, STATUSES, "Status");

    const { data, error } = await supabase.rpc("set_incident_status", {
      p_incident_id: incidentId,
      p_status: status,
    });
    if (error) throw error;
    return Response.json({ incident: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
