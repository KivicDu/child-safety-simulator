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
      if (res.data.success) { setStep("otp"); setMessage("OTP sent to your email!"); }
    } catch (err: any) {
      setError(err.response?.data?.error || "No account found with that email.");
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    setError(""); setOtp(["", "", "", ""]); setLoading(true);
    try {
      await axios.post("/api/auth/forgotpassword", { email });
      setCanResend(false);
      setStep("email");
      setTimeout(() => setStep("otp"), 10);
      setMessage("New OTP sent!");
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
      setError(err.response?.data?.error || "Invalid or expired OTP.");
    } finally { setLoading(false); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) { setError("Passwords do not match!"); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters!"); return; }
    setLoading(true);
    try {
      const res = await axios.post("/api/auth/resetpassword-otp", { email, password: newPassword });
      if (res.data.success) {
        setMessage("Password reset! Redirecting…");
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
    <AuthLayout title="Reset password" subtitle="Follow the steps to recover your account" icon="🔐">

      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        {steps.map((label, i) => (
          <React.Fragment key={label}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.72rem", fontWeight: 800,
                background: i < stepIdx ? "#86efac" : i === stepIdx ? "linear-gradient(135deg,#818cf8,#a78bfa)" : "#f3f4f6",
                color: i <= stepIdx ? "white" : "#9ca3af",
                boxShadow: i === stepIdx ? "0 2px 8px rgba(139,92,246,0.35)" : "none",
                transform: i === stepIdx ? "scale(1.1)" : "scale(1)",
                transition: "all 0.25s",
              }}>
                {i < stepIdx ? "✓" : i + 1}
              </div>
              <span style={{
                fontSize: "0.65rem", fontWeight: 700,
                color: i === stepIdx ? "#818cf8" : "#d1d5db",
              }}>{label}</span>
            </div>
            {i < 2 && (
              <div style={{
                width: 36, height: 2, borderRadius: 2, margin: "0 4px", marginBottom: 16,
                background: i < stepIdx ? "#86efac" : "#f3f4f6",
                transition: "background 0.3s",
              }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ background:"#fef2f2", border:"1.5px solid #fca5a5", color:"#dc2626", borderRadius:10, padding:"8px 12px", fontSize:"0.78rem", fontWeight:700, textAlign:"center", marginBottom:12 }}>
          {error}
        </div>
      )}
      {message && (
        <div style={{ background:"#f0fdf4", border:"1.5px solid #86efac", color:"#16a34a", borderRadius:10, padding:"8px 12px", fontSize:"0.78rem", fontWeight:700, textAlign:"center", marginBottom:12 }}>
          {message}
        </div>
      )}

      {/* STEP 1 */}
      {step === "email" && (
        <form onSubmit={handleSendOtp} className="space-y-3">
          <div>
            <label style={labelStyle}>Your Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required placeholder="name@example.com" className="auth-input" />
          </div>
          <div style={{ paddingTop: 4 }}>
            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? "Sending…" : "Send OTP 📨"}
            </button>
          </div>
        </form>
      )}

      {/* STEP 2 */}
      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <p style={{ textAlign:"center", fontSize:"0.78rem", color:"#6b7280", fontWeight:600, margin:0 }}>
            Code sent to <strong style={{ color:"#818cf8" }}>{email}</strong>
          </p>

          {/* OTP boxes */}
          <div style={{ display:"flex", justifyContent:"center", gap:10 }}>
            {otp.map((digit, i) => (
              <input key={i} ref={otpRefs[i]}
                type="text" inputMode="numeric" maxLength={1} value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKey(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                style={{
                  width: 52, height: 56, textAlign:"center",
                  fontSize: "1.5rem", fontWeight: 900,
                  borderRadius: 14,
                  border: digit ? "2px solid #a78bfa" : "2px solid #e5e7eb",
                  background: digit ? "rgba(167,139,250,0.08)" : "rgba(249,250,251,0.9)",
                  color: "#2d2d4a", outline: "none",
                  boxShadow: digit ? "0 0 0 3px rgba(167,139,250,0.15)" : "none",
                  transition: "all 0.15s",
                }}
              />
            ))}
          </div>

          {/* Timer */}
          <p style={{ textAlign:"center", fontSize:"0.75rem", color:"#9ca3af", fontWeight:600, margin:0 }}>
            {!canResend ? (
              <>Expires in{" "}
                <span style={{ fontWeight:800, color: timeLeft < 60 ? "#ef4444" : "#818cf8" }}>
                  {fmt(timeLeft)}
                </span>
              </>
            ) : (
              <>Code expired.{" "}
                <button type="button" onClick={handleResend} disabled={loading}
                  style={{ color:"#818cf8", fontWeight:800, background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  Resend
                </button>
              </>
            )}
          </p>

          <button type="submit" disabled={loading || otp.join("").length !== 4} className="auth-btn">
            {loading ? "Verifying…" : "Verify Code ✅"}
          </button>
        </form>
      )}

      {/* STEP 3 */}
      {step === "newPassword" && (
        <form onSubmit={handleResetPassword} className="space-y-3">
          <p style={{ textAlign:"center", fontSize:"0.78rem", color:"#16a34a", fontWeight:700, margin:0 }}>
            ✅ Identity verified — set your new password
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
          <div style={{ paddingTop: 4 }}>
            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? "Updating…" : "Reset Password 🚀"}
            </button>
          </div>
        </form>
      )}

      <div style={{ marginTop: 20, textAlign:"center", fontSize:"0.78rem", color:"#9ca3af", fontWeight:600 }}>
        Remembered it?{" "}
        <Link to="/login" style={{ color:"#818cf8", fontWeight:700, textDecoration:"none" }}>Sign in</Link>
      </div>
    </AuthLayout>
  );
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 5,
};

export default ForgotPassword;