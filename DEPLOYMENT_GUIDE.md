# RAGGoa — Complete Production Deployment Guide

This guide provides step-by-step instructions for deploying **RAGGoa** (Unified Voice-Enabled Multilingual Indic RAG Application) across multiple hosting environments.

---

## 1. System Requirements & Hardware Sizing

| Metric | Minimum Requirement | Recommended Specification |
|---|---|---|
| **Memory (RAM)** | **4.0 GB** (`--max-old-space-size=4096`) | **8.0 GB** |
| **CPU** | 2 vCPUs | 4 vCPUs |
| **Disk Storage** | 5 GB Free Space | 10 GB Free Space |
| **Node.js** | v20.x or v22.x LTS | v20.x LTS |
| **Architecture** | x86_64 or ARM64 (Apple Silicon / AWS Graviton) | x86_64 |

> [!IMPORTANT]
> Because RAGGoa loads an in-memory 84,661-chunk vector store with real E5 dense embeddings and HNSW graph indexing, the Node.js process requires **~2.5 GB to 3.5 GB of RAM** at peak startup. Always assign at least 4GB of RAM to the runtime instance.

---

## 2. Environment Variables Configuration

Create a `.env` file in `backend/` (or configure in your cloud dashboard):

```ini
# Production Server Port
PORT=5000
NODE_ENV=production

# Sarvam AI API Key (for Saaras STT & Bulbul Multilingual Neural TTS)
SARVAM_API_KEY=your_sarvam_api_key_here

# Google Gemini API Key (for Grounded Generation & General Knowledge Fallback)
GEMINI_API_KEY=your_gemini_api_key_here

# Models & Confidence Settings
GEMINI_GENERATION_MODEL=gemini-3.5-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
DATASET_MODE=real
CONFIDENCE_THRESHOLD=0.08
```

---

## 3. Option A: Docker & Docker Compose (Recommended)

### Using Docker Compose (Simplest)

1. **Build and start the container**:
   ```bash
   docker compose up -d --build
   ```

2. **Check container logs**:
   ```bash
   docker compose logs -f
   ```

3. **Stop the container**:
   ```bash
   docker compose down
   ```

### Using Raw Docker CLI

1. **Build the image**:
   ```bash
   docker build -t raggoa:latest .
   ```

2. **Run the container with 4GB memory allocation**:
   ```bash
   docker run -d \
     --name raggoa-app \
     -p 5000:5000 \
     -m 4g \
     --restart unless-stopped \
     -e PORT=5000 \
     -e NODE_ENV=production \
     -e SARVAM_API_KEY="your_sarvam_api_key" \
     -e GEMINI_API_KEY="your_gemini_api_key" \
     raggoa:latest
   ```

3. **Verify container health**:
   ```bash
   curl http://localhost:5000/api/health
   ```

---

## 4. Option B: Cloud PaaS Deployment (Render / Railway)

### Deploying on Render (via `render.yaml`)

1. Connect your GitHub repository to [Render.com](https://render.com).
2. Click **New +** -> **Blueprint**.
3. Select this repository. Render will automatically detect [`render.yaml`](file:///d:/HH%20Goa/task_2/render.yaml).
4. **Choose Instance Tier**: Select **Standard (4GB RAM)** or higher.
5. Set `GEMINI_API_KEY` and `SARVAM_API_KEY` in the Environment Variables dashboard.
6. Click **Apply**. Render will build the Docker container and deploy the app at `https://your-app.onrender.com`.

### Deploying on Railway

1. Install Railway CLI: `npm install -g @railway/cli`
2. Login and initialize: `railway login && railway init`
3. Set memory limit in project settings to **4GB RAM**.
4. Set environment variables:
   ```bash
   railway variables set GEMINI_API_KEY="your_key" SARVAM_API_KEY="your_key"
   ```
5. Deploy: `railway up`

---

## 5. Option C: Linux Cloud VM (AWS EC2 / DigitalOcean / Hetzner)

For a dedicated Ubuntu 22.04 / 24.04 server with **PM2** process management and **Nginx reverse proxy with SSL**:

### 1. Install Node.js 20 & PM2

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx

# Install PM2 globally
sudo npm install -g pm2
```

### 2. Clone & Build RAGGoa

```bash
git clone https://github.com/your-org/task_2.git /var/www/raggoa
cd /var/www/raggoa

# Install root, backend, and frontend dependencies
npm run install:all

# Build frontend and backend
npm run build
```

### 3. Start with PM2 (with 4GB Heap Limit)

Create an ecosystem file `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'raggoa-backend',
    script: 'backend/dist/server.js',
    node_args: '--max-old-space-size=4096',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '4G',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    }
  }]
};
```

Start the service:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. Configure Nginx Reverse Proxy

Create `/etc/nginx/sites-available/raggoa`:

```nginx
server {
    listen 80;
    server_name your-domain.com; # Or your server public IP

    # Increase client body size for audio recording uploads (up to 10MB)
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for SSE streaming endpoints
        proxy_buffering off;
        proxy_read_timeout 120s;
    }
}
```

Enable site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/raggoa /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5. Enable HTTPS with Let's Encrypt (Certbot)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 6. Verification & Health Monitoring

Once deployed, verify that the unified application is healthy and all endpoints are responding:

```bash
# 1. Health Status & Vector Database Load Check
curl https://your-domain.com/api/health

# 2. Benchmark Observability Data Check
curl https://your-domain.com/api/benchmark

# 3. Test Grounded Query Endpoint
curl -X POST https://your-domain.com/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "what is a corporation?", "languageCode": "en"}'

# 4. Test Multilingual Neural TTS Endpoint
curl -X POST https://your-domain.com/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "नमस्ते, मैं आपकी कैसे मदद कर सकता हूँ?", "languageCode": "hi-IN"}'
```
