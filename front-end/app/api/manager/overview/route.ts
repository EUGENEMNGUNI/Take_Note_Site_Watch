import { connection } from "next/server";

import { apiErrorResponse, requireApiUser } from "@/lib/backend/http";

// Everything the manager dashboard needs for the manager's own site. Row Level
// Security limits each query to that site.
export async function GET() {
  await connection();
  try {
    const { supabase, profile } = await requireApiUser(["manager"]);
    if (!profile.home_site_id) {
      return Response.json({ error: "Your account has no site assigned. Contact your administrator." }, { status: 409 });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [siteResult, staffResult, attendanceResult, alertsResult] = await Promise.all([
      supabase
        .from("sites")
        .select("id, name, latitude, longitude, radius_m, work_start, work_end")
        .eq("id", profile.home_site_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("id, full_name, email, is_active")
        .eq("role", "employee")
        .eq("home_site_id", profile.home_site_id)
        .order("full_name"),
      supabase
        .from("attendance")
        .select(
          "id, employee_id, check_in_at, check_out_at, presence_status, check_in_lat, check_in_lng, check_in_distance_m",
        )
        .eq("site_id", profile.home_site_id)
        .gte("check_in_at", startOfDay.toISOString())
        .order("check_in_at", { ascending: false })
        .limit(200),
      supabase
        .from("alerts")
        .select("id, alert_type, status, employee_id, message, created_at")
        .eq("site_id", profile.home_site_id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    for (const result of [siteResult, staffResult, attendanceResult, alertsResult]) {
      if (result.error) throw result.error;
    }

    return Response.json({
      manager: { id: profile.id, fullName: profile.full_name },
      site: siteResult.data,
      staff: staffResult.data,
      attendance: attendanceResult.data,
      alerts: alertsResult.data,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
