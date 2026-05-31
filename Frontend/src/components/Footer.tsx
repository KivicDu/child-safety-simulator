import { useNavigate } from "react-router-dom";

const Footer = () => {
  const navigate = useNavigate();

  const C = {
    bg: "#060d1e",
    gold: "#D4AF37",
    goldLight: "#FFE4A0",
    white: "#FDFDFD",
    muted: "#5a6a7a",
    border: "rgba(212,175,55,0.15)",
  };

  // Mirror the same nav structure as Header
  const navLinks = [
    { label: "Home", path: "/" },
    { label: "Simulator", path: "/simulator" },
    { label: "Safety Tips", path: "/safety-tips" },
    { label: "Test Lab", path: "/test-lab" },
    { label: "Our Story", path: "/about" },
  ];

  return (
    <footer style={{ background: C.bg, borderTop: `1px solid ${C.border}`, fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 24px 32px" }}>

        {/* Top row */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 40, marginBottom: 48 }}>

          {/* Brand */}
          <div style={{ maxWidth: 280 }}>
            <div style={{
              fontSize: "1.3rem", fontWeight: 700, color: C.goldLight,
              fontFamily: "'Cinzel Decorative', Georgia, serif",
              letterSpacing: "0.05em", marginBottom: 14,
            }}>
              SafeSteps
            </div>
            <p style={{ fontSize: "0.85rem", color: C.muted, lineHeight: 1.7, margin: 0 }}>
              Physics-based child safety simulation for home interiors. Upload your 3D model and find hazards before they find your child.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <div style={{
              fontSize: "0.7rem", fontWeight: 700, color: C.gold,
              textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 16,
            }}>
              Navigation
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {navLinks.map(link => (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  style={{
                    background: "none", border: "none", padding: 0,
                    color: C.muted, cursor: "pointer", fontSize: "0.88rem",
                    fontFamily: "Georgia, serif", textAlign: "left",
                    transition: "color 0.2s",
                    letterSpacing: "0.02em",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.goldLight)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>

          {/* Built on research */}
          <div style={{ maxWidth: 220 }}>
            <div style={{
              fontSize: "0.7rem", fontWeight: 700, color: C.gold,
              textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 16,
            }}>
              Built On Research
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["WHO Child Safety 2023", "NHTSA HIC Biomechanics", "AAP Pediatrics Vol.150", "The Lancet Child Health"].map(src => (
                <div key={src} style={{ fontSize: "0.8rem", color: C.muted, display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ color: C.gold, fontSize: "0.6rem" }}>✦</span>
                  {src}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: C.border, marginBottom: 24 }} />

        {/* Bottom row */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={{ fontSize: "0.78rem", color: C.muted, margin: 0 }}>
            &copy; 2026 SafeSteps. An undergraduate research project in child safety simulation.
          </p>
          <p style={{ fontSize: "0.78rem", color: C.muted, margin: 0, fontStyle: "italic" }}>
            "The magic begins with a home prepared with care."
          </p>
        </div>

      </div>
    </footer>
  );
};

export default Footer;