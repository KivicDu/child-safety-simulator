// backend/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";
import uploadRoutes from "./routes/upload.js";
import simulationRoutes from "./routes/simulation.js";
import authRoutes from "./routes/auth.js";
import connectDB from "./config/db.js";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to Database
connectDB();

const app = express();

// Security: Relax CSP to allow Three.js GLTFLoader to process blob:/data: URIs for 3D models
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Logging
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// CORS: Allow specific origins (dev localhost and production domains) for frontend-backend communication
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) return cb(null, true);
      return cb(new Error("CORS not allowed"), false);
    },
    credentials: true,
  }),
);

// Rate Limiting: Prevent abuse by limiting repeated requests (default 200 per 15min)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || "2000", 10),
});

// Body parsing
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Mount API routes with rate limiter
app.use("/api", apiLimiter, uploadRoutes);
app.use("/api/simulate", apiLimiter, simulationRoutes);
app.use("/api/auth", authRoutes); // Auth routes (no rate limit for register/login)

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Deployment: Serve React frontend static files in production, fallback error handling otherwise
const frontendDist = path.join(__dirname, "../Frontend/dist");
const backendPublic = path.join(__dirname, "public");

if (process.env.NODE_ENV === "production") {
  app.use(express.static(frontendDist));
  app.get("*", (req, res) =>
    res.sendFile(path.join(frontendDist, "index.html")),
  );
} else {
  // In dev, also allow serving backend public as fallback
  app.use(express.static(backendPublic));
}

// Error handling middleware (should be last)
app.use((err, req, res, next) => {
  console.error("Server error:", err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(err && err.status ? err.status : 500).json({
    error: err?.message || "Internal Server Error",
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
server.setTimeout(5 * 60 * 1000); // 5 minutes timeout

// Debugging: Log exit signals
process.on('exit', (code) => {
  console.log(`🛑 Process exiting with code: ${code}`);
});
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT. Shutting down...');
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    console.log('📦 MongoDB connection closed.');
  }
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM. Shutting down...');
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    console.log('📦 MongoDB connection closed.');
  }
  process.exit(0);
});
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  // Only exit for truly fatal errors (e.g. out of memory)
  if (err.code === 'ERR_OUT_OF_MEMORY' || err.code === 'ENOMEM') {
    process.exit(1);
  }
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Promise Rejection:', reason);
});
