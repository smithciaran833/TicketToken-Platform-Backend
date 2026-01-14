# Analytics Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 13, 2026 |
| **Source Migrations** | 4 files |
| **Consolidated To** | 001_baseline_analytics_service.ts |
| **Total Tables** | 15 (all tenant-scoped) |
| **Total Views** | 36 regular + 5 materialized |
| **Total Functions** | 4 (1 trigger + 3 refresh) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_analytics_baseline.ts | Initial 13 tables, 36 views, 5 MVs, 3 functions, RLS (wrong pattern) |
| 002_create_external_analytics_tables.ts | venue_analytics, event_analytics tables (missing tenant_id) |
| 003_add_rls_to_price_tables.ts | Add tenant_id to price_history, pending_price_changes |
| 20260103_add_rls_policies.ts | RLS policies (wrong table names - mostly ignored) |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Wrong RLS setting (`app.current_tenant`) | Changed to `app.current_tenant_id` |
| 2 | No FORCE RLS | Added to all 15 tables |
| 3 | No WITH CHECK clause | Added to all RLS policies |
| 4 | No system bypass | Added `app.is_system_user` check |
| 5 | Missing tenant_id (venue_analytics, event_analytics) | Added tenant_id column |
| 6 | Subquery RLS on event_analytics | Removed, use tenant_id directly |
| 7 | venue_id used as tenant in RLS | Changed to proper tenant_id pattern |
| 8 | 17 external FKs enforced | Converted to comments |
| 9 | Separate RLS policies per operation (SELECT/INSERT/UPDATE/DELETE) | Consolidated to single FOR ALL policy |
| 10 | `analytics_app` role | Excluded (infra concern) |
| 11 | `audit_trigger_func()` | Removed (use standard update_updated_at_column) |
| 12 | Wrong table names in 20260103 file | Ignored entire file (only 2 of 13 tables existed) |
| 13 | Renamed venue_analytics table | → venue_analytics_data (to avoid conflict with view name) |

---

## Tables Summary

### Tenant-Scoped Tables (15) — All With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `analytics_metrics` | Raw metric data | metric_type, entity_type, entity_id, value |
| `analytics_aggregations` | Pre-aggregated metrics | aggregation_type, time_period, period_start |
| `analytics_alerts` | Alert definitions & triggers | alert_type, severity, threshold_config, status |
| `analytics_dashboards` | Dashboard configurations | name, type, layout, created_by |
| `analytics_widgets` | Dashboard widget configs | dashboard_id, widget_type, configuration |
| `analytics_exports` | Export job tracking | export_type, format, status, file_url |
| `customer_rfm_scores` | RFM analysis per customer | customer_id, venue_id, recency/frequency/monetary scores |
| `customer_segments` | Segment definitions per venue | venue_id, segment_name, customer_count |
| `customer_lifetime_value` | CLV calculations | customer_id, clv, predicted_clv_12/24_months |
| `realtime_metrics` | Short-lived realtime data | venue_id, metric_type, metric_value, expires_at |
| `venue_alerts` | Venue-specific alerts | venue_id, alert_name, is_active |
| `price_history` | Dynamic pricing history | event_id, price_cents, changed_at |
| `pending_price_changes` | Pricing recommendations | event_id, recommended_price, confidence |
| `venue_analytics_data` | Venue daily aggregates | venue_id, date, revenue, ticket_sales |
| `event_analytics` | Event daily aggregates | event_id, date, revenue, tickets_sold |

### Global Tables

None — all 15 tables are tenant-scoped.

---

## Views Summary

### Views Dependency Notice
These views reference tables from other services. Views will fail to create if dependent tables don't exist:
- `events`, `venues`, `event_schedules`, `event_capacity` (venue-service, event-service)
- `tickets`, `ticket_types` (ticket-service)
- `users` (auth-service)
- `payment_transactions` (payment-service)
- `marketplace_transfers`, `marketplace_listings`, `platform_fees` (marketplace-service)
- `audit_logs` (various services)

### Regular Views (36)

| Category | Views |
|----------|-------|
| Event/Venue | event_summary, venue_analytics |
| Ticket | ticket_status_details, ticket_inventory_summary |
| Financial | financial_summary_basic, financial_summary_payment_methods, financial_summary_with_refunds, financial_summary_with_fees, financial_summary, daily_revenue_summary |
| Customer 360 | customer_360_basic, customer_360_with_preferences, customer_360_with_purchases, customer_360_with_engagement, customer_360_with_segments, customer_360_with_churn_risk, customer_360, customer_segment_summary, churn_risk_dashboard, customer_360_gdpr |
| Marketplace | marketplace_activity_basic, marketplace_activity_with_listings, marketplace_activity_with_users, marketplace_activity_with_fees, marketplace_activity, daily_marketplace_summary, seller_performance |
| User Dashboard | user_dashboard_view |
| Compliance | compliance_reporting_basic, compliance_reporting_user_activity, compliance_reporting_data_changes, compliance_reporting_risk_analysis, compliance_reporting, daily_compliance_summary, user_risk_profile, compliance_reporting_gdpr |

