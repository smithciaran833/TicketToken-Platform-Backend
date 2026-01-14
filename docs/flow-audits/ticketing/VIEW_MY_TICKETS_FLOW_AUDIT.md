# VIEW MY TICKETS FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | View My Tickets (User Ticket Wallet) |

---

## Executive Summary

**PARTIAL IMPLEMENTATION - Duplicate endpoints with inconsistencies**

| Component | Status |
|-----------|--------|
| Get current user's tickets | ✅ Working |
| Get tickets by user ID | ✅ Working |
| Ownership validation | ✅ Complete |
| Tenant isolation (RLS) | ✅ Complete |
| API Gateway routing | ⚠️ Partial (/orders not routed) |
| Response format consistency | ❌ Inconsistent |
| Filtering/pagination | ⚠️ Partial (only on orders endpoint) |
| Service layer usage | ⚠️ Inconsistent (orders bypasses) |

**Bottom Line:** Users can view their tickets, but there are two different implementations with inconsistent response formats. The orders endpoint isn't exposed through the API gateway, and the main tickets endpoint lacks filtering and pagination.

---

## Architecture Overview

### Expected Flow
```
┌─────────────────────────────────────────────────────────────┐
│                  VIEW MY TICKETS FLOW                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   User Request ──> API Gateway ──> Ticket Service            │
│                         │                                    │
│                         ▼                                    │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              VALIDATION PIPELINE                     │   │
│   ├─────────────────────────────────────────────────────┤   │
│   │  1. Authenticate user (JWT)                         │   │
│   │  2. Extract tenant from token                       │   │
│   │  3. Apply RLS context                               │   │
│   │  4. Query tickets with joins                        │   │
│   │  5. Return formatted response                       │   │
│   └─────────────────────────────────────────────────────┘   │
│                         │                                    │
│                         ▼                                    │
│   Return tickets with event info, ticket type, status        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Actual Flow
```
┌─────────────────────────────────────────────────────────────┐
│              ACTUAL IMPLEMENTATION (FRAGMENTED)              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   OPTION 1: GET /api/v1/tickets/                            │
│   ├── API Gateway proxies ✅                                 │
│   ├── ticketController.getCurrentUserTickets                │
│   ├── Uses ticketService.getUserTickets ✅                   │
│   ├── No filtering ❌                                        │
│   └── Response: { success: true, data: tickets }            │
│                                                              │
│   OPTION 2: GET /api/v1/tickets/users/:userId               │
│   ├── API Gateway proxies ✅                                 │
│   ├── ticketController.getUserTickets                       │
│   ├── Uses ticketService.getUserTickets ✅                   │
│   ├── Ownership check ✅                                     │
│   └── Response: { success: true, data: tickets }            │
│                                                              │
│   OPTION 3: GET /api/v1/orders/tickets                      │
│   ├── API Gateway DOES NOT ROUTE ❌                          │
│   ├── ordersController.getUserTickets                       │
│   ├── Direct SQL (bypasses service) ⚠️                       │
│   ├── Has eventId/status filters ✅                          │
│   └── Response: { tickets: formattedTickets }               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## What Works ✅

### 1. Main Tickets Endpoint

**Route:** `GET /api/v1/tickets/`

**File:** `backend/services/ticket-service/src/routes/ticketRoutes.ts`
```typescript
fastify.get('/', {
  preHandler: [rateLimiters.read, authMiddleware]
}, (request, reply) => ticketController.getCurrentUserTickets(request, reply));
```

**Controller:** `backend/services/ticket-service/src/controllers/ticketController.ts`
```typescript
async getCurrentUserTickets(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as any).user;

  if (!user?.id) {
    return reply.status(401).send({ error: 'User not authenticated' });
  }

  const tenantId = (request as any).tenantId;
  const tickets = await this.ticketService.getUserTickets(user.id, tenantId);

  reply.send({
    success: true,
    data: tickets
  });
}
```

### 2. Service Layer with RLS

