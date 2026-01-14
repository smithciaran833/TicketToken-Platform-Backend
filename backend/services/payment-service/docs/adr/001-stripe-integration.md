# ADR-001: Stripe Payment Integration Architecture

**MEDIUM FIX: DOC-1 - Create Architecture Decision Records (ADRs)**

## Status
Accepted

## Date
2026-01-01

## Context

The TicketToken platform requires a payment processing system to handle:
- Primary ticket purchases with Stripe Payment Intents
- Platform fee collection (2.5% + $0.30)
- Stripe Connect for venue payouts
- Multi-currency support
- PCI-DSS compliance
- Refund processing
- Dispute handling

## Decision

We chose **Stripe** as our payment provider with the following architecture:

### 1. Payment Intent API (SCA-Ready)
- Use Payment Intents instead of Charges for SCA compliance
- Support 3D Secure 2.0 for European customers
- Client-side confirmation with `stripe.js`

### 2. Stripe Connect (Express)
- Venues onboard via Express accounts
- Automatic payout scheduling (configurable per venue)
- Application fee collection using `transfer_data`

### 3. Fee Structure
```
Primary Payment Flow:
  Customer pays: $100.00
  Stripe fee: $2.90 + $0.30 = $3.20
  Platform fee: $2.50 (2.5%)
  Venue receives: $94.30

Refund Flow (Customer-Initiated):
  Platform absorbs Stripe fee
  Venue receives full refund amount adjustment
```

### 4. Idempotency
- All API calls include idempotency keys
- Keys generated from: `{operation}-{orderId}-{timestamp}`
- Prevents duplicate charges on retry

### 5. Webhook Processing
- Async processing via job queue
- Signature verification with timing-safe comparison
- Event deduplication with `processed_events` table

## Alternatives Considered

### PayPal
- Pros: Widely recognized, buyer protection
- Cons: Higher fees, less developer-friendly, no built-in marketplace support

### Adyen
- Pros: Enterprise-grade, good fraud detection
- Cons: Higher minimum volumes, complex integration, longer onboarding

### Square
- Pros: Good for in-person payments
- Cons: Limited marketplace features, US-focused

## Consequences

### Positive
- Strong developer experience and documentation
- Built-in SCA/3DS support
- Native marketplace support with Connect
- Comprehensive webhook events
- PCI-DSS Level 1 certified

### Negative
- Vendor lock-in for payment processing
- International fees can be complex
- Connect payout timing not fully controllable
- Limited support for certain payment methods

## Security Considerations

1. **PCI-DSS Compliance**: Card data never touches our servers (tokenization)
2. **Webhook Verification**: HMAC signature with timing-safe comparison
3. **API Key Management**: Keys stored in secrets manager, rotated quarterly
4. **Rate Limiting**: Applied to all payment endpoints

## References

