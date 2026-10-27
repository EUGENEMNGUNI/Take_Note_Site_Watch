"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { signOut } from "@/lib/auth";
import { RoleGuard } from "@/components/role-guard";

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
};
type Incident = {
  id: string;
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

const PRIORITY_PILL = { high: "red", medium: "amber", low: "blue" } as const;
const TASK_STATUS = { pending: "Pending", in_progress: "In progress", done: "Done" } as const;
const INCIDENT_STATUSES = ["open", "investigating", "monitoring", "resolved"] as const;
const PRESENCE_PILL = {
  verified: { label: "Within site", pill: "green" },
  outside_radius: { label: "Outside site", pill: "red" },
  unverified: { label: "Unverified", pill: "amber" },
} as const;

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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

export default function ManagerPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [displayName, setDisplayName] = useState("Site Manager");
  const [signOutMessage, setSignOutMessage] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [site, setSite] = useState<Site | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageError, setMessageError] = useState("");
  const [messageSuccess, setMessageSuccess] = useState("");
  const [isSavingMessage, setIsSavingMessage] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [todayLabel, setTodayLabel] = useState("Today");

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
    setTodayLabel(
      new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }),
    );
    void Promise.resolve().then(refresh);
    void Promise.resolve().then(refreshMessages).catch((caught) => {
      setMessageError(caught instanceof Error ? caught.message : "Could not load messages.");
    });
  }, [refresh, refreshMessages]);

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations[0] ?? null;

  const openTasks = tasks.filter((task) => task.status !== "done");
  const openIncidents = incidents.filter((incident) => incident.status !== "resolved");

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
      setMessage("Task assigned.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task could not be assigned.");
    } finally {
      setIsSavingTask(false);
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

  const siteMap = () => {
    if (!site) return null;
    const points = checkedIn
      .filter((row) => row.check_in_lat !== null && row.check_in_lng !== null)
      .map((row) => ({ row, ...offsetMetres(site, row.check_in_lat!, row.check_in_lng!) }));
    const extent = Math.max(site.radius_m * 1.5, ...points.map((point) => Math.hypot(point.x, point.y) * 1.1));
    const toPx = (metres: number) => 150 + (metres / extent) * 140;
    return (
      <svg viewBox="0 0 300 300" role="img" aria-label="Check-in positions relative to the site" style={{ width: "100%", maxWidth: 360, background: "#f3f1ee", borderRadius: 12 }}>
        <circle cx={150} cy={150} r={(site.radius_m / extent) * 140} fill="rgba(21,122,69,0.12)" stroke="#157a45" strokeDasharray="4 4" />
        <rect x={146} y={146} width={8} height={8} fill="#16171b" />
        {points.map(({ row, x, y }) => (
          <circle key={row.id} cx={toPx(x)} cy={300 - toPx(y)} r={6} fill={PRESENCE_PILL[row.presence_status].pill === "green" ? "#157a45" : "#9a1b1b"}>
            <title>{nameOf(row.employee_id)}</title>
          </circle>
        ))}
      </svg>
    );
  };

  const tab = (id: Tab, label: string, badge?: number, danger?: boolean) => (
    <button type="button" className={`nav ${activeTab === id ? "on" : ""}`} onClick={() => setActiveTab(id)}>
      {label}
      {badge ? (
        <span className="badge" style={danger ? { background: "#fadcdc", color: "#9a1b1b" } : undefined}> {badge}</span>
      ) : null}
    </button>
  );

  return (
    <RoleGuard allowedRoles={["manager"]}>
      <div className="app">
        <aside className="side">
          <div className="logo">TAKE NOTE</div>
          <div className="tag">SITE WATCH</div>
          {tab("dashboard", "Dashboard")}
          {tab("employees", "Employees")}
          {tab("checkins", "Check-ins log")}
          {tab("tasks", "Tasks", openTasks.length)}
          {tab("incidents", "Incidents", openIncidents.length, true)}
          {tab("messages", "Messages")}
          <div className="user">
            <b>{displayName}</b>
            <br />
            Site Manager
            <br />
            <button type="button" className="link-button" onClick={handleSignOut}>Sign out</button>
            {signOutMessage ? <div className="message error" role="alert">{signOutMessage}</div> : null}
          </div>
        </aside>

        <main className="main">
          <div className="top">
            <div>
              <h1>{site?.name ?? "Your site"}</h1>
              <span className="small">
                {todayLabel}
                {site ? ` · working hours ${site.work_start.slice(0, 5)}–${site.work_end.slice(0, 5)}` : ""}
              </span>
            </div>
            <div>
              <button className="btn" type="button" onClick={() => setActiveTab("tasks")}>New task</button>
            </div>
          </div>

          {error ? <div className="message-box error" role="alert">{error}</div> : null}
          {message ? <div className="message-box success" role="status">{message}</div> : null}

          {activeTab === "dashboard" && (
            <>
              <div className="stats">
                <div className="stat"><b>{staff.length}</b>Assigned staff</div>
                <div className="stat"><b className="green">{checkedIn.length}</b>Checked in</div>
                <div className="stat"><b style={{ color: "#9a1b1b" }}>{outside.length}</b>Outside site</div>
                <div className="stat"><b>{openTasks.length}</b>Open tasks</div>
                <div className="stat"><b style={{ color: "#9a1b1b" }}>{openIncidents.length}</b>Open incidents</div>
              </div>

              <div className="grid2">
                <div className="card">
                  <h2>Check-in positions</h2>
                  {siteMap()}
                  <p className="small" style={{ marginTop: 8 }}>
                    Dashed circle: {site?.radius_m ?? "—"} m site radius · Green: within site · Red: outside or unverified. Only employees who shared a location are plotted.
                  </p>
                </div>

                <div className="card">
                  <h2>Alerts <span className="small">{alerts.length} open</span></h2>
                  <table>
                    <tbody>
                      {alerts.map((alert) => (
                        <tr key={alert.id}>
                          <td>
                            <b>{alert.message}</b>
                            <br />
                            <span className="small">{nameOf(alert.employee_id)} · {formatTime(alert.created_at)}</span>
                          </td>
                        </tr>
                      ))}
                      {alerts.length === 0 ? <tr><td>No open alerts.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <h2>Latest check-ins</h2>
                <table>
                  <thead>
                    <tr><th>Employee</th><th>Checked in</th><th>Presence</th><th>Open tasks</th></tr>
                  </thead>
                  <tbody>
                    {[...latestByEmployee.values()].slice(0, 8).map((row) => (
                      <tr key={row.id}>
                        <td><b>{nameOf(row.employee_id)}</b></td>
                        <td>{formatTime(row.check_in_at)}</td>
                        <td><span className={`pill ${PRESENCE_PILL[row.presence_status].pill}`}>{PRESENCE_PILL[row.presence_status].label}</span></td>
                        <td>{openTasks.filter((task) => task.assigned_to === row.employee_id).length}</td>
                      </tr>
                    ))}
                    {latestByEmployee.size === 0 ? <tr><td colSpan={4}>No check-ins yet today.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === "employees" && (
            <div className="card">
              <h2>Employees at {site?.name ?? "your site"}</h2>
              <table>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Today</th><th>Open tasks</th></tr>
                </thead>
                <tbody>
                  {staff.map((person) => {
                    const latest = latestByEmployee.get(person.id);
                    return (
                      <tr key={person.id}>
                        <td>{person.full_name || "—"}{!person.is_active ? <> <span className="pill grey">Inactive</span></> : null}</td>
                        <td>{person.email || "—"}</td>
                        <td>
                          {latest
                            ? latest.check_out_at ? `Out ${formatTime(latest.check_out_at)}` : `In ${formatTime(latest.check_in_at)}`
                            : "Not checked in"}
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
                  {attendance.map((row) => (
                    <tr key={row.id}>
                      <td><b>{nameOf(row.employee_id)}</b></td>
                      <td>{formatTime(row.check_in_at)}</td>
                      <td>{row.check_out_at ? formatTime(row.check_out_at) : "—"}</td>
                      <td><span className={`pill ${PRESENCE_PILL[row.presence_status].pill}`}>{PRESENCE_PILL[row.presence_status].label}</span></td>
                      <td>{row.check_in_distance_m == null ? "—" : `${Math.round(row.check_in_distance_m)} m`}</td>
                    </tr>
                  ))}
                  {attendance.length === 0 ? <tr><td colSpan={5}>No check-ins recorded today.</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "messages" && (
            <div className="card">
              <h2>Site messages</h2>
              {messageError ? <p className="message-box error" role="alert">{messageError}</p> : null}
              {messageSuccess ? <p className="message-box success" role="status">{messageSuccess}</p> : null}

              {conversations.length > 0 ? (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                    {conversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        className={selectedConversation?.id === conversation.id ? "btn" : "btn outline"}
                        onClick={() => setSelectedConversationId(conversation.id)}
                      >
                        {conversation.title}
                      </button>
                    ))}
                  </div>

                  <div style={{ background: "#f9f8f7", border: "1px solid #e5e3e2", borderRadius: 12, padding: 16, marginBottom: 18 }}>
                    <h3>{selectedConversation?.title ?? "Conversation"}</h3>
                    {selectedConversation?.messages.length ? (
                      <div style={{ display: "grid", gap: 10, maxHeight: 260, overflowY: "auto" }}>
                        {selectedConversation.messages.map((message) => (
                          <div key={message.id} style={{ background: "#fff", border: "1px solid #e5e3e2", borderRadius: 10, padding: 10 }}>
                            <div className="small" style={{ marginBottom: 4 }}>
                              <b>{message.sender_name ?? "Team member"}</b> · {new Date(message.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                            </div>
                            <div>{message.body}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="small">No messages in this thread yet.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="small">No site conversations yet.</p>
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
                <br />
                <button type="submit" className="btn" disabled={isSavingMessage}>
                  {isSavingMessage ? "Sending..." : "Send"}
                </button>
              </form>
            </div>
          )}

          {activeTab === "tasks" && (
            <div>
              <p className="small" style={{ marginBottom: 16 }}>
                {openTasks.length} open, {tasks.filter((task) => task.status === "done").length} completed
              </p>

              <form className="card" style={{ marginBottom: 18 }} onSubmit={handleCreateTask}>
                <h2>Create and assign a task</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                  <div>
                    <label htmlFor="task-title">Task</label>
                    <input id="task-title" name="title" required maxLength={200} placeholder="e.g. Inspect server room" />
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
                <div style={{ marginTop: 16 }}>
                  <button className="btn" type="submit" disabled={isSavingTask}>{isSavingTask ? "Assigning..." : "Assign task"}</button>
                </div>
              </form>

              <div className="card">
                <h2>Task list</h2>
                <table>
                  <thead>
                    <tr><th>Task</th><th>Owner</th><th>Priority</th><th>Due</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <tr key={task.id}>
                        <td>{task.title}</td>
                        <td>{nameOf(task.assigned_to)}</td>
                        <td><span className={`pill ${PRIORITY_PILL[task.priority]}`}>{task.priority}</span></td>
                        <td>{task.due_at ? new Date(task.due_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                        <td>{TASK_STATUS[task.status]}</td>
                      </tr>
                    ))}
                    {tasks.length === 0 ? <tr><td colSpan={5}>No tasks yet.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "incidents" && (
            <div>
              <p className="small" style={{ marginBottom: 16 }}>
                {openIncidents.length} open · {openIncidents.filter((incident) => incident.priority === "high").length} high priority
              </p>
              <div className="card">
                <table>
                  <thead>
                    <tr><th>Incident</th><th>Reported by</th><th>Priority</th><th>Location</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {incidents.map((incident) => (
                      <tr key={incident.id}>
                        <td>
                          <b>{incident.category}</b>: {incident.details}
                          <br />
                          <span className="small">{new Date(incident.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                        </td>
                        <td>{nameOf(incident.reported_by)}</td>
                        <td><span className={`pill ${PRIORITY_PILL[incident.priority]}`}>{incident.priority}</span></td>
                        <td>{incident.location ?? "—"}</td>
                        <td>
                          <select
                            aria-label={`Status of incident ${incident.id}`}
                            value={incident.status}
                            onChange={(event) => void handleIncidentStatus(incident.id, event.target.value as Incident["status"])}
                          >
                            {INCIDENT_STATUSES.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                    {incidents.length === 0 ? <tr><td colSpan={5}>No incidents reported.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </RoleGuard>
  );
}
