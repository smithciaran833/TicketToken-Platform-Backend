# Audit Report: transfer-service Internal Endpoints

**Date:** January 21, 2026
**Auditor:** Claude Code
**Purpose:** Determine if transfer-service needs /internal/ endpoints

---

## Executive Summary

**Finding:** transfer-service has **MODERATE NEED** for internal endpoints.

The service currently has **NO /internal/ routes** but has proper HMAC authentication middleware in place. Unlike some other services, transfer-service:
- Uses shared service clients (`@tickettoken/shared/clients`) for making outgoing calls
- Has comprehensive idempotency and deduplication mechanisms
- Publishes events via Redis Pub/Sub and webhooks (not RabbitMQ)

**Key Gap:** Other services may need to query transfer status, history, and ownership verification but have no internal API to call.

**Priority:** P1 (High - needed for proper service integration)

---

## 1. Services Calling transfer-service

### 1.1 Direct HTTP Callers

**Finding:** No services currently make direct HTTP calls TO transfer-service.

**Searched Patterns:**
- `TRANSFER_SERVICE_URL` - No matches
- `TRANSFER_URL` - No matches
- `http://transfer-service` - No matches in service code
- `transferClient` - No dedicated client found
- Port `:3012` or `:3019` - Only in docker-compose/config files

### 1.2 Services That SHOULD Call transfer-service

Based on architectural needs:

| Service | Purpose | Current Approach | Should Be |
|---------|---------|-----------------|-----------|
| **ticket-service** | Transfer history for ticket | Has own local `transferService.ts` | Could call transfer-service |
| **marketplace-service** | Trigger transfer after sale | Publishes events | Direct HTTP for sync flow |
| **blockchain-service** | Coordinate NFT transfers | Configured URL exists | Internal API for status |
| **scanning-service** | Verify ownership at entry | Reads `ticket_transfers` directly | Internal API |
| **compliance-service** | GDPR transfer history | No integration | Internal API |

### 1.3 ticket-service Local Transfer Handling

**File:** `backend/services/ticket-service/src/services/transferService.ts`

ticket-service has its own complete `TransferService` implementation that:
- Creates transfer records in `ticket_transfers` table
- Publishes events to RabbitMQ (`ticket.transferred`)
- Sends notifications
- Validates transfer eligibility

**Architectural Issue:** Two services (ticket-service and transfer-service) both manage transfers, creating:
- Duplicate logic
- Potential data inconsistency
- Unclear ownership

**Recommendation:**
- transfer-service should be authoritative for transfers
- ticket-service should delegate to transfer-service via internal API

### 1.4 scanning-service Direct Database Access

**File:** `backend/services/scanning-service/src/services/QRValidator.ts:494-515`

```typescript
// PHASE 5.3: Handle transferred tickets
if (ticket.status === 'TRANSFERRED') {
  // Get the new ticket ID from transfer record
  const transferResult = await client.query(`
    SELECT new_ticket_id
    FROM ticket_transfers
    WHERE old_ticket_id = $1
    ORDER BY transferred_at DESC
    LIMIT 1
  `, [ticketId]);
```

**Issue:** scanning-service directly queries `ticket_transfers` table instead of calling transfer-service.

---

## 2. Queue Messages FROM transfer-service

### 2.1 Event Types Published

**Channel:** `transfer:events` (Redis Pub/Sub)

| Event Type | Description | Consumers |
|------------|-------------|-----------|
| `TRANSFER_UPDATE` | Transfer status changes | WebSocket clients |
| `TRANSFER_STATUS` | Transfer state updates | WebSocket clients |
| `BLOCKCHAIN_UPDATE` | Blockchain tx updates | WebSocket clients |
| `NOTIFICATION` | General notifications | WebSocket clients |

**Note:** These are WebSocket events, not RabbitMQ messages.

### 2.2 Webhook Events

**File:** `backend/services/transfer-service/src/services/webhook.service.ts`

| Webhook Event | Trigger | External Consumers |
|---------------|---------|-------------------|
| `transfer.created` | New transfer initiated | Tenant webhooks |
| `transfer.accepted` | Transfer accepted | Tenant webhooks |
| `transfer.rejected` | Transfer rejected | Tenant webhooks |
| `transfer.completed` | Transfer fully completed | Tenant webhooks |
| `transfer.failed` | Transfer failed | Tenant webhooks |
| `transfer.cancelled` | Transfer cancelled | Tenant webhooks |
| `blockchain.confirmed` | Blockchain tx confirmed | Tenant webhooks |

