"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { getStoredUserEmail, signOut } from "@/lib/auth";
import { formatWhen } from "@/lib/format";
import { RoleGuard } from "@/components/role-guard";
import { createClient } from "@/lib/supabase/browser";
import { Avatar, BrandLogo } from "@/components/brand";

import "./admin.css";

type SiteRecord = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_m: number;
  is_active: boolean;
  work_start: string;
  work_end: string;
  authorised_network: string | null;
};

type EmployeeRecord = {
  id: string;
  email: string | null;
  full_name: string;
  role: "employee" | "manager" | "admin";
  home_site_id: string | null;
  is_active: boolean;
};

type LeaveRequestRecord = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  decision_note: string | null;
  created_at: string;
};

type LeaveEmployeeRecord = {
  id: string;
  full_name: string;
  email: string | null;
};

type ActivityRecord = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  created_at: string;
};

type DocumentLink = { id: string; fileName: string; url: string };

const ACTION_LABELS: Record<string, string> = {
  "user.role_changed": "Changed a user role",
  "user.activated": "Activated a user",
  "user.deactivated": "Deactivated a user",
  "user.home_site_changed": "Changed a user's home site",
  "site.created": "Created a site",
  "site.updated": "Updated a site",
  "site.activated": "Activated a site",
  "site.deactivated": "Deactivated a site",
  "task.created": "Created a task",
  "task.status_changed": "Updated a task status",
  "incident.reported": "Reported an incident",
  "incident.status_changed": "Updated an incident status",
  "leave.submitted": "Submitted a leave request",
  "leave.approved": "Approved a leave request",
  "leave.rejected": "Rejected a leave request",
  "leave.cancelled": "Cancelled a leave request",
  "leave.document_added": "Attached a leave document",
  "admin_scope.granted": "Granted administrator site access",
  "admin_scope.revoked": "Revoked administrator site access",
};

const describeAction = (action: string) =>
  ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");

type NavId = "dashboard" | "users" | "roles" | "sites" | "assignments" | "leave" | "activity";

const NAV_ITEMS: { id: NavId; label: string; target: string | null }[] = [
  { id: "dashboard", label: "Dashboard", target: null },
  { id: "users", label: "User management", target: "users" },
  { id: "roles", label: "Role management", target: "users" },
  { id: "sites", label: "Site management", target: "sites" },
  { id: "assignments", label: "Site assignments", target: "site-rules" },
  { id: "leave", label: "Leave requests", target: "leave" },
  { id: "activity", label: "Activity history", target: "activity" },
];

const formatDayMonth = (isoDate: string) => {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
};

