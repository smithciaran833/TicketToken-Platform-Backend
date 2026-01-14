# Queue Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 2025 |
| **Source Migrations** | 1 file |
| **Consolidated To** | 001_consolidated_baseline.ts |
| **Total Tables** | 10 (all tenant-scoped) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_baseline_queue.ts | Initial 10 tables for queue operations |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Zero UUID default on tenant_id | Removed — tenant_id now required |
| 2 | Wrong RLS setting (`app.current_tenant`) | Changed to `app.current_tenant_id` |
| 3 | Text cast in RLS | Changed to NULLIF pattern |
| 4 | No FORCE RLS | Added to all 10 tables |
| 5 | No WITH CHECK clause | Added to all RLS policies |
| 6 | No system bypass | Added `app.is_system_user` check |
| 7 | Seed data in rate_limiters | Removed (tenant-specific concern) |
| 8 | `acknowledged_by` external FK | Converted to comment |

---

## Tables Summary

### Tenant-Scoped Tables (10) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `queues` | Queue definitions | name, type, config, active |
| `jobs` | Job records | queue, type, data, status, attempts |
| `schedules` | Scheduled job definitions | name, cron_expression, job_type |
| `rate_limits` | Rate limiting state | key, limit, window_seconds, current_count |
| `critical_jobs` | High-priority persistent jobs | queue_name, priority, idempotency_key |
| `queue_metrics` | Queue monitoring metrics | queue_name, waiting/active/completed/failed counts |
| `idempotency_keys` | Duplicate job prevention | key, queue_name, result, expires_at |
| `rate_limiters` | Token bucket rate limiting | service_name, tokens_available, refill_rate |
| `alert_history` | Monitoring alerts | severity, alert_type, message, acknowledged |
| `dead_letter_jobs` | Failed jobs archive | queue_name, job_type, error, original_job_id |

---

## External FK References (Comments Only)

| Table.Column | References | Service |
|--------------|------------|---------|
| `alert_history.acknowledged_by` | users(id) | auth-service |

---

## Internal FK References (Enforced)

| Table.Column | References | On Delete |
|--------------|------------|-----------|
| `*.tenant_id` | tenants(id) | RESTRICT |

---

## RLS Policy Pattern

Applied to all 10 tenant-scoped tables:
```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;

CREATE POLICY {table}_tenant_isolation ON {table}
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.is_system_user', true) = 'true'
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.is_system_user', true) = 'true'
  );
```

---

## Removed Items

| Item | Reason |
|------|--------|
| Seed data for rate_limiters | Used zero UUID tenant. Rate limiter configs are tenant-specific. |

---

## Breaking Changes

1. **tenant_id required** — No default value, must be explicitly provided
2. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`
3. **No seed data** — Tenants must initialize their own rate_limiters configuration

---

## Files
```
backend/services/queue-service/src/migrations/
├── 001_consolidated_baseline.ts    # Consolidated migration
├── CONSOLIDATION_NOTES.md          # This file
├── MIGRATIONS.md                   # Original documentation
└── archived/                       # Original migration files
    └── 001_baseline_queue.ts
```
