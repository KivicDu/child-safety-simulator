import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const Login = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (email) {
      // Mock Login
      const mockUser = { name: "Explorer", email: email };
      localStorage.setItem('user', JSON.stringify(mockUser));
      alert('Welcome back! 🚀');
      navigate('/simulator');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-yellow-100 via-sky-200 to-pink-200 relative overflow-hidden font-sans">
      {/* --- BACKGROUND DECORATION --- */}
      <div className="absolute top-10 left-10 w-32 h-32 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
      <div className="absolute top-10 right-10 w-32 h-32 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-32 h-32 bg-sky-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>

      <div className="relative z-10 w-full max-w-md p-8 mx-4 bg-white/90 backdrop-blur-sm border-4 border-white rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🏡</div>
          <h2 className="text-4xl font-extrabold text-sky-500 tracking-tight mb-2" style={{ textShadow: '2px 2px 0px #bae6fd' }}>
            Welcome Back!
          </h2>
          <p className="text-gray-500 font-bold text-lg">Child Safety Simulator</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-6">

          {error && <div className="text-red-500 text-sm text-center bg-red-100 p-3 rounded-xl border-2 border-red-200 font-bold">{error}</div>}

          <div>
            <label className="block text-gray-600 text-sm font-extrabold uppercase tracking-wider mb-2 ml-2">Email</label>
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
            <label className="block text-gray-600 text-sm font-extrabold uppercase tracking-wider mb-2 ml-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-5 py-4 rounded-xl bg-pink-50 border-2 border-pink-100 text-gray-700 placeholder-pink-300 focus:outline-none focus:ring-4 focus:ring-pink-200 focus:border-pink-400 transition-all font-bold"
            />
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
            Don't have an account? <Link to="/register" className="text-sky-500 font-bold hover:underline">Register here!</Link>
          </p>
          <p className="mt-2 text-gray-300">
            <Link to="/simulator" className="hover:text-gray-500 transition-colors">← Back to Home</Link>
          </p>
        </div>

      </div>
    </div>
  );
};

export default Login;