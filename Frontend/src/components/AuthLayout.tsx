import React from "react";
import { motion } from "framer-motion";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  icon: string;
}

const pageVariants = {
  initial: { opacity: 0, x: -20 },
  in: { opacity: 1, x: 0 },
  out: { opacity: 0, x: 20 },
};

const pageTransition = {
  type: "tween",
  ease: "anticipate",
  duration: 0.5,
};

const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title,
  subtitle,
  icon,
}) => {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-yellow-100 via-sky-200 to-pink-200 relative overflow-hidden font-sans">
      {/* --- BACKGROUND DECORATION --- */}
      <div className="absolute top-10 left-10 w-32 h-32 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
      <div className="absolute top-10 right-10 w-32 h-32 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-32 h-32 bg-sky-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>

      <motion.div
        initial="initial"
        animate="in"
        exit="out"
        variants={pageVariants}
        transition={pageTransition}
        className="relative z-10 w-full max-w-md p-8 mx-4 bg-white/90 backdrop-blur-sm border-4 border-white rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]"
      >
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">{icon}</div>
          <h2
            className="text-4xl font-extrabold text-sky-500 tracking-tight mb-2"
            style={{ textShadow: "1px 1px 0px #bae6fd" }}
          >
            {title}
          </h2>
          <p className="text-gray-500 font-bold text-lg">{subtitle}</p>
        </div>
        {children}
      </motion.div>
    </div>
  );
};

export default AuthLayout;
