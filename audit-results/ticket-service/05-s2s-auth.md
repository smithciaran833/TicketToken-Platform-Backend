# Ticket Service - 05 Service-to-Service Auth Audit

**Service:** ticket-service
**Document:** 05-service-to-service-auth.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 47% (21/45 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 3 | HTTP not HTTPS for internal calls, Hardcoded secret fallback, Timing attack vulnerable |
| HIGH | 4 | Shared secret across services, Body not in HMAC, RabbitMQ no TLS, No service allowlist |
| MEDIUM | 2 | No credential rotation, Temp signature bypass in dev |
| LOW | 1 | Correlation ID not propagated |

---

## Service Client - Authentication (3/7)

| Check | Status | Evidence |
|-------|--------|----------|
| mTLS or signed tokens | PARTIAL | Basic headers only |
| Credentials not hardcoded | FAIL | Default secret in source |
| Secrets from manager | PASS | AWS Secrets Manager exists |
| Unique credentials per service | PARTIAL | Shared INTERNAL_SERVICE_SECRET |
| Short-lived tokens | FAIL | Static API key |
| Credential rotation | FAIL | No mechanism |
| Failed auth logged | PASS | All failures logged |

---

## Service Client - Request Security (2/5)

| Check | Status | Evidence |
|-------|--------|----------|
| HTTPS for internal calls | FAIL | Uses http:// |
| Service identity in requests | PASS | X-Service header |
| Correlation ID propagated | PARTIAL | Generated, not propagated |
| Request timeout | PASS | timeout: 10000 |
| Circuit breaker | PARTIAL | Health tracking, no breaker |

---

## Service Endpoint - Authentication (5/7)

| Check | Status | Evidence |
|-------|--------|----------|
| All internal endpoints require auth | PASS | verifyInternalService on all |
| Middleware applied consistently | PASS | All routes have preHandler |
| Cryptographic signature verification | PASS | HMAC-SHA256 |
| Token expiration checked | PASS | 5-minute timestamp validation |
| Issuer validated against allowlist | FAIL | No service allowlist |
| Audience validated | FAIL | No audience validation |

---

## Service Endpoint - Authorization (2/5)

| Check | Status | Evidence |
|-------|--------|----------|
| Service identity extracted | PASS | x-internal-service header |
| Per-endpoint authorization | FAIL | Any service can call any endpoint |
| Per-endpoint service allowlist | FAIL | Not implemented |
| Unauthorized attempts logged | PASS | All rejections logged |
| No default-allow policy | FAIL | Default allow if signature valid |

---

## HMAC Signature Security (3/6)

| Check | Status | Evidence |
|-------|--------|----------|
| SHA-256 or stronger | PASS | crypto.createHmac('sha256') |
| Timestamp included/validated | PASS | 5-minute window |
| Clock skew reasonable | PASS | 5 minutes |
| Request body in signature | FAIL | Only serviceName:timestamp:url |
| Constant-time comparison | FAIL | Uses !== (timing attack) |
| Per-service secrets | FAIL | Single shared secret |

---

## RabbitMQ Security (0/4)

| Check | Status | Evidence |
|-------|--------|----------|
| TLS enabled | FAIL | amqp:// not amqps:// |
| Unique credentials per service | FAIL | admin:admin default |
| Virtual hosts for isolation | FAIL | Default vhost |
| Default guest disabled | FAIL | Using admin:admin |

---

## Secrets Management (4/8)

| Check | Status | Evidence |
|-------|--------|----------|
| Secrets manager in use | PASS | AWS Secrets Manager |
| No secrets in source | FAIL | Default secret in code |
| Production uses manager | PASS | AWS in production |
| Secrets not logged | PASS | PII sanitizer redacts |
| Unique secrets per service | FAIL | Shared secret |
| Automatic rotation | FAIL | Not implemented |
| Secret access audited | PARTIAL | AWS logs, no app audit |
| Least privilege | PASS | Only loads needed secrets |

---

## Webhook Security (4/4 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Signature verified | PASS | HMAC with nonce |
| Replay protection | PASS | Nonce in DB |
| Timestamp validation | PASS | 5-minute window |
| Secret required in prod | PASS | Throws if not set |

---

## Strengths

- HMAC-SHA256 signature verification
- 5-minute timestamp validation
- AWS Secrets Manager for production
- Webhook replay protection with nonce
- Production-required secrets for webhooks
- Service identity header
- Comprehensive audit logging
- Request timeout configuration

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Fix timing attack:**
```typescript
const sigBuffer = Buffer.from(signature);
const expectedBuffer = Buffer.from(expectedSignature);
if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
  return reply.status(401).send({ error: 'Invalid signature' });
}
```

2. **Remove hardcoded fallback:**
```typescript
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;
if (!INTERNAL_SECRET) throw new Error('FATAL: INTERNAL_SERVICE_SECRET required');
```

3. **Include body in HMAC:**
```typescript
const bodyHash = request.body ? crypto.createHash('sha256').update(JSON.stringify(request.body)).digest('hex') : '';
const stringToSign = `${serviceName}:${timestamp}:${request.url}:${bodyHash}`;
```

### HIGH (This Week)
1. Use HTTPS or mTLS for internal calls
2. Implement per-service credentials
3. Add per-endpoint service allowlists
4. Enable TLS for RabbitMQ (amqps://)

### MEDIUM (This Month)
1. Implement credential rotation
2. Remove temp-signature bypass in dev
