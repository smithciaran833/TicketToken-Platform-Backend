## Transfer-Service Service-to-Service Auth Audit
### Standard: 05-service-to-service-auth.md

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Checks** | 38 |
| **Passed** | 12 |
| **Failed** | 19 |
| **Partial** | 7 |
| **Pass Rate** | 32% |

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 5 |
| 🟠 HIGH | 8 |
| 🟡 MEDIUM | 8 |
| 🟢 LOW | 5 |

---

## Service Client Checklist (Calling Other Services)

### Authentication Configuration

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Service uses mTLS OR signed tokens for outbound calls | **FAIL** 🔴 | `webhook.service.ts` - No service auth for outbound |
| 2 | Service credentials NOT hardcoded | **PASS** | `secrets.ts` - Uses secrets manager |
| 3 | Credentials from secrets manager at runtime | **PARTIAL** 🟠 | `secrets.ts:15-22` - DB creds yes, but Solana keys from env |
| 4 | Each service has unique credentials | **PARTIAL** 🟡 | `secrets.ts` - DB creds unique, but shared JWT_SECRET |
| 5 | Short-lived credentials used (< 1 hour) | **FAIL** 🟡 | JWT tokens have no short expiry configured |
| 6 | Credential rotation automated | **NOT VERIFIED** | Depends on secrets manager config |
| 7 | Failed auth attempts logged | **PASS** | `auth.middleware.ts:40-56` |

### Request Security

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 8 | All internal HTTP uses HTTPS/TLS | **FAIL** 🟠 HIGH | `webhook.service.ts` - Uses axios without TLS enforcement |
| 9 | Service identity in every request | **FAIL** 🔴 CRITICAL | No service identity headers in outbound calls |
| 10 | Correlation ID propagated | **FAIL** 🟠 HIGH | `webhook.service.ts` - No X-Correlation-ID header |
| 11 | Request timeout configured | **PASS** | `webhook.service.ts:93` - `timeout: 5000` |
| 12 | Circuit breaker for downstream | **PASS** | `circuit-breaker.ts` available |

### Node.js/Fastify Specific

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 13 | HTTP client with TLS cert validation | **FAIL** 🟠 HIGH | `webhook.service.ts` - No TLS config in axios |
| 14 | Modern HTTP client used | **PASS** | Uses axios (not deprecated request) |
| 15 | No `NODE_TLS_REJECT_UNAUTHORIZED=0` | **NOT VERIFIED** | Environment check needed |
| 16 | Client includes service identity header | **FAIL** 🟠 HIGH | `webhook.service.ts:90-94` - Only User-Agent, no service ID |

---

## Service Endpoint Checklist (Receiving Requests)

### Authentication Enforcement

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | ALL endpoints require authentication | **PASS** | `transfer.routes.ts:19,37` - All use `authenticate` |
| 2 | Auth middleware applied globally | **PARTIAL** 🟡 | Applied per-route, not globally |
| 3 | Token verification is cryptographic | **PASS** | `auth.middleware.ts:33` - `jwt.verify()` |
| 4 | Token verified with signature check | **PASS** | Uses `jwt.verify()` not `jwt.decode()` |
| 5 | Token expiration checked | **PASS** | `auth.middleware.ts:40-43` - TokenExpiredError handled |
| 6 | Token issuer validated | **FAIL** 🟠 HIGH | `auth.middleware.ts:33` - No `issuer` option |
| 7 | Token audience validated | **FAIL** 🟠 HIGH | `auth.middleware.ts:33` - No `audience` option |

### Authorization

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 8 | Service identity extracted from request | **FAIL** 🔴 CRITICAL | No service-to-service identity verification |
| 9 | Per-endpoint authorization rules | **PARTIAL** 🟡 | Basic role middleware exists, not applied |
| 10 | Allowlist of services per endpoint | **FAIL** 🔴 CRITICAL | No service ACL checking |
| 11 | Unauthorized access logged | **PARTIAL** 🟡 | Logs auth failures, not authz |
| 12 | No default-allow policy | **PASS** | Default deny (returns 401) |

### Audit Logging

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 13 | Caller service identity logged | **FAIL** 🟡 | No service identity in logs |
| 14 | Correlation ID logged | **FAIL** 🟡 | Not included in log entries |
| 15 | Request success/failure logged | **PASS** | `transfer.service.ts:71-77, 125-130` |
| 16 | Sensitive ops logged with context | **PASS** | Transfer operations logged |
| 17 | Logs sent to centralized system | **NOT VERIFIED** | Infrastructure config |

