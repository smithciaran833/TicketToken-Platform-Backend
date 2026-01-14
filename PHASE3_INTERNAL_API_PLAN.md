# Phase 3: Internal API Plan

**Generated:** 2026-01-12  
**Purpose:** Document existing internal APIs and plan new endpoints to eliminate service database bypasses

---

## Executive Summary

Phase 3 addresses 22+ database bypass violations identified in `SERVICE_BYPASS_ANALYSIS.md` by creating internal APIs so services communicate through proper service boundaries instead of directly querying other services' databases.

### Key Findings

| Service | Existing Internal Routes | Existing Middleware | Existing Service Methods | New Endpoints Needed |
|---------|-------------------------|---------------------|-------------------------|---------------------|
| **ticket-service** | 3 endpoints | `verifyInternalService` (HMAC) | Many reusable | **4 new endpoints** |
| **auth-service** | 4 endpoints | `verifyServiceToken` (S2S JWT) | Many reusable | **3 new endpoints** |
| **order-service** | 0 endpoints | None | Many reusable | **2 new endpoints** |
| **event-service** | 0 endpoints | None | Has EventService | **1 extension** |
| **venue-service** | 1 endpoint | HMAC signature | Has VenueService | **1 extension** |

---

## 1. ticket-service

### 1.1 Existing Internal Routes

**File:** `./backend/services/ticket-service/src/routes/internalRoutes.ts`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/internal/tickets/:ticketId/status` | GET | Get ticket status for refund eligibility |
| `/internal/tickets/cancel-batch` | POST | Cancel tickets in batch (for refunds) |
| `/internal/tickets/calculate-price` | POST | Calculate total price for tickets |

### 1.2 Existing Middleware

**File:** `./backend/services/ticket-service/src/routes/internalRoutes.ts`

```typescript
async function verifyInternalService(request, reply): Promise<void>
```

**What it does:**
- Validates `x-internal-service` header (service name)
- Validates `x-internal-timestamp` header (within 5 minute window)
- Validates `x-internal-signature` header (HMAC-SHA256 signature)
- Uses `INTERNAL_SERVICE_SECRET` environment variable
- Accepts `temp-signature` for development

### 1.3 Service Layer Methods Available

**File:** `./backend/services/ticket-service/src/services/ticketService.ts`

| Method | Can Reuse | Notes |
|--------|-----------|-------|
| `getTicket(ticketId, tenantId?)` | ✅ | Returns full ticket with type info |
| `getUserTickets(userId, tenantId, eventId?)` | ✅ | With RLS enforcement |
| `updateTicketStatus(ticketId, newStatus, options)` | ✅ | State machine validation |
| `getTicketTypes(eventId, tenantId)` | ✅ | |
| `checkAvailability(eventId, ticketTypeId, quantity)` | ✅ | |

**File:** `./backend/services/ticket-service/src/services/transferService.ts`

| Method | Can Reuse | Notes |
|--------|-----------|-------|
| `transferTicket(ticketId, fromUserId, toUserId, reason?)` | ✅ | Full transfer with validation |
| `getTransferHistory(ticketId)` | ✅ | |
| `validateTransferRequest(ticketId, fromUserId, toUserId)` | ✅ | Pre-transfer validation |

### 1.4 New Endpoints Needed

#### 1.4.1 GET /internal/tickets/by-token/:tokenId

**Consumers:** blockchain-indexer  
**Purpose:** Look up ticket by blockchain token ID

```typescript
// Response
{
  ticketId: string;
  tokenId: string;
  userId: string;
  status: string;
  eventId: string;
  isMinted: boolean;
  mintTransactionId?: string;
}
```

**Implementation:** Add to `internalRoutes.ts`, query tickets by `nft_token_id` field

---

#### 1.4.2 GET /internal/orders/:orderId/tickets

**Consumers:** payment-service, blockchain-service  
**Purpose:** Get all tickets for an order

```typescript
// Response
{
  orderId: string;
  tickets: [{
    id: string;
    ticketTypeId: string;
    ticketTypeName: string;
    status: string;
    userId: string;
    eventId: string;
    priceCents: number;
  }];
  count: number;
}
```

**Implementation:** Add to `internalRoutes.ts`, join tickets with order_items

---

#### 1.4.3 POST /internal/tickets/:ticketId/transfer

**Consumers:** transfer-service  
**Purpose:** Execute a ticket transfer (ownership change)

```typescript
// Request
{
  fromUserId: string;
  toUserId: string;
  reason?: string;
}

