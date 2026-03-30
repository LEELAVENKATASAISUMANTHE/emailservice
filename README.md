# Placement ERP Notification Approval System

This repository now contains:

- `backend/` -> Node.js + Express + KafkaJS + MongoDB + Redis + MinIO
- `frontend/` -> Next.js admin/student UI

## 1) Backend setup

```bash
cd backend
copy .env.example .env
npm install
npm run dev
```

### Backend environment

`backend/.env`

- `PORT=4000`
- `MONGO_URI=mongodb://localhost:27017`
- `MONGO_DB_NAME=placement_erp`
- `REDIS_URL=redis://127.0.0.1:6379`
- `KAFKA_CLIENT_ID=placement-approval-service`
- `KAFKA_BROKERS=127.0.0.1:9092`
- `KAFKA_CONSUMER_GROUP=placement-approval-group`
- `KAFKA_PENDING_TOPIC=job.notification.pending`
- `KAFKA_SEND_TOPIC=job.notification.send`
- `MINIO_ENDPOINT=http://localhost:9000`
- `MINIO_ACCESS_KEY=minioadmin`
- `MINIO_SECRET_KEY=minioadmin`
- `MINIO_BUCKET=email-bodies`

## 2) Frontend setup

```bash
cd frontend
copy .env.example .env.local
npm install
npm run dev
```

Frontend env:

- `NEXT_PUBLIC_API_BASE=http://localhost:4000`

## 3) API endpoints

- `GET /health`
- `GET /api/admin/notifications`
- `GET /api/admin/notifications/:jobId`
- `POST /api/admin/notifications/:jobId/approve` (`multipart/form-data`)
- `POST /api/admin/notifications/:jobId/reject` (`application/json`)
- `GET /api/student/dashboard?studentId=1BY23CS132`
- `GET /api/files/:objectName` (serve attachments/admin-message `.txt` from MinIO)

## 4) UI pages

- `/admin/notifications`
- `/admin/notifications/[jobId]`
- `/student/dashboard`

## 5) Core behavior implemented

- Consumes from `job.notification.pending`
- Validates payload using `zod`
- Persists pending records to MongoDB (`PENDING_APPROVAL`)
- Commits Kafka offset only after successful DB write for valid messages
- Approve flow:
  - transition `PENDING_APPROVAL -> APPROVED -> SENT`
  - uploads attachments to MinIO
  - stores admin message body as `.txt` in MinIO
  - stores per-student visibility in Redis sorted set:
    - key: `student:{studentId}:jobs`
    - member: `jobId`
    - score: `applicationDeadline` unix timestamp (seconds)
  - publishes to `job.notification.send`
- Reject flow:
  - transition to `REJECTED`
  - stores admin message body as `.txt` in MinIO
  - no Redis write, no Kafka send publish
- Student dashboard:
  - removes expired jobs with `ZREMRANGEBYSCORE`
  - reads active jobs with `ZRANGEBYSCORE now +inf`

## 6) Backend folder flow (beginner-friendly)

- `routes/` -> URL mapping only
- `controllers/` -> request/response handling
- `services/` -> business logic
- `db/` -> Mongo model + repository queries
- `utils/` -> Redis, Kafka, MinIO clients/helpers

## 7) GitHub Actions SSH deploy

Workflow file: `.github/workflows/deploy-ssh.yml`

It deploys on push to `main`/`master` (or manual trigger), then:
- connects to one or more servers over SSH
- syncs repo files to the server
- runs `docker compose up -d --build` in the deploy path

Required GitHub **Secrets**:
- `DEPLOY_SSH_PRIVATE_KEY` -> private key for server login
- `DEPLOY_SSH_USER` -> SSH user (for example `ubuntu`)
- `DEPLOY_SERVER_HOSTS` -> comma-separated hosts/IPs (for example `10.0.0.11,10.0.0.12`)

Optional GitHub **Variables**:
- `DEPLOY_SSH_PORT` -> default `22`
- `DEPLOY_PATH` -> default `/opt/emailservice`

## 8) Excel ingestion platform

The backend now includes a separate Excel ingestion subsystem under `backend/excel/`.

### Excel features implemented

