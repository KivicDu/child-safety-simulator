import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
    navigate("/login");
  };

  const navLinks = [
    { label: "Home", path: "/" },
    { label: "Simulator", path: "/simulator" },
    { label: "Safety Tips", path: "/safety-tips" },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "header-glass py-3" : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 flex justify-between items-center">
        {/* Logo */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-3 group cursor-pointer"
        >
          <div className="flex flex-col">
            <span className="font-extrabold text-xl md:text-2xl tracking-tight text-slate-800 leading-tight">
              SafeHome
            </span>
            <span className="text-[10px] md:text-xs font-semibold text-pink-500 tracking-[0.2em] uppercase leading-tight">
              3D Simulator
            </span>
          </div>
        </button>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <div key={link.path} className="relative group">
              <button
                onClick={() => navigate(link.path)}
                className={`nav-link-underline text-sm font-semibold transition-colors duration-200 pb-1 ${
                  isActive(link.path)
                    ? "text-pink-600"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {link.label}
              </button>
              {isActive(link.path) && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -bottom-1.5 left-0 right-0 h-[2px] bg-gradient-to-r from-pink-400 to-rose-400 rounded-full"
                />
              )}
            </div>
          ))}
        </div>

        {/* Auth + Mobile Menu */}
        <div className="flex items-center gap-4">
          {/* Auth Buttons */}
          {user ? (
            <div className="hidden md:flex items-center gap-4">
              <span className="font-medium text-slate-500 text-sm">
                Hey, {user.name}
              </span>
              <button
                onClick={handleLogout}
                className="text-slate-400 hover:text-rose-500 font-medium text-sm transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={() => navigate("/login")}
                className="px-5 py-2.5 text-slate-600 font-semibold hover:text-slate-900 transition text-sm"
              >
                Sign in
              </button>
              <button
                onClick={() => navigate("/register")}
                className="bubble-btn px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full shadow-lg shadow-slate-200 transition text-sm flex items-center gap-2"
              >
                Get Started
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {mobileOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white/95 backdrop-blur-xl border-t border-slate-100 px-6 py-6 space-y-4 overflow-hidden"
          >
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <button
                  key={link.path}
                  onClick={() => {
                    navigate(link.path);
                    setMobileOpen(false);
                  }}
                  className={`text-left px-4 py-3 rounded-xl text-base font-semibold transition ${
                    isActive(link.path)
                      ? "bg-pink-50 text-pink-600"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </div>

            <hr className="border-slate-100" />

            {user ? (
              <div className="flex flex-col gap-3 px-4 py-2">
                <span className="font-medium text-slate-500 text-sm">
                  Signed in as{" "}
                  <strong className="text-slate-800">{user.name}</strong>
                </span>
                <button
                  onClick={handleLogout}
                  className="text-left text-rose-500 font-semibold"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    navigate("/login");
                    setMobileOpen(false);
                  }}
                  className="w-full px-4 py-3 text-slate-700 font-semibold rounded-xl bg-slate-100/50 hover:bg-slate-100 transition text-center"
                >
                  Sign in
                </button>
                <button
                  onClick={() => {
                    navigate("/register");
                    setMobileOpen(false);
                  }}
                  className="w-full px-4 py-3 bg-slate-900 text-white font-semibold rounded-xl text-center shadow-md"
                >
                  Get Started
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default Header;
