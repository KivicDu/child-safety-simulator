import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
} from "framer-motion";
import Header from "../components/Header";
import Footer from "../components/Footer";
import HomeScene3D from "../components/HomeScene3D";

/* ─── Animated Counter Hook ───────────────────────────────────────────────── */
function useCounter(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

/* ─── Hazard Card Data ────────────────────────────────────────────────────── */
const hazards = [
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    title: "Sharp Corners",
    desc: "Table edges and furniture corners can cause serious head injuries in toddlers who lose balance.",
    color: "from-rose-50 to-pink-50",
    border: "border-rose-100",
    iconColor: "text-rose-500",
    iconBg: "bg-rose-50",
  },
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    title: "Low Outlets",
    desc: "Electrical outlets within child's reach are among the most common household hazards.",
    color: "from-amber-50 to-orange-50",
    border: "border-amber-100",
    iconColor: "text-amber-500",
    iconBg: "bg-amber-50",
  },
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      </svg>
    ),
    title: "Unstable Shelves",
    desc: "Unsecured bookshelves and tall furniture can topple when climbed, causing crushing injuries.",
    color: "from-blue-50 to-cyan-50",
    border: "border-blue-100",
    iconColor: "text-blue-500",
    iconBg: "bg-blue-50",
  },
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    title: "Choking Hazards",
    desc: "Small toys and items on the floor present significant choking risks for infants discovering the world.",
    color: "from-purple-50 to-violet-50",
    border: "border-purple-100",
    iconColor: "text-purple-500",
    iconBg: "bg-purple-50",
  },
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m21.6 13.8-3.04-10.6A1 1 0 0 0 17.6 2.5h-11.2a1 1 0 0 0-.96.7L2.4 13.8M22 22H2M16 11V6M8 11V6M10 22v-3.5a2.5 2.5 0 0 1 5 0V22M12 11v11" />
      </svg>
    ),
    title: "Chemical Access",
    desc: "Cleaning supplies and chemicals stored at low heights can be reached and ingested by curious children.",
    color: "from-emerald-50 to-teal-50",
    border: "border-emerald-100",
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-50",
  },
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18H9" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
        <circle cx="17" cy="18" r="2" />
        <circle cx="7" cy="18" r="2" />
      </svg>
    ),
    title: "Moving Vehicles",
    desc: "Garage environments contain moving vehicles and heavy equipment lacking safety considerations.",
    color: "from-slate-50 to-gray-50",
    border: "border-slate-200",
    iconColor: "text-slate-600",
    iconBg: "bg-slate-50",
  },
];

/* ─── Steps Data ──────────────────────────────────────────────────────────── */
const steps = [
  {
    num: "01",
    title: "Upload Your Space",
    desc: "Drag and drop a 3D model (.GLB/.GLTF) of your living room, nursery, or kitchen.",
  },
  {
    num: "02",
    title: "AI Simulation",
    desc: "Smart agents mimic real child behavior: crawling, walking, pulling up, and exploring.",
  },
  {
    num: "03",
    title: "Safety Insights",
    desc: "Receive actionable safety reports detailing hidden impact zones and collision heatmaps.",
  },
];

/* ─── Parallax Image Component ─────────────────────────────────────────────── */
const ParallaxImage = ({
  src,
  className,
  offset,
  speed = 0.5,
}: {
  src: string;
  className: string;
  offset: number;
  speed?: number;
}) => {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 1000], [offset, offset - 200 * speed]);

  return (
    <motion.img
      src={src}
      style={{ y }}
      className={`absolute select-none pointer-events-none ${className}`}
      alt=""
    />
  );
};

/* ─── 3D Tilt Card Component ─────────────────────────────────────────────── */
const TiltCard = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springConfig = { stiffness: 300, damping: 30 };
  const springRotateX = useSpring(rotateX, springConfig);
  const springRotateY = useSpring(rotateY, springConfig);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      rotateX.set(-dy * 8);
      rotateY.set(dx * 8);
    },
    [rotateX, rotateY],
  );

  const handleMouseLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
  }, [rotateX, rotateY]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX: springRotateX,
        rotateY: springRotateY,
        transformStyle: "preserve-3d",
        perspective: 1200,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

