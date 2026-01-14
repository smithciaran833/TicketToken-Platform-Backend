# Compliance Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 5
> **Tables Created:** 22
> **Tables Modified:** 2

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_compliance.ts | Create 15 core compliance tables |
| 2 | 002_add_missing_tables.ts | Add GDPR, PCI, state rules, customer tables |
| 3 | 003_add_tenant_isolation.ts | Add tenant_id to all tables |
| 4 | 004_add_foreign_keys.ts | Add internal FK constraints |
| 5 | 005_add_phase5_6_tables.ts | Add workflow engine, jurisdiction support |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled | From Migration |
|-------|-------------|---------------|-------------|----------------|
| venue_verifications | serial | ✅ (003) | ❌ | 001 |
| tax_records | serial | ✅ (003) | ❌ | 001 |
| ofac_checks | serial | ✅ (003) | ❌ | 001 |
| risk_assessments | serial | ✅ (003) | ❌ | 001 |
| risk_flags | serial | ✅ (003) | ❌ | 001 |
| compliance_documents | serial | ✅ (003) | ❌ | 001 |
| bank_verifications | serial | ✅ (003) | ❌ | 001 |
| payout_methods | serial | ✅ (003) | ❌ | 001 |
| notification_log | serial | ✅ (003) | ❌ | 001 |
| compliance_settings | serial | ❌ | ❌ | 001 |
| compliance_batch_jobs | serial | ✅ (003) | ❌ | 001 |
| form_1099_records | serial | ✅ (003) | ❌ | 001 |
| webhook_logs | serial | ✅ (003) | ❌ | 001 |
| ofac_sdn_list | serial | ✅ (003) | ❌ | 001 |
| compliance_audit_log | bigserial | ✅ (001) | ❌ | 001 |
| gdpr_deletion_requests | serial | ✅ (003) | ❌ | 002 |
| privacy_export_requests | uuid | ✅ | ✅ | 002 |
| pci_access_logs | serial | ✅ (003) | ❌ | 002 |
| state_compliance_rules | serial | ✅ (003) | ❌ | 002 |
| customer_profiles | serial | ✅ (003) | ❌ | 002 |
| customer_preferences | serial | ✅ (003) | ❌ | 002 |
| customer_analytics | serial | ✅ (003) | ❌ | 002 |
| compliance_workflows | string | ✅ | ❌ | 005 |

---

## Table Details

### venue_verifications
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | serial | NO | PRIMARY KEY |
| venue_id | varchar(255) | NO | UNIQUE |
| ein | varchar(20) | YES | |
| business_name | varchar(255) | YES | |
| business_address | text | YES | |
| status | varchar(50) | YES | 'pending' |
| verification_id | varchar(255) | YES | UNIQUE |
| w9_uploaded | boolean | YES | false |
| bank_verified | boolean | YES | false |
| ofac_cleared | boolean | YES | false |
| risk_score | integer | YES | 0 |
| manual_review_required | boolean | YES | false |
| manual_review_notes | text | YES | |
| created_at | timestamp | YES | now() |
| updated_at | timestamp | YES | now() |
| tenant_id | uuid | NO | (added in 003) |

### tax_records
| Column | Type | Nullable | Default | Added In |
|--------|------|----------|---------|----------|
| id | serial | NO | PRIMARY KEY | 001 |
| venue_id | varchar(255) | NO | | 001 |
| year | integer | NO | | 001 |
| amount | decimal(10,2) | NO | | 001 |
| ticket_id | varchar(255) | YES | | 001 |
| event_id | varchar(255) | YES | | 001 |
| threshold_reached | boolean | YES | false | 001 |
| form_1099_required | boolean | YES | false | 001 |
| form_1099_sent | boolean | YES | false | 001 |
| created_at | timestamp | YES | now() | 001 |
| tenant_id | uuid | NO | | 003 |
| jurisdiction | varchar | YES | 'US' | 005 |
| metadata | jsonb | YES | '{}' | 005 |

### compliance_audit_log
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigserial | NO | PRIMARY KEY |
| tenant_id | varchar | NO | |
| venue_id | varchar | YES | |
| user_id | varchar | YES | |
| action | varchar | NO | |
| resource | varchar | NO | |
| resource_id | varchar | YES | |
| changes | jsonb | YES | '{}' |
| metadata | jsonb | YES | '{}' |
| ip_address | varchar | YES | |
| user_agent | text | YES | |
| severity | enum | YES | 'low' |
| created_at | timestamp | YES | now() |

### compliance_workflows (from 005)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | varchar | NO | PRIMARY KEY |
| venue_id | varchar | NO | |
| tenant_id | varchar | NO | |
| type | enum | NO | venue_verification, tax_year_end, compliance_review, document_renewal |
| status | enum | NO | pending, in_progress, completed, failed, cancelled |
| steps | jsonb | NO | |
| current_step | varchar | YES | |
| metadata | jsonb | YES | '{}' |
| started_at | timestamp | YES | |
| completed_at | timestamp | YES | |
| created_at | timestamp | YES | now() |
| updated_at | timestamp | YES | now() |

