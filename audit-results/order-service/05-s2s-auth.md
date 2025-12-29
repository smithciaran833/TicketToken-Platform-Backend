# Order Service - 05 Service-to-Service Auth Audit

**Service:** order-service
**Document:** 05-service-to-service-auth.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 20% (7/35 checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 3 | All service clients have ZERO auth, Internal auth middleware disabled, Plain HTTP |
| HIGH | 1 | No context propagation |
| MEDIUM | 0 | None |
| LOW | 0 | None |

---

## 5.1 Internal API Authentication (0/8)

| Check | Status | Evidence |
|-------|--------|----------|
| S2S1: Internal endpoints have auth | FAIL | `middleware/index.ts`: internal-auth.middleware COMMENTED OUT |
| S2S2: Service tokens validated | FAIL | No token validation in service clients |
| S2S3: Token expiration checked | FAIL | No tokens used - plain HTTP requests |
| S2S4: Service identity verified | FAIL | No service identity verification |
| S2S5: mTLS configured | FAIL | Plain HTTP: `http://tickettoken-event:3003` |
| S2S6: API keys rotated | FAIL | No API keys configured |
| S2S7: Internal secret exists | PARTIAL | reminder.job.ts uses X-Internal-Secret, clients don't |
| S2S8: Internal routes protected | FAIL | `/internal/*` routes exposed without auth |

**CRITICAL: Event Client - NO Authentication**
```typescript
// services/event.client.ts
const response = await axios.get(`${EVENT_SERVICE_URL}/api/v1/events/${eventId}`);
// NO Authorization header, NO API key, NO service token
```

**CRITICAL: Payment Client - NO Authentication**
```typescript
// services/payment.client.ts
const response = await axios.post(`${PAYMENT_SERVICE_URL}/internal/payment-intents`, data);
// NO Authorization header - calling INTERNAL endpoint without auth!
```

**CRITICAL: Ticket Client - NO Authentication**
```typescript
// services/ticket.client.ts
await axios.post(`${TICKET_SERVICE_URL}/internal/tickets/reserve`, { orderId, items });
// NO Authorization header - calling INTERNAL endpoint without auth!
```

---

## 5.2 Service Client Security (3/8)

| Check | Status | Evidence |
|-------|--------|----------|
| SC1: HTTPS enforced | FAIL | All URLs default to `http://` |
| SC2: Certificate validation | FAIL | No TLS configured |
| SC3: Connection timeouts | PASS | Circuit breakers have timeout: 3000-5000ms |
| SC4: Retry with backoff | PASS | `utils/retry.ts` has exponential backoff |
| SC5: Circuit breaker per service | PASS | Each client method has circuit breaker |
| SC6: URLs from config/env | PASS | `process.env.EVENT_SERVICE_URL || 'http://...'` |
| SC7: Credentials from secrets | FAIL | No credentials being used |
| SC8: Request/response logging | PARTIAL | Error logging exists, no request logging |

---

## 5.3 Outbound Request Security (2/8)

| Check | Status | Evidence |
|-------|--------|----------|
| OR1: Auth headers added | FAIL | No headers in event/payment/ticket clients |
| OR2: Correlation IDs propagated | FAIL | No X-Request-ID forwarded |
| OR3: Tenant context propagated | FAIL | No X-Tenant-ID header |
| OR4: User context propagated | FAIL | No user context forwarded |
| OR5: Request body sanitized | PARTIAL | No explicit sanitization |
| OR6: Response validated | FAIL | Responses used directly |
| OR7: Error responses handled | PASS | Try-catch with logging |
| OR8: Sensitive data not logged | PASS | Only IDs logged |

---

## 5.4 Inbound Internal Security (1/6)

| Check | Status | Evidence |
|-------|--------|----------|
| IR1: Internal routes marked | PASS | Uses `/internal/` prefix |
| IR2: Internal auth middleware | FAIL | Middleware commented out |
| IR3: Request source validated | FAIL | No source validation |
| IR4: Rate limiting internal | PARTIAL | Global rate limit only |
| IR5: Service whitelist | FAIL | No service whitelist |
| IR6: Internal routes not in docs | PARTIAL | No Swagger config found |

---

## 5.5 Secret Management (1/5)

| Check | Status | Evidence |
|-------|--------|----------|
| SM1: Service secrets in env | PARTIAL | INTERNAL_SERVICE_SECRET referenced but not used |
| SM2: Secrets not hardcoded | PASS | No hardcoded secrets |
| SM3: Secrets rotatable | FAIL | No rotation mechanism |
| SM4: Different secrets per env | PARTIAL | Env var based but not enforced |
| SM5: Secrets manager integration | PARTIAL | config/secrets.ts exists, not used in clients |

---

## Only Location Using Internal Auth
```typescript
// jobs/reminder.job.ts lines 142-147
const response = await fetch(`${notificationServiceUrl}/api/v1/notifications`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-Secret': process.env.INTERNAL_SERVICE_SECRET || ''
  },
});
```
This is the ONLY place internal service auth is used!

---

## Critical Remediations

### 1. CRITICAL: Add Auth to All Service Clients
```typescript
const response = await axios.post(url, data, {
  headers: {
    'Authorization': `Bearer ${await this.getServiceToken()}`,
    'X-Service-Name': 'order-service',
    'X-Correlation-ID': correlationId,
    'X-Tenant-ID': tenantId,
  }
});
```

### 2. CRITICAL: Enable Internal Auth Middleware
```typescript
// middleware/index.ts - UNCOMMENT
export * from './internal-auth.middleware';
```

### 3. CRITICAL: Enable HTTPS/mTLS
```typescript
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'https://tickettoken-payment:3006';
```

### 4. HIGH: Create Shared HTTP Client
```typescript
export function createServiceClient(serviceName: string, baseURL: string) {
  const client = axios.create({ baseURL, timeout: 5000 });
  
  client.interceptors.request.use(async (config) => {
    config.headers['Authorization'] = `Bearer ${await getServiceToken()}`;
    config.headers['X-Service-Name'] = 'order-service';
    config.headers['X-Correlation-ID'] = getCorrelationId();
    config.headers['X-Tenant-ID'] = getTenantId();
    return config;
  });
  
  return client;
}
```

---

## Positive Findings

- Circuit breakers on all external calls
- Connection timeouts configured (3-5 seconds)
- Exponential backoff retry utility
- Error logging with context
- Service URLs configurable via environment
