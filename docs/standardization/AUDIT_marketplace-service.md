# Audit Report: marketplace-service Internal Endpoints

**Date:** January 21, 2026
**Auditor:** Claude Code
**Purpose:** Determine if marketplace-service needs /internal/ endpoints

---

## Executive Summary

**Finding:** marketplace-service **CRITICALLY NEEDS** internal endpoints.

Multiple services attempt to call marketplace-service for listing data, escrow status, and payment completion notifications, but **NO /internal/ routes exist**. This is a significant gap that affects:
- Payment processing (payment-service needs escrow/listing data)
- Ticket transfers (transfer-service needs listing status)
- Order processing (order-service needs listing validation)
- Compliance checks (compliance-service needs marketplace data for GDPR exports)

**Priority:** P0 (Critical - blocks inter-service communication)

---

## 1. Services Calling marketplace-service

### 1.1 payment-service (CONFIRMED CALLER)

**Files:**
- `backend/services/payment-service/src/workers/webhook.consumer.ts`
- `backend/services/payment-service/src/webhooks/stripe-handler.ts`
- `backend/services/payment-service/src/utils/http-client.util.ts`

**Endpoints Called:**

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/internal/events` | POST | Notify of payment events (order.completed, payment.failed, refund.processed) | **MISSING** |
| `/webhooks/payment-completed` | POST | Notify of marketplace payment completion | EXISTS |

**Code Evidence:**
```typescript
// webhook.consumer.ts:70-74
const marketplaceUrl = process.env.MARKETPLACE_SERVICE_URL || 'http://marketplace-service:3006';
await axios.post(
  `${marketplaceUrl}/internal/events`,
  { event: 'order.completed', data: payload }
);
```

**Data Needed:**
- Listing details for payment validation
- Escrow status for fund release decisions
- Seller payout destinations

### 1.2 ticket-service (POTENTIAL CALLER)

**Files:**
- `backend/services/ticket-service/src/config/service-auth.ts`

**Configuration:**
- Has `marketplace-service` in `ALLOWED_CALLERS` list
- Has `marketplace-service` in `SERVICE_CREDENTIALS` with rate limits
- Endpoint permissions allow marketplace-service to access ticket endpoints

**Endpoints That Should Exist:**
- `GET /internal/listings/by-ticket/:ticketId` - Check if ticket is listed before transfer

### 1.3 order-service (POTENTIAL CALLER)

**Files:**
- `backend/services/order-service/src/services/refund-notification.service.ts`

**Purpose:**
- Queries `marketplace_transactions` table for seller info on refunds
- Needs marketplace listing data for secondary market purchases

**Endpoints That Should Exist:**
- `GET /internal/listings/:id` - Get listing details for order creation
- `POST /internal/listings/validate` - Validate listing before purchase

### 1.4 compliance-service (DATA CONSUMER)

**Files:**
- `backend/services/compliance-service/src/services/privacy-export.service.ts`

**Purpose:**
- GDPR data exports query `marketplace_listings` table directly
- Should use internal API for proper tenant isolation

**Code Evidence:**
```typescript
// privacy-export.service.ts:199-201
data.listings = await db('marketplace_listings')
  .where({ seller_id: userId })
  .orWhere({ buyer_id: userId })