### privacy_export_requests (from 002)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | |
| tenant_id | uuid | NO | |
| reason | text | YES | |
| status | varchar(50) | NO | 'pending' |
| requested_at | timestamp | YES | now() |
| completed_at | timestamp | YES | |
| download_url | varchar(500) | YES | |
| expires_at | timestamp | YES | |
| error_message | text | YES | |
| created_at | timestamp | YES | now() |
| updated_at | timestamp | YES | now() |

### state_compliance_rules (from 002)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | serial | NO | PRIMARY KEY |
| state_code | varchar(2) | NO | UNIQUE |
| state_name | varchar(100) | NO | |
| resale_allowed | boolean | YES | true |
| max_markup_percentage | decimal(5,2) | YES | |
| max_markup_amount | decimal(10,2) | YES | |
| license_required | boolean | YES | false |
| license_type | text | YES | |
| restrictions | text | YES | |
| metadata | jsonb | YES | |
| active | boolean | YES | true |
| updated_at | timestamp | YES | now() |
| created_at | timestamp | YES | now() |
| tenant_id | uuid | NO | (added in 003) |

---

## Foreign Keys (Internal Only - from 004)

| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| tax_records | venue_id | venue_verifications.venue_id | CASCADE |
| ofac_checks | venue_id | venue_verifications.venue_id | CASCADE |
| risk_assessments | venue_id | venue_verifications.venue_id | CASCADE |
| risk_flags | risk_assessment_id | risk_assessments.id | CASCADE |
| compliance_documents | venue_id | venue_verifications.venue_id | CASCADE |
| bank_verifications | venue_id | venue_verifications.venue_id | CASCADE |
| payout_methods | venue_id | venue_verifications.venue_id | CASCADE |
| form_1099_records | venue_id | venue_verifications.venue_id | CASCADE |
| customer_preferences | customer_id | customer_profiles.customer_id | CASCADE |
| customer_analytics | customer_id | customer_profiles.customer_id | CASCADE |
| gdpr_deletion_requests | customer_id | customer_profiles.customer_id | CASCADE |

**Note:** Cross-service FKs are intentionally omitted per microservice architecture.

---

## Indexes

### From 001_baseline_compliance
| Table | Index | Columns |
|-------|-------|---------|
| venue_verifications | venue_verifications_venue_id_idx | venue_id |
| venue_verifications | venue_verifications_status_idx | status |
| tax_records | tax_records_venue_id_idx | venue_id |
| tax_records | tax_records_year_idx | year |
| tax_records | tax_records_venue_id_year_idx | (venue_id, year) |
| ofac_checks | ofac_checks_venue_id_idx | venue_id |
| risk_assessments | risk_assessments_venue_id_idx | venue_id |
| risk_flags | risk_flags_venue_id_idx | venue_id |
| compliance_documents | compliance_documents_venue_id_idx | venue_id |
| bank_verifications | bank_verifications_venue_id_idx | venue_id |
| payout_methods | payout_methods_venue_id_idx | venue_id |
| form_1099_records | form_1099_records_venue_id_year_idx | (venue_id, year) |
| webhook_logs | webhook_logs_source_idx | source |
| ofac_sdn_list | ofac_sdn_list_full_name_idx | full_name |
| compliance_audit_log | idx_audit_tenant_created | (tenant_id, created_at) |
| compliance_audit_log | idx_audit_resource | (resource, resource_id) |
| compliance_audit_log | idx_audit_user_created | (user_id, created_at) |
| compliance_audit_log | idx_audit_venue_created | (venue_id, created_at) |
| compliance_audit_log | idx_audit_severity_created | (severity, created_at) |
| compliance_audit_log | idx_audit_action | action |

### From 002_add_missing_tables
| Table | Index | Columns |
|-------|-------|---------|
| gdpr_deletion_requests | gdpr_customer_id_idx | customer_id |
| gdpr_deletion_requests | gdpr_status_idx | status |
| gdpr_deletion_requests | gdpr_requested_at_idx | requested_at |
| privacy_export_requests | privacy_user_id_idx | user_id |
| privacy_export_requests | privacy_tenant_id_idx | tenant_id |
| privacy_export_requests | privacy_status_idx | status |
| privacy_export_requests | privacy_requested_at_idx | requested_at |
| privacy_export_requests | privacy_status_requested_idx | (status, requested_at) |
| pci_access_logs | pci_user_id_idx | user_id |
| pci_access_logs | pci_action_idx | action |
| pci_access_logs | pci_created_at_idx | created_at |
| pci_access_logs | pci_resource_idx | (resource_type, resource_id) |
| state_compliance_rules | state_code_idx | state_code |
| state_compliance_rules | state_active_idx | active |
| customer_profiles | customer_id_idx | customer_id |
| customer_profiles | customer_email_idx | email |
| customer_profiles | customer_gdpr_deleted_idx | gdpr_deleted |
| customer_profiles | customer_last_activity_idx | last_activity_at |
| customer_preferences | prefs_customer_id_idx | customer_id |
| customer_analytics | analytics_customer_id_idx | customer_id |
| customer_analytics | analytics_event_type_idx | event_type |
| customer_analytics | analytics_created_at_idx | created_at |
| customer_analytics | analytics_session_id_idx | session_id |

