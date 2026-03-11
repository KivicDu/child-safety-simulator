import React, { useRef, useState } from "react";
import { motion, useMotionValue, useMotionTemplate } from "framer-motion";

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
}

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = "",
  spotlightColor = "rgba(255, 255, 255, 0.2)",
}) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const radius = useMotionValue(0);

  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  function onMouseMove({
    currentTarget,
    clientX,
    clientY,
  }: React.MouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  function onMouseEnter() {
    setIsHovered(true);
    radius.set(300); // Expanding spotlight
  }

  function onMouseLeave() {
    setIsHovered(false);
    radius.set(0); // contracting spotlight
  }

  const background = useMotionTemplate`radial-gradient(${
    isHovered ? radius : 0
  }px circle at ${mouseX}px ${mouseY}px, ${spotlightColor}, transparent 80%)`;

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={onMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group relative overflow-hidden rounded-3xl border border-white/20 bg-white/10 backdrop-blur-md shadow-2xl transition-all hover:border-white/50 hover:shadow-pink-500/10 ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              ${isHovered ? 400 : 0}px circle at ${mouseX}px ${mouseY}px,
              rgba(255,255,255,0.4),
              transparent 40%
            )
          `,
        }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 z-0 transition duration-300 group-hover:opacity-100 opacity-0"
        style={{ background }}
      />
      {/* 3D Inner Content Container */}
      <div className="relative z-10 h-full w-full">{children}</div>
    </motion.div>
  );
};

export default SpotlightCard;
