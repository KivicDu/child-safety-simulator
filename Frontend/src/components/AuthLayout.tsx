import React from "react";
import { motion } from "framer-motion"; // Modern transition engine

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  bgVariant?: "night" | "day"; // Supports switching the background mural
}

const AuthLayout = ({ children, title, subtitle, bgVariant = "night" }: AuthLayoutProps) => {
  // Select background based on the variant prop
  const bgImage = bgVariant === "day"
    ? "url('/assets/images/auth-bg-day.png')"
    : "url('/assets/images/auth-bg-sky.png')";

  return (
    <motion.div
      className="auth-root"
      // The 3D Zoom crossfade transition params
      initial={{ opacity: 0, scale: 0.96, filter: "blur(5px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(5px)" }}
      transition={{ duration: 0.8, ease: [0.43, 0.13, 0.23, 0.96] }}
    >
      {/* ── Persistent background — injected dynamically ── */}
      <div className="auth-bg" style={{ backgroundImage: bgImage }} />

      {/* ── Centered scroll/card ── */}
      <div className="auth-card-wrap">
        <div className="auth-card">
          {/* Logo / brand mark */}
          <div className="auth-brand">
            <div className="auth-brand-text">
              <span className="auth-app-name">Child Safety Simulator</span>
              <span className="auth-title">{title}</span>
            </div>
          </div>

          <p className="auth-subtitle">{subtitle}</p>

          {/* Content slot */}
          <div className="auth-content">{children}</div>
        </div>
      </div>

      <style>{`
        /* ── Reset & root ── */
        .auth-root {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: Georgia, 'Times New Roman', serif;
          overflow: hidden;
          /* Ensure scale/zoom effects don't scroll the body */
          width: 100%;
        }

        /* ── Background layer ── */
        .auth-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          background-color: #091024;
          background-size: cover;
          background-position: center;
          transition: background-image 1s ease-in-out;
        }

        /* ── Card wrapper ── */
        .auth-card-wrap {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          padding: 16px;
        }

        /* ── Card ── */
        .auth-card {
          background: #0B132B; /* Solid rich blue */
          border: 1px solid #D4AF37; /* Flat gold border */
          border-radius: 8px; /* Sharper corners */
          padding: 40px 32px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.8); /* Deep shadow */
        }

        /* ── Brand / logo area ── */
        .auth-brand {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 8px;
        }
        .auth-brand-text {
          display: flex;
          flex-direction: column;
        }
        .auth-app-name {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #D4AF37;
          font-family: Georgia, serif;
        }
        .auth-title {
          font-size: 1.8rem;
          font-weight: normal;
          color: #f5e6c8; /* Parchment */
          line-height: 1.2;
          font-family: 'Cinzel Decorative', serif; /* Keep for main title only */
        }

        .auth-subtitle {
          font-size: 0.95rem;
          color: #A0B0C0;
          margin: 0 0 28px 0;
          padding-left: 2px;
        }

        /* ── Content slot ── */
        .auth-content {
          font-family: Georgia, serif;
        }

        /* ── Shared input style for children ── */
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
          font-family: system-ui, -apple-system, sans-serif; /* Max legibility for user input */
        }
        .auth-input::placeholder { color: #4A5B7C; }
        .auth-input:focus {
          border-color: #D4AF37;
        }

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
        .auth-btn:hover:not(:disabled) {
          background: #E5C355;
        }
        .auth-btn:active:not(:disabled) {
          transform: translateY(1px);
        }
        .auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 480px) {
          .auth-card { padding: 28px 24px; border-radius: 8px; }
        }
      `}</style>
    </motion.div>
  );
};

export default AuthLayout;