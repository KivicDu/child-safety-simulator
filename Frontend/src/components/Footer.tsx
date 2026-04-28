import { useNavigate } from "react-router-dom";

const Footer = () => {
  const navigate = useNavigate();

  // 90s/00s Disney Fairytale Ending Screen
  const colors = {
    royalNight: "#0A0F1D", // Deep magical night sky
    stardustGold: "#FFE4A0", // Glowing Cinderella magical dust
    iceWhite: "#FDFDFD",
  };

  const navLinks = [
    { label: "Prologue", path: "/" },
    { label: "The Magic Box", path: "/simulator" },
    { label: "The Architect", path: "/test-lab" },
    { label: "Grimoire", path: "/safety-tips" },
  ];

  return (
    <footer
      style={{
        position: "relative",
        backgroundColor: colors.royalNight,
        overflow: "hidden",
        paddingTop: "7rem",
        paddingBottom: "2rem",
        color: colors.iceWhite,
        borderTop: `1px solid rgba(255, 228, 160, 0.1)`,
      }}
    >
      {/* Top Magical Frost Blend */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "180px",
          background: `linear-gradient(to bottom, transparent, ${colors.royalNight} 85%)`,
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Fairytale Book Background Elements */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          top: 0,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              'url(\'data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="50" r="0.8" fill="%23FFE4A0" opacity="0.6"/><circle cx="150" cy="120" r="0.5" fill="white" opacity="0.8"/><circle cx="80" cy="180" r="1.2" fill="%23FFE4A0" opacity="0.4"/><circle cx="180" cy="20" r="1.5" fill="white" opacity="0.3"/></svg>\')',
            backgroundSize: "150px 150px",
            opacity: 0.5,
          }}
        />

        <svg
          style={{
            position: "absolute",
            left: "-60px",
            bottom: "-60px",
            opacity: 0.15,
            filter: "blur(0.5px)",
          }}
          width="350"
          height="350"
          viewBox="0 0 100 100"
        >
          <path
            d="M 0 100 Q 50 80 80 100 Q 70 50 100 0 Q 30 20 0 50 Z"
            fill="none"
            stroke={colors.stardustGold}
            strokeWidth="0.8"
          />
          <path
            d="M 0 80 Q 40 70 60 90 Q 50 40 80 10 Q 20 30 0 60 Z"
            fill="none"
            stroke={colors.iceWhite}
            strokeWidth="0.4"
          />
        </svg>

        <svg
          style={{
            position: "absolute",
            right: "-60px",
            top: "0px",
            opacity: 0.15,
            filter: "blur(0.5px)",
          }}
          width="350"
          height="350"
          viewBox="0 0 100 100"
          transform="scale(-1, 1)"
        >
          <path
            d="M 0 100 Q 50 80 80 100 Q 70 50 100 0 Q 30 20 0 50 Z"
            fill="none"
            stroke={colors.stardustGold}
            strokeWidth="0.8"
          />
        </svg>

        <div style={{ position: "absolute", right: "25%", bottom: "35%" }}>
          <div
            className="royal-sparkle"
            style={{ top: "0", left: "0", animationDelay: "0s" }}
          >
            ✦
          </div>
          <div
            className="royal-sparkle"
            style={{
              top: "-40px",
              left: "30px",
              animationDelay: "1.5s",
              fontSize: "18px",
            }}
          >
            ✦
          </div>
          <div
            className="royal-sparkle"
            style={{
              top: "20px",
              left: "50px",
              animationDelay: "0.8s",
              fontSize: "12px",
            }}
          >
            ✦
          </div>
          <div
            className="royal-sparkle"
            style={{
              top: "5px",
              left: "-30px",
              animationDelay: "2s",
              fontSize: "14px",
            }}
          >
            ✦
          </div>
        </div>
      </div>

      <style>{`
        .royal-sparkle {
          position: absolute;
          color: ${colors.stardustGold};
          font-size: 16px;
          text-shadow: 0 0 10px ${colors.stardustGold}, 0 0 20px white;
          animation: royal-float 4s ease-in-out infinite alternate;
        }
        @keyframes royal-float {
          0% { opacity: 0; transform: translateY(15px) scale(0.6) rotate(0deg); }
          50% { opacity: 1; transform: translateY(0px) scale(1.1) rotate(15deg); }
          100% { opacity: 0; transform: translateY(-15px) scale(0.8) rotate(-10deg); }
        }
      `}</style>

      <div
        style={{
          position: "relative",
          zIndex: 10,
          maxWidth: "75rem",
          margin: "0 auto",
          padding: "0 2rem",
          textAlign: "center",
        }}
      >
        <div style={{ marginBottom: "4rem" }}>
          <h3
            style={{
              fontFamily: "'Cinzel Decorative', 'Georgia', serif",
              fontSize: "36px",
              fontWeight: 700,
              margin: "0 0 16px 0",
              color: colors.stardustGold,
              textShadow: "0 0 16px rgba(255,228,160,0.6)",
              letterSpacing: "2px",
            }}
          >
            SafeSteps
          </h3>
          <div
            style={{
              width: "150px",
              height: "1px",
              background: `linear-gradient(90deg, transparent, ${colors.stardustGold}, transparent)`,
              margin: "0 auto 20px auto",
              opacity: 0.6,
            }}
          />
          <p
            style={{
              fontFamily: "'Cormorant Garamond', 'Georgia', serif",
              fontStyle: "italic",
              color: colors.iceWhite,
              opacity: 0.9,
              lineHeight: 1.6,
              fontSize: "19px",
              maxWidth: "480px",
              margin: "0 auto",
              textShadow: "0 2px 4px rgba(0,0,0,0.5)",
            }}
          >
            "Nơi phép màu không chỉ nằm ở chiếc đũa thần, mà bắt đầu từ một tổ
            ấm được chở che cẩn thận cho tới khi bình minh thức giấc."
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-3xl mx-auto pb-4 text-center">
          <div>
            <h4
              style={{
                fontFamily: "'Cinzel Decorative', 'Georgia', serif",
                fontSize: "15px",
                color: colors.stardustGold,
                marginBottom: "20px",
                letterSpacing: "2px",
              }}
            >
              The Chapters
            </h4>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                alignItems: "center",
              }}
            >
              {navLinks.map((link) => (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: colors.iceWhite,
                    cursor: "pointer",
                    fontSize: "17px",
                    fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                    fontStyle: "italic",
                    transition: "all 0.4s ease",
                    opacity: 0.8,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = colors.stardustGold;
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.textShadow =
                      "0 0 10px rgba(255,228,160,0.6)";
                    e.currentTarget.style.transform = "scale(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = colors.iceWhite;
                    e.currentTarget.style.opacity = "0.8";
                    e.currentTarget.style.textShadow = "none";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4
              style={{
                fontFamily: "'Cinzel Decorative', 'Georgia', serif",
                fontSize: "15px",
                color: colors.stardustGold,
                marginBottom: "20px",
                letterSpacing: "2px",
              }}
            >
              The Conjurers
            </h4>
            <div
              style={{
                fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                fontStyle: "italic",
                color: colors.iceWhite,
                opacity: 0.85,
                lineHeight: 1.8,
                fontSize: "17px",
              }}
            >
              <p
                style={{
                  marginBottom: "10px",
                  fontFamily: "'Cinzel Decorative', serif",
                  fontSize: "13px",
                  letterSpacing: "1px",
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                ĐỒ ÁN CƠ SỞ
              </p>
              <ul style={{ listStyleType: "none", padding: 0, margin: 0 }}>
                <li>
                  Đỗ Thư Kỳ{" "}
                  <span style={{ opacity: 0.5, fontSize: "15px" }}>
                    (FULLSTACK)
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "4rem",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "16px",
            color: colors.stardustGold,
            opacity: 0.6,
          }}
        >
          <div
            style={{
              width: "60px",
              height: "1px",
              background: "linear-gradient(90deg, transparent, currentColor)",
            }}
          />
          <span style={{ fontSize: "12px" }}>✦</span>
          <div
            style={{
              width: "60px",
              height: "1px",
              background: "linear-gradient(90deg, currentColor, transparent)",
            }}
          />
        </div>

        <div
          style={{
            marginTop: "20px",
            fontSize: "15px",
            fontFamily: "'Cormorant Garamond', 'Georgia', serif",
            fontStyle: "italic",
            color: colors.iceWhite,
            opacity: 0.6,
          }}
        >
          <p>© 2026 SafeSteps Tale. An enchanting journey unfolds.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