```

**Endpoints That Should Exist:**
- `GET /internal/users/:userId/listings` - Get user's marketplace activity
- `GET /internal/users/:userId/transactions` - Get user's transactions

### 1.5 blockchain-service (CONFIGURED CALLER)

**Files:**
- `backend/services/blockchain-service/src/config/services.ts`

**Configuration:**
- Has `marketplaceService` URL configured (port 3009)
- Likely needs listing data for on-chain verification

### 1.6 api-gateway (PROXY)

**Files:**
- `backend/services/api-gateway/src/config/services.ts`

**Configuration:**
- Routes marketplace traffic to port 3006

---

## 2. Queue Messages FROM marketplace-service

### 2.1 Event Bus Implementation

**File:** `backend/services/marketplace-service/src/events/event-bus.ts`

**Event Types Published:**

| Event | Consumers | Delivery |
|-------|-----------|----------|
| `listing.created` | analytics, search, compliance | Redis Pub/Sub |
| `listing.updated` | analytics, search | Redis Pub/Sub |
| `listing.cancelled` | ticket, analytics | Redis Pub/Sub |
| `listing.expired` | analytics | Redis Pub/Sub |
| `listing.sold` | payment, ticket, order | Redis Pub/Sub |
| `purchase.initiated` | analytics | Redis Pub/Sub |
| `purchase.completed` | analytics, notification | Redis Pub/Sub |
| `purchase.failed` | analytics, notification | Redis Pub/Sub |
| `transfer.started` | analytics | Redis Pub/Sub |
| `transfer.completed` | analytics, notification | Redis Pub/Sub |
| `transfer.failed` | analytics, notification | Redis Pub/Sub |
| `refund.initiated` | analytics | Redis Pub/Sub |
| `refund.completed` | analytics, payment | Redis Pub/Sub |
| `dispute.opened` | analytics, notification | Redis Pub/Sub |
| `dispute.resolved` | analytics, notification | Redis Pub/Sub |

### 2.2 HTTP vs Queue Analysis

| Operation | Current | Recommended | Reason |
|-----------|---------|-------------|--------|
| Payment completion → listing sold | Webhook (HTTP) | HTTP (sync) | Immediate response needed |
| Escrow status check | None | HTTP (sync) | Real-time validation needed |
| Listing details for order | None | HTTP (sync) | Order creation needs immediate data |
| Listing analytics | Queue | Queue | Fire-and-forget, no response needed |
| Notification triggers | Queue | Queue | Async delivery acceptable |

---

## 3. Current /internal/ Routes

**Finding: NONE**

The marketplace-service has **NO** `/internal/` routes defined.

**Files Checked:**
- `src/routes/index.ts` - No internal route registration
- `src/routes/*.ts` - All public-facing routes only

**Current Route Structure:**

| Prefix | Purpose | Auth |
|--------|---------|------|
| `/health` | Health checks | None |
| `/listings` | Public listing API | JWT |
| `/transfers` | Public transfer API | JWT |
| `/venues` | Venue marketplace data | JWT |
| `/search` | Listing search | JWT |
| `/admin` | Admin operations | JWT + Admin |
| `/disputes` | Dispute handling | JWT |
| `/tax` | Tax reporting | JWT |
| `/seller` | Seller onboarding | JWT |
| `/webhooks` | External webhooks | Stripe/HMAC |
| `/stats` | Statistics | JWT |
| `/cache/*` | Cache management | JWT + Admin |

---

## 4. Missing Endpoints

### 4.1 CRITICAL (P0) - Blocks Service Communication

| Endpoint | Method | Purpose | Callers |
|----------|--------|---------|---------|
| `GET /internal/listings/:id` | GET | Get full listing details | order-service, payment-service |
| `GET /internal/listings/by-ticket/:ticketId` | GET | Find listing for a ticket | ticket-service, transfer-service |
| `POST /internal/listings/validate` | POST | Validate listing before purchase | order-service |
| `GET /internal/escrow/:transferId` | GET | Get escrow status | payment-service |
| `POST /internal/escrow/release` | POST | Release escrow funds | payment-service |
| `POST /internal/events` | POST | Receive payment/order events | payment-service |

### 4.2 HIGH (P1) - Improves Data Isolation

| Endpoint | Method | Purpose | Callers |
|----------|--------|---------|---------|
| `GET /internal/users/:userId/listings` | GET | User's listings for GDPR | compliance-service |
| `GET /internal/users/:userId/transactions` | GET | User's transactions for GDPR | compliance-service |
| `GET /internal/sellers/:sellerId/status` | GET | Seller onboarding status | payment-service |
| `GET /internal/transfers/:id` | GET | Transfer details | order-service |

### 4.3 MEDIUM (P2) - Analytics/Monitoring

| Endpoint | Method | Purpose | Callers |
|----------|--------|---------|---------|
| `GET /internal/stats/summary` | GET | Marketplace statistics | analytics-service |
| `GET /internal/listings/active-count` | GET | Active listing count | monitoring-service |
| `GET /internal/escrow/pending` | GET | Pending escrows | monitoring-service |

---

## 5. Recommendations

### 5.1 Immediate Actions (P0)

**1. Create `/internal/` route file:**
```typescript
// src/routes/internal.routes.ts
import { FastifyInstance } from 'fastify';
import { validateInternalRequest } from '../middleware/internal-auth';

export default async function internalRoutes(fastify: FastifyInstance) {
  // All internal routes require HMAC authentication
  fastify.addHook('preHandler', validateInternalRequest);

  // Listing endpoints
  fastify.get('/listings/:id', getListingInternal);
  fastify.get('/listings/by-ticket/:ticketId', getListingByTicket);
  fastify.post('/listings/validate', validateListing);

  // Escrow endpoints
  fastify.get('/escrow/:transferId', getEscrowStatus);
  fastify.post('/escrow/release', releaseEscrow);

  // Event receiver
  fastify.post('/events', handleInternalEvent);
}
```

**2. Register internal routes in app:**
```typescript
// In src/routes/index.ts
import internalRoutes from './internal.routes';

await fastify.register(internalRoutes, { prefix: '/internal' });
```

**3. Implement HMAC authentication:**
- The `validateInternalRequest` middleware already exists
- Ensure all internal routes use it

### 5.2 Effort Estimation

| Task | Effort | Dependencies |
|------|--------|--------------|
| Create internal routes file | 2 hours | None |
| Implement P0 endpoints | 4 hours | Route file |
| Add HMAC to payment-service webhook calls | 2 hours | None |
| Test inter-service communication | 4 hours | All above |
| **Total P0 Effort** | **~12 hours** | |

### 5.3 Impact Assessment

**If NOT Implemented:**
- payment-service webhook calls to `/internal/events` will 404
- order-service cannot validate listings before purchase
- transfer-service cannot check if tickets are listed
- compliance-service bypasses RLS by querying DB directly
- No proper tenant isolation for marketplace data queries

**Security Risk:** MEDIUM
- Direct DB queries bypass row-level security
- Missing authentication on internal calls

---

## 6. Related Findings

### 6.1 Outgoing HTTP Client Gaps

marketplace-service makes outgoing calls WITHOUT proper HMAC:

**ticket-lookup.service.ts:**
```typescript
// Uses simple headers instead of HMAC
headers: {
  'X-Service-Name': 'marketplace-service',
  'X-Internal-Request': 'true'
}
```

**Should use:**
```typescript
const headers = buildInternalHeaders(body, requestId);
```

### 6.2 RabbitMQ Stubbed

The RabbitMQ integration is simulated (logged only):
```typescript
// From config/rabbitmq.ts - Line 437
logger.debug(`Published to ${exchange}/${routingKey}:`, message);
// Real publish is commented out
```

---

## Summary

| Category | Status | Action Required |
|----------|--------|-----------------|
| Services calling marketplace | 5+ services | High demand for internal endpoints |
| Current /internal/ routes | **NONE** | Create immediately |
| Missing critical endpoints | 6 | P0 priority |
| Missing high-priority endpoints | 4 | P1 priority |
| Estimated effort | 12 hours | Week 1 |
| Security impact | MEDIUM | DB queries bypass RLS |

**Recommendation:** Create `/internal/` routes as P0 priority. This is blocking proper inter-service communication and creates security gaps with direct DB queries.

---

## Appendix: Service URL Configuration

| Service | Environment Variable | Default Port |
|---------|---------------------|--------------|
| api-gateway | `MARKETPLACE_SERVICE_URL` | 3006 |
| blockchain-service | `MARKETPLACE_SERVICE_URL` | 3009 |
| payment-service | `MARKETPLACE_SERVICE_URL` | 3006/3004 (inconsistent) |

**Note:** Port inconsistency between services - api-gateway uses 3006, blockchain-service uses 3009.
