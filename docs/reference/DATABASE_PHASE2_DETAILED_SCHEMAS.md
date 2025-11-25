# DATABASE PHASE 2 - OPERATIONAL SERVICES DETAILED SCHEMAS

**Generated:** November 19, 2025  
**Services Covered:** 7 operational services  
**Total Tables:** 77 tables

---

## OVERVIEW

Phase 2 covers operational services that support the platform but are not core to transactions:
- notification-service (18 tables)
- file-service (10 tables)
- analytics-service (13 tables)
- monitoring-service (7 tables)
- compliance-service (17 tables)
- integration-service (12 tables)
- scanning-service (estimated 4 tables - needs verification)

---

## 1. NOTIFICATION-SERVICE (18 TABLES)

### Migration Files
- `database/postgresql/migrations/notification-service/001_baseline_notifications.sql`
- `database/postgresql/migrations/notification-service/002_add_templates.sql`
- `backend/services/notification-service/src/migrations/003_create_audit_log.ts`
- `database/postgresql/migrations/notification-service/004_create_templates.sql`

### Tables

#### 1.1 notifications
**Purpose:** Core notification records  
**Key Fields:**
- id (UUID, PK)
- user_id (UUID, FK → users)
- type (email/sms/push/in_app)
- subject, content
- status (pending/sent/failed/read)
- scheduled_for, sent_at
- tenant_id (UUID, multi-tenancy)

**Indexes:**
- user_id, type, status
- tenant_id
- scheduled_for, sent_at

#### 1.2 notification_templates
**Purpose:** Reusable notification templates  
**Key Fields:**
- id (UUID, PK)
- name, description
- type (email/sms/push)
- subject_template, body_template
- variables (JSONB)
- tenant_id

#### 1.3 notification_preferences
**Purpose:** User notification settings  
**Key Fields:**
- id (UUID, PK)
- user_id (UUID, FK)
- channel (email/sms/push)
- enabled (boolean)
- event_types (JSONB array)

#### 1.4 notification_history
**Purpose:** Audit trail  
**Key Fields:**
- id (UUID, PK)
- notification_id (FK)
- status_from, status_to
- changed_at
- error_message

#### 1.5 email_queue
**Purpose:** Email sending queue  
**Key Fields:**
- id (UUID, PK)
- to_address, from_address
- subject, html_body, text_body
- status (queued/sending/sent/failed)
- provider (sendgrid/ses)
- priority

#### 1.6 sms_queue
**Purpose:** SMS sending queue  
**Key Fields:**
- id (UUID, PK)
- to_phone, from_phone
- message
- status, provider (twilio)
- cost_cents

#### 1.7 push_tokens
**Purpose:** Device push notification tokens  
**Key Fields:**
- id (UUID, PK)
- user_id (UUID, FK)
- device_id
- token (encrypted)
- platform (ios/android/web)
- active (boolean)

#### 1.8 notification_batches
**Purpose:** Bulk notification jobs  
**Key Fields:**
- id (UUID, PK)
- name, description
- total_count, sent_count, failed_count
- status, scheduled_for

#### 1.9 notification_events
**Purpose:** Event triggers for notifications  
**Key Fields:**
- id (UUID, PK)
- event_type (order_confirmed, ticket_sold, etc.)
- template_id (FK)
- enabled

#### 1.10 notification_providers
**Purpose:** Provider configuration  
**Key Fields:**
- id (UUID, PK)
- name (sendgrid/twilio/fcm)
- type (email/sms/push)
- config (JSONB, encrypted)
- active, priority

#### 1.11 notification_metrics
**Purpose:** Delivery metrics  
**Key Fields:**
- id (UUID, PK)
- notification_id (FK)
- opened_at, clicked_at
- bounced, complained
- user_agent, ip_address

#### 1.12 notification_attachments
**Purpose:** File attachments  
**Key Fields:**
- id (UUID, PK)
- notification_id (FK)
- file_key (S3)
- filename, mime_type
- size_bytes

