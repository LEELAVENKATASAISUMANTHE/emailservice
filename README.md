# Placement ERP Notification Approval System

This repository now contains:

- `backend/` -> Node.js + Express + KafkaJS + MongoDB + Redis
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
  - stores per-student visibility in Redis sorted set:
    - key: `student:{studentId}:jobs`
    - member: `jobId`
    - score: `applicationDeadline` unix timestamp (seconds)
  - publishes to `job.notification.send`
- Reject flow:
  - transition to `REJECTED`
  - no Redis write, no Kafka send publish
- Student dashboard:
  - removes expired jobs with `ZREMRANGEBYSCORE`
  - reads active jobs with `ZRANGEBYSCORE now +inf`
