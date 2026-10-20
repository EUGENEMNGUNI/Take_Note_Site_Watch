import {
  ApiError,
  apiErrorResponse,
  assertSameOrigin,
  readJsonObject,
  requireApiUser,
  requireUuid,
} from "@/lib/backend/http";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    assertSameOrigin(request);
    const { supabase } = await requireApiUser(["admin"]);
    const { requestId: rawRequestId } = await context.params;
    const requestId = requireUuid(rawRequestId, "Leave request ID");
    const body = await readJsonObject(request);

    if (body.decision !== "approved" && body.decision !== "rejected") {
      throw new ApiError("Decision must be approved or rejected.", 400);
    }
    const note =
      body.note === undefined || body.note === ""
        ? null
        : typeof body.note === "string"
          ? body.note.trim()
          : null;
    if (body.note !== undefined && body.note !== "" && typeof body.note !== "string") {
      throw new ApiError("Decision note must be text.", 400);
    }
    if (note && note.length > 2000) {
      throw new ApiError("Decision note must not exceed 2000 characters.", 400);
    }

    const { data, error } = await supabase.rpc("review_leave_request", {
      p_request_id: requestId,
      p_decision: body.decision,
      p_note: note,
    });
    if (error) throw error;
    return Response.json({ leaveRequest: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
