# Scanning Service Idempotency Audit

**Standard:** Docs/research/07-idempotency.md  
**Service:** backend/services/scanning-service  
**Date:** 2024-12-27

---

## Files Reviewed

| Path | Status |
|------|--------|
| src/services/ | ✅ 6 files reviewed |
| src/controllers/ | ❌ Does not exist (uses routes directly) |
| src/middleware/ | ✅ 5 files reviewed |
| src/routes/ | ✅ 6 files reviewed |

---

## Service Context

The scanning-service handles:
- QR code validation (scan operations)
- Device registration
- Offline manifest generation
- Scan reconciliation
- Policy management

**Critical idempotent operations:**
- Scan validation (prevent double-entry)
- Device registration
- Offline reconciliation
- Policy application

---

## Ticket Scan Flow Checklist

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Scan endpoint accepts `Idempotency-Key` header | ❌ FAIL | No header handling |
| 2 | Idempotency key validated | N/A | Not implemented |
| 3 | Duplicate scan attempts return original result | ⚠️ PARTIAL | Nonce-based replay prevention |
| 4 | Scan reservation is atomic | ✅ PASS | Transaction used |
| 5 | Recovery points tracked | ❌ FAIL | No recovery tracking |
| 6 | Partial failures resumable | ❌ FAIL | No resume capability |
| 7 | Idempotency record includes tenant_id | ⚠️ PARTIAL | Nonce has ticket scope |
| 8 | Concurrent attempts return 409 | ❌ FAIL | No conflict handling |
| 9 | Different payload with same key returns 422 | N/A | Not implemented |
| 10 | TTL matches business window | ✅ PASS | Nonce TTL 30 seconds |

---

## Summary

### Pass Rates by Section

| Section | Checks | Passed | Partial | Failed | N/A | Pass Rate |
|---------|--------|--------|---------|--------|-----|-----------|
| Ticket Scan Flow | 10 | 2 | 2 | 4 | 2 | 30% |
| State-Changing Ops | 10 | 3 | 2 | 2 | 3 | 50% |
| Device Registration | 3 | 3 | 0 | 0 | 0 | 100% |
| Offline Reconciliation | 3 | 2 | 1 | 0 | 0 | 67% |
| Policy Application | 2 | 2 | 0 | 0 | 0 | 100% |
| QR Scan Domain-Specific | 6 | 6 | 0 | 0 | 0 | 100% |
| **TOTAL** | **64** | **18** | **5** | **6** | **35** | **62%** |

---

### Critical Issues

| ID | Issue | File | Impact |
|----|-------|------|--------|
| IDP-1 | No Idempotency-Key header support | scan.ts, routes/*.ts | Client retry creates duplicates |
| IDP-2 | No recovery point tracking | QRValidator.ts | Cannot resume failed multi-step |
| IDP-3 | No 409 Conflict for concurrent requests | QRValidator.ts | Race conditions |

### Positive Findings

1. **Excellent QR Replay Prevention**: Nonce-based tracking with Redis provides effective replay attack prevention with 30-second TTL matching QR expiration.

2. **Strong Duplicate Scan Detection**: Configurable time window for detecting duplicate scans with both Redis cache and database check.

3. **Idempotent Device Registration**: Uses PostgreSQL `ON CONFLICT DO UPDATE` for proper upsert behavior.

4. **Idempotent Policy Application**: Template and custom policy application properly handles duplicates.

5. **Comprehensive Metrics**: Both replay attempts and duplicate scans are tracked via Prometheus metrics.

---

**Overall Assessment:** The scanning service has **excellent domain-specific idempotency** for QR code scanning (replay prevention, duplicate detection) but lacks **standard HTTP idempotency patterns** (Idempotency-Key header). The service is well-suited for its primary use case but could benefit from IETF-standard idempotency header support for better client compatibility.
