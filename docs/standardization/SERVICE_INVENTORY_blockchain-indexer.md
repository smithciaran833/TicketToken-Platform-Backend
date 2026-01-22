# blockchain-indexer Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how blockchain-indexer implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** JWT authentication with algorithm whitelist + Service JWT for S2S
**Files Examined:**
- `src/middleware/auth.ts` - JWT verification with security best practices
- `src/middleware/auth-audit.ts` - Per-endpoint authorization rules and audit logging

### JWT Authentication (User Requests)

**How it works:**
- Algorithm whitelist: `HS256, HS384, HS512, RS256, RS384, RS512` (no 'none')
- Issuer validation: `JWT_ISSUER` env var (default: `tickettoken-auth-service`)
- Audience validation: `JWT_AUDIENCE` env var (default: `blockchain-indexer`)
- Requires either `userId` or `serviceId` in token payload
- RFC 7807 Problem Details error responses
- Weak secret detection in non-test environments

**Security Audit Fixes Applied:**
- SEC-4: JWT algorithm whitelist (no weak algorithms)
- S2S-4: Issuer (iss) claim validation
- S2S-5: Audience (aud) claim validation
- LOG-4: Security event logging

**Code Example:**
```typescript
// From middleware/auth.ts
const ALLOWED_ALGORITHMS: jwt.Algorithm[] = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512'];
const EXPECTED_ISSUER = process.env.JWT_ISSUER || 'tickettoken-auth-service';
const EXPECTED_AUDIENCE = process.env.JWT_AUDIENCE || 'blockchain-indexer';

export async function verifyJWT(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const [bearer, token] = authHeader.split(' ');

  // Verify with algorithm whitelist, issuer, and audience
  const decoded = jwt.verify(token, jwtSecret, {
    algorithms: ALLOWED_ALGORITHMS,
    issuer: EXPECTED_ISSUER,
    audience: EXPECTED_AUDIENCE,
    complete: false
  }) as JWTPayload;

  // Additional validation - require identity claim
  if (!decoded.userId && !decoded.serviceId) {
    logSecurityEvent('AUTH_MISSING_IDENTITY', request);
    throw AuthenticationError.invalidToken('Token missing required identity claims');
  }

  request.user = decoded;
}
```

### Service JWT (S2S Requests)

```typescript
// From middleware/auth.ts
export async function verifyServiceJWT(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const decoded = jwt.verify(token, jwtSecret, {
    algorithms: ALLOWED_ALGORITHMS,
    complete: false
  }) as JWTPayload;

  // Service tokens must have serviceId
  if (!decoded.serviceId) {
    logSecurityEvent('AUTH_NOT_SERVICE_TOKEN', request);
    throw AuthenticationError.insufficientPermissions('Not a service token');
  }

  request.user = decoded;
  (request as any).internalService = decoded.serviceId;
}
```

### Per-Endpoint Authorization Rules (S2S-10)

| Endpoint Pattern | Authorization |
|-----------------|---------------|
| `GET:/health`, `/live`, `/ready`, `/startup`, `/metrics` | `allowAnonymous: true` |
| `GET:/api/v1/transactions/*` | `allowS2S: true` |
| `GET:/api/v1/wallets/*` | `allowS2S: true` |
| `GET:/api/v1/nfts/*` | `allowS2S: true` |
| `GET:/api/v1/marketplace/*` | `allowS2S: true` |
| `GET:/api/v1/sync/*` | `allowS2S: true` |
| `GET:/api/v1/reconciliation/*` | `allowS2S: true` |
| `POST:/internal/*` | `allowS2S: true, roles: ['service']` |
| `POST:/admin/*`, `DELETE:/admin/*` | `roles: ['admin']` |

---

## Category 2: Internal Endpoint Patterns

**Implementation:** No dedicated `/internal/` routes
**Files Examined:**
- `src/routes/query.routes.ts`
- `src/routes/health.routes.ts`

**Findings:**
- blockchain-indexer does **not expose** dedicated `/internal/` routes
- Authorization rules reference `POST:/internal/*` but no such routes exist
- This is a **read-only indexer service** - it indexes blockchain data and exposes query APIs
- Other services don't call blockchain-indexer for writes; it pushes data to ticket-service

