# Analytics Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 3
> **Tables Created:** 16
> **Tables Modified:** 2
> **Views Created:** 30+

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_analytics_baseline.ts | Create 14 tables, 30+ views, 11 RLS policies |
| 2 | 002_create_external_analytics_tables.ts | Create venue_analytics, event_analytics tables |
| 3 | 003_add_rls_to_price_tables.ts | Add tenant_id and RLS to price tables |

---

## Tables Owned

### From 001_analytics_baseline.ts

| Table | Primary Key | Has tenant_id | RLS Enabled |
|-------|-------------|---------------|-------------|
| analytics_metrics | uuid | ✅ | ✅ |
| analytics_aggregations | uuid | ✅ | ✅ |
| analytics_alerts | uuid | ✅ | ✅ |
| analytics_dashboards | uuid | ✅ | ✅ |
| analytics_widgets | uuid | ✅ | ✅ |
| analytics_exports | uuid | ✅ | ✅ |
| customer_rfm_scores | uuid | ✅ | ✅ |
| customer_segments | uuid | ✅ | ✅ |
| customer_lifetime_value | uuid | ✅ | ✅ |
| realtime_metrics | uuid | ✅ | ✅ |
| venue_alerts | uuid | ✅ | ✅ |
| price_history | uuid | ✅ (added in 003) | ✅ (added in 003) |
| pending_price_changes | uuid | ✅ (added in 003) | ✅ (added in 003) |

### From 002_create_external_analytics_tables.ts

| Table | Primary Key | Has tenant_id | RLS Enabled |
|-------|-------------|---------------|-------------|
| venue_analytics | uuid | ❌ (uses venue_id) | ✅ (different policy) |
| event_analytics | uuid | ❌ (uses event_id) | ✅ (different policy) |

---

## Foreign Keys

| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| analytics_widgets | dashboard_id | analytics_dashboards.id | CASCADE |

---

## Indexes

### analytics_metrics
- tenant_id
- [tenant_id, metric_type]
- [tenant_id, entity_type, entity_id]
- [tenant_id, timestamp]
- timestamp

### analytics_aggregations
- tenant_id
- [tenant_id, aggregation_type]
- [tenant_id, metric_type]
- [tenant_id, entity_type, entity_id]
- [tenant_id, time_period, period_start]
- period_start
- UNIQUE: [tenant_id, aggregation_type, metric_type, entity_type, entity_id, time_period, period_start]

### analytics_alerts
- tenant_id
- [tenant_id, status]
- [tenant_id, alert_type]
- [tenant_id, severity]
- [tenant_id, entity_type, entity_id]
- triggered_at

### analytics_dashboards
- tenant_id
- [tenant_id, type]
- [tenant_id, created_by]
- [tenant_id, is_default]

### analytics_widgets
- tenant_id
- [tenant_id, dashboard_id]
- [tenant_id, widget_type]

### analytics_exports
- tenant_id
- [tenant_id, status]
- [tenant_id, requested_by]
- [tenant_id, export_type]
- expires_at

### customer_rfm_scores
- tenant_id
- venue_id
- segment
- total_score
- calculated_at
- [venue_id, segment]
- [venue_id, churn_risk]
- UNIQUE: [customer_id, venue_id]

### customer_segments
- tenant_id
- last_calculated_at
- UNIQUE: [venue_id, segment_name]

### customer_lifetime_value
- tenant_id
- venue_id
- clv
- calculated_at
- [venue_id, clv]
- UNIQUE: customer_id

### realtime_metrics
- tenant_id
- [tenant_id, venue_id]
- [venue_id, metric_type]
- expires_at
- UNIQUE: [venue_id, metric_type]

### venue_alerts
- tenant_id
- [tenant_id, venue_id]
- [venue_id, is_active]
- alert_name

### price_history
- [event_id, changed_at]
- tenant_id (added in 003)

### pending_price_changes
- event_id
- approved_at
- tenant_id (added in 003)
- UNIQUE: event_id

### venue_analytics (from 002)
- [venue_id, date]
- date
- UNIQUE: [venue_id, date]

### event_analytics (from 002)
- [event_id, date]
- date
- UNIQUE: [event_id, date]

---

## RLS Policies

### Standard Policy (11 tables from 001)
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id = current_setting('app.current_tenant')::uuid)
```

Applied to: analytics_metrics, analytics_aggregations, analytics_alerts, analytics_dashboards, analytics_widgets, analytics_exports, customer_rfm_scores, customer_segments, customer_lifetime_value, realtime_metrics, venue_alerts

### venue_analytics Policy (from 002) - DIFFERENT APPROACH
```sql
CREATE POLICY tenant_isolation_policy ON venue_analytics
USING (venue_id::text = current_setting('app.current_tenant', true))
```

### event_analytics Policy (from 002) - DIFFERENT APPROACH
```sql
CREATE POLICY tenant_isolation_policy ON event_analytics
USING (
  event_id IN (
    SELECT id FROM events
    WHERE venue_id::text = current_setting('app.current_tenant', true)
  )
)
```

### price_history & pending_price_changes Policies (from 003)
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id = current_setting('app.current_tenant')::uuid)
```

---

## Views Created (001_analytics_baseline.ts)

