# Minting Service - 05 S2S Authentication Audit

**Service:** minting-service
**Document:** 05-s2s-auth.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 84% (41/49 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 6 | No timing-safe compare, Admin routes unprotected, Single shared secret, Hardcoded allowlist, No secret length validation, JSON.stringify body |
| HIGH | 0 | None |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## 3.1 HMAC Signature (6/8)

- HM1: HMAC-SHA256 used - PASS
- HM2: Includes timestamp - PASS
- HM3: Includes body - PASS
- HM4: Includes service ID - PASS
- HM5: Timing-safe compare - FAIL
- HM6: Hex-encoded - PASS
- HM7: Raw body preserved - PARTIAL
- HM8: Header convention - PASS

## 3.2 Timestamp Validation (7/7 PASS)

- TS1-7: All timestamp checks PASS
- 5-minute window with bidirectional check
- Proper millisecond comparison

## 3.3 Service Identity (5/7)

- SI1: Service ID required - PASS
- SI2: Allowlist defined - PASS
- SI3: Unknown rejected - PASS
- SI4: Attached to request - PASS
- SI5: Identity logged - PASS
- SI6: Configurable allowlist - FAIL
- SI7: Unique per-service secret - FAIL

## 3.4 Secret Management (4/7)

- SM1: From environment - PASS
- SM2: Missing fails fast - PASS
- SM3: Not logged - PASS
- SM4: Min length enforced - FAIL
- SM5: Rotation supported - FAIL
- SM6: Secrets manager - PARTIAL
- SM7: No hardcoded - PASS

## 3.5 Middleware Application (4/5)

- MA1: Applied to internal routes - PASS
- MA2: Runs before handler - PASS
- MA3: Failure stops request - PASS
- MA4: All endpoints protected - FAIL (admin routes open)
- MA5: Reusable - PASS

## 3.6 Error Handling (8/8 PASS)

- EH1-8: All error handling checks PASS
- Proper 401/403/500 status codes
- No internal leakage

## 3.7 Audit Logging (7/7 PASS)

- AL1-7: All audit logging checks PASS
- IP, service, path logged
- Success and failure tracked

## Critical Remediations

### P0: Add Timing-Safe Comparison
```typescript
const sigBuffer = Buffer.from(signature, 'hex');
const expectedBuffer = Buffer.from(expectedSignature, 'hex');
if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
  return reply.code(401).send({ error: 'Invalid signature' });
}
```

### P0: Protect Admin Routes
```typescript
fastify.addHook('preHandler', validateInternalRequest);
// OR implement admin-specific auth
```

### P0: Use Per-Service Secrets
```typescript
const serviceSecrets = {
  'payment-service': process.env.PAYMENT_SERVICE_SECRET,
  'ticket-service': process.env.TICKET_SERVICE_SECRET,
};
const secret = serviceSecrets[internalService];
```

### P1: Make Allowlist Configurable
```typescript
const allowedServices = (process.env.ALLOWED_SERVICES || '').split(',');
```

### P1: Validate Secret Length
```typescript
if (!secret || secret.length < 32) {
  throw new Error('Invalid service secret configuration');
}
```

## Strengths

- HMAC-SHA256 algorithm
- 5-minute timestamp window
- Bidirectional time check
- Comprehensive error handling
- Excellent audit logging
- Service allowlist enforcement
- Fail-fast on missing config

S2S Auth Score: 84/100
