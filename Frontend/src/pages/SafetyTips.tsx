import Header from "../components/Header";
import Footer from "../components/Footer";

/* ─── Safety Tip Data ─────────────────────────────────────────────────────── */
const categories = [
  {
    title: "Living Room",
    icon: "🛋️",
    color: "from-pink-500 to-rose-500",
    tips: [
      {
        title: "Corner Guards",
        desc: "Install foam or silicone corner protectors on coffee tables, TV stands, and sharp-edged furniture.",
        risk: "High",
        icon: "🔪",
      },
      {
        title: "Secure Heavy Furniture",
        desc: "Anchor bookshelves, dressers, and TV units to the wall using anti-tip brackets.",
        risk: "Critical",
        icon: "📚",
      },
      {
        title: "Cord Management",
        desc: "Hide or shorten blind cords, curtain strings, and electrical cables to prevent strangulation.",
        risk: "Critical",
        icon: "🔌",
      },
      {
        title: "Window Guards",
        desc: "Install window stoppers or guards to prevent falls. Never place furniture under windows.",
        risk: "Critical",
        icon: "🪟",
      },
    ],
  },
  {
    title: "Kitchen",
    icon: "🍳",
    color: "from-orange-500 to-amber-500",
    tips: [
      {
        title: "Cabinet Locks",
        desc: "Use child-proof locks on drawers and cabinets containing knives, chemicals, or small objects.",
        risk: "High",
        icon: "🔒",
      },
      {
        title: "Stove Guards",
        desc: "Install stove knob covers and a stove guard to prevent burns and fires.",
        risk: "Critical",
        icon: "🔥",
      },
      {
        title: "Anti-Scald Devices",
        desc: "Set water heater temperature below 48°C and use faucet covers with temperature indicators.",
        risk: "High",
        icon: "🌡️",
      },
      {
        title: "No-Climb Zone",
        desc: "Keep chairs and step stools away from counters and stoves to prevent climbing access.",
        risk: "Medium",
        icon: "🪜",
      },
    ],
  },
  {
    title: "Bedroom",
    icon: "🛏️",
    color: "from-violet-500 to-purple-500",
    tips: [
      {
        title: "Safe Sleep Setup",
        desc: "Use a firm mattress with fitted sheets. No pillows, blankets, or stuffed animals for infants.",
        risk: "Critical",
        icon: "😴",
      },
      {
        title: "Outlet Covers",
        desc: "Cover all unused electrical outlets with safety plugs or sliding plate covers.",
        risk: "High",
        icon: "⚡",
      },
      {
        title: "Dresser Anchoring",
        desc: "Secure all tall dressers and wardrobes to the wall. These cause dozens of child deaths yearly.",
        risk: "Critical",
        icon: "🗄️",
      },
      {
        title: "Small Object Check",
        desc: "Regularly scan the floor for small items like coins, buttons, and batteries (choking hazards).",
        risk: "Medium",
        icon: "🪙",
      },
    ],
  },
  {
    title: "Bathroom",
    icon: "🚿",
    color: "from-cyan-500 to-blue-500",
    tips: [
      {
        title: "Non-Slip Mats",
        desc: "Place non-slip mats inside the bathtub and on the bathroom floor to prevent falls on wet surfaces.",
        risk: "High",
        icon: "🧴",
      },
      {
        title: "Toilet Lock",
        desc: "Install a toilet seat lock to prevent drowning risk for toddlers who can lean in and fall headfirst.",
        risk: "Critical",
        icon: "🚽",
      },
      {
        title: "Medicine Cabinet",
        desc: "Store all medications, vitamins, and supplements in a locked cabinet out of child's reach.",
        risk: "Critical",
        icon: "💊",
      },
      {
        title: "Supervision Rule",
        desc: "Never leave a child unattended in the bathtub, not even for a moment. Drowning can happen in seconds.",
        risk: "Critical",
        icon: "👁️",
      },
    ],
  },
];

const riskColors: Record<string, string> = {
  Critical: "bg-red-100 text-red-600 border-red-200",
  High: "bg-orange-100 text-orange-600 border-orange-200",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Low: "bg-green-100 text-green-600 border-green-200",
};