/* ─── Home Page ───────────────────────────────────────────────────────────── */
const Home = () => {
  const navigate = useNavigate();
  const hazardCount = useCounter(24);
  const simCount = useCounter(12050);
  const accuracyCount = useCounter(98);

  // Mouse parallax for hero section
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothMouseX = useSpring(mouseX, { stiffness: 60, damping: 20 });
  const smoothMouseY = useSpring(mouseY, { stiffness: 60, damping: 20 });

  const heroTextX = useTransform(smoothMouseX, [-0.5, 0.5], [-12, 12]);
  const heroTextY = useTransform(smoothMouseY, [-0.5, 0.5], [-8, 8]);
  const heroSceneX = useTransform(smoothMouseX, [-0.5, 0.5], [10, -10]);
  const heroSceneY = useTransform(smoothMouseY, [-0.5, 0.5], [6, -6]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      mouseX.set(e.clientX / innerWidth - 0.5);
      mouseY.set(e.clientY / innerHeight - 0.5);
    },
    [mouseX, mouseY],
  );

  // Framer motion variants
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fadeIn: any = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staggerContainer: any = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      className="min-h-screen bg-[#fdf2f8] text-slate-700 font-sans selection:bg-pink-100 selection:text-pink-900 overflow-hidden mesh-bg noise-overlay"
    >
      <Header />

      {/* ── Animated Background Orbs ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="orb-1 absolute w-[700px] h-[700px] rounded-full opacity-50"
          style={{
            background:
              "radial-gradient(circle, hsla(330,100%,88%,0.7) 0%, transparent 70%)",
            top: "-15%",
            left: "-10%",
          }}
        />
        <div
          className="orb-2 absolute w-[600px] h-[600px] rounded-full opacity-40"
          style={{
            background:
              "radial-gradient(circle, hsla(270,100%,92%,0.7) 0%, transparent 70%)",
            top: "40%",
            right: "-15%",
          }}
        />
        <div
          className="orb-3 absolute w-[500px] h-[500px] rounded-full opacity-35"
          style={{
            background:
              "radial-gradient(circle, hsla(350,100%,90%,0.6) 0%, transparent 70%)",
            bottom: "-10%",
            left: "20%",
          }}
        />
      </div>

      {/* ── Parallax 3D Assets Background ── */}
      <ParallaxImage
        src="/glass_sphere.png"
        className="w-[420px] blur-[3px] opacity-75 top-[8%] -left-[8%]"
        offset={0}
        speed={0.8}
      />
      <ParallaxImage
        src="/abstract_shapes.png"
        className="w-[520px] blur-[5px] opacity-55 top-[35%] -right-[12%]"
        offset={0}
        speed={1.2}
      />
      <ParallaxImage
        src="/glass_sphere.png"
        className="w-[260px] blur-[2px] opacity-65 top-[78%] left-[4%]"
        offset={0}
        speed={0.4}
      />

      {/* ════════════════════════════════════════════════════════════════════
          HERO SECTION
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center pt-24 pb-12 px-6 lg:px-12 z-10 w-full max-w-[1400px] mx-auto">
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-12 xl:gap-20 items-center">
          {/* Left: Text */}
          <motion.div
            style={{ x: heroTextX, y: heroTextY }}
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="text-center lg:text-left z-20"
          >
            <motion.div
              variants={fadeIn}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-md border border-white text-pink-600 text-xs font-bold mb-8 shadow-sm"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500" />
              </span>
              AI-Powered Child Protection
            </motion.div>

            <motion.h1
              variants={fadeIn}
              className="text-5xl md:text-6xl xl:text-7xl font-extrabold leading-[1.1] mb-6 tracking-tight text-slate-900"
            >
              See hidden dangers
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-400">
                before they happen.
              </span>
            </motion.h1>

            <motion.p
              variants={fadeIn}
              className="text-lg md:text-xl text-slate-500 font-medium mb-10 max-w-lg mx-auto lg:mx-0 leading-relaxed"
            >
              Upload your 3D room model. Our AI agents simulate real toddler
              movement physics to detect sharp edges, falls, and hazards
              beautifully and accurately.
            </motion.p>

            <motion.div
              variants={fadeIn}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <button
                onClick={() => navigate("/simulator")}
                className="bubble-btn px-8 py-4 bg-slate-900 text-white font-semibold rounded-2xl shadow-xl shadow-slate-900/20 transition-all hover:shadow-slate-900/40 text-lg flex items-center justify-center gap-2 group"
              >
                Launch Simulator
                <svg
                  className="group-hover:translate-x-1 transition-transform"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
              <a
                href="#how-it-works"
                className="px-8 py-4 bg-white/50 text-slate-700 font-semibold rounded-2xl border border-white shadow-sm hover:bg-white transition-all text-lg text-center backdrop-blur-md flex items-center justify-center"
              >
                How It Works
              </a>
            </motion.div>
          </motion.div>

          {/* Right: 3D Scene */}
          <motion.div
            style={{ x: heroSceneX, y: heroSceneY }}
            initial={{ opacity: 0, scale: 0.9, rotateY: 15 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
            className="relative w-full z-20"
          >
            <motion.div
              whileHover={{ scale: 1.02, rotateX: 1.5, rotateY: -2 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              style={{ transformStyle: "preserve-3d", perspective: 1200 }}
              className="relative h-[400px] xl:h-[550px] w-full rounded-[2rem] overflow-hidden glass-panel border border-white/60 p-2"
            >
              <div className="w-full h-full rounded-[1.5rem] overflow-hidden relative bg-white/40">
                <Suspense
                  fallback={
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-8 h-8 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
                    </div>
                  }
                >
                  <HomeScene3D />
                </Suspense>
              </div>
            </motion.div>

            {/* Floating Stats Badge */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
              className="absolute -bottom-6 -left-6 glass-panel px-6 py-4 flex items-center gap-4 border border-white shadow-xl max-w-xs"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center text-pink-600 text-sm font-bold">
                98%
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">
                  High Accuracy
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  Physics-based simulation
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          STATS SECTION
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative z-20 py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {[
              { value: hazardCount, label: "Hazards Types Detected" },
              { value: simCount.toLocaleString(), label: "Simulations Run" },
              { value: accuracyCount + "%", label: "Collision Accuracy" },
            ].map((stat, i) => (
              <motion.div
                variants={fadeIn}
                key={i}
                className="glass-panel p-8 text-center"
              >
                <div className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700 font-serif">
                  {stat.value}
                </div>
                <div className="text-sm font-semibold text-slate-500 mt-2 uppercase tracking-wide">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          COMMON RISKS (CARDS with 3D Tilt)
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative z-20 py-24 px-6 bg-white/50 backdrop-blur-3xl border-y border-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
              A home shouldn&apos;t be a{" "}
              <span className="text-pink-500">hazard zone.</span>
            </h2>
            <p className="text-slate-500 mt-4 max-w-2xl mx-auto text-lg font-medium">
              We identify everyday objects that pose hidden threats to toddlers,
              mapping their interactions before your child does.
            </p>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {hazards.map((h, i) => (
              <motion.div variants={fadeIn} key={i}>
                <TiltCard
                  className={`card-3d glass-panel p-8 bg-gradient-to-br ${h.color} border ${h.border} flex flex-col items-start h-full cursor-default`}
                >
                  <div
                    className={`w-12 h-12 ${h.iconBg} rounded-2xl flex items-center justify-center mb-6 shadow-sm border ${h.border} ${h.iconColor}`}
                  >
                    {h.icon}
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-3 tracking-tight">
                    {h.title}
                  </h3>
                  <p className="text-slate-500 leading-relaxed font-medium">
                    {h.desc}
                  </p>
                </TiltCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          HOW IT WORKS
      ════════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="relative z-20 py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
              Three steps to a{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-indigo-500">
                safer home.
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative lg:px-10">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-[20%] left-[10%] w-[80%] h-px bg-gradient-to-r from-transparent via-pink-200 to-transparent" />

            {steps.map((s, i) => (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.2,
                  duration: 0.65,
                  ease: [0.16, 1, 0.3, 1],
                }}
                key={i}
                className="relative text-center"
              >
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 3 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className="w-16 h-16 mx-auto rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-xl font-extrabold text-slate-800 shadow-xl shadow-slate-200/50 mb-8 z-10 relative"
                >
                  {s.num}
                </motion.div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">
                  {s.title}
                </h3>
                <p className="text-base text-slate-500 leading-relaxed font-medium max-w-[280px] mx-auto">
                  {s.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          CTA SECTION
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative z-20 pb-32 px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-5xl mx-auto"
        >
          <div className="glass-panel p-12 md:p-20 bg-gradient-to-br from-slate-900 to-slate-800 text-center border-none relative overflow-hidden group">
            {/* Background glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-full bg-gradient-to-b from-pink-500/20 to-transparent blur-3xl opacity-50 group-hover:opacity-100 transition-opacity duration-700" />
            {/* Subtle grid overlay */}
            <div
              className="absolute inset-0 opacity-5"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />

            <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6 tracking-tight relative z-10">
              Ready to secure your space?
            </h2>
            <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl mx-auto font-medium relative z-10">
              Transform your 3D models into actionable safety insights in
              seconds. No setup required.
            </p>
            <motion.button
              onClick={() => navigate("/simulator")}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="bubble-btn px-10 py-5 bg-white text-slate-900 font-bold rounded-2xl shadow-xl transition-all text-lg inline-flex items-center gap-2 relative z-10"
            >
              Start Free Simulation
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </motion.button>
          </div>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;
