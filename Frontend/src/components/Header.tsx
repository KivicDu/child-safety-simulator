import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
    navigate("/login");
  };

  const navLinks = [
    { label: "Home", path: "/" },
    { label: "Simulator", path: "/simulator" },
    { label: "Safety Tips", path: "/safety-tips" },
  ];

  const isActive = (path: string) => location.pathname === path;

  /* ── Inline style objects so we never lose pointer-events ── */
  const glassStyle: React.CSSProperties = {
    /*
      Liquid glass recipe:
      - backdrop-filter blur + saturate: makes background colours bleed through
        in a distorted, tinted way — the "liquid" effect
      - very low background white (0.10–0.20): keeps it mostly transparent
      - top highlight inset shadow simulates the glass surface refraction
      - border at ~rgba(255,255,255,0.30) looks like a glass edge
    */
    backdropFilter: scrolled
      ? "blur(18px) saturate(200%) brightness(1.06)"
      : "blur(6px) saturate(140%)",
    WebkitBackdropFilter: scrolled
      ? "blur(18px) saturate(200%) brightness(1.06)"
      : "blur(6px) saturate(140%)",
    background: scrolled
      ? "rgba(255, 255, 255, 0.18)"   /* stays mostly transparent even when scrolled */
      : "rgba(255, 255, 255, 0.06)",
    border: scrolled
      ? "1px solid rgba(255, 255, 255, 0.40)"
      : "1px solid rgba(255, 255, 255, 0.20)",
    boxShadow: scrolled
      ? [
          "inset 0 1.5px 0 rgba(255,255,255,0.70)",  /* top sheen — key glass cue */
          "inset 0 -1px 0 rgba(255,255,255,0.12)",
          "0 8px 32px rgba(0,0,0,0.08)",
          "0 1px 3px rgba(0,0,0,0.04)",
        ].join(", ")
      : "inset 0 1px 0 rgba(255,255,255,0.40)",
    transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
    borderRadius: "1rem",
    overflow: "hidden",
  };

  const dropdownStyle: React.CSSProperties = {
    backdropFilter: "blur(24px) saturate(220%) brightness(1.08)",
    WebkitBackdropFilter: "blur(24px) saturate(220%) brightness(1.08)",
    background: "rgba(255, 255, 255, 0.22)",
    border: "1px solid rgba(255,255,255,0.45)",
    boxShadow: [
      "inset 0 1.5px 0 rgba(255,255,255,0.75)",
      "0 20px 50px rgba(0,0,0,0.10)",
    ].join(", "),
    borderRadius: "1rem",
    overflow: "hidden",
  };

  return (
    <motion.nav
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      /* z-[60]: above DraggableAsset z-30 and hero z-20 — always receives clicks */
      style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 60, pointerEvents: "auto" }}
    >
      {/* ── Glass Pill ────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 12px 0" }}>
        <div style={glassStyle}>

          {/* Prismatic top-edge refraction line — liquid glass signature */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0,
              height: "1px",
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,210,255,0.8) 20%, rgba(210,235,255,0.8) 50%, rgba(210,255,230,0.8) 80%, transparent 100%)",
              opacity: scrolled ? 1 : 0.5,
              transition: "opacity 0.4s",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              maxWidth: "80rem",
              margin: "0 auto",
              padding: "0 2rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              height: "50px",
            }}
          >
            {/* Logo */}
            <button
              onClick={() => navigate("/")}
              style={{ pointerEvents: "auto", cursor: "pointer", background: "none", border: "none", display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: "linear-gradient(135deg, #f472b6, #f43f5e)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(244,63,94,0.35)",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
                <span style={{ fontWeight: 800, fontSize: "13px", letterSpacing: "-0.02em", color: "#1e293b" }}>SafeHome</span>
                <span style={{ fontWeight: 700, fontSize: "9px", letterSpacing: "0.18em", color: "#ec4899", textTransform: "uppercase" }}>3D Sim</span>
              </div>
            </button>

            {/* Desktop Nav */}
            <div className="hidden md:flex" style={{ alignItems: "center", gap: "2px" }}>
              {navLinks.map((link) => (
                <div key={link.path} style={{ position: "relative" }}>
                  <button
                    onClick={() => navigate(link.path)}
                    style={{
                      pointerEvents: "auto",
                      cursor: "pointer",
                      position: "relative",
                      padding: "6px 14px",
                      borderRadius: "10px",
                      fontSize: "13.5px",
                      fontWeight: 600,
                      color: isActive(link.path) ? "#db2777" : "#475569",
                      background: "none",
                      border: "none",
                      transition: "color 0.2s",
                      zIndex: 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive(link.path)) (e.currentTarget as HTMLButtonElement).style.color = "#1e293b";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive(link.path)) (e.currentTarget as HTMLButtonElement).style.color = "#475569";
                    }}
                  >
                    {link.label}
                    {isActive(link.path) && (
                      <motion.div
                        layoutId="glass-nav-pill"
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: "10px",
                          zIndex: -1,
                          background: "rgba(255,255,255,0.55)",
                          backdropFilter: "blur(4px)",
                          border: "1px solid rgba(255,180,200,0.40)",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
                        }}
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Auth Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {user ? (
                <div className="hidden md:flex" style={{ alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Hey, {user.name}</span>
                  <button
                    onClick={handleLogout}
                    style={{ pointerEvents: "auto", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "#94a3b8", background: "none", border: "none", transition: "color 0.2s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#f43f5e")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="hidden md:flex" style={{ alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={() => navigate("/login")}
                    style={{
                      pointerEvents: "auto", cursor: "pointer",
                      padding: "6px 14px", borderRadius: "10px",
                      fontSize: "13px", fontWeight: 600, color: "#475569",
                      background: "none", border: "none", transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#1e293b"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.45)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#475569"; (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                  >
                    Sign in
                  </button>
                  <button
                    onClick={() => navigate("/register")}
                    style={{
                      pointerEvents: "auto", cursor: "pointer",
                      padding: "6px 18px", borderRadius: "10px",
                      fontSize: "13px", fontWeight: 600, color: "white",
                      background: "rgba(15,23,42,0.80)",
                      backdropFilter: "blur(4px)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      display: "flex", alignItems: "center", gap: "5px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = "rgba(15,23,42,0.95)"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = "rgba(15,23,42,0.80)"}
                  >
                    Get Started
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              )}

              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden"
                style={{
                  pointerEvents: "auto", cursor: "pointer",
                  width: 32, height: 32, borderRadius: 10,
                  background: "rgba(255,255,255,0.45)",
                  backdropFilter: "blur(4px)",
                  border: "1px solid rgba(255,255,255,0.50)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#475569",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {mobileOpen
                    ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                    : <><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="18" x2="20" y2="18"/></>
                  }
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Dropdown */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            style={{ ...dropdownStyle, margin: "6px 12px 0", pointerEvents: "auto" }}
          >
            <div style={{ padding: "10px 10px 6px" }}>
              {navLinks.map((link) => (
                <button
                  key={link.path}
                  onClick={() => { navigate(link.path); setMobileOpen(false); }}
                  style={{
                    pointerEvents: "auto", cursor: "pointer", display: "block", width: "100%",
                    textAlign: "left", padding: "10px 14px", borderRadius: "10px",
                    fontSize: "14px", fontWeight: 600, border: "none",
                    color: isActive(link.path) ? "#db2777" : "#475569",
                    background: isActive(link.path) ? "rgba(252,231,243,0.80)" : "transparent",
                    marginBottom: 2, transition: "all 0.15s",
                  }}
                >
                  {link.label}
                </button>
              ))}
            </div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.40)", padding: "10px" }}>
              {user ? (
                <div style={{ padding: "4px 8px" }}>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: 6 }}>
                    Signed in as <strong style={{ color: "#334155" }}>{user.name}</strong>
                  </div>
                  <button onClick={handleLogout} style={{ pointerEvents: "auto", cursor: "pointer", fontSize: "13px", fontWeight: 700, color: "#f43f5e", background: "none", border: "none" }}>Sign out</button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button onClick={() => { navigate("/login"); setMobileOpen(false); }} style={{ pointerEvents: "auto", cursor: "pointer", width: "100%", padding: "10px", fontSize: "13px", fontWeight: 600, color: "#334155", background: "rgba(255,255,255,0.50)", border: "none", borderRadius: 10 }}>Sign in</button>
                  <button onClick={() => { navigate("/register"); setMobileOpen(false); }} style={{ pointerEvents: "auto", cursor: "pointer", width: "100%", padding: "10px", fontSize: "13px", fontWeight: 600, color: "white", background: "#0f172a", border: "none", borderRadius: 10 }}>Get Started</button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default Header;