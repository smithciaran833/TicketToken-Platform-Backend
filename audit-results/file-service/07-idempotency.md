## File Service - Idempotency Audit Report

**Audit Date:** December 28, 2025  
**Service:** file-service  
**Standard:** Docs/research/07-idempotency.md

---

## State-Changing Operations Inventory

### POST Endpoints (Require Idempotency)

| Endpoint | Idempotency Status | Risk |
|----------|-------------------|------|
| POST /upload | ❌ MISSING | HIGH |
| POST /upload/chunked/init | ❌ MISSING | HIGH |
| POST /upload/chunked/:sessionId/chunk/:chunkNumber | ⚠️ PARTIAL (sessionId) | MEDIUM |
| POST /upload/chunked/:sessionId/complete | ⚠️ PARTIAL (sessionId) | MEDIUM |
| POST /upload/from-url | ❌ MISSING | HIGH |
| POST /tickets/pdf/generate | ❌ MISSING | HIGH |
| POST /qr/generate | ❌ MISSING | MEDIUM |
| POST /images/resize | ❌ MISSING | LOW |
| DELETE /cache/flush | ❌ MISSING | HIGH |

---

## Idempotency Implementation Checklist

| # | Check | Severity | Status | Evidence |
|---|-------|----------|--------|----------|
| 1 | All POST endpoints support Idempotency-Key header | CRITICAL | ❌ MISSING | No header validation |
| 2 | Idempotency storage is persistent | CRITICAL | ❌ MISSING | No idempotency_keys table |
| 3 | Idempotency checks are atomic | CRITICAL | ❌ MISSING | No locking implementation |
| 4 | Response includes replay indicator header | MEDIUM | ❌ MISSING | No X-Idempotent-Replayed |
| 5 | Keys scoped to tenant | HIGH | ❌ MISSING | No implementation |
| 6 | Error responses NOT cached | MEDIUM | N/A | No caching |

---

## File Upload Flow (VULNERABLE)

**Current Issues:**
1. No Idempotency-Key header check
2. No duplicate upload prevention
3. Same file uploaded twice = two DB records + two S3 objects
4. Network timeout + retry = duplicate uploads
5. No hash-based deduplication

**Hash Computed But Not Used:**
- hash_sha256 column exists
- Hash is generated but NOT checked for duplicates

---

## Missing Database Schema
```sql
-- Required: idempotency_keys table
CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY,
  idempotency_key VARCHAR(255) NOT NULL,
  tenant_id UUID NOT NULL,
  request_path VARCHAR(500) NOT NULL,
  response_code INTEGER,
  response_body JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  UNIQUE(tenant_id, idempotency_key)
);
```

---

## Summary

### Critical Issues (5)

| # | Issue | Recommendation |
|---|-------|----------------|
| 1 | No idempotency on file upload | Add Idempotency-Key header support |
| 2 | No idempotency_keys table | Create migration |
| 3 | No hash-based deduplication | Check hash_sha256 before creating |
| 4 | No recovery points | Track multi-step upload progress |
| 5 | Race condition vulnerability | Add atomic idempotency checks |

### High Severity Issues (4)

| # | Issue | Recommendation |
|---|-------|----------------|
| 1 | Chunked init not idempotent | Add idempotency for session creation |
| 2 | PDF generation not idempotent | Cache generated PDFs |
| 3 | No response caching | Store cached responses for duplicates |
| 4 | No idempotency middleware | Create reusable middleware |

### Passed Checks

✅ Chunked upload has session token uniqueness  
✅ File hash is computed and stored  
✅ Upload sessions have TTL  

---

### Overall Idempotency Score: **15/100**

**Risk Level:** CRITICAL
