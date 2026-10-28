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
import { BrandLogo } from "@/components/brand";

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
    <main className="login">
      <div className="left">
        <div className="brand-row">
          <BrandLogo />
          <span>SITE WATCH</span>
        </div>

        <div className="bar" />

        <h1>Attendance, tasks and site safety in one place.</h1>

        <p>
          Check in from your site and your location is verified against the site radius. Managers see who is on
          site, what needs doing and what needs fixing.
        </p>

        <div className="feat">
          <div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
            <b>Verified check-in</b>
            Site radius is checked before attendance is recorded.
          </div>
          <div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12h6M9 16h6" /></svg>
            <b>Daily tasks</b>
            Assigned work with priority, due time and live status.
          </div>
          <div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v5M12 18v.5" /></svg>
            <b>Incident reporting</b>
            Report hazards fast and follow them to resolution.
          </div>
        </div>
      </div>

      <div className="right">
        <div className="panel">
          <h1>Sign in</h1>
          <p className="small">Use the account your administrator created for you.</p>

          <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
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

            <button type="submit" className="btn login-btn" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
            {message ? <div className="message error" role="alert">{message}</div> : null}

            <div className="login-options">
              <Link href="/forgot-password">Forgot password?</Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
