# Placement ERP — Email Notification Service

Two deployed containers:

- `backend/` — unified Node.js/Express API: notification approval, DB importer, email worker
- `frontend/` — Next.js admin/student UI

External dependencies (not deployed by this compose file): MongoDB, Redis, Kafka/Redpanda, PostgreSQL, object storage (Cloudflare R2 or MinIO), Metabase.

---

## Backend

**Start locally:**

```bash
cd backend
cp .env.example .env
# fill in .env
npm install
npm run dev
```

**Key env vars:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `4000` | HTTP listen port |
| `NODE_ENV` | `development` | |
| `ALLOWED_ORIGINS` | *(dev: localhost)* | Comma-separated CORS origins (production) |
| `MONGO_URI` | `mongodb://mongodb:27017` | MongoDB connection |
| `MONGO_DB_NAME` | `placement_erp` | Notifications database |
| `MONGO_IMPORTER_DB` | `db_importer` | Import logs + temp passwords |
| `DATABASE_URL` | *(optional)* | PostgreSQL — enables importer features |
| `REDIS_URL` | `redis://redis:6379` | |
| `KAFKA_BROKERS` | `redpanda:9092` | Comma-separated |
| `KAFKA_PENDING_TOPIC` | `job.notification.pending` | Inbound notifications |
| `KAFKA_SEND_TOPIC` | `job.notification.send` | Outbound email jobs |
| `EMAIL_CONSUMER_ENABLED` | `true` | Set `false` to disable email dispatch |
| `ZEPTOMAIL_TOKEN` | *(required for email)* | ZeptoMail API key |
| `FROM_EMAIL` | *(required for email)* | Sender address |
| `OBJECT_STORAGE_ENDPOINT` | | R2/MinIO endpoint |
| `OBJECT_STORAGE_ACCESS_KEY` | | |
| `OBJECT_STORAGE_SECRET_KEY` | | |
| `OBJECT_STORAGE_BUCKET` | `placement-erp-assets` | |

---

## API Endpoints

### Health
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check |

### Notifications
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/notifications` | List all notifications (summary) |
| `GET` | `/api/notifications/:jobId` | Get full notification detail |
| `POST` | `/api/notifications/:jobId/approve` | Approve + queue emails (`multipart/form-data`: `emailBody`, `adminMessage`, `attachments[]`) |
| `POST` | `/api/notifications/:jobId/reject` | Reject (`{ adminMessage }`) |
| `POST` | `/api/notifications/:jobId/sent` | Mark as sent |

### Student
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/student/dashboard?studentId=` | Active job list for a student |

### DB Importer *(requires `DATABASE_URL`)*
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tables` | List importable PostgreSQL tables |
| `GET` | `/api/schema/:table` | RSI field definitions for a table |
| `GET` | `/api/template/:table` | Download CSV template |
| `GET` | `/api/import-history` | Last 50 import runs (PostgreSQL) |
| `POST` | `/api/import/:table` | Bulk import rows (`multipart/form-data`: `file`, `rows` JSON, `filename`) |
| `GET` | `/api/import/:importId/log` | Row-level import log (MongoDB) |
| `GET` | `/api/import/:importId/passwords` | Temp passwords for one import (24 h TTL) |
| `GET` | `/api/import/passwords` | All non-expired temp passwords |
| `GET` | `/api/mongo/status` | MongoDB connection status |

---

## Frontend

**Start locally:**

```bash
cd frontend
cp .env.example .env.local
# set VITE_API_URL and DB_IMPORTER_URL
npm install
npm run dev
```

Pages:
- `/` — Home
- `/admin/notifications` — Notification list
- `/admin/notifications/:jobId` — Approve / reject detail
- `/admin/importer` — DB spreadsheet importer
- `/student/dashboard` — Student job lookup

---

## Docker Compose

```bash
# copy and fill in secrets
cp backend/.env.example backend/.env

docker compose up -d --build
```

The compose file deploys `backend`, `frontend`, and `metabase`.

External networks required: `erp-core-net`, `redis-core-network`.

Required env vars for compose (set in shell or a root `.env`):

```
ZEPTOMAIL_TOKEN=
FROM_EMAIL=
OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=
METABASE_DB_PASS=
# optional overrides:
ALLOWED_ORIGINS=http://your-domain
VITE_API_URL=http://your-server-ip:4400
DB_IMPORTER_URL=http://emailservice-backend:4000
```

---

## CI/CD

GitHub Actions (`deploy-ssh.yml`) deploys on push to `main`:

**Required secrets:**
- `DEPLOY_SSH_PRIVATE_KEY` — ed25519 private key
- `DEPLOY_SERVER_HOSTS` — comma-separated hostnames/IPs
- `DEPLOY_SSH_USER` — remote user

**Required vars (optional):**
- `DEPLOY_SSH_PORT` (default `22`)
- `DEPLOY_PATH` (default `/opt/emailservice`)
