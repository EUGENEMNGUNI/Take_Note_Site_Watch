import { connection } from "next/server";

import { apiErrorResponse, requireApiUser } from "@/lib/backend/http";

export async function GET() {
  await connection();
  try {
    const { supabase } = await requireApiUser(["admin"]);
    const { data: leaveRequests, error } = await supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type, start_date, end_date, reason, status, decision_note, created_at, reviewed_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const employeeIds = [...new Set(leaveRequests.map((request) => request.employee_id))];
    let employees: { id: string; full_name: string; email: string | null }[] = [];
    if (employeeIds.length > 0) {
      const { data, error: employeesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", employeeIds);
      if (employeesError) throw employeesError;
      employees = data;
    }

    return Response.json({ leaveRequests, employees });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
