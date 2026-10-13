"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function Home() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("employee");
  const [message, setMessage] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!role) {
      setMessage("Please choose how you are signing in.");
      return;
    }

    sessionStorage.setItem("siteWatchRole", role);

    if (role === "employee") router.push("/employee");
    if (role === "manager") router.push("/manager");
    if (role === "admin") router.push("/admin");
  };

  return (
    <main className="login">
      <div className="left">
        <div className="logo">TAKE NOTE</div>
        <div className="small" style={{ marginTop: 8, letterSpacing: "2px", fontWeight: 700, color: "#bbb" }}>
          SITE WATCH
        </div>

        <div className="bar" />

        <h1>Attendance, tasks and site safety in one place.</h1>

        <p style={{ color: "#ccc", maxWidth: 560, lineHeight: 1.6 }}>
          Check in only when you are on the company network and inside the site. Managers see who is on site,
          what needs doing and what needs fixing.
        </p>

        <div className="feat">
          <div>
            <b>Verified check-in</b>
            Network and site radius are checked before attendance is recorded.
          </div>
          <div>
            <b>Daily tasks</b>
            Assigned work with priority, due time and live status.
          </div>
          <div>
            <b>Incident reporting</b>
            Report hazards fast and follow them to resolution.
          </div>
        </div>
      </div>

      <div className="right">
        <h1>Sign in</h1>
        <p className="small">Use the account your administrator created for you.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Work email</label>
            <input id="email" type="email" placeholder="name@company.co.za" autoComplete="email" required />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-wrap">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button type="button" className="show-password" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Sign in as</label>
            <div className="role-select">
              <label className="role-option">
                <input type="radio" name="role" value="employee" checked={role === "employee"} onChange={() => setRole("employee")} />
                <span>
                  <b>Employee</b>
                  <small>Check in, tasks and leave</small>
                </span>
              </label>

              <label className="role-option">
                <input type="radio" name="role" value="manager" checked={role === "manager"} onChange={() => setRole("manager")} />
                <span>
                  <b>Site Manager</b>
                  <small>Presence, tasks and incidents</small>
                </span>
              </label>

              <label className="role-option">
                <input type="radio" name="role" value="admin" checked={role === "admin"} onChange={() => setRole("admin")} />
                <span>
                  <b>Administrator</b>
                  <small>People, sites, leave and audit</small>
                </span>
              </label>
            </div>
          </div>

          <div className="login-options">
            <label className="remember">
              <input type="checkbox" />
              Remember me
            </label>
            <Link href="/forgot-password">Forgot password?</Link>
          </div>

          <button type="submit" className="btn login-btn">Sign in</button>
          {message ? <div className="message error">{message}</div> : null}
        </form>
      </div>
    </main>
  );
}
