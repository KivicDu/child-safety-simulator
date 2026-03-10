import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import AuthLayout from "../components/AuthLayout";

const Register = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match!");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters!");
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post("/api/auth/register", {
        name,
        email,
        password,
        confirmPassword,
      });

      if (response.data.success) {
        const { user } = response.data;
        localStorage.setItem("user", JSON.stringify(user));
        localStorage.setItem("token", user.token);
        navigate("/simulator");
      } else {
        setError(response.data.error || "Registration failed");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create account" subtitle="Join Child Safety Simulator for free" icon="✨">
      <form onSubmit={handleRegister} className="space-y-3">
        {error && (
          <div style={{
            background: "#fef2f2",
            border: "1.5px solid #fca5a5",
            color: "#dc2626",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: "0.78rem",
            fontWeight: 700,
            textAlign: "center",
          }}>
            {error}
          </div>
        )}

        <div>
          <label style={labelStyle}>Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Your name"
            className="auth-input"
          />
        </div>

        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="name@example.com"
            className="auth-input"
          />
        </div>

        <div>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Min 6 characters"
            className="auth-input"
          />
        </div>

        <div>
          <label style={labelStyle}>Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="auth-input"
          />
        </div>

        <div style={{ paddingTop: 4 }}>
          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? "Creating account…" : "Create Account 🌟"}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 20, textAlign: "center", fontSize: "0.78rem", color: "#9ca3af", fontWeight: 600 }}>
        Already have an account?{" "}
        <Link to="/login" style={linkStyle}>Sign in</Link>
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

const linkStyle: React.CSSProperties = {
  color: "#818cf8",
  fontWeight: 700,
  textDecoration: "none",
};

export default Register;