#### 1.13 notification_rate_limits
**Purpose:** Rate limiting rules  
**Key Fields:**
- id (UUID, PK)
- user_id or tenant_id
- channel
- max_per_hour, max_per_day
- current_count, reset_at

#### 1.14 notification_suppressions
**Purpose:** Opt-out / suppression list  
**Key Fields:**
- id (UUID, PK)
- email or phone
- reason (bounced/complained/unsubscribed)
- suppressed_at

#### 1.15 notification_webhooks
**Purpose:** Provider webhooks  
**Key Fields:**
- id (UUID, PK)
- provider, event_type
- payload (JSONB)
- processed
- received_at

#### 1.16 scheduled_notifications
**Purpose:** Future scheduled sends  
**Key Fields:**
- id (UUID, PK)
- notification_id (FK)
- scheduled_for
- recurring_rule (JSONB)
- status

#### 1.17 notification_segments
**Purpose:** User segmentation for targeting  
**Key Fields:**
- id (UUID, PK)
- name, description
- filters (JSONB)
- user_count
- tenant_id

#### 1.18 notification_audit_log
**Purpose:** Compliance audit trail  
**Key Fields:**
- id (UUID, PK)
- notification_id
- action (created/sent/failed/read)
- user_id, timestamp
- details (JSONB)

---

## 2. FILE-SERVICE (10 TABLES)

### Migration Files
- `backend/services/file-service/src/migrations/001_baseline_files.ts`
- `backend/services/file-service/src/migrations/002_add_missing_tables.ts`
- `backend/services/file-service/src/migrations/003_add_storage_quotas.ts`

### Tables

#### 2.1 files
**Purpose:** Core file metadata  
**Key Fields:**
- id (UUID, PK)
- filename, original_filename
- mime_type, extension
- storage_provider (local/s3/gcs)
- bucket_name, storage_path
- cdn_url
- size_bytes
- hash_sha256
- uploaded_by (UUID, FK)
- entity_type, entity_id (polymorphic)
- is_public, access_level
- status (uploading/processing/completed/failed)
- metadata (JSONB)
- tags (text[])
- tenant_id, venue_id
- created_at, deleted_at (soft delete)

**Indexes:**
- uploaded_by
- entity_type, entity_id
- status
- hash_sha256
- created_at
- tenant_id, venue_id

#### 2.2 file_access_logs
**Purpose:** Access audit trail  
**Key Fields:**
- id (UUID, PK)
- file_id (FK)
- accessed_by (UUID)
- access_type (view/download/share/stream)
- ip_address, user_agent
- response_code
- bytes_sent
- accessed_at

**Indexes:**
- file_id
- accessed_by
- accessed_at

#### 2.3 file_versions
**Purpose:** Version history  
**Key Fields:**
- id (UUID, PK)
- file_id (FK)
- version_number (INT)
- storage_path
- size_bytes
- hash_sha256
- change_description
- created_by
- created_at

**Indexes:**
- file_id
- file_id, version_number (unique)

#### 2.4 upload_sessions
**Purpose:** Multi-part upload tracking  
**Key Fields:**
- id (UUID, PK)
- session_token (UUID, unique)
- uploaded_by
- filename, mime_type
- total_size, total_chunks
- uploaded_chunks, uploaded_bytes
- status (active/completed/cancelled)
- expires_at, completed_at

**Indexes:**
- session_token
- uploaded_by
- status, expires_at

#### 2.5 av_scans
**Purpose:** Antivirus scan results  
**Key Fields:**
- id (UUID, PK)
- file_hash (varchar(64), unique)
- clean (boolean)
- threats (JSONB array)
- scanned_at
- scan_engine (ClamAV/MockScanner)

**Indexes:**
- file_hash
- scanned_at
- clean

