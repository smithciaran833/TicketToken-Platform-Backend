# Queue Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 1
> **Tables Created:** 10

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_queue.ts | Create job queue infrastructure with RLS |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled |
|-------|-------------|---------------|-------------|
| queues | uuid | ✅ | ✅ |
| jobs | uuid | ✅ | ✅ |
| schedules | uuid | ✅ | ✅ |
| rate_limits | uuid | ✅ | ✅ |
| critical_jobs | uuid | ✅ | ✅ |
| queue_metrics | uuid | ✅ | ✅ |
| idempotency_keys | uuid | ✅ | ✅ |
| rate_limiters | service_name (string) | ✅ | ✅ |
| alert_history | uuid | ✅ | ✅ |
| dead_letter_jobs | uuid | ✅ | ✅ |

---

## Key Tables

### queues
Queue definitions with config and statistics.

### jobs
Main job table with status tracking, retry logic.
Status: pending, processing, completed, failed

### critical_jobs
High-priority jobs with idempotency keys.
Higher max_attempts (5 vs 3).

### rate_limiters
Token bucket rate limiting per service.
Seeded with: stripe (100), twilio (10), sendgrid (50), solana_rpc (25)

### dead_letter_jobs
Failed jobs moved here after max retries.

---

## Seed Data
```javascript
rate_limiters: [
  { service_name: 'stripe', tokens_available: 100, max_concurrent: 10 },
  { service_name: 'twilio', tokens_available: 10, max_concurrent: 5 },
  { service_name: 'sendgrid', tokens_available: 50, max_concurrent: 10 },
  { service_name: 'solana_rpc', tokens_available: 25, max_concurrent: 5 }
]
```

---

## RLS Policies
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id::text = current_setting('app.current_tenant', true))
```

Applied to all 10 tables.

---

## Foreign Keys

| Table | Column | References |
|-------|--------|------------|
| All tables | tenant_id | tenants.id (RESTRICT) |

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_tenant | TEXT | RLS tenant isolation |
