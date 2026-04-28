import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import AuthLayout from "../components/AuthLayout";

type Step = "email" | "otp" | "newPassword";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [timeLeft, setTimeLeft] = useState(300);
  const [canResend, setCanResend] = useState(false);
  const otpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (step !== "otp") return;
    setTimeLeft(300);
    setCanResend(false);
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); setCanResend(true); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await axios.post("/api/auth/forgotpassword", { email });
      if (res.data.success) { setStep("otp"); setMessage("OTP sent to your email."); }
    } catch (err: any) {
      setError(err.response?.data?.error || "We found no account with that email.");
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    setError(""); setOtp(["", "", "", ""]); setLoading(true);
    try {
      await axios.post("/api/auth/forgotpassword", { email });
      setCanResend(false);
      setStep("email");
      setTimeout(() => setStep("otp"), 10);
      setMessage("A new OTP was sent.");
    } catch { setError("Failed to resend OTP."); }
    finally { setLoading(false); }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const code = otp.join("");
    if (code.length !== 4) { setError("Please enter all 4 digits."); return; }
    setLoading(true);
    try {
      const res = await axios.post("/api/auth/verifyotp", { email, otp: code });
      if (res.data.success) { setStep("newPassword"); setMessage(""); }
    } catch (err: any) {
      setError(err.response?.data?.error || "Invalid or expired code.");
    } finally { setLoading(false); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      const res = await axios.post("/api/auth/resetpassword-otp", { email, password: newPassword });
      if (res.data.success) {
        setMessage("Password reset successful. Redirecting...");
        setTimeout(() => navigate("/login"), 2000);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to reset password.");
    } finally { setLoading(false); }
  };

  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp]; next[i] = val.slice(-1); setOtp(next);
    if (val && i < 3) otpRefs[i + 1].current?.focus();
  };
  const handleOtpKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs[i - 1].current?.focus();
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (p.length === 4) { setOtp(p.split("")); otpRefs[3].current?.focus(); }
    e.preventDefault();
  };

  const stepIdx = step === "email" ? 0 : step === "otp" ? 1 : 2;
  const steps = ["Email", "Verify", "Reset"];

  return (
    <AuthLayout title="Reset Password" subtitle="Follow the steps to recover your account">

      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, paddingBottom: 10, borderBottom: "1px solid rgba(244, 200, 66, 0.1)" }}>
        {steps.map((label, i) => (
          <React.Fragment key={label}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.85rem", fontWeight: 900, fontFamily: "Georgia, serif",
                background: i < stepIdx ? "rgba(244, 200, 66, 0.2)" : i === stepIdx ? "#f4c842" : "rgba(255,255,255,0.05)",
                color: i <= stepIdx ? (i === stepIdx ? "#1a1200" : "#f4c842") : "rgba(255,255,255,0.3)",
                border: i < stepIdx ? "1px solid #f4c842" : "1px solid transparent",
                boxShadow: i === stepIdx ? "0 0 15px rgba(244, 200, 66, 0.5)" : "none",
                transform: i === stepIdx ? "scale(1.15)" : "scale(1)",
                transition: "all 0.3s ease",
              }}>
                {i < stepIdx ? "✓" : i + 1}
              </div>
              <span style={{
                fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                color: i === stepIdx ? "#f4c842" : "rgba(255,255,255,0.4)",
              }}>{label}</span>
            </div>
            {i < 2 && (
              <div style={{
                width: 40, height: 2, borderRadius: 2, margin: "0 8px", marginBottom: 16,
                background: i < stepIdx ? "#f4c842" : "rgba(255,255,255,0.1)",
                transition: "background 0.3s ease",
              }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ background:"rgba(220, 38, 38, 0.1)", border:"1px solid rgba(220, 38, 38, 0.3)", color:"#fca5a5", borderRadius:8, padding:"10px 14px", fontSize:"0.85rem", fontWeight:700, textAlign:"center", marginBottom:16, boxShadow: "inset 0 0 10px rgba(220,38,38,0.05)" }}>
          {error}
        </div>
      )}
      {message && (
        <div style={{ background:"rgba(34, 197, 94, 0.1)", border:"1px solid rgba(34, 197, 94, 0.3)", color:"#86efac", borderRadius:8, padding:"10px 14px", fontSize:"0.85rem", fontWeight:700, textAlign:"center", marginBottom:16, boxShadow: "inset 0 0 10px rgba(34,197,94,0.05)" }}>
          {message}
        </div>
      )}

      {/* STEP 1 */}
      {step === "email" && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label style={labelStyle}>Email Address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required placeholder="name@example.com" className="auth-input" />
          </div>
          <div style={{ paddingTop: 8 }}>
            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </div>
        </form>
      )}

      {/* STEP 2 */}
      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-5">
          <p style={{ textAlign:"center", fontSize:"0.85rem", color:"rgba(245, 230, 200, 0.6)", fontWeight:600, margin:0 }}>
            Code sent to <strong style={{ color:"#f4c842", fontStyle: "normal" }}>{email}</strong>
          </p>

          {/* OTP boxes */}
          <div style={{ display:"flex", justifyContent:"center", gap:12 }}>
            {otp.map((digit, i) => (
              <input key={i} ref={otpRefs[i]}
                type="text" inputMode="numeric" maxLength={1} value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKey(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                style={{
                  width: 56, height: 64, textAlign:"center",
                  fontSize: "1.8rem", fontWeight: 900,
                  fontFamily: "Georgia, serif",
                  borderRadius: 12,
                  border: digit ? "1px solid #f4c842" : "1px solid rgba(244, 200, 66, 0.2)",
                  background: digit ? "rgba(13, 27, 62, 0.9)" : "rgba(0, 0, 0, 0.4)",
                  color: "#f5e6c8", outline: "none",
                  boxShadow: digit ? "0 0 15px rgba(244, 200, 66, 0.25)" : "inset 0 0 10px rgba(0,0,0,0.5)",
                  transition: "all 0.2s ease",
                }}
              />
            ))}
          </div>

          {/* Timer */}
          <p style={{ textAlign:"center", fontSize:"0.85rem", color:"rgba(245, 230, 200, 0.5)", fontWeight:600, margin:0 }}>
            {!canResend ? (
              <>Expires in{" "}
                <span style={{ fontWeight:800, color: timeLeft < 60 ? "#ef4444" : "#f4c842", fontStyle:"normal" }}>
                  {fmt(timeLeft)}
                </span>
              </>
            ) : (
              <>Code expired.{" "}
                <button type="button" onClick={handleResend} disabled={loading}
                  style={{ color:"#f4c842", fontWeight:800, background:"none", border:"none", cursor:"pointer", padding:0, textDecoration: "underline" }}>
                  Resend
                </button>
              </>
            )}
          </p>

          <button type="submit" disabled={loading || otp.join("").length !== 4} className="auth-btn">
            {loading ? "Verifying..." : "Verify Code"}
          </button>
        </form>
      )}

      {/* STEP 3 */}
      {step === "newPassword" && (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <p style={{ textAlign:"center", fontSize:"0.85rem", color:"#86efac", fontWeight:700, margin:0 }}>
            Identity verified — set your new password
          </p>
          <div>
            <label style={labelStyle}>New Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              required minLength={6} placeholder="Min 6 characters" className="auth-input" />
          </div>
          <div>
            <label style={labelStyle}>Confirm Password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              required minLength={6} placeholder="••••••••" className="auth-input" />
          </div>
          <div style={{ paddingTop: 8 }}>
            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? "Updating..." : "Reset Password"}
            </button>
          </div>
        </form>
      )}

      <div style={{ marginTop: 24, textAlign:"center", fontSize:"0.9rem", color:"rgba(245, 230, 200, 0.6)", fontWeight:600 }}>
        Remembered it?{" "}
        <Link to="/login" style={{ color:"#D4AF37", fontWeight:700, textDecoration:"underline" }}>Back to Login</Link>
      </div>
    </AuthLayout>
  );
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.85rem",
  fontWeight: 700,
  color: "#D4AF37",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 8,
  fontFamily: "Georgia, serif",
};

export default ForgotPassword;