### Regular Views
| View | Dependencies |
|------|--------------|
| event_summary | events, venues, event_schedules, event_capacity, tickets |
| venue_analytics | venues, events, tickets |
| ticket_status_details | tickets, events, venues, ticket_types |
| ticket_inventory_summary | tickets, events, ticket_types |
| financial_summary_basic | payment_transactions |
| customer_360_basic | users, tickets |
| customer_360_with_preferences | customer_360_basic, users |
| customer_360_with_purchases | customer_360_with_preferences, payment_transactions |
| customer_360_with_engagement | customer_360_with_purchases |
| customer_360_with_segments | customer_360_with_engagement |
| customer_360_with_churn_risk | customer_360_with_segments |
| customer_360 | customer_360_with_churn_risk |
| customer_segment_summary | customer_360 |
| churn_risk_dashboard | customer_360 |
| customer_360_gdpr | customer_360 |
| financial_summary_payment_methods | financial_summary_basic, payment_transactions |
| financial_summary_with_refunds | financial_summary_payment_methods, payment_transactions |
| financial_summary_with_fees | financial_summary_with_refunds |
| financial_summary | financial_summary_with_fees |
| daily_revenue_summary | financial_summary |
| marketplace_activity_basic | marketplace_transfers |
| marketplace_activity_with_listings | marketplace_activity_basic, marketplace_listings |
| marketplace_activity_with_users | marketplace_activity_with_listings, users |
| marketplace_activity_with_fees | marketplace_activity_with_users, marketplace_transfers, platform_fees |
| marketplace_activity | marketplace_activity_with_fees |
| daily_marketplace_summary | marketplace_activity |
| seller_performance | marketplace_activity |
| user_dashboard_view | users, tickets, marketplace_listings |
| compliance_reporting_basic | audit_logs |
| compliance_reporting_user_activity | compliance_reporting_basic, users |
| compliance_reporting_data_changes | compliance_reporting_user_activity, audit_logs |
| compliance_reporting_risk_analysis | compliance_reporting_data_changes |
| compliance_reporting | compliance_reporting_risk_analysis |
| daily_compliance_summary | compliance_reporting |
| user_risk_profile | compliance_reporting |
| compliance_reporting_gdpr | compliance_reporting |

### Materialized Views
| View | Source | Indexes |
|------|--------|---------|
| venue_analytics_mv | venue_analytics | venue_id |
| customer_360_materialized | customer_360 | customer_id, value_segment |
| marketplace_activity_materialized | marketplace_activity | sale_date, ticket_id |
| user_dashboard_materialized | user_dashboard_view | user_id (unique), status, loyalty_tier |
| compliance_reporting_materialized | compliance_reporting (30 days) | audit_date, user_id, alert_level |

---

## Functions Created

| Function | Purpose |
|----------|---------|
| refresh_venue_analytics_mv() | Refresh venue_analytics_mv materialized view |
| refresh_user_dashboard(uuid[]) | Refresh user_dashboard_materialized |
| refresh_compliance_reporting_materialized() | Refresh compliance_reporting_materialized |

---

## Cross-Service Dependencies

| External Table | Service Owner | Used By |
|----------------|---------------|---------|
| events | event-service | Views, price tables |
| venues | venue-service | Views |
| event_schedules | event-service | Views |
| event_capacity | event-service | Views |
| tickets | ticket-service | Views |
| ticket_types | ticket-service | Views |
| payment_transactions | payment-service | Views |
| users | auth-service | Views |
| marketplace_transfers | marketplace-service | Views |
| marketplace_listings | marketplace-service | Views |
| platform_fees | payment-service | Views |
| audit_logs | auth-service | Views |

---

## ⚠️ Known Issues

### 1. Name Collision
- Migration 001 creates VIEW `venue_analytics`
- Migration 002 creates TABLE `venue_analytics`
- **These will conflict!**

### 2. Inconsistent RLS Approach
- 001 tables: `tenant_id = current_setting('app.current_tenant')::uuid`
- 002 tables: `venue_id::text = current_setting('app.current_tenant', true)`
- Different casting, different column, different optional flag

### 3. Missing tenant_id in 002 Tables
- venue_analytics and event_analytics don't have tenant_id column
- Use venue_id/event_id for isolation instead
- Architecturally inconsistent with other tables

### 4. Heavy View Dependencies
- Views depend on 7+ external service tables
- If those tables change, views will break
- No validation that external tables exist

---

## Migration Commands
```bash
# Run migrations
npx knex migrate:latest --knexfile src/knexfile.ts

# Rollback last migration
npx knex migrate:rollback --knexfile src/knexfile.ts

# Check migration status
npx knex migrate:status --knexfile src/knexfile.ts
```

---

## Refresh Materialized Views
```sql
-- Refresh all materialized views
SELECT refresh_venue_analytics_mv();
SELECT refresh_user_dashboard(NULL);
SELECT refresh_compliance_reporting_materialized();

-- Or manually
REFRESH MATERIALIZED VIEW venue_analytics_mv;
REFRESH MATERIALIZED VIEW CONCURRENTLY customer_360_materialized;
REFRESH MATERIALIZED VIEW CONCURRENTLY marketplace_activity_materialized;
REFRESH MATERIALIZED VIEW CONCURRENTLY user_dashboard_materialized;
REFRESH MATERIALIZED VIEW CONCURRENTLY compliance_reporting_materialized;
```