- [Stripe Payment Intents API](https://stripe.com/docs/payments/payment-intents)
- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [PCI-DSS Guidelines](https://www.pcisecuritystandards.org/)

---

# ADR-002: Multi-Tenant Data Isolation

## Status
Accepted

## Date
2026-01-01

## Context

TicketToken is a multi-tenant SaaS platform where:
- Multiple venues (tenants) share the same infrastructure
- Tenant data must be completely isolated
- Cross-tenant data access must be prevented at all levels

## Decision

We implement a **Row-Level Security (RLS)** approach with PostgreSQL:

### 1. Database Level
```sql
-- All tables include tenant_id
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  ...
);

-- RLS policy
CREATE POLICY tenant_isolation ON payments
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
```

### 2. Application Level
- Middleware sets `app.current_tenant_id` on every database connection
- Tenant ID extracted from JWT and validated
- API endpoints validate tenant context before processing

### 3. Service-to-Service
- Internal calls include tenant context in headers
- Background jobs carry tenant context through job metadata

## Alternatives Considered

### Database-per-Tenant
- Pros: Complete isolation, simpler scaling
- Cons: Higher cost, complex migrations, connection overhead

### Schema-per-Tenant
- Pros: Good isolation, shared resources
- Cons: Complex schema management, cross-schema queries difficult

### Application-Level Filtering
- Pros: Simple to implement
- Cons: Bug-prone, no database-level enforcement

## Consequences

### Positive
- Strong isolation enforced at database level
- Single database schema for easy migrations
- Cost-effective resource sharing
- Query optimization across tenants

### Negative
- Must ensure every query includes tenant context
- Bypass mode needed for admin operations
- Index design must consider tenant_id

## Security Controls

1. **Bypass Mode**: Only available to authenticated service accounts
2. **Audit Logging**: All bypass operations logged
3. **Connection Pooling**: Each connection properly scoped to tenant

---

# ADR-003: Error Handling Strategy

## Status
Accepted

## Date
2026-01-01

## Context

Consistent error handling is critical for:
- Developer experience (predictable API responses)
- Security (not leaking internal details)
- Debugging (meaningful error information)
- Compliance (proper error logging)

## Decision

We adopt **RFC 7807 Problem Details** for all API errors:

### Error Response Format
```json
{
  "type": "https://api.tickettoken.com/errors/payment-failed",
  "title": "Payment Failed",
  "status": 402,
  "detail": "Card declined due to insufficient funds",
  "instance": "/api/v1/payments/pi_xxx",
  "errorCode": "CARD_DECLINED",
  "correlationId": "req-uuid-xxx",
  "errors": [
    {
      "field": "amount",
      "code": "invalid_amount",
      "message": "Amount exceeds limit"
    }
  ]
}
```

### Error Classification
| Category | HTTP Status | Retry | Log Level |
|----------|-------------|-------|-----------|
| Validation | 400 | No | warn |
| Authentication | 401 | No | warn |
| Authorization | 403 | No | warn |
| Not Found | 404 | No | debug |
| Conflict | 409 | Maybe | warn |
| Rate Limit | 429 | Yes | info |
| Server Error | 500 | Yes | error |
| External Service | 503 | Yes | error |

### Error Wrapping
- External errors (Stripe, database) wrapped in application errors
- Original error context preserved for logging
- User-friendly messages for client responses

## Consequences

### Positive
- Consistent API contract
- Easy client-side error handling
- Good debugging with correlation IDs
- Security through information hiding

### Negative
- Need to wrap all external errors
- Must maintain error type catalog
- Translation required for multi-language support

---

# ADR-004: Circuit Breaker Pattern

## Status
Accepted

## Date
2026-01-01

## Context

Payment service depends on external services:
- Stripe API for payments
- PostgreSQL for data
- Redis for caching
- Other internal services

External service failures should not cascade.

## Decision

Implement **Circuit Breaker** pattern for all external calls:

### States
1. **Closed**: Normal operation, requests pass through
2. **Open**: Failures exceeded threshold, requests fail fast
3. **Half-Open**: Testing if service recovered

### Configuration
```typescript
const circuitBreakerConfig = {
  failureThreshold: 5,        // Failures before opening
  successThreshold: 3,        // Successes to close from half-open
  timeout: 30000,             // Time in open state before half-open
  resetTimeout: 60000,        // Full reset timeout
};
```

### Per-Service Settings
| Service | Failure Threshold | Timeout | Fallback |
|---------|------------------|---------|----------|
| Stripe | 5 | 30s | Queue for retry |
| Database | 3 | 10s | Return cached data |
| Redis | 10 | 5s | Use in-memory cache |

## Consequences

### Positive
- Fail fast for unavailable services
- Prevents cascade failures
- Auto-recovery when service returns
- Preserves system resources

### Negative
- Added complexity
- False positives during partial outages
- Need careful threshold tuning

---

# ADR-005: Webhook Processing Architecture

## Status
Accepted

## Date
2026-01-01

## Context

Stripe sends webhooks for:
- Payment confirmations
- Refund completions
- Dispute notifications
- Account updates

Webhook processing must be:
- Reliable (no missed events)
- Idempotent (handle duplicates)
- Fast (return 200 quickly)
- Secure (verify signatures)

## Decision

Implement **async webhook processing** with a job queue:

### Flow
```
Stripe → Webhook Endpoint → Signature Verify → Dedup Check → Enqueue Job → Return 200
                                                                    ↓
                                              Job Worker → Process Event → Update DB
```

### Components
1. **Webhook Endpoint**: Sync signature verification, async processing
2. **Event Table**: Track processed events for deduplication
3. **Job Queue**: BullMQ with Redis backend
4. **Dead Letter Queue**: Failed events for manual review

### Retry Strategy
- Exponential backoff: 1s, 5s, 30s, 5m
- Max attempts: 5
- DLQ after final failure

## Consequences

### Positive
- Fast webhook response (Stripe timeout prevention)
- Reliable event processing
- Automatic retries
- Audit trail of all events

### Negative
- Eventual consistency (processing delay)
- Need job queue infrastructure
- Complex failure handling

---

# ADR-006: Logging and Observability Strategy

## Status
Accepted

## Date
2026-01-01

## Context

Payment service requires comprehensive observability for:
- Debugging issues
- Security auditing
- Performance monitoring
- Compliance (PCI-DSS)

## Decision

Implement **structured logging** with **OpenTelemetry** for distributed tracing:

### Logging
- **Framework**: Pino (async, JSON-structured)
- **Levels**: trace, debug, info, warn, error, fatal
- **Context**: correlation ID, tenant ID, user ID, span ID
- **Redaction**: PCI-DSS compliant field masking

### Metrics
- **Framework**: Prometheus (prom-client)
- **Metrics**: Counters, histograms, gauges
- **Cardinality Control**: Path normalization, limited labels

### Tracing
- **Framework**: OpenTelemetry
- **Exporter**: OTLP to Jaeger/Tempo
- **Propagation**: W3C Trace Context

### Sensitive Data Handling
```
NEVER LOG:
- Card numbers (PAN)
- CVV/CVC
- API keys
- Passwords

MASK:
- Email addresses
- Phone numbers
- Account numbers
```

## Consequences

### Positive
- End-to-end request tracing
- Correlation across services
- PCI-DSS compliance
- Performance insights

### Negative
- Storage costs for logs
- Performance overhead (minimal with async)
- Complex log aggregation setup

---

**Document History**
- 2026-01-01: Initial ADRs created (DOC-1 fix)
