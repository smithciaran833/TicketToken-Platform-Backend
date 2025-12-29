# Blockchain Service - 05 S2S Auth Audit

**Service:** blockchain-service
**Document:** 05-s2s-auth.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 41% (16/39 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | Default secret hardcoded, Shared secret all services, No service ACL, HTTP default |
| HIGH | 4 | 5-min replay window, No request timeout, No correlation ID, Circuit breaker not applied |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## Client Auth Config (2/7)

- Uses HMAC signing - PASS
- Credentials not hardcoded - FAIL
- Secrets from manager - PARTIAL
- Per-service credentials - FAIL
- Short-lived credentials - PARTIAL
- Automated rotation - FAIL
- Failed auth logged - PASS

## Client Request Security (2/5)

- Uses HTTPS/TLS - FAIL
- Service identity included - PASS
- Correlation ID propagated - FAIL
- Request timeout configured - FAIL
- Circuit breaker applied - PARTIAL

## Endpoint Auth Enforcement (4/7)

- All endpoints require auth - PARTIAL
- Global auth middleware - FAIL
- Cryptographic validation - PASS
- Signature verified - PASS
- Expiration checked - PASS
- Issuer validated - FAIL

## Endpoint Authorization (2/5)

- Service identity extracted - PASS
- Per-endpoint rules - FAIL
- Service allowlist - FAIL
- Unauthorized logged - PASS
- No default-allow - FAIL

## Endpoint Audit Logging (0/3)

- Caller identity logged - PARTIAL
- Correlation ID logged - FAIL
- Success/failure logged - PARTIAL

## HMAC Verification (4/6)

- SHA-256 algorithm - PASS
- Timestamp validated - PASS
- Clock skew reasonable - FAIL (5 min too long)
- Body in signature - PASS
- Constant-time compare - PASS
- Per-service secrets - FAIL

## Secrets Management (2/5)

- Secrets manager in use - PASS
- No secrets in source - FAIL
- No secrets in env (prod) - PARTIAL
- Secrets not logged - PASS
- Unique secrets per service - FAIL

## Critical Remediations

### P0: Remove Default Secret
```typescript
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET;
if (!INTERNAL_SERVICE_SECRET || INTERNAL_SERVICE_SECRET.length < 32) {
  throw new Error('INTERNAL_SERVICE_SECRET required');
}
```

### P0: Add Service Allowlist
```typescript
const ENDPOINT_ALLOWLIST = {
  '/internal/mint-tickets': ['minting-service', 'order-service']
};
```

### P0: Use HTTPS Default
```typescript
const mintingUrl = process.env.MINTING_SERVICE_URL || 'https://tickettoken-minting:3018';
```

### P1: Reduce Replay Window
```typescript
const MAX_TIMESTAMP_DIFF = 30000; // 30 seconds
```

### P1: Add Request Timeout
```typescript
await axios.post(url, body, { timeout: 30000 });
```

## Strengths

- HMAC-SHA256 signing implemented
- Timestamp validation (5 min window)
- Constant-time signature comparison
- Service identity in requests
- Auth failures logged
- Request body included in signature
- Secrets manager infrastructure exists

S2S Auth Score: 41/100
