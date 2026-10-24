# SmartProctor Production Deployment Guide

This guide details the end-to-end setup for deploying SmartProctor in production:
- **Backend**: Render (Free Web Service via Blueprint, Python 3.12)
- **Frontend**: Vercel (SPA with Vite, Node >= 20, root directory `frontend`)
- **Database**: Neon (Serverless PostgreSQL)
- **Evidence Storage**: S3-compatible Object Storage (Cloudflare R2, Supabase Storage, or AWS S3)
- **Authentication**: Auth0 (SPA for frontend + API audience + Management API for roles)

---

## 1. Neon Database Setup

1. Create a Neon account at [neon.tech](https://neon.tech) and create a new project (e.g. `smartproctor-prod`).
2. Copy the connection string from the Neon dashboard (e.g. `postgres://user:password@ep-xyz-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`).
3. **Connection Pooling**: Neon provides a pooled connection string (using PgBouncer). SmartProctor's database layer (`backend/app/database.py`) automatically:
   - Normalizes `postgres://` or `postgresql://` to `postgresql+psycopg://`.
   - Configures `prepare_threshold=None` (required for PgBouncer).
   - Configures `pool_pre_ping=True` and `pool_recycle=300`.
   - Ensures `sslmode=require`.
4. **Database Migrations**:
   - You do NOT need to run migrations manually before starting Render.
   - Render's start command executes `python scripts/init_db.py`, which inspects Neon:
     - Fresh database: executes `Base.metadata.create_all()` and stamps Alembic to `head`.
     - Existing database: executes `alembic upgrade head`.

---

## 2. Evidence Storage Setup (S3-Compatible)

Render free tier instances have ephemeral disks that are wiped on every sleep or restart. Evidence snapshots must be stored in object storage.

### Option A: Cloudflare R2 (Recommended, zero egress fees)
1. In Cloudflare Dashboard, go to **R2** → **Create bucket** (e.g. `smartproctor-evidence`).
2. Go to **Manage R2 API Tokens** → **Create API Token** with `Object Read & Write` permissions.
3. Note:
   - `S3_ENDPOINT_URL`: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - `S3_BUCKET`: `smartproctor-evidence`
   - `S3_ACCESS_KEY_ID`: `<R2_ACCESS_KEY_ID>`
   - `S3_SECRET_ACCESS_KEY`: `<R2_SECRET_ACCESS_KEY>`
   - `S3_REGION`: `auto`

### Option B: AWS S3 / Supabase Storage
- Ensure bucket permissions allow PutObject and GetObject.
- Set `S3_ENDPOINT_URL` (for Supabase: `https://<project-ref>.supabase.co/storage/v1/s3`), `S3_BUCKET`, `S3_REGION`, etc.

Evidence images are private and served via short-lived signed URLs (`EVIDENCE_URL_TTL_SECONDS=3600`).

---

## 3. Auth0 Configuration

### A. SPA Application (Frontend)
In Auth0 Dashboard → **Applications** → **Applications** → Create or open your Single Page Application:
- **Allowed Callback URLs**:
  - `https://<your-vercel-domain>.vercel.app`
  - `http://localhost:5173`
- **Allowed Logout URLs**:
  - `https://<your-vercel-domain>.vercel.app`
  - `http://localhost:5173`
- **Allowed Web Origins**:
  - `https://<your-vercel-domain>.vercel.app`
  - `http://localhost:5173`
- **Allowed Origins (CORS)**:
  - `https://<your-vercel-domain>.vercel.app`
  - `http://localhost:5173`

### B. API Configuration (Backend)
In Auth0 Dashboard → **Applications** → **APIs**:
- Create API:
  - **Name**: `SmartProctor API`
  - **Identifier / Audience**: e.g. `https://api.smartproctor.com` (matches `AUTH0_API_AUDIENCE` and `VITE_AUTH0_AUDIENCE`)
  - **Signing Algorithm**: `RS256`

### C. Management API (Machine to Machine)
For automated role assignment (`teacher`, `student`, `admin`):
- Authorize your Machine-to-Machine application for the **Auth0 Management API**.
- Grant scopes: `read:users`, `update:users`, `read:roles`, `assign:roles`.
- Copy `AUTH0_MGMT_CLIENT_ID` and `AUTH0_MGMT_CLIENT_SECRET`.

---

## 4. Backend Deployment to Render (Blueprint)

The repository root includes `render.yaml` which defines the free tier web service.

1. Log in to [render.com](https://render.com).
2. Click **New** → **Blueprint**.
3. Connect your SmartProctor GitHub repository.
4. Render will parse `render.yaml` and configure:
   - **Service Name**: `smartproctor-backend`
   - **Runtime**: `Python 3.12.2`
   - **Root Directory**: `backend`
   - **Plan**: `free`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python scripts/init_db.py && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
5. Render prompts you to input the secret environment variables (`sync: false`):
   - `DATABASE_URL`: Your Neon connection string.
   - `AUTH0_DOMAIN`: e.g. `your-tenant.us.auth0.com`
   - `AUTH0_API_AUDIENCE`: e.g. `https://api.smartproctor.com`
   - `AUTH0_ISSUER`: e.g. `https://your-tenant.us.auth0.com/`
   - `AUTH0_MGMT_CLIENT_ID`: `<M2M_CLIENT_ID>`
   - `AUTH0_MGMT_CLIENT_SECRET`: `<M2M_CLIENT_SECRET>`
   - `AUTH0_MGMT_AUDIENCE`: `https://your-tenant.us.auth0.com/api/v2/`
   - `CORS_ORIGINS`: Your Vercel domain e.g. `https://smartproctor.vercel.app` (comma-separated if multiple, NO wildcards `*` in production).
   - `FRONTEND_URL`: `https://smartproctor.vercel.app`
   - `EVIDENCE_STORAGE`: `s3`
   - `S3_ENDPOINT_URL`: Your S3/R2 endpoint.
   - `S3_BUCKET`: Bucket name.
   - `S3_ACCESS_KEY_ID`: Access key ID.
   - `S3_SECRET_ACCESS_KEY`: Secret access key.
   - `S3_REGION`: Region or `auto`.
   - `AI_WORKER_BASE_URL`: (Optional) leave empty if server-side AI worker is not deployed.
6. Click **Apply**. Render will build and deploy the backend.
7. Once deployed, note your backend URL: `https://smartproctor-backend.onrender.com`.
8. Verify health endpoint: `curl https://smartproctor-backend.onrender.com/health` -> returns `{"status":"healthy","service":"SmartProctor API"}`.

---

## 5. Frontend Deployment to Vercel

1. Log in to [vercel.com](https://vercel.com) and click **Add New** → **Project**.
2. Import your SmartProctor repository.
3. Configure Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click Edit and select `frontend`
   - **Build Command**: `npm run build` (runs `prebuild` which copies MediaPipe WASM, then Vite build)
   - **Output Directory**: `dist`
   - **Install Command**: `npm ci`
4. Set Environment Variables in Vercel:
   - `VITE_API_BASE`: `https://smartproctor-backend.onrender.com`
   - `VITE_AUTH0_DOMAIN`: `your-tenant.us.auth0.com`
   - `VITE_AUTH0_CLIENT_ID`: `<SPA_CLIENT_ID>`
   - `VITE_AUTH0_AUDIENCE`: `https://api.smartproctor.com`
   - `VITE_INFERENCE_MODE`: `client`
5. Click **Deploy**.
6. When deployment finishes, note your production frontend domain: `https://<project-name>.vercel.app`.

---

## 6. Post-Deployment Origin Updates

Now that you have both live URLs:
1. **In Auth0**:
   - Ensure `https://<project-name>.vercel.app` is added to Allowed Callback URLs, Allowed Logout URLs, Allowed Web Origins, and Allowed Origins (CORS).
2. **In Render Dashboard**:
   - Ensure `CORS_ORIGINS` includes `https://<project-name>.vercel.app`.
   - Ensure `FRONTEND_URL` is set to `https://<project-name>.vercel.app`.
   - Save and let Render redeploy.

---

## 7. Environment Variables Reference

### Backend Variables (Render)

| Variable | Required | Where Set | Description | Default / Example |
|---|---|---|---|---|
| `ENVIRONMENT` | Yes | `render.yaml` | Application environment. In `production`, docs are disabled and fail-fast validation is active. | `production` |
| `DATABASE_URL` | Yes | Render Dashboard | Neon PostgreSQL connection string. | `postgresql+psycopg://...` |
| `DB_POOL_SIZE` | No | `render.yaml` | Connection pool size for Neon. | `10` |
| `DB_MAX_OVERFLOW` | No | `render.yaml` | Max overflow connections. | `10` |
| `AUTH0_DOMAIN` | Yes | Render Dashboard | Auth0 tenant domain. | `tenant.us.auth0.com` |
| `AUTH0_API_AUDIENCE` | Yes | Render Dashboard | Auth0 API identifier. | `https://api.smartproctor.com` |
| `AUTH0_ISSUER` | No | Render Dashboard | Auth0 issuer URL. | `https://tenant.us.auth0.com/` |
| `AUTH0_MGMT_CLIENT_ID` | Yes | Render Dashboard | Machine-to-Machine Client ID for role management. | `...` |
| `AUTH0_MGMT_CLIENT_SECRET` | Yes | Render Dashboard | Machine-to-Machine Client Secret. | `...` |
| `AUTH0_MGMT_AUDIENCE` | No | Render Dashboard | Management API audience. | `https://tenant.us.auth0.com/api/v2/` |
| `CORS_ORIGINS` | Yes | Render Dashboard | Comma-separated allowed frontend origins. Wildcard `*` is strictly forbidden in production. | `https://smartproctor.vercel.app` |
| `FRONTEND_URL` | No | Render Dashboard | Frontend base URL for redirects. | `https://smartproctor.vercel.app` |
| `EVIDENCE_STORAGE` | Yes | `render.yaml` | Evidence storage backend (`local` or `s3`). | `s3` |
| `S3_ENDPOINT_URL` | If S3 | Render Dashboard | Custom endpoint for Cloudflare R2 or Supabase S3. | `https://<id>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | If S3 | Render Dashboard | Bucket name for evidence photos. | `smartproctor-evidence` |
| `S3_ACCESS_KEY_ID` | If S3 | Render Dashboard | S3 access key ID. | `...` |
| `S3_SECRET_ACCESS_KEY` | If S3 | Render Dashboard | S3 secret access key. | `...` |
| `S3_REGION` | If S3 | Render Dashboard | S3 region. | `auto` |
| `EVIDENCE_URL_TTL_SECONDS` | No | `render.yaml` | Signed URL expiration time in seconds. | `3600` |
| `EVIDENCE_RETENTION_DAYS` | No | `render.yaml` | Auto-cleanup retention period in days. | `30` |
| `AI_WORKER_BASE_URL` | No | Render Dashboard | Optional external AI worker URL. If unset, `/ai/*` routes return 503 and `/health` never calls it. | (empty) |

### Frontend Variables (Vercel)

| Variable | Required | Where Set | Description | Default / Example |
|---|---|---|---|---|
| `VITE_API_BASE` | Yes | Vercel Project Settings | Render backend URL (used for REST and derived for WebSockets `wss://`). | `https://smartproctor-backend.onrender.com` |
| `VITE_AUTH0_DOMAIN` | Yes | Vercel Project Settings | Auth0 tenant domain. | `tenant.us.auth0.com` |
| `VITE_AUTH0_CLIENT_ID` | Yes | Vercel Project Settings | Auth0 SPA Client ID. | `...` |
| `VITE_AUTH0_AUDIENCE` | Yes | Vercel Project Settings | Auth0 API identifier. | `https://api.smartproctor.com` |
| `VITE_INFERENCE_MODE` | No | Vercel Project Settings | AI inference mode (`client` on-device MediaPipe or `server`). | `client` |

---

## 8. Deployment Order

1. **Neon**: Create project and copy connection string.
2. **Object Storage**: Create private bucket and generate API credentials.
3. **Auth0**: Create SPA application, API audience, and M2M credentials.
4. **Render Backend**: Deploy via Blueprint using `render.yaml`, supply all credentials. Verify `/health`.
5. **Vercel Frontend**: Deploy with root directory `frontend` and set `VITE_*` environment variables.
6. **Cross-Service Links**:
   - Add Vercel URL to Auth0 Allowed Callback/Logout/Origins.
   - Add Vercel URL to Render `CORS_ORIGINS`.

---

## 9. Rollback Procedures

### Frontend Rollback (Vercel)
Vercel keeps immutable build outputs for every deployment:
1. In the Vercel Dashboard, go to **Deployments**.
2. Locate the previous stable deployment.
3. Click the three dots (`...`) → **Promote to Production** (or **Rollback**).
4. Traffic instantly shifts to the previous build without rebuilding.

### Backend Rollback (Render)
1. In the Render Dashboard, go to your web service.
2. Under **Events / Deploys**, find the last successful deployment.
3. Click **Rollback** to redeploy that commit.

### Database Rollback
1. **Alembic**:
   To revert the last schema revision:
   ```bash
   cd backend
   alembic downgrade -1
   ```
2. **Neon Point-in-Time Restore (PITR)**:
   Neon allows instant branch creation from any point in time in the last 7+ days. If data corruption occurs, create a branch at `T - 10 minutes` and update `DATABASE_URL` in Render.

---

## 10. How to Wake the Server Before an Exam

Render's free tier spins down web services after 15 minutes of inactivity. When a request arrives, a cold start takes approximately **30 to 50 seconds**.

While the student and proctor WebSockets recover on their own with exponential backoff and jitter, it is best practice to wake the service before an exam starts:

1. **Manual Ping**:
   5 to 10 minutes prior to the exam, send an HTTP request to the health endpoint:
   ```bash
   curl -I https://smartproctor-backend.onrender.com/health
   ```
   Or open `https://smartproctor-backend.onrender.com/health` in any browser. Once it returns `{"status":"healthy"}`, the instance is fully warmed up and active.

2. **Automated Ping / Keep-Alive Monitor**:
   Set up a free monitor (e.g. [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org)):
   - **URL**: `https://smartproctor-backend.onrender.com/health`
   - **Interval**: Every 10 minutes
   - **Timing**: Schedule to run during exam hours or exam days to prevent the instance from entering sleep mode.
