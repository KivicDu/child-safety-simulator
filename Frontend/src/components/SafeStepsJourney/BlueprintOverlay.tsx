/**
 * BlueprintOverlay — Enhanced Blueprint view with cinematic effects
 */
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

interface Props {
  visible: boolean;
  opacity?: number; // 0→1, từ JourneyScene crossfade logic
}

/* ═══ Scan Line Effect ═══════════════════════════════ */
function ScanLine() {
  return (
    <motion.div
      initial={{ top: "-2px" }}
      animate={{ top: "100%" }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: "linear",
      }}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        height: 2,
        zIndex: 5,
        background:
          "linear-gradient(90deg, transparent 5%, rgba(120,220,210,0.6) 30%, rgba(255,228,160,0.8) 50%, rgba(120,220,210,0.6) 70%, transparent 95%)",
        boxShadow:
          "0 0 15px rgba(120,220,210,0.5), 0 0 30px rgba(120,220,210,0.2)",
        pointerEvents: "none",
      }}
    />
  );
}

/* ═══ Grid Overlay ═══════════════════════════════════ */
function GridOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.08 }}
      transition={{ delay: 0.5, duration: 1.5 }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        pointerEvents: "none",
        backgroundImage: `
          linear-gradient(rgba(120,220,210,0.3) 1px, transparent 1px),
          linear-gradient(90deg, rgba(120,220,210,0.3) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
      }}
    />
  );
}

/* ═══ Corner Brackets (cinematic frame) ═════════════ */
function CornerBrackets() {
  const bracketStyle: React.CSSProperties = {
    position: "absolute",
    width: 30,
    height: 30,
    pointerEvents: "none",
  };

  return (
    <>
      {/* Top-left */}
      <div
        style={{
          ...bracketStyle,
          top: 20,
          left: 20,
          borderTop: "1px solid rgba(120,220,210,0.4)",
          borderLeft: "1px solid rgba(120,220,210,0.4)",
        }}
      />
      {/* Top-right */}
      <div
        style={{
          ...bracketStyle,
          top: 20,
          right: 20,
          borderTop: "1px solid rgba(120,220,210,0.4)",
          borderRight: "1px solid rgba(120,220,210,0.4)",
        }}
      />
      {/* Bottom-left */}
      <div
        style={{
          ...bracketStyle,
          bottom: 20,
          left: 20,
          borderBottom: "1px solid rgba(120,220,210,0.4)",
          borderLeft: "1px solid rgba(120,220,210,0.4)",
        }}
      />
      {/* Bottom-right */}
      <div
        style={{
          ...bracketStyle,
          bottom: 20,
          right: 20,
          borderBottom: "1px solid rgba(120,220,210,0.4)",
          borderRight: "1px solid rgba(120,220,210,0.4)",
        }}
      />
    </>
  );
}

/* ═══ Main Component ═════════════════════════════════ */
export default function BlueprintOverlay({ visible, opacity = 1 }: Props) {
  const navigate = useNavigate();

  /* CTA appears after blueprint is almost fully visible */
  const showCTA = opacity > 0.82;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={false}
          animate={{ opacity }}
          transition={{ duration: 0.05, ease: "linear" }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            pointerEvents: opacity > 0.1 ? "auto" : "none",
          }}
        >
          {/* ── Blueprint image — full screen ──────────── */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "url(/images/blueprint.png)",
              backgroundSize: "cover",
              backgroundPosition: "center center",
              backgroundRepeat: "no-repeat",
            }}
          />

          {/* ── Grid overlay ──────────────────────────── */}
          <GridOverlay />

          {/* ── Scan line sweep ────────────────────────── */}
          <ScanLine />

          {/* ── Corner brackets ────────────────────────── */}
          <CornerBrackets />

          {/* ── Gradient overlay bottom ────────────────── */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to bottom, transparent 30%, rgba(3,14,50,0.70) 70%, rgba(3,14,50,0.92) 100%)",
              zIndex: 4,
            }}
          />

          {/* ── CTA — fade in after blueprint visible ──── */}
          <AnimatePresence>
            {showCTA && (
              <motion.div
                key="cta"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: "absolute",
                  bottom: 52,
                  left: 0,
                  right: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  zIndex: 10,
                }}
              >
                {/* Title */}
                <h2
                  style={{
                    fontFamily: "'Cinzel Decorative', serif",
                    fontSize: "clamp(20px, 3vw, 38px)",
                    fontWeight: 700,
                    color: "rgba(255,248,230,0.97)",
                    textAlign: "center",
                    lineHeight: 1.25,
                    marginBottom: 10,
                    letterSpacing: "0.03em",
                    textShadow:
                      "0 2px 24px rgba(0,0,0,0.9), 0 0 60px rgba(0,20,80,0.6)",
                  }}
                >
                  Every corner scanned.{" "}
                  <span
                    style={{
                      background: "linear-gradient(135deg, #78dcd2, #60a5fa)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    Every child protected.
                  </span>
                </h2>

                <p
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 16,
                    fontStyle: "italic",
                    color: "rgba(255,255,255,0.6)",
                    marginBottom: 28,
                    textAlign: "center",
                    textShadow: "0 1px 10px rgba(0,0,0,0.8)",
                  }}
                >
                  From simulation to real life.
                </p>

                {/* CTA Button with ripple glow pulse */}
                <motion.button
                  onClick={() => navigate("/simulator")}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.97 }}
                  animate={{
                    boxShadow: [
                      "0 6px 24px rgba(120,220,210,0.35)",
                      "0 8px 36px rgba(120,220,210,0.55)",
                      "0 6px 24px rgba(120,220,210,0.35)",
                    ],
                  }}
                  transition={{
                    boxShadow: { duration: 2.5, repeat: Infinity },
                    scale: { duration: 0.18 },
                  }}
                  style={{
                    position: "relative",
                    padding: "14px 40px",
                    borderRadius: 12,
                    background: "linear-gradient(135deg, #78dcd2, #60a5fa)",
                    color: "#050f2e",
                    fontSize: 14,
                    fontFamily: "'Cinzel Decorative', serif",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                    letterSpacing: "0.05em",
                    overflow: "hidden",
                  }}
                >
                  {/* Ripple shimmer effect */}
                  <motion.div
                    animate={{ left: ["-100%", "200%"] }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      repeatDelay: 1.5,
                      ease: "linear",
                    }}
                    style={{
                      position: "absolute",
                      top: 0,
                      width: "50%",
                      height: "100%",
                      background:
                        "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                      transform: "skewX(-12deg)",
                      pointerEvents: "none",
                    }}
                  />
                  Launch Simulation →
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
