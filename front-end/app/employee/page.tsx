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
                My tasks today
                <span className="small" style={{ marginLeft: 12 }}>3 open</span>
              </h2>

              <div className="task">
                Inspect server room
                <span className="pill red" style={{ float: "right" }}>High</span>
                <br />
                <span className="small">Due 14:00 · Pending</span>
              </div>

              <div className="task">
                Check extinguisher tags, Bay 1
                <span className="pill amber" style={{ float: "right" }}>Medium</span>
                <br />
                <span className="small">Due 15:30 · In progress</span>
              </div>

              <div className="task done">
                <b>Morning equipment check</b>
                <span className="pill green" style={{ float: "right" }}>Done</span>
                <br />
                <span className="small">Completed 09:10</span>
              </div>
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

            <div className="card" id="report">
              <h2>Report an incident</h2>
              <p className="small">Your Site Manager is notified as soon as you submit.</p>

              <label>What happened</label>
              <select>
                <option>Hazard</option>
                <option>Accident</option>
              </select>

              <label>Priority</label>
              <select>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>

              <label>Details</label>
              <textarea rows={3} placeholder="Describe the hazard or accident" />
              <br />
              <button className="btn">Submit report</button>
            </div>
          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
