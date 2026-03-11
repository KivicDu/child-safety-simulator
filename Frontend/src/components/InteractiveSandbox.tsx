import React, { useRef, useState, useEffect } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useMotionTemplate,
} from "framer-motion";

export const InteractiveSandbox = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Mouse position values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Smooth springs for the scanner circle
  const smoothX = useSpring(mouseX, { stiffness: 300, damping: 25 });
  const smoothY = useSpring(mouseY, { stiffness: 300, damping: 25 });

  // Size of the scanner
  const activeSize = useMotionValue(0);
  const smoothSize = useSpring(activeSize, { stiffness: 200, damping: 20 });

  useEffect(() => {
    activeSize.set(isHovered ? 200 : 0);
  }, [isHovered, activeSize]);

  useEffect(() => {
    // initialize at center
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      mouseX.set(rect.width / 2);
      mouseY.set(rect.height / 2);
    }
  }, [mouseX, mouseY]);

  function handleMouseMove(e: React.MouseEvent) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  }

  return (
    <div className="relative w-full max-w-4xl mx-auto my-20">
      <div className="text-center mb-8">
        <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Interactive AI Scanner
        </h3>
        <p className="text-slate-500 font-medium mt-2">
          Hover over the room blueprint below to reveal hidden physics colliders
          and hazards.
        </p>
      </div>

      <motion.div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative h-[500px] w-full bg-slate-100 rounded-[2rem] overflow-hidden border-2 border-slate-200 cursor-crosshair shadow-inner"
        style={{ perspective: 1000 }}
      >
        {/* === BASE LAYER (Normal Room View) === */}
        <div className="absolute inset-0 p-8 flex flex-col items-center justify-center opacity-80">
          <div className="w-full h-full relative border-2 border-slate-300 border-dashed rounded-xl p-4 flex items-center justify-center">
            {/* Sofa */}
            <div className="absolute top-10 w-[60%] h-24 bg-slate-300 rounded-3xl" />
            {/* Coffee Table */}
            <div className="absolute top-40 w-48 h-24 bg-slate-300/50 rounded-xl" />
            {/* TV Unit */}
            <div className="absolute bottom-10 w-[70%] h-12 bg-slate-300 rounded-xl" />
            {/* Rug */}
            <div className="absolute top-36 w-[50%] h-32 border-4 border-slate-200 rounded-full" />
            <p className="absolute bottom-4 right-6 text-slate-400 font-bold tracking-widest uppercase">
              Safe View
            </p>
          </div>
        </div>

        {/* === HIDDEN LAYER (AI Physics/Hazard View) === */}
        <motion.div
          className="absolute inset-0 bg-slate-900 pointer-events-none z-10 p-8 flex flex-col items-center justify-center"
          style={{
            WebkitClipPath: useMotionTemplate`circle(${smoothSize}px at ${smoothX}px ${smoothY}px)`,
            clipPath: useMotionTemplate`circle(${smoothSize}px at ${smoothX}px ${smoothY}px)`,
          }}
        >
          {/* Grid Background in Hidden Layer */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(rgba(236,72,153,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(236,72,153,0.3) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          <div className="w-full h-full relative border-2 border-pink-500/50 border-dashed rounded-xl p-4 flex items-center justify-center">
            {/* Sofa Wireframe */}
            <div className="absolute top-10 w-[60%] h-24 border-2 border-blue-400/80 bg-blue-500/10 rounded-3xl" />

            {/* Coffee Table - HAZARD */}
            <div className="absolute top-40 w-48 h-24 border-2 border-rose-500 bg-rose-500/20 rounded-xl">
              <div className="absolute -top-3 -right-3 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center text-xs font-bold animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.6)]">
                !
              </div>
              <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center text-xs font-bold animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.6)]">
                !
              </div>
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-rose-400 text-xs font-bold whitespace-nowrap bg-slate-900/80 px-2 py-1 rounded">
                Sharp Edge
              </span>
            </div>

            {/* TV Unit - HAZARD */}
            <div className="absolute bottom-10 w-[70%] h-12 border-2 border-orange-500 bg-orange-500/20 rounded-xl">
              <div className="absolute -top-3 left-1/2 w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-xs font-bold animate-pulse">
                !
              </div>
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-orange-400 text-xs font-bold whitespace-nowrap bg-slate-900/80 px-2 py-1 rounded">
                Unsecured Heavy Object
              </span>
            </div>

            {/* Rug */}
            <div className="absolute top-36 w-[50%] h-32 border-4 border-emerald-400/50 rounded-full border-dashed" />

            <p className="absolute bottom-4 right-6 text-pink-500 font-bold tracking-widest uppercase flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
              AI Physics Mesh
            </p>
          </div>
        </motion.div>

        {/* Custom Cursor Ring */}
        <motion.div
          className="absolute pointer-events-none z-20 border-2 border-pink-500 rounded-full"
          style={{
            x: smoothX,
            y: smoothY,
            width: smoothSize,
            height: smoothSize,
            translateX: "-50%",
            translateY: "-50%",
            opacity: isHovered ? 1 : 0,
          }}
        />
        <motion.div
          className="absolute pointer-events-none z-20 w-8 h-8 flex items-center justify-center"
          style={{
            x: smoothX,
            y: smoothY,
            translateX: "-50%",
            translateY: "-50%",
            opacity: isHovered ? 1 : 0,
          }}
        >
          <div className="w-1 h-1 bg-pink-500 rounded-full" />
        </motion.div>
      </motion.div>
    </div>
  );
};

export default InteractiveSandbox;
