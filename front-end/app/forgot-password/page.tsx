"use client";

import Link from "next/link";
import { useState } from "react";

import { createClient } from "@/lib/supabase/browser";
import { BrandLogo } from "@/components/brand";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"request" | "otp" | "reset" | "done">("request");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success" | "">("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const fail = (text: string) => {
    setMessage(text);
    setMessageType("error");
  };
  const succeed = (text: string) => {
    setMessage(text);
    setMessageType("success");
  };

  const handleRequestReset = async () => {
    if (isBusy) return;
    if (!email.trim()) {
      fail("Please enter your work email.");
      return;
    }

    setIsBusy(true);
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim());
      if (error) {
        fail(error.message);
        return;
      }
      // Same wording whether or not the account exists, so the form cannot be
      // used to discover which emails are registered.
      succeed(`If an account exists for ${email.trim()}, a one-time code has been sent.`);
      setStep("otp");
    } catch (error) {
      fail(error instanceof Error ? error.message : "Could not send the reset code.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (isBusy) return;
    if (!/^\d{6,10}$/.test(code.trim())) {
      fail("Enter the numeric code from your email.");
      return;
    }

    setIsBusy(true);
    try {
      const { error } = await createClient().auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "recovery",
      });
      if (error) {
        fail(error.message);
        return;
      }
      succeed("Code accepted. Set a new password to continue.");
      setStep("reset");
    } catch (error) {
      fail(error instanceof Error ? error.message : "Could not verify the code.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (isBusy) return;
    if (newPassword.length < 8 || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      fail("Use at least 8 characters, including a number and a symbol.");
      return;
    }
    if (newPassword !== confirmPassword) {
      fail("The two passwords do not match.");
      return;
    }

    setIsBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        fail(error.message);
        return;
      }
      // Require a fresh sign-in with the new password.
      await supabase.auth.signOut();
      setNewPassword("");
      setConfirmPassword("");
      succeed("Your password has been updated successfully.");
      setStep("done");
    } catch (error) {
      fail(error instanceof Error ? error.message : "Could not update the password.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="forgot-page">
      <div className="forgot-box">
        <div className="brand">
          <BrandLogo />
          <span className="brand-name">SITE WATCH</span>
        </div>

        {step === "request" && (
          <div className="step active">
            <div className="forgot-header">
              <div className="forgot-icon">?</div>
              <h1>Reset password</h1>
              <p>Enter your work email and we will send a reset code.</p>
            </div>

            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.co.za"
            />

            <button className="btn" style={{ width: "100%", marginTop: 18 }} onClick={() => void handleRequestReset()} disabled={isBusy}>
              {isBusy ? "Sending..." : "Send reset code"}
            </button>

            {message ? <div className={`message-box ${messageType}`}>{message}</div> : null}
            <Link href="/" className="back-login">Back to sign in</Link>
          </div>
        )}

        {step === "otp" && (
          <div className="step active">
            <div className="forgot-header">
              <div className="forgot-icon">🔐</div>
              <h2>Verify code</h2>
            </div>

            <p className="otp-info">
              Enter the code sent to <span className="email-display">{email}</span>
            </p>

            <input className="otp-input" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={10} aria-label="One-time code" />

            <button className="btn" style={{ width: "100%", marginTop: 18 }} onClick={() => void handleVerifyOtp()} disabled={isBusy}>
              {isBusy ? "Verifying..." : "Verify code"}
            </button>

            {message ? <div className={`message-box ${messageType}`}>{message}</div> : null}
            <Link href="/" className="back-login">Back to sign in</Link>
          </div>
        )}

        {step === "reset" && (
          <div className="step active">
            <div className="forgot-header">
              <div className="forgot-icon">✓</div>
              <h2>Create new password</h2>
            </div>

            <label htmlFor="newPassword">New password</label>
            <input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="Enter a new password" />

            <label htmlFor="confirmPassword">Confirm password</label>
            <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" placeholder="Confirm your password" />

            <div className="password-help">Use at least 8 characters, including a number and a symbol.</div>

            <button className="btn" style={{ width: "100%", marginTop: 18 }} onClick={() => void handleResetPassword()} disabled={isBusy}>
              {isBusy ? "Updating..." : "Update password"}
            </button>

            {message ? <div className={`message-box ${messageType}`}>{message}</div> : null}
            <Link href="/" className="back-login">Back to sign in</Link>
          </div>
        )}

        {step === "done" && (
          <div className="step active">
            <div className="success">
              <div className="success-icon">✓</div>
              <h2>Password updated</h2>
              <p>Your password was changed successfully. You can now sign in with your new credentials.</p>
            </div>

            <Link href="/" className="btn" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "100%", marginTop: 18 }}>
              Go to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
