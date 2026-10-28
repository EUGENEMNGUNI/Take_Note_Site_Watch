"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { signOut } from "@/lib/auth";
import { formatWhen, incidentRef } from "@/lib/format";
import { Avatar, BrandLogo } from "@/components/brand";
import { RoleGuard } from "@/components/role-guard";

import "./manager.css";

type Tab = "dashboard" | "employees" | "checkins" | "tasks" | "incidents" | "messages";

type Site = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  work_start: string;
  work_end: string;
};
type Staff = { id: string; full_name: string; email: string | null; is_active: boolean };
type AttendanceRow = {
  id: string;
  employee_id: string;
  check_in_at: string;
  check_out_at: string | null;
  presence_status: "verified" | "outside_radius" | "unverified";
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_distance_m: number | null;
};
type AlertRow = { id: string; alert_type: string; employee_id: string; message: string; created_at: string };
type Task = {
  id: string;
  assigned_to: string;
  title: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "done";
  due_at: string | null;
  completed_at?: string | null;
};
type Incident = {
  id: string;
  ref_no: number;
  reported_by: string;
  category: string;
  priority: "low" | "medium" | "high";
  status: "open" | "investigating" | "monitoring" | "resolved";
  details: string;
  location: string | null;
  created_at: string;
};

type MessageRecord = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name: string | null;
};

type ConversationRecord = {
  id: string;
  site_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: MessageRecord[];
};

type AlertItem = {
  key: string;
  color: string;
  title: string;
  sub?: string;
  action?: { label: string; tab: Tab };
};

const PRIORITY_PILL = { high: "red", medium: "amber", low: "blue" } as const;
const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;
const TASK_STATUS = { pending: "Pending", in_progress: "In progress", done: "Completed" } as const;
const INCIDENT_STATUSES = ["open", "investigating", "monitoring", "resolved"] as const;
const NEAR_BOUNDARY_RATIO = 0.8;

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

const formatDateTime = (iso: string) => formatWhen(iso);

const minutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

// "08:00:00" -> 480
const minutesFromTimeString = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const [h, m] = value.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : fallback;
};

const shortName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : full;
};

const incidentTitle = (details: string) => {
  const first = details.split(/[.\n]/)[0].trim() || details.trim();
  return first.length > 64 ? `${first.slice(0, 61).trimEnd()}...` : first;
};

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

// How many of the three tracker steps are filled in (Reported / Investigating / Resolved).
const incidentStep = (status: Incident["status"]) =>
  status === "resolved" ? 3 : status === "open" ? 1 : 2;

const isSameDay = (iso: string | null | undefined, reference: Date) => {
  if (!iso) return false;
  const date = new Date(iso);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
};

async function callApi(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed.");
  return result;
}

// Metres east/north of the site centre (flat-earth approximation is accurate
// enough at site scale).
function offsetMetres(site: Site, lat: number, lng: number) {
  const metresPerDegree = 111_320;
  return {
    x: (lng - site.longitude) * metresPerDegree * Math.cos((site.latitude * Math.PI) / 180),
    y: (lat - site.latitude) * metresPerDegree,
  };
}

function presenceOf(row: AttendanceRow, site: Site | null) {
  if (row.presence_status === "outside_radius") return { label: "Outside site", pill: "red", color: "#9a1b1b" };
  if (row.presence_status === "unverified") return { label: "Unverified", pill: "amber", color: "#e08a00" };
  const distance =
    row.check_in_distance_m ??
    (site && row.check_in_lat !== null && row.check_in_lng !== null
      ? Math.hypot(...Object.values(offsetMetres(site, row.check_in_lat, row.check_in_lng)))
      : null);
  if (site && distance !== null && distance >= site.radius_m * NEAR_BOUNDARY_RATIO) {
    return { label: "Near boundary", pill: "amber", color: "#e08a00" };
  }
  return { label: "Within site", pill: "green", color: "#157a45" };
}