#### 2.6 quarantined_files
**Purpose:** Infected file quarantine  
**Key Fields:**
- id (UUID, PK)
- original_path, quarantine_path
- file_hash
- threats (JSONB)
- quarantined_at
- restored_at (if false positive)
- deleted_at (soft delete)

**Indexes:**
- file_hash
- quarantined_at
- deleted_at

#### 2.7 file_uploads
**Purpose:** Upload tracking  
**Key Fields:**
- id (UUID, PK)
- user_id
- file_key (S3)
- file_name, content_type
- size_bytes
- status (pending/processing/completed/failed)
- processing_error
- expires_at
- created_at, updated_at, deleted_at

**Indexes:**
- user_id
- status
- expires_at
- file_key
- created_at

#### 2.8 storage_quotas
**Purpose:** Storage limits per user/tenant/venue  
**Key Fields:**
- id (UUID, PK)
- user_id, tenant_id, venue_id (nullable, at least one required)
- max_storage_bytes
- max_files
- max_file_size_bytes
- limits_by_type (JSONB)
- soft_limit_percentage (default 80)
- send_warnings (boolean)
- is_active
- notes

**Indexes:**
- user_id, tenant_id, venue_id (unique)

**Constraints:**
- At least one of user_id, tenant_id, venue_id must be set
- max_storage_bytes > 0

#### 2.9 storage_usage
**Purpose:** Current storage usage tracking  
**Key Fields:**
- id (UUID, PK)
- user_id, tenant_id, venue_id
- total_storage_bytes, total_files
- usage_by_type (JSONB)
- peak_storage_bytes, peak_storage_at
- last_calculated_at

**Indexes:**
- user_id, tenant_id, venue_id (unique)

#### 2.10 quota_alerts
**Purpose:** Quota threshold alerts  
**Key Fields:**
- id (UUID, PK)
- quota_id (FK)
- user_id, tenant_id, venue_id
- alert_type (warning/exceeded/critical)
- usage_percentage
- current_usage_bytes, quota_limit_bytes
- notification_sent, notification_sent_at
- created_at

**Indexes:**
- quota_id, created_at
- alert_type, notification_sent

---

## 3. ANALYTICS-SERVICE (13 TABLES)

### Migration Files
- `backend/services/analytics-service/src/migrations/001_analytics_baseline.ts`
- `backend/services/analytics-service/src/migrations/002_create_external_analytics_tables.ts`

### Tables

#### 3.1 analytics_metrics
**Purpose:** Raw metrics data  
**Key Fields:**
- id (UUID, PK)
- tenant_id (UUID, indexed)
- metric_type
- entity_type, entity_id
- dimensions (JSONB)
- value (decimal 15,2)
- unit
- metadata (JSONB)
- timestamp
- created_at, updated_at

**Indexes:**
- tenant_id, metric_type
- tenant_id, entity_type, entity_id
- tenant_id, timestamp
- timestamp

**RLS:** tenant_isolation_policy

#### 3.2 analytics_aggregations
**Purpose:** Pre-aggregated metrics  
**Key Fields:**
- id (UUID, PK)
- tenant_id
- aggregation_type
- metric_type  
- entity_type, entity_id
- dimensions (JSONB)
- time_period (hourly/daily/weekly/monthly)
- period_start, period_end
- value (decimal 15,2)
- unit
- sample_count
- metadata (JSONB)

**Indexes:**
- tenant_id, aggregation_type
- tenant_id, metric_type
- tenant_id, entity_type, entity_id
- tenant_id, time_period, period_start
- period_start

**Unique:** tenant_id, aggregation_type, metric_type, entity_type, entity_id, time_period, period_start

#### 3.3 analytics_alerts
**Purpose:** Alert rules and triggers  
**Key Fields:**
- id (UUID, PK)
- tenant_id
- alert_type
- severity (low/medium/high/critical)
- metric_type
- entity_type, entity_id
- threshold_config (JSONB)
- current_value, threshold_value (decimal)
- status (active/resolved)
- message
- metadata (JSONB)
- triggered_at, resolved_at
- resolved_by