// Response
{
  success: boolean;
  transfer: {
    id: string;
    ticketId: string;
    fromUserId: string;
    toUserId: string;
    status: string;
    transferredAt: string;
  }
}
```

**Implementation:** Wrap existing `transferService.transferTicket()` method

---

#### 1.4.4 GET /internal/users/:userId/events-attended

**Consumers:** auth-service  
**Purpose:** Count distinct events user has attended (for profile stats)

```typescript
// Response
{
  userId: string;
  eventsAttended: number;
  events?: [{
    eventId: string;
    attendedAt: string;
  }];
}
```

**Implementation:** Query tickets with status='used' or 'checked_in', COUNT DISTINCT event_id

---

## 2. auth-service

### 2.1 Existing Internal Routes

**File:** `./backend/services/auth-service/src/routes/internal.routes.ts`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/validate-permissions` | POST | Check if user has specific permissions |
| `/validate-users` | POST | Bulk validate user IDs (max 100) |
| `/user-tenant/:userId` | GET | Get user's tenant context |
| `/health` | GET | Service health check |

### 2.2 Existing Middleware

**File:** `./backend/services/auth-service/src/middleware/s2s.middleware.ts`

```typescript
export async function verifyServiceToken(request, reply): Promise<void>
```

**What it does:**
- Validates `x-service-token` header (JWT token)
- Uses separate S2S keys from user JWT keys (security separation)
- Validates token type is 'service'
- Checks service allowlist for endpoint access
- Has `serviceAllowlist` config for granular access control

**Additional exports:**
- `generateServiceToken(serviceName)` - Generate tokens for services
- `allowUserOrService(userAuthMiddleware)` - Allow either auth type
- `initS2SKeys()` - Initialize S2S key manager

### 2.3 Service Layer Methods Available

**File:** `./backend/services/auth-service/src/services/auth.service.ts`

| Method | Can Reuse |
|--------|-----------|
| `getUserById(userId)` | ✅ |
| `register(data)` | ✅ |
| `login(data)` | ✅ |

**File:** `./backend/services/auth-service/src/services/rbac.service.ts`

| Method | Can Reuse |
|--------|-----------|
| `getUserPermissions(userId, tenantId, venueId?)` | ✅ |
| `checkPermission(userId, tenantId, permission, venueId?)` | ✅ |
| `getUserVenueRoles(userId, tenantId)` | ✅ |

### 2.4 New Endpoints Needed

#### 2.4.1 GET /internal/users/:userId

**Consumers:** payment-service, compliance-service, transfer-service  
**Purpose:** Get basic user information

```typescript
// Response
{
  id: string;
  email: string;
  name?: string;
  tenantId: string;
  role: string;
  emailVerified: boolean;
  billingAddress?: object;
  status: string;
}
```

**Implementation:** Wrap `authService.getUserById()`, restrict fields returned

---

#### 2.4.2 GET /internal/users/by-email/:email

**Consumers:** transfer-service  
**Purpose:** Find user by email (for ticket transfers to email addresses)

```typescript
// Response
{
  id: string;
  email: string;
  tenantId: string;
  status: string;
  emailVerified: boolean;
}
// or
{
  found: false;
}
```

**Implementation:** Add to `internal.routes.ts`, query users by email with tenant context