### Materialized Views (5)

| MV | Source View | Refresh Function |
|----|-------------|------------------|
| venue_analytics_mv | venue_analytics | refresh_venue_analytics_mv() |
| customer_360_materialized | customer_360 | Manual refresh |
| marketplace_activity_materialized | marketplace_activity | Manual refresh |
| user_dashboard_materialized | user_dashboard_view | refresh_user_dashboard() |
| compliance_reporting_materialized | compliance_reporting | refresh_compliance_reporting_materialized() |

---

## External FK References (Comments Only)

| Table.Column | References | Service |
|--------------|------------|---------|
| `analytics_alerts.resolved_by` | users(id) | auth-service |
| `analytics_dashboards.created_by` | users(id) | auth-service |
| `analytics_exports.requested_by` | users(id) | auth-service |
| `customer_rfm_scores.customer_id` | users(id) | auth-service |
| `customer_rfm_scores.venue_id` | venues(id) | venue-service |
| `customer_segments.venue_id` | venues(id) | venue-service |
| `customer_lifetime_value.customer_id` | users(id) | auth-service |
| `customer_lifetime_value.venue_id` | venues(id) | venue-service |
| `realtime_metrics.venue_id` | venues(id) | venue-service |
| `venue_alerts.venue_id` | venues(id) | venue-service |
| `price_history.event_id` | events(id) | event-service |
| `price_history.changed_by` | users(id) | auth-service |
| `pending_price_changes.event_id` | events(id) | event-service |
| `pending_price_changes.approved_by` | users(id) | auth-service |
| `pending_price_changes.rejected_by` | users(id) | auth-service |
| `venue_analytics_data.venue_id` | venues(id) | venue-service |
| `event_analytics.event_id` | events(id) | event-service |

---

## Internal FK References (Enforced)

| Table.Column | References | On Delete |
|--------------|------------|-----------|
| `analytics_widgets.dashboard_id` | analytics_dashboards(id) | CASCADE |

---

## Functions

| Function | Purpose |
|----------|---------|
| `update_updated_at_column()` | Auto-update updated_at trigger |
| `refresh_venue_analytics_mv()` | Refresh venue_analytics_mv materialized view |
| `refresh_user_dashboard()` | Refresh user_dashboard_materialized (with CONCURRENTLY) |
| `refresh_compliance_reporting_materialized()` | Refresh compliance_reporting_materialized (with CONCURRENTLY) |

---

## RLS Policy Pattern

Applied to all 15 tenant-scoped tables:
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

## Excluded Items

| Item | Reason |
|------|--------|
| `analytics_app` role | Infra concern |
| `audit_trigger_func()` | Use standard update_updated_at_column() |
| 11 wrong table names from 20260103 | Tables didn't exist (customers, analytics_events, dashboards, etc.) |

---

## Key Decisions

### tenant_id vs venue_id/event_id
- **tenant_id**: Security boundary - RLS isolation
- **venue_id / event_id**: Business relationship - filtering
- All 15 tables get tenant_id for RLS
- venue_id/event_id retained where relevant for business queries

### Tables With Both tenant_id AND venue_id
- customer_rfm_scores
- customer_segments
- customer_lifetime_value
- realtime_metrics
- venue_alerts
- venue_analytics_data

### Tables With Both tenant_id AND event_id
- price_history
- pending_price_changes
- event_analytics

### Table Rename
- Original `venue_analytics` table → renamed to `venue_analytics_data`
- Reason: Avoid conflict with `venue_analytics` view name

---

## Breaking Changes

1. **tenant_id required** — No default value, must be explicitly provided
2. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`
3. **External FKs removed** — Cross-service references no longer enforced at DB level
4. **Table renamed** — `venue_analytics` → `venue_analytics_data`
5. **Views depend on external tables** — Will fail if dependent services not migrated first

---

## Migration Instructions

### For New Environments
Run consolidated baseline only:
```bash
npx knex migrate:latest
```

**Note:** Views require dependent tables from other services to exist first.

### For Existing Environments
If original migrations were already applied:
1. Mark them as complete in knex_migrations table
2. OR drop and recreate schema using consolidated baseline

---

## Files
```
backend/services/analytics-service/src/migrations/
├── 001_baseline_analytics_service.ts   # Consolidated migration
├── CONSOLIDATION_NOTES.md              # This file
├── MIGRATIONS.md                       # Original documentation
└── archived/                           # Original migration files
    ├── 001_analytics_baseline.ts
    ├── 002_create_external_analytics_tables.ts
    ├── 003_add_rls_to_price_tables.ts
    └── 20260103_add_rls_policies.ts
```
