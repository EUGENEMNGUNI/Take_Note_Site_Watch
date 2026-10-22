import { connection } from "next/server";

import { apiErrorResponse, requireApiUser, requireUuid } from "@/lib/backend/http";

const SIGNED_URL_SECONDS = 300;

type RouteContext = { params: Promise<{ requestId: string }> };

// Lists the supporting documents of a leave request with short-lived signed
// URLs. Row Level Security limits both the rows and the storage objects to
// administrators with scope over the employee.
export async function GET(_request: Request, context: RouteContext) {
  await connection();
  try {
    const requestId = requireUuid((await context.params).requestId, "Leave request");
    const { supabase } = await requireApiUser(["admin"]);

    const { data, error } = await supabase
      .from("leave_documents")
      .select("id, file_name, mime_type, size_bytes, storage_path, created_at")
      .eq("leave_request_id", requestId)
      .order("created_at");
    if (error) throw error;

    const documents = await Promise.all(
      data.map(async (document) => {
        const { data: signed, error: signError } = await supabase.storage
          .from("leave-documents")
          .createSignedUrl(document.storage_path, SIGNED_URL_SECONDS);
        if (signError) throw signError;
        return {
          id: document.id,
          fileName: document.file_name,
          mimeType: document.mime_type,
          sizeBytes: document.size_bytes,
          url: signed.signedUrl,
        };
      }),
    );

    return Response.json({ documents });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