---

#### 2.4.3 GET /internal/users/admins

**Consumers:** compliance-service  
**Purpose:** Get admin users by tenant (for compliance notifications)

```typescript
// Query: ?tenantId=xxx&roles=admin,compliance_admin

// Response
{
  users: [{
    id: string;
    email: string;
    name: string;
    role: string;
  }];
  count: number;
}
```

**Implementation:** Add to `internal.routes.ts`, query users by role with tenant filter

---

## 3. order-service

### 3.1 Existing Internal Routes

**None** - order-service currently only has public API routes.

### 3.2 Existing Middleware

**None specific** - Uses standard JWT auth for public routes.

**Recommendation:** Use shared middleware from `@tickettoken/shared/middleware/internal-auth.middleware.ts`

### 3.3 Service Layer Methods Available

**File:** `./backend/services/order-service/src/services/order.service.ts`

| Method | Can Reuse |
|--------|-----------|
| `getOrder(orderId, tenantId)` | ✅ |
| `getUserOrders(userId, tenantId, limit, offset)` | ✅ |
| `getOrderEvents(orderId, tenantId)` | ✅ |
| `findOrdersByEvent(eventId, tenantId, statuses?)` | ✅ |

### 3.4 Existing Client Infrastructure

Order-service already has client patterns we can follow:
- `./backend/services/order-service/src/services/ticket.client.ts`
- `./backend/services/order-service/src/services/event.client.ts`
- `./backend/services/order-service/src/services/payment.client.ts`

### 3.5 New Endpoints Needed

#### 3.5.1 GET /internal/orders/:orderId

**Consumers:** payment-service, blockchain-service  
**Purpose:** Get order details with items

```typescript
// Response
{
  order: {
    id: string;
    orderNumber: string;
    userId: string;
    eventId: string;
    status: string;
    totalCents: number;
    currency: string;
    createdAt: string;
  };
  items: [{
    id: string;
    ticketTypeId: string;
    quantity: number;
    unitPriceCents: number;
  }];
}
```

**Implementation:** Create `./backend/services/order-service/src/routes/internal.routes.ts`, wrap `orderService.getOrder()`

---

#### 3.5.2 GET /internal/orders/:orderId/items

**Consumers:** blockchain-service  
**Purpose:** Get just order items (for minting)

```typescript
// Response
{
  orderId: string;
  items: [{
    id: string;
    ticketTypeId: string;
    ticketId?: string;
    quantity: number;
  }];
}
```

**Implementation:** Query order_items table with ticket join

---

## 4. event-service

### 4.1 Existing Internal Routes

**None** - event-service only has public API routes.

### 4.2 Existing Public API

**File:** `./backend/services/event-service/src/routes/events.routes.ts`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/events` | GET | List events |
| `/events/:id` | GET | Get single event |
| `/events` | POST | Create event |
| `/events/:id` | PUT | Update event |
| `/events/:id/publish` | POST | Publish event |
| `/venues/:venueId/events` | GET | Get venue events |

### 4.3 Extension Needed

#### 4.3.1 Extend GET /events/:id Response

**Consumers:** minting-service  
**Data needed:** `event_pda` (Solana program-derived address)

**Options:**
1. **Internal endpoint:** Create `/internal/events/:id` that returns blockchain fields
2. **Field inclusion:** Add `include=blockchain` query param to existing endpoint
3. **Separate endpoint:** Create `/internal/events/:id/blockchain`

**Recommended:** Option 1 - Create dedicated internal endpoint

```typescript
// GET /internal/events/:id

// Response (includes blockchain fields)
{
  id: string;
  name: string;
  venueId: string;
  startDate: string;
  eventPda?: string;           // Solana PDA
  artistWallet?: string;
  artistPercentage?: number;
  venuePercentage?: number;
  resaleable?: boolean;
}
```

**Implementation:** Create `./backend/services/event-service/src/routes/internal.routes.ts`

---

## 5. venue-service

### 5.1 Existing Internal Routes

**File:** `./backend/services/venue-service/src/routes/internal-validation.routes.ts`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/internal/venues/:venueId/validate-ticket/:ticketId` | GET | Validate ticket for venue |

