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

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
    navigate("/login");
  };

  const navLinks = [
    { label: "Prologue", path: "/" },
    { label: "The Magic Box", path: "/simulator" },
    { label: "Blueprint", path: "/test-lab" },
    { label: "Grimoire", path: "/safety-tips" },
  ];

  const isActive = (path: string) => location.pathname === path;
  const isHome = location.pathname === "/";
  const isTransparent = isHome && !scrolled;

  // 90s/00s Disney Princess / Classic Fairytale Palette
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
    <motion.nav
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 1.2, ease: "easeOut" }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        pointerEvents: "auto",
        ...headerStyle,
      }}
    >
      <div
        style={{
          maxWidth: "75rem",
          margin: "0 auto",
          padding: "0 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          height: "64px",
        }}
      >
        <button
          onClick={() => navigate("/")}
          style={{
            pointerEvents: "auto",
            cursor: "pointer",
            background: "none",
            border: "none",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span
            style={{
              fontFamily: "'Cinzel Decorative', 'Georgia', serif",
              fontSize: "24px",
              fontWeight: 700,
              color: colors.stardustGold,
              textShadow: "0 0 12px rgba(255, 228, 160, 0.7)",
              letterSpacing: "1px",
              marginTop: "2px",
            }}
          >
            SafeSteps
          </span>
        </button>

        <div
          className="hidden md:flex"
          style={{
            alignItems: "center",
            gap: "36px",
            transform: "translateY(2px)",
          }}
        >
          {navLinks.map((link) => (
            <div key={link.path} style={{ position: "relative" }}>
              <button
                onClick={() => navigate(link.path)}
                style={{
                  pointerEvents: "auto",
                  cursor: "pointer",
                  position: "relative",
                  padding: "4px 8px",
                  fontSize: "17px",
                  fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                  fontStyle: "italic",
                  fontWeight: 600,
                  letterSpacing: "0.5px",
                  color: isActive(link.path)
                    ? colors.stardustGold
                    : colors.iceWhite,
                  background: "none",
                  border: "none",
                  transition: "color 0.5s ease, text-shadow 0.5s ease",
                  textShadow: isActive(link.path)
                    ? "0 0 10px rgba(255,228,160,0.6)"
                    : "none",
                  opacity: isActive(link.path) ? 1 : 0.85,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = colors.stardustGold;
                  e.currentTarget.style.textShadow =
                    "0 0 10px rgba(255,228,160,0.6)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isActive(link.path)
                    ? colors.stardustGold
                    : colors.iceWhite;
                  e.currentTarget.style.textShadow = isActive(link.path)
                    ? "0 0 10px rgba(255,228,160,0.6)"
                    : "none";
                }}
              >
                {link.label}
                {isActive(link.path) && (
                  <motion.div
                    layoutId="storybook-sparkle"
                    style={{
                      position: "absolute",
                      bottom: "-2px",
                      left: "10%",
                      right: "10%",
                      height: "1px",
                      background:
                        "linear-gradient(90deg, transparent, rgba(255,228,160,0.9), transparent)",
                      boxShadow: "0 0 8px rgba(255,228,160,0.3)",
                    }}
                    animate={{
                      opacity: [0.7, 1, 0.7],
                    }}
                    transition={{
                      layout: { type: "spring", stiffness: 200, damping: 25 },
                      opacity: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
                    }}
                  />
                )}
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {user ? (
            <div
              className="hidden md:flex"
              style={{ alignItems: "center", gap: "16px" }}
            >
              <span
                style={{
                  fontSize: "16px",
                  fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                  fontStyle: "italic",
                  color: colors.iceWhite,
                  opacity: 0.9,
                }}
              >
                Welcome,{" "}
                <span style={{ color: colors.stardustGold, fontWeight: 700 }}>
                  {user.name}
                </span>
              </span>
              <button
                onClick={handleLogout}
                style={{
                  pointerEvents: "auto",
                  cursor: "pointer",
                  fontSize: "16px",
                  fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                  fontStyle: "italic",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.7)",
                  background: "none",
                  border: "none",
                  transition: "color 0.3s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = colors.iceWhite)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "rgba(255,255,255,0.7)")
                }
              >
                Depart
              </button>
            </div>
          ) : (
            <div
              className="hidden md:flex"
              style={{ alignItems: "center", gap: "20px" }}
            >
              <button
                onClick={() => navigate("/login")}
                style={{
                  pointerEvents: "auto",
                  cursor: "pointer",
                  fontSize: "16px",
                  fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                  fontStyle: "italic",
                  fontWeight: 700,
                  color: colors.iceWhite,
                  background: "none",
                  border: "none",
                  opacity: 0.85,
                  transition: "all 0.3s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "1";
                  e.currentTarget.style.color = colors.stardustGold;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "0.85";
                  e.currentTarget.style.color = colors.iceWhite;
                }}
              >
                Sign In
              </button>

              <button
                onClick={() => navigate("/simulator")}
                style={{
                  pointerEvents: "auto",
                  cursor: "pointer",
                  padding: "8px 22px",
                  borderRadius: "24px",
                  fontSize: "14px",
                  fontFamily: "'Cinzel Decorative', 'Georgia', serif",
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  color: "#3A2B00",
                  background: `linear-gradient(135deg, #FFF4D2 0%, #D4AF37 100%)`,
                  border: "1px solid #FFE4A0",
                  boxShadow:
                    "0 4px 15px rgba(212, 175, 55, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.7)",
                  transition: "all 0.4s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform =
                    "translateY(-1px) scale(1.02)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 20px rgba(212, 175, 55, 0.6), inset 0 2px 6px rgba(255, 255, 255, 0.9)";
                  e.currentTarget.style.filter = "brightness(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0) scale(1)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 15px rgba(212, 175, 55, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.7)";
                  e.currentTarget.style.filter = "brightness(1)";
                }}
              >
                Begin Journey
              </button>
            </div>
          )}

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden"
            style={{
              pointerEvents: "auto",
              cursor: "pointer",
              width: 32,
              height: 32,
              background: "transparent",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: colors.stardustGold,
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {mobileOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <path d="M4 12h16M4 6h16M4 18h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              background: colors.royalNight,
              borderTop: `1px solid rgba(255, 228, 160, 0.2)`,
              overflow: "hidden",
              pointerEvents: "auto",
              backdropFilter: "blur(16px)",
            }}
          >
            <div style={{ padding: "16px 2rem" }}>
              {navLinks.map((link) => (
                <button
                  key={link.path}
                  onClick={() => {
                    navigate(link.path);
                    setMobileOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 0",
                    fontSize: "18px",
                    fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                    fontStyle: "italic",
                    color: isActive(link.path)
                      ? colors.stardustGold
                      : colors.iceWhite,
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  {link.label}
                </button>
              ))}

              <div style={{ marginTop: "24px", paddingBottom: "16px" }}>
                {user ? (
                  <div>
                    <div
                      style={{
                        fontSize: "16px",
                        fontFamily: "'Cormorant Garamond', serif",
                        fontStyle: "italic",
                        color: colors.iceWhite,
                        marginBottom: 12,
                      }}
                    >
                      Welcome,{" "}
                      <strong
                        style={{
                          color: colors.stardustGold,
                          fontStyle: "normal",
                        }}
                      >
                        {user.name}
                      </strong>
                    </div>
                    <button
                      onClick={handleLogout}
                      style={{
                        fontSize: "16px",
                        fontFamily: "'Cormorant Garamond', serif",
                        fontStyle: "italic",
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.7)",
                        background: "none",
                        border: "none",
                        padding: 0,
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                    }}
                  >
                    <button
                      onClick={() => {
                        navigate("/simulator");
                        setMobileOpen(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "12px",
                        fontSize: "16px",
                        fontWeight: 700,
                        color: "#3A2B00",
                        background: `linear-gradient(135deg, #FFF4D2 0%, #D4AF37 100%)`,
                        border: "1px solid #FFE4A0",
                        borderRadius: "24px",
                        fontFamily: "'Cinzel Decorative', serif",
                        letterSpacing: "1px",
                      }}
                    >
                      Begin Journey
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default Header;
 