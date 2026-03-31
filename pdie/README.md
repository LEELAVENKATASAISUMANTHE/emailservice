# Placement Data Ingestion Engine (PDIE)

PDIE is a production-ready ingestion platform that turns live PostgreSQL schemas into governed Excel templates, validates uploads at scale, and ingests clean data through synchronous or streaming (Redpanda) pipelines. MongoDB captures every audit signal, while MinIO stores generated templates, uploads, and failure artifacts.

The solution is deployed as **three application containers** (API, worker, frontend). Infrastructure services (PostgreSQL, MongoDB, MinIO, Redpanda) can run on managed offerings or existing clusters.

---

## Architecture Overview

| Component | Responsibility |
| --- | --- |
| `pdie-backend` (Express) | Template generation, upload intake, validation, MinIO interactions, Redpanda producer |
| `pdie-worker` (Node worker) | Redpanda consumer, safety re-validation, batch inserts, failure handling |
| `pdie-frontend` (Vite/React) | Operational console to request templates and trigger uploads |

Shared infrastructure requirements:

- **PostgreSQL** for canonical placement data (schema introspection + inserts)
- **MongoDB** for metadata collections: `templates`, `uploads`, `validation_logs`, `processing_logs`, `failed_chunks`
- **MinIO** (or S3-compatible storage) with buckets: `templates`, `uploads`, `processed`, `failed`
- **Redpanda** topic `pdie.uploads` for async chunk processing

---

## Backend API Summary

Base URL: `/api`

| Endpoint | Method | Description |
| --- | --- | --- |
| `/templates` | `POST` | Accepts `{ tables: string[] }`, introspects PostgreSQL, generates Excel template (with metadata sheet) if missing, uploads to MinIO, stores metadata in MongoDB, returns template descriptor |
| `/uploads` | `POST` (multipart) | Accepts `file` field (Excel), validates templateId from hidden metadata sheet, performs schema/type/FK checks, ingests synchronously (<5000 rows) or enqueues 1k-row chunks to Redpanda for async processing |
| `/health` | `GET` | Liveness probe |

### Validation engine

- Column match enforcement (no `SELECT *`) using aliased headers `table__column`
- Required fields respected via `information_schema`
- Type coercion guards align with PostgreSQL data types
- Foreign key lookups simulate joins to catch orphaned references
- All validation failures logged to `validation_logs`

### Upload logging lifecycle

1. Upload received → `processing_logs`
2. Template + hash dedupe check (`uploads.duplicateOf`)
3. Validation outcomes (row-level) → `validation_logs`
4. Sync path: direct inserts + completion flag
5. Async path: chunk enqueued, `pendingChunks` incremented per valid chunk
6. Worker decrements `pendingChunks`; once zero and status not failed, upload auto-completes

---

## Worker Flow (Redpanda Consumer)

1. Consume chunk `{ uploadId, templateId, chunkId, rows }`
2. Re-fetch cached template metadata and re-run validation for safety
3. Batch insert into the primary table (first table in template definition) using formatted SQL
4. On success → log + decrement pending chunk count
5. On validation or DB failure → log, persist failed chunk payload, flag upload as `failed`

---

## Frontend Console

The Vite + React UI focuses on ops ergonomics:

- **Template Builder**: request templates by entering target table names
- **Upload Processor**: submit Excel files generated from PDIE templates
- **Operational Notes**: quick reference on validation/queueing behavior

The frontend proxies `/api` calls in development and uses `VITE_API_BASE_URL` in production containers.

---

## Running Locally

1. Provision the required backing services (PostgreSQL, MongoDB, MinIO, Redpanda). Update the `.env` files under `backend/` and `worker/` with reachable credentials.
2. Generate a frontend `.env` from `.env.example` if you need a non-default API URL.
3. From the repo root:

```bash
cd pdie
cp backend/.env.example backend/.env
cp worker/.env.example worker/.env
cp frontend/.env.example frontend/.env
# edit the .env files with live connection strings

# build + run the three app containers
docker compose -f docker-compose.yml up --build
```

Backends expect the following buckets to exist inside MinIO: `templates`, `uploads`, `processed`, `failed`.

---

## Key Design Details

- **Template caching**: SHA256 hash of sorted tables + join keys ensures deterministic templateId and reuse.
- **Metadata sheet**: Hidden `_meta` sheet carries `templateId`, `tables`, `joinKeys` so uploads can self-identify.
- **Streaming Excel parsing**: ExcelJS `WorkbookReader` with row chunking avoids loading entire workbooks in memory.
- **Chunking**: 1000-row chunks for async uploads; message payloads carry sanitized rows only.
- **Duplicate detection**: SHA256 hash of raw Excel file; duplicates short-circuit and reference original upload.
- **Observability**: Every stage writes to MongoDB collections for audit-ready trails; worker + API use Pino logs.
- **Failure isolation**: Worker persists failing chunks plus raw payloads, enabling replay/debug.

---

## Next Steps / Enhancements

- Attach MinIO presigned URL endpoint for template download & failed chunk retrieval.
- Add schema versioning strategy (increment template.version when PostgreSQL schema drifts).
- Expand ingestion mapping to support multi-table fan-out inserts, not just primary table writes.
- Wire Prometheus metrics from Express + worker and expose via `/metrics` for alerting.
