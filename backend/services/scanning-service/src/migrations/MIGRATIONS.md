# Scanning Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 1
> **Tables Created:** 7

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_scanning.ts | Ticket scanning infrastructure with RLS |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled |
|-------|-------------|---------------|-------------|
| scanner_devices | uuid | ✅ | ✅ |
| devices | uuid | ✅ | ✅ |
| scans | uuid | ✅ | ✅ |
| scan_policy_templates | uuid | ✅ | ✅ |
| scan_policies | uuid | ✅ | ✅ |
| offline_validation_cache | uuid | ✅ | ✅ |
| scan_anomalies | uuid | ✅ | ✅ |

---

## Table Details

### scanner_devices
Full device registry with offline capability support.
- device_id, device_name, device_type (mobile/kiosk/handheld)
- can_scan_offline flag
- Revocation tracking (revoked_at, revoked_by, revoked_reason)

### devices
Simpler device registry.
- device_id, name, zone (VIP/General/Backstage)

### scans
Scan event records.
- ticket_id, device_id, result (ALLOW/DENY), reason
- Reasons: DUPLICATE, WRONG_ZONE, REENTRY_DENIED, SUCCESS

### scan_policies
Event-specific scan rules.
- Policy types: DUPLICATE_WINDOW, REENTRY, ZONE_ENFORCEMENT
- Unique constraint on (event_id, policy_type)

### offline_validation_cache
Cached ticket data for offline scanning.
- validation_hash for offline verification
- valid_from, valid_until timeframe

### scan_anomalies
Fraud/anomaly detection.
- anomaly_types (TEXT[] array)
- risk_score (0-100)

---

## RLS Policies
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id::text = current_setting('app.current_tenant', true))
```

Applied to all 7 tables.

---

## Foreign Keys (9 total)

| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| scanner_devices | venue_id | venues.id | SET NULL |
| scanner_devices | registered_by | users.id | SET NULL |
| scanner_devices | revoked_by | users.id | SET NULL |
| scans | ticket_id | tickets.id | RESTRICT |
| scan_policies | event_id | events.id | CASCADE |
| scan_policies | venue_id | venues.id | SET NULL |
| offline_validation_cache | ticket_id | tickets.id | CASCADE |
| offline_validation_cache | event_id | events.id | CASCADE |
| scan_anomalies | ticket_id | tickets.id | RESTRICT |

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_tenant | TEXT | RLS tenant isolation |
