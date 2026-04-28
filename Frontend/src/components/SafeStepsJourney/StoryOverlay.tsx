/**
 * StoryOverlay — Enhanced 4-Frame text overlays
 *
 * Frame 0 (0.00–0.16): "In a child's world... everything begins with wonder."
 * Frame 1 (0.35–0.48): "Every moment is magic."
 * Frame 2 (0.58–0.68): "But the table's edge doesn't know how to whisper." [DANGER tint]
 * Frame 3 (0.70–0.80): "AI is the invisible guardian." [GUARDIAN tint]
 *
 * IMPROVEMENTS (B2):
 *   • Typewriter effect for line1 (char-by-char, 45ms/char)
 *   • Word-by-word reveal for line2
 *   • SVG star components with animated golden glow filter (replaces unicode ✦)
 *   • Frame-specific text coloring (danger=warm red, guardian=mint)
 *   • Gold line separator animates from center
 *   • Subtle parallax offset based on scroll
 */
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo } from "react";

/* ── Types ────────────────────────────────────────────── */
interface TextPhase {
  line1: string;
  line2?: string;
  start: number;
  end: number;
  side: "left" | "right";
  tint?: "default" | "danger" | "guardian";
}

/* ── Phase config ─────────────────────────────────────── */
const PHASES: TextPhase[] = [
  {
    line1: "In a child's world...",
    line2: "everything begins with wonder.",
    start: 0.0,
    end: 0.16,
    side: "left",
    tint: "default",
  },
  {
    line1: "Every moment is magic.",
    start: 0.35,
    end: 0.48,
    side: "left",
    tint: "default",
  },
  {
    line1: "But the table's edge",
    line2: "doesn't know how to whisper.",
    start: 0.58,
    end: 0.68,
    side: "right",
    tint: "danger",
  },
  {
    line1: "AI is the invisible guardian.",
    start: 0.7,
    end: 0.8,
    side: "left",
    tint: "guardian",
  },
];

/* ── Color schemes per tint ──────────────────────────── */
const TINT_COLORS = {
  default: {
    line1: "rgba(255,248,230,0.95)",
    line2: "rgba(255,228,160,0.7)",
    separator: "rgba(255,228,160,0.8)",
    starColor: "#ffe4a0",
    glowColor: "rgba(255,228,160,0.8)",
  },
  danger: {
    line1: "rgba(255,230,220,0.95)",
    line2: "rgba(255,160,130,0.7)",
    separator: "rgba(255,100,80,0.6)",
    starColor: "#ff8866",
    glowColor: "rgba(255,80,50,0.6)",
  },
  guardian: {
    line1: "rgba(220,255,248,0.95)",
    line2: "rgba(120,220,210,0.7)",
    separator: "rgba(120,220,210,0.8)",
    starColor: "#78dcd2",
    glowColor: "rgba(120,220,210,0.8)",
  },
};

/* ═══ SVG Star component with glow ═══════════════════ */
function GlowingStar({
  delay,
  x,
  y,
  size = 14,
  color = "#ffe4a0",
  glowColor = "rgba(255,228,160,0.8)",
}: {
  delay: number;
  x: string;
  y: string;
  size?: number;
  color?: string;
  glowColor?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 1, 0.4, 1, 0],
        scale: [0, 1.3, 0.8, 1.1, 0],
        rotate: [0, 45, 90, 135, 180],
      }}
      transition={{
        duration: 3.5,
        delay,
        repeat: Infinity,
        repeatDelay: 0.8,
      }}
      style={{
        position: "absolute",
        left: x,
        top: y,
        pointerEvents: "none",
        filter: `drop-shadow(0 0 6px ${glowColor}) drop-shadow(0 0 12px ${glowColor})`,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 0L14.6 8.4L24 9.2L17 15L19 24L12 19.5L5 24L7 15L0 9.2L9.4 8.4L12 0Z"
          fill={color}
        />
      </svg>
    </motion.div>
  );
}

/* ═══ Typewriter hook (char-by-char) ═════════════════ */
function useTypewriter(text: string, isActive: boolean, speed = 45) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setDisplayed("");
      setDone(false);
      return;
    }

    let i = 0;
    setDisplayed("");
    setDone(false);

    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, isActive, speed]);

  return { displayed, done };
}

/* ═══ Word-by-word reveal ════════════════════════════ */
function WordByWordReveal({
  text,
  isReady,
  style,
}: {
  text: string;
  isReady: boolean;
  style: React.CSSProperties;
}) {
  const words = useMemo(() => text.split(" "), [text]);

  if (!isReady) return null;

  return (
    <p style={{ ...style, margin: 0, marginTop: 12 }}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.1 + i * 0.12,
            duration: 0.4,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{ display: "inline-block", marginRight: "0.3em" }}
        >
          {word}
        </motion.span>
      ))}
    </p>
  );
}