**Indexes:**
- tenant_id, status
- tenant_id, alert_type
- tenant_id, severity
- tenant_id, entity_type, entity_id
- triggered_at

#### 3.4 analytics_dashboards
**Purpose:** Custom dashboard configs  
**Key Fields:**
- id (UUID, PK)
- tenant_id
- name, description
- type
- layout, filters (JSONB)
- visibility (private/team/public)
- created_by
- is_default
- display_order

**Indexes:**
- tenant_id, type
- tenant_id, created_by
- tenant_id, is_default

#### 3.5 analytics_widgets
**Purpose:** Dashboard widgets  
**Key Fields:**
- id (UUID, PK)
- tenant_id
- dashboard_id (FK → analytics_dashboards)
- widget_type
- title, description
- configuration (JSONB)
- data_source (JSONB)
- position, size (JSONB)
- style (JSONB)
- refresh_interval (default 60)

**Indexes:**
- tenant_id, dashboard_id
- tenant_id, widget_type

#### 3.6 analytics_exports
**Purpose:** Data export jobs  
**Key Fields:**
- id (UUID, PK)
- tenant_id
- export_type
- format (csv/xlsx/json)
- status (pending/processing/completed/failed)
- parameters (JSONB)
- file_path, file_url
- file_size
- expires_at
- requested_by
- error_message

**Indexes:**
- tenant_id, status
- tenant_id, requested_by
- tenant_id, export_type
- expires_at

#### 3.7 customer_rfm_scores
**Purpose:** RFM (Recency, Frequency, Monetary) analysis  
**Key Fields:**
- id (UUID, PK)
- customer_id, venue_id, tenant_id
- recency_score (1-5)
- frequency_score (1-5)
- monetary_score (1-5)
- total_score
- days_since_last_purchase
- total_purchases, total_spent
- average_order_value
- segment (Champions/Loyal/At Risk/etc)
- churn_risk
- calculated_at

**Indexes:**
- customer_id, venue_id (unique)
- tenant_id, venue_id
- segment
- total_score
- calculated_at
- venue_id, segment
- venue_id, churn_risk

#### 3.8 customer_segments
**Purpose:** Segment aggregate statistics  
**Key Fields:**
- id (UUID, PK)
- venue_id, tenant_id
- segment_name
- customer_count
- total_revenue
- avg_order_value
- avg_lifetime_value
- avg_purchase_frequency
- last_calculated_at

**Indexes:**
- venue_id, segment_name (unique)
- tenant_id
- last_calculated_at

#### 3.9 customer_lifetime_value
**Purpose:** CLV calculations  
**Key Fields:**
- id (UUID, PK)
- customer_id (unique)
- venue_id, tenant_id
- clv (decimal 12,2)
- avg_order_value
- purchase_frequency
- customer_lifespan_days
- total_purchases, total_revenue
- predicted_clv_12_months
- predicted_clv_24_months
- churn_probability
- calculated_at

**Indexes:**
- tenant_id, venue_id
- clv
- calculated_at
- venue_id, clv

#### 3.10 price_history
**Purpose:** Dynamic pricing history  
**Key Fields:**
- id (UUID, PK)
- event_id
- price_cents
- reason
- changed_at
- changed_by

**Indexes:**
- event_id, changed_at

#### 3.11 pending_price_changes
**Purpose:** Pending price adjustments  
**Key Fields:**
- id (UUID, PK)
- event_id (unique)
- current_price, recommended_price
- confidence (decimal 3,2)
- reasoning (JSONB)
- demand_score
- created_at, updated_at
- approved_at, approved_by, approval_reason
- rejected_at, rejected_by, rejection_reason

**Indexes:**
- event_id
- approved_at

#### 3.12 venue_analytics
**Purpose:** Venue-level aggregations  
**Key Fields:**
- id (UUID, PK)
- venue_id
- date
- revenue (decimal 12,2)
- ticket_sales
- created_at, updated_at

