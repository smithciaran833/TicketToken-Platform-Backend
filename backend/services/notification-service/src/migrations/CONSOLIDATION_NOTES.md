# Notification Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 2026 |
| **Source Migrations** | 3 files |
| **Consolidated To** | 001_baseline_notification_service.ts |
| **Total Tables** | 32 (28 tenant-scoped, 4 global) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_baseline_notification_schema.ts | Initial 36 tables, 2 functions, 10 triggers, 25 FKs |
| 002_add_rls_policies.ts | RLS policies (wrong patterns), 3 helper functions |
| 20260103_add_rls_and_webhook_events.ts | webhook_events table, RLS fixes (wrong patterns), app role |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | `uuid_generate_v4()` | Changed to `gen_random_uuid()` |
| 2 | `uuid-ossp` extension | Removed |
| 3 | Wrong RLS setting (`app.current_tenant`) | Changed to `app.current_tenant_id` |
| 4 | Wrong bypass setting (`app.bypass_rls`) | Changed to `app.is_system_user` |
| 5 | Zero UUID fallback (COALESCE pattern) | Removed, use NULLIF only |
| 6 | postgres user bypass | Removed |
| 7 | Text cast in RLS (`tenant_id::text`) | Changed to NULLIF pattern |
| 8 | No FORCE RLS | Added to all 28 tenant tables |
| 9 | Missing tenant_id (20 tables) | Added tenant_id column |
| 10 | venue_id RLS pattern (10 tables) | Changed to tenant_id pattern |
| 11 | user_id RLS pattern (4 tables) | Changed to tenant_id pattern |
| 12 | 23 external FKs enforced | Converted to comments |
| 13 | 3 helper functions | Removed (use inline pattern) |
| 14 | `notification_service_app` role | Excluded (infra concern) |
| 15 | Conflicting RLS in file 003 | Ignored (superseded by correct pattern) |

---

## Tables Summary

### Tenant-Scoped Tables (28) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `scheduled_notifications` | Future delivery queue | user_id, notification_type, scheduled_for |
| `notification_history` | Main notification log | venue_id, recipient_id, channel, status |
| `consent_records` | User consent tracking | customer_id, venue_id, channel, status |
| `notification_preferences` | User channel preferences | user_id (PK), email_enabled, sms_enabled |
| `notification_preference_history` | Preference change audit | user_id, changes, reason |
| `notification_tracking` | Detailed PII tracking | notification_id, recipient_email_encrypted |
| `notification_engagement` | User engagement tracking | notification_id, user_id, action |
| `notification_clicks` | Click tracking | notification_id, user_id, original_url |
| `notification_templates` | Message templates | venue_id, name, channel, content |
| `notification_campaigns` | Campaign management | venue_id, template_id, status |
| `audience_segments` | Target audience definitions | venue_id, filter_criteria, member_count |
| `email_automation_triggers` | Automation rules | venue_id, trigger_type, template_id |
| `ab_tests` | A/B test definitions | venue_id, test_type, winning_metric |
| `ab_test_variants` | Test variants | ab_test_id, variant_name, template_id |
| `ab_test_metrics` | Test results | test_id, variant_id, metric_name, value |
| `automation_executions` | Automation run history | trigger_id, executed_at, status |
| `bounces` | Email bounce tracking | notification_id, email, bounce_type |
| `campaign_stats` | Campaign performance | campaign_id, sent, delivered, opened |
| `engagement_events` | Engagement event log | notification_id, event_type |
| `notification_analytics_daily` | Daily aggregated stats | venue_id, date, channel, sent, delivered |
| `pending_deletions` | GDPR deletion queue | user_id, scheduled_for, status |
| `template_usage` | Template usage stats | template_id, notification_id, success |
| `template_versions` | Template version history | template_id, version, content |
| `translations` | i18n support | language, key, value, namespace |
| `venue_health_scores` | Venue health metrics | venue_id, overall_score, delivery_score |
| `abandoned_carts` | Cart abandonment tracking | user_id, venue_id, event_id, cart_items |
| `venue_notification_settings` | Per-venue config | venue_id, daily_email_limit, quiet_hours |
| `notification_costs` | Cost tracking | notification_id, venue_id, cost, provider |

