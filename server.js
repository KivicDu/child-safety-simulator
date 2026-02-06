import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression'; 
import path from 'path';
import { fileURLToPath } from 'url';
import uploadRoutes from './routes/upload.js';
import simulationRoutes from './routes/simulation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ SYNCED TIMEOUT CONFIGURATION
const TIMEOUTS = {
  CLIENT_REQUEST: 600000,     // 10 min (cacheManager.js)
  SERVER_PROCESSING: 660000,  // 11 min (1 min buffer)
  SERVER_SOCKET: 720000,      // 12 min (2 min buffer)
  KEEPALIVE: 660000,          // 11 min
};

console.log('⏱️ Timeout Configuration:');
console.log(`   Client request: ${TIMEOUTS.CLIENT_REQUEST / 60000} min`);
console.log(`   Server processing: ${TIMEOUTS.SERVER_PROCESSING / 60000} min`);
console.log(`   Server socket: ${TIMEOUTS.SERVER_SOCKET / 60000} min`);
console.log(`   Keep-alive: ${TIMEOUTS.KEEPALIVE / 60000} min`);

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ✅ ADD: Compression middleware (reduces response size by ~80%)
app.use(compression({
  level: 6,              // Balance between speed and compression
  threshold: 1024,       // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

console.log('✅ Compression enabled (level 6, threshold 1KB)');

// Increased limits
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// Static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Track active simulations
const activeSimulations = new Map();
let lastErrorTimestamp = null;
let lastErrorMessage = null;

// ✅ ENHANCED: Request abort handler middleware
app.use((req, res, next) => {
  try {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.requestId = requestId;
    req.startTime = Date.now();
    
    // Track request
    activeSimulations.set(requestId, {
      path: req.path,
      method: req.method,
      startTime: Date.now(),
      userAgent: req.get('user-agent'),
      ip: req.ip
    });
    
    // ✅ Handle client disconnect
    req.on('aborted', () => {
      console.log(`⚠️ Client aborted request: ${requestId}`);
      activeSimulations.delete(requestId);
    });
    
    req.on('close', () => {
      const duration = Date.now() - req.startTime;
      if (duration > 60000) { // Log if > 1 min
        console.log(`⏱️ Request ${requestId} closed after ${(duration/1000).toFixed(1)}s`);
      }
    });
    
    // ✅ Cleanup on finish
    res.on('finish', () => {
      activeSimulations.delete(requestId);
      
      const duration = Date.now() - req.startTime;
      if (duration > 10000) { // Log slow requests
        console.log(`🐌 Slow request: ${req.method} ${req.path} took ${(duration/1000).toFixed(1)}s`);
      }
    });
    
    next();
  } catch (error) {
    console.error('❌ Error in abort handler middleware:', error.message);
    next();
  }
});

// ✅ ENHANCED: Request logging
app.use((req, res, next) => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${req.method} ${req.path}`);
    
    // Log request body for POST/PUT (truncated)
    if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
      const bodyStr = JSON.stringify(req.body);
      if (bodyStr.length > 200) {
        console.log(`   Body: ${bodyStr.substring(0, 200)}...`);
      }
    }
    
    next();
  } catch (error) {
    console.error('❌ Error in logging middleware:', error.message);
    next();
  }
});

// Routes
app.use('/api', uploadRoutes);
app.use('/api/simulate', simulationRoutes);

// ✅ ENHANCED: Health check endpoint
app.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(0);
  const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(0);
  const rssMB = (memUsage.rss / 1024 / 1024).toFixed(0);
  
  const uptime = process.uptime();
  const uptimeStr = uptime > 3600 
    ? `${(uptime / 3600).toFixed(1)}h`
    : `${(uptime / 60).toFixed(0)}m`;
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: uptimeStr,
    uptimeSeconds: uptime,
    memory: {
      heapUsedMB,
      heapTotalMB,
      rssMB,
      percentage: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1)
    },
    activeSimulations: activeSimulations.size,
    activeRequests: Array.from(activeSimulations.values()).map(sim => ({
      path: sim.path,
      duration: ((Date.now() - sim.startTime) / 1000).toFixed(1) + 's'
    })),
    lastError: lastErrorTimestamp ? {
      timestamp: new Date(lastErrorTimestamp).toISOString(),
      message: lastErrorMessage,
      secondsAgo: ((Date.now() - lastErrorTimestamp) / 1000).toFixed(0)
    } : null,
    timeouts: {
      clientRequest: `${TIMEOUTS.CLIENT_REQUEST / 60000}min`,
      serverProcessing: `${TIMEOUTS.SERVER_PROCESSING / 60000}min`,
      serverSocket: `${TIMEOUTS.SERVER_SOCKET / 60000}min`
    }
  });
});

// ✅ Force GC endpoint (dev only)
if (process.env.NODE_ENV === 'development') {
  app.post('/admin/gc', (req, res) => {
    if (global.gc) {
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;
      const freedMB = ((before - after) / 1024 / 1024).toFixed(2);
      
      res.json({
        success: true,
        freedMB,
        heapUsedMB: (after / 1024 / 1024).toFixed(0),
        heapTotalMB: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(0)
      });
    } else {
      res.status(400).json({
        error: 'GC not available. Run with --expose-gc flag'
      });
    }
  });
  
  console.log('✅ Admin GC endpoint enabled (dev mode)');
}

// ✅ ENHANCED: Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  console.error('   Message:', err.message);
  console.error('   Path:', req.path);
  console.error('   Method:', req.method);
  if (err.stack) {
    console.error('   Stack:', err.stack);
  }
  
  // Track last error
  lastErrorTimestamp = Date.now();
  lastErrorMessage = err.message;
  
  // Cleanup request tracking
  if (req.requestId) {
    activeSimulations.delete(req.requestId);
  }
  
  // Send error response if headers not sent
  if (!res.headersSent) {
    res.status(500).json({ 
      error: err.message || 'Internal server error',
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ✅ SYNCED: Server timeouts
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Child Safety Simulator Server`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📂 Static files: public/`);
  console.log(`📦 Upload directory: uploads/`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
});

// ✅ Set synced timeouts
server.timeout = TIMEOUTS.SERVER_SOCKET;
server.keepAliveTimeout = TIMEOUTS.KEEPALIVE;
server.headersTimeout = TIMEOUTS.SERVER_SOCKET + 10000; // +10s buffer

console.log('✅ Server timeouts configured:');
console.log(`   Socket timeout: ${TIMEOUTS.SERVER_SOCKET / 60000}min`);
console.log(`   Keep-alive: ${TIMEOUTS.KEEPALIVE / 60000}min`);
console.log(`   Headers timeout: ${(TIMEOUTS.SERVER_SOCKET + 10000) / 60000}min`);

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n⚠️ ${signal} received - shutting down gracefully...`);
  
  // Stop accepting new connections
  server.close(() => {
    console.log('✅ Server closed');
    
    // Log active simulations
    if (activeSimulations.size > 0) {
      console.log(`⚠️ ${activeSimulations.size} active requests will be terminated`);
      activeSimulations.forEach((sim, id) => {
        const duration = (Date.now() - sim.startTime) / 1000;
        console.log(`   - ${id}: ${sim.path} (${duration.toFixed(1)}s)`);
      });
    }
    
    // Force GC before exit
    if (global.gc) {
      console.log('🗑️ Running final GC...');
      global.gc();
    }
    
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ✅ ENHANCED: Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
  console.error('   Promise:', promise);
  
  if (reason && reason.stack) {
    console.error('   Stack:', reason.stack);
  }
  
  // Track error
  lastErrorTimestamp = Date.now();
  lastErrorMessage = reason?.message || String(reason);
  
  // In production, log but don't crash
  if (process.env.NODE_ENV === 'production') {
    console.error('⚠️ Continuing despite unhandled rejection (production mode)');
  } else {
    console.error('❌ Exiting due to unhandled rejection (development mode)');
    process.exit(1);
  }
});

// ✅ ENHANCED: Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  console.error('   Message:', error.message);
  console.error('   Stack:', error.stack);
  
  // Track error
  lastErrorTimestamp = Date.now();
  lastErrorMessage = error.message;
  
  // Always exit on uncaught exception (unsafe to continue)
  console.error('❌ Exiting due to uncaught exception');
  
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// ✅ ENHANCED: Memory monitoring
if (process.env.NODE_ENV === 'development' || process.env.ENABLE_MEMORY_MONITORING === 'true') {
  const MEMORY_CHECK_INTERVAL = 30000; // 30s
  const MEMORY_WARNING_THRESHOLD = 500; // 500 MB
  const MEMORY_CRITICAL_THRESHOLD = 1000; // 1 GB
  
  setInterval(() => {
    const used = process.memoryUsage();
    const heapUsedMB = (used.heapUsed / 1024 / 1024).toFixed(0);
    const heapTotalMB = (used.heapTotal / 1024 / 1024).toFixed(0);
    const rssMB = (used.rss / 1024 / 1024).toFixed(0);
    const externalMB = (used.external / 1024 / 1024).toFixed(0);
    
    if (heapUsedMB > MEMORY_CRITICAL_THRESHOLD) {
      console.error(`🚨 CRITICAL MEMORY: ${heapUsedMB}MB / ${heapTotalMB}MB`);
      console.error(`   RSS: ${rssMB}MB, External: ${externalMB}MB`);
      console.error(`   Active requests: ${activeSimulations.size}`);
      
      // List long-running requests
      const longRunning = Array.from(activeSimulations.entries())
        .filter(([_, sim]) => Date.now() - sim.startTime > 60000)
        .map(([id, sim]) => ({
          id,
          path: sim.path,
          duration: ((Date.now() - sim.startTime) / 1000).toFixed(0) + 's'
        }));
      
      if (longRunning.length > 0) {
        console.error(`   Long-running requests (${longRunning.length}):`);
        longRunning.forEach(req => {
          console.error(`      ${req.path} (${req.duration})`);
        });
      }
      
      // Force GC
      if (global.gc) {
        console.log('   🗑️ Forcing garbage collection...');
        const before = used.heapUsed;
        global.gc();
        const after = process.memoryUsage().heapUsed;
        const freed = ((before - after) / 1024 / 1024).toFixed(1);
        console.log(`   ✅ GC freed ${freed}MB`);
        console.log(`   ✅ Heap now: ${(after / 1024 / 1024).toFixed(0)}MB`);
      }
      
    } else if (heapUsedMB > MEMORY_WARNING_THRESHOLD) {
      console.warn(`⚠️ Memory warning: ${heapUsedMB}MB / ${heapTotalMB}MB`);
      console.warn(`   RSS: ${rssMB}MB, Active requests: ${activeSimulations.size}`);
    }
  }, MEMORY_CHECK_INTERVAL);
  
  console.log(`📊 Memory monitoring enabled:`);
  console.log(`   Check interval: ${MEMORY_CHECK_INTERVAL / 1000}s`);
  console.log(`   Warning threshold: ${MEMORY_WARNING_THRESHOLD}MB`);
  console.log(`   Critical threshold: ${MEMORY_CRITICAL_THRESHOLD}MB`);
}

// ✅ Periodic cleanup task
setInterval(() => {
  const now = Date.now();
  const STALE_THRESHOLD = 900000; // 15 minutes
  let cleaned = 0;
  
  for (const [requestId, sim] of activeSimulations.entries()) {
    if (now - sim.startTime > STALE_THRESHOLD) {
      console.warn(`⚠️ Cleaning up stale request: ${requestId}`);
      console.warn(`   Path: ${sim.path}`);
      console.warn(`   Duration: ${((now - sim.startTime) / 1000 / 60).toFixed(1)}min`);
      activeSimulations.delete(requestId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} stale requests`);
    
    // Force GC after cleanup
    if (global.gc) {
      global.gc();
      console.log('🗑️ GC triggered after cleanup');
    }
  }
}, 60000); // Run every minute

console.log('✅ Periodic cleanup task enabled (every 60s)');
console.log('');
console.log('🎮 Server ready! Waiting for requests...');
console.log('');