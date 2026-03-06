import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";

const Register = () => {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match!");
      return;
    }

    if (email && password) {
      // Mock successful registration
      localStorage.setItem("user", JSON.stringify({ name, email })); // Simple session storage
      alert("Welcome to the family! 🎉");
      navigate("/simulator");
    }
  };

  return (
    <AuthLayout title="Join Us!" subtitle="Create your free account" icon="✨">
      <form onSubmit={handleRegister} className="space-y-4">
        {error && (
          <div className="text-red-500 text-xs text-center bg-red-100 p-2 rounded-xl border-2 border-red-200 font-bold animate-pulse">
            {error}
          </div>
        )}

        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Your Name"
            className="w-full px-5 py-3 rounded-xl bg-purple-50 border-2 border-purple-100 text-gray-700 placeholder-purple-300 focus:outline-none focus:ring-4 focus:ring-purple-200 focus:border-purple-400 transition-all font-bold text-sm"
          />
        </div>

        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="Email Address"
            className="w-full px-5 py-3 rounded-xl bg-purple-50 border-2 border-purple-100 text-gray-700 placeholder-purple-300 focus:outline-none focus:ring-4 focus:ring-purple-200 focus:border-purple-400 transition-all font-bold text-sm"
          />
        </div>

        <div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Password"
            className="w-full px-5 py-3 rounded-xl bg-purple-50 border-2 border-purple-100 text-gray-700 placeholder-purple-300 focus:outline-none focus:ring-4 focus:ring-purple-200 focus:border-purple-400 transition-all font-bold text-sm"
          />
        </div>

        <div>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder="Confirm Password"
            className="w-full px-5 py-3 rounded-xl bg-purple-50 border-2 border-purple-100 text-gray-700 placeholder-purple-300 focus:outline-none focus:ring-4 focus:ring-purple-200 focus:border-purple-400 transition-all font-bold text-sm"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="w-full py-3 px-6 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-lg font-black rounded-xl shadow-lg border-b-[6px] border-pink-700 active:border-b-0 active:translate-y-[6px] transition-all transform hover:-translate-y-1 block"
          >
            Sign Up Now
          </button>
        </div>
      </form>

      <div className="mt-6 text-center text-xs">
        <p className="text-gray-400 font-medium">
          Already have an account?{" "}
          <Link to="/login" className="text-sky-500 font-bold hover:underline">
            Login here
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

export default Register;
