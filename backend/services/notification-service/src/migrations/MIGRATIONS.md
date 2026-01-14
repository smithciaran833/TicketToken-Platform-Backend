# Notification Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 1
> **Tables Created:** 32
> **Functions Created:** 2

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_notification_schema.ts | Create all notification infrastructure |

---

## Tables Overview

### Core Notification Tables
| Table | Purpose |
|-------|---------|
| scheduled_notifications | Future delivery queue |
| notification_history | Main notification log |
| notification_tracking | Detailed PII tracking |

### Consent & Preferences
| Table | Purpose |
|-------|---------|
| consent_records | User consent tracking |
| suppression_list | Blocked recipients |
| notification_preferences | User channel preferences |
| notification_preference_history | Preference change audit |

### Templates & Campaigns
| Table | Purpose |
|-------|---------|
| notification_templates | Message templates |
| notification_campaigns | Campaign management |
| audience_segments | Target audience definitions |
| email_automation_triggers | Automation rules |

### A/B Testing
| Table | Purpose |
|-------|---------|
| ab_tests | Test definitions |
| ab_test_variants | Test variants |
| ab_test_metrics | Test results |

### Analytics
| Table | Purpose |
|-------|---------|
| notification_analytics | Hourly aggregated stats |
| notification_analytics_daily | Daily aggregated stats |
| notification_delivery_stats | Delivery statistics |
| notification_engagement | User engagement tracking |
| notification_clicks | Click tracking |
| campaign_stats | Campaign performance |
| engagement_events | Engagement event log |

### Operations
| Table | Purpose |
|-------|---------|
| bounces | Email bounce tracking |
| automation_executions | Automation run history |
| venue_notification_settings | Venue-specific settings |
| notification_costs | Cost tracking |
| venue_health_scores | Venue health metrics |
| abandoned_carts | Cart abandonment tracking |

### Content Management
| Table | Purpose |
|-------|---------|
| template_usage | Template usage stats |
| template_versions | Template version history |
| translations | i18n support |

### GDPR/Compliance
| Table | Purpose |
|-------|---------|
| pending_deletions | GDPR deletion queue |

---

## Enums Used

### Channel Types
- email, sms, push, webhook

### Notification Types
- transactional, marketing, system

### Priority Levels
- critical, high, normal, low

### Delivery Status
- pending, queued, sending, sent, failed, bounced, delivered

### Bounce Types
- hard, soft, complaint, transient

---

## Foreign Keys (25 total)

### Cross-Service FKs (21)
| Table | References |
|-------|------------|
| scheduled_notifications | tenants, users, orders |
| notification_history | venues, users |
| consent_records | users, venues |
| notification_preferences | users |
| notification_engagement | notification_history, users |
| notification_clicks | notification_history, users |
| notification_templates | venues |
| notification_campaigns | venues |
| audience_segments | venues |
| email_automation_triggers | venues |
| ab_tests | venues |
| abandoned_carts | users, venues, events, orders |
| venue_notification_settings | venues |
| notification_costs | venues |

### Internal FKs (4)
| Table | References |
|-------|------------|
| notification_preference_history | notification_preferences |
| notification_campaigns | notification_templates |
| ab_test_variants | ab_tests, notification_templates |
| notification_costs | notification_history |

---

## Key Features

### PII Encryption Support
- notification_tracking has encrypted fields:
  - recipient_email_encrypted
  - recipient_phone_encrypted
- Hash fields for lookup without decryption

### GDPR Compliance
- pending_deletions table for deletion queue
- anonymized_at field on notification_tracking

### A/B Testing Infrastructure
- Full A/B test variant tracking
- Metrics collection per variant
- Automatic winner detection

---

## Functions Created

| Function | Purpose |
|----------|---------|
| aggregate_notification_analytics() | Aggregate hourly stats from notification_history |
| update_updated_at_column() | Auto-update updated_at trigger |

---

## Triggers (10)

All updated_at triggers using update_updated_at_column():
- scheduled_notifications, notification_history, consent_records
- notification_preferences, notification_templates, notification_campaigns
- venue_notification_settings, audience_segments
- email_automation_triggers, ab_tests

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| (none) | - | No RLS policies defined |

---

## ⚠️ Known Issues

### 1. No RLS Enabled
Migration creates tables but does NOT enable RLS on any of them.

### 2. Some Tables Missing tenant_id
Many tables only have venue_id without tenant_id.

### 3. No FK to tenants
Unlike other services, notification tables don't reference tenants table directly.
