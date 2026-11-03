"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import {
  getAuthenticatedProfile,
  routeForRole,
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
        router.replace(routeForRole(profile.role));
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
      router.replace(routeForRole(profile.role));
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
    <div className="si">
      <div className="si-topbar">
        <span>Site Watch by Take Note Information Technologies · Engineered cyber security and IoT solutions</span>
      </div>

      <header className="si-header">
        <div className="si-wordmark">
          <b>Take Note</b>
          <span>Site Watch</span>
        </div>
      </header>

      <main className="si-hero">
        <div className="si-hero-inner">
          <div className="si-copy">
            <p className="si-eyebrow">Protect your people and your site</p>
            <h1>Know who is on site, what needs doing and what needs fixing.</h1>
            <p className="si-lead">
              Check in only when you are on the company network and inside the site. Managers get a live view of
              presence, tasks and incidents in one place.
            </p>
          </div>

          <div className="si-card">
            <h2>Sign in</h2>
            <p className="si-card-sub">Use the account your administrator created for you.</p>

            <form onSubmit={handleSubmit}>
              <div className="si-field">
                <label htmlFor="email">Work email</label>
                <input id="email" name="email" type="email" placeholder="name@company.co.za" autoComplete="email" required />
              </div>

              <div className="si-field">
                <label htmlFor="password">Password</label>
                <div className="si-password">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="si-toggle"
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button type="submit" className="si-submit" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
              </button>
              {message ? <div className="si-error" role="alert">{message}</div> : null}

              <div className="si-links">
                <Link href="/forgot-password">Forgot password?</Link>
              </div>
            </form>
          </div>
        </div>
      </main>

      <section className="si-features" aria-label="What Site Watch does">
        <div className="si-features-inner">
          <div className="si-feature">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
            <b>Verified check-in</b>
            <span>Network and site radius are checked before attendance is recorded.</span>
          </div>
          <div className="si-feature">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12h6M9 16h6" /></svg>
            <b>Daily tasks</b>
            <span>Assigned work with priority, due time and live status.</span>
          </div>
          <div className="si-feature">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v5M12 18v.5" /></svg>
            <b>Incident reporting</b>
            <span>Report hazards fast and follow them to resolution.</span>
          </div>
          <div className="si-feature">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
            <b>Leave and approvals</b>
            <span>Request leave, attach a sick note and track approval.</span>
          </div>
        </div>
      </section>

      <footer className="si-footer">
        <div className="si-footer-inner">
          <div>
            <div className="si-wordmark light">
              <b>Take Note</b>
              <span>Site Watch</span>
            </div>
            <p>
              Attendance, tasks and site safety in one place, part of Take Note&apos;s engineered security and IoT
              solutions. Accounts are created by your administrator.
            </p>
          </div>
          <small>2026 © Take Note Information Technologies. All rights reserved.</small>
        </div>
      </footer>
    </div>
  );
}