### From 003_add_tenant_isolation
| Table | Index | Columns |
|-------|-------|---------|
| venue_verifications | idx_venue_verifications_tenant_venue | (tenant_id, venue_id) |
| venue_verifications | idx_venue_verifications_tenant_status | (tenant_id, status) |
| tax_records | idx_tax_records_tenant_venue | (tenant_id, venue_id) |
| tax_records | idx_tax_records_tenant_year | (tenant_id, year) |
| ofac_checks | idx_ofac_checks_tenant_venue | (tenant_id, venue_id) |
| ofac_checks | idx_ofac_checks_tenant_created | (tenant_id, created_at) |
| compliance_documents | idx_compliance_documents_tenant_venue | (tenant_id, venue_id) |
| compliance_documents | idx_compliance_documents_tenant_type | (tenant_id, document_type) |
| customer_profiles | idx_customer_profiles_tenant_customer | (tenant_id, customer_id) |
| customer_profiles | idx_customer_profiles_tenant_email | (tenant_id, email) |
| (all tables) | {table}_tenant_id_idx | tenant_id |

### From 005_add_phase5_6_tables
| Table | Index | Columns |
|-------|-------|---------|
| compliance_workflows | idx_workflows_tenant_venue | (tenant_id, venue_id) |
| compliance_workflows | idx_workflows_tenant_status | (tenant_id, status) |
| compliance_workflows | idx_workflows_type | type |
| compliance_workflows | idx_workflows_created_at | created_at |
| tax_records | idx_tax_records_jurisdiction | (tenant_id, jurisdiction, year) |
| form_1099_records | idx_form_1099_jurisdiction | (tenant_id, jurisdiction, year) |

---

## RLS Policies

### privacy_export_requests (only table with RLS)
```sql
CREATE POLICY tenant_isolation_policy ON privacy_export_requests
USING (tenant_id::text = current_setting('app.current_tenant', true))
```

**⚠️ Warning:** Most compliance tables do NOT have RLS enabled!

---

## Seed Data

### compliance_settings (from 001)
| Key | Value | Description |
|-----|-------|-------------|
| tax_threshold | 600 | IRS 1099-K threshold |
| high_risk_score | 70 | Score above which venues are blocked |
| review_required_score | 50 | Score requiring manual review |
| ofac_update_enabled | true | Auto-update OFAC list daily |
| auto_approve_low_risk | false | Auto-approve venues with score < 20 |

### state_compliance_rules (from 002)
| State | Resale Allowed | Max Markup | License Required |
|-------|----------------|------------|------------------|
| TN | Yes | 20% | No |
| TX | Yes | None | Yes (Texas Occupations Code Chapter 2104) |
| NY | Yes | None | No (must disclose total price) |
| CA | Yes | None | No (register if >$2000/year) |

---

## Cross-Service Dependencies

### Tables That Should Exist (Not Enforced by FK)
| Reference | Expected Service |
|-----------|-----------------|
| venue_id references | venue-service (venues.id) |
| user_id references | auth-service (users.id) |
| ticket_id references | ticket-service (tickets.id) |
| event_id references | event-service (events.id) |

---

## ⚠️ Known Issues

### 1. Most Tables Missing RLS
Only `privacy_export_requests` has RLS enabled. All other tables rely on application-level filtering.

### 2. Inconsistent Primary Key Types
- Most tables use `serial` (integer)
- `compliance_audit_log` uses `bigserial`
- `privacy_export_requests` uses `uuid`
- `compliance_workflows` uses `string`

### 3. venue_id Type Mismatch
- compliance-service uses `varchar(255)` for venue_id
- venue-service likely uses `uuid`
- FK to venue_verifications.venue_id works but cross-service would fail

### 4. compliance_settings Has No tenant_id
- This table is global/shared across tenants
- May cause issues in multi-tenant scenarios

### 5. notification_log Conflicts with notification-service
- Both services may have notification tables
- Potential naming collision

### 6. customer_profiles Duplicates auth-service Users
- Separate customer profile storage
- May drift out of sync with users table

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_tenant | TEXT | RLS policy for privacy_export_requests |

---

## Migration Commands
```bash
# Run migrations
npx knex migrate:latest --knexfile src/knexfile.ts

# Rollback
npx knex migrate:rollback --knexfile src/knexfile.ts

# Status
npx knex migrate:status --knexfile src/knexfile.ts
```

---

## Enums Used

### compliance_audit_log.severity
- low
- medium
- high
- critical

### compliance_workflows.type
- venue_verification
- tax_year_end
- compliance_review
- document_renewal

### compliance_workflows.status
- pending
- in_progress
- completed
- failed
- cancelled
