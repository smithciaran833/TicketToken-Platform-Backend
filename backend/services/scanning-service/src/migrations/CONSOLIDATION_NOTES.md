# Scanning Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 2025 |
| **Source Migrations** | 1 file |
| **Consolidated To** | 001_consolidated_baseline.ts |
| **Total Tables** | 7 (all tenant-scoped) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_baseline_scanning.ts | Initial 7 tables for scanning operations |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | `uuid_generate_v4()` | Changed to `gen_random_uuid()` |
| 2 | Zero UUID default on tenant_id | Removed — tenant_id now required |
| 3 | Wrong RLS setting (`app.current_tenant`) | Changed to `app.current_tenant_id` |
| 4 | Text cast in RLS | Changed to NULLIF pattern |
| 5 | No FORCE RLS | Added to all 7 tables |
| 6 | No WITH CHECK clause | Added to all RLS policies |
| 7 | No system bypass | Added `app.is_system_user` check |
| 8 | 9 external FKs enforced | Converted to comments |

---

## Tables Summary

### Tenant-Scoped Tables (7) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `scanner_devices` | Device registry with offline capability | device_id, venue_id, can_scan_offline |
| `devices` | Simple device tracking | device_id, name, zone |
| `scans` | Scan event records | ticket_id, device_id, result, reason |
| `scan_policy_templates` | Reusable policy templates | name, policy_set, is_default |
| `scan_policies` | Event-specific scan rules | event_id, policy_type, config |
| `offline_validation_cache` | Offline validation data | ticket_id, validation_hash, valid_until |
| `scan_anomalies` | Anomaly detection records | ticket_id, anomaly_types, risk_score |

---

## External FK References (Comments Only)

| Table.Column | References | Service |
|--------------|------------|---------|
| `scanner_devices.venue_id` | venues(id) | venue-service |
| `scanner_devices.registered_by` | users(id) | auth-service |
| `scanner_devices.revoked_by` | users(id) | auth-service |
| `scans.ticket_id` | tickets(id) | ticket-service |
| `scan_policies.event_id` | events(id) | event-service |
| `scan_policies.venue_id` | venues(id) | venue-service |
| `offline_validation_cache.ticket_id` | tickets(id) | ticket-service |
| `offline_validation_cache.event_id` | events(id) | event-service |
| `scan_anomalies.ticket_id` | tickets(id) | ticket-service |

---

## Internal FK References (Enforced)

| Table.Column | References | On Delete |
|--------------|------------|-----------|
| `*.tenant_id` | tenants(id) | RESTRICT |

---

## RLS Policy Pattern

Applied to all 7 tenant-scoped tables:
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

## Breaking Changes

1. **tenant_id required** — No default value, must be explicitly provided
2. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`
3. **External FKs removed** — Cross-service references no longer enforced at DB level

---

## Files
```
backend/services/scanning-service/src/migrations/
├── 001_consolidated_baseline.ts    # Consolidated migration
├── CONSOLIDATION_NOTES.md          # This file
├── MIGRATIONS.md                   # Original documentation
└── archived/                       # Original migration files
    └── 001_baseline_scanning.ts
```
