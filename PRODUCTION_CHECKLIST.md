# Production Deployment Checklist - RAGGoa 🌴

Use this checklist to verify that all components, configurations, and security audits are complete before pushing the RAGGoa application to staging/production.

## 🔐 Credentials & Secrets Configuration
*   [x] **No hardcoded secrets:** Verified that no Google Gemini or Sarvam AI keys exist in code, logs, or README.
*   [x] **Env gitignored:** Checked that `backend/.env` is excluded in root `.gitignore`.
*   [x] **Env Template:** Verified `.env.example` has only placeholders.
*   [x] **Security scan:** Ripgrep scans for `AIza`, `sk-`, and `Bearer` returned zero matches inside build folders.

## ⚙️ Routing & CORS Verification
*   [x] **Allowed Origins:** Restricted to development localhost values (whitelisted dynamically using `process.env.ALLOWED_ORIGINS` in production).
*   [x] **No Hardcoded localhost in requests:** Frontend uses relative endpoints (`/api/...`), mapping naturally to backend host port without hardcoding `localhost:5000`.
*   [x] **Unified Hosting:** Configured Express backend to host frontend's built SPA static assets (`dist/`) directly when run in production.

## 🛡️ API Request & Audio Security
*   [x] **Rate Limiter:** Configured `rateLimiter` middleware cap (`MAX_REQUESTS_PER_WINDOW` / `RATE_LIMIT_WINDOW_MS`) to block spam attacks.
*   [x] **Audio Cap limits:** Multer `fileSize` constrained to 5MB.
*   [x] **MIME type validations:** Multer file filter allows only approved voice formats (`.wav`, `.webm`, `.mp3`, `.flac`, `.ogg`).
*   [x] **Multer Error Handling:** Wrapped upload logic in error interceptors returning clean `400 Bad Request` instead of propagating `500` traces.
*   [x] **No Disk Audio Storage:** Recordings reside only in temporary memory buffers and are released immediately.

## 📡 Health Checks & Diagnostics
*   [x] **Health check route:** `GET /api/health` returns UP status cleanly without calling LLM generation or exposing variables.
*   [x] **Audited Latency Percentiles:** Local segments are compiled separately from remote internet stages. Status counts (`SUCCESS`, `REFUSED`, `RATE_LIMITED`) isolate statistics correctly.

## 🛠️ Build & Test Statuses
*   [x] **Jest test suites:** `53/53 tests passed` successfully.
*   [x] **Backend compiler:** TypeScript compilation successfully completes without warnings.
*   [x] **Frontend bundler:** Vite build processes CSS styling and React tsx elements cleanly into static production assets.
