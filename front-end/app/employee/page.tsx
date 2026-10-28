"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { getStoredUserEmail, signOut } from "@/lib/auth";
import { formatWhen, incidentRef } from "@/lib/format";
import { RoleGuard } from "@/components/role-guard";
import { Avatar, BrandLogo } from "@/components/brand";

import "./employee.css";
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
  work_start?: string | null;
  work_end?: string | null;
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

type IncidentRecord = {
  id: string;
  ref_no: number;
  category: string;
  priority: "low" | "medium" | "high";
  status: "open" | "investigating" | "monitoring" | "resolved";
  details: string;
  created_at: string;
};

type Tab = "home" | "leave" | "report" | "messages";

// Assumed yearly sick-leave entitlement shown on the Leave tab (not stored in the database yet).
const SICK_LEAVE_ENTITLEMENT_DAYS = 10;

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

const PRIORITY_PILL: Record<TaskRecord["priority"], string> = { high: "red", medium: "amber", low: "grey" };
const PRIORITY_LABEL: Record<TaskRecord["priority"], string> = { high: "High", medium: "Medium", low: "Low" };
const LEAVE_PILL: Record<string, string> = { pending: "amber", approved: "green", rejected: "red", cancelled: "grey" };

const parseDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const shortDate = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const inclusiveDays = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
const incidentStep = (status: IncidentRecord["status"]) =>
  status === "resolved" ? 3 : status === "open" ? 1 : 2;