const inclusiveDays = (start: string, end: string) => {
  const ms = new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
};

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export default function AdminPage() {
  const router = useRouter();
  const [radius, setRadius] = useState(200);
  const [ruleSiteId, setRuleSiteId] = useState("");
  const [ruleStart, setRuleStart] = useState("08:00");
  const [ruleEnd, setRuleEnd] = useState("17:00");
  const [ruleNetwork, setRuleNetwork] = useState("");
  const [ruleMessage, setRuleMessage] = useState("");
  const [ruleMessageType, setRuleMessageType] = useState<"error" | "success">("success");
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [openIncidents, setOpenIncidents] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Admin");
  const [signOutMessage, setSignOutMessage] = useState("");
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestRecord[]>([]);
  const [leaveEmployees, setLeaveEmployees] = useState<LeaveEmployeeRecord[]>([]);
  const [leaveError, setLeaveError] = useState("");
  const [leaveMessage, setLeaveMessage] = useState("");
  const [processingLeaveId, setProcessingLeaveId] = useState<string | null>(null);
  const [directoryError, setDirectoryError] = useState("");
  const [todayStats, setTodayStats] = useState({ checkedIn: 0, outside: 0, onLeave: 0 });
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [activityError, setActivityError] = useState("");
  const [documentLinks, setDocumentLinks] = useState<Record<string, DocumentLink[] | "loading" | "error">>({});
  const [formMessage, setFormMessage] = useState("");
  const [formMessageType, setFormMessageType] = useState<"error" | "success">("success");
  const [activeForm, setActiveForm] = useState<"site" | "employee" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeNav, setActiveNav] = useState<NavId>("dashboard");
  const [todayLabel, setTodayLabel] = useState("Today");

  useEffect(() => {
    void Promise.resolve().then(() => {
      setTodayLabel(
        new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }),
      );
      const email = getStoredUserEmail();
      setDisplayName(email ? email.split("@")[0].replace(/[._-]/g, " ") : "Admin");
    });
  }, []);

  const refreshDirectory = useCallback(async () => {
    try {
      const supabase = createClient();
      const [sitesResult, employeesResult] = await Promise.all([
        supabase
          .from("sites")
          .select("id, name, address, latitude, longitude, radius_m, is_active, work_start, work_end, authorised_network")
          .order("name"),
        supabase
          .from("profiles")
          .select("id, email, full_name, role, home_site_id, is_active")
          .in("role", ["employee", "manager"])
          .order("full_name"),
      ]);

      if (sitesResult.error || employeesResult.error) {
        setDirectoryError(
          sitesResult.error?.message ?? employeesResult.error?.message ?? "Could not load administrator data.",
        );
        return;
      }

      setSites(sitesResult.data ?? []);
      setEmployees(employeesResult.data ?? []);
      setDirectoryError("");
    } catch (error) {
      setDirectoryError(
        error instanceof Error ? error.message : "Could not load administrator data.",
      );
    }
  }, []);

  const refreshToday = useCallback(async () => {
    try {
      const supabase = createClient();
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const today = now.toISOString().slice(0, 10);

      const [openResult, leaveResult] = await Promise.all([
        supabase
          .from("attendance")
          .select("employee_id, presence_status")
          .is("check_out_at", null)
          .gte("check_in_at", startOfDay),
        supabase
          .from("leave_requests")
          .select("employee_id")
          .eq("status", "approved")
          .lte("start_date", today)
          .gte("end_date", today),
      ]);
      if (openResult.error) throw openResult.error;
      if (leaveResult.error) throw leaveResult.error;

      const incidentResult = await supabase
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .neq("status", "resolved");
      if (!incidentResult.error) setOpenIncidents(incidentResult.count ?? 0);

      setTodayStats({
        checkedIn: new Set(openResult.data.map((row) => row.employee_id)).size,
        outside: openResult.data.filter((row) => row.presence_status === "outside_radius").length,
        onLeave: new Set(leaveResult.data.map((row) => row.employee_id)).size,
      });
    } catch {
      // Keep the previous figures; the directory error banner covers outages.
    }
  }, []);

  const refreshActivity = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      setCurrentUserId(authData.user?.id ?? null);
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, actor_id, action, entity_type, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      setActivity(data ?? []);
      setActivityError("");
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : "Could not load activity.");
    }
  }, []);

  const handleViewDocuments = async (requestId: string) => {
    setDocumentLinks((current) => ({ ...current, [requestId]: "loading" }));
    try {
      const response = await fetch(`/api/admin/leave/${requestId}/documents`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setDocumentLinks((current) => ({ ...current, [requestId]: result.documents ?? [] }));
    } catch {
      setDocumentLinks((current) => ({ ...current, [requestId]: "error" }));
    }
  };

  const refreshLeaveRequests = useCallback(async () => {
    const response = await fetch("/api/admin/leave");
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ?? "Could not load leave requests.");
    }
    setLeaveRequests(result.leaveRequests ?? []);
    setLeaveEmployees(result.employees ?? []);
    setLeaveError("");
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refreshDirectory);
    void Promise.resolve().then(refreshToday);
    void Promise.resolve().then(refreshActivity);
  }, [refreshDirectory, refreshToday, refreshActivity]);

  useEffect(() => {
    void Promise.resolve().then(refreshLeaveRequests).catch((error: unknown) => {
      setLeaveError(error instanceof Error ? error.message : "Could not load leave requests.");
    });
  }, [refreshLeaveRequests]);

  const openForm = (form: "site" | "employee") => {
    setFormMessage("");
    setActiveForm(form);
  };

  const closeForm = () => {
    if (isSaving) return;
    setFormMessage("");
    setActiveForm(null);
  };

  const handleCreateSite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const latitude = Number(formData.get("latitude"));
    const longitude = Number(formData.get("longitude"));
    const radius = Number(formData.get("radius_m"));
    const enforceRadius = formData.get("enforce_radius") === "on";

    setIsSaving(true);
    setFormMessage("");
    try {
      const { error } = await createClient()
        .from("sites")
        .insert({
          name,
          address: address || null,
          latitude,
          longitude,
          radius_m: radius,
          enforce_radius: enforceRadius,
        });

      if (error) {
        setFormMessage(error.message);
        setFormMessageType("error");
        return;
      }

      setFormMessageType("success");
      setFormMessage("Site created.");
      setActiveForm(null);
      await refreshDirectory();
      void refreshActivity();
    } catch (error) {
      setFormMessage(
        error instanceof Error ? error.message : "Site creation failed unexpectedly.",
      );
      setFormMessageType("error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegisterEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const formData = new FormData(event.currentTarget);
    setIsSaving(true);
    setFormMessage("");

    try {
      const response = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: String(formData.get("full_name") ?? ""),
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
          homeSiteId: String(formData.get("home_site_id") ?? ""),
          role: String(formData.get("role") ?? "employee"),
        }),
      });
      const result: { error?: string } = await response.json();

      if (!response.ok) {
        setFormMessage(result.error ?? `Employee registration failed (${response.status}).`);
        setFormMessageType("error");
        return;
      }

      setFormMessageType("success");
      setFormMessage("Employee account created and assigned to the selected site.");
      setActiveForm(null);
      await refreshDirectory();
    } catch (error) {
      setFormMessage(
        error instanceof Error ? error.message : "Employee registration failed unexpectedly.",
      );
      setFormMessageType("error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLeaveDecision = async (
    requestId: string,
    decision: "approved" | "rejected",
  ) => {
    setProcessingLeaveId(requestId);
    setLeaveError("");
    setLeaveMessage("");
    try {
      const response = await fetch(`/api/admin/leave/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Leave request could not be reviewed.");
      }
      setLeaveMessage(`Leave request ${decision}.`);
      await refreshLeaveRequests();
      void refreshToday();
    } catch (error) {
      setLeaveError(
        error instanceof Error ? error.message : "Leave request could not be reviewed.",
      );
    } finally {
      setProcessingLeaveId(null);
    }
  };

  const allProfileName = (actorId: string | null) => {
    if (!actorId) return "System";
    return (
      employees.find((employee) => employee.id === actorId)?.full_name ||
      leaveEmployees.find((employee) => employee.id === actorId)?.full_name ||
      (actorId === currentUserId ? displayName : "Administrator")
    );
  };

  const selectRuleSite = (siteId: string) => {
    setRuleSiteId(siteId);
    setRuleMessage("");
    const selected = sites.find((item) => item.id === siteId);
    if (!selected) return;
    setRadius(selected.radius_m);
    setRuleStart(selected.work_start.slice(0, 5));
    setRuleEnd(selected.work_end.slice(0, 5));
    setRuleNetwork(selected.authorised_network ?? "");
  };

  useEffect(() => {
    // Start with the first site selected so the rules are visible straight away.
    if (!ruleSiteId && sites.length > 0) {
      void Promise.resolve().then(() => selectRuleSite(sites[0].id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, ruleSiteId]);

  const handleSaveRules = async () => {
    if (isSavingRules || !ruleSiteId) return;
    if (ruleEnd <= ruleStart) {
      setRuleMessage("Work end must be later than work start.");
      setRuleMessageType("error");
      return;
    }
    setIsSavingRules(true);
    setRuleMessage("");
    try {
      const { data, error } = await createClient()
        .from("sites")
        .update({
          radius_m: radius,
          work_start: ruleStart,
          work_end: ruleEnd,
          authorised_network: ruleNetwork.trim() || null,
        })
        .eq("id", ruleSiteId)
        .select("id");
      if (error) {
        setRuleMessage(error.message);
        setRuleMessageType("error");
        return;
      }
      if (!data || data.length === 0) {
        setRuleMessage("You do not have permission to change this site.");
        setRuleMessageType("error");
        return;
      }
      setRuleMessage("Site rules saved.");
      setRuleMessageType("success");
      await refreshDirectory();
      void refreshActivity();
    } catch (caught) {
      setRuleMessage(caught instanceof Error ? caught.message : "Could not save site rules.");
      setRuleMessageType("error");
    } finally {
      setIsSavingRules(false);
    }
  };

  const updateRadius = (value: number) => setRadius(value);

  const goTo = (item: (typeof NAV_ITEMS)[number]) => {
    setActiveNav(item.id);
    if (item.target === null) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    document.getElementById(item.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const managerOf = (siteId: string) =>
    employees.find(
      (person) => person.role === "manager" && person.is_active && person.home_site_id === siteId,
    )?.full_name ?? "—";

  const pendingLeave = leaveRequests.filter((request) => request.status === "pending");
  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/");
    } catch (error) {
      setSignOutMessage(
        error instanceof Error ? error.message : "Could not sign out. Please try again.",
      );
    }
  };

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <div className="app">
        <aside className="side">
          <BrandLogo />
          <div className="tag">SITE WATCH</div>

          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav${activeNav === item.id ? " on" : ""}`}
              onClick={() => goTo(item)}
            >
              {item.label}
              {item.id === "leave" && pendingLeave.length > 0 ? (
                <span className="badge">{pendingLeave.length}</span>
              ) : null}
            </button>
          ))}

          <div className="user">
            <Avatar name={displayName} red />
            <div>
              <b>{displayName}</b>
              <span>Administrator</span>
              <br />
              <button type="button" className="link-button" onClick={handleSignOut}>Sign out</button>
              {signOutMessage ? <div className="message error" role="alert">{signOutMessage}</div> : null}
            </div>
          </div>
        </aside>

        <main className="main admin-main">
          <div className="top">
            <div>
              <h1>Company overview</h1>
              <p className="sub">All sites · {todayLabel}</p>
            </div>
            <div className="actions">
              <button className="btn outline" type="button" onClick={() => openForm("site")}>New site</button>
              <button className="btn" type="button" onClick={() => openForm("employee")}>Register employee</button>
            </div>
          </div>

          {directoryError ? <div className="message-box error" role="alert">{directoryError}</div> : null}

          {activeForm === "site" ? (
            <section className="card stack" aria-labelledby="create-site-heading">
              <h2 id="create-site-heading">Create site</h2>
              <form onSubmit={handleCreateSite}>
                <div className="form-grid">
                  <div>
                    <label htmlFor="site-name">Site name</label>
                    <input id="site-name" name="name" required minLength={1} maxLength={120} />
                  </div>
                  <div>
                    <label htmlFor="site-address">Address</label>
                    <input id="site-address" name="address" maxLength={300} />
                  </div>
                  <div>
                    <label htmlFor="site-latitude">Latitude</label>
                    <input id="site-latitude" name="latitude" type="number" min={-90} max={90} step="any" required />
                  </div>
                  <div>
                    <label htmlFor="site-longitude">Longitude</label>
                    <input id="site-longitude" name="longitude" type="number" min={-180} max={180} step="any" required />
                  </div>
                  <div>
                    <label htmlFor="site-radius">Attendance radius (metres)</label>
                    <input id="site-radius" name="radius_m" type="number" min={10} max={5000} defaultValue={150} required />
                  </div>
                  <label className="checkbox-label">
                    <input name="enforce_radius" type="checkbox" />
                    Reject check-ins outside the radius
                  </label>
                </div>
                <div className="form-actions">
                  <button className="btn" type="submit" disabled={isSaving}>{isSaving ? "Creating..." : "Create site"}</button>
                  <button className="btn outline" type="button" onClick={closeForm} disabled={isSaving}>Cancel</button>
                </div>
              </form>
            </section>
          ) : null}

          {activeForm === "employee" ? (
            <section className="card stack" aria-labelledby="register-employee-heading">
              <h2 id="register-employee-heading">Register employee</h2>
              {sites.filter((site) => site.is_active).length === 0 ? (
                <p className="message error" role="alert">Create an active site before registering an employee.</p>
              ) : (
                <form onSubmit={handleRegisterEmployee}>
                  <div className="form-grid">
                    <div>
                      <label htmlFor="employee-name">Full name</label>
                      <input id="employee-name" name="full_name" required minLength={2} maxLength={120} />
                    </div>
                    <div>
                      <label htmlFor="employee-email">Email address</label>
                      <input id="employee-email" name="email" type="email" required maxLength={254} autoComplete="email" />
                    </div>
                    <div>
                      <label htmlFor="employee-password">Temporary password</label>
                      <input id="employee-password" name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" />
                    </div>
                    <div>
                      <label htmlFor="employee-role">Role</label>
                      <select id="employee-role" name="role" defaultValue="employee">
                        <option value="employee">Employee</option>
                        <option value="manager">Site manager</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="employee-site">Home site</label>
                      <select id="employee-site" name="home_site_id" required defaultValue="">
                        <option value="" disabled>Select a site</option>
                        {sites.filter((site) => site.is_active).map((site) => (
                          <option key={site.id} value={site.id}>{site.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="small" style={{ margin: "8px 0 14px" }}>
                    Share the temporary password securely. The employee will sign in with this email and password.
                  </p>
                  <div className="form-actions">
                    <button className="btn" type="submit" disabled={isSaving}>{isSaving ? "Registering..." : "Register employee"}</button>
                    <button className="btn outline" type="button" onClick={closeForm} disabled={isSaving}>Cancel</button>
                  </div>
                </form>
              )}
            </section>
          ) : null}

          {formMessage ? (
            <div className={`message-box ${formMessageType} stack`} role={formMessageType === "error" ? "alert" : "status"}>
              {formMessage}
            </div>
          ) : null}

          <div className="stats">
            <div className="stat"><b>{employees.length}</b>Total employees</div>
            <div className="stat"><b className="green-num">{todayStats.checkedIn}</b>Checked in</div>
            <div className="stat"><b>{Math.max(0, employees.filter((person) => person.role === "employee").length - todayStats.checkedIn - todayStats.onLeave)}</b>Absent</div>
            <div className="stat"><b className="red-num">{todayStats.outside}</b>Outside site</div>
            <div className="stat"><b className="blue-num">{todayStats.onLeave}</b>On leave</div>
            <div className="stat"><b className="red-num">{openIncidents}</b>Open incidents</div>
          </div>

          <div className="admin-grid-a">
            <section className="card" id="sites">
              <div className="card-head"><h2>Sites</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Manager</th>
                    <th>Staff</th>
                    <th>Radius</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.id}>
                      <td>
                        <b>{site.name}</b>
                        {site.address ? <><br /><span className="small">{site.address}</span></> : null}
                        {!site.is_active ? <><br /><span className="pill grey">Inactive</span></> : null}
                      </td>
                      <td>{managerOf(site.id)}</td>
                      <td>{employees.filter((employee) => employee.home_site_id === site.id).length}</td>
                      <td>{site.radius_m} m</td>
                    </tr>
                  ))}
                  {sites.length === 0 ? (
                    <tr><td colSpan={4}>{directoryError ? "Sites could not be loaded." : "No sites found. Create your first site."}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </section>

            <section className="card" id="site-rules">
              <div className="card-head">
                <h2>Site rules</h2>
                <select id="rules-site" aria-label="Site" value={ruleSiteId} onChange={(e) => selectRuleSite(e.target.value)}>
                  <option value="" disabled>Select a site</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </div>

              <div className="slider-row">
                <label htmlFor="rules-radius">Site radius</label>
                <b><span id="radiusText">{radius}</span> m</b>
              </div>
              <input id="rules-radius" type="range" min={50} max={500} value={radius} onChange={(e) => updateRadius(Number(e.target.value))} />

              <div className="rules-times">
                <div>
                  <label htmlFor="rules-start">Work starts</label>
                  <input id="rules-start" type="time" value={ruleStart} onChange={(e) => setRuleStart(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="rules-end">Work ends</label>
                  <input id="rules-end" type="time" value={ruleEnd} onChange={(e) => setRuleEnd(e.target.value)} />
                </div>
              </div>

              <label htmlFor="rules-network">Authorised network</label>
              <input id="rules-network" value={ruleNetwork} maxLength={200} onChange={(e) => setRuleNetwork(e.target.value)} placeholder="e.g. Company Wi-Fi" />

              <p className="small rules-note">
                Working hours and network are recorded for the site but not yet enforced at check-in. Location is only requested at check-in.
              </p>

              <button className="btn" type="button" onClick={() => void handleSaveRules()} disabled={isSavingRules || !ruleSiteId}>
                {isSavingRules ? "Saving..." : "Save site rules"}
              </button>
              {ruleMessage ? (
                <p className={`message-box ${ruleMessageType}`} role={ruleMessageType === "error" ? "alert" : "status"}>{ruleMessage}</p>
              ) : null}
            </section>
          </div>

          <div className="admin-grid-b">
            <section className="card" id="leave">
              <div className="card-head"><h2>Leave awaiting approval</h2></div>
              {leaveMessage ? <p className="message-box success" role="status">{leaveMessage}</p> : null}
              {leaveError ? <p className="message-box error" role="alert">{leaveError}</p> : null}
              {pendingLeave.map((request) => {
                const employee = leaveEmployees.find((item) => item.id === request.employee_id);
                const links = documentLinks[request.id];
                return (
                  <div key={request.id} className="leave-block">
                    <div className="row">
                      <b>{employee?.full_name || employee?.email || "Employee"}</b>
                      <span className="pill amber dot">Pending</span>
                    </div>
                    <div className="meta">
                      {capitalise(request.leave_type)} leave · {formatDayMonth(request.start_date)} to {formatDayMonth(request.end_date)} ·{" "}
                      {inclusiveDays(request.start_date, request.end_date)} {inclusiveDays(request.start_date, request.end_date) === 1 ? "day" : "days"}
                    </div>
                    {request.reason ? <p className="reason">Reason: {request.reason}</p> : null}
                    {links === undefined ? (
                      <button type="button" className="link-button doc-link" onClick={() => void handleViewDocuments(request.id)}>
                        View supporting documents
                      </button>
                    ) : links === "loading" ? (
                      <span className="doc-link plain">Loading documents...</span>
                    ) : links === "error" ? (
                      <span className="doc-link plain">Documents could not be loaded.</span>
                    ) : links.length === 0 ? (
                      <span className="doc-link plain">No documents attached.</span>
                    ) : (
                      <div className="doc-links">
                        {links.map((link) => (
                          <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer">
                            {link.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="buttons">
                      <button
                        className="btn"
                        type="button"
                        disabled={processingLeaveId === request.id}
                        onClick={() => void handleLeaveDecision(request.id, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        className="btn outline"
                        type="button"
                        disabled={processingLeaveId === request.id}
                        onClick={() => void handleLeaveDecision(request.id, "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
              {pendingLeave.length === 0 && !leaveError ? (
                <p className="small">No leave requests are awaiting approval.</p>
              ) : null}
            </section>

            <section className="card" id="activity">
              <div className="card-head">
                <h2>Activity history</h2>
                <button type="button" className="link-button view-all" onClick={() => void refreshActivity()}>View all</button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatWhen(entry.created_at)}</td>
                      <td>{allProfileName(entry.actor_id)}</td>
                      <td>{describeAction(entry.action)}</td>
                    </tr>
                  ))}
                  {activity.length === 0 ? (
                    <tr><td colSpan={3}>{activityError || "No activity recorded yet."}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </section>
          </div>

          <section className="card stack" id="users">
            <div className="card-head">
              <h2>Users and roles</h2>
              <button type="button" className="link-button view-all" onClick={() => openForm("employee")}>Manage users</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Site</th>
                  <th>Account</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <b>{employee.full_name || "—"}</b>
                      {employee.email ? <><br /><span className="users-sub">{employee.email}</span></> : null}
                    </td>
                    <td>
                      <span className={`pill ${employee.role === "manager" ? "blue" : "grey"}`}>
                        {employee.role === "manager" ? "Site Manager" : "Employee"}
                      </span>
                    </td>
                    <td>{sites.find((site) => site.id === employee.home_site_id)?.name ?? "Unassigned"}</td>
                    <td>{employee.is_active ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
                {employees.length === 0 ? (
                  <tr><td colSpan={4}>{directoryError ? "Employees could not be loaded." : "No employees found."}</td></tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </main>
      </div>
    </RoleGuard>
  );
}