export default function ManagerPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [displayName, setDisplayName] = useState("Site Manager");
  const [managerId, setManagerId] = useState<string | null>(null);
  const [signOutMessage, setSignOutMessage] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [site, setSite] = useState<Site | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageError, setMessageError] = useState("");
  const [messageSuccess, setMessageSuccess] = useState("");
  const [isSavingMessage, setIsSavingMessage] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const nameOf = useCallback(
    (id: string) => staff.find((person) => person.id === id)?.full_name || "Employee",
    [staff],
  );

  const refresh = useCallback(async () => {
    try {
      const [overview, taskResult, incidentResult] = await Promise.all([
        callApi("/api/manager/overview"),
        callApi("/api/tasks"),
        callApi("/api/incidents"),
      ]);
      setDisplayName(overview.manager?.fullName || "Site Manager");
      setManagerId(overview.manager?.id ?? null);
      setSite(overview.site);
      setStaff(overview.staff ?? []);
      setAttendance(overview.attendance ?? []);
      setAlerts(overview.alerts ?? []);
      setTasks(taskResult.tasks ?? []);
      setIncidents(incidentResult.incidents ?? []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the dashboard.");
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    const response = await fetch("/api/messages");
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ?? "Could not load messages.");
    }
    const nextConversations = (result.conversations ?? []) as ConversationRecord[];
    setConversations(nextConversations);
    setSelectedConversationId((current) => {
      if (current && nextConversations.some((conversation) => conversation.id === current)) {
        return current;
      }
      return nextConversations[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => setNow(new Date()));
    void Promise.resolve().then(refresh);
    void Promise.resolve().then(refreshMessages).catch((caught) => {
      setMessageError(caught instanceof Error ? caught.message : "Could not load messages.");
    });
  }, [refresh, refreshMessages]);

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations[0] ?? null;

  const openTasks = tasks.filter((task) => task.status !== "done");
  const openIncidents = incidents.filter((incident) => incident.status !== "resolved");
  const resolvedIncidents = incidents.filter((incident) => incident.status === "resolved");
  const selectedIncident =
    incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0] ?? null;

  // Latest record per employee today.
  const latestByEmployee = useMemo(() => {
    const latest = new Map<string, AttendanceRow>();
    for (const row of attendance) {
      if (!latest.has(row.employee_id)) latest.set(row.employee_id, row);
    }
    return latest;
  }, [attendance]);
  const checkedIn = attendance.filter((row) => row.check_out_at === null);
  const outside = checkedIn.filter((row) => row.presence_status === "outside_radius");

  const startMinutes = minutesFromTimeString(site?.work_start, 8 * 60);
  const lateRows = [...latestByEmployee.values()].filter(
    (row) => minutesOfDay(new Date(row.check_in_at)) > startMinutes,
  );
  const notCheckedIn = staff.filter((person) => person.is_active && !latestByEmployee.has(person.id));

  const alertItems: AlertItem[] = [
    ...alerts.map<AlertItem>((alert) => ({
      key: `db-${alert.id}`,
      color: "#9a1b1b",
      title: alert.message,
      sub: `${formatTime(alert.created_at)} · ${nameOf(alert.employee_id)}`,
      action: { label: "Message", tab: "messages" },
    })),
    ...openIncidents
      .filter((incident) => incident.priority === "high")
      .map<AlertItem>((incident) => ({
        key: `inc-${incident.id}`,
        color: "#9a1b1b",
        title: `High priority incident reported: ${incidentTitle(incident.details).toLowerCase()}`,
        sub: `${formatTime(incident.created_at)} · ${nameOf(incident.reported_by)}`,
        action: { label: "Open", tab: "incidents" },
      })),
    ...lateRows.map<AlertItem>((row) => ({
      key: `late-${row.id}`,
      color: "#e08a00",
      title: `Late check-in: ${nameOf(row.employee_id)} at ${formatTime(row.check_in_at)}`,
    })),
    ...(now && minutesOfDay(now) >= startMinutes
      ? notCheckedIn.map<AlertItem>((person) => ({
          key: `absent-${person.id}`,
          color: "#d8a400",
          title: `${person.full_name || person.email} has not checked in today`,
          sub: `Shift started ${site?.work_start.slice(0, 5) ?? ""}`,
        }))
      : []),
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/");
    } catch (caught) {
      setSignOutMessage(caught instanceof Error ? caught.message : "Could not sign out. Please try again.");
    }
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingTask) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setIsSavingTask(true);
    setError("");
    setMessage("");
    try {
      const dueAt = String(data.get("due_at") ?? "");
      await callApi("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.get("title"),
          assignedTo: data.get("assigned_to"),
          priority: data.get("priority"),
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      form.reset();
      setTaskTitle("");
      setMessage("Task assigned.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task could not be assigned.");
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleTaskStatus = async (taskId: string, status: Task["status"]) => {
    setError("");
    setMessage("");
    try {
      await callApi("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status }),
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task could not be updated.");
    }
  };

  const handleIncidentStatus = async (incidentId: string, status: Incident["status"]) => {
    setError("");
    setMessage("");
    try {
      await callApi("/api/incidents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, status }),
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Incident could not be updated.");
    }
  };

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingMessage) return;
    const trimmed = messageDraft.trim();
    if (!trimmed) {
      setMessageError("Write a message before sending.");
      return;
    }

    setIsSavingMessage(true);
    setMessageError("");
    setMessageSuccess("");
    try {
      const payload = {
        content: trimmed,
        ...(selectedConversation ? { conversationId: selectedConversation.id } : { title: `Site updates - ${site?.name ?? "team"}` }),
      };
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Message could not be sent.");
      setMessageDraft("");
      setMessageSuccess("Message sent.");
      await refreshMessages();
      if (result.conversation?.id) {
        setSelectedConversationId(result.conversation.id);
      } else if (result.conversationId) {
        setSelectedConversationId(result.conversationId);
      }
    } catch (caught) {
      setMessageError(caught instanceof Error ? caught.message : "Message could not be sent.");
    } finally {
      setIsSavingMessage(false);
    }
  };

  const createTaskFromIncident = (incident: Incident) => {
    setTaskTitle(`Resolve: ${incidentTitle(incident.details)}`);
    setActiveTab("tasks");
  };

  const siteMap = () => {
    if (!site) return null;
    const width = 560;
    const height = 300;
    const cx = width / 2;
    const cy = height / 2;
    const points = checkedIn
      .filter((row) => row.check_in_lat !== null && row.check_in_lng !== null)
      .map((row) => ({ row, ...offsetMetres(site, row.check_in_lat!, row.check_in_lng!) }));
    const extent = Math.max(site.radius_m * 1.45, ...points.map((point) => Math.hypot(point.x, point.y) * 1.12));
    const scale = (height / 2 - 18) / extent;
    const radiusPx = site.radius_m * scale;
    const place = (x: number, y: number) => ({
      px: Math.min(width - 14, Math.max(14, cx + x * scale)),
      py: Math.min(height - 14, Math.max(14, cy - y * scale)),
    });
    return (
      <>
        <div className="sitemap">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Check-in positions relative to the site">
            <circle cx={cx} cy={cy} r={radiusPx} fill="rgba(213,21,28,0.10)" stroke="#d5151c" strokeWidth={1.5} strokeDasharray="5 4" />
            <rect x={cx - 30} y={cy - 18} width={60} height={36} rx={4} fill="#d5151c" />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff" fontFamily="Barlow, Arial, sans-serif">
              HQ building
            </text>
            {points.map(({ row, x, y }) => {
              const { px, py } = place(x, y);
              const presence = presenceOf(row, site);
              const label = shortName(nameOf(row.employee_id));
              return (
                <g key={row.id}>
                  <circle cx={px} cy={py} r={6} fill={presence.color} stroke="#fff" strokeWidth={1.5}>
                    <title>{nameOf(row.employee_id)}</title>
                  </circle>
                  {row.presence_status === "outside_radius" ? (
                    <g>
                      <rect x={px - 4} y={py + 9} width={label.length * 5.4 + 8} height={14} rx={3} fill="#fff" stroke="#e3e0e0" />
                      <text x={px} y={py + 19} fontSize={9} fontWeight={700} fill="#16171b" fontFamily="Barlow, Arial, sans-serif">
                        {" "}{label}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
        <p className="map-note">Site radius {site.radius_m} m · positions are the check-in locations shared today</p>
      </>
    );
  };

  const tab = (id: Tab, label: string, badge?: number, danger?: boolean) => (
    <button type="button" className={`nav ${activeTab === id ? "on" : ""}`} onClick={() => setActiveTab(id)}>
      {label}
      {badge ? <span className={`badge${danger ? " red" : ""}`}>{badge}</span> : null}
    </button>
  );

  const dateLabel = now
    ? `${now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })} · ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`
    : "";
  const siteName = site?.name ?? "Your site";

  const header = () => {
    if (activeTab === "dashboard") {
      return (
        <div className="top">
          <div>
            <h1>{siteName}</h1>
            <span className="small">{dateLabel}</span>
          </div>
          <div className="head-right">
            <span className="pill dot green monitor">
              Monitoring on{site ? ` · ends ${site.work_end.slice(0, 5)}` : ""}
            </span>
            <button className="btn" type="button" onClick={() => setActiveTab("tasks")}>New task</button>
          </div>
        </div>
      );
    }
    const titles: Record<Exclude<Tab, "dashboard">, { title: string; sub: string }> = {
      employees: { title: "Employees", sub: `${siteName} · ${staff.length} assigned` },
      checkins: { title: "Check-ins log", sub: `${siteName} · today` },
      tasks: {
        title: "Tasks",
        sub: `${siteName} · ${openTasks.length} open, ${
          tasks.filter((task) => task.status === "done" && (!now || isSameDay(task.completed_at ?? task.due_at, now))).length
        } completed today`,
      },
      incidents: {
        title: "Incidents",
        sub: `${siteName} · ${openIncidents.length} open, ${resolvedIncidents.length} resolved`,
      },
      messages: { title: "Messages", sub: `${siteName} · site threads` },
    };
    const heading = titles[activeTab];
    return (
      <div className="top">
        <div>
          <h1>{heading.title}</h1>
          <span className="small">{heading.sub}</span>
        </div>
      </div>
    );
  };

  return (
    <RoleGuard allowedRoles={["manager"]}>
      <div className="app mgr">
        <aside className="side">
          <BrandLogo />
          <div className="tag">SITE WATCH</div>
          {tab("dashboard", "Dashboard")}
          {tab("employees", "Employees")}
          {tab("checkins", "Check-ins log")}
          {tab("tasks", "Tasks", openTasks.length)}
          {tab("incidents", "Incidents", openIncidents.length, true)}
          {tab("messages", "Messages")}
          <div className="user">
            <Avatar name={displayName} large />
            <div>
              <b>{displayName}</b>
              <span>Site Manager</span>
              <br />
              <button type="button" className="link-button" onClick={handleSignOut}>Sign out</button>
            </div>
          </div>
          {signOutMessage ? <div className="message error" role="alert">{signOutMessage}</div> : null}
        </aside>

        <main className="main">
          {header()}

          {error ? <div className="message-box error" role="alert">{error}</div> : null}
          {message ? <div className="message-box success" role="status">{message}</div> : null}

          {activeTab === "dashboard" && (
            <>
              <div className="stats">
                <div className="stat"><b>{staff.length}</b>Assigned staff</div>
                <div className="stat"><b className="green">{checkedIn.length}</b>Checked in</div>
                <div className="stat"><b className="stat-num-red">{outside.length}</b>Outside site</div>
                <div className="stat"><b className="stat-num-amber">{lateRows.length}</b>Late today</div>
                <div className="stat"><b>{openTasks.length}</b>Open tasks</div>
                <div className="stat"><b className="stat-num-red">{openIncidents.length}</b>Open incidents</div>
              </div>

              <div className="grid2" style={{ gridTemplateColumns: "1.35fr 1fr" }}>
                <div className="card map-card">
                  <div className="card-head">
                    <h2>Live site map</h2>
                    <div className="legend">
                      <span><i style={{ background: "#157a45" }} />Within site</span>
                      <span><i style={{ background: "#e08a00" }} />Near boundary</span>
                      <span><i style={{ background: "#9a1b1b" }} />Outside site</span>
                    </div>
                  </div>
                  {site ? siteMap() : <p className="map-empty">No site assigned.</p>}
                </div>

                <div className="card">
                  <div className="card-head">
                    <h2>Alerts</h2>
                    <span className="count">{alertItems.length} new</span>
                  </div>
                  {alertItems.slice(0, 8).map((item) => (
                    <div className="alert-row" key={item.key}>
                      <span className="bullet" style={{ background: item.color }} />
                      <div className="grow">
                        <b>{item.title}</b>
                        {item.sub ? <div className="sub">{item.sub}</div> : null}
                      </div>
                      {item.action ? (
                        <button type="button" className="link-button act" onClick={() => setActiveTab(item.action!.tab)}>
                          {item.action.label}
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {alertItems.length === 0 ? <p className="small">No open alerts.</p> : null}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h2>Latest check-ins</h2>
                  <button type="button" className="link-button card-link" onClick={() => setActiveTab("checkins")}>
                    View full log
                  </button>
                </div>
                <table>
                  <thead>
                    <tr><th>Employee</th><th>Checked in</th><th>Site</th><th>Presence</th><th>Open tasks</th></tr>
                  </thead>
                  <tbody>
                    {[...latestByEmployee.values()].slice(0, 8).map((row) => {
                      const presence = presenceOf(row, site);
                      return (
                        <tr key={row.id}>
                          <td><b>{nameOf(row.employee_id)}</b></td>
                          <td>{formatTime(row.check_in_at)}</td>
                          <td>{siteName}</td>
                          <td><span className={`pill dot ${presence.pill}`}>{presence.label}</span></td>
                          <td>{openTasks.filter((task) => task.assigned_to === row.employee_id).length}</td>
                        </tr>
                      );
                    })}
                    {latestByEmployee.size === 0 ? <tr><td colSpan={5}>No check-ins yet today.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === "employees" && (
            <div className="card">
              <h2>Employees at {siteName}</h2>
              <table>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Today</th><th>Open tasks</th></tr>
                </thead>
                <tbody>
                  {staff.map((person) => {
                    const latest = latestByEmployee.get(person.id);
                    return (
                      <tr key={person.id}>
                        <td><b>{person.full_name || "—"}</b>{!person.is_active ? <> <span className="pill grey">Inactive</span></> : null}</td>
                        <td>{person.email || "—"}</td>
                        <td>
                          {latest ? (
                            latest.check_out_at ? (
                              <span className="pill dot grey">Out {formatTime(latest.check_out_at)}</span>
                            ) : (
                              <span className="pill dot green">In {formatTime(latest.check_in_at)}</span>
                            )
                          ) : (
                            <span className="pill dot grey">Not checked in</span>
                          )}
                        </td>
                        <td>{openTasks.filter((task) => task.assigned_to === person.id).length}</td>
                      </tr>
                    );
                  })}
                  {staff.length === 0 ? <tr><td colSpan={4}>No employees are assigned to your site.</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "checkins" && (
            <div className="card">
              <h2>Today&apos;s check-ins</h2>
              <table>
                <thead>
                  <tr><th>Employee</th><th>In</th><th>Out</th><th>Presence</th><th>Distance</th></tr>
                </thead>
                <tbody>
                  {attendance.map((row) => {
                    const presence = presenceOf(row, site);
                    return (
                      <tr key={row.id}>
                        <td><b>{nameOf(row.employee_id)}</b></td>
                        <td>{formatTime(row.check_in_at)}</td>
                        <td>{row.check_out_at ? formatTime(row.check_out_at) : "—"}</td>
                        <td><span className={`pill dot ${presence.pill}`}>{presence.label}</span></td>
                        <td>{row.check_in_distance_m == null ? "—" : `${Math.round(row.check_in_distance_m)} m`}</td>
                      </tr>
                    );
                  })}
                  {attendance.length === 0 ? <tr><td colSpan={5}>No check-ins recorded today.</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "messages" && (
            <div className="msg-layout">
              <div className="thread-list">
                <h3 style={{ marginTop: 0 }}>Threads</h3>
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    className={selectedConversation?.id === conversation.id ? "selected" : ""}
                    onClick={() => setSelectedConversationId(conversation.id)}
                  >
                    <b>{conversation.title}</b>
                    <span>{formatDateTime(conversation.updated_at)}</span>
                  </button>
                ))}
                {conversations.length === 0 ? <p className="small">No site conversations yet.</p> : null}
              </div>

              <div className="card">
                <h2>{selectedConversation?.title ?? "Site messages"}</h2>
                {messageError ? <p className="message-box error" role="alert">{messageError}</p> : null}
                {messageSuccess ? <p className="message-box success" role="status">{messageSuccess}</p> : null}

                {selectedConversation?.messages.length ? (
                  <div className="bubbles">
                    {selectedConversation.messages.map((entry) => (
                      <div key={entry.id} className={`bubble${entry.sender_id === managerId ? " mine" : ""}`}>
                        <div className="who">
                          <b>{entry.sender_name ?? "Team member"}</b> · {formatDateTime(entry.created_at)}
                        </div>
                        <div>{entry.body}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="small" style={{ marginBottom: 14 }}>
                    {conversations.length > 0 ? "No messages in this thread yet." : "Start the first message thread for your site."}
                  </p>
                )}

                <form onSubmit={handleSendMessage}>
                  <label htmlFor="manager-message-draft">Your message</label>
                  <textarea
                    id="manager-message-draft"
                    rows={3}
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    placeholder={selectedConversation ? "Reply to the site thread" : "Start a new message thread"}
                    maxLength={2000}
                  />
                  <div style={{ marginTop: 12 }}>
                    <button type="submit" className="btn" disabled={isSavingMessage}>
                      {isSavingMessage ? "Sending..." : "Send"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === "tasks" && (
            <div>
              <form className="card" style={{ marginBottom: 16 }} onSubmit={handleCreateTask}>
                <h2>Create and assign a task</h2>
                <div className="task-form-grid">
                  <div>
                    <label htmlFor="task-title">Task</label>
                    <input
                      id="task-title"
                      name="title"
                      required
                      maxLength={200}
                      placeholder="e.g. Inspect server room"
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="task-assignee">Assign to</label>
                    <select id="task-assignee" name="assigned_to" required defaultValue="">
                      <option value="" disabled>Select an employee</option>
                      {staff.filter((person) => person.is_active).map((person) => (
                        <option key={person.id} value={person.id}>{person.full_name || person.email}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="task-priority">Priority</label>
                    <select id="task-priority" name="priority" defaultValue="medium">
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="task-due">Due (optional)</label>
                    <input id="task-due" name="due_at" type="datetime-local" />
                  </div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <button className="btn" type="submit" disabled={isSavingTask}>{isSavingTask ? "Assigning..." : "Assign task"}</button>
                </div>
              </form>

              <div className="board">
                {(["pending", "in_progress", "done"] as const).map((status) => {
                  const column = tasks.filter((task) => task.status === status);
                  return (
                    <section className="column" key={status} aria-label={TASK_STATUS[status]}>
                      <h3>{TASK_STATUS[status]} <span>{column.length}</span></h3>
                      {column.map((task) => (
                        <div className={`tcard${task.status === "done" ? " done" : ""}`} key={task.id}>
                          <div className="row">
                            <b>{task.title}</b>
                            {task.status === "done" ? (
                              <span className="pill green">Done</span>
                            ) : (
                              <span className={`pill ${PRIORITY_PILL[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</span>
                            )}
                          </div>
                          <div className="meta">
                            {nameOf(task.assigned_to)}
                            {task.status === "done" && task.completed_at
                              ? ` · ${formatTime(task.completed_at)}`
                              : task.due_at
                                ? ` · Due ${formatTime(task.due_at)}`
                                : ""}
                          </div>
                          <select
                            className="move"
                            aria-label={`Status of task ${task.title}`}
                            value={task.status}
                            onChange={(event) => void handleTaskStatus(task.id, event.target.value as Task["status"])}
                          >
                            <option value="pending">Pending</option>
                            <option value="in_progress">In progress</option>
                            <option value="done">Completed</option>
                          </select>
                        </div>
                      ))}
                      {column.length === 0 ? <p className="small">Nothing here.</p> : null}
                    </section>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "incidents" && (
            <div className="inc-layout">
              <div>
                {incidents.map((incident) => (
                  <button
                    type="button"
                    key={incident.id}
                    className={`inc-card${selectedIncident?.id === incident.id ? " selected" : ""}`}
                    onClick={() => setSelectedIncidentId(incident.id)}
                  >
                    <div className="row">
                      <span>{incidentRef(incident.ref_no)} · {capitalise(incident.category)}</span>
                      <span className={`pill ${PRIORITY_PILL[incident.priority]}`}>{PRIORITY_LABEL[incident.priority]}</span>
                    </div>
                    <b>{incidentTitle(incident.details)}</b>
                    <div className="steps" aria-label={`Progress: ${incident.status}`}>
                      {["Reported", "Investigating", "Resolved"].map((step, index) => (
                        <span key={step} className={index < incidentStep(incident.status) ? "on" : ""}>{step}</span>
                      ))}
                    </div>
                    <span className="who">{nameOf(incident.reported_by)} · {formatDateTime(incident.created_at)}</span>
                  </button>
                ))}
                {incidents.length === 0 ? <div className="card"><p className="small">No incidents reported.</p></div> : null}
              </div>

              {selectedIncident ? (
                <div className="card inc-detail">
                  <div className="detail-head">
                    <span>{incidentRef(selectedIncident.ref_no)} · {capitalise(selectedIncident.category)}</span>
                    <span className={`pill dot ${selectedIncident.status === "resolved" ? "green" : "amber"}`}>
                      {capitalise(selectedIncident.status)}
                    </span>
                  </div>
                  <h2 className="detail-title">{incidentTitle(selectedIncident.details)}</h2>
                  <p className="body">{selectedIncident.details}</p>
                  <dl>
                    <div><dt>Reported by</dt><dd>{nameOf(selectedIncident.reported_by)}</dd></div>
                    <div><dt>Location</dt><dd>{selectedIncident.location ?? siteName}</dd></div>
                    <div><dt>Priority</dt><dd className={selectedIncident.priority === "high" ? "red-text" : undefined}>{PRIORITY_LABEL[selectedIncident.priority]}</dd></div>
                  </dl>

                  <h4>Activity</h4>
                  <div className="activity">
                    <span>{formatTime(selectedIncident.created_at)}</span>
                    <span style={{ color: "inherit" }}>{nameOf(selectedIncident.reported_by)} reported the incident</span>
                  </div>

                  <div className="status-select">
                    <label htmlFor="incident-status">Status</label>
                    <select
                      id="incident-status"
                      value={selectedIncident.status}
                      onChange={(event) => void handleIncidentStatus(selectedIncident.id, event.target.value as Incident["status"])}
                    >
                      {INCIDENT_STATUSES.map((status) => (
                        <option key={status} value={status}>{capitalise(status)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn"
                      disabled={selectedIncident.status === "resolved"}
                      onClick={() => void handleIncidentStatus(selectedIncident.id, "resolved")}
                    >
                      Mark resolved
                    </button>
                    <button type="button" className="btn outline" onClick={() => createTaskFromIncident(selectedIncident)}>
                      Create task from incident
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </main>
      </div>
    </RoleGuard>
  );
}
