"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import {
  getAuthenticatedProfile,
  setStoredUserEmail,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/browser";

export default function Home() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void getAuthenticatedProfile()
      .then(async (profile) => {
        if (!active || !profile) return;
        if (!profile.isActive) {
          const { error } = await createClient().auth.signOut();
          if (!active) return;
          setMessage(
            error
              ? `Your account is inactive and sign-out failed: ${error.message}`
              : "Your account is inactive. Contact your administrator.",
          );
          return;
        }
        setStoredUserEmail(profile.email);
        router.replace(profile.role === "admin" ? "/admin" : "/employee");
      })
      .catch(() => {
        if (active) {
          setMessage("We could not verify your existing session. Please sign in again.");
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      setMessage("Please enter your work email and password.");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setMessage("Please enter a valid work email.");
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
        return;
      }

      const profile = await getAuthenticatedProfile();
      if (!profile) {
        const { error: signOutError } = await supabase.auth.signOut();
        setMessage(
          signOutError
            ? `Could not verify the account or clear its session: ${signOutError.message}`
            : "No account profile was found. Contact your administrator.",
        );
        return;
      }

      if (!profile.isActive) {
        const { error: signOutError } = await supabase.auth.signOut();
        setMessage(
          signOutError
            ? `Your account is inactive and sign-out failed: ${signOutError.message}`
            : "Your account is inactive. Contact your administrator.",
        );
        return;
      }

      setStoredUserEmail(profile.email || email);
      router.replace(profile.role === "admin" ? "/admin" : "/employee");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Sign in failed unexpectedly. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
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
            <input id="email" name="email" type="email" placeholder="name@company.co.za" autoComplete="email" required />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-wrap">
              <input
                id="password"
                name="password"
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

          <div className="login-options">
            <Link href="/forgot-password">Forgot password?</Link>
          </div>

          <button type="submit" className="btn login-btn" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
          {message ? <div className="message error">{message}</div> : null}
        </form>
      </div>
    </main>
  );
}
