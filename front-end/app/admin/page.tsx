"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { getStoredUserEmail, signOut } from "@/lib/auth";
import { RoleGuard } from "@/components/role-guard";
import { createClient } from "@/lib/supabase/browser";

type SiteRecord = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_m: number;
  is_active: boolean;
};

type EmployeeRecord = {
  id: string;
  email: string | null;
  full_name: string;
  role: "employee" | "admin";
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

export default function AdminPage() {
  const router = useRouter();
  const [radius, setRadius] = useState(200);
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
  const [formMessage, setFormMessage] = useState("");
  const [formMessageType, setFormMessageType] = useState<"error" | "success">("success");
  const [activeForm, setActiveForm] = useState<"site" | "employee" | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => {
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
          .select("id, name, address, latitude, longitude, radius_m, is_active")
          .order("name"),
        supabase
          .from("profiles")
          .select("id, email, full_name, role, home_site_id, is_active")
          .eq("role", "employee")
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
  }, [refreshDirectory]);

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
    } catch (error) {
      setLeaveError(
        error instanceof Error ? error.message : "Leave request could not be reviewed.",
      );
    } finally {
      setProcessingLeaveId(null);
    }
  };

  const updateRadius = (value: number) => setRadius(value);
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
        <div className="logo">TAKE NOTE</div>
        <div className="tag">SITE WATCH</div>

        <a className="nav on" href="#">Dashboard</a>
        <a className="nav" href="#">User management</a>
        <a className="nav" href="#">Role management</a>
        <a className="nav" href="#">Site management</a>
        <a className="nav" href="#">Site assignments</a>
        <a className="nav" href="#">
          Leave requests
          <span className="badge">{leaveRequests.filter((request) => request.status === "pending").length}</span>
        </a>
        <a className="nav" href="#">Activity history</a>

        <div className="user">
          <b>{displayName}</b>
          <br />
          Administrator
          <br />
          <button type="button" className="link-button" onClick={handleSignOut}>Sign out</button>
          {signOutMessage ? <div className="message error" role="alert">{signOutMessage}</div> : null}
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <div>
            <h1>Company overview</h1>
            <span className="small">Manage your company sites and employees</span>
          </div>
          <div>
            <button className="btn outline" type="button" onClick={() => openForm("site")}>New site</button>
            <button className="btn" type="button" style={{ marginLeft: 12 }} onClick={() => openForm("employee")}>Register employee</button>
          </div>
        </div>

        {directoryError ? <div className="message-box error" role="alert">{directoryError}</div> : null}

        {activeForm === "site" ? (
          <section className="card" aria-labelledby="create-site-heading" style={{ marginBottom: 18 }}>
            <h2 id="create-site-heading">Create site</h2>
            <form onSubmit={handleCreateSite}>
              <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
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
                <label style={{ alignSelf: "end", marginBottom: 12 }}>
                  <input name="enforce_radius" type="checkbox" style={{ width: "auto", marginRight: 8 }} />
                  Reject check-ins outside the radius
                </label>
              </div>
              <button className="btn" type="submit" disabled={isSaving}>{isSaving ? "Creating..." : "Create site"}</button>
              <button className="btn outline" type="button" onClick={closeForm} disabled={isSaving} style={{ marginLeft: 10 }}>Cancel</button>
            </form>
          </section>
        ) : null}

        {activeForm === "employee" ? (
          <section className="card" aria-labelledby="register-employee-heading" style={{ marginBottom: 18 }}>
            <h2 id="register-employee-heading">Register employee</h2>
            {sites.filter((site) => site.is_active).length === 0 ? (
              <p className="message error" role="alert">Create an active site before registering an employee.</p>
            ) : (
              <form onSubmit={handleRegisterEmployee}>
                <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
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
                <button className="btn" type="submit" disabled={isSaving}>{isSaving ? "Registering..." : "Register employee"}</button>
                <button className="btn outline" type="button" onClick={closeForm} disabled={isSaving} style={{ marginLeft: 10 }}>Cancel</button>
              </form>
            )}
          </section>
        ) : null}

        {formMessage ? (
          <div className={`message-box ${formMessageType}`} role={formMessageType === "error" ? "alert" : "status"}>
            {formMessage}
          </div>
        ) : null}

        <div className="stats">
          <div className="stat"><b>{employees.length}</b>Total employees in your site scope</div>
          <div className="stat"><b className="green">43</b>Checked in</div>
          <div className="stat"><b>7</b>Absent</div>
          <div className="stat"><b style={{ color: "#9a1b1b" }}>3</b>Outside site</div>
          <div className="stat"><b style={{ color: "#1e4fa0" }}>4</b>On leave</div>
          <div className="stat"><b style={{ color: "#9a1b1b" }}>5</b>Open incidents</div>
        </div>

        <div className="grid2" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
          <div className="card">
            <h2>Sites</h2>
            <table>
              <thead>
                <tr>
                  <th>Site</th>
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
                    <td>{employees.filter((employee) => employee.home_site_id === site.id).length}</td>
                    <td>{site.radius_m} m</td>
                  </tr>
                ))}
                {sites.length === 0 ? (
                  <tr><td colSpan={3}>{directoryError ? "Sites could not be loaded." : "No sites found. Create your first site."}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>
              Site rules
              <span className="small">Company Headquarters</span>
            </h2>

            <label>
              Site radius:
              <span id="radiusText">{radius}</span> m
            </label>

            <input type="range" min={50} max={500} value={radius} onChange={(e) => updateRadius(Number(e.target.value))} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label>Work starts</label>
                <input type="time" defaultValue="08:00" />
              </div>
              <div>
                <label>Work ends</label>
                <input type="time" defaultValue="17:00" />
              </div>
            </div>

            <label>Authorised network</label>
            <input defaultValue="Company Wi-Fi" />

            <p className="small" style={{ margin: "8px 0 14px" }}>
              Location is monitored only between the start and end times above.
            </p>

            <button className="btn">Save site rules</button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Employees</h2>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Home site</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.full_name || "—"}</td>
                  <td>{employee.email || "—"}</td>
                  <td>{sites.find((site) => site.id === employee.home_site_id)?.name ?? "Unassigned"}</td>
                  <td><span className={`pill ${employee.is_active ? "green" : "grey"}`}>{employee.is_active ? "Active" : "Inactive"}</span></td>
                </tr>
              ))}
              {employees.length === 0 ? (
                <tr><td colSpan={4}>{directoryError ? "Employees could not be loaded." : "No employees found."}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="grid2" style={{ gridTemplateColumns: "1fr 1.2fr" }}>
          <div className="card">
            <h2>Leave awaiting approval</h2>
            {leaveMessage ? <p className="message-box success" role="status">{leaveMessage}</p> : null}
            {leaveError ? <p className="message-box error" role="alert">{leaveError}</p> : null}
            {leaveRequests.filter((request) => request.status === "pending").map((request) => {
              const employee = leaveEmployees.find((item) => item.id === request.employee_id);
              return (
                <div key={request.id} style={{ border: "1px solid #e3e0e0", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                  <b>{employee?.full_name || employee?.email || "Employee"}</b>
                  <span className="pill amber" style={{ float: "right" }}>Pending</span>
                  <br />
                  <span className="small">
                    {request.leave_type} leave · {request.start_date} to {request.end_date}
                  </span>
                  {request.reason ? <p style={{ margin: "8px 0" }}>Reason: {request.reason}</p> : null}
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
                    style={{ marginLeft: 10 }}
                    disabled={processingLeaveId === request.id}
                    onClick={() => void handleLeaveDecision(request.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              );
            })}
            {leaveRequests.every((request) => request.status !== "pending") && !leaveError ? (
              <p className="small">No leave requests are awaiting approval.</p>
            ) : null}
          </div>

          <div className="card">
            <h2>Activity history</h2>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>10:05</td>
                  <td>Nomsa Zulu</td>
                  <td>Updated incident INC-014 to Investigating</td>
                </tr>
                <tr>
                  <td>09:42</td>
                  <td>Sipho Nkosi</td>
                  <td>Reported incident INC-014</td>
                </tr>
                <tr>
                  <td>08:21</td>
                  <td>Thabo Mokoena</td>
                  <td>Submitted leave request</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
    </RoleGuard>
  );
}
