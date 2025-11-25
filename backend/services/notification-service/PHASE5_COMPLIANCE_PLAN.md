# Phase 5: MAKE IT COMPLIANT - Implementation Plan

**Goal:** Ensure GDPR/CCPA compliance and protect user PII
**Total Effort:** 48 hours (6 days with 1 engineer)
**Status:** 🚧 IN PROGRESS

---

## Overview

Phase 5 transforms the notification service from "secure" to "compliant" by adding:
- PII field encryption
- Automated data retention
- Audit logging for PII access
- GDPR data export functionality
- Right-to-be-forgotten implementation

---

## Task Breakdown

### Task 1: PII Field Encryption (24 hours)

**Files to Create:**
- `src/utils/encryption.util.ts` - PII encryption/decryption utilities
- `src/middleware/encryption.middleware.ts` - Automatic encryption on save
- `src/migrations/002_add_encryption_to_pii.ts` - Migration to add encrypted columns

**Files to Modify:**
- Database queries to use encrypted fields
- Models to handle encryption transparently

**PII Fields to Encrypt:**
- `notification_history.recipient_email`
- `notification_history.recipient_phone`
- `notification_history.recipient_name`
- `suppression_list.identifier`

**Approach:**
- Use AES-256-GCM encryption
- Store encrypted data in new columns (e.g., `recipient_email_encrypted`)
- Keep hashed versions for lookups
- Gradual migration strategy

### Task 2: Data Retention Enforcement (8 hours)

**Files to Create:**
- `src/jobs/data-retention.job.ts` - Cleanup job
- `src/services/data-retention.service.ts` - Retention logic

**Implementation:**
- Daily cron job to delete old records
- Respect DATA_RETENTION_DAYS config (default: 90 days)
- Archive before delete (optional)
- Granular retention by data type

### Task 3: Audit Logging (8 hours)

**Files to Create:**
- `src/services/audit-log.service.ts` - Audit logging service
- `src/middleware/audit.middleware.ts` - Audit middleware
- `src/migrations/003_create_audit_log.ts` - Audit log table

**What to Log:**
- PII field access
- Data exports
- Data deletions
- Preference changes
- Admin actions

### Task 4: GDPR Data Export (4 hours)

**Files to Create:**
- `src/services/gdpr-export.service.ts` - Data export logic
- `src/routes/gdpr.routes.ts` - GDPR endpoints

**Implementation:**
- `GET /api/gdpr/export/:userId` - Export user data
- Returns JSON with all user data
- Includes notification history, preferences, consent records

### Task 5: Right-to-be-Forgotten (4 hours)

**Files to Modify:**
- `src/services/gdpr-export.service.ts` - Add deletion logic
- `src/routes/gdpr.routes.ts` - Add deletion endpoint

**Implementation:**
- `DELETE /api/gdpr/user/:userId` - Delete user data
- Anonymize instead of delete where legally required
- Cascade deletions properly
- Audit trail of deletions

---

## Implementation Order

1. ✅ Set up encryption utilities
2. ✅ Create audit logging system
3. ✅ Implement PII encryption
4. ✅ Add data retention job
5. ✅ Create GDPR export endpoint
6. ✅ Create right-to-be-forgotten endpoint
7. ✅ Test all compliance features

---

## Success Criteria

- [ ] All PII fields encrypted at rest
- [ ] Audit log tracks all PII access
- [ ] Data older than retention period auto-deleted
- [ ] Users can export their data
- [ ] Users can request data deletion
- [ ] GDPR compliance verified
- [ ] Documentation updated

---

## Compliance Checklist

### GDPR Requirements
- [ ] Right to access (data export)
- [ ] Right to erasure (right-to-be-forgotten)
- [ ] Data minimization (retention limits)
- [ ] Security of processing (encryption)
- [ ] Accountability (audit logs)
- [ ] Lawful basis for processing (consent records exist)

### CCPA Requirements  
- [ ] Right to know (data export)
- [ ] Right to delete
- [ ] Data security measures

---

Let's begin implementation!