**File:** `backend/services/ticket-service/src/services/ticketService.ts`
```typescript
async getUserTickets(userId: string, tenantId: string, eventId?: string): Promise<Ticket[]> {
  // Validate tenant ID format - Batch 3 security check
  if (!isValidTenantId(tenantId)) {
    this.log.warn('Invalid tenant ID format in getUserTickets', { tenantId: tenantId?.substring(0, 50) });
    throw new ValidationError('Invalid tenant ID format');
  }

  // Wrap in tenant context for proper RLS enforcement
  return withTenantContext(tenantId, async () => {
    let query = `
      SELECT t.*, tt.name as ticket_type_name, e.name as event_name
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN events e ON t.event_id = e.id
      WHERE t.user_id = $1 AND t.tenant_id = $2
    `;

    const params: any[] = [userId, tenantId];

    if (eventId) {
      query += ' AND t.event_id = $3';
      params.push(eventId);
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await DatabaseService.query<Ticket>(query, params);
    return result.rows;
  });
}
```

**Security Features:**
- ✅ Tenant ID validation
- ✅ RLS context via `withTenantContext`
- ✅ User ID scoping
- ✅ Joins for related data

### 3. Ownership Validation

**File:** `backend/services/ticket-service/src/controllers/ticketController.ts`
```typescript
async getUserTickets(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { userId } = request.params as any;
  const tenantId = (request as any).tenantId;
  const authenticatedUser = (request as any).user;

  // SECURITY FIX: Prevent users from viewing other users' tickets
  // Only allow if: 1) userId matches authenticated user, OR 2) user is admin
  if (authenticatedUser.id !== userId && authenticatedUser.role !== 'admin') {
    return reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'You can only view your own tickets'
    });
  }

  const tickets = await this.ticketService.getUserTickets(userId, tenantId);

  reply.send({
    success: true,
    data: tickets
  });
}
```

### 4. API Gateway Proxying

**File:** `backend/services/api-gateway/src/routes/tickets.routes.ts`
```typescript
// All other ticket routes - proxy with auth but no body validation
const authenticatedRoutes = createAuthenticatedProxy(server, {
  serviceUrl: `${serviceUrls.ticket}/api/v1/tickets`,
  serviceName: 'ticket',
  publicPaths: ['/health', '/metrics']
});
```

---

## What's Partially Implemented ⚠️

### 1. Orders Endpoint Has Filtering (But Not Routed)

**File:** `backend/services/ticket-service/src/controllers/orders.controller.ts`
```typescript
async getUserTickets(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).user?.id || (request as any).user?.sub;
  const tenantId = (request as any).tenantId || (request as any).user?.tenant_id;
  const { eventId, status } = request.query as any;  // ✅ Has filters!

  // ... direct SQL query with filters
}
```

**Problem:** This endpoint has useful filtering but:
- Not exposed through API gateway
- Bypasses the service layer
- Returns different response format

### 2. Inconsistent Response Formats

