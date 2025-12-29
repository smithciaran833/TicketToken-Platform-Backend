# API Gateway - 05 Service-to-Service Authentication Audit

**Service:** api-gateway
**Document:** 05-s2s-auth.md
**Date:** 2025-12-26
**Auditor:** Cline
**Pass Rate:** 72% (28/39 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | x-gateway-internal header is weak auth (spoofable) |
| HIGH | 3 | No HTTPS enforcement, no per-service credentials, correlation ID not propagated |
| MEDIUM | 3 | No mTLS, credentials not from secrets manager, no request signing |
| LOW | 3 | No cert validation config, health check timeouts |

## Service Client - Outbound (8/16)

- mTLS or signed tokens - FAIL (uses static header)
- Credentials not hardcoded - PARTIAL
- Credentials from secrets manager - FAIL
- Unique per-service credentials - FAIL
- Short-lived credentials - FAIL
- Failed auth logged - PASS
- HTTPS for internal calls - PARTIAL
- Service identity in requests - PASS
- Correlation ID propagated - PARTIAL
- Request timeout configured - PASS
- Circuit breaker implemented - PASS
- TLS certificate validation - PARTIAL
- Modern HTTP client - PASS
- No TLS bypass - PASS
- Service identity header - PASS

## Service Endpoint - Inbound (9/11)

- Internal routes require auth - PASS
- Auth middleware global - PASS
- Token verification crypto - PASS
- Token expiration checked - PASS
- Token issuer validated - PASS
- Token audience validated - PARTIAL
- Per-endpoint authorization - PASS
- Caller identity logged - PARTIAL
- Correlation ID logged - PASS
- Unauthorized access logged - PASS
- @fastify/jwt used - PASS

## Proxy Headers (5/5)

- Internal headers blocked - PASS
- Gateway marker added - PASS
- Original IP forwarded - PASS
- Tenant ID from JWT only - PASS
- Response headers filtered - PASS

## Fail-Secure (3/3)

- Access check fails secure - PASS
- Token validation fails secure - PASS
- Health check errors handled - PASS

## Critical Evidence

### Weak S2S Authentication
```typescript
this.httpClient = axios.create({
  headers: {
    'x-gateway-internal': 'true' // Can be spoofed!
  }
});
```

### No Correlation ID Propagation
```typescript
// AuthServiceClient.ts - missing
const response = await this.httpClient.get(`/users/${userId}`);
// Should include: { headers: { 'x-correlation-id': correlationId } }
```

### Fail-Secure Pattern (Good)
```typescript
} catch (error) {
  logSecurityEvent('venue_access_check_failed', {...}, 'high');
  return false; // Deny on error
}
```

## Critical Remediations

### P0: Implement Proper S2S Auth
**Option A: JWT Service Tokens**
```typescript
const serviceToken = await generateServiceToken({
  sub: 'api-gateway',
  iss: 'tickettoken-gateway',
  aud: ['auth-service'],
  exp: Math.floor(Date.now() / 1000) + 300
});
headers: { 'Authorization': `Bearer ${serviceToken}` }
```

**Option B: HMAC Request Signing**
```typescript
const signature = crypto.createHmac('sha256', secret)
  .update([method, path, timestamp, bodyHash].join('\n'))
  .digest('base64');
```

### P1: Add Correlation ID Propagation
```typescript
headers: { 'x-correlation-id': request.id }
```

### P1: Per-Service Credentials
```typescript
const apiKey = await secretsManager.getSecret('services/api-gateway/auth-service-key');
```

### P1: Enforce HTTPS
```typescript
if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) {
  throw new Error('HTTPS required');
}
```

## Strengths

- Circuit breaker on all service calls
- Request timeouts configured (3-5s)
- Fail-secure pattern implemented
- Security events logged
- Internal headers blocked from clients
- Response headers filtered
- Token blacklist checking
- Tenant ID from verified JWT only
- @fastify/jwt for crypto validation

## Key Security Finding

`x-gateway-internal: true` is **CRITICAL** vulnerability:
- No cryptographic proof
- Any attacker can spoof
- No service identity
- No expiration
- No audit trail

**Risk:** Network attacker can impersonate gateway

S2S Authentication Score: 72/100
