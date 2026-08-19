# RAGGoa — Final Deployment Report

## Project Identity
- **Product:** RAGGoa — Voice-First Indic Retrieval-Augmented Generation
- **Stack:** Express.js backend + React/Vite frontend (unified single-server)
- **Index:** 36 Indic language chunks from ai4bharat/MSMARCO-XI

---

## Phase 6 — Local Production Smoke Test Results

> All tests executed against `http://localhost:5000` with `NODE_ENV=production`

| Endpoint | Status | Notes |
|---|---|---|
| `GET /api/health` | ✅ HTTP 200 | `"status":"ok"`, 36 chunks loaded |
| `POST /api/query` | ✅ HTTP 200 | Grounded answer returned, citation mapped |
| `POST /api/query-stream` | ✅ SSE Stream | TTFT 212.08ms measured |

**Citation Example:**
```
Query: "ताजमहल कहाँ स्थित है?"
Answer: "ताजमहल भारत के उत्तर प्रदेश राज्य के आगरा शहर में यमुना नदी के तट पर स्थित है।"
Citations: [ 'msmarco-xi-doc-0-p2_semantic_0' ]
```

---

## Measured Latency (Local)

| Metric | Value |
|---|---|
| Local RAG P50 | 0.46 ms |
| Local RAG P70 | 0.73 ms |
| Local RAG P100 | 5.88 ms |
| Live Text RAG P50 | 2964.40 ms |
| Live Text RAG P70 | 4081.79 ms |
| Live Text RAG P100 | 4824.17 ms |
| Streaming TTFT (local smoke) | 212.08 ms |
| Live Voice RAG | NOT YET MEASURED |

> ⚠️ Local RAG pipeline is sub-200ms. Full voice-to-answer latency depends on Sarvam STT + Gemini generation time (~3–5s). These are not claimed to be under 200ms.

---

## Build & Test Status

| Check | Result |
|---|---|
| Backend TypeScript Build | ✅ PASS |
| Frontend Vite Build | ✅ PASS |
| Jest Tests | ✅ 53/53 PASS |
| Security Scan (AIza / sk- / Bearer) | ✅ No keys found in source |
| `.env` gitignored | ✅ Confirmed |

---

## Security Audit

| Check | Status |
|---|---|
| `GEMINI_API_KEY` in source code | ✅ NOT PRESENT |
| `SARVAM_API_KEY` in source code | ✅ NOT PRESENT |
| Secrets in frontend bundle | ✅ NOT PRESENT |
| Secrets in README / docs | ✅ NOT PRESENT |
| `backend/.env` gitignored | ✅ CONFIRMED |
| CORS: localhost allowed, unknown origins blocked in prod | ✅ VERIFIED |
| Rate limiter: 30 req/min per IP | ✅ ACTIVE |
| Audio upload cap: 5MB | ✅ ACTIVE |
| MIME + extension validation on audio uploads | ✅ ACTIVE |
| No raw stack traces in HTTP error responses | ✅ VERIFIED |

---

## Deployment Architecture

**Option B selected: Unified Single-Server Deployment**

```
[Browser] → [Render HTTPS] → [Express :10000]
                                  ├── /api/health
                                  ├── /api/query
                                  ├── /api/voice-query
                                  ├── /api/query-stream
                                  ├── /api/benchmark
                                  └── /* → frontend/dist/index.html (SPA)
```

### Deployment Provider
- **Platform:** Render.com (Free Tier, Singapore region)
- **Config file:** `render.yaml` (committed to repository)

### Build Command (Render)
```bash
npm install && npm install --prefix backend && npm install --prefix frontend && npm run build
```

### Start Command (Render)
```bash
npm start
# runs: node backend/dist/server.js
```

### Required Environment Variables on Render
```
NODE_ENV=production
PORT=10000
GEMINI_API_KEY=<set in Render dashboard — never committed>
SARVAM_API_KEY=<set in Render dashboard — never committed>
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
GEMINI_GENERATION_MODEL=gemini-3.5-flash
MAX_REQUESTS_PER_WINDOW=30
RATE_LIMIT_WINDOW_MS=60000
ALLOWED_ORIGINS=https://<your-render-subdomain>.onrender.com
```

---

## Phase 7 — Public Deployment Steps (Manual — Requires GitHub Auth)

The Git repository has been initialized and the initial commit made locally.
**60 files committed. `backend/.env` correctly excluded.**

To complete public deployment, perform these steps in your browser:

### Step 1: Create GitHub Repository
1. Go to https://github.com/new
2. Name: `raggoa`
3. Visibility: **Public** (or Private — your choice)
4. Do NOT initialize with README (we have one)
5. Click **Create repository**

### Step 2: Push to GitHub
Run in PowerShell from `c:\Hackathon Projects\HH Goa\task_2`:
```powershell
git remote add origin https://github.com/<YOUR_USERNAME>/raggoa.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy on Render
1. Go to https://dashboard.render.com
2. Click **New → Web Service**
3. Connect your GitHub account and select `raggoa`
4. Render will auto-detect `render.yaml`
5. Set the following **secret** environment variables in the Render dashboard:
   - `GEMINI_API_KEY` → your real key
   - `SARVAM_API_KEY` → your real key
   - `ALLOWED_ORIGINS` → `https://raggoa.onrender.com` (use actual URL after deploy)
6. Click **Create Web Service**
7. Wait for build (~3–5 minutes on free tier)

### Step 4: Verify Public Deployment
After deploy completes, verify:
```bash
curl https://raggoa.onrender.com/api/health
```
Expected:
```json
{ "status": "ok", "database": { "loaded": true, "size": 36 } }
```

---

## Phase 7 — Public Verification Status

| Check | Status |
|---|---|
| Public URL | ⏳ PENDING — GitHub push required |
| `GET /api/health` (public) | ⏳ PENDING |
| Text query (public) | ⏳ PENDING |
| Streaming / TTFT (public) | ⏳ PENDING |
| Voice pipeline (public, real browser) | ⏳ PENDING |
| Mobile responsiveness (public) | ⏳ PENDING |
| No secrets in public bundle | ✅ VERIFIED LOCALLY |
| Cross-device test | ⏳ PENDING |

---

## Known Limitations

1. **Live Voice TTFT**: Not yet measured on real browser. Sarvam STT adds ~1–3s before RAG begins.
2. **Gemini Free Tier**: 5 requests/minute. Under heavy demo usage, 429 responses may appear. Users see a friendly error message, not a stack trace.
3. **Vector store on disk**: The pre-built index ships in the repo (2.2MB). To update it, re-run `npm run ingest` and recommit.
4. **Render Free Tier cold start**: First request after 15 minutes idle may take ~10–15 seconds.
5. **No persistent storage**: Render free tier does not persist disk — but our vector store is loaded from the committed JSON file at startup, so this is not an issue.