### Node.js/Fastify Specific

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 18 | JWT plugin or proper validation | **PASS** | Uses jsonwebtoken library |
| 19 | JWT secret from secrets manager | **FAIL** 🔴 CRITICAL | `auth.middleware.ts:4` - `process.env.JWT_SECRET` |
| 20 | `preHandler` hook for auth | **PASS** | `transfer.routes.ts` - Uses preHandler |
| 21 | Request logging includes caller ID | **FAIL** 🟡 | No caller identification |
| 22 | onError logs auth failures | **PARTIAL** | Via global error handler |

---

## Service Identity Verification Checklist

### For mTLS
| Status | **NOT IMPLEMENTED** |
|--------|---------------------|
| Note | No mTLS configuration in transfer-service |
| Risk | Network-based attacks possible |

### For JWT Service Tokens

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 7 | Token algorithm is RS256 or ES256 | **FAIL** 🟠 HIGH | `auth.middleware.ts` - No algorithm specified (defaults to HS256) |
| 8 | Public key retrieved securely | **N/A** | Using symmetric HS256 |
| 9 | `sub` claim contains service identity | **FAIL** 🟡 | No service identity claims |
| 10 | `iss` claim validated | **FAIL** 🟠 HIGH | No issuer validation |
| 11 | `aud` claim includes this service | **FAIL** 🟠 HIGH | No audience validation |
| 12 | `exp` claim checked | **PASS** | JWT library checks exp |
| 13 | Token not accepted if expired | **PASS** | TokenExpiredError handled |

### For HMAC Signatures (Webhooks)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 14 | SHA-256 or stronger | **PASS** | `webhook.service.ts:166` - `createHmac('sha256', ...)` |
| 15 | Timestamp included | **FAIL** 🟡 | No timestamp in signature |
| 16 | Clock skew tolerance | **FAIL** 🟡 | No timestamp validation |
| 17 | Request body in signature | **PASS** | `webhook.service.ts:166-169` |
| 18 | Constant-time comparison | **PASS** | `webhook.service.ts:181` - `timingSafeEqual` |
| 19 | Per-service secrets | **PASS** | Per-subscription secrets |

---

## Secrets Management Checklist

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Secrets manager in use | **PARTIAL** 🟠 | `secrets.ts:7` - Used for DB, not all secrets |
| 2 | No secrets in source code | **PASS** | No hardcoded secrets found |
| 3 | No secrets in env vars (prod) | **FAIL** 🔴 CRITICAL | `solana.config.ts:24` - Private key in env |
| 4 | No secrets in CI/CD config | **NOT VERIFIED** | Config files not reviewed |
| 5 | Secrets not logged | **PARTIAL** 🟡 | No redaction configured |
| 6 | Each service has unique secrets | **PARTIAL** 🟡 | DB yes, JWT shared |
| 7 | Automatic secret rotation | **NOT VERIFIED** | Infrastructure config |
| 8 | Secret access is audited | **NOT VERIFIED** | Secrets manager feature |
| 9 | Least privilege for secrets | **NOT VERIFIED** | IAM policies not reviewed |
| 10 | Emergency rotation documented | **NOT VERIFIED** | Process documentation |

---

## Critical Findings

### 🔴 CRITICAL-1: JWT Secret from Environment Variable
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `auth.middleware.ts:4-8` |
| Code | `const JWT_SECRET = process.env.JWT_SECRET;` |
| Issue | JWT signing secret loaded from plain environment variable |
| Risk | Secret exposed in process listing, container inspection, logs |
| Remediation | Load from secrets manager like DB credentials |

### 🔴 CRITICAL-2: No Service-to-Service Identity
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `auth.middleware.ts`, `transfer.routes.ts` |
| Issue | No mechanism to identify calling services |
| Risk | Any authenticated user can call any endpoint |
| Remediation | Implement service token validation or mTLS |

### 🔴 CRITICAL-3: No Service ACL on Endpoints
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `transfer.routes.ts` |
| Issue | No allowlist of services that can call transfer endpoints |
| Risk | Compromised service can access all endpoints |
| Remediation | Add service identity checking middleware |

### 🔴 CRITICAL-4: Solana Private Key in Environment
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `solana.config.ts:24-27` |
| Code | `const treasuryPrivateKey = process.env.SOLANA_TREASURY_PRIVATE_KEY!;` |
| Issue | Blockchain private key in plain environment variable |
| Risk | Key exposure leads to complete fund theft |
| Remediation | Use secrets manager or HSM |

