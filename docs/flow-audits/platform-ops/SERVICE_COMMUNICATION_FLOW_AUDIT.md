# SERVICE COMMUNICATION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Service Communication |

---

## Executive Summary

**WORKING - Comprehensive inter-service communication**

| Component | Status |
|-----------|--------|
| Service URL configuration | ✅ Working |
| Service clients (Axios-based) | ✅ Working |
| Circuit breakers (Opossum) | ✅ Working |
| Service discovery | ✅ Working |
| Load balancing | ✅ Working |
| Retry service | ✅ Working |
| Timeout handling | ✅ Working |
| Health checks between services | ✅ Working |
| Docker/K8s service names | ✅ Configured |

**Bottom Line:** Full inter-service communication infrastructure with typed service clients, circuit breakers for fault tolerance, service discovery, load balancing, retry logic, and timeout handling. Supports both Docker Compose (service names) and local development (localhost).

---

## Service URLs

**File:** `backend/services/api-gateway/src/config/services.ts`
```typescript
export const serviceUrls = {
  auth:         'http://auth-service:3001',
  venue:        'http://venue-service:3002',
  event:        'http://event-service:3003',
  ticket:       'http://ticket-service:3004',
  payment:      'http://payment-service:3005',
  marketplace:  'http://marketplace-service:3006',
  analytics:    'http://analytics-service:3007',
  notification: 'http://notification-service:3008',
  integration:  'http://integration-service:3009',
  compliance:   'http://compliance-service:3010',
  queue:        'http://queue-service:3011',
  search:       'http://search-service:3012',
  file:         'http://file-service:3013',
  monitoring:   'http://monitoring-service:3014',
  blockchain:   'http://blockchain-service:3015',
  order:        'http://order-service:3016',
  scanning:     'http://scanning-service:3020',
  minting:      'http://minting-service:3018',
  transfer:     'http://transfer-service:3019',
};
```

All services configurable via environment variables.

---

## Service Clients

### AuthServiceClient

**File:** `backend/services/api-gateway/src/clients/AuthServiceClient.ts`
```typescript
export class AuthServiceClient {
  private httpClient: AxiosInstance;
  
  constructor(server: FastifyInstance) {
    this.httpClient = axios.create({
      baseURL: serviceUrls.auth,
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async validateToken(token: string): Promise<User | null> { ... }
  async healthCheck(): Promise<boolean> { ... }
}
```

### VenueServiceClient

**File:** `backend/services/api-gateway/src/clients/VenueServiceClient.ts`
```typescript
export class VenueServiceClient {
  private httpClient: AxiosInstance;
  
  async getVenue(venueId: string): Promise<Venue | null> { ... }
  async healthCheck(): Promise<boolean> { ... }
}
```

### Error Handling
```typescript
if (axios.isAxiosError(error)) {
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    logger.error({ code: error.code }, 'Service connection error');
  }
  if (error.response?.status === 404) {
    return null;
  }
}
```

---

## Circuit Breakers

**File:** `backend/services/api-gateway/src/services/circuit-breaker.service.ts`

### Configuration
```typescript
const options = {
  timeout: config.circuitBreaker.timeout,           // Request timeout
  errorThresholdPercentage: 50,                     // Open at 50% errors
  resetTimeout: config.circuitBreaker.resetTimeout, // Time before retry
  volumeThreshold: config.circuitBreaker.volumeThreshold,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
};
```

### States

| State | Behavior |
|-------|----------|
| CLOSED | Normal operation |
| OPEN | All requests rejected immediately |
| HALF_OPEN | Testing with limited requests |

### Events
```typescript
breaker.on('open', () => logger.error('Circuit OPENED'));
breaker.on('halfOpen', () => logger.info('Circuit HALF-OPEN'));
breaker.on('close', () => logger.info('Circuit CLOSED'));
breaker.on('failure', (error) => logger.warn('Failure'));
breaker.on('timeout', () => logger.warn('Timeout'));
breaker.on('reject', () => logger.error('Rejected'));
```

### Usage
```typescript
const result = await circuitBreakerService.execute(
  'auth-service',
  async () => authClient.validateToken(token),
  async () => null // Fallback
);
```

---

## Supporting Services

| Service | File | Purpose |
|---------|------|---------|
| Load Balancer | `load-balancer.service.ts` | Distribute load |
| Retry Service | `retry.service.ts` | Retry failed requests |
| Timeout Service | `timeout.service.ts` | Request timeouts |
| Service Discovery | `service-discovery.service.ts` | Find services |
| Aggregator | `aggregator.service.ts` | Combine responses |

---

## Health Check Chain
```
Gateway Health Check
    ↓
Check Redis
    ↓
Check Circuit Breaker States
    ↓
Check auth-service /health
    ↓
Check venue-service /health
    ↓
Report aggregate status
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `api-gateway/src/config/services.ts` | Service URLs |
| `api-gateway/src/clients/*.ts` | Service clients |
| `api-gateway/src/services/circuit-breaker.service.ts` | Circuit breakers |
| `api-gateway/src/services/load-balancer.service.ts` | Load balancing |
| `api-gateway/src/services/retry.service.ts` | Retry logic |
| `api-gateway/src/services/service-discovery.service.ts` | Discovery |

---

## Related Documents

- `SERVICE_HEALTH_MONITORING_FLOW_AUDIT.md` - Health checks
- `RATE_LIMITING_FLOW_AUDIT.md` - Rate limiting
- `ERROR_HANDLING_FLOW_AUDIT.md` - Error handling
