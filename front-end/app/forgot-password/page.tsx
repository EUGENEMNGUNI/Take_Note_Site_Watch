"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"request" | "otp" | "reset" | "done">("request");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success" | "">("");
  const [email, setEmail] = useState("thabo@company.co.za");

  const handleRequestReset = () => {
    if (!email.trim()) {
      setMessage("Please enter your work email.");
      setMessageType("error");
      return;
    }

    setMessage(`A one-time code has been sent to ${email}.`);
    setMessageType("success");
    setStep("otp");
  };

  const handleVerifyOtp = () => {
    setMessage("Code accepted. Set a new password to continue.");
    setMessageType("success");
    setStep("reset");
  };

  const handleResetPassword = () => {
    setMessage("Your password has been updated successfully.");
    setMessageType("success");
    setStep("done");
  };

  return (
    <div className="forgot-page">
      <div className="forgot-box">
        <div className="brand">
          <div className="logo">TAKE NOTE</div>
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

            <button className="btn" style={{ width: "100%", marginTop: 18 }} onClick={handleRequestReset}>
              Send reset code
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

            <input className="otp-input" defaultValue="4826" maxLength={4} />

            <button className="btn" style={{ width: "100%", marginTop: 18 }} onClick={handleVerifyOtp}>
              Verify code
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
            <input id="newPassword" type="password" placeholder="Enter a new password" />

            <label htmlFor="confirmPassword">Confirm password</label>
            <input id="confirmPassword" type="password" placeholder="Confirm your password" />

            <div className="password-help">Use at least 8 characters, including a number and a symbol.</div>

            <button className="btn" style={{ width: "100%", marginTop: 18 }} onClick={handleResetPassword}>
              Update password
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
