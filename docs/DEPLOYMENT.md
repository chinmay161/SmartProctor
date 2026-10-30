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

### Option B: Supabase Storage (S3-Compatible Protocol)
Supabase provides an S3-compatible API for storage buckets.

#### Where to Find Configuration in the Supabase Dashboard:
1. In the Supabase Dashboard, select your project and click **Storage** in the left sidebar.
2. Select **S3 Connection** (or **Settings** → **S3 Connection**).
3. Under **S3 Access Keys**, click **Generate new key** (or copy existing credentials):
   - **Endpoint URL**: displayed as `https://<project-ref>.supabase.co/storage/v1/s3` -> Set `S3_ENDPOINT_URL`.
   - **Region**: displayed in the S3 connection details (e.g. `us-east-1`, `eu-west-1`, `ap-southeast-1`) -> Set `S3_REGION`.
   - **Access Key ID**: copy from the generated key modal -> Set `S3_ACCESS_KEY_ID`.
   - **Secret Access Key**: copy from the generated key modal -> Set `S3_SECRET_ACCESS_KEY`.
4. Under **Buckets**, create a new bucket (e.g. `evidence` or `smartproctor-evidence`):
   - Ensure the bucket name matches `S3_BUCKET`.
   - Buckets can be Private (recommended); SmartProctor generates time-limited signed URLs (`EVIDENCE_URL_TTL_SECONDS=3600`).
5. Configure environment variables in Render:
   ```env
   EVIDENCE_STORAGE=s3
   S3_ENDPOINT_URL=https://<project-ref>.supabase.co/storage/v1/s3
   S3_BUCKET=smartproctor-evidence
   S3_ACCESS_KEY_ID=<YOUR_S3_ACCESS_KEY_ID>
   S3_SECRET_ACCESS_KEY=<YOUR_S3_SECRET_ACCESS_KEY>
   S3_REGION=us-east-1
   S3_ADDRESSING_STYLE=path
   EVIDENCE_URL_TTL_SECONDS=3600
   ```

#### Checklist for Likely Mistakes:
- [ ] **Missing `/storage/v1/s3` suffix**: The endpoint URL MUST end in `/storage/v1/s3` (e.g. `https://xyzproject.supabase.co/storage/v1/s3`). Omitting this suffix causes 404 or connection errors.
- [ ] **Addressing style**: Must use `S3_ADDRESSING_STYLE=path` (the default). Virtual-host addressing tries to connect to `https://<bucket>.xyzproject.supabase.co/storage/v1/s3`, which fails DNS resolution.
- [ ] **Wrong region**: Supabase S3 connection specifies an explicit region (e.g. `us-east-1` or project-specific region). Do not use `auto` if your Supabase project requires its assigned region.
- [ ] **Bucket name case sensitivity**: Supabase bucket names are strictly case-sensitive. `Evidence` != `evidence`.
- [ ] **S3 access key permissions**: The S3 credentials must have write/read/delete permissions on the target bucket.
- [ ] **Storage diagnostics**: Use the admin panel **Diagnostics** tab and click **Test storage** to verify write, presign, fetch, and delete against your Supabase bucket.

