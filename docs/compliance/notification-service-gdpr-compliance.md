# Notification Service - GDPR/CCPA Compliance Guide

**Last Updated:** November 2025  
**Service:** Notification Service  
**Version:** 1.0.0

---

## Overview

This document outlines how the Notification Service complies with GDPR (General Data Protection Regulation) and CCPA (California Consumer Privacy Act) requirements.

---

## Table of Contents

1. [Data Protection Principles](#data-protection-principles)
2. [PII Encryption](#pii-encryption)
3. [Data Retention](#data-retention)
4. [Audit Logging](#audit-logging)
5. [User Rights](#user-rights)
6. [API Endpoints](#api-endpoints)
7. [Operations Guide](#operations-guide)

---

## Data Protection Principles

### Lawful Basis for Processing

The notification service processes personal data under the following lawful bases:

1. **Consent (GDPR Article 6(1)(a))** - Marketing communications
2. **Contract (GDPR Article 6(1)(b))** - Transactional notifications
3. **Legitimate Interest (GDPR Article 6(1)(f))** - Service updates

### Data Minimization

We only collect and retain the minimum data necessary:
- Email address (for email notifications)
- Phone number (for SMS notifications)
- Notification preferences
- Delivery status

### Purpose Limitation

Data is used only for:
- Sending notifications
- Tracking delivery
- Analytics (aggregated)
- Compliance with legal obligations

---

## PII Encryption

### Encryption at Rest

All PII fields are encrypted using AES-256-GCM:

**Encrypted Fields:**
- `recipient_email_encrypted`
- `recipient_phone_encrypted`
- `recipient_name` (when provided)

**Encryption Details:**
- Algorithm: AES-256-GCM
- Key Derivation: PBKDF2 (100,000 iterations)
- Random salt per record
- Authentication tag for integrity

### Configuration

```bash
# Required environment variable
ENCRYPTION_MASTER_KEY=<32+ character secure key>

# Enable/disable encryption
ENABLE_PII_ENCRYPTION=true
```

### Key Management

**Production:**
- Store master key in secure vault (AWS Secrets Manager, HashiCorp Vault)
- Rotate keys annually
- Use separate keys per environment

**Key Rotation Process:**
1. Generate new master key
2. Decrypt data with old key
3. Re-encrypt with new key
4. Update environment variable
5. Archive old key (for recovery)

### Hashing for Lookup

Email/phone are also hashed (SHA-256) for efficient lookups without decryption:
- `recipient_email_hash`
- `recipient_phone_hash`

---

## Data Retention

### Retention Periods

| Data Type | Retention Period | Reason |
|-----------|------------------|--------|
| Notification History | 90 days (configurable) | Service quality, support |
| Audit Logs (general) | 365 days | Compliance |
| Audit Logs (critical) | 7 years | Legal requirements |
| Consent Records | 7 years | GDPR requirement |

### Configuration

```bash
# Standard data retention
DATA_RETENTION_DAYS=90

# Audit log retention
AUDIT_RETENTION_DAYS=365
```

### Automated Cleanup

A cron job runs daily at 2 AM to delete old data:

```typescript
// Runs automatically in production
dataRetentionJob.start();
```

**What Gets Deleted:**
- Notifications older than retention period
- Notification history records
- Processed webhook events
- Non-critical audit logs

**What's Preserved:**
- Critical audit events (deletions, exports)
- Active consent records
- Legal hold data

### Manual Cleanup

Admins can trigger cleanup manually:

```bash
POST /api/gdpr/admin/cleanup
Authorization: Bearer <admin_token>
```

---

## Audit Logging

### What We Log

All PII access and sensitive operations:

| Action | Logged Fields | Retention |
|--------|---------------|-----------|
| PII Access | Actor, field, resource | 365 days |
| Data Export | Requester, format | 7 years |
| Data Deletion | Requester, method, reason | 7 years |
| Consent Change | User, channel, granted | 7 years |
| Preference Update | User, changes | 365 days |
| Admin Actions | Admin, action, target | 7 years |

### Audit Log Schema

```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(20),  -- user | system | admin
    subject_id VARCHAR(255),
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    severity VARCHAR(20),    -- info | warning | critical
    created_at TIMESTAMP
);
```

### Querying Audit Logs

```typescript
// Get user's audit trail
await auditLogService.getUserAuditTrail(userId);

// Get critical events
await auditLogService.getCriticalEvents({
  startDate: new Date('2025-01-01'),
  endDate: new Date()
});

// Get PII access logs
await auditLogService.getPIIAccessLogs(userId, 30);
```

---

## User Rights

### Right of Access (GDPR Article 15)

Users can request a copy of their data.

**Endpoint:** `GET /api/gdpr/export/:userId`

**Response includes:**
- All notifications sent
- Delivery status
- Consent records
- Preferences
- Audit trail

**Example:**
```bash
curl -X GET \
  https://api.tickettoken.com/api/gdpr/export/user123 \
  -H 'Authorization: Bearer <token>'
```

### Right to Data Portability (GDPR Article 20)

Machine-readable export in standard format.

**Endpoint:** `GET /api/gdpr/portability/:userId`

**Format:** JSON with standardized structure

### Right to Erasure (GDPR Article 17)

Users can request deletion of their data.

**Endpoint:** `DELETE /api/gdpr/user/:userId`

**Methods:**
1. **Anonymization** (default) - Replace PII with "ANONYMIZED"
2. **Hard Delete** - Permanent deletion (admin only)

**Example:**
```bash
curl -X DELETE \
  https://api.tickettoken.com/api/gdpr/user/user123 \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "method": "anonymize",
    "reason": "user_request",
    "confirm": true
  }'
```

**Validation:**
- Checks for pending notifications
- Verifies no legal holds
- Requires explicit confirmation

### Right to Rectification (GDPR Article 16)

Users can update their preferences:

**Endpoint:** `PUT /api/preferences`

### Right to Restrict Processing (GDPR Article 18)

Users can opt-out via consent management:

**Endpoint:** `POST /api/consent/revoke`

---

## API Endpoints

### GDPR Compliance Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/gdpr/export/:userId` | GET | Export user data | User/Admin |
| `/api/gdpr/portability/:userId` | GET | Data portability | User/Admin |
| `/api/gdpr/processing-activities/:userId` | GET | Show processing info | Any |
| `/api/gdpr/validate-deletion/:userId` | GET | Check if deletion allowed | User/Admin |
| `/api/gdpr/user/:userId` | DELETE | Delete user data | User/Admin |
| `/api/gdpr/data-size/:userId` | GET | Get data volume | User/Admin |
| `/api/gdpr/admin/retention-stats` | GET | Retention statistics | Admin |
| `/api/gdpr/admin/cleanup` | POST | Manual cleanup | Admin |

### Request Examples

**Export Data:**
```bash
GET /api/gdpr/export/user123
Authorization: Bearer eyJhbGc...
```

**Delete Data:**
```bash
DELETE /api/gdpr/user/user123
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "method": "anonymize",
  "reason": "user_request",
  "confirm": true
}
```

**Check Data Size:**
```bash
GET /api/gdpr/data-size/user123
Authorization: Bearer eyJhbGc...
```

---

## Operations Guide

### Setup Checklist

- [ ] Generate secure encryption master key (32+ characters)
- [ ] Store key in secure vault
- [ ] Set `ENCRYPTION_MASTER_KEY` environment variable
- [ ] Set `DATA_RETENTION_DAYS` (default: 90)
- [ ] Set `AUDIT_RETENTION_DAYS` (default: 365)
- [ ] Run audit log migration
- [ ] Verify cron job starts in production
- [ ] Test data export
- [ ] Test data deletion
- [ ] Document key rotation procedure

### Generating Encryption Key

```bash
# Generate a secure 32-character key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Running Migrations

```bash
# Run audit log migration
psql -U postgres -d notification_db -f database/postgresql/migrations/notification-service/003_create_audit_log.sql
```

### Monitoring Compliance

**Key Metrics:**
- PII access frequency
- Data export requests
- Deletion requests
- Audit log growth
- Retention cleanup results

**Alerts:**
- Failed encryption operations
- Audit log write failures
- Retention cleanup failures
- Unusual PII access patterns

### Incident Response

**Data Breach:**
1. Identify affected users
2. Export audit logs
3. Notify affected users (72 hours)
4. Report to DPA (if required)
5. Review and improve security

**Unauthorized Access:**
1. Review audit logs
2. Identify accessed PII
3. Revoke compromised credentials
4. Notify affected users
5. Update access controls

### Regular Tasks

**Daily:**
- Automated data retention cleanup (2 AM)

**Weekly:**
- Review critical audit events
- Check retention statistics

**Monthly:**
- Review consent records
- Analyze data export requests
- Update compliance documentation

**Annually:**
- Rotate encryption keys
- Review and update retention periods
- Conduct compliance audit
- Update privacy policies

### Testing Compliance

**Test Data Export:**
```bash
# As user
curl -X GET http://localhost:3007/api/gdpr/export/testuser \
  -H "Authorization: Bearer $TOKEN"
```

**Test Data Deletion:**
```bash
# Validate first
curl -X GET http://localhost:3007/api/gdpr/validate-deletion/testuser \
  -H "Authorization: Bearer $TOKEN"

# Then delete
curl -X DELETE http://localhost:3007/api/gdpr/user/testuser \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"anonymize","confirm":true}'
```

**Test Retention Cleanup:**
```bash
# Manual trigger (admin only)
curl -X POST http://localhost:3007/api/gdpr/admin/cleanup \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Compliance Checklist

### GDPR Requirements

- [x] **Article 5** - Principles (lawfulness, fairness, transparency)
- [x] **Article 6** - Lawful basis for processing
- [x] **Article 15** - Right of access
- [x] **Article 16** - Right to rectification
- [x] **Article 17** - Right to erasure
- [x] **Article 18** - Right to restriction
- [x] **Article 20** - Right to data portability
- [x] **Article 25** - Data protection by design
- [x] **Article 30** - Records of processing activities
- [x] **Article 32** - Security of processing
- [x] **Article 33** - Breach notification (72 hours)

### CCPA Requirements

- [x] **Right to know** - Data export available
- [x] **Right to delete** - Deletion endpoint provided
- [x] **Right to opt-out** - Consent management
- [x] **Non-discrimination** - Service works without consent
- [x] **Security** - Encryption and access controls

---

## Support

For compliance questions:
- **Email:** compliance@tickettoken.com
- **DPO:** dpo@tickettoken.com
- **Documentation:** https://docs.tickettoken.com/compliance

For technical support:
- **Slack:** #platform-team
- **On-call:** PagerDuty rotation

---

**Document Maintained By:** Platform Team & Legal  
**Review Schedule:** Quarterly  
**Last Reviewed:** November 2025