### 5.2 Existing Middleware

**File:** `./backend/services/venue-service/src/routes/internal-validation.routes.ts`

Uses HMAC signature validation (same pattern as ticket-service):
- Validates `x-internal-service`, `x-internal-timestamp`, `x-internal-signature`
- Uses `INTERNAL_SERVICE_SECRET` environment variable
- Timing-safe comparison for signature validation

### 5.3 Extension Needed

#### 5.3.1 Add GET /internal/venues/:venueId

**Consumers:** blockchain-service, compliance-service  
**Data needed:** `wallet_address`, basic venue info

```typescript
// Response
{
  id: string;
  name: string;
  tenantId: string;
  walletAddress?: string;      // Solana wallet
  ownerEmail?: string;
  status: string;
}
```

**Implementation:** Add to existing `internal-validation.routes.ts`

---

## 6. Shared Infrastructure

### 6.1 Existing Shared Middleware

**File:** `./backend/shared/src/middleware/internal-auth.middleware.ts`

```typescript
export function createInternalAuthMiddleware(config?: InternalAuthConfig)
```

**Features:**
- Validates `x-internal-service: true` header
- Validates `x-internal-api-key` against `INTERNAL_API_KEY` env var
- Extracts tenant ID from `x-tenant-id` header
- Extracts user ID from `x-user-id` header
- Extracts tracing headers (`x-trace-id`, `x-span-id`)
- Configurable: `allowNoTenant`, `trustedServices`, `strictMode`

### 6.2 Existing Base Client

**File:** `./backend/shared/src/http-client/base-service-client.ts`

```typescript
export abstract class BaseServiceClient
```

**Features:**
- Circuit breaker integration
- Automatic retry with exponential backoff
- Tenant context propagation (`X-Tenant-ID`, `X-User-ID`)
- Distributed tracing (`X-Trace-ID`, `X-Span-ID`)
- Idempotency key generation for mutations
- Error transformation

**Usage Example:**
```typescript
class TicketServiceClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.TICKET_SERVICE_URL || 'http://ticket-service:3000',
      serviceName: 'ticket-service',
    });
  }

  async getTicket(ticketId: string, ctx: RequestContext): Promise<Ticket> {
    const response = await this.get<Ticket>(`/internal/tickets/${ticketId}`, ctx);
    return response.data;
  }
}
```

---

## 7. Implementation Plan

### 7.1 Priority Order

| Priority | Service | Endpoints | Consumers | Effort |
|----------|---------|-----------|-----------|--------|
| **P0** | ticket-service | 4 new | transfer, payment, blockchain, indexer | Medium |
| **P1** | auth-service | 3 new | payment, compliance, transfer | Medium |
| **P2** | order-service | 2 new | payment, blockchain | Low |
| **P3** | event-service | 1 new | minting | Low |
| **P3** | venue-service | 1 extension | blockchain, compliance | Low |

### 7.2 Middleware Standardization

**Current State:** 3 different internal auth patterns:
1. HMAC signature (ticket-service, venue-service)
2. S2S JWT (auth-service)
3. API key (shared middleware)

**Recommendation:** Standardize on shared middleware but keep auth-service's S2S JWT for its specific security needs.

**Migration Path:**
1. Update ticket-service to use shared middleware + existing verifyInternalService
2. Update venue-service to use shared middleware
3. Create new internal routes using shared middleware
4. Keep auth-service's S2S JWT for cross-cutting concerns

### 7.3 Client Creation Needed