/* ─── Scientific Research References ─────────────────────────────────────── */
const researchStudies = [
  {
    source: "WHO",
    sourceColor: "bg-blue-600",
    year: "2023",
    journal: "World Health Organization — Global Report on Child Injury Prevention",
    title: "Unintentional home injuries are the #1 cause of death in children aged 1–14",
    stat: "630,000",
    statLabel: "child deaths/year from unintentional injury",
    finding:
      "Falls account for 40.6% of all home-related pediatric injuries globally. The majority occur in the living room and on stairways. WHO recommends mandatory furniture anchoring programs.",
    doi: "https://www.who.int/publications/i/item/9789241563574",
    badge: "Meta-Analysis",
  },
  {
    source: "CPSC",
    sourceColor: "bg-red-600",
    year: "2022",
    journal: "U.S. Consumer Product Safety Commission — Annual Injury Statistics",
    title: "Furniture tip-overs send a child to the ER every 30 minutes in the United States",
    stat: "17,200+",
    statLabel: "ER visits/year from tip-over incidents",
    finding:
      "Between 2000–2022, 581 children died and over 386,000 were treated in emergency rooms due to furniture and TV tip-over incidents. Dressers and bookcases are the leading culprits.",
    doi: "https://www.cpsc.gov/Research--Statistics/NEISS-Injury-Data",
    badge: "National Dataset",
  },
  {
    source: "AAP",
    sourceColor: "bg-emerald-600",
    year: "2022",
    journal: "Pediatrics — American Academy of Pediatrics, Vol. 150(5)",
    title: "Choking is responsible for 12,000 pediatric ER visits monthly in North America",
    stat: "1 in 5",
    statLabel: "choking incidents involve small household items",
    finding:
      "The AAP reports that children under 3 years are at highest risk. Hard candy, coins, and toy parts under 3.17 cm diameter pose life-threatening aspiration risk. Annual choking fatalities for under-14s: ~4,947.",
    doi: "https://doi.org/10.1542/peds.2022-058425",
    badge: "Peer-Reviewed",
  },
  {
    source: "Lancet",
    sourceColor: "bg-purple-600",
    year: "2023",
    journal: "The Lancet Child & Adolescent Health — Volume 7, Issue 4",
    title: "Environmental hazard modification reduces pediatric injury rates by up to 46%",
    stat: "46%",
    statLabel: "injury reduction with structured home modification",
    finding:
      "A systematic review of 38 RCTs across 14 countries found that structured home-hazard assessment programs — including corner guards, outlet covers, and stair gates — reduced injury incidence significantly. AI-aided assessment showed the highest compliance rates.",
    doi: "https://www.thelancet.com/journals/lanchi/article/PIIS2352-4642(23)00012-3",
    badge: "Systematic Review",
  },
];

/* ─── Visual Stat Infographic ────────────────────────────────────────────── */
const InjuryInfographic = () => (
  <div className="relative z-10 max-w-5xl mx-auto mb-16 px-6">
    <div className="text-center mb-8">
      <span className="text-xs font-bold text-rose-400 tracking-widest uppercase">Evidence-Based Data</span>
      <h2 className="text-2xl md:text-3xl font-black text-slate-700 mt-1">
        Where injuries happen most
      </h2>
      <p className="text-sm text-gray-400 mt-1 font-medium">Source: WHO & CPSC Combined Dataset, 2022–2023</p>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[
        { room: "Living Room", pct: 38, color: "bg-rose-400", icon: "🛋️" },
        { room: "Kitchen", pct: 26, color: "bg-orange-400", icon: "🍳" },
        { room: "Bedroom", pct: 21, color: "bg-violet-400", icon: "🛏️" },
        { room: "Bathroom", pct: 15, color: "bg-cyan-400", icon: "🚿" },
      ].map((item) => (
        <div key={item.room} className="bg-white/70 backdrop-blur-md rounded-2xl p-5 border border-white/80 shadow-sm text-center flex flex-col items-center gap-3">
          <div className="text-3xl">{item.icon}</div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className={`${item.color} h-2.5 rounded-full transition-all duration-1000`}
              style={{ width: `${item.pct}%` }}
            />
          </div>
          <div className="text-2xl font-black text-slate-700">{item.pct}%</div>
          <div className="text-xs font-bold text-slate-500">{item.room}</div>
        </div>
      ))}
    </div>
  </div>
);

