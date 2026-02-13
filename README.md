# 🛡️ Child Safety Simulator

**AI-Powered Child Safety Simulation System** | React + Vite + Node.js + Three.js

![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.0.0-blue?style=flat-square)
![Todos](https://img.shields.io/badge/Todos-20/20%20Complete-success?style=flat-square)

A comprehensive full-stack web application for simulating child safety scenarios with 3D interactive visualization, real-time physics-based collision detection, AI-powered behavior analysis, and comprehensive safety reports.

---

## 🚀 Quick Start (5 minutes)

```bash
# 1. Install all dependencies
npm run install-all

# 2. Run development servers (Backend + Frontend)
npm run dev

# Access the app at http://localhost:3000
```

**First time?** See [QUICK_START.md](QUICK_START.md) for detailed setup.

---

## ✨ Core Features

### 🎮 Simulation Engine
- ✅ Upload 3D models (GLB/GLTF)
- ✅ Multi-agent physics simulation with Rapier3D
- ✅ Real-time collision detection with event tracking
- ✅ AI-powered child behavior agents (Google Gemini API)
- ✅ Customizable age groups (Infant to Preteen)
- ✅ Interactive 3D heatmap visualization

### 👥 User Management
- ✅ User registration & login with secure password hashing
- ✅ Profile management with token-based auth
- ✅ Session persistence across page reloads
- ✅ User data stored securely (SHA-256 hashed)

### 📊 Analytics & Reporting
- ✅ Real-time progress tracking (0-100%)
- ✅ Collision events table with detailed information
- ✅ Injury risk calculations per age group
- ✅ Excel report export (.xlsx format)
- ✅ Heatmap visualization of danger zones

### 🔒 Security & Performance
- ✅ CORS protection
- ✅ Rate limiting (200 req/min)
- ✅ Helmet.js security headers
- ✅ Async background simulation processing
- ✅ Error handling & validation
- ✅ Morgan HTTP request logging

---

## 📦 Project Structure

```
child-safety-simulator/
├── Backend/
│   ├── server.js                      # Express server entry point
│   ├── package.json
│   ├── controllers/                   # Business logic
│   │   ├── authController.js         # Auth endpoints (register, login, etc)
│   │   ├── simulationController.js   # Simulation endpoints
│   │   └── batchSimulationController.js
│   ├── routes/
│   │   ├── auth.js                   # Auth routes (6 endpoints)
│   │   ├── simulation.js             # Simulation API
│   │   └── upload.js                 # File upload
│   ├── services/
│   │   ├── physicsEngine.js          # Rapier3D wrapper
│   │   ├── behaviorManager.js        # Child behavior simulation
│   │   ├── injuryCalculator.js       # Risk assessment
│   │   ├── hybridBehaviorEngine.js   # AI behavior logic
│   │   └── geminiAPI.js              # Google Generative AI
│   ├── utils/
│   │   ├── glbParser.js
│   │   ├── colliderGenerator.js
│   │   └── objectClassifier.js
│   ├── config/
│   │   └── ageGroups.js             # Age group definitions
│   ├── data/                         # User storage
│   ├── simulations/                  # Saved simulation results
│   └── test/                         # Test files
│       ├── auth_test.js             # Auth endpoint tests
│       └── run_sim_e2e.js           # E2E simulation test
│
├── Frontend/
│   ├── vite.config.ts               # Vite configuration with proxy
│   ├── tsconfig.json
│   ├── tailwind.config.js           # Tailwind CSS config
│   ├── package.json
│   ├── src/
│   │   ├── main.tsx                 # Entry point
│   │   ├── App.tsx                  # Router setup
│   │   ├── App.css                  # Styles
│   │   ├── pages/
│   │   │   ├── Login.tsx            # Authentication page
│   │   │   ├── Register.tsx         # Registration page
│   │   │   └── Simulator.tsx        # Main simulator UI
│   │   └── index.css                # Global Tailwind styles
│   └── dist/                        # Build output (production)
│
├── package.json                     # Root (installs both)
├── README.md                        # 📍 This file
├── QUICK_START.md                   # Getting started guide
├── API_DOCUMENTATION.md             # Complete API reference
└── AUTH_DOCUMENTATION.md            # Authentication guide
```

---

## 🔌 API Endpoints

### Authentication (Token-based)
```
POST   /api/auth/register       Register new user
POST   /api/auth/login          User login (returns token)
POST   /api/auth/logout         User logout
GET    /api/auth/verify         Verify token validity
GET    /api/auth/profile        Get user profile (requires token)
PUT    /api/auth/profile        Update user profile (requires token)
```

### Simulation
```
POST   /api/simulate/start      Start new simulation
GET    /api/simulate/:id/status Poll simulation progress
GET    /api/simulate/:id/events Get collision events
GET    /api/simulate/:id/heatmap Get heatmap data
```

### File Upload
```
POST   /api/upload              Upload GLB 3D model
```

### Health
```
GET    /api/health              Server health check
```

**Full Docs:** See [API_DOCUMENTATION.md](API_DOCUMENTATION.md)

---

## 🔐 Authentication Example

### Register
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securePassword123",
    "confirmPassword": "securePassword123"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "securePassword123"
  }'