| Consumer Service | Client to Create | Target Service |
|-----------------|------------------|----------------|
| payment-service | TicketServiceClient | ticket-service |
| payment-service | AuthServiceClient | auth-service |
| payment-service | OrderServiceClient | order-service |
| payment-service | EventServiceClient | event-service |
| blockchain-service | TicketServiceClient | ticket-service |
| blockchain-service | VenueServiceClient | venue-service |
| blockchain-indexer | TicketServiceClient | ticket-service |
| transfer-service | TicketServiceClient | ticket-service |
| transfer-service | AuthServiceClient | auth-service |
| compliance-service | AuthServiceClient | auth-service |
| compliance-service | VenueServiceClient | venue-service |
| minting-service | EventServiceClient | event-service |

---

## 8. Summary: What to Build vs Reuse

### 8.1 Can Reuse

| Component | Location |
|-----------|----------|
| Base client class | `@tickettoken/shared/http-client/base-service-client.ts` |
| Internal auth middleware | `@tickettoken/shared/middleware/internal-auth.middleware.ts` |
| Circuit breaker | `@tickettoken/shared/http-client/circuit-breaker.ts` |
| Retry logic | `@tickettoken/shared/http-client/retry.ts` |
| Request context utilities | `@tickettoken/shared/http-client/base-service-client.ts` |
| TicketService methods | `ticket-service/src/services/ticketService.ts` |
| TransferService methods | `ticket-service/src/services/transferService.ts` |
| AuthService.getUserById() | `auth-service/src/services/auth.service.ts` |
| OrderService.getOrder() | `order-service/src/services/order.service.ts` |
| Existing client patterns | `order-service/src/services/*.client.ts` |

### 8.2 Need to Build

| Component | Service | Effort |
|-----------|---------|--------|
| 4 new endpoints | ticket-service | 2-3 hours |
| 3 new endpoints | auth-service | 2-3 hours |
| internal.routes.ts + 2 endpoints | order-service | 2-3 hours |
| internal.routes.ts + 1 endpoint | event-service | 1-2 hours |
| 1 endpoint extension | venue-service | 1 hour |
| ~12 service clients | Various consumers | 4-6 hours |
| Integration tests | All | 4-6 hours |

**Total Estimated Effort:** 16-24 hours

---

## 9. Next Steps

1. [ ] Create ticket-service internal endpoints (P0)
2. [ ] Create auth-service internal endpoints (P1)
3. [ ] Create order-service internal routes file and endpoints (P2)
4. [ ] Create event-service internal routes file and endpoint (P3)
5. [ ] Extend venue-service internal routes (P3)
6. [ ] Create service clients in consumer services
7. [ ] Update consumer services to use clients instead of direct DB access
8. [ ] Add integration tests
9. [ ] Update S2S middleware allowlists
10. [ ] Document API contracts in OpenAPI/Swagger

---

## Appendix A: Bypass Mapping

| Consumer Service | Table Bypassed | API Solution |
|-----------------|----------------|--------------|
| auth-service | tickets | `GET /internal/users/:userId/events-attended` |
| payment-service | tickets | `GET /internal/orders/:orderId/tickets` |
| payment-service | events | `GET /internal/events/:id` |
| payment-service | orders | `GET /internal/orders/:orderId` |
| payment-service | users | `GET /internal/users/:userId` |
| blockchain-service | tickets | `GET /internal/orders/:orderId/tickets` |
| blockchain-service | venues | `GET /internal/venues/:venueId` |
| blockchain-service | order_items | `GET /internal/orders/:orderId/items` |
| blockchain-indexer | tickets | `GET /internal/tickets/by-token/:tokenId` |
| minting-service | events | `GET /internal/events/:id` |
| transfer-service | tickets | `POST /internal/tickets/:ticketId/transfer` |
| transfer-service | users | `GET /internal/users/by-email/:email` |
| compliance-service | venues | `GET /internal/venues/:venueId` |
| compliance-service | users | `GET /internal/users/admins` |
