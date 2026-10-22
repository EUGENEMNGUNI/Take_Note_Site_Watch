import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Expected a JSON request body." }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body is not valid JSON." }, { status: 400 });
  }

  if (!isRecord(body)) {
    return Response.json({ error: "The request body must be an object." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const homeSiteId = typeof body.homeSiteId === "string" ? body.homeSiteId : "";
  const role = body.role === undefined ? "employee" : body.role;
  if (role !== "employee" && role !== "manager") {
    return Response.json({ error: "Role must be employee or manager." }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return Response.json({ error: "Enter a valid employee email address." }, { status: 400 });
  }
  if (fullName.length < 2 || fullName.length > 120) {
    return Response.json({ error: "Employee name must be between 2 and 120 characters." }, { status: 400 });
  }
  if (password.length < 12 || password.length > 72) {
    return Response.json({ error: "The temporary password must be between 12 and 72 characters." }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(homeSiteId)) {
    return Response.json({ error: "Select a valid home site." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Sign in as an administrator to register employees." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return Response.json({ error: `Could not verify administrator access: ${profileError.message}` }, { status: 500 });
  }
  if (profile?.role !== "admin" || profile.is_active !== true) {
    return Response.json({ error: "Active administrator access is required." }, { status: 403 });
  }

  const { data: siteScope, error: scopeError } = await supabase
    .from("admin_site_access")
    .select("site_id")
    .eq("admin_id", user.id)
    .eq("site_id", homeSiteId)
    .maybeSingle();

  if (scopeError) {
    return Response.json({ error: `Could not verify site access: ${scopeError.message}` }, { status: 500 });
  }
  if (!siteScope) {
    return Response.json({ error: "You do not have administrator access to that site." }, { status: 403 });
  }

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id")
    .eq("id", homeSiteId)
    .eq("is_active", true)
    .maybeSingle();

  if (siteError) {
    return Response.json({ error: `Could not verify the selected site: ${siteError.message}` }, { status: 500 });
  }
  if (!site) {
    return Response.json({ error: "The selected site is inactive or unavailable." }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      { error: "Employee registration is not configured: set SUPABASE_SERVICE_ROLE_KEY in the frontend server environment." },
      { status: 503 },
    );
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError) {
    const alreadyExists = /already (been )?registered|already exists/i.test(createError.message);
    return Response.json(
      { error: createError.message },
      { status: alreadyExists ? 409 : 400 },
    );
  }
  if (!created.user) {
    return Response.json({ error: "Supabase did not return the created employee account." }, { status: 502 });
  }

  const { data: updatedProfile, error: updateError } = await admin
    .from("profiles")
    .update({ full_name: fullName, role, home_site_id: homeSiteId, is_active: true })
    .eq("id", created.user.id)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedProfile) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    if (cleanupError) {
      return Response.json(
        { error: `The account was created but could not be assigned to its site, and cleanup failed: ${cleanupError.message}` },
        { status: 500 },
      );
    }
    return Response.json(
      {
        error: updateError
          ? `Could not configure the employee profile; the incomplete account was removed: ${updateError.message}`
          : "No employee profile was created; the incomplete account was removed.",
      },
      { status: 500 },
    );
  }

  return Response.json(
    { employee: { id: created.user.id, email, fullName, homeSiteId, role } },
    { status: 201 },
  );
}