# Response: { "token": "eyJhbGciOi..." }
```

### Use Token in Requests
```bash
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer eyJhbGciOi..."
```

**Full Details:** See [AUTH_DOCUMENTATION.md](AUTH_DOCUMENTATION.md)

---

## 📝 Available Commands

### Installation & Setup
```bash
npm run install-all           # Install Backend + Frontend dependencies
```

### Development
```bash
npm run dev                   # Run Backend + Frontend concurrently
npm run dev:backend           # Backend only (port 3000)
npm run dev:frontend          # Frontend only (Vite dev server)
```

### Production
```bash
npm run build                 # Build frontend (creates Frontend/dist)
npm start                     # Run server in production mode
```

### Testing
```bash
npm run test:auth             # Test authentication endpoints
npm run test:e2e              # Test end-to-end simulation flow
```

### Cleanup
```bash
npm run clean                 # Clean build artifacts and cache
```

---

## 🛠️ Tech Stack

### Backend
| Technology | Purpose |
|-----------|---------|
| **Node.js** | JavaScript runtime |
| **Express 5** | Web server framework |
| **Rapier3D** | Physics engine |
| **Google Generative AI** | AI behavior agents |
| **Multer** | File upload handling |
| **Morgan** | HTTP request logging |
| **Helmet** | Security headers |
| **Express Rate Limit** | Rate limiting |

### Frontend
| Technology | Purpose |
|-----------|---------|
| **React 18** | UI library |
| **TypeScript** | Type safety |
| **Vite** | Build tool (ultra-fast) |
| **Three.js** | 3D visualization |
| **@react-three/fiber** | React 3D rendering |
| **React Router v6** | Client-side routing |
| **Tailwind CSS** | Styling |
| **XLSX** | Excel export |

### DevOps & Infrastructure
| Technology | Purpose |
|-----------|---------|
| **npm** | Package management |
| **Concurrently** | Run multiple commands |
| **NodeMon** | Auto-reload development |
| **dotenv** | Environment variables |

---

## ⚙️ Configuration

### Environment Variables

Create `Backend/.env`:
```env
NODE_ENV=development
PORT=3000
PARSED_DIR=./parsed
SIMULATION_DIR=./simulations
RATE_LIMIT_MAX=200
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

For production, update `ALLOWED_ORIGINS` to your domain.

### Age Groups Configuration

Edit `Backend/config/ageGroups.js` to customize:
- Infant (0-1y)
- Toddler (1-3y)
- Preschool (3-5y)
- School (6-10y)
- Preteen (10-14y)

---

## 🧪 Testing

