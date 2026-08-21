# ==============================================================================
# Production Multi-Stage Dockerfile for RAGWave
# Unified Full-Stack Voice-Enabled Indic RAG Application (Debian glibc for ONNX)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Frontend & Backend in Unified Context
# ------------------------------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app

# Copy root and subpackage manifests
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci --prefix backend
RUN npm ci --prefix frontend

# Copy source trees
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Build backend TypeScript and frontend Vite bundle
RUN npm run build --prefix backend
RUN npm run build --prefix frontend

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime Container (Debian glibc)
# ------------------------------------------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app

# Install curl for container healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy production dependencies, compiled dist, and static assets
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/data ./data
COPY --from=builder /app/backend/data /app/backend/data
COPY --from=builder /app/frontend/dist /app/frontend/dist

EXPOSE 10000
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT:-10000}/api/health || exit 1

CMD ["node", "dist/server.js"]
