# Monitoring Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 1
> **Tables Created:** 11
> **Functions Created:** 3

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_monitoring_schema.ts | Create monitoring tables, functions, RLS |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled |
|-------|-------------|---------------|-------------|
| alerts | uuid | ✅ | ✅ |
| alert_rules | uuid | ✅ | ✅ |
| dashboards | uuid | ✅ | ✅ |
| metrics | uuid | ✅ | ✅ |
| nft_transfers | uuid | ✅ | ✅ |
| fraud_events | uuid | ✅ | ✅ |
| incidents | uuid | ✅ | ✅ |
| sla_metrics | uuid | ✅ | ✅ |
| performance_metrics | uuid | ✅ | ✅ |
| reports | uuid | ✅ | ✅ |
| report_history | uuid | ✅ | ✅ |

---

## Key Tables

### alerts
- Stores system alerts with type, severity, message
- Enums: type (error/warning/info), severity (low/medium/high/critical)

### metrics
- General metrics storage with service_name, metric_name, value
- Indexed for time-series queries

### fraud_events
- Fraud detection with user_id, pattern, risk_level
- Unique on (user_id, pattern, timestamp)

### incidents
- Incident tracking with status, severity, service_name
- Enums: severity (low/medium/high/critical)

### performance_metrics
- API performance tracking: service_name, endpoint, response_time_ms

### sla_metrics
- SLA tracking: uptime_percentage, response_time_p95, violations

---

## Foreign Keys

| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| All tables | tenant_id | tenants.id | RESTRICT |
| report_history | report_id | reports.id | CASCADE |

---

## RLS Policies
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id::text = current_setting('app.current_tenant', true))
```

Applied to all 11 tables.

---

## Functions Created

| Function | Purpose |
|----------|---------|
| update_updated_at_column() | Auto-update updated_at on UPDATE |
| cleanup_old_metrics() | Delete metrics older than 90 days |
| cleanup_old_fraud_events() | Delete investigated fraud events older than 1 year |

---

## Triggers

| Trigger | Table | Function |
|---------|-------|----------|
| update_alerts_updated_at | alerts | update_updated_at_column() |
| update_alert_rules_updated_at | alert_rules | update_updated_at_column() |
| update_dashboards_updated_at | dashboards | update_updated_at_column() |
| update_nft_mints_updated_at | nft_mints | update_updated_at_column() |
| update_incidents_updated_at | incidents | update_updated_at_column() |
| update_reports_updated_at | reports | update_updated_at_column() |

---

## Enums

### alerts.type
- error, warning, info

### alerts.severity / incidents.severity
- low, medium, high, critical

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_tenant | TEXT | RLS tenant isolation |
