# ==============================================================================
# Production Multi-Stage Dockerfile for RAGWave
# Unified Full-Stack Voice-Enabled Indic RAG Application (Debian glibc for ONNX)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Frontend & Backend (no large data files — see .dockerignore)
# ------------------------------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app

# Copy root and subpackage manifests only
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install backend deps (hnswlib-node native compile happens here)
RUN npm ci --prefix backend

# Install frontend deps
RUN npm ci --prefix frontend

# Copy source trees (data/ excluded via .dockerignore — saves 284 MB + RAM)
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

# Install curl for healthcheck and data download
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy production dependencies, compiled dist, and static assets
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/frontend/dist /app/frontend/dist

# Create data directory and download the 3 gzip vector store parts from GitHub
# This keeps them OUT of the builder stage (no OOM) and bakes them into runner layer
RUN mkdir -p /app/backend/data && \
    echo "Downloading vector store parts from GitHub..." && \
    curl -fSL --retry 3 \
      "https://raw.githubusercontent.com/deeepakgm-hw/HHgoa-Task2/main/backend/data/vector_store_part1.json.gz" \
      -o /app/backend/data/vector_store_part1.json.gz && \
    curl -fSL --retry 3 \
      "https://raw.githubusercontent.com/deeepakgm-hw/HHgoa-Task2/main/backend/data/vector_store_part2.json.gz" \
      -o /app/backend/data/vector_store_part2.json.gz && \
    curl -fSL --retry 3 \
      "https://raw.githubusercontent.com/deeepakgm-hw/HHgoa-Task2/main/backend/data/vector_store_part3.json.gz" \
      -o /app/backend/data/vector_store_part3.json.gz && \
    echo "✓ All 3 vector store parts downloaded successfully!" && \
    ls -lah /app/backend/data/

# Copy seed fallback from source
COPY --from=builder /app/backend/data/vector_store_seed.json /app/backend/data/vector_store_seed.json

# Server entry — data dir mapped so vectorDb finds the .json.gz parts
ENV DATA_PATH=/app/backend/data

EXPOSE 10000
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD curl -f http://127.0.0.1:${PORT:-10000}/api/health || exit 1

CMD ["node", "--max-old-space-size=4096", "dist/server.js"]

