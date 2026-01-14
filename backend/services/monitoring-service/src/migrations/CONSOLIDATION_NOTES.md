# Monitoring Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 2025 |
| **Source Migrations** | 1 file |
| **Consolidated To** | 001_consolidated_baseline.ts |
| **Total Tables** | 11 (all tenant-scoped) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_baseline_monitoring_schema.ts | Initial 11 tables for monitoring operations |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | `uuid_generate_v4()` | Changed to `gen_random_uuid()` |
| 2 | `uuid-ossp` extension | Removed |
| 3 | Zero UUID default on tenant_id | Removed — tenant_id now required |
| 4 | Wrong RLS setting (`app.current_tenant`) | Changed to `app.current_tenant_id` |
| 5 | Text cast in RLS | Changed to NULLIF pattern |
| 6 | No FORCE RLS | Added to all 11 tables |
| 7 | No WITH CHECK clause | Added to all RLS policies |
| 8 | No system bypass | Added `app.is_system_user` check |
| 9 | `reports.user_id` external FK | Converted to comment |
| 10 | Broken `nft_mints` trigger | Removed (table doesn't exist) |
| 11 | CommonJS exports | Converted to ES module |

---

## Tables Summary

### Tenant-Scoped Tables (11) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `alerts` | System alerts | name, type, severity, message, resolved |
| `alert_rules` | Alert rule definitions | rule_name, metric_name, threshold |
| `dashboards` | Monitoring dashboards | name, widgets, layout, owner |
| `metrics` | Time-series metrics | name, service_name, value, timestamp |
| `nft_transfers` | NFT transfer tracking | token_address, from/to_address, status |
| `fraud_events` | Fraud detection events | user_id, pattern, risk_level |
| `incidents` | Incident management | title, status, severity, service_name |
| `sla_metrics` | SLA tracking | service_name, uptime_percentage, violations |
| `performance_metrics` | Performance tracking | service_name, endpoint, response_time_ms |
| `reports` | Report definitions | user_id, name, query, schedule |
| `report_history` | Report generation history | report_id, generated_at, status |

---

## Enums

| Enum | Values |
|------|--------|
| `alert_type` | error, warning, info |
| `alert_severity` | low, medium, high, critical |

---

## Functions

| Function | Purpose |
|----------|---------|
| `update_updated_at_column()` | Auto-update updated_at on row changes |
| `cleanup_old_metrics()` | Delete metrics older than 90 days |
| `cleanup_old_fraud_events()` | Delete investigated fraud events older than 1 year |

---

## Triggers

| Trigger | Table | Function |
|---------|-------|----------|
| `update_alerts_updated_at` | alerts | update_updated_at_column() |
| `update_alert_rules_updated_at` | alert_rules | update_updated_at_column() |
| `update_dashboards_updated_at` | dashboards | update_updated_at_column() |
| `update_incidents_updated_at` | incidents | update_updated_at_column() |
| `update_reports_updated_at` | reports | update_updated_at_column() |

---

## External FK References (Comments Only)

| Table.Column | References | Service |
|--------------|------------|---------|
| `reports.user_id` | users(id) | auth-service |

---

## Internal FK References (Enforced)

| Table.Column | References | On Delete |
|--------------|------------|-----------|
| `*.tenant_id` | tenants(id) | RESTRICT |
| `report_history.report_id` | reports(id) | CASCADE |

---

## RLS Policy Pattern

Applied to all 11 tenant-scoped tables:
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
| `uuid-ossp` extension | PostgreSQL 13+ has native gen_random_uuid() |
| `nft_mints` trigger | Table doesn't exist in this service |

---

## Breaking Changes

1. **tenant_id required** — No default value, must be explicitly provided
2. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`

---

## Files
```
backend/services/monitoring-service/src/migrations/
├── 001_consolidated_baseline.ts    # Consolidated migration
├── CONSOLIDATION_NOTES.md          # This file
├── MIGRATIONS.md                   # Original documentation
└── archived/                       # Original migration files
    └── 001_baseline_monitoring_schema.ts
```
