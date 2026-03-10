import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import AuthLayout from "../components/AuthLayout";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await axios.post("/api/auth/login", { email, password });

      if (response.data.success) {
        const { user } = response.data;
        localStorage.setItem("user", JSON.stringify(user));
        localStorage.setItem("token", user.token);
        navigate("/simulator");
      } else {
        setError(response.data.error || "Login failed");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your account" icon="👋">
      <form onSubmit={handleLogin} className="space-y-3">
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
            placeholder="••••••••"
            className="auth-input"
          />
        </div>

        <div style={{ textAlign: "right", marginTop: -4 }}>
          <Link to="/forgot-password" style={linkSmallStyle}>
            Forgot password?
          </Link>
        </div>

        <div style={{ paddingTop: 4 }}>
          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? "Signing in…" : "Sign In ✨"}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 20, textAlign: "center", fontSize: "0.78rem", color: "#9ca3af", fontWeight: 600 }}>
        Don't have an account?{" "}
        <Link to="/register" style={linkStyle}>Create one</Link>
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

const linkSmallStyle: React.CSSProperties = {
  ...linkStyle,
  fontSize: "0.75rem",
};

export default Login;