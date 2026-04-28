import Header from "../components/Header";
import Footer from "../components/Footer";

/* ─── Safety Tip Data (Grimoire Lore) ─────────────────────────────────────── */
const categories = [
  {
    title: "Chamber of Gathering (Living Room)",
    iconSymbol: "✧",
    tips: [
      {
        title: "Corner Wards",
        desc: "Install structural protectors on sharp-edged furnishings. An unprotected corner is a silent blade against a running child.",
        risk: "High",
      },
      {
        title: "Anchor the Monoliths",
        desc: "Bookshelves and large units must be anchored to the wall. Falling structures claim dozens of lives each cycle.",
        risk: "Critical",
      },
      {
        title: "Binding of Cords",
        desc: "Loose window blind strings and electrical vines must be bound and hidden to prevent accidental strangulation.",
        risk: "Critical",
      },
      {
        title: "Window Barriers",
        desc: "Install stoppers on all high windows. Do not place climbable structures beneath them.",
        risk: "Critical",
      },
    ],
  },
  {
    title: "The Hearth (Kitchen)",
    iconSymbol: "✦",
    tips: [
      {
        title: "Sealing the Vaults",
        desc: "Utilize firm mechanisms to lock cabinets housing sharp implements and alchemical toxins (cleaning supplies).",
        risk: "High",
      },
      {
        title: "Guarding the Flame",
        desc: "Place shields over stove knobs. Establish a perimeter to prevent small hands from reaching boiling vessels.",
        risk: "Critical",
      },
      {
        title: "Tempering the Waters",
        desc: "Calibrate water heaters below 48°C to prevent instant scalding burns on delicate skin.",
        risk: "High",
      },
      {
        title: "Denial of Ascent",
        desc: "Remove stepping stools and chairs from the vicinity of counters. Ascent leads to unattended dangers.",
        risk: "Medium",
      },
    ],
  },
  {
    title: "The Resting Quarters (Bedroom)",
    iconSymbol: "✣",
    tips: [
      {
        title: "The Spartan Cradle",
        desc: "Infant resting areas must be completely devoid of loose blankets, pillows, and soft artifacts to prevent suffocation.",
        risk: "Critical",
      },
      {
        title: "Sealing Electric Veins",
        desc: "Cover all exposed energy sockets with sliding plates or solid plugs.",
        risk: "High",
      },
      {
        title: "Anchoring the Wardrobe",
        desc: "Heavy dressers must be bolted to the wall studs. A climbing child creates a deadly fulcrum.",
        risk: "Critical",
      },
      {
        title: "The Floor Sweep",
        desc: "Consistently sweep the floor for fallen coins, batteries, and miniature artifacts that present a severe choking hazard.",
        risk: "Medium",
      },
    ],
  },
  {
    title: "The Cleansing Chamber (Bathroom)",
    iconSymbol: "✢",
    tips: [
      {
        title: "Friction Seals",
        desc: "Apply friction mats within the basin and upon the tiles. Wet stone is treacherous ground.",
        risk: "High",
      },
      {
        title: "The Basin Lock",
        desc: "Secure the toilet lid with a mechanical lock. Toddlers possess heavy heads and can easily succumb to silent drowning.",
        risk: "Critical",
      },
      {
        title: "High Alchemist Vault",
        desc: "Store all medicinal compounds and supplements far beyond reach, securely locked.",
        risk: "Critical",
      },
      {
        title: "The Unblinking Eye",
        desc: "Never break line of sight when a child is near pooled water. Tragedy strikes in a span of seconds.",
        risk: "Critical",
      },
    ],
  },
];

const getRiskStyles = (risk: string) => {
  switch (risk) {
    case "Critical":
      return { color: "#ff4d4d", background: "rgba(139, 0, 0, 0.2)", border: "1px solid #ff4d4d" };
    case "High":
      return { color: "#ffb84d", background: "rgba(184, 134, 11, 0.2)", border: "1px solid #ffb84d" };
    case "Medium":
      return { color: "#f5e6c8", background: "rgba(245, 230, 200, 0.1)", border: "1px solid rgba(245, 230, 200, 0.3)" };
    default:
      return { color: "#A0B0C0", background: "transparent", border: "1px solid #A0B0C0" };
  }
};

