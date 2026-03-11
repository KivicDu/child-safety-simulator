import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import AuthLayout from "../components/AuthLayout";

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      return setError("Passwords do not match");
    }

    setLoading(true);

    try {
      const response = await axios.put(`/api/auth/resetpassword/${token}`, {
        password,
      });

      if (response.data.success) {
        setMessage("Password reset successful! Redirecting to login...");
        setTimeout(() => {
          navigate("/login");
        }, 3000);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          "This reset link is invalid or has expired.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="New Password"
      subtitle="Enter your new password"
      icon="🔐"
    >
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
            New Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="••••••••"
            className="w-full px-5 py-4 rounded-xl bg-pink-50 border-2 border-pink-100 text-gray-700 placeholder-pink-300 focus:outline-none focus:ring-4 focus:ring-pink-200 focus:border-pink-400 transition-all font-bold"
          />
        </div>

        <div>
          <label className="block text-gray-600 text-sm font-extrabold uppercase tracking-wider mb-2 ml-2">
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            placeholder="••••••••"
            className="w-full px-5 py-4 rounded-xl bg-pink-50 border-2 border-pink-100 text-gray-700 placeholder-pink-300 focus:outline-none focus:ring-4 focus:ring-pink-200 focus:border-pink-400 transition-all font-bold"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-6 bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-white text-xl font-black rounded-2xl shadow-lg border-b-[6px] border-orange-600 active:border-b-0 active:translate-y-[6px] transition-all transform hover:-translate-y-1 block disabled:opacity-50"
          >
            {loading ? "UPDATING... ⏳" : "RESET PASSWORD 🚀"}
          </button>
        </div>
      </form>

      <div className="mt-8 text-center text-sm">
        <p className="mt-2 text-gray-300">
          <Link
            to="/login"
            className="hover:text-gray-500 transition-colors underline font-bold"
          >
            Back to Login
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
};

export default ResetPassword;
