# Cross-Service Dependencies

This document describes the external service dependencies for ticket-service and how they are used.

## Overview

The ticket-service follows a strict service boundary pattern where it:
- **Owns**: tickets, ticket_types, ticket_transfers, reservations, ticket_scans tables
- **Does NOT own**: orders, events, users, venues tables

For data not owned by ticket-service, we use HTTP service clients from `@tickettoken/shared`.

## Service Clients Used

### 1. OrderServiceClient

**Location**: `@tickettoken/shared` (re-exported from `src/clients/index.ts`)

**Base URL**: `ORDER_SERVICE_URL` (default: `http://order-service:3003`)

**Used by**:
- `src/controllers/orders.controller.ts` - Fetch user orders
- `src/controllers/purchaseController.ts` - Confirm/cancel reservations
- `src/sagas/PurchaseSaga.ts` - Create orders during purchase flow

**Methods used**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `getOrder(orderId, ctx)` | `GET /internal/orders/:id` | Get order details |
| `getOrderItems(orderId, ctx)` | `GET /internal/orders/:id/items` | Get order line items |
| `getUserOrders(userId, options, ctx)` | `GET /internal/orders/user/:userId` | List user's orders |
| `createOrder(request, ctx)` | `POST /internal/orders` | Create new order |
| `cancelOrder(orderId, reason, ctx)` | `POST /internal/orders/:id/cancel` | Cancel order |
| `updateOrderStatus(orderId, status, ctx)` | `PATCH /internal/orders/:id/status` | Update order status |

### 2. EventServiceClient

**Location**: `@tickettoken/shared`

**Base URL**: `EVENT_SERVICE_URL` (default: `http://event-service:3002`)

**Used by**:
- `src/services/transferService.ts` - Fetch event transfer restrictions

**Methods used**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `getEventTransferRestrictions(eventId, ctx)` | `GET /internal/events/:id/transfer-restrictions` | Get event's transfer policy |

### 3. AuthServiceClient

**Location**: `@tickettoken/shared`

**Base URL**: `AUTH_SERVICE_URL` (default: `http://auth-service:3001`)

**Used by**:
- `src/services/transferService.ts` - Verify user eligibility for transfers

**Methods used**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `getUserBasicInfo(userId, ctx)` | `GET /internal/users/:id/basic` | Get user info (name, email, verified status) |
| `getUserTransferEligibility(userId, ctx)` | `GET /internal/users/:id/transfer-eligibility` | Check if user can receive transfers |

### 4. MintingServiceClient

**Location**: `@tickettoken/shared` (re-exported from `src/clients/index.ts`)

**Base URL**: `MINTING_SERVICE_URL` (default: `http://minting-service:3010`)

**Used by**:
- NFT minting workflows (if enabled)

## Request Context

All service client calls require a `RequestContext` object:

```typescript
import { createRequestContext } from '@tickettoken/shared';

const ctx = createRequestContext({
  tenantId: 'tenant-uuid',
  userId: 'user-uuid',
  traceId: 'optional-trace-id',
});
```

The context provides:
- Tenant isolation via `x-tenant-id` header
- User context via `x-user-id` header
- Distributed tracing via `traceparent` header
- HMAC authentication via `x-internal-signature` header

## Authentication

Service-to-service calls use HMAC-SHA256 authentication:

- **Secret**: `INTERNAL_HMAC_SECRET` environment variable
- **Headers**: `x-internal-service`, `x-internal-signature`, `x-internal-timestamp`, `x-internal-nonce`
- **Replay prevention**: 60-second window, nonce tracking

## Error Handling

Service client errors extend `ServiceClientError`:

```typescript
try {
  const order = await orderServiceClient.getOrder(orderId, ctx);
} catch (error) {
  if (error.statusCode === 404) {
    // Order not found
  } else if (error.statusCode === 503) {
    // Service unavailable (circuit breaker open)
  }
}
```

## Circuit Breaker

All service clients use circuit breakers with:
- **Failure threshold**: 5 failures
- **Reset timeout**: 30 seconds
- **Half-open recovery**: 2 successful calls to close

## Fallback Behavior

When external services are unavailable:

1. **Orders**: Return 503 Service Unavailable
2. **Events**: Cache transfer restrictions, fallback to permissive defaults in non-critical paths
3. **Auth**: Fail transfer validation (security-first approach)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ORDER_SERVICE_URL` | `http://order-service:3003` | Order service base URL |
| `EVENT_SERVICE_URL` | `http://event-service:3002` | Event service base URL |
| `AUTH_SERVICE_URL` | `http://auth-service:3001` | Auth service base URL |
| `MINTING_SERVICE_URL` | `http://minting-service:3010` | Minting service base URL |
| `INTERNAL_HMAC_SECRET` | - | Shared secret for S2S authentication |
| `SERVICE_CLIENT_TIMEOUT` | `10000` | Request timeout in ms |

## Data Flow Diagrams

### Purchase Flow

```
User -> ticket-service -> order-service (create order)
                       -> ticket-service DB (create tickets)
                       -> queue (publish events)
```

### Transfer Flow

```
User -> ticket-service -> event-service (check restrictions)
                       -> auth-service (verify users)
                       -> ticket-service DB (update ownership)
                       -> queue (publish events)
```

### Order Retrieval

```
User -> ticket-service -> order-service (get order)
                       -> ticket-service DB (get tickets for order)
```

## Best Practices

1. **Always use createRequestContext**: Ensures proper tenant isolation and tracing
2. **Handle 404 separately**: Don't expose internal service structure in error messages
3. **Log service client errors**: Include statusCode and response for debugging
4. **Don't retry on 4xx**: Only retry on 5xx or network errors
5. **Cache where appropriate**: Event restrictions rarely change, cache for 5 minutes
