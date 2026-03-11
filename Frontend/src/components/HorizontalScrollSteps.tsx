import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const steps = [
  {
    num: "01",
    title: "Upload Your Space",
    desc: "Drag and drop a 3D model (.GLB/.GLTF) of your living room, nursery, or kitchen.",
    color: "from-pink-500 to-rose-400",
  },
  {
    num: "02",
    title: "AI Simulation",
    desc: "Smart agents mimic real child behavior: crawling, walking, pulling up, and exploring.",
    color: "from-violet-500 to-indigo-500",
  },
  {
    num: "03",
    title: "Safety Insights",
    desc: "Receive actionable safety reports detailing hidden impact zones and collision heatmaps.",
    color: "from-emerald-500 to-teal-400",
  },
];

export const HorizontalScrollSteps = () => {
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end end"],
  });

  const x = useTransform(scrollYProgress, [0, 1], ["0%", "-66.66%"]);

  return (
    <section ref={targetRef} className="relative h-[300vh]">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        {/* Background glow that follows scroll */}
        <motion.div
          className="absolute inset-0 opacity-10"
          style={{
            background: useTransform(
              scrollYProgress,
              [0, 0.5, 1],
              [
                "radial-gradient(circle at 20% 50%, #ec4899 0%, transparent 50%)",
                "radial-gradient(circle at 50% 50%, #8b5cf6 0%, transparent 50%)",
                "radial-gradient(circle at 80% 50%, #10b981 0%, transparent 50%)",
              ],
            ),
          }}
        />

        <div className="absolute top-20 left-10 md:left-24 z-10">
          <h2 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight">
            How It{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-500">
              Works.
            </span>
          </h2>
          <p className="text-slate-500 mt-4 text-lg max-w-md">
            Three simple steps to uncover hidden hazards and protect your child.
          </p>
        </div>

        <motion.div
          style={{ x }}
          className="flex gap-8 px-10 md:px-24 pt-32 pb-10"
        >
          {steps.map((step, idx) => {
            return <StepCard step={step} key={idx} />;
          })}
        </motion.div>
      </div>
    </section>
  );
};

const StepCard = ({ step }: { step: any }) => {
  return (
    <div className="group relative h-[400px] w-[80vw] md:w-[600px] overflow-hidden rounded-[2.5rem] bg-white/50 border border-white/50 p-10 flex flex-col justify-between backdrop-blur-md shrink-0 shadow-[0_8px_32px_rgba(0,0,0,0.05)]">
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Decorative large number */}
      <div className="absolute -right-4 -bottom-10 text-[200px] font-black text-slate-900/5 select-none pointer-events-none">
        {step.num}
      </div>

      <div>
        <div
          className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${step.color} p-[2px] mb-8 shadow-xl`}
        >
          <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center text-3xl font-bold text-slate-800">
            {step.num}
          </div>
        </div>

        <h3 className="text-4xl font-bold text-slate-900 mb-4 z-10 relative">
          {step.title}
        </h3>
        <p className="text-xl text-slate-600 font-medium max-w-md leading-relaxed z-10 relative">
          {step.desc}
        </p>
      </div>

      <div className="flex items-center gap-4 z-10 relative">
        <div className="h-px bg-slate-300 w-12" />
        <span className="text-sm font-bold tracking-widest text-slate-500 uppercase">
          Step {step.num}
        </span>
      </div>
    </div>
  );
};

export default HorizontalScrollSteps;
