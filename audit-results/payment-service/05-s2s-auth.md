# Payment Service - 05 Service-to-Service Auth Audit

**Service:** payment-service
**Document:** 05-service-to-service-auth.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 33% (16/49 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | Missing auth on outbound calls (webhook.consumer.ts) |
| HIGH | 4 | Timing attack vulnerable, Default secrets, HTTP not HTTPS, No service ACLs |
| MEDIUM | 3 | Shared secrets, RabbitMQ no TLS, No correlation ID propagation |
| LOW | 1 | No circuit breaker |

---

## Client - Authentication (2/7)

| Check | Status | Evidence |
|-------|--------|----------|
| mTLS or signed tokens | PARTIAL | HMAC in outbox, NONE in webhook.consumer |
| No hardcoded secrets | FAIL | 6+ default secrets |
| Secrets from manager | PARTIAL | Uses env vars |
| Unique credentials | PARTIAL | Shared INTERNAL_WEBHOOK_SECRET |
| Short-lived tokens | PASS | 5-min timestamp window |
| Rotation automated | FAIL | No mechanism |
| Failed auth logged | PASS | Logs failures |

---

## Client - Request Security (1/5)

| Check | Status | Evidence |
|-------|--------|----------|
| HTTPS for internal | FAIL | http://ticket:3004 |
| Service identity | PARTIAL | Inconsistent |
| Correlation ID | FAIL | Not propagated |
| Timeout configured | PASS | 10000ms |
| Circuit breaker | FAIL | None |

---

## Endpoint - Authentication (3/7)

| Check | Status | Evidence |
|-------|--------|----------|
| All endpoints auth | PARTIAL | Per-route, not global |
| Middleware global | FAIL | Per-route |
| Cryptographic validation | PASS | HMAC-SHA256 |
| Signature verified | PASS | crypto.createHmac() |
| Expiration checked | PASS | 5-minute window |
| Issuer validated | FAIL | No allowlist |
| Audience validated | FAIL | None |

---

## Endpoint - Authorization (2/5)

| Check | Status | Evidence |
|-------|--------|----------|
| Identity extracted | PASS | request.internalService |
| Per-endpoint rules | FAIL | None |
| Service allowlist | FAIL | Any service can call any |
| Unauthorized logged | PASS | Warns logged |
| No default-allow | FAIL | Default allow |

---

## HMAC Verification (4/6)

| Check | Status | Evidence |
|-------|--------|----------|
| SHA-256 or stronger | PASS | sha256 |
| Timestamp validated | PASS | 5-minute window |
| Clock skew reasonable | PASS | 5 minutes |
| Body in signature | PASS | Included |
| Constant-time comparison | FAIL | Uses !== |
| Per-service secrets | FAIL | Shared secret |

---

## RabbitMQ (0/2)

| Check | Status | Evidence |
|-------|--------|----------|
| TLS enabled | PARTIAL | amqp:// not amqps:// |
| Unique credentials | FAIL | Default localhost |

---

## Secrets Management (1/8)

| Check | Status | Evidence |
|-------|--------|----------|
| Secrets manager | PARTIAL | Uses env vars |
| No secrets in code | FAIL | 6+ defaults |
| Secrets not logged | PASS | PCI scrubber |
| Unique per service | FAIL | Shared |
| Auto rotation | FAIL | None |
| Access audited | FAIL | None |

---

## Strengths

- HMAC-SHA256 signature verification
- 5-minute timestamp window
- Request body in HMAC
- Auth failures logged
- Timeout on HTTP calls
- Service identity on request
- Nonce in signed requests
- Method/path in signature
- Dev bypass production-gated
- Internal DNS service names

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Add auth to webhook.consumer.ts:**
```typescript
await axios.post(url, data, {
  headers: {
    'x-internal-signature': generateSignature(data),
    'x-webhook-timestamp': Date.now().toString(),
    'x-webhook-nonce': uuidv4()
  }
});
```

### HIGH (This Week)
1. **Fix timing attack:**
```typescript
if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
  return reply.status(401).send({ error: 'Invalid signature' });
}
```

2. **Remove all default secrets:**
```typescript
const SECRET = process.env.INTERNAL_SERVICE_SECRET;
if (!SECRET) throw new Error('INTERNAL_SERVICE_SECRET required');
```

3. **Use HTTPS for internal calls**

4. **Add service ACLs:**
```typescript
const ALLOWED_SERVICES = { '/internal/payment': ['order-service'] };
```

### MEDIUM (This Month)
1. Per-service unique credentials
2. Enable TLS on RabbitMQ (amqps://)
3. Add correlation ID propagation

### LOW (Backlog)
1. Implement circuit breaker
