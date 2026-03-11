# ============================================================
# Stage 1: Build Frontend (React + Vite)
# ============================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/Frontend

# Copy package files and install deps
COPY Frontend/package*.json ./
RUN npm install --legacy-peer-deps

# Copy source and build
COPY Frontend/ ./
RUN npm run build

# ============================================================
# Stage 2: Production Backend
# ============================================================
FROM node:20-alpine AS production

WORKDIR /app

# Install only backend deps
COPY Backend/package*.json ./
RUN npm install --omit=dev

# Copy backend source
COPY Backend/ ./

# Copy built frontend from Stage 1 -> Backend expects at ../Frontend/dist
COPY --from=frontend-builder /app/Frontend/dist ../Frontend/dist

# Expose backend port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Run in production mode
ENV NODE_ENV=production

CMD ["node", "--expose-gc", "server.js"]