**Indexes:**
- venue_id, date (unique)
- date

**RLS:** venue-based isolation

#### 3.13 event_analytics
**Purpose:** Event-level aggregations  
**Key Fields:**
- id (UUID, PK)
- event_id
- date
- revenue (decimal 12,2)
- tickets_sold
- capacity
- created_at, updated_at

**Indexes:**
- event_id, date (unique)
- date

**RLS:** event-based isolation

---

## 4. MONITORING-SERVICE (7 TABLES)

### Migration Files
- `backend/services/monitoring-service/src/migrations/001_baseline_monitoring_schema.ts`
- `database/postgresql/migrations/monitoring-service/003_create_advanced_features.sql`

### Tables

#### 4.1 alerts
**Purpose:** Active alerts  
**Key Fields:**
- id (UUID, PK)
- rule_id (FK → alert_rules)
- severity
- message
- status (active/acknowledged/resolved)
- triggered_at
- resolved_at

#### 4.2 alert_rules
**Purpose:** Alert rule definitions  
**Key Fields:**
- id (UUID, PK)
- name, description
- metric_type
- condition (JSONB)
- threshold
- severity
- enabled

#### 4.3 dashboards
**Purpose:** Monitoring dashboards  
**Key Fields:**
- id (UUID, PK)
- name, description
- layout (JSONB)
- is_public
- created_by

#### 4.4 metrics
**Purpose:** Time-series metrics  
**Key Fields:**
- id (UUID, PK)
- metric_name
- value
- tags (JSONB)
- timestamp

**Indexes:**
- metric_name, timestamp
- tags

#### 4.5 nft_mints
**Purpose:** NFT minting tracking  
**Key Fields:**
- id (UUID, PK)
- ticket_id
- mint_address (Solana)
- transaction_signature
- status
- minted_at

#### 4.6 nft_transfers
**Purpose:** NFT transfer tracking  
**Key Fields:**
- id (UUID, PK)
- mint_address
- from_address, to_address
- transaction_signature
- transferred_at

#### 4.7 fraud_events
**Purpose:** Fraud detection events  
**Key Fields:**
- id (UUID, PK)
- event_type
- risk_score
- details (JSONB)
- detected_at
- resolved

---

## 5. COMPLIANCE-SERVICE (17 TABLES)

### Migration Files
- `backend/services/compliance-service/src/migrations/001_baseline_compliance.ts`
- `backend/services/compliance-service/src/migrations/002_add_missing_tables.ts`
- `backend/services/compliance-service/src/migrations/003_add_tenant_isolation.ts`
- `backend/services/compliance-service/src/migrations/004_add_foreign_keys.ts`
- `backend/services/compliance-service/src/migrations/005_add_phase5_6_tables.ts`

### Tables

#### 5.1 venue_verifications
**Purpose:** Venue KYC/KYB verification  
**Key Fields:**
- id (INT, PK)
- venue_id
- verification_type (kyc/kyb)
- status
- submitted_at, verified_at

#### 5.2 tax_records
**Purpose:** Tax compliance records  
**Key Fields:**
- id (INT, PK)
- venue_id, user_id
- tax_year
- form_type (1099-K)
- gross_amount
- status

#### 5.3 ofac_checks
**Purpose:** OFAC sanctions screening  
**Key Fields:**
- id (INT, PK)
- entity_id, entity_type
- check_type
- match_found
- checked_at

#### 5.4 risk_assessments
**Purpose:** Risk scoring  
**Key Fields:**
- id (INT, PK)
- entity_id, entity_type
- risk_score
- risk_level
- assessed_at

#### 5.5 risk_flags
**Purpose:** Risk indicators  
**Key Fields:**
- id (INT, PK)
- entity_id, entity_type
- flag_type
- severity
- flagged_at
- resolved_at

