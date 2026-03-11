import React from "react";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  icon: string;
}

const AuthLayout = ({ children, title, subtitle, icon }: AuthLayoutProps) => {
  return (
    <div className="auth-root">
      {/* ── Persistent background — never changes between pages ── */}
      <div className="auth-bg">
        {/* Gradient mesh */}
        <div className="mesh mesh-1" />
        <div className="mesh mesh-2" />
        <div className="mesh mesh-3" />

        {/* Floating blobs */}
        <div className="blob blob-a">🌸</div>
        <div className="blob blob-b">⭐</div>
        <div className="blob blob-c">🌙</div>
        <div className="blob blob-d">🌿</div>
        <div className="blob blob-e">✨</div>
        <div className="blob blob-f">🍀</div>

        {/* Dot grid overlay */}
        <div className="dot-grid" />
      </div>

      {/* ── Centered card ── */}
      <div className="auth-card-wrap">
        <div className="auth-card">
          {/* Logo / brand mark */}
          <div className="auth-brand">
            <div className="auth-icon-ring">
              <span className="auth-icon">{icon}</span>
            </div>
            <div className="auth-brand-text">
              <span className="auth-app-name">Child Safety Simulator</span>
              <span className="auth-title">{title}</span>
            </div>
          </div>

          <p className="auth-subtitle">{subtitle}</p>

          {/* Content slot — only this part changes */}
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
          font-family: 'Nunito', 'Quicksand', system-ui, sans-serif;
          overflow: hidden;
        }

        /* ── Background layer ── */
        .auth-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          background: linear-gradient(135deg, #fdf6ff 0%, #f0f7ff 40%, #fff0f8 100%);
        }

        /* Gradient meshes */
        .mesh {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.35;
        }
        .mesh-1 {
          width: 560px; height: 560px;
          background: radial-gradient(circle, #c7d2fe, #e0e7ff);
          top: -120px; left: -120px;
          animation: driftA 18s ease-in-out infinite;
        }
        .mesh-2 {
          width: 480px; height: 480px;
          background: radial-gradient(circle, #fce7f3, #fbcfe8);
          bottom: -80px; right: -80px;
          animation: driftB 22s ease-in-out infinite;
        }
        .mesh-3 {
          width: 360px; height: 360px;
          background: radial-gradient(circle, #d1fae5, #a7f3d0);
          top: 45%; left: 55%;
          animation: driftC 26s ease-in-out infinite;
        }

        @keyframes driftA {
          0%, 100% { transform: translate(0,0); }
          50%       { transform: translate(60px, 40px); }
        }
        @keyframes driftB {
          0%, 100% { transform: translate(0,0); }
          50%       { transform: translate(-50px, -30px); }
        }
        @keyframes driftC {
          0%, 100% { transform: translate(-50%,-50%); }
          33%       { transform: translate(calc(-50% + 40px), calc(-50% - 30px)); }
          66%       { transform: translate(calc(-50% - 30px), calc(-50% + 40px)); }
        }

        /* Dot grid */
        .dot-grid {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, #c4b5fd44 1px, transparent 1px);
          background-size: 28px 28px;
        }

        /* Floating emoji blobs */
        .blob {
          position: absolute;
          font-size: 1.6rem;
          opacity: 0.18;
          pointer-events: none;
          user-select: none;
        }
        .blob-a { top: 8%;  left: 6%;  animation: float1 7s ease-in-out infinite; }
        .blob-b { top: 15%; right: 8%; animation: float2 9s ease-in-out infinite; font-size: 1.2rem; }
        .blob-c { top: 60%; left: 4%; animation: float3 11s ease-in-out infinite; }
        .blob-d { bottom: 12%; left: 12%; animation: float1 8s ease-in-out infinite reverse; font-size: 1.4rem; }
        .blob-e { bottom: 20%; right: 6%; animation: float2 6s ease-in-out infinite; font-size: 1rem; }
        .blob-f { top: 40%; right: 5%; animation: float3 10s ease-in-out infinite; font-size: 1.3rem; }

        @keyframes float1 {
          0%, 100% { transform: translateY(0)   rotate(0deg); }
          50%       { transform: translateY(-14px) rotate(8deg); }
        }
        @keyframes float2 {
          0%, 100% { transform: translateY(0)  rotate(0deg); }
          50%       { transform: translateY(10px) rotate(-6deg); }
        }
        @keyframes float3 {
          0%, 100% { transform: translateY(0)   rotate(0deg); }
          33%       { transform: translateY(-8px) rotate(4deg); }
          66%       { transform: translateY(6px)  rotate(-4deg); }
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
          background: rgba(255, 255, 255, 0.72);
          backdrop-filter: blur(20px) saturate(1.4);
          -webkit-backdrop-filter: blur(20px) saturate(1.4);
          border: 1.5px solid rgba(255,255,255,0.85);
          border-radius: 24px;
          padding: 32px 28px;
          box-shadow:
            0 4px 24px rgba(139, 92, 246, 0.08),
            0 1px 2px rgba(0,0,0,0.04),
            inset 0 1px 0 rgba(255,255,255,0.9);
        }

        /* ── Brand / logo area ── */
        .auth-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 4px;
        }
        .auth-icon-ring {
          width: 48px; height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, #e0e7ff, #fce7f3);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.5rem;
          box-shadow: 0 2px 8px rgba(139,92,246,0.15);
          flex-shrink: 0;
        }
        .auth-brand-text {
          display: flex;
          flex-direction: column;
        }
        .auth-app-name {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #a78bfa;
        }
        .auth-title {
          font-size: 1.35rem;
          font-weight: 800;
          color: #2d2d4a;
          line-height: 1.2;
        }

        .auth-subtitle {
          font-size: 0.78rem;
          color: #9ca3af;
          font-weight: 600;
          margin: 0 0 20px 0;
          padding-left: 2px;
        }

        /* ── Content slot ── */
        .auth-content {
          /* transitions only for content, not the whole page */
        }

        /* ── Shared input style for children ── */
        .auth-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 12px;
          border: 1.5px solid #e5e7eb;
          background: rgba(249,250,251,0.8);
          font-size: 0.875rem;
          font-weight: 600;
          color: #374151;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }
        .auth-input::placeholder { color: #d1d5db; font-weight: 500; }
        .auth-input:focus {
          border-color: #a78bfa;
          box-shadow: 0 0 0 3px rgba(167,139,250,0.15);
          background: white;
        }

        .auth-btn {
          width: 100%;
          padding: 11px 20px;
          border-radius: 14px;
          border: none;
          font-size: 0.9rem;
          font-weight: 800;
          letter-spacing: 0.03em;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
          background: linear-gradient(135deg, #818cf8, #a78bfa, #f472b6);
          color: white;
          box-shadow: 0 4px 12px rgba(139,92,246,0.25), 0 2px 0 rgba(0,0,0,0.08);
        }
        .auth-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(139,92,246,0.3);
        }
        .auth-btn:active:not(:disabled) {
          transform: translateY(1px);
          box-shadow: 0 2px 6px rgba(139,92,246,0.2);
        }
        .auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 480px) {
          .auth-card { padding: 24px 18px; border-radius: 20px; }
        }
      `}</style>
    </div>
  );
};

export default AuthLayout;