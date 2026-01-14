# Phase 4: Service Client Inventory

**Generated:** 2026-01-12  
**Purpose:** Document existing and needed service clients for internal API consumption

---

## Executive Summary

| Category | Count |
|----------|-------|
| Existing clients found | 4 |
| Clients using BaseServiceClient | 0 |
| New shared clients to create | 5 |
| Services that need client updates | 6+ |

---

## 1. Existing Clients Found

### 1.1 order-service Clients

| Client | File Path | Target Service | Extends BaseServiceClient? |
|--------|-----------|----------------|---------------------------|
| TicketClient | `backend/services/order-service/src/services/ticket.client.ts` | ticket-service | ❌ No |
| EventClient | `backend/services/order-service/src/services/event.client.ts` | event-service | ❌ No |
| PaymentClient | `backend/services/order-service/src/services/payment.client.ts` | payment-service | ❌ No |

**Architecture:**
- Uses `createSecureServiceClient()` from local `utils/http-client.util.ts`
- Uses `createCircuitBreaker()` from local `utils/circuit-breaker.ts`
- Uses `executeWithRetry()` for retry logic
- Custom implementation, not using shared BaseServiceClient

**Key Methods (TicketClient):**
- `checkAvailability()` - Check ticket availability
- `reserveTickets()` - Reserve tickets for order
- `confirmAllocation()` - Confirm ticket allocation
- `releaseTickets()` - Release reserved tickets
- `getPrices()` - Get ticket prices
- `getTicket()` - Get single ticket
- `checkTicketNotTransferred()` - Verify ticket ownership for refunds
- `getTicketsForOrder()` - Get tickets for an order
- `checkOrderTicketsNotTransferred()` - Check all order tickets

---

### 1.2 event-service Clients

| Client | File Path | Target Service | Extends BaseServiceClient? |
|--------|-----------|----------------|---------------------------|
| VenueServiceClient | `backend/services/event-service/src/services/venue-service.client.ts` | venue-service | ❌ No |

**Architecture:**
- Uses `node-fetch` directly
- Uses `opossum` CircuitBreaker
- Uses local `withRetry()` from `utils/retry.ts`
- S2S authentication via `getS2SHeaders()`
- Includes fallback caching (tenant-aware)
- NOT using shared BaseServiceClient

**Key Methods:**
- `validateVenueAccess()` - Check tenant has venue access
- `getVenue()` - Get venue details
- `healthCheck()` - Service health check

---

## 2. Shared BaseServiceClient Analysis

**Location:** `backend/shared/src/http-client/base-service-client.ts`

**Features provided:**
- ✅ Circuit breaker integration
- ✅ Automatic retry with exponential backoff
- ✅ Tenant context propagation (X-Tenant-ID, X-User-ID)
- ✅ Distributed tracing (X-Trace-ID, X-Span-ID)
- ✅ Idempotency key generation for mutations
- ✅ Error transformation
- ✅ Health check endpoint

**Current Usage:** **ZERO** - No existing clients extend BaseServiceClient

---

## 3. Gap Analysis

### Existing Clients Missing New Endpoints

| Client | Missing Methods | Phase 3 Endpoints to Add |
|--------|----------------|-------------------------|
| order-service/TicketClient | `getTicketFull()`, `getTicketsByEvent()`, `getTicketByToken()`, `transferTicket()` | 4 new endpoints |
| event-service/VenueServiceClient | `getVenueInternal()` | 1 new endpoint |

### Services Without Any Clients

| Service | Needs Clients For | Target Services |
|---------|-------------------|-----------------|
| payment-service | User lookup, order lookup, ticket lookup | auth, order, ticket |
| blockchain-service | Venue lookup, ticket lookup, order items | venue, ticket, order |
| blockchain-indexer | Ticket by token lookup | ticket |
| transfer-service | User email lookup, ticket transfer | auth, ticket |
| minting-service | Event with PDA lookup | event |
| compliance-service | Admin users, venue info | auth, venue |
| scanning-service | Event tickets, ticket full | ticket |

---

## 4. Recommended New Shared Clients

**Location:** `./backend/shared/src/clients/`

### 4.1 TicketServiceClient

**File:** `backend/shared/src/clients/ticket-service.client.ts`

**Methods to implement:**
```typescript
class TicketServiceClient extends BaseServiceClient {
  // Existing internal endpoints
  getTicketStatus(ticketId: string, ctx: RequestContext): Promise<TicketStatus>
  cancelTicketsBatch(ticketIds: string[], reason: string, refundId: string, ctx: RequestContext): Promise<BatchResult>
  calculateTicketPrice(ticketIds: string[], ctx: RequestContext): Promise<PriceCalculation>
  
  // Phase 3 new endpoints
  getTicketFull(ticketId: string, ctx: RequestContext): Promise<TicketWithEvent>
  getTicketsByEvent(eventId: string, ctx: RequestContext, options?: { status?: string; limit?: number }): Promise<TicketList>
  getTicketByToken(tokenId: string, ctx: RequestContext): Promise<TicketByToken>
  transferTicket(ticketId: string, toUserId: string, ctx: RequestContext, reason?: string): Promise<TransferResult>
}
```

**Consumers:** payment-service, blockchain-service, blockchain-indexer, transfer-service, scanning-service, compliance-service

---

### 4.2 AuthServiceClient

**File:** `backend/shared/src/clients/auth-service.client.ts`