/* ═══ Gold separator (expands from center) ═══════════ */
function GoldSeparator({
  color,
  width = 60,
  position,
}: {
  color: string;
  width?: number;
  position: "top" | "bottom";
}) {
  return (
    <motion.div
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{
        delay: position === "top" ? 0.2 : 0.6,
        duration: 0.9,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{
        width,
        height: 1,
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        margin: position === "top" ? "0 auto 20px" : "20px auto 0",
        transformOrigin: "center",
      }}
    />
  );
}

/* ═══ Main Component ═════════════════════════════════ */
export default function StoryOverlay({
  scrollProgress,
}: {
  scrollProgress: number;
}) {
  const active = PHASES.find(
    (p) => scrollProgress >= p.start && scrollProgress <= p.end,
  );

  /* Parallax offset — text moves slightly slower than scroll */
  const parallaxOffset = useMemo(() => {
    if (!active) return 0;
    const mid = (active.start + active.end) / 2;
    return (scrollProgress - mid) * -30; // subtle vertical offset
  }, [scrollProgress, active]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <AnimatePresence mode="wait">
        {active && (
          <StoryCard
            key={active.line1}
            phase={active}
            parallaxY={parallaxOffset}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══ Story Card (single text card) ══════════════════ */
function StoryCard({
  phase,
  parallaxY,
}: {
  phase: TextPhase;
  parallaxY: number;
}) {
  const colors = TINT_COLORS[phase.tint ?? "default"];
  const { displayed, done } = useTypewriter(phase.line1, true, 45);

  return (
    <motion.div
      initial={{ opacity: 0, x: phase.side === "left" ? -60 : 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: phase.side === "left" ? -40 : 40 }}
      transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "absolute",
        top: "50%",
        transform: `translateY(calc(-50% + ${parallaxY}px))`,
        [phase.side]: "5vw",
        maxWidth: "400px",
        textAlign: phase.side as any,
        padding: "28px 36px",
      }}
    >
      {/* Top separator — expands from center */}
      <GoldSeparator color={colors.separator} width={60} position="top" />

      {/* Line 1 — typewriter */}
      <h2
        style={{
          fontFamily: "'Cinzel Decorative','Georgia',serif",
          fontSize: "clamp(20px,3.5vw,36px)",
          fontWeight: 700,
          letterSpacing: "0.06em",
          lineHeight: 1.35,
          color: colors.line1,
          textShadow: "0 2px 30px rgba(0,0,0,0.5)",
          margin: 0,
          minHeight: "1.35em",
        }}
      >
        {displayed}
        {/* Blinking cursor during typewriting */}
        {!done && (
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity }}
            style={{
              display: "inline-block",
              width: 2,
              height: "0.85em",
              background: colors.line1,
              marginLeft: 2,
              verticalAlign: "middle",
            }}
          />
        )}
      </h2>

      {/* Line 2 — word-by-word, only after typewriter finishes */}
      {phase.line2 && (
        <WordByWordReveal
          text={phase.line2}
          isReady={done}
          style={{
            fontFamily: "'Cormorant Garamond','Georgia',serif",
            fontSize: "clamp(16px,2.5vw,24px)",
            fontWeight: 300,
            fontStyle: "italic",
            letterSpacing: "0.04em",
            lineHeight: 1.5,
            color: colors.line2,
            textShadow: "0 1px 20px rgba(0,0,0,0.4)",
          }}
        />
      )}

      {/* Bottom separator */}
      <GoldSeparator color={colors.separator} width={40} position="bottom" />

      {/* ── SVG Glowing Stars ─────────────────────── */}
      <GlowingStar
        delay={0.2}
        x="-12px"
        y="-16px"
        size={12}
        color={colors.starColor}
        glowColor={colors.glowColor}
      />
      <GlowingStar
        delay={0.7}
        x="92%"
        y="-18px"
        size={10}
        color={colors.starColor}
        glowColor={colors.glowColor}
      />
      <GlowingStar
        delay={1.0}
        x="42%"
        y="105%"
        size={14}
        color={colors.starColor}
        glowColor={colors.glowColor}
      />
      <GlowingStar
        delay={1.4}
        x="75%"
        y="95%"
        size={8}
        color={colors.starColor}
        glowColor={colors.glowColor}
      />

      {/* Extra ambient star for guardian/danger frames */}
      {(phase.tint === "danger" || phase.tint === "guardian") && (
        <GlowingStar
          delay={0.5}
          x="20%"
          y="-25px"
          size={16}
          color={colors.starColor}
          glowColor={colors.glowColor}
        />
      )}
    </motion.div>
  );
}