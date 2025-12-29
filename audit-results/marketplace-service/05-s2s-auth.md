# Marketplace Service - 05 Service-to-Service Auth Audit

**Service:** marketplace-service
**Document:** 05-service-to-service-auth.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 17% (4/24 checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 6 | No internal auth, No service identity, Mixed HTTP clients, No circuit breaker, No mTLS, No request ID |
| HIGH | 4 | No startup health check, No retry for HTTP, Service names in logs, No differentiated rate limits |
| MEDIUM | 0 | None |
| LOW | 0 | None |

---

## 3.1 Service URL Configuration (2/4)

| Check | Status | Evidence |
|-------|--------|----------|
| SVC1: URLs from environment | PASS | process.env.BLOCKCHAIN_SERVICE_URL |
| SVC2: No hardcoded prod URLs | PASS | Fallbacks to localhost |
| SVC3: Service discovery | PARTIAL | Manual URL config only |
| SVC4: URLs validated startup | FAIL | No validation or health probe |

---

## 3.2 Service Client Implementation (2/8)

| Check | Status | Evidence |
|-------|--------|----------|
| CLI1: Timeouts configured | PASS | timeout: 5000 |
| CLI2: Retry logic | PARTIAL | Blockchain only, not HTTP |
| CLI3: Circuit breaker | FAIL | Not implemented |
| CLI4: Error handling | PASS | try/catch with logging |
| CLI5: Response caching | PARTIAL | Some services only |
| CLI6: Request ID propagation | FAIL | Not implemented |
| CLI7: Consistent error wrapping | FAIL | Raw errors exposed |
| CLI8: Centralized HTTP client | FAIL | Mixed fetch/axios |

---

## 3.3 Internal Auth Middleware (0/6)

| Check | Status | Evidence |
|-------|--------|----------|
| AUTH1: Validate internal requests | FAIL | No middleware |
| AUTH2: Service identity validation | FAIL | No JWT tokens |
| AUTH3: Source IP validation | FAIL | No allowlist |
| AUTH4: Rate limiting internal | FAIL | Global only |
| AUTH5: Audit logging internal | FAIL | Not implemented |
| AUTH6: Reject unsigned requests | FAIL | No signature |

---

## 3.4 mTLS/API Key Security (0/6)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC1: mTLS | FAIL | Plain HTTP |
| SEC2: Rotatable API keys | FAIL | No mechanism |
| SEC3: Secrets from secure storage | PARTIAL | DB/Redis only |
| SEC4: No secrets in logs | FAIL | Headers visible |
| SEC5: Service identity verified | FAIL | No crypto verification |
| SEC6: Network segmentation | FAIL | No network policies |

---

## Service-to-Service Call Inventory

| Source | Target | Auth | Issue |
|--------|--------|------|-------|
| wallet.service.ts | blockchain-service | NONE | 🚨 No auth |
| notification.service.ts | notification-service | NONE | 🚨 No auth |
| ticket-lookup.service.ts | event-service | X-Internal-Request | ⚠️ Spoofable |
| fee-distribution.service.ts | payment-service | X-Internal-Request | ⚠️ Spoofable |

---

## Critical Remediations

### P0: Create Internal Auth Middleware
```typescript
const validateInternalRequest = async (request, reply) => {
  const serviceToken = request.headers['x-service-token'];
  
  if (!serviceToken || !jwt.verify(serviceToken, INTERNAL_SECRET)) {
    return reply.status(403).send({ error: 'Invalid service token' });
  }
  
  request.callingService = jwt.decode(serviceToken).service;
};
```

### P0: Add Service Tokens to Outgoing Calls
```typescript
headers: {
  'X-Service-Token': jwt.sign({ service: 'marketplace-service' }, INTERNAL_SECRET),
  'X-Request-ID': request.id,
}
```

### P0: Add Circuit Breaker
```typescript
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(serviceCall, {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});
```

### P1: Create Shared HTTP Client
```typescript
const internalClient = axios.create({
  timeout: 5000,
  headers: { 'X-Service-Token': getServiceToken() }
});

// Add retry interceptor
internalClient.interceptors.response.use(null, retryHandler);
```

### P1: Add Request ID Propagation
```typescript
headers: {
  'X-Request-ID': request.id || uuidv4(),
  'X-Correlation-ID': request.correlationId
}
```

---

## Strengths

- Service URLs from environment variables
- Timeouts configured on axios calls
- Error handling with graceful degradation
- Some response caching implemented

S2S Auth Score: 17/100