**Methods to implement:**
```typescript
class AuthServiceClient extends BaseServiceClient {
  // Existing internal endpoints
  validatePermissions(userId: string, permissions: string[], ctx: RequestContext, venueId?: string): Promise<PermissionResult>
  validateUsers(userIds: string[], ctx: RequestContext): Promise<UserValidationResult>
  getUserTenant(userId: string, ctx: RequestContext): Promise<TenantContext>
  
  // Phase 3 new endpoints
  getUser(userId: string, ctx: RequestContext): Promise<User>
  getUserByEmail(email: string, ctx: RequestContext): Promise<User | null>
  getAdminUsers(ctx: RequestContext, options?: { roles?: string[] }): Promise<AdminUserList>
}
```

**Consumers:** payment-service, compliance-service, transfer-service

---

### 4.3 OrderServiceClient

**File:** `backend/shared/src/clients/order-service.client.ts`

**Methods to implement:**
```typescript
class OrderServiceClient extends BaseServiceClient {
  // Phase 3 new endpoints
  getOrder(orderId: string, ctx: RequestContext): Promise<Order>
  getOrderItems(orderId: string, ctx: RequestContext): Promise<OrderItemList>
}
```

**Consumers:** payment-service, blockchain-service

---

### 4.4 EventServiceClient

**File:** `backend/shared/src/clients/event-service.client.ts`

**Methods to implement:**
```typescript
class EventServiceClient extends BaseServiceClient {
  // Phase 3 new endpoint
  getEventInternal(eventId: string, ctx: RequestContext): Promise<EventWithBlockchain>
}
```

**Consumers:** minting-service, payment-service, scanning-service

---

### 4.5 VenueServiceClient

**File:** `backend/shared/src/clients/venue-service.client.ts`

**Methods to implement:**
```typescript
class VenueServiceClient extends BaseServiceClient {
  // Existing internal endpoint
  validateTicket(venueId: string, ticketId: string, ctx: RequestContext): Promise<TicketValidation>
  
  // Phase 3 new endpoint
  getVenueInternal(venueId: string, ctx: RequestContext): Promise<VenueWithBlockchain>
}
```

**Consumers:** blockchain-service, compliance-service

---

## 5. Migration Strategy

### Option A: Create New Shared Clients (Recommended)
1. Create 5 new clients in `backend/shared/src/clients/`
2. All extend BaseServiceClient
3. Consumer services import from `@tickettoken/shared/clients`
4. Existing service-local clients remain for backward compatibility
5. Gradually migrate to shared clients

### Option B: Refactor Existing Clients
1. Modify order-service TicketClient to extend BaseServiceClient
2. Modify event-service VenueServiceClient to extend BaseServiceClient
3. Risk: Breaking changes to existing services

### Option C: Hybrid Approach
1. Create shared clients for NEW internal APIs only
2. Keep existing service-local clients as-is
3. Services choose which to use based on endpoint

**Recommendation:** Option A - Clean separation, no breaking changes

---

## 6. Implementation Order

| Priority | Client | Estimated Effort | Depends On |
|----------|--------|------------------|------------|
| P0 | TicketServiceClient | 2 hours | Phase 3 endpoints complete ✅ |
| P1 | AuthServiceClient | 1.5 hours | Phase 3 endpoints complete ✅ |
| P2 | OrderServiceClient | 1 hour | Phase 3 endpoints complete ✅ |
| P2 | EventServiceClient | 1 hour | Phase 3 endpoints complete ✅ |
| P2 | VenueServiceClient | 1 hour | Phase 3 endpoints complete ✅ |
| P3 | Index exports + types | 0.5 hours | All clients |

**Total Estimated Effort:** 7 hours

---

## 7. Directory Structure

```
backend/shared/src/clients/
├── index.ts                      # Export all clients
├── types.ts                      # Shared response types
├── ticket-service.client.ts      # TicketServiceClient
├── auth-service.client.ts        # AuthServiceClient  
├── order-service.client.ts       # OrderServiceClient
├── event-service.client.ts       # EventServiceClient
└── venue-service.client.ts       # VenueServiceClient
```

---

## 8. Next Steps

1. [ ] Create `backend/shared/src/clients/` directory
2. [ ] Create types.ts with response interfaces
3. [ ] Implement TicketServiceClient
4. [ ] Implement AuthServiceClient
5. [ ] Implement OrderServiceClient
6. [ ] Implement EventServiceClient
7. [ ] Implement VenueServiceClient
8. [ ] Create index.ts exports
9. [ ] Update `backend/shared/src/index.ts` to export clients
10. [ ] Add integration tests

---

## Appendix: BaseServiceClient Usage Example

```typescript
import { BaseServiceClient, RequestContext } from '@tickettoken/shared';

class TicketServiceClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.TICKET_SERVICE_URL || 'http://ticket-service:3002',
      serviceName: 'ticket-service',
      timeout: 10000,
    });
  }

  async getTicketFull(ticketId: string, ctx: RequestContext) {
    const response = await this.get<TicketFullResponse>(
      `/internal/tickets/${ticketId}/full`,
      ctx
    );
    return response.data;
  }

  async transferTicket(ticketId: string, toUserId: string, ctx: RequestContext, reason?: string) {
    const response = await this.post<TransferResponse>(
      `/internal/tickets/${ticketId}/transfer`,
      ctx,
      { toUserId, reason }
    );
    return response.data;
  }
}
```
