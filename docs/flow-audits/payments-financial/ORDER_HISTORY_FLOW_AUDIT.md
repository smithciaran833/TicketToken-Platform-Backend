# ORDER HISTORY FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Order History (View Past Purchases) |

---

## Executive Summary

**FRAGMENTED IMPLEMENTATION - Two services, neither routed through gateway**

| Component | Status |
|-----------|--------|
| order-service exists | ✅ Complete |
| order-service list orders | ✅ Implemented |
| order-service get order details | ✅ Implemented |
| order-service refund history | ✅ Implemented |
| order-service modifications | ✅ Implemented |
| order-service auth middleware | ❌ STUB (not implemented) |
| order-service API gateway route | ❌ NOT ROUTED |
| ticket-service orders controller | ⚠️ Duplicate/simpler |
| ticket-service /orders route | ❌ NOT ROUTED via gateway |
| Consistent response format | ❌ Different formats |
| Ownership validation | ✅ Both check |
| Tenant isolation | ✅ Both implement |
| Audit logging | ✅ order-service only |
| Idempotency | ✅ order-service only |

**Bottom Line:** There's a full-featured order-service (port 3016) that's completely inaccessible through the API gateway. There's also a simpler duplicate in ticket-service that's also not routed. Users currently cannot view their order history through the gateway.

---

## Architecture Overview

### Expected Flow
```
┌─────────────────────────────────────────────────────────────┐
│                  ORDER HISTORY FLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   User Request ──> API Gateway ──> Order Service             │
│                         │                                    │
│                         ▼                                    │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Authenticate user                               │   │
│   │  2. Set tenant context                              │   │
│   │  3. Query orders for user                           │   │
│   │  4. Include order items, event details              │   │
│   │  5. Return paginated results                        │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Actual Flow (Broken)
```
┌─────────────────────────────────────────────────────────────┐
│              ACTUAL IMPLEMENTATION (FRAGMENTED)              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ORDER-SERVICE (Port 3016) - Full Featured                 │
│   ├── GET /orders              - List orders                │
│   ├── GET /orders/:id          - Order details              │
│   ├── GET /orders/:id/events   - Order events               │
│   ├── GET /orders/:id/refunds  - Refund history             │
│   ├── POST /orders/:id/refund  - Process refund             │
│   ├── Auth middleware          - ❌ STUB (TODO comment)     │
│   └── API Gateway              - ❌ NOT CONFIGURED          │
│                                                              │
│   TICKET-SERVICE (Port 3004) - Simpler Duplicate            │
│   ├── GET /orders              - List orders                │
│   ├── GET /orders/:id          - Order details              │
│   ├── GET /orders/tickets      - User tickets               │
│   ├── Auth middleware          - ✅ Working                 │
│   └── API Gateway              - ❌ NOT CONFIGURED          │
│                                                              │
│   API GATEWAY                                                │
│   ├── /api/v1/orders           - ❌ NO ROUTE EXISTS         │
│   └── order-service URL        - ✅ Configured but unused   │
│                                                              │
│   RESULT: Users cannot access order history via gateway!    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## What Exists

### 1. Order Service (Full Featured but Inaccessible)

**Location:** `backend/services/order-service/`

**Routes:** `backend/services/order-service/src/routes/order.routes.ts`

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/` | GET | List user's orders | ✅ Implemented |
| `/:orderId` | GET | Get order details | ✅ Implemented |
| `/` | POST | Create order | ✅ Implemented |
| `/:orderId/reserve` | POST | Reserve order | ✅ Implemented |
| `/:orderId/cancel` | POST | Cancel order | ✅ Implemented |
| `/:orderId/refund` | POST | Full refund | ✅ Implemented |
| `/:orderId/refund/partial` | POST | Partial refund | ✅ Implemented |
| `/:orderId/refunds` | GET | Refund history | ✅ Implemented |
| `/:orderId/refunds/:refundId` | GET | Refund details | ✅ Implemented |
| `/:orderId/events` | GET | Order events/timeline | ✅ Implemented |
| `/:orderId/modifications` | GET | Modification history | ✅ Implemented |
| `/:orderId/modifications` | POST | Request modification | ✅ Implemented |
| `/:orderId/upgrade` | POST | Upgrade item | ✅ Implemented |

**Controller:** `backend/services/order-service/src/controllers/order.controller.ts`
```typescript
async listOrders(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = request.user?.id;
    const tenantId = request.tenant.tenantId;

    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant ID required' });
    }

    const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };

    const orders = await this.orderService.getUserOrders(userId, tenantId, limit, offset);

    reply.send({
      orders,
      pagination: {
        limit,
        offset,
        total: orders.length,
      },
    });
  } catch (error) {
    logger.error('Error in listOrders controller', { error });
    reply.status(500).send({ error: 'Failed to list orders' });
  }
}
```

**Features:**
- ✅ Pagination (limit/offset)
- ✅ Tenant isolation
- ✅ Ownership validation
- ✅ Audit logging
- ✅ Idempotency on write operations
- ✅ Rate limiting

### 2. Auth Middleware is a STUB

**File:** `backend/services/order-service/src/routes/order.routes.ts`
```typescript
// Stub authenticate middleware (not implemented)
const authenticate = async (request: any, reply: any) => {
  // TODO: Implement authentication
};
```

**Impact:** Even if order-service was routed, authentication would not work.

### 3. Ticket Service Duplicate (Simpler)

**Location:** `backend/services/ticket-service/src/controllers/orders.controller.ts`

**Routes:** `backend/services/ticket-service/src/routes/orders.routes.ts`
```typescript
fastify.get('/', {
  preHandler: [rateLimiters.read, authMiddleware]
}, (request, reply) => ordersController.getUserOrders(request, reply));