### Global Tables (4) — No RLS

| Table | Purpose | Notes |
|-------|---------|-------|
| `suppression_list` | Platform-wide email/phone blocklist | Global lookup by hash |
| `notification_delivery_stats` | Platform aggregate delivery stats | Date-based aggregation |
| `notification_analytics` | Platform hourly analytics | Used by aggregate function |
| `webhook_events` | Provider webhook deduplication | Provider + event_id unique |

---

## External FK References (Comments Only)

| Table.Column | References | Service |
|--------------|------------|---------|
| `scheduled_notifications.user_id` | users(id) | auth-service |
| `scheduled_notifications.order_id` | orders(id) | order-service |
| `notification_history.venue_id` | venues(id) | venue-service |
| `notification_history.recipient_id` | users(id) | auth-service |
| `consent_records.customer_id` | users(id) | auth-service |
| `consent_records.venue_id` | venues(id) | venue-service |
| `suppression_list.suppressed_by` | users(id) | auth-service |
| `notification_preferences.user_id` | users(id) | auth-service |
| `notification_preference_history.changed_by` | users(id) | auth-service |
| `notification_tracking.venue_id` | venues(id) | venue-service |
| `notification_tracking.recipient_id` | users(id) | auth-service |
| `notification_engagement.user_id` | users(id) | auth-service |
| `notification_clicks.user_id` | users(id) | auth-service |
| `notification_templates.venue_id` | venues(id) | venue-service |
| `notification_campaigns.venue_id` | venues(id) | venue-service |
| `audience_segments.venue_id` | venues(id) | venue-service |
| `email_automation_triggers.venue_id` | venues(id) | venue-service |
| `ab_tests.venue_id` | venues(id) | venue-service |
| `abandoned_carts.user_id` | users(id) | auth-service |
| `abandoned_carts.venue_id` | venues(id) | venue-service |
| `abandoned_carts.event_id` | events(id) | event-service |
| `abandoned_carts.order_id` | orders(id) | order-service |
| `venue_notification_settings.venue_id` | venues(id) | venue-service |
| `notification_costs.venue_id` | venues(id) | venue-service |
| `venue_health_scores.venue_id` | venues(id) | venue-service |
| `notification_analytics_daily.venue_id` | venues(id) | venue-service |
| `template_versions.created_by` | users(id) | auth-service |
| `pending_deletions.user_id` | users(id) | auth-service |
| `template_usage.venue_id` | venues(id) | venue-service |
| `bounces.venue_id` | venues(id) | venue-service |

---

## Internal FK References (Enforced)

| Table.Column | References | On Delete |
|--------------|------------|-----------|
| `notification_preference_history.user_id` | notification_preferences(user_id) | CASCADE |
| `notification_engagement.notification_id` | notification_history(id) | CASCADE |
| `notification_clicks.notification_id` | notification_history(id) | CASCADE |
| `notification_campaigns.template_id` | notification_templates(id) | SET NULL |
| `email_automation_triggers.template_id` | notification_templates(id) | CASCADE |
| `ab_test_variants.ab_test_id` | ab_tests(id) | CASCADE |
| `ab_test_variants.template_id` | notification_templates(id) | SET NULL |
| `notification_costs.notification_id` | notification_history(id) | CASCADE |

---

## Enums