- predefined template download for `student`, `placement`, and `other`
- dynamic template builder based on a central field registry
- hidden workbook metadata sheet (`__template_meta`) for self-describing uploads
- strict parser validation against template metadata
- background processing with Redpanda (Kafka)
- in-process Kafka consumer inside the Excel service
- Mongo-backed job tracking with progress, retries, failed preview, and retention
- uploadType-specific validation rules
- duplicate detection inside Excel and at the persistence layer
- multi-table mapping using `table.field` keys
- multi-table persistence handlers with row-level Mongo transactions where needed
- MinIO-backed error workbook generation and download
- admin-protected upload/template APIs
- owner-based job access
- rate limiting and idempotent upload detection
- scheduled cleanup for expired jobs and related artifacts

### Excel API endpoints

- `GET /api/excel/template?type=student|placement|other`
- `GET /api/excel/template/registry`
- `POST /api/excel/template/custom`
- `POST /api/excel/upload` (`multipart/form-data`)
- `GET /api/excel/jobs/:jobId`
- `GET /api/excel/jobs/:jobId/error-file`

### Excel auth headers

- `x-admin-api-key` -> required for template generation and upload
- `x-user-id` -> required for upload ownership and job access checks

### Excel-related collections

- `ExcelJob` -> job status, progress, retry metadata, failed preview, retention, ownership
- `ImportedStudent` -> imported student records
- `ImportedClass` -> imported class records
- `ImportedPlacement` -> imported placement records
- `ImportedOtherRecord` -> imported generic records for `other` uploads

### Dynamic template system

- field registry defines tables, fields, labels, and required rules
- templates are generated from the registry instead of hardcoded column lists
- custom templates can combine fields from multiple tables into one sheet
- uploaded files are validated against the hidden metadata sheet, not trusted by visible headers alone
- unknown or extra columns are rejected

### Upload and processing flow

1. Admin downloads a preset template or generates a custom template.
2. The workbook includes hidden metadata for `uploadType` and selected fields.
3. Admin uploads the filled `.xlsx` file to `/api/excel/upload`.
4. Backend computes a SHA-256 file hash and reuses an existing active job for duplicate uploads from the same user and upload type.
5. The Excel service publishes a message to `excel.job.process` and consumes it asynchronously.
6. The parser validates template metadata, headers, and row structure.
7. The worker validates rows, maps them into domain-specific objects, persists them through upload-type handlers, and records partial failures.
8. Invalid rows are written into an error workbook and uploaded to MinIO.
9. Job status, progress, failed preview, retry info, and error download link are available from `/api/excel/jobs/:jobId`.

### Validation and protection

- required field validation
- email format validation
- uploadType-specific rules
- duplicate detection inside the uploaded workbook
- DB-level duplicate protection through collection indexes and upsert paths
- file size limit
- MIME and extension validation
- empty file rejection
- max row count limit
- per-user upload rate limiting

### Multi-table mapping and persistence

- Excel columns use `table.field` keys internally
- parsed rows are transformed into structured domain objects before persistence
- mappers live in `backend/excel/mappers/`
- persistence handlers live in `backend/excel/persistence/`
- `student` uploads persist class + student records transactionally per row
- `placement` uploads persist student + placement records transactionally per row
- `other` uploads persist raw structured payload rows

### Job tracking and error reporting

- job metadata is stored in `ExcelJob`
- tracks `status`, `progress`, `successCount`, `failedCount`, `attemptsMade`, `maxAttempts`, `createdBy`, and `errorFileUrl`
- failed row preview is stored for frontend use
- full invalid-row details are exported as an Excel error workbook
- error workbooks are stored in MinIO and served through the API

### Cleanup and operations

- backend container accepts uploads and enqueues jobs
- `excel-worker` processes jobs from Redis asynchronously
- generated error workbooks are stored in MinIO, not local disk
- expired Excel jobs are cleaned up on a schedule
- imported domain rows can also be deleted during cleanup if enabled by env

### Excel environment variables

- `EXCEL_ADMIN_API_KEY`
- `EXCEL_QUEUE_NAME`
- `EXCEL_UPLOAD_DIR`
- `EXCEL_MAX_UPLOAD_BYTES`
- `EXCEL_MAX_ROWS`
- `EXCEL_UPLOAD_RATE_WINDOW_MS`
- `EXCEL_UPLOAD_RATE_MAX`
- `EXCEL_FAILED_PREVIEW_LIMIT`
- `EXCEL_JOB_RETENTION_DAYS`
- `EXCEL_CLEANUP_INTERVAL_MS`
- `EXCEL_DELETE_IMPORTED_DATA_ON_CLEANUP`
