"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { getStoredUserEmail, signOut } from "@/lib/auth";
import { RoleGuard } from "@/components/role-guard";
import { createClient } from "@/lib/supabase/browser";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];

type SiteRecord = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  enforce_radius: boolean;
};

type AttendanceRecord = {
  id: string;
  site_id: string;
  check_in_at: string;
  check_out_at: string | null;
  is_open: boolean;
  hours_worked: number | null;
  presence_status: string;
  check_in_distance_m: number | null;
};

type LeaveRequest = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  decision_note: string | null;
};

type TaskRecord = {
  id: string;
  title: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "done";
  due_at: string | null;
  completed_at: string | null;
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

const PRIORITY_PILL: Record<TaskRecord["priority"], string> = { high: "red", medium: "amber", low: "blue" };
const STATUS_LABEL: Record<TaskRecord["status"], string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
};

export default function EmployeePage() {
  const router = useRouter();
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [homeSiteId, setHomeSiteId] = useState<string | null>(null);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [attendanceError, setAttendanceError] = useState("");
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveMessage, setLeaveMessage] = useState("");
  const [leaveError, setLeaveError] = useState("");
  const [isSavingLeave, setIsSavingLeave] = useState(false);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [taskError, setTaskError] = useState("");
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageError, setMessageError] = useState("");
  const [messageSuccess, setMessageSuccess] = useState("");
  const [isSavingMessage, setIsSavingMessage] = useState(false);
  const [incidentMessage, setIncidentMessage] = useState("");
  const [incidentError, setIncidentError] = useState("");
  const [isSavingIncident, setIsSavingIncident] = useState(false);
  const [displayName, setDisplayName] = useState("Employee");
  const [signOutMessage, setSignOutMessage] = useState("");
  const checkInRequestId = useRef<string | null>(null);
  const checkOutRequestId = useRef<string | null>(null);
  const openAttendance = attendance.find((record) => record.is_open) ?? null;
  const homeSite = sites.find((site) => site.id === homeSiteId) ?? null;

  useEffect(() => {
    void Promise.resolve().then(() => {
      const email = getStoredUserEmail();
      setDisplayName(email ? email.split("@")[0].replace(/[._-]/g, " ") : "Employee");
    });
  }, []);

  const refreshAttendance = useCallback(async () => {
    const response = await fetch("/api/attendance");
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ?? "Could not load attendance.");
    }

    setAttendance(result.attendance ?? []);
    setSites(result.sites ?? []);
    setHomeSiteId(result.profile?.home_site_id ?? null);
    if (result.profile?.full_name) setDisplayName(result.profile.full_name);
  }, []);

  const refreshLeaveRequests = useCallback(async () => {
    const response = await fetch("/api/leave");
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ?? "Could not load leave requests.");
    }
    setLeaveRequests(result.leaveRequests ?? []);
  }, []);

  const refreshTasks = useCallback(async () => {
    const response = await fetch("/api/tasks");
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ?? "Could not load tasks.");
    }
    setTasks(result.tasks ?? []);
    setTaskError("");
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
    void Promise.resolve().then(refreshTasks).catch((error: unknown) => {
      setTaskError(error instanceof Error ? error.message : "Could not load tasks.");
    });
    void Promise.resolve().then(refreshMessages).catch((error: unknown) => {
      setMessageError(error instanceof Error ? error.message : "Could not load messages.");
    });
  }, [refreshMessages, refreshTasks]);

  const handleTaskStatus = async (taskId: string, status: TaskRecord["status"]) => {
    setTaskError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Task could not be updated.");
      await refreshTasks();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Task could not be updated.");
    }
  };

  const handleIncidentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingIncident) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setIsSavingIncident(true);
    setIncidentMessage("");
    setIncidentError("");

    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: formData.get("category"),
          priority: formData.get("priority"),
          location: formData.get("location"),
          details: formData.get("details"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Report could not be submitted.");
      form.reset();
      setIncidentMessage("Report submitted. Your site manager can now see it.");
    } catch (error) {
      setIncidentError(error instanceof Error ? error.message : "Report could not be submitted.");
    } finally {
      setIsSavingIncident(false);
    }
  };

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations[0] ?? null;

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
      const body = {
        content: trimmed,
        ...(selectedConversation ? { conversationId: selectedConversation.id } : { title: "Site updates" }),
      };
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setIsSavingMessage(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(refreshAttendance).catch((error: unknown) => {
      setAttendanceError(error instanceof Error ? error.message : "Could not load attendance.");
    });
    void Promise.resolve().then(refreshLeaveRequests).catch((error: unknown) => {
      setLeaveError(error instanceof Error ? error.message : "Could not load leave requests.");
    });
  }, [refreshAttendance, refreshLeaveRequests]);

  const handleAttendance = async () => {
    if (isSavingAttendance) return;
    setIsSavingAttendance(true);
    setAttendanceError("");
    setAttendanceMessage("");

    try {
      let requestId: string;
      let response: Response;
      if (openAttendance) {
        checkOutRequestId.current ??= crypto.randomUUID();
        requestId = checkOutRequestId.current;
        response = await fetch("/api/attendance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId }),
        });
      } else {
        if (!homeSiteId) {
          throw new Error("Your account has no home site. Contact your administrator.");
        }

        checkInRequestId.current ??= crypto.randomUUID();
        requestId = checkInRequestId.current;
        let coordinates: { latitude: number; longitude: number; accuracyM: number } | null = null;
        if (navigator.geolocation) {
          coordinates = await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (position) =>
                resolve({
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  accuracyM: position.coords.accuracy,
                }),
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
            );
          });
        }

        response = await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteId: homeSiteId,
            requestId,
            ...(coordinates ?? {}),
          }),
        });
        if (!coordinates) {
          setAttendanceMessage("Location is unavailable; the site may record this check-in as unverified.");
        }
      }

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Attendance could not be updated.");
      }

      if (openAttendance) {
        checkOutRequestId.current = null;
        setAttendanceMessage("You checked out successfully.");
      } else {
        checkInRequestId.current = null;
        const status = result.attendance?.presence_status;
        setAttendanceMessage(
          status === "verified"
            ? "You checked in and your site presence was verified."
            : status === "outside_radius"
              ? "You checked in outside the site radius. An administrator was alerted."
              : "You checked in; your site presence could not be verified.",
        );
      }
      await refreshAttendance();
    } catch (error) {
      setAttendanceError(
        error instanceof Error ? error.message : "Attendance could not be updated.",
      );
    } finally {
      setIsSavingAttendance(false);
    }
  };

  const uploadLeaveDocument = async (leaveRequestId: string, file: File) => {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Your session has expired. Sign in again.");

    const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-100) || "document";
    const storagePath = `${user.id}/${leaveRequestId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("leave-documents")
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase.from("leave_documents").insert({
      leave_request_id: leaveRequestId,
      employee_id: user.id,
      storage_path: storagePath,
      file_name: file.name.slice(0, 200),
      mime_type: file.type,
      size_bytes: file.size,
    });
    if (insertError) throw insertError;
  };

  const handleLeaveSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingLeave) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const fileValue = formData.get("document");
    const document = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
    setLeaveMessage("");
    setLeaveError("");
    if (document) {
      if (!ALLOWED_DOCUMENT_TYPES.includes(document.type)) {
        setLeaveError("Documents must be a PDF, JPEG or PNG file.");
        return;
      }
      if (document.size > MAX_DOCUMENT_BYTES) {
        setLeaveError("Documents must be 10 MB or smaller.");
        return;
      }
    }
    setIsSavingLeave(true);

    try {
      const response = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: formData.get("start_date"),
          endDate: formData.get("end_date"),
          reason: formData.get("reason"),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Leave request could not be submitted.");
      }

      let documentWarning = "";
      if (document) {
        try {
          await uploadLeaveDocument(result.leaveRequest.id, document);
        } catch (uploadError) {
          documentWarning = ` The request was saved, but the document was not uploaded: ${
            uploadError instanceof Error ? uploadError.message : "upload failed"
          }`;
        }
      }

      form.reset();
      if (documentWarning) {
        setLeaveError(documentWarning.trim());
      } else {
        setLeaveMessage(
          document ? "Sick-leave request and document submitted." : "Sick-leave request submitted.",
        );
      }
      await refreshLeaveRequests();
    } catch (error) {
      setLeaveError(
        error instanceof Error ? error.message : "Leave request could not be submitted.",
      );
    } finally {
      setIsSavingLeave(false);
    }
  };

  const handleCancelLeave = async (requestId: string) => {
    setLeaveMessage("");
    setLeaveError("");
    try {
      const response = await fetch(`/api/leave/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Leave request could not be cancelled.");
      }
      setLeaveMessage("Leave request cancelled.");
      await refreshLeaveRequests();
    } catch (error) {
      setLeaveError(
        error instanceof Error ? error.message : "Leave request could not be cancelled.",
      );
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      window.sessionStorage.removeItem("siteWatchCheckedIn");
      router.replace("/");
    } catch (error) {
      setSignOutMessage(
        error instanceof Error ? error.message : "Could not sign out. Please try again.",
      );
    }
  };

  return (
    <RoleGuard allowedRoles={["employee"]}>
      <div className="app">
        <aside className="side">
          <div className="logo">TAKE NOTE</div>
          <div className="tag">SITE WATCH</div>
          <a className="nav on" href="#">Home</a>
          <a className="nav" href="#leave">Leave</a>
          <a className="nav" href="#messages">Messages</a>
          <a className="nav" href="#report">Report</a>
          <div className="user">
            <b>{displayName}</b>
            <br />
            Employee
            <br />
            <button type="button" className="link-button" onClick={handleSignOut}>
              Sign out
            </button>
            {signOutMessage ? <div className="message error" role="alert">{signOutMessage}</div> : null}
          </div>
        </aside>

        <main className="main">
          <h1>Good morning, {displayName}</h1>
          <br />

          <div className="grid2">
            <div className="card">
              <h2>
                My site: {homeSite?.name ?? "Not assigned"}
                {openAttendance ? (
                  <span className="pill green" style={{ marginLeft: 12 }}>Checked in</span>
                ) : null}
              </h2>

              <table>
                <tbody>
                  <tr>
                    <td>Signed in</td>
                    <td className={openAttendance ? "green" : ""}>
                      {openAttendance ? openAttendance.presence_status.replace("_", " ") : "Not active"}
                    </td>
                  </tr>
                  <tr>
                    <td>Distance from site centre</td>
                    <td>
                      {openAttendance?.check_in_distance_m == null
                        ? "Not available"
                        : `${Math.round(openAttendance.check_in_distance_m)} m of ${homeSite?.radius_m ?? "—"} m`}
                    </td>
                  </tr>
                  <tr>
                    <td>Current check-in</td>
                    <td>{openAttendance ? new Date(openAttendance.check_in_at).toLocaleTimeString() : "—"}</td>
                  </tr>
                </tbody>
              </table>

              <br />
              <button
                className="btn"
                onClick={handleAttendance}
                disabled={isSavingAttendance || (!openAttendance && !homeSite)}
                style={{ width: "100%" }}
              >
                {isSavingAttendance ? "Saving..." : openAttendance ? "Check out" : "Check in"}
              </button>
              {attendanceMessage ? <p className="small" role="status" style={{ marginTop: 10 }}>{attendanceMessage}</p> : null}
              {attendanceError ? <p className="message error" role="alert">{attendanceError}</p> : null}
            </div>

            <div className="card">
              <h2>
                My tasks
                <span className="small" style={{ marginLeft: 12 }}>
                  {tasks.filter((task) => task.status !== "done").length} open
                </span>
              </h2>
              {taskError ? <p className="message error" role="alert">{taskError}</p> : null}
              {tasks.map((task) => (
                <div className={`task${task.status === "done" ? " done" : ""}`} key={task.id}>
                  {task.status === "done" ? <b>{task.title}</b> : task.title}
                  <span className={`pill ${PRIORITY_PILL[task.priority]}`} style={{ float: "right" }}>
                    {task.priority}
                  </span>
                  <br />
                  <span className="small">
                    {task.due_at ? `Due ${new Date(task.due_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} · ` : ""}
                    {STATUS_LABEL[task.status]}
                  </span>
                  {task.status !== "done" ? (
                    <div style={{ marginTop: 6 }}>
                      {task.status === "pending" ? (
                        <button type="button" className="link-button" onClick={() => void handleTaskStatus(task.id, "in_progress")}>
                          Start
                        </button>
                      ) : null}
                      <button type="button" className="link-button" style={{ marginLeft: 10 }} onClick={() => void handleTaskStatus(task.id, "done")}>
                        Mark done
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {tasks.length === 0 && !taskError ? <p className="small">No tasks assigned to you.</p> : null}
            </div>
          </div>

          <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="card" id="leave">
              <h2>Leave</h2>
              <p className="small">Submit and track sick-leave requests.</p>
              <form onSubmit={handleLeaveSubmit}>
                <label htmlFor="leave-start-date">Start date</label>
                <input id="leave-start-date" name="start_date" type="date" required />

                <label htmlFor="leave-end-date">End date</label>
                <input id="leave-end-date" name="end_date" type="date" required />

                <label htmlFor="leave-reason">Reason</label>
                <textarea id="leave-reason" name="reason" rows={2} maxLength={2000} placeholder="Briefly describe the reason" />

                <label htmlFor="leave-document">Supporting document (optional)</label>
                <input id="leave-document" name="document" type="file" accept="application/pdf,image/jpeg,image/png" />
                <p className="small">PDF, JPEG or PNG, up to 10 MB. Stored privately.</p>
                <button className="btn" type="submit" disabled={isSavingLeave}>
                  {isSavingLeave ? "Submitting..." : "Submit request"}
                </button>
              </form>
              {leaveMessage ? <p className="message-box success" role="status">{leaveMessage}</p> : null}
              {leaveError ? <p className="message-box error" role="alert">{leaveError}</p> : null}

              <h3>Your requests</h3>
              {leaveRequests.map((request) => (
                <div className="task" key={request.id}>
                  <b>{request.leave_type} leave</b>
                  <span className="pill amber" style={{ float: "right" }}>{request.status}</span>
                  <br />
                  <span className="small">{request.start_date} to {request.end_date}</span>
                  {request.decision_note ? <p className="small">{request.decision_note}</p> : null}
                  {request.status === "pending" ? (
                    <button type="button" className="link-button" onClick={() => void handleCancelLeave(request.id)}>
                      Cancel request
                    </button>
                  ) : null}
                </div>
              ))}
              {leaveRequests.length === 0 && !leaveError ? <p className="small">No leave requests yet.</p> : null}
            </div>

            <div className="card" id="messages">
              <h2>Site messages</h2>
              <p className="small">Keep in touch with your site team.</p>

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

                  <div className="card" style={{ background: "#f9f8f7", marginBottom: 16 }}>
                    <h3>{selectedConversation?.title ?? "Conversation"}</h3>
                    {selectedConversation?.messages.length ? (
                      <div style={{ display: "grid", gap: 10, maxHeight: 240, overflowY: "auto" }}>
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
                      <p className="small">No messages yet. Start the conversation.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="small">No conversations yet. Send the first message to start one.</p>
              )}

              <form onSubmit={handleSendMessage}>
                <label htmlFor="message-draft">Your message</label>
                <textarea
                  id="message-draft"
                  rows={3}
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  placeholder={selectedConversation ? "Write a message to the team" : "Start a site message thread"}
                  maxLength={2000}
                />
                <br />
                <button type="submit" className="btn" disabled={isSavingMessage}>
                  {isSavingMessage ? "Sending..." : "Send message"}
                </button>
              </form>
            </div>

            <div className="card" id="report">
              <h2>Report an incident</h2>
              <p className="small">Your Site Manager can see it as soon as you submit.</p>

              <form onSubmit={handleIncidentSubmit}>
                <label htmlFor="incident-category">What happened</label>
                <select id="incident-category" name="category" defaultValue="hazard">
                  <option value="hazard">Hazard</option>
                  <option value="accident">Accident</option>
                </select>

                <label htmlFor="incident-priority">Priority</label>
                <select id="incident-priority" name="priority" defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>

                <label htmlFor="incident-location">Location (optional)</label>
                <input id="incident-location" name="location" maxLength={200} placeholder="e.g. Bay 3" />

                <label htmlFor="incident-details">Details</label>
                <textarea id="incident-details" name="details" rows={3} required maxLength={2000} placeholder="Describe the hazard or accident" />
                <br />
                <button className="btn" type="submit" disabled={isSavingIncident}>
                  {isSavingIncident ? "Submitting..." : "Submit report"}
                </button>
              </form>
              {incidentMessage ? <p className="message-box success" role="status">{incidentMessage}</p> : null}
              {incidentError ? <p className="message-box error" role="alert">{incidentError}</p> : null}
            </div>
          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
