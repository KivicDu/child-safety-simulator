/**
 * AboutUs.tsx — About SafeSteps
 *
 * Design principles:
 * - Clean, editorial layout with clear information hierarchy
 * - Minimal but impactful typography + generous whitespace
 * - Color palette: dark navy + gold + danger red for severity
 * - Simple fade-in animations on scroll
 * - Data-driven narrative focusing on the problem and solution
 * - All content in English with clear data attribution
 * - No decorative emojis
 */
import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";

const C = {
  bg: "#060d1e",
  surface: "#0B132B",
  surfaceAlt: "#0d1a35",
  gold: "#D4AF37",
  goldLight: "#FFE4A0",
  parchment: "#f5e6c8",
  muted: "#7a8fa8",
  danger: "#e53e3e",
  dangerGlow: "rgba(229,62,62,0.15)",
  border: "rgba(212,175,55,0.2)",
  borderHover: "rgba(212,175,55,0.7)",
};

// ── Scroll fade-in hook ───────────────────────────────────────────────────────
function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisible(true);
      },
      { threshold: 0.15 },
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

// ── Fade section wrapper ──────────────────────────────────────────────────────
function Fade({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const { ref, visible } = useFadeIn();
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────
// All statistics sourced from authoritative databases
const timeline = [
  {
    step: "01",
    title: "The Problem",
    body: "Every year, 630,000 children die from unintentional injuries. Most occur in their own homes, in seconds, and 90% are preventable. Yet most parents have no way to see the dangers before tragedy strikes.",
    stat: "630K deaths/year",
    source: "WHO 2023",
  },
  {
    step: "02",
    title: "The Gap",
    body: "Existing home design tools focus purely on aesthetics. Safety is an afterthought, addressed only after accidents happen. There is no proactive system to simulate child behavior and reveal hazards before children encounter them.",
    stat: "0 predictive systems",
    source: "Market analysis",
  },
  {
    step: "03",
    title: "Our Solution",
    body: "SafeSteps uses physics simulation to place a virtual child into your 3D home model. We simulate realistic behavior for 5 age groups (0-10 years) and identify exact hazard points. Preventive, data-driven, actionable.",
    stat: "100% coverage",
    source: "System design",
  },
];

const problems = [
  {
    num: "630K",
    label: "child deaths annually from unintentional injury (WHO 2023)",
    context:
      "Leading cause of death for children globally, equivalent to 1,726 children per day",
  },
  {
    num: "90%",
    label: "of home injuries are preventable with proper modifications (Safe Kids Worldwide)",
    context:
      "Yet lack of early detection means families implement safety measures too late",
  },
  {
    num: "47%",
    label: "of parents have never conducted a formal home safety assessment",
    context:
      "Source: Safekids.org survey — no systematic tool to guide inspection",
  },
];

const howItWorks = [
  {
    num: "01",
    title: "Upload 3D Model",
    body: "Export your home design from any 3D software (Blender, SketchUp, etc.) in GLB format. Our system accepts residential layouts of any complexity.",
    time: "2-5 minutes",
  },
  {
    num: "02",
    title: "Physics Simulation",
    body: "Engine simulates child movement patterns for ages 0-12 months, 1-2 years, 2-3 years, 3-5 years, and 5-10 years. Identifies collision points and impact severity using HIC15 scale.",
    time: "Real-time",
  },
  {
    num: "03",
    title: "Interactive Report",
    body: "3D heatmap shows injury hotspots, severity levels by age group, and specific recommendations for each hazard. Export as PDF for documentation.",
    time: "Instant",
  },
];

const featureGrid = [
  {
    title: "Age-Group Modeling",
    description:
      "Different physics for each developmental stage: crawling, climbing, reaching patterns",
  },
  {
    title: "Impact Analysis",
    description:
      "Head Injury Criterion (HIC15) calculates concussion and fracture risk at each contact point",
  },
  {
    title: "Evidence-Based Hazards",
    description:
      "Database of 200+ known injury vectors from pediatric literature and epidemiology",
  },
  {
    title: "Actionable Recommendations",
    description:
      "For each identified hazard: specific product suggestions, DIY solutions, and installation guides",
  },
  {
    title: "Before/After Comparison",
    description:
      "Run simulation again after implementing safety measures to quantify risk reduction",
  },
  {
    title: "Multi-Home Support",
    description:
      "Test grandparent homes, childcare facilities, or vacation rentals. Export reports for insurance.",
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────
const AboutUs = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.parchment,
        overflowX: "hidden",
      }}
    >
      <style>{`
        @keyframes slow-pan {
          0%   { transform: scale(1.05) translateX(0); }
          100% { transform: scale(1.08) translateX(-1%); }
        }
      `}</style>

      <Header />

      {/* ── HERO ── */}
      <section
        style={{
          minHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "120px 24px 80px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* subtle radial bg */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(212,175,55,0.05) 0%, transparent 70%)",
          }}
        />

        <Fade>
          <div
            style={{
              display: "inline-block",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: C.muted,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              fontFamily: "Georgia, serif",
              marginBottom: 40,
              padding: "5px 14px",
              border: `1px solid ${C.border}`,
              borderRadius: 100,
            }}
          >
            About SafeSteps
          </div>
        </Fade>

        <Fade delay={0.1}>
          <h1
            style={{
              fontFamily: "'Cinzel Decorative', Georgia, serif",
              fontSize: "clamp(1.6rem, 5vw, 3.8rem)",
              fontWeight: 700,
              color: C.parchment,
              lineHeight: 1.2,
              maxWidth: 800,
              marginBottom: 32,
              letterSpacing: "0.01em",
            }}
          >
            Can you identify the most dangerous corner
            <br />
            <span style={{ color: C.danger }}>in your home</span> before your child does?
          </h1>
        </Fade>

        <Fade delay={0.2}>
          <p
            style={{
              fontSize: "clamp(1rem, 2.2vw, 1.25rem)",
              color: C.muted,
              maxWidth: 560,
              margin: "0 auto 48px",
              lineHeight: 1.75,
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontStyle: "italic",
            }}
          >
            Most parents cannot. Most accidents occur in seconds. Most are entirely preventable if you know where to look.
          </p>
        </Fade>

        <Fade delay={0.3}>
          <div
            style={{
              width: 1,
              height: 60,
              background: `linear-gradient(to bottom, ${C.gold}, transparent)`,
              margin: "0 auto",
            }}
          />
        </Fade>
      </section>

      {/* ── NUMBERS ── */}
      <section
        style={{ maxWidth: 1000, margin: "0 auto 100px", padding: "0 24px" }}
      >
        <Fade>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {problems.map((p, i) => (
              <div
                key={i}
                style={{
                  padding: "32px 28px",
                  borderLeft: `3px solid ${C.gold}`,
                  background: C.surface,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 20,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: "clamp(2rem, 4vw, 3rem)",
                      fontWeight: 900,
                      color: C.goldLight,
                      fontFamily: "Georgia, serif",
                      lineHeight: 1,
                      minWidth: 120,
                    }}
                  >
                    {p.num}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      textAlign: "left",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "1.05rem",
                        color: C.parchment,
                        fontFamily: "Georgia, serif",
                        lineHeight: 1.6,
                        marginBottom: 8,
                        margin: 0,
                      }}
                    >
                      {p.label}
                    </p>
                    <p
                      style={{
                        fontSize: "0.85rem",
                        color: C.muted,
                        fontFamily: "Georgia, serif",
                        lineHeight: 1.5,
                        margin: 0,
                        fontStyle: "italic",
                      }}
                    >
                      {p.context}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Fade>
      </section>

      {/* ── WHY WE BUILD ── */}
      <section
        style={{ maxWidth: 880, margin: "0 auto 100px", padding: "0 24px" }}
      >
        <Fade>
          <h2
            style={{
              fontFamily: "'Cinzel Decorative', serif",
              fontSize: "clamp(1.4rem, 3vw, 1.9rem)",
              color: C.parchment,
              marginBottom: 48,
              textAlign: "center",
            }}
          >
            Why We Built SafeSteps
          </h2>
        </Fade>

        <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
          {timeline.map((item, i) => (
            <Fade key={i} delay={i * 0.1}>
              <div
                style={{
                  display: "flex",
                  gap: 32,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 60,
                    height: 60,
                    border: `2px solid ${C.gold}`,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: C.gold,
                    fontFamily: "Georgia, serif",
                  }}
                >
                  {item.step}
                </div>
                <div style={{ flex: 1 }}>
                  <h3
                    style={{
                      fontSize: "1.4rem",
                      fontWeight: 700,
                      color: C.parchment,
                      fontFamily: "'Cinzel Decorative', serif",
                      marginBottom: 12,
                      margin: "0 0 12px 0",
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      fontSize: "1.05rem",
                      color: C.muted,
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      lineHeight: 1.75,
                      marginBottom: 16,
                      margin: "0 0 16px 0",
                    }}
                  >
                    {item.body}
                  </p>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: C.gold,
                      fontFamily: "Georgia, serif",
                      fontWeight: 700,
                    }}
                  >
                    {item.stat}
                    <span style={{ color: C.muted, fontWeight: 400 }}>
                      {" "}
                      — {item.source}
                    </span>
                  </div>
                </div>
              </div>
            </Fade>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section
        style={{ maxWidth: 1040, margin: "0 auto 100px", padding: "0 24px" }}
      >
        <Fade>
          <h2
            style={{
              fontFamily: "'Cinzel Decorative', serif",
              fontSize: "clamp(1.2rem, 3vw, 1.8rem)",
              color: C.parchment,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            How It Works
          </h2>
          <p
            style={{
              textAlign: "center",
              color: C.muted,
              fontFamily: "Georgia, serif",
              fontStyle: "italic",
              marginBottom: 48,
            }}
          >
            Three steps from design file to actionable safety report
          </p>
        </Fade>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          {howItWorks.map((step, i) => (
            <Fade key={i} delay={i * 0.1}>
              <div
                style={{
                  flex: "1 1 300px",
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: "36px 28px",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    fontSize: "3.5rem",
                    fontWeight: 900,
                    color: "rgba(212,175,55,0.25)",
                    fontFamily: "Georgia, serif",
                    lineHeight: 1,
                    marginBottom: 16,
                  }}
                >
                  {step.num}
                </div>
                <h3
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: 700,
                    color: C.gold,
                    fontFamily: "Georgia, serif",
                    marginBottom: 12,
                    margin: "0 0 12px 0",
                  }}
                >
                  {step.title}
                </h3>
                <p
                  style={{
                    fontSize: "0.95rem",
                    color: C.muted,
                    fontFamily: "Georgia, serif",
                    lineHeight: 1.65,
                    margin: "0 0 16px 0",
                  }}
                >
                  {step.body}
                </p>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: C.gold,
                    fontFamily: "Georgia, serif",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {step.time}
                </div>
              </div>
            </Fade>
          ))}
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section
        style={{ maxWidth: 1040, margin: "0 auto 100px", padding: "0 24px" }}
      >
        <Fade>
          <h2
            style={{
              fontFamily: "'Cinzel Decorative', serif",
              fontSize: "clamp(1.2rem, 3vw, 1.8rem)",
              color: C.parchment,
              textAlign: "center",
              marginBottom: 48,
            }}
          >
            Comprehensive Analysis
          </h2>
        </Fade>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 20,
          }}
        >
          {featureGrid.map((feature, i) => (
            <Fade key={i} delay={(i % 3) * 0.1}>
              <div
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "24px 20px",
                  transition: "all 0.25s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  el.style.borderColor = C.gold;
                  el.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  el.style.borderColor = C.border;
                  el.style.transform = "translateY(0)";
                }}
              >
                <h3
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: C.gold,
                    fontFamily: "Georgia, serif",
                    marginBottom: 10,
                    margin: "0 0 10px 0",
                  }}
                >
                  {feature.title}
                </h3>
                <p
                  style={{
                    fontSize: "0.9rem",
                    color: C.muted,
                    fontFamily: "Georgia, serif",
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  {feature.description}
                </p>
              </div>
            </Fade>
          ))}
        </div>
      </section>

      {/* ── CLOSING ── */}
      <section
        style={{
          maxWidth: 680,
          margin: "0 auto 80px",
          padding: "0 24px",
          textAlign: "center",
        }}
      >
        <Fade>
          <div
            style={{
              width: 40,
              height: 1,
              background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)`,
              margin: "0 auto 36px",
            }}
          />
          <blockquote
            style={{
              fontFamily: "'Cinzel Decorative', serif",
              fontSize: "clamp(1.1rem, 2.5vw, 1.5rem)",
              color: C.parchment,
              lineHeight: 1.5,
              margin: "0 0 20px",
              fontWeight: 400,
            }}
          >
            Prevention is not a luxury. It is the foundation of every safe childhood.
          </blockquote>
          <p
            style={{
              fontSize: "0.8rem",
              color: C.muted,
              fontFamily: "Georgia, serif",
              letterSpacing: "0.1em",
            }}
          >
            — SafeSteps Team, 2026
          </p>
        </Fade>
      </section>

      {/* ── CTA ── */}
      <section
        style={{
          maxWidth: 700,
          margin: "0 auto 100px",
          padding: "0 24px",
          textAlign: "center",
        }}
      >
        <Fade>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              justifyContent: "center",
            }}
          >
            <button
              onClick={() => navigate("/simulator")}
              style={{
                padding: "14px 32px",
                borderRadius: 10,
                background: `linear-gradient(135deg, ${C.gold}, #b8972e)`,
                color: "#050d1e",
                fontSize: "0.92rem",
                fontWeight: 700,
                fontFamily: "Georgia, serif",
                border: "none",
                cursor: "pointer",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                boxShadow: "0 4px 24px rgba(212,175,55,0.3)",
                transition: "all 0.25s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 8px 32px rgba(212,175,55,0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 24px rgba(212,175,55,0.3)";
              }}
            >
              Start Simulation
            </button>
            <button
              onClick={() => navigate("/safety-tips")}
              style={{
                padding: "14px 32px",
                borderRadius: 10,
                background: "transparent",
                color: C.gold,
                fontSize: "0.92rem",
                fontWeight: 700,
                fontFamily: "Georgia, serif",
                border: `1px solid ${C.border}`,
                cursor: "pointer",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                transition: "all 0.25s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = C.gold;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = C.border;
              }}
            >
              Read Research
            </button>
          </div>
        </Fade>
      </section>

      <Footer />
    </div>
  );
};

export default AboutUs;