| Enum | Values |
|------|--------|
| `notification_channel` | email, sms, push, webhook |
| `notification_type` | transactional, marketing, system |
| `notification_priority` | critical, high, normal, low |
| `scheduled_status` | PENDING, SENT, FAILED, CANCELLED |
| `delivery_status` | pending, queued, sending, sent, failed, bounced, delivered |
| `consent_status` | granted, revoked, pending |
| `tracking_status` | pending, sent, delivered, failed, bounced |
| `campaign_status` | draft, scheduled, sending, completed, cancelled, paused |
| `ab_test_status` | draft, running, completed, cancelled |
| `execution_status` | completed, failed, in_progress |
| `bounce_type` | hard, soft, complaint, transient |
| `engagement_event_type` | open, click, conversion, unsubscribe, bounce, spam_report |
| `deletion_status` | scheduled, in_progress, completed, cancelled, failed |

---

## Functions

| Function | Purpose |
|----------|---------|
| `update_updated_at_column()` | Auto-update updated_at trigger |
| `aggregate_notification_analytics()` | Aggregate hourly stats from notification_history |

---

## Triggers

| Trigger | Table | Function | Purpose |
|---------|-------|----------|---------|
| `update_scheduled_notifications_updated_at` | scheduled_notifications | update_updated_at_column() | Auto timestamp |
| `update_notification_history_updated_at` | notification_history | update_updated_at_column() | Auto timestamp |
| `update_consent_records_updated_at` | consent_records | update_updated_at_column() | Auto timestamp |
| `update_notification_preferences_updated_at` | notification_preferences | update_updated_at_column() | Auto timestamp |
| `update_notification_templates_updated_at` | notification_templates | update_updated_at_column() | Auto timestamp |
| `update_notification_campaigns_updated_at` | notification_campaigns | update_updated_at_column() | Auto timestamp |
| `update_audience_segments_updated_at` | audience_segments | update_updated_at_column() | Auto timestamp |
| `update_email_automation_triggers_updated_at` | email_automation_triggers | update_updated_at_column() | Auto timestamp |
| `update_ab_tests_updated_at` | ab_tests | update_updated_at_column() | Auto timestamp |
| `update_venue_notification_settings_updated_at` | venue_notification_settings | update_updated_at_column() | Auto timestamp |

---

## RLS Policy Pattern

Applied to all 28 tenant-scoped tables:
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
| `notification_service_app` role | Infra concern |
| `notification_set_tenant_context()` function | Use inline pattern |
| `notification_set_venue_context()` function | Use inline pattern |
| `notification_set_user_context()` function | Use inline pattern |
| `uuid-ossp` extension | PostgreSQL 13+ native |
| Zero UUID defaults | Bad practice |

---

## Key Decisions

### tenant_id vs venue_id
- **tenant_id**: Security boundary - RLS isolation, who can see the data
- **venue_id**: Business relationship - which venue this relates to
- All 28 tenant tables get tenant_id for RLS
- 15 tables retain venue_id as business column for filtering

### Tables That Keep Both tenant_id AND venue_id
- notification_history
- consent_records
- notification_templates
- notification_campaigns
- audience_segments
- email_automation_triggers
- ab_tests
- abandoned_carts
- venue_notification_settings
- notification_costs
- notification_analytics_daily
- venue_health_scores
- notification_tracking
- bounces
- template_usage

---

## Breaking Changes

1. **tenant_id required** — No default value, must be explicitly provided
2. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`
3. **External FKs removed** — Cross-service references no longer enforced at DB level
4. **Enums used** — Status columns now use PostgreSQL enums instead of strings
5. **venue_id/user_id isolation removed** — All RLS now uses tenant_id only

---

## Migration Instructions

### For New Environments
Run consolidated baseline only:
```bash
npx knex migrate:latest
```

### For Existing Environments
If original migrations were already applied:
1. Mark them as complete in knex_migrations table
2. OR drop and recreate schema using consolidated baseline

---

## Files
```
backend/services/notification-service/src/migrations/
├── 001_baseline_notification_service.ts  # Consolidated migration
├── CONSOLIDATION_NOTES.md                # This file
├── MIGRATIONS.md                         # Original documentation
└── archived/                             # Original migration files
    ├── 001_baseline_notification_schema.ts
    ├── 002_add_rls_policies.ts
    └── 20260103_add_rls_and_webhook_events.ts
```
