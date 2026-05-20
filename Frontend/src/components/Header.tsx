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
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, [location]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
    navigate("/login");
  };

  const navLinks = [
    { label: "Home", path: "/" },
    { label: "Simulation", path: "/simulator" },
    { label: "Safety Tips", path: "/safety-tips" },
    { label: "About Us", path: "/about" },
  ];

  const isActive = (path: string) => location.pathname === path;
  const isHome = location.pathname === "/";
  const isTransparent = isHome && !scrolled;

  const colors = {
    royalNight: "rgba(10, 15, 30, 0.7)",
    stardustGold: "#FFE4A0",
    iceWhite: "#FDFDFD",
  };

  const headerStyle: React.CSSProperties = {
    background: isTransparent ? "transparent" : colors.royalNight,
    backdropFilter: isTransparent ? "none" : "blur(16px)",
    WebkitBackdropFilter: isTransparent ? "none" : "blur(16px)",
    borderBottom: isTransparent
      ? "1px solid transparent"
      : `1px solid rgba(255, 228, 160, 0.25)`,
    boxShadow: isTransparent
      ? "none"
      : "0 10px 30px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.15)",
    transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
  };

  return (
    <>
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          ...headerStyle,
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 24px",
            height: 68,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo */}
          <button
            onClick={() => navigate("/")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 0,
            }}
          >
            <span
              style={{
                fontSize: "1.1rem",
                color: colors.stardustGold,
                textShadow: `0 0 12px rgba(255, 228, 160, 0.5)`,
                fontFamily: "'Cinzel Decorative', Georgia, serif",
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              SafeSteps
            </span>
          </button>

          {/* Desktop nav */}
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
            className="desktop-nav"
          >
            {navLinks.map((link) => {
              const active = isActive(link.path);
              return (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  style={{
                    background: active ? "rgba(255, 228, 160, 0.1)" : "none",
                    border: active
                      ? "1px solid rgba(255, 228, 160, 0.3)"
                      : "1px solid transparent",
                    borderRadius: 8,
                    padding: "7px 16px",
                    cursor: "pointer",
                    color: active
                      ? colors.stardustGold
                      : "rgba(255, 248, 230, 0.7)",
                    fontSize: "0.82rem",
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontWeight: active ? 700 : 400,
                    letterSpacing: "0.04em",
                    transition: "all 0.3s ease",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.color = colors.stardustGold;
                      e.currentTarget.style.background =
                        "rgba(255, 228, 160, 0.06)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.color = "rgba(255, 248, 230, 0.7)";
                      e.currentTarget.style.background = "none";
                    }
                  }}
                >
                  {link.label}
                </button>
              );
            })}

            {/* Divider */}
            <div
              style={{
                width: 1,
                height: 20,
                background: "rgba(255, 228, 160, 0.2)",
                margin: "0 6px",
              }}
            />

            {/* Auth */}
            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: "0.8rem",
                    color: "rgba(255, 248, 230, 0.5)",
                    fontFamily: "Georgia, serif",
                    fontStyle: "italic",
                  }}
                >
                  {user.name}
                </span>
                <button
                  onClick={handleLogout}
                  style={{
                    background: "none",
                    border: "1px solid rgba(255, 228, 160, 0.2)",
                    borderRadius: 8,
                    padding: "7px 14px",
                    cursor: "pointer",
                    color: "rgba(255, 248, 230, 0.5)",
                    fontSize: "0.78rem",
                    fontFamily: "Georgia, serif",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#ff6b6b";
                    e.currentTarget.style.borderColor = "rgba(255,107,107,0.4)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "rgba(255, 248, 230, 0.5)";
                    e.currentTarget.style.borderColor =
                      "rgba(255, 228, 160, 0.2)";
                  }}
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate("/login")}
                style={{
                  background: "linear-gradient(135deg, #D4AF37, #b8972e)",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 18px",
                  cursor: "pointer",
                  color: "#050d1e",
                  fontSize: "0.82rem",
                  fontFamily: "Georgia, serif",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  transition: "all 0.2s",
                  boxShadow: "0 2px 12px rgba(212,175,55,0.25)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 20px rgba(212,175,55,0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 2px 12px rgba(212,175,55,0.25)";
                }}
              >
                Sign In
              </button>
            )}
          </nav>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{
              display: "none",
              background: "none",
              border: "1px solid rgba(255,228,160,0.2)",
              borderRadius: 8,
              padding: "8px 10px",
              cursor: "pointer",
              color: colors.stardustGold,
              fontSize: "1.1rem",
              lineHeight: 1,
            }}
            className="mobile-menu-btn"
            aria-label="Menu"
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>

        {/* Mobile dropdown */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{
                overflow: "hidden",
                background: "rgba(6, 13, 30, 0.98)",
                borderTop: "1px solid rgba(255,228,160,0.15)",
                backdropFilter: "blur(20px)",
              }}
            >
              <div
                style={{
                  padding: "12px 24px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {navLinks.map((link) => {
                  const active = isActive(link.path);
                  return (
                    <button
                      key={link.path}
                      onClick={() => {
                        navigate(link.path);
                        setMobileOpen(false);
                      }}
                      style={{
                        background: active ? "rgba(255,228,160,0.08)" : "none",
                        border: "none",
                        borderRadius: 8,
                        padding: "12px 16px",
                        cursor: "pointer",
                        color: active
                          ? colors.stardustGold
                          : "rgba(255,248,230,0.7)",
                        fontSize: "0.95rem",
                        fontFamily: "Georgia, serif",
                        fontWeight: active ? 700 : 400,
                        textAlign: "left",
                        letterSpacing: "0.03em",
                      }}
                    >
                      {link.label}
                    </button>
                  );
                })}
                <div
                  style={{
                    height: 1,
                    background: "rgba(255,228,160,0.1)",
                    margin: "8px 0",
                  }}
                />
                {user ? (
                  <button
                    onClick={() => {
                      handleLogout();
                      setMobileOpen(false);
                    }}
                    style={{
                      background: "none",
                      border: "1px solid rgba(255,107,107,0.3)",
                      borderRadius: 8,
                      padding: "12px 16px",
                      cursor: "pointer",
                      color: "#ff6b6b",
                      fontSize: "0.9rem",
                      fontFamily: "Georgia, serif",
                      textAlign: "left",
                    }}
                  >
                    Logout ({user.name})
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      navigate("/login");
                      setMobileOpen(false);
                    }}
                    style={{
                      background: "linear-gradient(135deg, #D4AF37, #b8972e)",
                      border: "none",
                      borderRadius: 8,
                      padding: "12px 16px",
                      cursor: "pointer",
                      color: "#050d1e",
                      fontSize: "0.9rem",
                      fontFamily: "Georgia, serif",
                      fontWeight: 700,
                    }}
                  >
                    Sign In
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
        @media (min-width: 769px) {
          .mobile-menu-btn { display: none !important; }
        }
      `}</style>
    </>
  );
};

export default Header;
