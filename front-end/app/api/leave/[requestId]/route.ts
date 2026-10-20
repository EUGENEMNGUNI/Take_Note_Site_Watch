import {
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
    const { supabase } = await requireApiUser(["employee"]);
    const { requestId: rawRequestId } = await context.params;
    const requestId = requireUuid(rawRequestId, "Leave request ID");
    const body = await readJsonObject(request);

    if (body.action !== "cancel") {
      return Response.json({ error: "The only supported action is cancel." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("cancel_leave_request", {
      p_request_id: requestId,
    });
    if (error) throw error;
    return Response.json({ leaveRequest: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