/* ─── Scientific Research References ─────────────────────────────────────── */
const researchStudies = [
  {
    source: "LIBRARIUM OF HEALTH (WHO)",
    year: "2023",
    journal: "Global Report on Child Injury Prevention",
    title: "Unintentional incidents remain the primary cause of mortality in early years.",
    stat: "630K",
    statLabel: "Lost souls annually",
    finding: "Falls comprise 40.6% of household structural injuries. The vast majority of these events unfold within the gathering chambers and stairwells. Mandated structural anchoring is decreed.",
  },
  {
    source: "THE CONSUMER ARCHIVES (CPSC)",
    year: "2022",
    journal: "Annual Incident Statistics",
    title: "Unsecured monoliths send an heir to the healers every half hour.",
    stat: "17.2K",
    statLabel: "Healer visits annually",
    finding: "Over two decades, hundreds have perished under the crushing weight of untethered bookshelves and dressers. The physics of climbing create lethal tipping points.",
  },
  {
    source: "COUNCIL OF PEDIATRICS (AAP)",
    year: "2022",
    journal: "Volume 150(5)",
    title: "Miniature artifacts block airway passages in 12,000 cases monthly.",
    stat: "1 in 5",
    statLabel: "Incidents involve standard household artifacts",
    finding: "Entities under 3 years of age operate almost entirely via oral exploration. Any solid object smaller than 3.17cm in diameter poses a fatal airway blockage risk.",
  },
  {
    source: "TOME OF LANCET",
    year: "2023",
    journal: "Volume 7, Issue 4",
    title: "Environmental structural modification reduces injury rates by 46%.",
    stat: "46%",
    statLabel: "Risk reduction via modification",
    finding: "Systematic assessments across 14 territories proved that adherence to spatial hazard protocols—such as socket seals and stair barricades—drastically alters the fate of the young.",
  },
];

/* ─── Visual Stat Infographic (Parchment Chart) ──────────────────────────── */
const InjuryInfographic = () => (
  <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 20px", marginBottom: 60 }}>
    <div style={{ textAlign: "center", marginBottom: 40 }}>
      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#D4AF37", textTransform: "uppercase", letterSpacing: "0.2em", fontFamily: "Georgia, serif" }}>
        Geographic Risk Distribution
      </span>
      <h2 style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: "2rem", color: "#f5e6c8", marginTop: 8, marginBottom: 8 }}>
        Zones of Primary Hazard
      </h2>
      <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem", color: "#A0B0C0", fontStyle: "italic" }}>
        Sourced from the combined archives of Global Health, 2022–2023
      </p>
    </div>

    <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
      {[
        { room: "The Gathering Chamber", pct: 38 },
        { room: "The Hearth", pct: 26 },
        { room: "The Resting Quarters", pct: 21 },
        { room: "The Cleansing Basin", pct: 15 },
      ].map((item) => (
        <div key={item.room} style={{
          flex: "1 1 calc(25% - 20px)",
          minWidth: 200,
          background: "#0B132B",
          border: "1px solid #D4AF37",
          padding: 30,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16
        }}>
          <div style={{ fontSize: "2.5rem", fontWeight: 700, color: "#f5e6c8", fontFamily: "Georgia, serif" }}>
            {item.pct}%
          </div>
          <div style={{ width: "100%", height: 3, background: "rgba(212, 175, 55, 0.2)", position: "relative" }}>
            <div style={{ 
              position: "absolute", left: 0, top: 0, height: "100%", 
              background: "#D4AF37", width: `${item.pct}%` 
            }} />
          </div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#D4AF37", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "Georgia, serif" }}>
            {item.room}
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* ─── Research Card Component ─────────────────────────────────────────────── */
const ResearchCard = ({ study }: { study: typeof researchStudies[0] }) => (
  <div style={{
    background: "#0B132B",
    border: "1px solid rgba(212, 175, 55, 0.4)",
    padding: 30,
    display: "flex",
    flexDirection: "column",
    transition: "border-color 0.3s"
  }}
  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#D4AF37"; }}
  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(212, 175, 55, 0.4)"; }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#091024", background: "#D4AF37", padding: "4px 8px", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "Georgia, serif" }}>
        {study.source}
      </span>
      <span style={{ fontSize: "0.75rem", color: "#A0B0C0", fontFamily: "Georgia, serif" }}>
        {study.year}
      </span>
    </div>

    <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "0.95rem", color: "#D4AF37", fontStyle: "italic", marginBottom: 12 }}>
      "{study.journal}"
    </p>

    <h3 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", fontWeight: 700, color: "#f5e6c8", lineHeight: 1.4, marginBottom: 20 }}>
      {study.title}
    </h3>

    <div style={{ padding: 16, border: "1px solid rgba(212, 175, 55, 0.2)", background: "rgba(9, 16, 36, 0.5)", marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ fontSize: "2rem", fontWeight: 700, color: "#f5e6c8", fontFamily: "Georgia, serif", lineHeight: 1 }}>
        {study.stat}
      </div>
      <div style={{ fontSize: "0.85rem", color: "#A0B0C0", fontFamily: "Georgia, serif", lineHeight: 1.3 }}>
        {study.statLabel}
      </div>
    </div>

    <p style={{ fontFamily: "Georgia, serif", fontSize: "0.9rem", color: "#A0B0C0", lineHeight: 1.6 }}>
      {study.finding}
    </p>
  </div>
);

