import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";

const Login = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    // Check for remembered user and auto-fill
    const storedUser = localStorage.getItem("user");
    const rememberedEmail = localStorage.getItem("rememberedEmail");

    if (storedUser && rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
      // Auto-login flow could be added here if desired:
      // navigate('/simulator');
    } else if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (email) {
      // Mock Login
      const mockUser = { name: "Explorer", email: email };
      localStorage.setItem("user", JSON.stringify(mockUser));

      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

      alert("Welcome back! 🚀");
      navigate("/simulator");
    }
  };

  return (
    <AuthLayout
      title="Welcome Back!"
      subtitle="Child Safety Simulator"
      icon="🏡"
    >
      <form onSubmit={handleLogin} className="space-y-6">
        {error && (
          <div className="text-red-500 text-sm text-center bg-red-100 p-3 rounded-xl border-2 border-red-200 font-bold">
            {error}
          </div>
        )}

        <div>
          <label className="block text-gray-600 text-sm font-extrabold uppercase tracking-wider mb-2 ml-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="name@example.com"
            className="w-full px-5 py-4 rounded-xl bg-sky-50 border-2 border-sky-100 text-gray-700 placeholder-sky-300 focus:outline-none focus:ring-4 focus:ring-sky-200 focus:border-sky-400 transition-all font-bold"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2 mx-2">
            <label className="block text-gray-600 text-sm font-extrabold uppercase tracking-wider">
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-sm text-sky-500 font-bold hover:underline"
            >
              Forgot?
            </Link>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="w-full px-5 py-4 rounded-xl bg-pink-50 border-2 border-pink-100 text-gray-700 placeholder-pink-300 focus:outline-none focus:ring-4 focus:ring-pink-200 focus:border-pink-400 transition-all font-bold"
          />
        </div>

        <div className="flex items-center ml-2">
          <input
            id="remember-me"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="w-4 h-4 text-sky-500 bg-gray-100 border-gray-300 rounded focus:ring-sky-400 focus:ring-2"
          />
          <label
            htmlFor="remember-me"
            className="ml-2 text-sm font-bold text-gray-600"
          >
            Remember me
          </label>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="w-full py-4 px-6 bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-white text-xl font-black rounded-2xl shadow-lg border-b-[6px] border-orange-600 active:border-b-0 active:translate-y-[6px] transition-all transform hover:-translate-y-1 block"
          >
            START ADVENTURE! 🚀
          </button>
        </div>
      </form>

      <div className="mt-8 text-center text-sm">
        <p className="text-gray-400 font-medium">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-sky-500 font-bold hover:underline"
          >
            Register here!
          </Link>
        </p>
        <p className="mt-2 text-gray-300">
          <Link
            to="/simulator"
            className="hover:text-gray-500 transition-colors"
          >
            ← Back to Home
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
};

export default Login;