### Run Auth Tests
```bash
npm run test:auth
```
Tests: register validation, login flow, token verification, profile CRUD, unused token rejection

### Run E2E Simulation Test
```bash
npm run test:e2e
```
Tests: model upload, simulation startup, progress polling (0→100%), collision events retrieval

**All Tests Status:** ✅ **PASSING**

---

## 🐛 Troubleshooting

### Frontend only shows pink background
```bash
# Clear browser cache and rebuild
npm run build
# Then refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
```

### Port 3000 already in use (Windows)
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Port 3000 already in use (macOS/Linux)
```bash
lsof -i :3000
kill -9 <PID>
```

### CORS errors
Update `ALLOWED_ORIGINS` in `Backend/.env` to include your frontend URL

### Dependencies issues
```bash
npm run clean              # Remove node_modules and dist
npm run install-all        # Reinstall everything
npm run build              # Rebuild
```

### Backend won't start
```bash
cd Backend
npm install
node server.js
```

**For more help:** See [QUICK_START.md](QUICK_START.md)

---

## 📊 Feature Checklist

| Feature | Status | Notes |
|---------|--------|-------|
| User Authentication | ✅ | 6 endpoints, SHA-256 hashing |
| Registration & Login | ✅ | Email validation, password strength |
| Token verification | ✅ | Stateless JWT-like tokens |
| Profile Management | ✅ | Update user info |
| GLB Model Upload | ✅ | Multer integration |
| Physics Simulation | ✅ | Rapier3D engine, async runner |
| Progress Tracking | ✅ | Real-time polling (0-100%) |
| Collision Detection | ✅ | Event tracking with timestamps |
| 3D Visualization | ✅ | Three.js heatmap |
| Injury Calculation | ✅ | Per age group risk assessment |
| Excel Export | ✅ | Comprehensive reports |
| Age Groups | ✅ | 5 categories (Infant→Preteen) |
| Error Handling | ✅ | Validation, try-catch, error responses |
| CORS Protection | ✅ | Configured origins |
| Rate Limiting | ✅ | 200 req/min (configurable) |
| Security Headers | ✅ | Helmet.js |
| HTTP Logging | ✅ | Morgan middleware |
| Async Processing | ✅ | Background simulation runner |
| Database Persistence | ✅ | JSON file storage |
| Build System | ✅ | Vite (ultra-fast) |

---

## 🚀 Deployment Guide

### Quick Docker Deploy
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm run install-all && npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Update `ALLOWED_ORIGINS` for your domain
- [ ] Configure `RATE_LIMIT_MAX` appropriately
- [ ] Set up HTTPS/SSL
- [ ] Configure monitoring & logging
- [ ] Set up database backups
- [ ] Test all API endpoints
- [ ] Monitor server resources

---

## 📚 Additional Documentation

- **[QUICK_START.md](QUICK_START.md)** — 5-minute setup guide
- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** — Complete API reference with examples
- **[AUTH_DOCUMENTATION.md](AUTH_DOCUMENTATION.md)** — Authentication system details

---

## 📞 Support & Issues

1. Check the [Troubleshooting](#-troubleshooting) section
2. Review test files for examples: `Backend/test/*.js`
3. Check [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for endpoint usage
4. See [AUTH_DOCUMENTATION.md](AUTH_DOCUMENTATION.md) for auth flow

---

## 📄 License

MIT License - Feel free to use this project for educational and commercial purposes.

---

## 👥 Contributors

- **Backend Architecture:** Full simulation engine, physics integration, API design
- **Frontend Development:** React UI, 3D visualization, real-time updates
- **AI Integration:** Google Generative AI for child behavior simulation
- **Testing:** Comprehensive test coverage for auth and simulation

---

**Status:** ✅ Production Ready | **Version:** 1.0.0 | **Last Updated:** Feb 9, 2026

All 20 todos completed. Project is ready for deployment.
