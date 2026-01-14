# Compliance Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 13, 2026 |
| **Source Migrations** | 8 files |
| **Consolidated To** | 001_baseline_compliance_service.ts |
| **Total Tables** | 23 (19 tenant-scoped, 4 global) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_baseline_compliance.ts | Initial 15 tables with integer PKs, missing tenant_id |
| 002_add_missing_tables.ts | 7 additional tables (GDPR, PCI, state rules, customer data) |
| 003_add_tenant_isolation.ts | Add tenant_id to 19 tables |
| 004_add_foreign_keys.ts | Internal FKs between compliance tables |
| 005_add_phase5_6_tables.ts | compliance_workflows, jurisdiction columns |
| 006_add_rls_policies.ts | RLS policies (wrong pattern) |
| 20260103_add_partial_indexes_and_safety.ts | Partial indexes (wrong table names - ignored) |
| 20260103_add_rls_policies.ts | RLS + CHECK constraints (wrong table names - ignored) |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Integer PKs (`increments()`) | Changed to UUID PKs (`gen_random_uuid()`) |
| 2 | Missing tenant_id (14 tables in 001) | Added tenant_id to all tenant-scoped tables |
| 3 | Wrong RLS setting (`app.current_tenant`) | Changed to `app.current_tenant_id` |
| 4 | Zero UUID fallback (COALESCE pattern) | Removed, use NULLIF only |
| 5 | Wrong bypass setting (`app.bypass_rls`) | Changed to `app.is_system_user` |
| 6 | postgres user bypass | Removed |
| 7 | No FORCE RLS | Added to all 19 tenant tables |
| 8 | No WITH CHECK clause | Added to all RLS policies |
| 9 | String venue_id/customer_id | Changed to UUID type |
| 10 | RLS on global tables | Removed RLS from 4 global tables |
| 11 | `app_compliance` role | Excluded (infra concern) |
| 12 | `compliance.get_current_tenant_id()` function | Removed (use inline pattern) |
| 13 | `compliance.audit_trigger_func()` function | Removed (use standard pattern) |
| 14 | `compliance_set_tenant_context()` function | Removed (use inline pattern) |
| 15 | Wrong table names in 20260103 files | Ignored (tables didn't exist) |
| 16 | External FKs to venues table | Converted to comments |

---

## Tables Summary

### Global Tables (4) — No RLS

| Table | Purpose | Notes |
|-------|---------|-------|
| `compliance_settings` | Platform-wide configuration | Key-value settings |
| `ofac_sdn_list` | Federal sanctions list | Reference data from Treasury |
| `state_compliance_rules` | State ticket resale regulations | Reference data |
| `webhook_logs` | Provider webhook deduplication | Event tracking |

### Tenant-Scoped Tables (19) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `venue_verifications` | Venue KYB verification status | venue_id, ein, status, risk_score |
| `tax_records` | Per-transaction tax tracking | venue_id, year, amount, jurisdiction |
| `ofac_checks` | OFAC screening results | venue_id, name_checked, is_match |
| `risk_assessments` | Venue risk scoring | venue_id, risk_score, factors |
| `risk_flags` | Active risk issues | venue_id, severity, resolved |
| `compliance_documents` | W9, licenses, etc. | venue_id, document_type, s3_url |
| `bank_verifications` | Bank account verification | venue_id, account_last_four, verified |
| `payout_methods` | Payout configuration | venue_id, provider, status |
| `notification_log` | Compliance notification history | type, recipient, status |
| `compliance_batch_jobs` | Batch processing jobs | job_type, status, progress |
| `form_1099_records` | 1099-K form tracking | venue_id, year, sent_to_irs |
| `compliance_audit_log` | Audit trail for compliance | action, resource, severity |
| `gdpr_deletion_requests` | Right to be forgotten requests | customer_id, status, deletion_log |
| `privacy_export_requests` | Data export requests | user_id, status, download_url |
| `pci_access_logs` | PCI DSS access audit | user_id, action, authorized |
| `customer_profiles` | Customer PII for compliance | customer_id, email, gdpr_deleted |
| `customer_preferences` | Consent and preferences | customer_id, marketing_emails |
| `customer_analytics` | Customer event tracking | customer_id, event_type |
| `compliance_workflows` | Multi-step workflow tracking | venue_id, type, status, steps |

---

## External FK References (Comments Only)

| Table.Column | References | Service |
|--------------|------------|---------|
| `venue_verifications.venue_id` | venues(id) | venue-service |
| `tax_records.ticket_id` | tickets(id) | ticket-service |
| `tax_records.event_id` | events(id) | event-service |
| `compliance_documents.uploaded_by` | users(id) | auth-service |
| `compliance_audit_log.venue_id` | venues(id) | venue-service |
| `compliance_audit_log.user_id` | users(id) | auth-service |
| `gdpr_deletion_requests.customer_id` | users(id) | auth-service |
| `gdpr_deletion_requests.requested_by` | users(id) | auth-service |
| `privacy_export_requests.user_id` | users(id) | auth-service |
| `pci_access_logs.user_id` | users(id) | auth-service |
| `customer_profiles.customer_id` | users(id) | auth-service |
| `compliance_workflows.venue_id` | venues(id) | venue-service |

---

## Internal FK References (Enforced)

| Table.Column | References | On Delete |
|--------------|------------|-----------|
| `tax_records.venue_id` | venue_verifications(venue_id) | CASCADE |
| `ofac_checks.venue_id` | venue_verifications(venue_id) | CASCADE |
| `risk_assessments.venue_id` | venue_verifications(venue_id) | CASCADE |
| `risk_flags.venue_id` | venue_verifications(venue_id) | CASCADE |
| `risk_flags.risk_assessment_id` | risk_assessments(id) | CASCADE |
| `compliance_documents.venue_id` | venue_verifications(venue_id) | CASCADE |
| `bank_verifications.venue_id` | venue_verifications(venue_id) | CASCADE |
| `payout_methods.venue_id` | venue_verifications(venue_id) | CASCADE |
| `form_1099_records.venue_id` | venue_verifications(venue_id) | CASCADE |
| `customer_preferences.customer_id` | customer_profiles(customer_id) | CASCADE |
| `customer_analytics.customer_id` | customer_profiles(customer_id) | CASCADE |

---

## Enums

| Enum | Values |
|------|--------|
| `compliance_severity` | low, medium, high, critical |
| `workflow_type` | venue_verification, tax_year_end, compliance_review, document_renewal |
| `workflow_status` | pending, in_progress, completed, failed, cancelled |

---

## CHECK Constraints

| Constraint | Table | Rule |
|------------|-------|------|
| `chk_ein_format` | venue_verifications | `ein ~ '^[0-9]{2}-[0-9]{7}$'` |
| `chk_status_valid` | venue_verifications | `status IN ('pending', 'verified', 'rejected', 'expired')` |
| `chk_amount_positive` | tax_records | `amount >= 0` |
| `chk_risk_score_range` | risk_assessments | `risk_score >= 0 AND risk_score <= 100` |

---

## RLS Policy Pattern

Applied to all 19 tenant-scoped tables:
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

## Seed Data

### compliance_settings (5 records)
| Key | Value | Description |
|-----|-------|-------------|
| tax_threshold | 600 | IRS 1099-K threshold |
| high_risk_score | 70 | Score above which venues are blocked |
| review_required_score | 50 | Score requiring manual review |
| ofac_update_enabled | true | Auto-update OFAC list daily |
| auto_approve_low_risk | false | Auto-approve venues with score < 20 |

### state_compliance_rules (4 records)
| State | Key Rules |
|-------|-----------|
| TN | 20% max markup |
| TX | Requires license |
| NY | Must disclose total price |
| CA | Register if >$2000/year |

---

## Excluded Items

| Item | Reason |
|------|--------|
| `app_compliance` role | Infra concern |
| `compliance.get_current_tenant_id()` | Use inline pattern |
| `compliance.audit_trigger_func()` | Use standard pattern |
| `compliance_set_tenant_context()` | Use inline pattern |
| 20260103_add_partial_indexes_and_safety.ts | Wrong table names |
| 20260103_add_rls_policies.ts | Wrong table names |

---

## Key Decisions

### Integer PKs → UUID PKs
All 23 tables converted from `increments()` to UUID PKs:
- Consistent with platform standards
- Cross-service compatibility
- No collision issues in distributed systems

### Global vs Tenant Tables
- **Global (4):** Reference data and platform-wide settings
- **Tenant (19):** All venue/customer-specific compliance data

### venue_id as Business Key
- `venue_verifications.venue_id` is UNIQUE and serves as the join target
- Other tables FK to `venue_verifications(venue_id)` not `venue_verifications(id)`
- Maintains referential integrity within compliance domain

---

## Breaking Changes

1. **UUID PKs** — All IDs are now UUIDs, not integers
2. **tenant_id required** — No default value, must be explicitly provided
3. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`
4. **External FKs removed** — Cross-service references no longer enforced at DB level
5. **Global tables have no RLS** — 4 tables accessible without tenant context

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

**Note:** Integer-to-UUID conversion requires data migration if existing data exists.

---

## Files
```
backend/services/compliance-service/src/migrations/
├── 001_baseline_compliance_service.ts  # Consolidated migration
├── CONSOLIDATION_NOTES.md              # This file
├── MIGRATIONS.md                       # Original documentation
└── archived/                           # Original migration files
    ├── 001_baseline_compliance.ts
    ├── 002_add_missing_tables.ts
    ├── 003_add_tenant_isolation.ts
    ├── 004_add_foreign_keys.ts
    ├── 005_add_phase5_6_tables.ts
    ├── 006_add_rls_policies.ts
    ├── 20260103_add_partial_indexes_and_safety.ts
    └── 20260103_add_rls_policies.ts
```
