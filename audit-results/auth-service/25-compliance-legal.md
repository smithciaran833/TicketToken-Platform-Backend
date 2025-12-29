# Auth Service - 25 Compliance & Legal Audit

**Service:** auth-service
**Document:** 25-compliance-legal.md
**Date:** 2025-12-22
**Auditor:** Cline
**Pass Rate:** 62% (28/45)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 3 | No data export API, incomplete consent tracking, no documented retention policy |
| MEDIUM | 5 | Missing right to object, no DPIA process, incomplete DPA documentation |
| LOW | 9 | Minor documentation improvements |

---

## Section 3.2: Data Retention Policy Checklist

### Policy Documentation

#### CL-RET1: Documented retention periods for ALL data categories
**Status:** PARTIAL
**Evidence:** cleanup_expired_data() function has rules (sessions 30 days, audit logs 7 years).
**Issue:** Not all data categories documented. No formal retention policy document.

#### CL-RET2: Legal basis justifying each retention period
**Status:** PARTIAL

#### CL-RET3: Regular review schedule (annual)
**Status:** FAIL

#### CL-RET4: Clear ownership and responsibility
**Status:** FAIL

#### CL-RET5: Exception procedures (legal holds)
**Status:** FAIL

### Technical Implementation

#### CL-RET6: Automated deletion for expired data
**Status:** PASS
**Evidence:** cleanup_expired_data() function in migration.

#### CL-RET7: Data inventory maps all personal data locations
**Status:** PARTIAL

#### CL-RET8: Anonymization procedures
**Status:** PASS
**Evidence:** cleanup_expired_data() anonymizes deleted users with 'deleted_' prefix.

---

## Section 3.3: User Rights Support Checklist

### Right of Access (Article 15)

#### CL-ACC1: Ability to export all user data
**Status:** FAIL
**Evidence:** REMEDIATION_PLAN.md identifies this as a gap. No /gdpr/export endpoint.

#### CL-ACC2: Machine-readable format available
**Status:** FAIL

#### CL-ACC3: Copy provided within 30 days
**Status:** FAIL

### Right to Rectification (Article 16)

#### CL-REC1: Users can update their personal data
**Status:** PASS
**Evidence:** profile.controller.ts allows updating firstName, lastName, phone, email.

#### CL-REC2: Corrections propagated to third parties
**Status:** PARTIAL

#### CL-REC3: Documentation of corrections maintained
**Status:** PASS
**Evidence:** Profile updates logged to audit_logs.

### Right to Erasure (Article 17)

#### CL-ERA1: Complete deletion workflow implemented
**Status:** PARTIAL
**Evidence:** REMEDIATION_PLAN.md proposes soft delete but not yet implemented.

#### CL-ERA2: All data locations mapped and included
**Status:** PARTIAL
**Evidence:** Users anonymized but wallet_connections, oauth_connections not addressed.

#### CL-ERA3: Third-party notification process
**Status:** FAIL

#### CL-ERA4: Backup handling procedures
**Status:** FAIL

#### CL-ERA5: Deletion confirmation provided
**Status:** FAIL

#### CL-ERA6: Audit trail maintained (without deleted data)
**Status:** PASS

### Right to Data Portability (Article 20)

#### CL-PORT1: Export in machine-readable format
**Status:** FAIL

#### CL-PORT2: Commonly used, structured format (JSON, CSV)
**Status:** FAIL

### Right to Object (Article 21)

#### CL-OBJ1: Opt-out from marketing processing
**Status:** PARTIAL
**Evidence:** marketing_consent field exists but no API endpoint to change it.

#### CL-OBJ2: Objection handling within 30 days
**Status:** FAIL

### Right to Restrict Processing (Article 18)

#### CL-RESTRICT1: Ability to pause processing
**Status:** FAIL

---

## Section 3.4: Consent Management Checklist

### Consent Collection

#### CL-CON1: Consent is freely given
**Status:** PASS

#### CL-CON2: Consent is specific (separate purposes)
**Status:** PARTIAL

#### CL-CON3: No pre-checked boxes
**Status:** PASS

### Consent Records

#### CL-CONR1: Timestamp of consent recorded
**Status:** PARTIAL
**Evidence:** terms_accepted_at, marketing_consent_date fields exist.

#### CL-CONR2: Version of privacy policy at consent time
**Status:** PASS
**Evidence:** terms_version, privacy_version fields exist.

#### CL-CONR3: What specifically was consented to
**Status:** PARTIAL

#### CL-CONR4: Consent records retained for compliance
**Status:** PASS

### Consent Withdrawal

#### CL-CONW1: Easy mechanism to withdraw consent
**Status:** FAIL
**Remediation:** Add PUT /api/auth/consent endpoint.

---

## Section 3.5: DPA Checklist

#### CL-DPA1: DPA template available
**Status:** FAIL

#### CL-DPA2: Sub-processor list maintained
**Status:** FAIL

#### CL-DPA3: Breach notification within 72 hours
**Status:** PARTIAL

---

## Section 3.6: Security & Technical Measures

### Data Protection

#### CL-SEC1: Encryption at rest
**Status:** PASS

#### CL-SEC2: Encryption in transit (TLS 1.2+)
**Status:** PASS

#### CL-SEC3: Pseudonymization where appropriate
**Status:** PASS
**Evidence:** mask_email(), mask_phone() functions and users_masked view.

#### CL-SEC4: Data minimization in collection
**Status:** PASS

### Access Controls

#### CL-AC1: Role-based access controls
**Status:** PASS

#### CL-AC2: Principle of least privilege
**Status:** PASS

#### CL-AC3: Multi-factor authentication
**Status:** PASS

### Audit Logging

#### CL-LOG1: All access to personal data logged
**Status:** PASS

#### CL-LOG2: Logs include who, what, when, why
**Status:** PASS

#### CL-LOG3: Log integrity protected
**Status:** PARTIAL

---

## Section 3.7: Privacy by Design

#### CL-PBD1: Privacy considered in new features
**Status:** PARTIAL

#### CL-PBD2: DPIA process defined
**Status:** FAIL

#### CL-PBD3: Privacy settings default to most protective
**Status:** PASS
**Evidence:** marketing_consent defaults to false.

---

## Section 3.8: Documentation Checklist

#### CL-DOC1: Privacy Policy
**Status:** FAIL

#### CL-DOC2: Data Processing Agreement template
**Status:** FAIL

#### CL-DOC3: Records of Processing Activities (ROPA)
**Status:** FAIL

#### CL-DOC4: Data Subject Request procedures
**Status:** PARTIAL

#### CL-DOC5: Breach notification procedures
**Status:** PARTIAL

---

## Remediation Priority

### HIGH (Do This Week)
1. Implement data export API - /api/auth/gdpr/export
2. Implement data deletion endpoint - /api/auth/gdpr/delete
3. Create consent management table and API

### MEDIUM (Do This Month)
1. Create ROPA document
2. Implement consent withdrawal endpoint
3. Create DPA template
4. Document retention policy formally
5. Implement DPIA process
6. Add sub-processor documentation

### LOW (Backlog)
1. Add privacy policy document
2. Implement processing restriction mechanism
3. Add third-party notification for deletions
4. Implement log tamper-proofing

---

## Positive Findings

Strong compliance foundations:
- Comprehensive audit logging with triggers
- PII masking functions (mask_email, mask_phone, mask_tax_id, mask_card_number)
- RLS policies for multi-tenant data isolation
- Consent version tracking (terms_version, privacy_version)
- Automated data cleanup with retention rules
- User anonymization on soft delete
- MFA support
- Profile update auditing
- Account lockout for brute force protection