### Option C: AWS S3
- Set `EVIDENCE_STORAGE=s3`
- Ensure IAM user/role permissions allow `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject`.
- Set `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- Set `S3_ADDRESSING_STYLE=auto` (or `virtual`).

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

### D. Auth0 Post-Login Action ("Add roles to tokens")
Auth0 access tokens do not include RBAC roles in their JWT claims by default. To ensure tokens carry role claims directly to the backend API without requiring Management API round-trips:
1. In Auth0 Dashboard, navigate to **Actions** → **Library** → **Build Custom**.
2. Name the action: `Add roles to tokens`.
3. Trigger: **Login / Post Login**.
4. Paste the following Action code:
   ```javascript
   exports.onExecutePostLogin = async (event, api) => {
     const namespace = 'https://smartproctor.io';
     if (event.authorization) {
       api.accessToken.setCustomClaim(`${namespace}/roles`, event.authorization.roles);
       api.idToken.setCustomClaim(`${namespace}/roles`, event.authorization.roles);
     }
   };
   ```
5. Click **Deploy**.
6. Go to **Actions** → **Flows** → **Login** and drag the `Add roles to tokens` action into the flow between **Start** and **Complete**. Click **Apply**.

> [!IMPORTANT]
> **Re-authentication after role changes**: Access tokens are cryptographically signed and immutable once issued. When a user's role is changed or assigned in Auth0, the user must log out and log in again (or refresh their session) to receive an updated access token containing the new roles.

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
| `EVENT_RETENTION_DAYS` | No | `render.yaml` | Auto-cleanup retention period for flight recorder events in days. | `30` |
| `AI_WORKER_BASE_URL` | No | Render Dashboard | Optional external AI worker URL. If unset, `/ai/*` routes return 503 and `/health` never calls it. | (empty) |
| `SENTRY_DSN` | No | Render Dashboard | Sentry project DSN for backend error tracking. Initialized only if set. | `https://examplePublicKey@o0.ingest.sentry.io/0` |
| `SENTRY_TRACES_RATE` | No | `render.yaml` | Sample rate for backend performance tracing. | `0.05` |
| `LOG_HASH_SALT` | No | Render Dashboard | Salt for HMAC-SHA256 anonymized user logging (`user_hash`). | `smartproctor-log-salt` |

### Frontend Variables (Vercel)

| Variable | Required | Where Set | Description | Default / Example |
|---|---|---|---|---|
| `VITE_API_BASE` | Yes | Vercel Project Settings | Render backend URL (used for REST and derived for WebSockets `wss://`). | `https://smartproctor-backend.onrender.com` |
| `VITE_AUTH0_DOMAIN` | Yes | Vercel Project Settings | Auth0 tenant domain. | `tenant.us.auth0.com` |
| `VITE_AUTH0_CLIENT_ID` | Yes | Vercel Project Settings | Auth0 SPA Client ID. | `...` |
| `VITE_AUTH0_AUDIENCE` | Yes | Vercel Project Settings | Auth0 API identifier. | `https://api.smartproctor.com` |
| `VITE_INFERENCE_MODE` | No | Vercel Project Settings | AI inference mode (`client` on-device MediaPipe or `server`). | `client` |
| `VITE_SENTRY_DSN` | No | Vercel Project Settings | Sentry project DSN for frontend error tracking. Initialized only if set. | `https://examplePublicKey@o0.ingest.sentry.io/0` |
| `VITE_SENTRY_TRACES_RATE` | No | Vercel Project Settings | Sample rate for frontend tracing. | `0.05` |
| `SENTRY_AUTH_TOKEN` | Build Only | Vercel Env (Build) | Sentry authentication token for build-time sourcemap upload. | `sntrys_...` |
| `SENTRY_ORG` | Build Only | Vercel Env (Build) | Sentry organization slug for sourcemap release. | `my-org` |
| `SENTRY_PROJECT` | Build Only | Vercel Env (Build) | Sentry project slug for frontend sourcemaps. | `smartproctor-frontend` |

### Error Tracking & Sentry Verification

#### 1. Backend Verification (`POST /admin/diagnostics/trace-test`)
An admin-only diagnostic endpoint is provided to confirm backend exceptions and request correlation IDs reach Sentry:
```bash
curl -X POST https://smartproctor-backend.onrender.com/admin/diagnostics/trace-test \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
```
Expected behavior:
- Unauthenticated requests receive HTTP `401 Unauthorized`.
- Non-admin requests receive HTTP `403 Forbidden`.
- Authenticated admin requests trigger a deliberate `RuntimeError("Deliberate diagnostic exception for Sentry trace testing")`, resulting in HTTP `500`. Sentry captures the error event with tag `request_id` and sanitized headers (no Bearer tokens or cookies).

#### 2. Frontend Verification (Dev Trigger)
When developing locally (`npm run dev`), open the browser DevTools console on any page and execute:
```javascript
window.__triggerSentryTestError();
```
Expected behavior:
- Throws a deliberate `Error('Deliberate test error for Sentry frontend verification')`.
- Captured by Sentry and tagged with user role (once logged in) and `session_id` (during exams).
- Sensitive tokens in URLs and payload data are scrubbed before transmission.

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

---

## 11. Deployment Window & Exam Hour Safety

> [!CAUTION]
> **Do not deploy during exam hours.**

When a new frontend deployment goes live on Vercel or CDN hosting, old hashed JavaScript chunks from the previous release are replaced. If a deployment occurs while students are in the middle of active exam sessions:
- Any dynamic chunk fetch for an old file hash will result in an HTTP 404 chunk load failure.
- Although `exam-portal` statically bundles its critical components and `lazyWithRetry` handles failures non-blockingly without reload prompts, students or instructors navigating to new views may experience chunk mismatch.
- **Rule**: Schedule all frontend and backend deployments, rollbacks, and infrastructure updates outside of active exam windows.
