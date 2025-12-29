# Event Service - 05 Service-to-Service Auth Audit

**Service:** event-service
**Document:** 05-service-to-service-auth.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 40% (16/40 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | No S2S authentication - uses user tokens only, No service token validation |
| HIGH | 3 | No service identity, No mTLS, No token management |
| MEDIUM | 2 | No retry logic, No trace header propagation |
| LOW | 2 | No per-service rate limiting, No IP allowlisting |

---

## 3.1 Service Identity

| Check | Status | Evidence |
|-------|--------|----------|
| SI1: Unique identifier | PARTIAL | Service name only, no cryptographic identity |
| SI2: Identity from env/secrets | FAIL | No service identity config |
| SI3: Service certificate/token | FAIL | No mechanism |
| SI4: Identity validated at startup | FAIL | No validation |
| SI5: Identity rotation supported | FAIL | No mechanism |

---

## 3.2 Outbound Requests

| Check | Status | Evidence |
|-------|--------|----------|
| OR1: S2S calls authenticated | FAIL | Uses user token, no service token |
| OR2: Dedicated service credentials | FAIL | Uses user's authToken |
| OR3: Circuit breaker | PASS | opossum with timeout: 5000 |
| OR4: Timeouts configured | PASS | 5000ms timeout |
| OR5: Retry with backoff | FAIL | No retry logic |
| OR6: Service URLs from config | PASS | Uses config/env |
| OR7: TLS enforced | PARTIAL | Relies on URL protocol |
| OR8: Trace headers propagated | FAIL | No trace context headers |
| OR9: Errors don't leak creds | PASS | Logs without credentials |
| OR10: Service calls logged | PASS | Failures logged |

---

## 3.3 Inbound Authentication

| Check | Status | Evidence |
|-------|--------|----------|
| IA1: All routes require auth | PASS | All routes have authenticateFastify |
| IA2: Service token validation | FAIL | No service token middleware |
| IA3: API key middleware | FAIL | api-key.middleware.ts doesn't exist |
| IA4: User vs service differentiated | FAIL | Only user JWT implemented |
| IA5: Unauthorized rejected early | PASS | Returns 401 before processing |
| IA6: Service caller logged | FAIL | No service caller logging |
| IA7: Rate limiting per service | FAIL | Global only |
| IA8: IP allowlisting | FAIL | Not implemented |

---

## 3.4 Token Management

| Check | Status | Evidence |
|-------|--------|----------|
| TM1: Service tokens have expiration | FAIL | No service tokens |
| TM2: Token refresh mechanism | FAIL | No refresh for S2S |
| TM3: Short-lived tokens | FAIL | N/A |
| TM4: Tokens not in logs | PASS | Token not logged |
| TM5: Tokens not in URLs | PASS | Headers only |
| TM6: Token scope validation | FAIL | No scope model |
| TM7: Token binding to service | FAIL | No binding |
| TM8: Compromised token revocation | FAIL | No revocation |

---

## 3.5 Secret Handling

| Check | Status | Evidence |
|-------|--------|----------|
| SH1: AWS Secrets Manager | PASS | @aws-sdk/client-secrets-manager |
| SH2: Secrets cached with TTL | PASS | cacheTTL: 300000 (5 min) |
| SH3: Fallback to env in dev | PASS | Dev mode uses env vars |
| SH4: Secret fetch errors handled | PASS | Catch block with fallback |
| SH5: Secrets not logged | PASS | Only names logged |
| SH6: Not in version control | PASS | Uses env/AWS SM |
| SH7: Secret rotation | PARTIAL | AWS SM supports, no in-app handling |
| SH9: Blockchain keys secured | PASS | Uses PLATFORM_WALLET_PATH from env |
| SH10: DB creds from secrets | PASS | Uses secretsManager |

---

## 3.6 Network Security

| Check | Status | Evidence |
|-------|--------|----------|
| NS1: mTLS for S2S | FAIL | No mTLS config |
| NS5: HTTPS for all calls | PARTIAL | Not enforced |

---

## Critical Security Gaps

1. **No S2S authentication** - Services use user tokens only
   - Compromised service can impersonate any user
   - No way to distinguish service from user calls
   - No service-level authorization

2. **No service token management** - Complete absence

3. **No mTLS** - Plain HTTP possible between services

---

## Strengths

- AWS Secrets Manager properly integrated with caching
- Circuit breaker pattern implemented
- Proper timeout configuration

---

## Remediation Priority

### CRITICAL (Immediate)
1. Implement service token authentication for all internal calls
2. Add API key middleware for inbound service requests
3. Create service identity configuration

### HIGH (This Month)
1. Implement mTLS for S2S communication
2. Add service-level rate limiting
3. Implement token rotation mechanism

### MEDIUM (This Quarter)
1. Add retry logic with exponential backoff
2. Propagate trace headers to outbound requests

### Architecture Note
Consider service mesh (Istio/Linkerd) or proper S2S auth pattern (OAuth2 client credentials, JWT service tokens, or mTLS)
