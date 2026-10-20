import { connection } from "next/server";

import {
  ApiError,
  apiErrorResponse,
  assertSameOrigin,
  readJsonObject,
  requireApiUser,
  requireDate,
} from "@/lib/backend/http";

export async function GET() {
  await connection();
  try {
    const { supabase } = await requireApiUser(["employee"]);
    const { data, error } = await supabase
      .from("leave_requests")
      .select("id, leave_type, start_date, end_date, reason, status, decision_note, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return Response.json({ leaveRequests: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireApiUser(["employee"]);
    const body = await readJsonObject(request);
    const startDate = requireDate(body.startDate, "Start date");
    const endDate = requireDate(body.endDate, "End date");
    if (endDate < startDate) {
      throw new ApiError("End date must be on or after the start date.", 400);
    }
    if (body.leaveType !== undefined && body.leaveType !== "sick") {
      throw new ApiError("Only sick leave is currently supported.", 400);
    }

    const reason =
      body.reason === undefined || body.reason === ""
        ? null
        : typeof body.reason === "string"
          ? body.reason.trim()
          : null;
    if (body.reason !== undefined && body.reason !== "" && typeof body.reason !== "string") {
      throw new ApiError("Reason must be text.", 400);
    }
    if (reason && reason.length > 2000) {
      throw new ApiError("Reason must not exceed 2000 characters.", 400);
    }

    const { data, error } = await supabase
      .from("leave_requests")
      .insert({
        employee_id: user.id,
        leave_type: "sick",
        start_date: startDate,
        end_date: endDate,
        reason,
      })
      .select("id, leave_type, start_date, end_date, reason, status, created_at")
      .single();

    if (error) throw error;
    return Response.json({ leaveRequest: data }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