#### 5.6 compliance_documents
**Purpose:** Compliance document storage  
**Key Fields:**
- id (INT, PK)
- entity_id, entity_type
- document_type
- file_key (S3)
- status
- uploaded_at

#### 5.7 bank_verifications
**Purpose:** Bank account verification  
**Key Fields:**
- id (INT, PK)
- venue_id
- account_number (encrypted)
- routing_number
- status
- verified_at

#### 5.8 payout_methods
**Purpose:** Payout configuration  
**Key Fields:**
- id (INT, PK)
- venue_id
- method_type
- details (encrypted JSONB)
- is_default

#### 5.9 notification_log
**Purpose:** Compliance notifications  
**Key Fields:**
- id (INT, PK)
- recipient_id
- notification_type
- sent_at

#### 5.10 compliance_settings
**Purpose:** Compliance configuration  
**Key Fields:**
- id (INT, PK)
- tenant_id
- setting_key
- setting_value (JSONB)

#### 5.11 compliance_batch_jobs
**Purpose:** Batch processing jobs  
**Key Fields:**
- id (INT, PK)
- job_type
- status
- started_at, completed_at
- results (JSONB)

#### 5.12 form_1099_records
**Purpose:** IRS 1099 forms  
**Key Fields:**
- id (INT, PK)
- venue_id
- tax_year
- gross_amount
- filed_at

#### 5.13 webhook_logs
**Purpose:** External webhook tracking  
**Key Fields:**
- id (INT, PK)
- provider
- event_type
- payload (JSONB)
- processed
- received_at

#### 5.14 ofac_sdn_list
**Purpose:** OFAC SDN list cache  
**Key Fields:**
- id (INT, PK)
- name
- type
- updated_at

#### 5.15 compliance_audit_log
**Purpose:** Compliance audit trail (appears in 2 migrations - consolidated)  
**Key Fields:**
- id (INT/BIGINT, PK)
- action
- entity_id, entity_type
- user_id
- details (JSONB)
- timestamp

#### 5.16 gdpr_deletion_requests
**Purpose:** GDPR right-to-be-forgotten  
**Key Fields:**
- id (INT, PK)
- user_id
- request_date
- status
- completed_at

#### 5.17 pci_access_logs
**Purpose:** PCI compliance audit  
**Key Fields:**
- id (INT, PK)
- user_id
- action
- card_last_4
- accessed_at
- ip_address

---

## 6. INTEGRATION-SERVICE (12 TABLES)

### Migration Files
- `backend/services/integration-service/src/migrations/001_baseline_integration.ts`
- `backend/services/integration-service/src/migrations/002_add_missing_tables.ts`

### Tables

#### 6.1 integrations
**Purpose:** Integration catalog  
**Key Fields:**
- id (UUID, PK)
- name (Stripe, Square, Mailchimp, etc.)
- type (payment/crm/email/accounting)
- description
- logo_url
- documentation_url
- active
- config_schema (JSONB)

#### 6.2 connections
**Purpose:** User/venue connections  
**Key Fields:**
- id (UUID, PK)
- integration_id (FK)
- user_id or venue_id
- tenant_id
- status (active/inactive/error)
- credentials (encrypted JSONB)
- last_synced_at
- error_message

#### 6.3 field_mappings
**Purpose:** Data transformation rules  
**Key Fields:**
- id (UUID, PK)
- connection_id (FK)
- source_field
- target_field
- transformation_rule (JSONB)
- enabled

#### 6.4 webhooks
**Purpose:** Webhook event queue  
**Key Fields:**
- id (UUID, PK)
- connection_id (FK)
- event_type
- payload (JSONB)
- status (pending/processing/completed/failed)
- attempts
- last_attempt_at
- error_message

#### 6.5 integration_configs
**Purpose:** Venue-specific configs  
**Key Fields:**
- id (UUID, PK)
- venue_id
- integration_id
- config (JSONB)
- enabled

