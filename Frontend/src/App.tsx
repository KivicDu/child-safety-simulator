import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import Login from "./pages/Login";
import Register from "./pages/Register";
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
