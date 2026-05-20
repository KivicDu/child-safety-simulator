import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import axios from "axios";
import AuthPortal from "./pages/AuthPortal";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Home from "./pages/Home";

// Lazy load heavy pages
const Simulator = lazy(() => import("./pages/Simulator"));
const SafetyTips = lazy(() => import("./pages/SafetyTips"));
const TestLab = lazy(() => import("./pages/TestLab"));
const AboutUs = lazy(() => import("./pages/AboutUs"));
const ModelDiagnostic = lazy(
  () => import("./components/SafeStepsJourney/ModelDiagnostic"),
);

// Loading fallback — Fairytale theme
const LoadingPage = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      background: "#0A0F1D",
      fontFamily: "'Cinzel Decorative', 'Georgia', serif",
      flexDirection: "column",
      gap: 24,
    }}
  >
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: 48,
          height: 48,
          border: "2px solid rgba(255,228,160,0.15)",
          borderTopColor: "#ffe4a0",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          margin: "0 auto 20px",
          boxShadow: "0 0 20px rgba(255,228,160,0.15)",
        }}
      />
      <div
        style={{
          fontSize: 14,
          color: "#ffe4a0",
          textShadow: "0 0 12px rgba(255,228,160,0.6)",
          animation: "stardust-pulse 2s ease-in-out infinite",
          marginBottom: 12,
          letterSpacing: "0.2em",
        }}
      >
        ✦
      </div>
      <p
        style={{
          color: "rgba(255,248,230,0.6)",
          fontWeight: 400,
          fontSize: 13,
          letterSpacing: "0.12em",
          fontFamily: "'Cormorant Garamond', 'Georgia', serif",
          fontStyle: "italic",
        }}
      >
        Once upon a time...
      </p>
    </div>
  </div>
);

function AnimatedRoutes() {
  const location = useLocation();

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
            if (
              [
                "/login",
                "/register",
                "/forgot-password",
                "/reset-password",
              ].some((path) => location.pathname.startsWith(path))
            ) {
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

  const routeKey = ["/login", "/register"].includes(location.pathname)
    ? "auth-portal"
    : location.pathname;

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={routeKey}>
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
        <Route
          path="/about"
          element={
            <Suspense fallback={<LoadingPage />}>
              <AboutUs />
            </Suspense>
          }
        />
        <Route path="/login" element={<AuthPortal />} />
        <Route path="/register" element={<AuthPortal />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route
          path="/test-lab"
          element={
            <Suspense fallback={<LoadingPage />}>
              <TestLab />
            </Suspense>
          }
        />
        <Route
          path="/diag"
          element={
            <Suspense fallback={<LoadingPage />}>
              <ModelDiagnostic />
            </Suspense>
          }
        />
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
