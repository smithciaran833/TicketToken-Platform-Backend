# Order Service - 25 Compliance & Legal Audit

**Service:** order-service
**Document:** 25-compliance-legal.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 21% (14/66 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 3 | No data deletion, No data export, Archiving disabled |
| HIGH | 3 | No consent tracking, No third-party notification, No pseudonymization |
| MEDIUM | 3 | No ROPA, No DPIA, No sub-processor docs |
| LOW | 0 | None |

---

## 3.2 Data Retention (3/12)

| Check | Status | Evidence |
|-------|--------|----------|
| Documented retention periods | PASS | retentionDays: 90 |
| Legal basis documented | PARTIAL | Configurable, no legal basis |
| Regular review schedule | FAIL | None |
| Clear ownership | FAIL | None |
| Legal holds | FAIL | None |
| Deletion procedures | PARTIAL | Archiving only |
| Automated deletion | PARTIAL | deleteAfterDays defaults to 0 |
| Retention enforced | PARTIAL | Main tables only |
| Data inventory | PASS | 6 tables mapped |
| Anonymization | FAIL | None |
| Deletion audit trail | PASS | archive_audit_log |
| Deletion testing | FAIL | No schedule |

**Issue:** Archiving disabled by default, deleteAfterDays=0 (indefinite)

---

## 3.3 User Rights (1/20)

| Check | Status | Evidence |
|-------|--------|----------|
| DSAR process | FAIL | No endpoint |
| Identity verification | FAIL | None |
| 30-day response | FAIL | No workflow |
| Refusal handling | FAIL | None |
| Data export | FAIL | No export endpoint |
| Processing metadata | FAIL | None |
| Machine-readable format | FAIL | None |
| User data updates | PARTIAL | Orders immutable |
| Corrections propagated | FAIL | None |
| Correction documentation | PARTIAL | order_events |
| Complete deletion | FAIL | No user-initiated deletion |
| All locations mapped | PARTIAL | Cache/Redis not covered |
| Third-party notification | FAIL | None |
| Backup handling | FAIL | None |
| Deletion confirmation | FAIL | None |
| Deletion audit | PASS | archive_audit_log |
| Data portability | FAIL | None |
| Direct transfer | FAIL | None |
| Opt-out from profiling | FAIL | None |
| Restrict processing | FAIL | None |

---

## 3.4-3.6 Consent/DPA/Transfers (0/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Consent records | FAIL | None |
| Withdrawal mechanism | FAIL | None |
| DPA with processors | UNKNOWN | No docs |
| Sub-processor list | FAIL | None |
| Breach notification | PARTIAL | No automation |
| Transfer documentation | FAIL | None |
| Transfer mechanisms | FAIL | None |
| Transfer Impact Assessments | FAIL | None |

---

## 3.7 Security (10/18)

| Check | Status | Evidence |
|-------|--------|----------|
| Encryption at rest | PARTIAL | DB-level only |
| Encryption in transit | PASS | HTTPS |
| Pseudonymization | FAIL | None |
| Data minimization | PASS | Only necessary data |
| Role-based access | PASS | Admin check exists |
| Least privilege | PASS | Own orders only |
| MFA | UNKNOWN | auth-service |
| Access reviews | FAIL | None |
| Access logging | PASS | auditService.logAction() |
| Modifications tracked | PASS | previousValue/newValue |
| Who/what/when/why | PASS | Comprehensive fields |
| Log integrity | PARTIAL | Shared service |
| Centralized logs | PASS | @tickettoken/shared |
| Real-time monitoring | PARTIAL | is_suspicious flag |
| Log retention | PASS | 7 years config |
| Breach detection | PARTIAL | Flag exists |
| Incident response | FAIL | No docs |
| 72-hour notification | FAIL | No automation |

**Strong Audit Logging:**
```typescript
await auditService.logAction({
  action: 'create_order',
  userId,
  resourceType: 'order',
  resourceId: order.id,
  newValue: { orderNumber, totalCents },
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'],
});
```

---

## 3.8-3.9 Privacy/Documentation (0/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Privacy in new features | FAIL | No DPIA |
| DPIA process | FAIL | None |
| Protective defaults | FAIL | Archiving disabled |
| Third-party vetting | FAIL | None |
| DPA template | FAIL | None |
| ROPA | FAIL | None |
| Retention policy | PARTIAL | Config only |
| DSAR procedures | FAIL | None |
| Breach procedures | FAIL | None |
| Consent records | FAIL | None |

---

## Critical Remediations

### P0: Implement Data Deletion (Article 17)
```typescript
// order.controller.ts
router.delete('/users/:userId/data', async (req, reply) => {
  await orderService.deleteUserData(userId);
  await ticketService.notifyUserDeletion(userId);
  await paymentService.notifyUserDeletion(userId);
  return { success: true };
});
```

### P0: Implement Data Export (Articles 15 & 20)
```typescript
router.get('/users/:userId/export', async (req, reply) => {
  const data = await orderService.exportUserData(userId);
  reply.header('Content-Type', 'application/json');
  reply.header('Content-Disposition', 'attachment; filename="user-data.json"');
  return data;
});
```

### P0: Enable Archiving by Default
```typescript
// order.config.ts
archiving: {
  enabled: process.env.ARCHIVING_ENABLED !== 'false', // true by default
  deleteAfterDays: parseInt(process.env.ARCHIVING_DELETE_AFTER_DAYS || '365', 10),
}
```

### P1: Add Consent Tracking
```sql
CREATE TABLE user_consents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  consent_type VARCHAR(50) NOT NULL,
  granted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  ip_address INET
);
```

---

## Strengths

- Comprehensive audit logging with auditService
- Modifications tracked with before/after values
- Log retention configured (7 years)
- Role-based access controls
- Data minimization practiced
- Archive audit log exists

Compliance & Legal Score: 21/100
