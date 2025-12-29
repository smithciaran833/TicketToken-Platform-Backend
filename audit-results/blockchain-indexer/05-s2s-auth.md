# Blockchain-Indexer Service - 05 Service-to-Service Auth Audit

**Service:** blockchain-indexer
**Document:** 05-s2s-auth.md
**Date:** 2025-12-26
**Auditor:** Cline AI
**Pass Rate:** 53% (21/40 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | No mTLS/signed tokens for RPC, marketplace calls unauthenticated |
| HIGH | 5 | JWT secret from env, no issuer/audience validation, no service identity |
| MEDIUM | 4 | No correlation ID propagation, circuit breaker not integrated |
| LOW | 2 | No per-endpoint authorization, missing S2S audit logging |

## Service Client Auth (4/7)

- mTLS or signed tokens - FAIL (CRITICAL)
- Credentials not hardcoded - PASS
- Secrets from manager - PARTIAL
- Unique credentials - PASS
- Short-lived tokens - N/A
- Credential rotation - FAIL
- Auth failures logged - PASS

## Service Client Request (2/5)

- HTTPS enforced - PARTIAL
- Service identity in requests - FAIL
- Correlation ID propagated - FAIL
- Request timeout configured - PARTIAL
- Circuit breaker - PARTIAL

## Endpoint Auth (5/8)

- All endpoints require auth - PARTIAL (health/metrics excluded)
- Auth middleware global - FAIL
- Token crypto validation - PASS
- Signature verification - PASS
- Expiration checked - PASS
- Issuer validated - FAIL (HIGH)
- Audience validated - FAIL (HIGH)

## Endpoint Authorization (2/5)

- Service identity extracted - PARTIAL
- Per-endpoint rules - FAIL
- Service allowlist - FAIL
- Unauthorized logged - PASS
- No default-allow - PARTIAL

## JWT Verification (4/6 applicable)

- Algorithm RS256/ES256 - FAIL
- Public key secure - FAIL
- iss claim validated - FAIL
- aud claim validated - FAIL
- exp claim checked - PASS
- Expired rejected - PASS

## Secrets Management (3/5 applicable)

- Secrets manager used - PARTIAL
- No secrets in code - PASS
- Secrets not in env - FAIL
- Secrets not logged - PASS
- Unique per service - PASS

## External Calls Analysis

### Solana RPC
- Auth: None (public)
- TLS: HTTPS default
- Timeout: Library default
- Circuit Breaker: Available but unused

### Marketplace APIs
- Uses on-chain program addresses
- No API key auth needed for current approach

### Database
- Auth: Username/password from env
- TLS: Not configured

## Critical Issues

### 1. Unauthenticated RPC Calls
```typescript
// No auth for Solana RPC
this.connection = new Connection(config.solana.rpcUrl);
```

### 2. No JWT Algorithm Validation
```typescript
// Missing algorithm whitelist
jwt.verify(token, jwtSecret);
// Should be:
jwt.verify(token, jwtSecret, { algorithms: ['RS256'] });
```

### 3. No Issuer/Audience Validation
```typescript
// Missing iss/aud claims validation
```

## Remediations

### CRITICAL
1. Use authenticated RPC endpoints (private nodes with API keys)
2. Add JWT algorithm validation

### HIGH
1. Migrate secrets to secrets manager
2. Add issuer/audience validation
3. Apply circuit breaker to all external calls
4. Add service identity to outbound requests

### MEDIUM
1. Propagate correlation ID
2. Add per-endpoint authorization
3. Configure explicit RPC timeouts
4. Add S2S audit logging

S2S Auth Score: 53/100
