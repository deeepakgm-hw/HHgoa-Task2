# ==============================================================================
# Multi-Stage Production Dockerfile for RAGGoa
# Unified Voice-Enabled Indic RAG Application
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build the React Frontend
# ------------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Build the Node/TypeScript Backend
# ------------------------------------------------------------------------------
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 3: Production Runtime Container
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

# Install curl for container healthcheck
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=5000

# Copy backend production dependencies & compiled dist
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production

COPY --from=backend-builder /app/backend/dist ./dist
COPY backend/data ./data
COPY backend/.env* ./

# Copy compiled frontend static assets for Express to serve
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose production port
EXPOSE 5000

# Healthcheck to verify vector database load and server responsiveness
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Launch with 4GB heap space for HNSW 84k vector store
CMD ["node", "--max-old-space-size=4096", "dist/server.js"]
