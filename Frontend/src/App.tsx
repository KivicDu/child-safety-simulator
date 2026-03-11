import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import axios from "axios";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Home from "./pages/Home";

// Lazy load heavy pages
const Simulator = lazy(() => import("./pages/Simulator"));
const SafetyTips = lazy(() => import("./pages/SafetyTips"));

// Loading fallback
const LoadingPage = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      background: "#fef2f2",
      fontFamily: "Quicksand, sans-serif",
    }}
  >
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: 48,
          height: 48,
          border: "4px solid #fda4af",
          borderTopColor: "#f43f5e",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          margin: "0 auto 16px",
        }}
      />
      <p style={{ color: "#f43f5e", fontWeight: 700 }}>Loading...</p>
    </div>
  </div>
);

function AnimatedRoutes() {
  const location = useLocation();
  const navigate = location.state?.from || "/"; // Placeholder if needed

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const response = await axios.get("/api/auth/verify", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (response.data.success) {
            localStorage.setItem("user", JSON.stringify(response.data.user));
            // Redirect to simulator if authenticated and trying to access auth pages
            if (
              [
                "/login",
                "/register",
                "/forgot-password",
                "/reset-password",
              ].some((path) => location.pathname.startsWith(path))
            ) {
              // Use window.location for a clean redirect if navigate is tricky here
              window.location.href = "/simulator";
            }
          }
        } catch (err) {
          console.error("Auth verification failed", err);
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        }
      }
    };
    initAuth();
  }, []);

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route
          path="/simulator"
          element={
            <Suspense fallback={<LoadingPage />}>
              <Simulator />
            </Suspense>
          }
        />
        <Route
          path="/safety-tips"
          element={
            <Suspense fallback={<LoadingPage />}>
              <SafetyTips />
            </Suspense>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}

export default App;
