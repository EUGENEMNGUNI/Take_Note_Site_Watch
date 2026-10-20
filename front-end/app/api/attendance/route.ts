import { connection } from "next/server";

import {
  ApiError,
  apiErrorResponse,
  assertSameOrigin,
  optionalCoordinates,
  readJsonObject,
  requireApiUser,
  requireUuid,
} from "@/lib/backend/http";

export async function GET() {
  await connection();
  try {
    const { supabase, profile } = await requireApiUser();
    const [hoursResult, detailsResult, sitesResult] = await Promise.all([
      supabase
        .from("attendance_hours")
        .select("id, employee_id, site_id, check_in_at, check_out_at, is_open, hours_worked")
        .order("check_in_at", { ascending: false })
        .limit(100),
      supabase
        .from("attendance")
        .select("id, presence_status, check_in_distance_m")
        .order("check_in_at", { ascending: false })
        .limit(100),
      supabase
        .from("sites")
        .select("id, name, latitude, longitude, radius_m, enforce_radius")
        .eq("is_active", true)
        .order("name"),
    ]);

    if (hoursResult.error) throw hoursResult.error;
    if (detailsResult.error) throw detailsResult.error;
    if (sitesResult.error) throw sitesResult.error;

    const attendanceDetails = new Map(
      detailsResult.data.map((record) => [record.id, record]),
    );
    return Response.json({
      profile,
      attendance: hoursResult.data.map((record) => ({
        ...record,
        ...attendanceDetails.get(record.id),
      })),
      sites: sitesResult.data,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase } = await requireApiUser(["employee"]);
    const body = await readJsonObject(request);
    const siteId = requireUuid(body.siteId, "Site ID");
    const { latitude, longitude } = optionalCoordinates(body);
    const accuracyM = body.accuracyM;
    if (
      accuracyM !== undefined &&
      (typeof accuracyM !== "number" || !Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 100000)
    ) {
      throw new ApiError("Location accuracy must be between 0 and 100000 metres.", 400);
    }

    const requestId =
      body.requestId === undefined ? null : requireUuid(body.requestId, "Request ID");
    const { data, error } = await supabase.rpc("check_in", {
      p_site_id: siteId,
      p_latitude: latitude,
      p_longitude: longitude,
      p_accuracy_m: accuracyM ?? null,
      p_request_id: requestId,
    });

    if (error) throw error;
    return Response.json({ attendance: data }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase } = await requireApiUser(["employee"]);
    const body = await readJsonObject(request);
    const { latitude, longitude } = optionalCoordinates(body);
    const requestId =
      body.requestId === undefined ? null : requireUuid(body.requestId, "Request ID");
    const { data, error } = await supabase.rpc("check_out", {
      p_latitude: latitude,
      p_longitude: longitude,
      p_request_id: requestId,
    });

    if (error) throw error;
    return Response.json({ attendance: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
