## File Service - Service-to-Service Authentication Audit Report

**Audit Date:** December 28, 2025  
**Service:** file-service  
**Standard:** Docs/research/05-service-to-service-auth.md

---

## Service Client Checklist

| # | Check | Severity | Status | Evidence |
|---|-------|----------|--------|----------|
| 1 | Service uses mTLS OR signed tokens | CRITICAL | ⚠️ PARTIAL | JWT tokens used but no mTLS |
| 2 | Service credentials NOT hardcoded | CRITICAL | ✅ PASS | Uses secretsManager |
| 3 | Credentials from secrets manager | HIGH | ✅ PASS | Dynamic secret retrieval |
| 4 | Each service has unique credentials | CRITICAL | ❌ FAIL | Shared JWT_SECRET |
| 5 | Short-lived credentials | HIGH | ⚠️ UNKNOWN | Expiry not enforced locally |
| 7 | Failed authentication attempts logged | HIGH | ✅ PASS | Returns 401/403 |

---

## Service Endpoint Checklist

| # | Check | Severity | Status | Evidence |
|---|-------|----------|--------|----------|
| 1 | ALL endpoints require authentication | CRITICAL | ❌ FAIL | /health, /metrics, cache routes unprotected |
| 2 | Authentication middleware applied globally | HIGH | ❌ FAIL | Per-route application only |
| 3 | Token verification uses cryptographic validation | CRITICAL | ✅ PASS | jwt.verify() |
| 4 | Tokens verified with signature check | CRITICAL | ✅ PASS | jwt.verify() validates signature |
| 5 | Token expiration checked | HIGH | ✅ PASS | jwt.verify() checks exp |
| 6 | Token issuer validated | CRITICAL | ❌ MISSING | No issuer option |
| 7 | Token audience validated | CRITICAL | ❌ MISSING | No audience option |

---

## JWT Configuration Issues

| Issue | Status | Evidence |
|-------|--------|----------|
| Symmetric algorithm (HS256) | ❌ FAIL | All services share secret |
| Secret from env var | ❌ FAIL | process.env.JWT_SECRET |
| No algorithm whitelist | ❌ MISSING | No algorithms option |
| No issuer validation | ❌ MISSING | No issuer option |
| No audience validation | ❌ MISSING | No audience option |

---

## Unprotected Endpoints (S2S Risk)

| Endpoint | Protection | Risk |
|----------|------------|------|
| GET /health | None | LOW |
| GET /metrics | None | MEDIUM |
| GET /cache/stats | None | HIGH |
| DELETE /cache/flush | None | CRITICAL |
| POST /tickets/pdf/generate | None | CRITICAL |

---

## Summary

### Critical Issues (8)

| # | Issue | Recommendation |
|---|-------|----------------|
| 1 | Shared JWT secret across services | Use per-service credentials or asymmetric JWT |
| 2 | No service identity verification | Add service identity claim |
| 3 | JWT secret from env var | Retrieve from secrets manager |
| 4 | Symmetric JWT algorithm | Use RS256/ES256 |
| 5 | No issuer validation | Add issuer check |
| 6 | No audience validation | Add audience check |
| 7 | Unprotected sensitive endpoints | Add authentication |
| 8 | No service-level ACLs | Implement per-endpoint allowlists |

### High Severity Issues (5)

| # | Issue | Recommendation |
|---|-------|----------------|
| 1 | No mTLS implementation | Consider service mesh |
| 2 | No correlation ID propagation | Add X-Correlation-ID |
| 3 | No circuit breaker | Implement circuit breaker pattern |
| 4 | Authentication not global | Apply globally with exemptions |
| 5 | Service identity not in logs | Add to all request logs |

---

### Overall Service-to-Service Auth Score: **32/100**

**Risk Level:** CRITICAL