### 2.3 HTTP vs Queue Analysis

| Operation | Current | Recommended | Reason |
|-----------|---------|-------------|--------|
| Transfer status check | N/A | HTTP (sync) | Real-time validation needed |
| Ownership verification | Direct DB | HTTP (sync) | Entry scanning latency critical |
| Transfer history | Direct DB | HTTP (sync) | GDPR compliance needs |
| Analytics logging | WebSocket | Keep WebSocket | Fire-and-forget acceptable |
| External notifications | Webhook | Keep Webhook | External integrations |

---

## 3. Current /internal/ Routes

**Finding: NONE**

Transfer-service has **NO** `/internal/` routes defined.

**Files Checked:**
- `src/routes/transfer.routes.ts` - Only public API routes
- `src/app.ts` - No internal route registration
- Grep for `/internal/` - No matches

**Existing Route Structure:**

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/health` | GET | None | Health check |
| `/health/ready` | GET | None | Readiness probe |
| `/health/live` | GET | None | Liveness probe |
| `/health/db` | GET | None | Database health |
| `/metrics` | GET | None | Prometheus metrics |
| `/api/v1/transfers/gift` | POST | JWT | Create gift transfer |
| `/api/v1/transfers/:transferId/accept` | POST | JWT | Accept transfer |

**Internal Auth Middleware EXISTS:**

**File:** `src/middleware/internal-auth.ts`

```typescript
export const ALLOWED_SERVICES = [
  'api-gateway',
  'payment-service',
  'ticket-service',
  'order-service',
  'minting-service',
  'marketplace-service',
  'blockchain-service',
  'notification-service',
  'event-service',
  'scanning-service'
];
```

The internal auth middleware is ready but not used by any routes.

---

## 4. Missing Endpoints

### 4.1 CRITICAL (P0) - Needed for Service Integration

| Endpoint | Method | Purpose | Callers |
|----------|--------|---------|---------|
| `GET /internal/transfers/:id` | GET | Get transfer details | marketplace-service, blockchain-service |
| `GET /internal/transfers/by-ticket/:ticketId` | GET | Get transfer history for ticket | scanning-service, ticket-service |
| `GET /internal/ownership/:ticketId` | GET | Verify current owner | scanning-service |

### 4.2 HIGH (P1) - Improves Architecture

| Endpoint | Method | Purpose | Callers |
|----------|--------|---------|---------|
| `POST /internal/transfers/initiate` | POST | Start transfer programmatically | marketplace-service |
| `POST /internal/transfers/:id/complete` | POST | Complete transfer (after payment) | payment-service |
| `GET /internal/users/:userId/transfers` | GET | User's transfer history | compliance-service |
| `GET /internal/transfers/pending` | GET | List pending transfers | monitoring |

### 4.3 MEDIUM (P2) - Analytics/Compliance

| Endpoint | Method | Purpose | Callers |
|----------|--------|---------|---------|
| `GET /internal/transfers/stats` | GET | Transfer statistics | analytics-service |
| `GET /internal/blockchain/:ticketId/status` | GET | Blockchain transfer status | blockchain-service |
| `POST /internal/transfers/validate` | POST | Validate transfer eligibility | marketplace-service |

---

## 5. Special Considerations

### 5.1 Blockchain Coordination

transfer-service manages blockchain NFT transfers via Metaplex SDK:

**File:** `src/services/blockchain-transfer.service.ts`

```typescript
// Uses ticketServiceClient for updates
await ticketServiceClient.updateNft(ticketId, {
  nftMintAddress: nftMintAddress,
  nftTransferSignature: nftResult.signature,
  walletAddress: toWallet,
}, ctx);
```

**Need:** blockchain-service may need to query blockchain transfer status from transfer-service.

### 5.2 Ownership Verification at Venue Entry

**Critical Path:** Scanning must complete in <500ms

scanning-service currently bypasses transfer-service with direct DB queries. An internal API would:
- Provide proper service boundaries
- Enable caching at transfer-service layer
- Allow transfer-service to own its data

### 5.3 GDPR Compliance

compliance-service needs user transfer history for data exports. Currently no integration exists.

**Required Endpoint:**
```
GET /internal/users/:userId/transfers
```

Returns: All transfers where user is sender or recipient.

### 5.4 Duplicate Transfer Logic

**Issue:** Both ticket-service and transfer-service have transfer implementations.

| Service | Table Owned | Logic |
|---------|-------------|-------|
| ticket-service | N/A (uses ticket_transfers) | Local transferService.ts |
| transfer-service | ticket_transfers | Full transfer workflow |

**Recommendation:**
- transfer-service should be authoritative
- ticket-service should call `POST /internal/transfers/initiate`
- Remove duplicate logic from ticket-service

---

## 6. Recommendations

### 6.1 Immediate Actions (P1)

**1. Create `/internal/` route file:**

```typescript
// src/routes/internal.routes.ts
import { FastifyInstance } from 'fastify';
import { validateInternalRequest } from '../middleware/internal-auth';