/* ─── Page Component ──────────────────────────────────────────────────────── */
const SafetyTips = () => {
  return (
    <div style={{ 
      minHeight: "100vh", 
      background: "#091024", 
      color: "#f5e6c8", 
      fontFamily: "Georgia, serif",
      position: "relative"
    }}>
      {/* Ambient Night Background */}
      <div style={{
        position: "fixed",
        inset: 0,
        backgroundImage: "url('/assets/images/auth-bg-sky.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: "blur(20px) opacity(0.1) saturate(0.5)",
        zIndex: 0,
        pointerEvents: "none"
      }} />

      <Header />

      <div style={{ position: "relative", zIndex: 1, paddingTop: 100, paddingBottom: 100 }}>
        {/* Hero */}
        <section style={{ textAlign: "center", padding: "0 20px", marginBottom: 80 }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#D4AF37", textTransform: "uppercase", letterSpacing: "0.2em" }}>
            The Ancient Archives
          </span>
          <h1 style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: "3rem", margin: "16px 0", textShadow: "0 4px 20px rgba(0,0,0,0.8)" }}>
            The Grimoire of Guardianship
          </h1>
          <p style={{ fontSize: "1.1rem", color: "#A0B0C0", maxWidth: 600, margin: "0 auto", lineHeight: 1.6 }}>
            A codex containing spatial defenses backed by global scholarly archives. Every ward and protocol carries the weight of a saved life.
          </p>
        </section>

        {/* ── Room Injury Infographic ── */}
        <InjuryInfographic />

        {/* ── Scientific Research Section ───────────────────────────────────── */}
        <section style={{ maxWidth: 1000, margin: "0 auto", padding: "0 20px", marginBottom: 80 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 30, borderBottom: "1px solid rgba(212, 175, 55, 0.3)", paddingBottom: 16 }}>
            <span style={{ fontSize: "1.5rem", color: "#D4AF37" }}>✧</span>
            <div>
              <h2 style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: "1.8rem", color: "#f5e6c8", margin: 0 }}>
                The Scrolls of Evidence
              </h2>
              <p style={{ fontSize: "0.85rem", color: "#A0B0C0", fontStyle: "italic", fontFamily: "'Cormorant Garamond', serif", margin: "4px 0 0 0" }}>
                Records transcribed from the highest authorities of healing.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 20 }}>
            {researchStudies.map((study, i) => (
              <ResearchCard key={i} study={study} />
            ))}
          </div>
        </section>

        {/* ── Dimensional Guidelines ─────────────────────────────────────────────── */}
        <section style={{ maxWidth: 1000, margin: "0 auto", padding: "0 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 60 }}>
            {categories.map((cat, ci) => (
              <div key={ci}>
                {/* Category Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                  <span style={{ fontSize: "1.2rem", color: "#D4AF37" }}>{cat.iconSymbol}</span>
                  <div>
                    <h2 style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: "1.5rem", color: "#f5e6c8", margin: 0 }}>
                      {cat.title}
                    </h2>
                  </div>
                  <div style={{ flex: 1, height: 1, background: "rgba(212, 175, 55, 0.3)", marginLeft: 20 }} />
                </div>

                {/* Tips Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 20 }}>
                  {cat.tips.map((tip, ti) => {
                    const riskStyle = getRiskStyles(tip.risk);
                    return (
                      <div key={ti} style={{
                        background: "#0B132B",
                        border: "1px solid rgba(212, 175, 55, 0.2)",
                        padding: 24,
                        display: "flex",
                        flexDirection: "column",
                        gap: 12
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                          <h3 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: "1.1rem", fontWeight: 700, color: "#D4AF37" }}>
                            {tip.title}
                          </h3>
                          <span style={{
                            ...riskStyle,
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            padding: "4px 8px",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            fontFamily: "Georgia, serif"
                          }}>
                            {tip.risk} Severity
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: "0.95rem", color: "#A0B0C0", lineHeight: 1.6 }}>
                          {tip.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
};

export default SafetyTips;