#### 6.6 integration_health
**Purpose:** Health monitoring  
**Key Fields:**
- id (UUID, PK)
- connection_id (FK)
- health_status (healthy/degraded/down)
- success_rate
- avg_response_time
- last_check_at

#### 6.7 integration_webhooks
**Purpose:** Webhook event storage  
**Key Fields:**
- id (UUID, PK)
- integration_id
- event_type
- payload (JSONB)
- signature
- received_at
- processed

#### 6.8 sync_queue
**Purpose:** Sync operation queue  
**Key Fields:**
- id (UUID, PK)
- connection_id (FK)
- sync_type (full/incremental)
- status
- priority
- scheduled_for
- started_at, completed_at

#### 6.9 sync_logs
**Purpose:** Sync history  
**Key Fields:**
- id (UUID, PK)
- connection_id (FK)
- sync_type
- records_synced
- records_failed
- duration_ms
- status
- error_message
- synced_at

#### 6.10 integration_costs
**Purpose:** API usage tracking  
**Key Fields:**
- id (UUID, PK)
- connection_id (FK)
- api_calls
- cost_usd
- period_start, period_end

#### 6.11 oauth_tokens
**Purpose:** OAuth token storage  
**Key Fields:**
- id (UUID, PK)
- connection_id (FK)
- provider
- access_token (encrypted)
- refresh_token (encrypted)
- expires_at
- scope

#### 6.12 venue_api_keys
**Purpose:** API key storage (non-OAuth)  
**Key Fields:**
- id (UUID, PK)
- venue_id
- integration_id
- api_key (encrypted)
- api_secret (encrypted)
- environment (production/sandbox)
- active

---

## 7. SCANNING-SERVICE (ESTIMATED 4 TABLES)

**Note:** Migration files not fully analyzed yet. Based on audit document estimate.

Expected tables:
- scans (QR code scan events)
- scan_logs (audit trail)
- device_registrations
- offline_cache (for offline scanning)

**Status:** Needs detailed schema extraction

---

## SUMMARY

| Service | Tables | Migration Complexity | Status |
|---------|--------|---------------------|--------|
| notification-service | 18 | HIGH | ✅ Complete |
| file-service | 10 | MEDIUM | ✅ Complete |
| analytics-service | 13 | HIGH | ✅ Complete |
| monitoring-service | 7 | MEDIUM | ✅ Complete |
| compliance-service | 17 | HIGH | ✅ Complete |
| integration-service | 12 | MEDIUM | ✅ Complete |
| scanning-service | ~4 | LOW | ⚠️ Needs verification |
| **TOTAL** | **77+** | - | - |

---

## KEY OBSERVATIONS

### Multi-Tenancy
All Phase 2 services implement tenant isolation via:
- `tenant_id` column in most tables
- Row-Level Security (RLS) policies
- Tenant context: `current_setting('app.current_tenant')::uuid`

### Common Patterns

**Audit Trails:**
- Most services have audit/history tables
- Timestamp tracking (created_at, updated_at)
- User attribution (created_by, updated_by)

**Soft Deletes:**
- Many tables use `deleted_at` instead of hard deletes
- Preserves data for compliance/audit

**Status Tracking:**
- Common status field pattern
- Typical statuses: pending/processing/completed/failed

**JSONB Usage:**
- Flexible metadata storage
- Configuration data
- Dynamic fields

### Security Features

**Encryption:**
- Sensitive data encrypted (credentials, tokens, API keys)
- PII masking available
- Hash-based duplicate detection

**Access Control:**
- Row-Level Security policies
- Tenant isolation
- Access logging

---

## NEXT STEPS

1. **Verify scanning-service:** Extract detailed schema
2. **Cross-reference:** Ensure all migrations accounted for
3. **Update audit document:** Correct table count (was underestimated for notification/file services)
4. **Foreign key validation:** Ensure all FK relationships documented
5. **Index optimization:** Review query patterns for missing indexes

---

**Document Version:** 1.0  
**Last Updated:** November 19
