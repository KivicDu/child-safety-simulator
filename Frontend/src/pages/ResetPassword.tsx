import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import AuthLayout from "../components/AuthLayout";

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      return setError("Passwords do not match.");
    }

    setLoading(true);

    try {
      const response = await axios.put(`/api/auth/resetpassword/${token}`, {
        password,
      });

      if (response.data.success) {
        setMessage("Password reset successful. Redirecting...");
        setTimeout(() => {
          navigate("/login");
        }, 3000);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          "This reset link is invalid or has expired.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="New Password"
      subtitle="Enter your new password"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {error && (
          <div style={{ background:"rgba(220, 38, 38, 0.1)", border:"1px solid rgba(220, 38, 38, 0.3)", color:"#fca5a5", borderRadius:8, padding:"10px 14px", fontSize:"0.85rem", fontWeight:700, textAlign:"center", boxShadow: "inset 0 0 10px rgba(220,38,38,0.05)" }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ background:"rgba(34, 197, 94, 0.1)", border:"1px solid rgba(34, 197, 94, 0.3)", color:"#86efac", borderRadius:8, padding:"10px 14px", fontSize:"0.85rem", fontWeight:700, textAlign:"center", boxShadow: "inset 0 0 10px rgba(34,197,94,0.05)" }}>
            {message}
          </div>
        )}

        <div>
          <label style={labelStyle}>
            New Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="••••••••"
            className="auth-input"
          />
        </div>

        <div>
          <label style={labelStyle}>
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            placeholder="••••••••"
            className="auth-input"
          />
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={loading}
            className="auth-btn"
          >
            {loading ? "UPDATING..." : "RESET PASSWORD"}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 24, textAlign:"center", fontSize:"0.9rem", color:"rgba(245, 230, 200, 0.6)", fontWeight:600 }}>
        Remembered it?{" "}
        <Link
          to="/login"
          style={{ color:"#D4AF37", fontWeight:700, textDecoration:"underline" }}
        >
          Back to Login
        </Link>
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

export default ResetPassword;