fastify.get('/tickets', {
  preHandler: [rateLimiters.read, authMiddleware]
}, (request, reply) => ordersController.getUserTickets(request, reply));

fastify.get('/:orderId', {
  preHandler: [rateLimiters.read, authMiddleware]
}, (request, reply) => ordersController.getOrderById(request, reply));
```

**Features:**
- ✅ Auth middleware works
- ✅ Rate limiting
- ✅ Tenant isolation
- ❌ No refund history
- ❌ No order events
- ❌ No modifications
- ❌ No audit logging

### 4. API Gateway Configuration

**File:** `backend/services/api-gateway/src/config/services.ts`
```typescript
order: getServiceUrl('ORDER_SERVICE_URL', 'order-service', 3016),
```

**File:** `backend/services/api-gateway/src/routes/index.ts`
```typescript
// NO order routes registered!
await server.register(ticketsRoutes, { prefix: '/tickets' });
await server.register(paymentRoutes, { prefix: '/payments' });
// Missing: await server.register(orderRoutes, { prefix: '/orders' });
```

---

## Comparison: Two Implementations

| Feature | order-service | ticket-service/orders |
|---------|--------------|----------------------|
| List orders | ✅ | ✅ |
| Get order by ID | ✅ | ✅ |
| Order items | ✅ | ✅ |
| Refund history | ✅ | ❌ |
| Order events | ✅ | ❌ |
| Modifications | ✅ | ❌ |
| Upgrades | ✅ | ❌ |
| Partial refunds | ✅ | ❌ |
| Auth middleware | ❌ STUB | ✅ Working |
| Audit logging | ✅ | ❌ |
| Idempotency | ✅ | ❌ |
| Gateway routed | ❌ | ❌ |
| Response format | `{ orders, pagination }` | `{ orders, pagination }` |

---

## Response Formats

### order-service
```json
{
  "orders": [
    {
      "id": "uuid",
      "orderNumber": "ORD-123",
      "status": "completed",
      "totalCents": 5000,
      "currency": "USD",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

### ticket-service
```json
{
  "orders": [
    {
      "orderId": "uuid",
      "status": "completed",
      "eventName": "Concert",
      "eventId": "uuid",
      "totalCents": 5000,
      "totalFormatted": "$50.00",
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 1
  }
}
```

**Differences:**
- `id` vs `orderId`
- order-service has `orderNumber`, `currency`
- ticket-service has `eventName`, `totalFormatted`

---

## Files Involved

### order-service
| File | Purpose |
|------|---------|
| `order-service/src/routes/order.routes.ts` | Route definitions |
| `order-service/src/controllers/order.controller.ts` | Controller |
| `order-service/src/services/order.service.ts` | Business logic |
| `order-service/src/services/partial-refund.service.ts` | Partial refunds |
| `order-service/src/services/order-modification.service.ts` | Modifications |

### ticket-service
| File | Purpose |
|------|---------|
| `ticket-service/src/routes/orders.routes.ts` | Route definitions |
| `ticket-service/src/controllers/orders.controller.ts` | Controller |

### api-gateway
| File | Purpose |
|------|---------|
| `api-gateway/src/config/services.ts` | Service URLs (order configured) |
| `api-gateway/src/routes/index.ts` | Route registration (order missing) |

---

## Recommendations

### P0 - Critical (Users Can't View Orders)

| Issue | Fix | Effort |
|-------|-----|--------|
| No gateway route for orders | Create `orders.routes.ts` in api-gateway and register it | 0.5 day |
| order-service auth is stub | Implement proper auth middleware (copy from other services) | 0.5 day |

**Quick Fix Option:** Route `/api/v1/orders` to ticket-service's `/api/v1/orders` since it has working auth:
```typescript
// api-gateway/src/routes/orders.routes.ts
import { FastifyInstance } from 'fastify';
import { createAuthenticatedProxy } from './authenticated-proxy';
import { serviceUrls } from '../config/services';

export default async function ordersRoutes(server: FastifyInstance) {
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.ticket}/api/v1/orders`,
    serviceName: 'ticket',
    publicPaths: []
  });
  return authenticatedRoutes(server);
}
```

Then register in index.ts:
```typescript
import ordersRoutes from './orders.routes';
// ...
await server.register(ordersRoutes, { prefix: '/orders' });
```

### P1 - Consolidation

| Issue | Fix | Effort |
|-------|-----|--------|
| Two implementations | Decide on order-service as source of truth | 1 day |
| Fix order-service auth | Copy auth middleware from ticket-service | 0.5 day |
| Route to order-service | Update gateway to point to order-service | 0.5 day |
| Deprecate ticket-service orders | Remove duplicate controller | 0.5 day |

### P2 - Enhancements

| Issue | Fix | Effort |
|-------|-----|--------|
| Inconsistent response format | Standardize field names | 1 day |
| Missing event details in order-service | Add event name/date joins | 0.5 day |
| No total count for pagination | Add COUNT query for proper pagination | 0.5 day |

---

## Decision Required

**Which service should own orders?**

| Option | Pros | Cons |
|--------|------|------|
| order-service | Full featured, audit logging, idempotency | Auth not implemented, needs work |
| ticket-service | Auth works, simpler | Missing refunds, events, modifications |

**Recommendation:** Use order-service as the canonical source, fix its auth, and route through gateway. It has the complete feature set needed for a production system.

---

## Related Documents

- `VIEW_MY_TICKETS_FLOW_AUDIT.md` - Related ticket viewing
- `REFUND_CANCELLATION_FLOW_AUDIT.md` - Refund processing
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Order creation