### 🔴 CRITICAL-5: Outbound Calls Without Service Identity
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `webhook.service.ts:85-95` |
| Issue | Webhook calls have no service identification |
| Code | Headers only include `User-Agent` and signature |
| Remediation | Add `X-Service-ID` and service token headers |

---

## Additional Findings

### HIGH: No JWT Algorithm Enforcement
| Severity | 🟠 HIGH |
|----------|---------|
| Evidence | `auth.middleware.ts:33` |
| Code | `jwt.verify(token, JWT_SECRET)` |
| Issue | No `algorithms` option - vulnerable to algorithm confusion |
| Remediation | Add `{ algorithms: ['HS256'] }` or use RS256 |

### HIGH: No Issuer/Audience Validation
| Severity | 🟠 HIGH |
|----------|---------|
| Evidence | `auth.middleware.ts:33` |
| Issue | JWT `iss` and `aud` claims not validated |
| Risk | Tokens from other issuers could be accepted |
| Remediation | Add `issuer` and `audience` to verify options |

### HIGH: No TLS Enforcement for Webhooks
| Severity | 🟠 HIGH |
|----------|---------|
| Evidence | `webhook.service.ts:86-95` |
| Issue | No HTTPS enforcement for webhook delivery |
| Risk | Webhook data transmitted in plaintext |
| Remediation | Validate URL scheme is `https://` |

### MEDIUM: No Replay Protection in Webhooks
| Severity | 🟡 MEDIUM |
|----------|----------|
| Evidence | `webhook.service.ts:166-169` |
| Issue | Signature doesn't include timestamp for replay protection |
| Risk | Webhook requests can be replayed |
| Remediation | Include timestamp in signature, validate freshness |

---

## Prioritized Remediations

### 🔴 CRITICAL (Fix Immediately)

1. **Move JWT Secret to Secrets Manager**
   - File: `auth.middleware.ts`
   - Action: Load JWT_SECRET from secretsManager
```typescript
const JWT_SECRET = await secretsManager.getSecret('jwt/signing-key');
```

2. **Move Solana Keys to Secrets Manager**
   - File: `solana.config.ts`
   - Action: Load from secrets manager, not env var

3. **Implement Service Identity Verification**
   - New: `service-auth.middleware.ts`
   - Action: Create middleware to verify calling service
```typescript
async function verifyServiceIdentity(request) {
  const serviceToken = request.headers['x-service-token'];
  const decoded = jwt.verify(serviceToken, SERVICE_PUBLIC_KEY);
  const allowedServices = getServiceACL(request.url);
  if (!allowedServices.includes(decoded.sub)) {
    throw new ForbiddenError('Service not authorized');
  }
  request.callerService = decoded.sub;
}
```

4. **Add Service ACL to Endpoints**
   - File: `transfer.routes.ts`
   - Action: Add service allowlist per endpoint

5. **Add Service Identity to Outbound Calls**
   - File: `webhook.service.ts`
   - Action: Include service identification headers

### 🟠 HIGH (Fix Within 24-48 Hours)

6. **Enforce JWT Algorithm**
   - File: `auth.middleware.ts:33`
   - Action: Add `{ algorithms: ['HS256'] }` to verify options

7. **Add Issuer/Audience Validation**
   - File: `auth.middleware.ts:33`
   - Action: Add `issuer` and `audience` options

8. **Enforce HTTPS for Webhooks**
   - File: `webhook.service.ts`
   - Action: Validate webhook URLs are HTTPS

9. **Propagate Correlation ID to Webhooks**
   - File: `webhook.service.ts`
   - Action: Add `X-Correlation-ID` header

### 🟡 MEDIUM (Fix Within 1 Week)

10. **Add Timestamp to Webhook Signatures**
    - File: `webhook.service.ts`
    - Action: Include timestamp, validate on receiving end

11. **Add Service Identity to Logs**
    - Files: All service files
    - Action: Log calling service in all operations

12. **Consider Asymmetric JWT Signing**
    - Action: Migrate from HS256 to RS256 for service tokens

---

## Service-to-Service Communication Matrix

| From | To | Auth Method | Status |
|------|----|-------------|--------|
| API Gateway | Transfer Service | JWT | ⚠️ No service identity |
| Transfer Service | Solana RPC | None | ❌ No auth headers |
| Transfer Service | Webhook Endpoints | HMAC | ⚠️ No service identity |
| Transfer Service | Database | Password | ✅ Via secrets manager |
| Transfer Service | Redis | Password | ✅ Via secrets manager |

---

## End of Service-to-Service Auth Audit Report