export default async function internalRoutes(fastify: FastifyInstance) {
  // All internal routes require HMAC authentication
  fastify.addHook('preHandler', validateInternalRequest);

  // Transfer queries
  fastify.get('/transfers/:id', getTransferInternal);
  fastify.get('/transfers/by-ticket/:ticketId', getTransfersByTicket);

  // Ownership verification
  fastify.get('/ownership/:ticketId', verifyOwnership);

  // Transfer operations (for marketplace)
  fastify.post('/transfers/initiate', initiateTransfer);
  fastify.post('/transfers/:id/complete', completeTransfer);

  // User history (for GDPR)
  fastify.get('/users/:userId/transfers', getUserTransfers);
}
```

**2. Register in app.ts:**

```typescript
import internalRoutes from './routes/internal.routes';

await fastify.register(internalRoutes, { prefix: '/internal' });
```

### 6.2 Effort Estimation

| Task | Effort | Dependencies |
|------|--------|--------------|
| Create internal routes file | 2 hours | None |
| Implement P0 endpoints | 3 hours | Route file |
| Implement P1 endpoints | 4 hours | P0 endpoints |
| Update scanning-service to use API | 2 hours | P0 endpoints |
| Refactor ticket-service transfer logic | 4 hours | P1 endpoints |
| **Total P0+P1 Effort** | **~15 hours** | |

### 6.3 Impact Assessment

**If NOT Implemented:**
- scanning-service continues direct DB access (security/maintainability issue)
- marketplace-service cannot properly initiate transfers
- compliance-service has no transfer history access for GDPR
- Duplicate transfer logic remains in ticket-service
- blockchain-service cannot query transfer status

**Security Risk:** LOW-MEDIUM
- Direct DB queries work but bypass service boundaries
- Internal auth middleware exists but is unused

---

## 7. Architecture Clarification Needed

### 7.1 Service Boundary Question

**Who owns ticket transfers?**

| Aspect | ticket-service | transfer-service |
|--------|---------------|-----------------|
| Table ownership | Accesses `ticket_transfers` | Owns `ticket_transfers` |
| Transfer logic | Has `transferService.ts` | Has `transfer.service.ts` |
| Blockchain | No | Yes (Metaplex) |
| Batch transfers | No | Yes |
| Fee calculation | No | Yes |
| Analytics | No | Yes |

**Recommendation:** transfer-service should be the authority. Ticket-service should:
- Remove local transferService.ts
- Call transfer-service internal API
- Focus on ticket CRUD operations only

### 7.2 Outgoing Calls Pattern

transfer-service correctly uses shared clients:

```typescript
import { ticketServiceClient, authServiceClient } from '@tickettoken/shared/clients';
```

Other services should follow this pattern for calling transfer-service once internal endpoints exist.

---

## Summary

| Category | Status | Action Required |
|----------|--------|-----------------|
| Services needing transfer data | 4+ services | Add internal endpoints |
| Current /internal/ routes | **NONE** | Create immediately |
| Internal auth middleware | **EXISTS** | Ready to use |
| Missing critical endpoints | 3 | P0 priority |
| Missing high-priority endpoints | 4 | P1 priority |
| Estimated effort | 15 hours | Week 1-2 |
| Security impact | LOW-MEDIUM | Direct DB bypasses boundaries |

**Recommendation:** Create `/internal/` routes as P1 priority. The internal auth middleware already exists and is well-implemented. Focus on:
1. Transfer status/history queries (P0)
2. Ownership verification for scanning (P0)
3. Transfer initiation for marketplace (P1)
4. User history for GDPR compliance (P1)

---

## Appendix: Service Configuration

| Service | Environment Variable | Port |
|---------|---------------------|------|
| transfer-service | N/A | 3012 |
| blockchain-service | `transferService` in config | 3019 |

**blockchain-service config:**
```typescript
// From backend/services/blockchain-service/src/config/services.ts
transferService: {
  url: process.env.TRANSFER_SERVICE_URL || 'http://transfer-service:3019',
  ...
}
```

**Note:** Port inconsistency (3012 vs 3019) needs verification.