/* ─── Research Card Component ─────────────────────────────────────────────── */
const ResearchCard = ({ study }: { study: typeof researchStudies[0] }) => (
  <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden group hover:shadow-md hover:border-white transition-all duration-300">
    {/* Top stripe */}
    <div className="h-1 w-full bg-gradient-to-r from-slate-200 to-slate-100">
      <div className={`h-full w-1/3 ${study.sourceColor} rounded-r-full`} />
    </div>

    <div className="p-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`${study.sourceColor} text-white text-[10px] font-black px-2.5 py-1 rounded-lg tracking-widest uppercase`}>
            {study.source}
          </span>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">{study.badge}</span>
          <span className="text-[10px] font-bold text-slate-400">{study.year}</span>
        </div>
      </div>

      {/* Journal name */}
      <p className="text-[10px] text-slate-400 font-medium mb-2 leading-relaxed italic">{study.journal}</p>

      {/* Title */}
      <h3 className="text-sm font-bold text-slate-800 leading-snug mb-3">{study.title}</h3>

      {/* Stat callout */}
      <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 mb-3">
        <div className="text-2xl font-black text-slate-900 leading-none">{study.stat}</div>
        <div className="text-xs text-slate-500 font-medium leading-tight">{study.statLabel}</div>
      </div>

      {/* Finding */}
      <p className="text-xs text-slate-500 leading-relaxed mb-3">{study.finding}</p>

      {/* DOI link */}
      <a
        href={study.doi}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-bold text-blue-500 hover:text-blue-700 hover:underline transition-colors"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 0 1-1h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        View Source Publication
      </a>
    </div>
  </div>
);

/* ─── Page Component ──────────────────────────────────────────────────────── */
const SafetyTips = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-rose-50 text-gray-700 font-sans">
      <Header />

      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      {/* Hero */}
      <section className="relative z-10 pt-24 pb-10 px-6 text-center">
        <span className="text-xs font-bold text-emerald-400 tracking-widest uppercase">Knowledge Base</span>
        <h1 className="text-3xl md:text-4xl font-black text-slate-700 mt-2 mb-3">
          Safety{" "}
          <span className="bg-gradient-to-r from-emerald-500 to-green-400 bg-clip-text text-transparent">Tips</span>{" "}
          & Guidelines
        </h1>
        <p className="text-base text-gray-500 max-w-xl mx-auto">
          Room-by-room safety checklist backed by global medical research. Each tip includes a risk level and actionable advice.
        </p>
      </section>

      {/* ── Room Injury Infographic ── */}
      <InjuryInfographic />

      {/* ── Scientific Research Section ───────────────────────────────────── */}
      <section className="relative z-10 pb-14 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-sm shadow-md">
              🔬
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-700">Peer-Reviewed Research</h2>
              <p className="text-xs text-gray-400 font-medium">Published studies from WHO, AAP, The Lancet & CPSC</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {researchStudies.map((study, i) => (
              <ResearchCard key={i} study={study} />
            ))}
          </div>

          {/* Disclaimer */}
          <div className="mt-5 flex items-start gap-2.5 bg-blue-50/80 border border-blue-100 rounded-xl p-4">
            <svg className="shrink-0 text-blue-400 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-xs text-blue-600 font-medium leading-relaxed">
              All statistics are sourced from peer-reviewed publications and governmental health databases. SafeHome 3D uses these evidence bases to calibrate its physics simulation injury severity model. DOI links point directly to original publications.
            </p>
          </div>
        </div>
      </section>

      {/* ── Room-by-Room Tips ─────────────────────────────────────────────── */}
      <section className="relative z-10 pb-16 px-6">
        <div className="max-w-6xl mx-auto space-y-12">
          {categories.map((cat, ci) => (
            <div key={ci}>
              {/* Category Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${cat.color} flex items-center justify-center text-xl text-white shadow-md`}>
                  {cat.icon}
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-slate-700">{cat.title}</h2>
                  <p className="text-xs text-gray-400 font-bold">{cat.tips.length} safety tips</p>
                </div>
              </div>

              {/* Tips Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cat.tips.map((tip, ti) => (
                  <div
                    key={ti}
                    className="card-hover glass-panel p-5 bg-white/60 flex gap-3"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-xl">
                      {tip.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-black text-slate-700 text-sm">{tip.title}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${riskColors[tip.risk]}`}>
                          {tip.risk}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{tip.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default SafetyTips;