**Public API Routes (all require JWT):**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/transactions/:signature` | GET | Get transaction by signature |
| `/api/v1/transactions/by-slot/:slot` | GET | Get transactions by slot |
| `/api/v1/wallets/:address/activity` | GET | Get wallet activity |
| `/api/v1/nfts/:tokenId/history` | GET | Get NFT transfer history |
| `/api/v1/marketplace/activity` | GET | Get marketplace activity |
| `/api/v1/sync/status` | GET | Get indexer sync status |
| `/api/v1/reconciliation/discrepancies` | GET | Get ownership discrepancies |

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** Shared `@tickettoken/shared/clients` library
**Files Examined:**
- `src/processors/transactionProcessor.ts` - Uses ticketServiceClient
- `src/reconciliation/reconciliationEngine.ts` - Database queries only
- `src/reconciliation/reconciliationEnhanced.ts` - Uses fetch for RPC

### Ticket Service Client

**How it works:**
- Uses shared library `@tickettoken/shared/clients` with `ticketServiceClient`
- Creates system context with `tenantId: 'system'` for background operations
- Called when processing blockchain events to update ticket state

**Operations Called:**
| Operation | Purpose |
|-----------|---------|
| `updateBlockchainSyncByToken()` | Update ticket sync status after mint/burn |
| `recordBlockchainTransfer()` | Record ownership transfers |

**Code Example:**
```typescript
// From processors/transactionProcessor.ts
import { ticketServiceClient } from '@tickettoken/shared/clients';
import { RequestContext } from '@tickettoken/shared/http-client/base-service-client';

function createSystemContext(): RequestContext {
  return {
    tenantId: 'system',
    traceId: `txproc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

// On NFT mint
await ticketServiceClient.updateBlockchainSyncByToken(mintData.tokenId, {
  isMinted: true,
  mintTransactionId: signature,
  walletAddress: mintData.owner,
  lastIndexedAt: new Date().toISOString(),
  syncStatus: 'SYNCED',
}, ctx);

// On NFT transfer
await ticketServiceClient.recordBlockchainTransfer({
  tokenId: transferData.tokenId,
  fromWallet: transferData.previousOwner || '',
  toWallet: transferData.newOwner,
  transactionSignature: signature,
  blockTime: blockTime ?? undefined,
  slot,
  metadata: { slot },
}, ctx);
```

### RPC Failover Manager

The indexer also connects to Solana RPC nodes with failover support:

```typescript
// From indexer.ts
this.rpcManager = new RPCFailoverManager({
  endpoints: rpcEndpoints,
  healthCheckIntervalMs: 30000,
  maxConsecutiveFailures: 3,
  connectionConfig: {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 30000 // 30s timeout
  }
});

// Execute with automatic failover
const signatures = await this.rpcManager.executeWithFailover(
  async (conn) => conn.getSignaturesForAddress(programId, { limit: batchSize }, 'confirmed'),
  'poll:getSignaturesForAddress'
);
```

---

## Category 4: Message Queues

**Implementation:** None - uses Redis for event deduplication only
**Files Examined:**
- Searched for: amqplib, rabbitmq, Bull, bullmq, pg-boss
- `src/utils/events.ts` - Event utilities (local only, no queue)
- `src/utils/redis.ts` - Redis connection

**Findings:**
- blockchain-indexer does **not use any message queues**
- It is a **polling-based indexer** that reads from Solana blockchain
- Uses Redis for:
  - Event deduplication (24-hour TTL)
  - Caching
  - Distributed locking
- Communication is synchronous: reads blockchain → writes to MongoDB/PostgreSQL → calls ticket-service HTTP API

### Event Deduplication (Redis-based)

```typescript
// From utils/events.ts
export class EventDeduplicator {
  private redis: Redis;
  private keyPrefix: string;
  private ttlSeconds: number; // Default: 24 hours

  async checkAndMark(event: BaseEvent): Promise<boolean> {
    const key = this.buildKey(event.metadata.eventId, event.metadata.eventType);

    // Use SET NX (only set if not exists) with EXPIRE
    const result = await this.redis.set(key, data, 'EX', this.ttlSeconds, 'NX');

    // Returns 'OK' if key was set (event is new), null if key exists (duplicate)
    return result === 'OK';
  }
}
```

### Event Types (Local Use)

| Event Type | Description |
|------------|-------------|
| `blockchain.transaction.processed` | Transaction indexed |
| `blockchain.nft.minted` | NFT mint detected |
| `blockchain.nft.transferred` | NFT transfer detected |
| `blockchain.nft.burned` | NFT burn detected |
| `blockchain.marketplace.activity` | Marketplace event |
| `blockchain.discrepancy.detected` | Ownership mismatch found |

**Note:** These events are created locally for deduplication and logging but are **not published to a message queue**. The indexer communicates state changes directly via HTTP to ticket-service.

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT with algorithm whitelist + S2S JWT | Issuer/audience validation |
| Internal Endpoints | **None** | Read-only query service |
| HTTP Client (Outgoing) | `@tickettoken/shared/clients` | Calls ticket-service for state updates |
| Message Queues | **None** | Uses Redis for deduplication only |

**Key Characteristics:**
- blockchain-indexer is a **read-and-forward service** - reads blockchain, writes to databases, notifies ticket-service
- Does not expose internal endpoints - other services query via public API
- Uses polling with overlap protection and RPC failover for reliability
- Dual-write pattern: PostgreSQL for indexer state + MongoDB for full transaction data
- Failed MongoDB writes are tracked in PostgreSQL for recovery (`failed_mongodb_writes` table)
