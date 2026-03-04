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
      <section className="relative z-10 pt-28 pb-14 px-6 text-center">
        <span className="text-sm font-bold text-emerald-400 tracking-widest uppercase">
          Knowledge Base
        </span>
        <h1 className="text-4xl md:text-5xl font-black text-slate-700 mt-2 mb-4">
          Safety{" "}
          <span className="bg-gradient-to-r from-emerald-500 to-green-400 bg-clip-text text-transparent">
            Tips
          </span>{" "}
          & Guidelines
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto">
          Room-by-room safety checklist to childproof your home. Each tip
          includes a risk level and actionable advice.
        </p>
      </section>

      {/* Categories */}
      <section className="relative z-10 pb-20 px-6">
        <div className="max-w-6xl mx-auto space-y-16">
          {categories.map((cat, ci) => (
            <div key={ci}>
              {/* Category Header */}
              <div className="flex items-center gap-4 mb-8">
                <div
                  className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${cat.color} flex items-center justify-center text-2xl text-white shadow-lg`}
                >
                  {cat.icon}
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-700">
                    {cat.title}
                  </h2>
                  <p className="text-sm text-gray-400 font-bold">
                    {cat.tips.length} safety tips
                  </p>
                </div>
              </div>

              {/* Tips Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {cat.tips.map((tip, ti) => (
                  <div
                    key={ti}
                    className="card-hover glass-panel p-6 bg-white/60 flex gap-4"
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-2xl">
                      {tip.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="font-black text-slate-700">
                          {tip.title}
                        </h3>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${riskColors[tip.risk]}`}
                        >
                          {tip.risk}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 leading-relaxed">
                        {tip.desc}
                      </p>
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