**ticketController returns:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "status": "active",
      "ticket_type_name": "VIP",
      "event_name": "Concert"
    }
  ]
}
```

**ordersController returns:**
```json
{
  "tickets": [
    {
      "id": "...",
      "status": "active",
      "ticketType": "VIP",
      "eventName": "Concert",
      "priceCents": 5000,
      "priceFormatted": "$50.00",
      "mintAddress": "..."
    }
  ]
}
```

### 3. Different Data Fields

| Field | ticketController | ordersController |
|-------|------------------|------------------|
| ticket_type_name / ticketType | ✅ | ✅ |
| event_name / eventName | ✅ | ✅ |
| priceCents | ❌ | ✅ |
| priceFormatted | ❌ | ✅ |
| mintAddress | ❌ | ✅ |
| eventDate | ❌ | ✅ |

---

## What's Missing ❌

### 1. API Gateway Route for Orders

**File:** `backend/services/api-gateway/src/routes/index.ts`

Orders is NOT registered:
```typescript
await server.register(ticketsRoutes, { prefix: '/tickets' });
await server.register(paymentRoutes, { prefix: '/payments' });
// NO: await server.register(ordersRoutes, { prefix: '/orders' });
```

**Impact:** The `/api/v1/orders/tickets` endpoint with filtering is only accessible directly to ticket-service, not through the gateway.

### 2. Pagination on Main Endpoint

**Current:** Returns all tickets, no limit
```typescript
query += ' ORDER BY t.created_at DESC';
// No LIMIT or OFFSET
```

**Needed:**
```typescript
query += ' ORDER BY t.created_at DESC LIMIT $3 OFFSET $4';
```

### 3. Filtering on Main Endpoint

**Current:** No query params accepted
```typescript
async getCurrentUserTickets(request, reply) {
  // No filters extracted from request.query
}
```

**Needed:**
```typescript
const { status, eventId, upcoming } = request.query as any;
```

### 4. Upcoming vs Past Events View

**Not implemented:** No way to filter by:
- Upcoming events only
- Past events only
- Date range

---

## API Endpoints

### Ticket Service (Direct)

| Endpoint | Method | Auth | Filters | Status |
|----------|--------|------|---------|--------|
| `/api/v1/tickets/` | GET | ✅ | ❌ | Working |
| `/api/v1/tickets/users/:userId` | GET | ✅ | ❌ | Working |
| `/api/v1/tickets/:ticketId` | GET | ✅ | N/A | Working |
| `/api/v1/orders/tickets` | GET | ✅ | eventId, status | Not routed |

### API Gateway

| Endpoint | Proxies To | Status |
|----------|------------|--------|
| `/api/v1/tickets/*` | ticket-service | ✅ Working |
| `/api/v1/orders/*` | - | ❌ Not configured |

---

## Database Query

**Current query in ticketService:**
```sql
SELECT 
  t.*, 
  tt.name as ticket_type_name, 
  e.name as event_name
FROM tickets t
JOIN ticket_types tt ON t.ticket_type_id = tt.id
JOIN events e ON t.event_id = e.id
WHERE t.user_id = $1 AND t.tenant_id = $2
ORDER BY t.created_at DESC
```

**Missing joins that could be useful:**
- Event date/time for sorting by upcoming
- Venue name
- Ticket price from ticket_types

---

## Files Involved

| File | Purpose |
|------|---------|
| `ticket-service/src/routes/ticketRoutes.ts` | Route definitions |
| `ticket-service/src/routes/orders.routes.ts` | Duplicate route definitions |
| `ticket-service/src/controllers/ticketController.ts` | Main controller |
| `ticket-service/src/controllers/orders.controller.ts` | Duplicate controller |
| `ticket-service/src/services/ticketService.ts` | Service layer |
| `api-gateway/src/routes/tickets.routes.ts` | Gateway proxy |
| `api-gateway/src/routes/index.ts` | Gateway route registration |

---

## Recommendations

### P0 - Must Fix

| Issue | Fix | Effort |
|-------|-----|--------|
| Orders not routed through gateway | Add `/orders` route to API gateway OR consolidate endpoints | 1 day |
| Response format inconsistency | Standardize on `{ success: true, data: [...] }` format | 0.5 day |

### P1 - Should Fix

| Issue | Fix | Effort |
|-------|-----|--------|
| No filtering on main endpoint | Add query params: status, eventId, upcoming | 1 day |
| No pagination | Add limit/offset with defaults | 0.5 day |
| Orders bypasses service layer | Move SQL logic into ticketService | 1 day |

### P2 - Nice to Have

| Issue | Fix | Effort |
|-------|-----|--------|
| Missing price data in main endpoint | Add price fields to response | 0.5 day |
| No upcoming/past separation | Add date-based filtering | 0.5 day |
| Duplicate endpoints | Consolidate to single endpoint with all features | 2 days |

---

## Recommended Consolidated Endpoint
```typescript
// GET /api/v1/tickets/mine
// Query params: status, eventId, upcoming, limit, offset

async getMyTickets(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = (request as any).user;
  const tenantId = (request as any).tenantId;
  const { 
    status, 
    eventId, 
    upcoming,  // boolean - only future events
    limit = 20, 
    offset = 0 
  } = request.query as any;

  const tickets = await this.ticketService.getUserTickets(user.id, tenantId, {
    status,
    eventId,
    upcoming,
    limit: Math.min(limit, 100),
    offset
  });

  reply.send({
    success: true,
    data: tickets,
    pagination: {
      limit,
      offset,
      total: tickets.length
    }
  });
}
```

---

## Related Documents

- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - How tickets are created
- `TICKET_TRANSFER_GIFT_FLOW_AUDIT.md` - Ticket ownership changes
- `TICKET_VALIDATION_ENTRY_FLOW_AUDIT.md` - Using tickets at events
- `SECONDARY_PURCHASE_FLOW_AUDIT.md` - Resale ticket purchases
