import React, { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (email) {
      // Mock logic for password reset
      setMessage(
        "If an account matches that email, a recovery link will be sent.",
      );
    } else {
      setError("Please enter your email address.");
    }
  };

  return (
    <AuthLayout title="Recovery" subtitle="Reset your password" icon="🔐">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="text-red-500 text-sm text-center bg-red-100 p-3 rounded-xl border-2 border-red-200 font-bold">
            {error}
          </div>
        )}
        {message && (
          <div className="text-green-600 text-sm text-center bg-green-100 p-3 rounded-xl border-2 border-green-200 font-bold">
            {message}
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

        <div className="pt-2">
          <button
            type="submit"
            className="w-full py-4 px-6 bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-300 hover:to-blue-400 text-white text-xl font-black rounded-2xl shadow-lg border-b-[6px] border-blue-600 active:border-b-0 active:translate-y-[6px] transition-all transform hover:-translate-y-1 block"
          >
            SEND LINK 📨
          </button>
        </div>
      </form>

      <div className="mt-8 text-center text-sm">
        <p className="text-gray-400 font-medium">
          Remembered your password?{" "}
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

export default ForgotPassword;
