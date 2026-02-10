import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const Register = () => {
    const navigate = useNavigate();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError("Passwords do not match!");
            return;
        }

        if (email && password) {
            // Mock successful registration
            localStorage.setItem('user', JSON.stringify({ name, email })); // Simple session storage
            alert('Welcome to the family! 🎉');
            navigate('/simulator');
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-pink-100 via-purple-200 to-sky-200 relative overflow-hidden font-sans">
            {/* --- BACKGROUND DECORATION --- */}
            <div className="absolute top-20 left-20 w-40 h-40 bg-purple-300 rounded-full mix-blend-multiply filter blur-2xl opacity-60 animate-blob"></div>
            <div className="absolute bottom-10 right-10 w-40 h-40 bg-sky-300 rounded-full mix-blend-multiply filter blur-2xl opacity-60 animate-blob animation-delay-2000"></div>
            <div className="absolute top-1/2 left-1/2 w-56 h-56 bg-pink-300 rounded-full mix-blend-multiply filter blur-2xl opacity-50 animate-blob animation-delay-4000"></div>

            <div className="relative z-10 w-full max-w-md p-8 mx-4 bg-white/80 backdrop-blur-md border border-white/60 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]">
                <div className="text-center mb-6">
                    <div className="text-5xl mb-2">✨</div>
                    <h2 className="text-3xl font-black text-purple-600 tracking-tight mb-1">
                        Join Us!
                    </h2>
                    <p className="text-gray-500 font-bold text-sm">Create your free account</p>
                </div>

                {/* Form */}
                <form onSubmit={handleRegister} className="space-y-4">

                    {error && <div className="text-red-500 text-xs text-center bg-red-100 p-2 rounded-lg border border-red-200 font-bold animate-pulse">{error}</div>}

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
                            className="w-full py-3 px-6 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-lg font-black rounded-xl shadow-lg shadow-purple-200 transform hover:scale-[1.02] active:scale-95 transition-all block"
                        >
                            Sign Up Now
                        </button>
                    </div>
                </form>

                <div className="mt-6 text-center text-xs">
                    <p className="text-gray-400 font-medium">
                        Already have an account? <Link to="/login" className="text-purple-600 font-bold hover:underline">Login here</Link>
                    </p>
                    <p className="mt-2 text-gray-300">
                        <Link to="/simulator" className="hover:text-gray-500 transition-colors">← Back to Home</Link>
                    </p>
                </div>

            </div>
        </div>
    );
};

export default Register;