function TabIcon({ name }: { name: Tab }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "home") return <svg {...common}><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /></svg>;
  if (name === "leave") return <svg {...common}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>;
  if (name === "report") return <svg {...common}><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v5M12 18v.5" /></svg>;
  return <svg {...common}><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" /></svg>;
}
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
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  // A fixed placeholder keeps prerendering stable; the real time is set on mount.
  const [now, setNow] = useState(() => new Date(0));
  const [displayName, setDisplayName] = useState("Employee");
  const [signOutMessage, setSignOutMessage] = useState("");
  const checkInRequestId = useRef<string | null>(null);
  const checkOutRequestId = useRef<string | null>(null);
  const openAttendance = attendance.find((record) => record.is_open) ?? null;
  const homeSite = sites.find((site) => site.id === homeSiteId) ?? null;

  useEffect(() => {
    void Promise.resolve().then(() => setNow(new Date()));
  }, []);

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

  const refreshIncidents = useCallback(async () => {
    const response = await fetch("/api/incidents");
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ?? "Could not load reports.");
    }
    setIncidents(result.incidents ?? []);
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
    void Promise.resolve().then(refreshIncidents).catch((error: unknown) => {
      setIncidentError(error instanceof Error ? error.message : "Could not load reports.");
    });
  }, [refreshIncidents, refreshMessages, refreshTasks]);

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
      await refreshIncidents();
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

  // ---- Derived values for the design ----
  const siteWorkStart = homeSite?.work_start?.slice(0, 5) ?? "08:00";
  const siteWorkEnd = homeSite?.work_end?.slice(0, 5) ?? "17:00";
  const firstName = displayName.split(" ")[0] || displayName;
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLine = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  const presence = openAttendance?.presence_status ?? null;
  const presencePill =
    presence === "verified"
      ? { label: "Within site", pill: "green" }
      : presence === "outside_radius"
        ? { label: "Outside site", pill: "red" }
        : presence === "unverified"
          ? { label: "Unverified", pill: "amber" }
          : { label: "Not checked in", pill: "grey" };
  const signedInLabel =
    presence === "verified" ? "Verified" : presence === "outside_radius" ? "Outside site" : presence === "unverified" ? "Unverified" : "Not active";

  const monthStats = (() => {
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const startMinutes = minutesOf(siteWorkStart);

    const monthCheckIns = attendance.filter((record) => {
      const date = new Date(record.check_in_at);
      return date.getFullYear() === year && date.getMonth() === month;
    });
    const presentDays = new Set(monthCheckIns.map((record) => dayKey(new Date(record.check_in_at))));
    const lateDays = new Set(
      monthCheckIns
        .filter((record) => {
          const date = new Date(record.check_in_at);
          return date.getHours() * 60 + date.getMinutes() > startMinutes;
        })
        .map((record) => dayKey(new Date(record.check_in_at))),
    );

    const leaveDays = new Set<string>();
    for (const request of leaveRequests) {
      if (request.status !== "approved") continue;
      const end = parseDate(request.end_date);
      for (let day = parseDate(request.start_date); day <= end; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
        if (day.getFullYear() === year && day.getMonth() === month) leaveDays.add(dayKey(day));
      }
    }

    // Absent: weekdays that have fully passed (plus today if already checked in) with no check-in and no approved leave.
    let absent = 0;
    for (let d = 1; d <= today; d += 1) {
      const date = new Date(year, month, d);
      const weekday = date.getDay();
      if (weekday === 0 || weekday === 6) continue;
      const key = dayKey(date);
      if (d === today && !presentDays.has(key)) continue;
      if (!presentDays.has(key) && !leaveDays.has(key)) absent += 1;
    }

    return { present: presentDays.size, absent, late: lateDays.size, leave: leaveDays.size };
  })();

  const leaveUsedDays = (() => {
    const year = now.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    let used = 0;
    for (const request of leaveRequests) {
      if (request.status !== "approved") continue;
      const start = parseDate(request.start_date);
      const end = parseDate(request.end_date);
      const from = start < yearStart ? yearStart : start;
      const to = end > yearEnd ? yearEnd : end;
      if (to >= from) used += inclusiveDays(from, to);
    }
    return used;
  })();
  const leaveLeft = Math.max(0, SICK_LEAVE_ENTITLEMENT_DAYS - leaveUsedDays);

  const todayKey = dayKey(now);
  const visibleTasks = tasks.filter(
    (task) => task.status !== "done" || (task.completed_at !== null && dayKey(new Date(task.completed_at)) === todayKey),
  );
  const openTaskCount = tasks.filter((task) => task.status !== "done").length;

  return (
    <RoleGuard allowedRoles={["employee"]}>
      <div className="mobile-page">
        <div className="mobile">
          <header className="m-top">
            <BrandLogo small />
            <span>SITE WATCH</span>
          </header>

          <main className="m-body">
            {tab === "home" && (
              <>
                <div className="m-greet">
                  <div>
                    <div className="m-date">{dateLine}</div>
                    <h1>{greeting}, {firstName}</h1>
                  </div>
                  <Avatar name={displayName} red large />
                </div>

                <section className="m-card" aria-label="My site">
                  <div className="head">
                    <div>
                      <small>My site</small>
                      <h2 className="site">{homeSite?.name ?? "Not assigned"}</h2>
                    </div>
                    <span className={`pill dot ${presencePill.pill}`}>{presencePill.label}</span>
                  </div>

                  <div className="kv"><span>Signed in</span><b className={presence === "verified" ? "good" : ""}>{signedInLabel}</b></div>
                  <div className="kv">
                    <span>Distance from site centre</span>
                    <b className={presence === "verified" ? "good" : ""}>
                      {openAttendance?.check_in_distance_m == null
                        ? "Not available"
                        : `${Math.round(openAttendance.check_in_distance_m)} m of ${homeSite?.radius_m ?? "—"} m`}
                    </b>
                  </div>
                  <div className="kv">
                    <span>{openAttendance ? "Checked in at" : "Working hours"}</span>
                    <b>{openAttendance ? clockTime(openAttendance.check_in_at) : `${siteWorkStart} to ${siteWorkEnd}`}</b>
                  </div>

                  <button
                    className="btn block checkin-btn"
                    type="button"
                    onClick={handleAttendance}
                    disabled={isSavingAttendance || (!openAttendance && !homeSite)}
                  >
                    {isSavingAttendance ? "Saving..." : openAttendance ? "Check out" : "Check in"}
                  </button>
                  <p className="small m-note">
                    {openAttendance
                      ? `Working hours ${siteWorkStart} to ${siteWorkEnd}. Check out when you leave the site.`
                      : "Check in from your site: your location is verified against the site radius."}
                  </p>
                  {attendanceMessage ? <p className="small" role="status" style={{ marginTop: 8 }}>{attendanceMessage}</p> : null}
                  {attendanceError ? <p className="message error" role="alert">{attendanceError}</p> : null}
                </section>

                <div className="m-stats" aria-label="This month">
                  <div><b>{monthStats.present}</b>Present</div>
                  <div><b>{monthStats.absent}</b>Absent</div>
                  <div><b>{monthStats.late}</b>Late</div>
                  <div><b>{monthStats.leave}</b>Leave</div>
                </div>

                <div className="m-section">
                  <h2>My tasks today</h2>
                  <span className="small">{openTaskCount} open</span>
                </div>
                {taskError ? <p className="message error" role="alert">{taskError}</p> : null}
                {visibleTasks.map((task) => (
                  <div className={`m-task${task.status === "done" ? " done" : ""}`} key={task.id}>
                    <div className="row">
                      <b>{task.title}</b>
                      {task.status === "done" ? (
                        <span className="pill dot green">Done</span>
                      ) : (
                        <span className={`pill ${PRIORITY_PILL[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</span>
                      )}
                    </div>
                    <div className="meta">
                      {task.status === "done"
                        ? `Completed ${task.completed_at ? clockTime(task.completed_at) : ""}`
                        : `${task.due_at ? `Due ${clockTime(task.due_at)} · ` : ""}${STATUS_LABEL[task.status]}`}
                    </div>
                    {task.status !== "done" ? (
                      <div className="actions">
                        {task.status === "pending" ? (
                          <button type="button" className="link-button" onClick={() => void handleTaskStatus(task.id, "in_progress")}>
                            Start
                          </button>
                        ) : null}
                        <button type="button" className="link-button" onClick={() => void handleTaskStatus(task.id, "done")}>
                          Mark done
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
                {visibleTasks.length === 0 && !taskError ? <p className="small">No tasks assigned to you today.</p> : null}

                <div className="m-foot">
                  <span className="small">Signed in as {displayName}</span>
                  <button type="button" className="link-button" onClick={handleSignOut}>Sign out</button>
                </div>
                {signOutMessage ? <div className="message error" role="alert">{signOutMessage}</div> : null}
              </>
            )}

            {tab === "leave" && (
              <>
                <h1 className="m-title">Leave</h1>

                <section className="m-card" aria-label="Sick leave balance">
                  <div className="head">
                    <small>Sick leave this year</small>
                    <span className="small">{SICK_LEAVE_ENTITLEMENT_DAYS} days</span>
                  </div>
                  <div className="balance"><b>{leaveLeft}</b> days left · {leaveUsedDays} used</div>
                  <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={SICK_LEAVE_ENTITLEMENT_DAYS} aria-valuenow={Math.min(leaveUsedDays, SICK_LEAVE_ENTITLEMENT_DAYS)}>
                    <i style={{ width: `${Math.min(100, (leaveUsedDays / SICK_LEAVE_ENTITLEMENT_DAYS) * 100)}%` }} />
                  </div>
                </section>

                <section className="m-card" aria-label="New leave request">
                  <h2>New request</h2>
                  <form onSubmit={handleLeaveSubmit}>
                    <label htmlFor="leave-type">Leave type</label>
                    <select id="leave-type" name="leave_type" defaultValue="sick">
                      <option value="sick">Sick leave</option>
                    </select>

                    <div className="two-col">
                      <div>
                        <label htmlFor="leave-start-date">Start date</label>
                        <input id="leave-start-date" name="start_date" type="date" required />
                      </div>
                      <div>
                        <label htmlFor="leave-end-date">End date</label>
                        <input id="leave-end-date" name="end_date" type="date" required />
                      </div>
                    </div>

                    <label htmlFor="leave-reason">Reason</label>
                    <textarea id="leave-reason" name="reason" rows={3} maxLength={2000} placeholder="Briefly describe the reason" />

                    <label htmlFor="leave-document">Sick note</label>
                    <div className="dropzone">
                      <input id="leave-document" name="document" type="file" accept="application/pdf,image/jpeg,image/png" />
                    </div>
                    <p className="small" style={{ margin: "6px 0 14px" }}>PDF, JPG or PNG, up to 10 MB. Files are stored privately.</p>

                    <button className="btn block" type="submit" disabled={isSavingLeave}>
                      {isSavingLeave ? "Submitting..." : "Submit request"}
                    </button>
                  </form>
                  {leaveMessage ? <p className="message-box success" role="status">{leaveMessage}</p> : null}
                  {leaveError ? <p className="message-box error" role="alert">{leaveError}</p> : null}
                </section>

                <div className="m-section"><h2>My requests</h2></div>
                {leaveRequests.map((request) => (
                  <div className="req-row" key={request.id}>
                    <div className="row">
                      <span>Sick leave</span>
                      <span className={`pill dot ${LEAVE_PILL[request.status] ?? "grey"}`}>
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </span>
                    </div>
                    <div className="meta small">
                      {request.start_date === request.end_date
                        ? shortDate(request.start_date)
                        : `${shortDate(request.start_date)} to ${shortDate(request.end_date)}`}
                    </div>
                    {request.decision_note ? <p className="small">{request.decision_note}</p> : null}
                    {request.status === "pending" ? (
                      <button type="button" className="link-button" style={{ marginTop: 4 }} onClick={() => void handleCancelLeave(request.id)}>
                        Cancel request
                      </button>
                    ) : null}
                  </div>
                ))}
                {leaveRequests.length === 0 && !leaveError ? <p className="small">No leave requests yet.</p> : null}
              </>
            )}

            {tab === "report" && (
              <>
                <h1 className="m-title">Report an incident</h1>
                <p className="small" style={{ marginBottom: 14 }}>Your Site Manager is notified as soon as you submit.</p>

                <section className="m-card" aria-label="Report an incident">
                  <form onSubmit={handleIncidentSubmit}>
                    <label htmlFor="incident-category">What happened</label>
                    <select id="incident-category" name="category" defaultValue="hazard">
                      <option value="hazard">Hazard</option>
                      <option value="accident">Accident</option>
                    </select>

                    <label id="incident-priority-label">Priority</label>
                    <div className="seg" role="radiogroup" aria-labelledby="incident-priority-label">
                      <label><input type="radio" name="priority" value="low" /> Low</label>
                      <label><input type="radio" name="priority" value="medium" defaultChecked /> Medium</label>
                      <label><input type="radio" name="priority" value="high" /> High</label>
                    </div>

                    <label htmlFor="incident-location">Location (optional)</label>
                    <input id="incident-location" name="location" maxLength={200} placeholder="e.g. Bay 3" />

                    <label htmlFor="incident-details">Details</label>
                    <textarea id="incident-details" name="details" rows={4} required maxLength={2000} placeholder="Describe the hazard or accident" />

                    <div className="loc-note">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d5151c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                      <div>
                        <b>{homeSite?.name ?? "Your site"}</b>
                        <div className="small">This report goes to your site manager.</div>
                      </div>
                    </div>

                    <button className="btn dark-red block" type="submit" disabled={isSavingIncident}>
                      {isSavingIncident ? "Submitting..." : "Submit report"}
                    </button>
                  </form>
                  {incidentMessage ? <p className="message-box success" role="status">{incidentMessage}</p> : null}
                  {incidentError ? <p className="message-box error" role="alert">{incidentError}</p> : null}
                </section>

                <div className="m-section"><h2>My recent reports</h2></div>
                {incidents.map((incident) => {
                  const step = incidentStep(incident.status);
                  return (
                    <div className="req-row" key={incident.id}>
                      <div className="row">
                        <b>{incident.details.split("\n")[0].slice(0, 60)}</b>
                        <span className="small">{incidentRef(incident.ref_no)}</span>
                      </div>
                      <div className="steps" style={{ marginTop: 8 }} aria-label={`Status: ${incident.status}`}>
                        <span className={step >= 1 ? "on" : ""}>Reported</span>
                        <span className={step >= 2 ? "on" : ""}>Investigating</span>
                        <span className={step >= 3 ? "on" : ""}>Resolved</span>
                      </div>
                    </div>
                  );
                })}
                {incidents.length === 0 ? <p className="small">You have not reported anything yet.</p> : null}
              </>
            )}

            {tab === "messages" && (
              <>
                <h1 className="m-title">Messages</h1>
                <p className="small" style={{ marginBottom: 14 }}>Keep in touch with your site team.</p>

                {messageError ? <p className="message-box error" role="alert">{messageError}</p> : null}
                {messageSuccess ? <p className="message-box success" role="status">{messageSuccess}</p> : null}

                {conversations.length > 0 ? (
                  <>
                    <div className="thread-list" style={{ marginTop: 12 }}>
                      {conversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          type="button"
                          className={selectedConversation?.id === conversation.id ? "selected" : ""}
                          onClick={() => setSelectedConversationId(conversation.id)}
                        >
                          <b>{conversation.title}</b>
                          <div className="small">
                            {conversation.messages.length} message{conversation.messages.length === 1 ? "" : "s"}
                          </div>
                        </button>
                      ))}
                    </div>

                    <section className="m-card" aria-label="Conversation">
                      <h2>{selectedConversation?.title ?? "Conversation"}</h2>
                      {selectedConversation?.messages.length ? (
                        <div className="thread-body">
                          {selectedConversation.messages.map((message) => (
                            <div className="bubble" key={message.id}>
                              <div className="small" style={{ marginBottom: 4 }}>
                                <b>{message.sender_name ?? "Team member"}</b> · {formatWhen(message.created_at)}
                              </div>
                              <div>{message.body}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="small">No messages yet. Start the conversation.</p>
                      )}
                    </section>
                  </>
                ) : (
                  <p className="small" style={{ margin: "12px 0" }}>No conversations yet. Send the first message to start one.</p>
                )}

                <section className="m-card" aria-label="New message">
                  <form onSubmit={handleSendMessage}>
                    <label htmlFor="message-draft" style={{ marginTop: 0 }}>Your message</label>
                    <textarea
                      id="message-draft"
                      rows={3}
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      placeholder={selectedConversation ? "Write a message to the team" : "Start a site message thread"}
                      maxLength={2000}
                    />
                    <button type="submit" className="btn block" style={{ marginTop: 12 }} disabled={isSavingMessage}>
                      {isSavingMessage ? "Sending..." : "Send message"}
                    </button>
                  </form>
                </section>
              </>
            )}
          </main>

          <nav className="tabbar" aria-label="Employee navigation">
            {([
              ["home", "Home"],
              ["leave", "Leave"],
              ["report", "Report"],
              ["messages", "Messages"],
            ] as [Tab, string][]).map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
                <TabIcon name={id} />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </RoleGuard>
  );
}
