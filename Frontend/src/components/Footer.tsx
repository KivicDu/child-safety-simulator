import { useNavigate } from "react-router-dom";

const Footer = () => {
  const navigate = useNavigate();

  const navLinks = [
    {
      label: "Home",
      path: "/",
      icon: (
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
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      label: "Simulator",
      path: "/simulator",
      icon: (
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
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      ),
    },
    {
      label: "Safety Tips",
      path: "/safety-tips",
      icon: (
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
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
  ];

  return (
    <footer className="relative bg-white/60 backdrop-blur-md border-t border-pink-100/60 py-12 mt-20 overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent to-pink-50/30" />

      <div className="relative max-w-7xl mx-auto px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-gradient-to-br from-pink-400 to-rose-500 rounded-xl flex items-center justify-center shadow-md shadow-pink-200/50">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
              <span className="font-black text-lg bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent">
                SafeHome 3D
              </span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              AI-powered child safety simulation for interior spaces.
              <br />
              Protect what matters most.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-bold text-gray-700 mb-4 text-sm uppercase tracking-wider">
              Quick Links
            </h4>
            <div className="space-y-2">
              {navLinks.map((link) => (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-pink-500 font-medium transition-colors duration-200 group"
                >
                  <span className="text-gray-400 group-hover:text-pink-400 transition-colors duration-200">
                    {link.icon}
                  </span>
                  {link.label}
                </button>
              ))}
            </div>
          </div>

          {/* About */}
          <div>
            <h4 className="font-bold text-gray-700 mb-4 text-sm uppercase tracking-wider">
              About
            </h4>
            <p className="text-sm text-gray-500 leading-relaxed">
              HUTECH University
              <br />
              AI Innovation Contest 2026
            </p>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Đỗ Thư Kỳ (Backend) &amp; Triệu Đoan Kỳ (Frontend)
            </p>
          </div>
        </div>

        <div className="border-t border-pink-100/80 pt-6 text-center">
          <p className="text-sm text-gray-400 font-medium">
            © 2026 SafeHome 3D — Built with React, Three.js &amp; AI
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
