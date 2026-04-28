import React, { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

const AuthPortal = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isLogin = location.pathname.includes("/login");

  // === LOGIN STATE ===
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // === REGISTER STATE ===
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const response = await axios.post("/api/auth/login", { email: loginEmail, password: loginPassword });
      if (response.data.success) {
        const { user } = response.data;
        localStorage.setItem("user", JSON.stringify(user));
        localStorage.setItem("token", user.token);
        navigate("/simulator");
      } else {
        setLoginError(response.data.error || "Login failed.");
      }
    } catch (err: any) {
      setLoginError(err.response?.data?.error || "Invalid email or password.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");
    if (regPassword !== regConfirm) return setRegError("Passwords do not match!");
    if (regPassword.length < 6) return setRegError("Password must be at least 6 characters!");
    setRegLoading(true);
    try {
      const response = await axios.post("/api/auth/register", {
        name: regName, email: regEmail, password: regPassword, confirmPassword: regConfirm,
      });
      if (response.data.success) {
        const { user } = response.data;
        localStorage.setItem("user", JSON.stringify(user));
        localStorage.setItem("token", user.token);
        navigate("/simulator");
      } else {
        setRegError(response.data.error || "Registration failed.");
      }
    } catch (err: any) {
      setRegError(err.response?.data?.error || "Registration failed. Please try again.");
    } finally {
      setRegLoading(false);
    }
  };

  // Dynamic values
  // When isLogin=true, overlay is on RIGHT (x: "100%"). Register form is under it.
  const overlayX = isLogin ? "100%" : "0%";

  return (
    <div className="portal-root">
      {/* Absolute ambient background for the entire page */}
      <div className="portal-ambient-bg" />

      <div className="portal-container">
        
        {/* === LEFT SIDE: SIGN IN FORM === */}
        <div className={`form-container sign-in-container ${isLogin ? "active" : "inactive"}`}>
          <form onSubmit={handleLogin} className="portal-form">
            <h1 className="portal-title">Child Safety Simulator</h1>
            <p className="portal-subtitle">Welcome Back to the Night Forest</p>
            
            {loginError && <div className="portal-error">{loginError}</div>}
            
            <div className="input-group">
              <label style={labelStyle}>Email</label>
              <input
                type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                required placeholder="name@example.com" className="auth-input"
              />
            </div>
            <div className="input-group">
              <label style={labelStyle}>Password</label>
              <input
                type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
                required placeholder="••••••••" className="auth-input"
              />
            </div>
            <div style={{ width: "100%", textAlign: "right", marginTop: "-8px", marginBottom: "16px" }}>
              <Link to="/forgot-password" className="portal-link-small">Forgot your password?</Link>
            </div>
            
            <button type="submit" disabled={loginLoading} className="auth-btn">
              {loginLoading ? "Signing In..." : "Sign In"}
            </button>
            
            {/* Mobile-only toggle */}
            <div className="mobile-toggle">
              Don't have an account? <Link to="/register" className="portal-link">Sign Up</Link>
            </div>
          </form>
        </div>

        {/* === RIGHT SIDE: SIGN UP FORM === */}
        <div className={`form-container sign-up-container ${!isLogin ? "active" : "inactive"}`}>
          <form onSubmit={handleRegister} className="portal-form">
            <h1 className="portal-title">Child Safety Simulator</h1>
            <p className="portal-subtitle">Join the Daytime Light</p>

            {regError && <div className="portal-error">{regError}</div>}

            <div className="input-group">
              <label style={labelStyle}>Full Name</label>
              <input
                type="text" value={regName} onChange={(e) => setRegName(e.target.value)}
                required placeholder="Your Name" className="auth-input"
              />
            </div>
            <div className="input-group">
              <label style={labelStyle}>Email</label>
              <input
                type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                required placeholder="name@example.com" className="auth-input"
              />
            </div>
            <div className="input-group">
              <label style={labelStyle}>Password</label>
              <input
                type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
                required placeholder="Min 6 chars" className="auth-input"
              />
            </div>
            <div className="input-group">
              <label style={labelStyle}>Confirm Password</label>
              <input
                type="password" value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)}
                required placeholder="••••••••" className="auth-input"
              />
            </div>
            
            <button type="submit" disabled={regLoading} className="auth-btn" style={{ marginTop: 12 }}>
              {regLoading ? "Creating..." : "Create Account"}
            </button>

            {/* Mobile-only toggle */}
            <div className="mobile-toggle">
              Already have an account? <Link to="/login" className="portal-link">Sign In</Link>
            </div>
          </form>
        </div>

        {/* === SLIDING OVERLAY === */}
        <motion.div 
          className="overlay-container"
          initial={false}
          animate={{ x: overlayX }}
          transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }} 
        >
          <div className="overlay-content">
            {/* The backgrounds that crossfade */}
            <div className={`overlay-bg overlay-bg-day ${!isLogin ? "opacity-100" : "opacity-0"}`} />
            <div className={`overlay-bg overlay-bg-night ${isLogin ? "opacity-100" : "opacity-0"}`} />
            
            <AnimatePresence mode="wait">
              {isLogin ? (
                <motion.div 
                  key="login-prompt"
                  className="overlay-panel"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  <h2 className="overlay-title">New to the Forest?</h2>
                  <p className="overlay-desc">Step into the light and begin your safety journey today.</p>
                  <button className="overlay-btn" onClick={() => navigate("/register")}>
                    Sign Up
                  </button>
                </motion.div>
              ) : (
                <motion.div 
                  key="register-prompt"
                  className="overlay-panel"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  <h2 className="overlay-title">Already a Guardian?</h2>
                  <p className="overlay-desc">Return to the magic and continue where you left off.</p>
                  <button className="overlay-btn" onClick={() => navigate("/login")}>
                    Sign In
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

      </div>

      <style>{`
        .portal-root {
          min-height: 100vh;
          width: 100vw;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          background: #091024;
          font-family: Georgia, 'Times New Roman', serif;
          overflow: hidden;
        }

        .portal-ambient-bg {
          position: absolute;
          inset: 0;
          background-image: url('/assets/images/auth-bg-sky.png');
          background-size: cover;
          background-position: center;
          filter: blur(20px) opacity(0.2) saturate(0.5);
          z-index: 0;
        }

        /* Main Window */
        .portal-container {
          background-color: #0B132B;
          border-radius: 12px;
          border: 1px solid #D4AF37;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.8);
          position: relative;
          overflow: hidden;
          width: 900px;
          max-width: 100%;
          min-height: 600px;
          display: flex;
          z-index: 1;
        }

        /* Forms */
        .form-container {
          position: absolute;
          top: 0;
          height: 100%;
          width: 50%;
          transition: all 0.6s ease-in-out;
        }
        .sign-in-container { left: 0; z-index: 2; padding: 0 40px; }
        .sign-up-container { left: 50%; z-index: 2; padding: 0 40px; }

        /* Visually hide inactive form logic to prevent focus stealing */
        .form-container.active { opacity: 1; pointer-events: all; transition-delay: 0.2s; }
        .form-container.inactive { opacity: 0; pointer-events: none; }

        .portal-form {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          height: 100%;
          width: 100%;
          max-width: 340px;
          margin: 0 auto;
        }

        /* Typography */
        .portal-title {
          font-family: 'Cinzel Decorative', serif;
          font-size: 1.8rem;
          color: #f5e6c8;
          margin: 0;
          text-align: center;
        }
        .portal-subtitle {
          font-size: 0.95rem;
          color: #A0B0C0;
          margin: 4px 0 32px 0;
          text-align: center;
        }
        .portal-error {
          width: 100%;
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(220, 38, 38, 0.3);
          color: #fca5a5;
          border-radius: 6px;
          padding: 10px;
          font-size: 0.85rem;
          font-weight: 700;
          text-align: center;
          margin-bottom: 16px;
        }

        /* Inputs */
        .input-group {
          width: 100%;
          margin-bottom: 16px;
          text-align: left;
        }
        .auth-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 4px;
          border: 1px solid #2A3B5C;
          background: #091024;
          font-size: 1rem;
          color: #f5e6c8;
          outline: none;
          transition: border-color 0.2s;
          box-sizing: border-box;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .auth-input::placeholder { color: #4A5B7C; }
        .auth-input:focus { border-color: #D4AF37; }

        /* Buttons */
        .auth-btn {
          width: 100%;
          padding: 14px 20px;
          border-radius: 4px;
          border: none;
          font-size: 1rem;
          font-weight: bold;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: background 0.2s;
          background: #D4AF37;
          color: #091024;
          font-family: Georgia, serif;
          text-transform: uppercase;
        }
        .auth-btn:hover:not(:disabled) { background: #E5C355; }
        .auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .portal-link { color: #D4AF37; font-weight: 700; text-decoration: underline; }
        .portal-link-small { color: #D4AF37; font-weight: 700; text-decoration: underline; font-size: 0.85rem; }

        /* Mobile logic */
        .mobile-toggle { display: none; margin-top: 24px; font-size: 0.9rem; color: #A0B0C0; }

        /* === SLIDING OVERLAY === */
        .overlay-container {
          position: absolute;
          top: 0;
          left: 0;
          width: 50%;
          height: 100%;
          z-index: 10;
        }
        .overlay-content {
          position: relative;
          height: 100%;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          border-left: 1px solid #D4AF37;
          border-right: 1px solid #D4AF37;
          overflow: hidden;
        }
        
        /* Background Images inside overlay */
        .overlay-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          transition: opacity 1s ease-in-out;
          z-index: 0;
        }
        .overlay-bg-day { background-image: url('/assets/images/auth-bg-day.png'); }
        .overlay-bg-night { background-image: url('/assets/images/auth-bg-sky.png'); }

        .opacity-100 { opacity: 1; }
        .opacity-0 { opacity: 0; }

        /* Inner Text Panel for Overlay */
        .overlay-panel {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px;
          color: #f5e6c8;
        }
        .overlay-title {
          font-family: 'Cinzel Decorative', serif;
          font-size: 2rem;
          margin: 0 0 16px 0;
          text-shadow: 0 4px 20px rgba(0,0,0,0.8);
        }
        .overlay-desc {
          font-size: 1.1rem;
          margin: 0 0 32px 0;
          line-height: 1.5;
          text-shadow: 0 2px 10px rgba(0,0,0,0.8);
        }
        .overlay-btn {
          background: transparent;
          border: 2px solid #D4AF37;
          color: #f5e6c8;
          padding: 12px 36px;
          border-radius: 4px;
          font-size: 1rem;
          font-weight: bold;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
          font-family: Georgia, serif;
          letter-spacing: 0.1em;
          backdrop-filter: blur(5px);
        }
        .overlay-btn:hover {
          background: rgba(212, 175, 55, 0.2);
          box-shadow: 0 0 15px rgba(212, 175, 55, 0.3);
        }

        /* Responsiveness for small screens */
        @media (max-width: 768px) {
          .portal-container {
            width: 90%;
            height: auto;
            min-height: 500px;
            flex-direction: column;
          }
          .form-container { width: 100%; position: relative; left: 0 !important; padding: 30px; }
          .overlay-container { display: none; } /* Hide the slider entirely on small phones */
          .form-container.inactive { display: none; } /* Hide inactive form forcefully on phones */
          .mobile-toggle { display: block; }
        }
      `}</style>
    </div>
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

export default AuthPortal;
