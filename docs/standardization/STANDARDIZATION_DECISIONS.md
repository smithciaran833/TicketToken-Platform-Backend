# Service Standardization Decisions
**Date:** January 21, 2026
**Status:** FINALIZED
**Purpose:** Document the 4 critical standardization decisions for TicketToken platform

---

## ✅ DECISION #1: Service-to-Service Authentication

**DECIDED: All service-to-service communication uses HMAC-SHA256**

### Specification:
- **Method:** HMAC-SHA256
- **Payload format:** `serviceName:timestamp:method:url:body`
- **Headers required:**
  - `x-internal-service` - Service name
  - `x-internal-timestamp` - Unix timestamp (milliseconds)
  - `x-internal-signature` - HMAC signature (hex)
- **Shared secret:** `INTERNAL_SERVICE_SECRET` environment variable
- **Replay protection:** 5-minute timestamp window
- **Comparison:** Timing-safe (`crypto.timingSafeEqual`)
- **Secret rotation:** Monthly (30 days)
- **Grace period:** 24 hours during rotation (accept both old and new)

### What Changes:
**Services switching FROM JWT to HMAC for S2S calls:**
- auth-service (currently uses JWT for venue/notification calls)
- event-service (currently uses JWT for venue calls)
- blockchain-indexer (currently uses JWT for ticket calls)
- file-service (needs to add HMAC for venue calls)
- notification-service (needs to add HMAC for auth/venue calls)
- marketplace-service (needs to add HMAC - CRITICAL GAP)
- queue-service (needs to add HMAC validation)

**Services already using HMAC (standardize format):**
- ticket-service ✅ (already uses this exact format)
- payment-service ⚠️ (has TWO different HMAC formats - needs consolidation)
- venue-service ✅
- order-service ✅
- blockchain-service ✅
- minting-service ✅
- transfer-service ✅
- scanning-service ✅
- compliance-service ✅
- integration-service ✅
- analytics-service ✅

### What Stays the Same:
- **User authentication** continues to use JWT (RS256/HS256)
- User → API Gateway → Services all use JWT
- Only service-to-service internal calls use HMAC

### Implementation Priority:
**P0 (Critical Gaps - Week 1):**
- marketplace-service: Add HMAC client for ticket/payment calls
- notification-service: Add HMAC client for auth/venue calls
- file-service: Add HMAC client for venue calls (currently uses plain axios)
- queue-service: Add HMAC validation middleware
- blockchain-indexer: Add HMAC for S2S calls

**P1 (Switch from JWT to HMAC - Week 2):**
- auth-service: Replace JWT S2S client with HMAC
- event-service: Replace JWT S2S client with HMAC
- blockchain-indexer: Replace JWT with HMAC

**P2 (Consolidate formats - Week 3):**
- payment-service: Consolidate two HMAC systems into one standard format

---

## ✅ DECISION #2: Internal Endpoint Convention

**DECIDED: Hybrid naming (Option C) + Clear HTTP vs Queue rules (Option D)**

### Naming Convention:
- **GET requests:** REST-style `/internal/{resource}/:id`
- **POST operations:** Action-based `/internal/{resource}/{action}`

### HTTP vs Queue Decision Tree:
```
Does another service need data/action from this service?
│
├─ NO → No /internal/ endpoints needed
│   Examples: analytics-service, search-service, monitoring-service
│
└─ YES → Does it need a synchronous response?
    │
    ├─ NO → Use RabbitMQ events (fire-and-forget)
    │   Examples: notification triggers, analytics events
    │
    └─ YES → Use /internal/ HTTP endpoint
        │
        ├─ Data retrieval → GET /internal/{resource}/:id
        │   Examples: GET /internal/tickets/:id, GET /internal/users/:id
        │
        └─ State change operation → POST /internal/{resource}/{action}
            Examples: POST /internal/payments/refund, POST /internal/tickets/reserve
```

### Services Requiring Internal Endpoints:

**CRITICAL (P0) - Missing Endpoints Block Operations:**

1. **marketplace-service** ⚠️ BLOCKING
   - Missing: `POST /internal/events` (payment-service calls this - 404s)
   - Missing: `GET /internal/listings/:id`
   - Missing: `GET /internal/escrow/:transferId`
   - Missing: `POST /internal/escrow/release`
   - Issue: RabbitMQ stubbed (not publishing)
   - Issue: compliance-service bypasses RLS with direct DB queries

2. **blockchain-indexer** ⚠️ BLOCKING
   - Missing: `POST /internal/marketplace/sales` (payment-service calls this - fails)
   - Needs: Move existing `/api/v1/*` routes to `/internal/*`
   - Missing: `GET /internal/nfts/:tokenId`

**HIGH (P1) - Needed for Proper Architecture:**

3. **transfer-service**
   - Missing: `GET /internal/transfers/:id`
   - Missing: `GET /internal/ownership/:ticketId` (scanning-service needs)
   - Missing: `GET /internal/users/:userId/transfers` (GDPR)
   - Issue: scanning-service bypasses with direct DB access
   - Issue: ticket-service has duplicate transfer logic

4. **file-service**
   - Missing: `GET /internal/users/:userId/files` (GDPR)
   - Missing: `GET /internal/files/:fileId` (metadata validation)
   - Issue: Calls venue-service WITHOUT HMAC

5. **compliance-service**
   - Missing: `POST /internal/ofac/screen` (single source of truth)
   - Missing: `POST /internal/gdpr/export`
   - Missing: `POST /internal/gdpr/delete`
   - Issue: Distributed compliance (payment-service has local AML)

**MEDIUM (P2) - Optional/Enhancement:**

6. **scanning-service**
   - Optional: `GET /internal/tickets/:ticketId/scan-history` (compliance)

7. **integration-service**
   - Optional: `GET /internal/sync-logs/venue/:venueId` (compliance)

### Services Confirmed as NOT Needing Internal Endpoints:
- api-gateway ✅ (entry point, not called by services)
- analytics-service ✅ (queue consumer only)
- search-service ✅ (queue consumer only)
- monitoring-service ✅ (observer role - pulls metrics)
- queue-service ✅ (admin layer - services use Bull/Redis directly)

### Services Already Having Internal Endpoints:
- auth-service ✅ (user lookups)
- ticket-service ✅ (ticket data/operations)
- event-service ✅ (event data)
- payment-service ✅ (payment status)
- venue-service ✅ (venue data)
- order-service ✅ (order data)
- blockchain-service ✅ (minting operations)
- minting-service ✅ (mint status)

---

## ✅ DECISION #3: HTTP Client Pattern

**DECIDED: Mandate @tickettoken/shared library (Option A)**

### The Rule:
ALL services MUST use `@tickettoken/shared` HTTP clients for service-to-service calls.

### Why Option A (Not Gradual Migration):
- HMAC authentication built into shared library - can't be implemented incorrectly
- One place to fix bugs, add features, update circuit breakers
- Eliminates 10+ different custom implementations
- Standardization requires everyone on same client

### Implementation:
**Week 1-2 (P0 Services):**
- marketplace-service
- payment-service
- ticket-service
- blockchain-service

**Week 3-4 (Remaining Services):**
- All other services making S2S calls
- Delete custom HTTP client code

### Migration Path:
```typescript
// BEFORE (custom axios)
const response = await axios.get(`${venueServiceUrl}/api/v1/venues/${venueId}`);

// AFTER (shared client)
import { createServiceClient } from '@tickettoken/shared/clients';
const venueClient = createServiceClient('venue-service', {
  baseUrl: process.env.VENUE_SERVICE_URL,
  hmacSecret: process.env.INTERNAL_SERVICE_KEY
});
const response = await venueClient.get(`/internal/venues/${venueId}`);
```

---

## ✅ DECISION #4: Message Queue Standards

**DECIDED: Clear separation - RabbitMQ for inter-service, Bull for internal jobs (Option A)**

### The Rule:

**1. RabbitMQ = Inter-service events (pub/sub across services)**
- Use when: One service publishes, multiple services consume
- Examples: `ticket.created`, `payment.completed`, `listing.sold`
- Why: Durable queues, message routing, multiple consumers

**2. Bull = Internal background jobs (within one service)**
- Use when: Service needs async work within itself
- Examples: Email retries, analytics aggregation, scheduled tasks
- Why: Simple, Redis-backed, good for single-consumer jobs

### Consolidation Required:

**Week 1 (CRITICAL):**
1. **minting-service queue mismatch** - Change Bull listener to RabbitMQ consumer
2. **marketplace-service RabbitMQ stub** - Replace with real amqplib connection

**Week 2:**
3. **BullMQ → Bull** - Migrate notification-service (1 service)
4. **pg-boss → Bull** - Migrate to Bull (1 service)

### Pattern to Follow:
```typescript
// INTER-SERVICE (RabbitMQ)
await channel.publish('tickettoken_events', 'ticket.created', Buffer.from(JSON.stringify(event)));

// INTERNAL JOBS (Bull)
const emailQueue = new Bull('email-queue', { redis: redisConfig });
await emailQueue.add('send-welcome', { userId, email });
```

### Services Using Correct Pattern:
- notification-service ✅ (RabbitMQ consumer + Bull internal jobs)
- analytics-service ✅ (RabbitMQ consumer)
- search-service ✅ (RabbitMQ consumer)

---

## IMPLEMENTATION ROADMAP

### Week 1 - Critical Blockers (P0)
**HMAC (Decision #1):**
- marketplace-service: Add HMAC client
- file-service: Add HMAC for venue-service calls
- blockchain-indexer: Migrate JWT → HMAC

**Internal Endpoints (Decision #2):**
- marketplace-service: Implement `POST /internal/events` + escrow endpoints
- blockchain-indexer: Implement `POST /internal/marketplace/sales`

**Queues (Decision #4):**
- minting-service: Fix queue mismatch (Bull → RabbitMQ)
- marketplace-service: Replace RabbitMQ stub with real implementation

### Week 2 - High Priority (P1)
**HTTP Clients (Decision #3):**
- Migrate P0 services to shared library (marketplace, payment, ticket, blockchain)

**Internal Endpoints (Decision #2):**
- transfer-service: Implement ownership/transfer endpoints
- file-service: Implement GDPR endpoints
- compliance-service: Implement OFAC/GDPR endpoints

**Queues (Decision #4):**
- Consolidate BullMQ → Bull
- Migrate pg-boss → Bull

### Week 3-4 - Cleanup (P2)
**HTTP Clients (Decision #3):**
- Migrate remaining services to shared library
- Delete custom HTTP client code

**HMAC (Decision #1):**
- payment-service: Consolidate two HMAC formats
- auth-service: Migrate JWT → HMAC for S2S
- event-service: Migrate JWT → HMAC for S2S

**Internal Endpoints (Decision #2):**
- Optional endpoints for scanning-service, integration-service

---

## CRITICAL FINDINGS FROM AUDITS

### Blocking Bugs (Prevent Operations):
1. payment-service → marketplace-service `POST /internal/events` endpoint **doesn't exist** (404)
2. payment-service → blockchain-indexer `POST /internal/marketplace/sales` endpoint **doesn't exist**
3. marketplace-service RabbitMQ is **stubbed** (not actually publishing events)

### Security Gaps:
1. file-service → venue-service calls **missing HMAC** (uses plain axios)
2. compliance-service bypasses RLS with direct DB queries
3. scanning-service bypasses service boundaries with direct DB queries

### Architecture Issues:
1. **Distributed compliance:** payment-service, notification-service have local compliance logic instead of calling compliance-service
2. **Duplicate transfer logic:** ticket-service + transfer-service both handle transfers
3. **Port inconsistencies:** search-service (3012 vs 3020), blockchain-indexer (3012 vs 3019)

### Services with Multiple Auth Methods (Needs Cleanup):
- payment-service (2 different HMAC formats)
- event-service (4 auth methods)
- ticket-service (sends both JWT and HMAC)

---

## AUDIT RESULTS BY SERVICE

### Services Needing Internal Endpoints:

**marketplace-service:**
- Current: NONE
- Missing: 6 P0 endpoints, 4 P1 endpoints
- Callers: payment-service, ticket-service, order-service, compliance-service
- Status: CRITICAL - blocking payment flows

**blockchain-indexer:**
- Current: NONE (routes are under `/api/v1/`)
- Missing: 1 critical endpoint, needs route reorganization
- Callers: payment-service
- Status: CRITICAL - blocking royalty reconciliation

**transfer-service:**
- Current: NONE (middleware exists)
- Missing: 3 P0, 4 P1 endpoints
- Callers: scanning-service, marketplace-service
- Status: HIGH - architecture gaps

**file-service:**
- Current: NONE
- Missing: 2 HIGH, 2 MEDIUM endpoints
- Callers: NONE (uploads via signed URLs, but GDPR needs internal access)
- Status: HIGH - GDPR compliance

**compliance-service:**
- Current: NONE (middleware exists)
- Missing: 3 HIGH, 2 MEDIUM endpoints
- Callers: NONE (but should centralize OFAC/compliance checks)
- Status: HIGH - architecture improvement

**scanning-service:**
- Current: NONE
- Missing: 1 optional endpoint
- Callers: NONE
- Status: LOW - optional enhancement

**integration-service:**
- Current: NONE (middleware exists)
- Missing: 1 optional endpoint
- Callers: NONE (decoupled from venue-service)
- Status: LOW - optional enhancement

### Services NOT Needing Internal Endpoints:

**analytics-service:**
- Role: Queue consumer (RabbitMQ wildcard `#` binding)
- Callers: NONE (only api-gateway proxy for dashboards)
- Recommendation: Keep as-is

**search-service:**
- Role: Queue consumer (RabbitMQ `search.sync` exchange)
- Callers: NONE (only api-gateway proxy)
- Issue: Port discrepancy (3012 vs 3020)
- Recommendation: Keep as-is, fix port

**api-gateway:**
- Role: Entry point, routes external traffic
- Callers: NONE (monitoring health checks don't count)
- Recommendation: Keep as-is

**monitoring-service:**
- Role: Observer, pulls metrics via `/health` endpoints
- Callers: NONE (config exists but unused)
- Recommendation: Keep as-is

**queue-service:**
- Role: Admin/monitoring layer (services use Bull/Redis directly)
- Callers: NONE
- Recommendation: Keep as-is

---

## OPEN QUESTIONS RESOLVED

1. ~~**Decision #2:** Which services actually need `/internal/` endpoints but don't have them?~~
   - **RESOLVED:** See audit results above

2. ~~**Decision #3:** Acceptable to have mixed HTTP clients short-term?~~
   - **RESOLVED:** No - mandate shared library for true standardization

3. ~~**Decision #4:** Timeline for minting-service queue migration?~~
   - **RESOLVED:** Week 1 (critical)

4. **Secret Rotation:** Who manages the monthly HMAC secret rotation?
   - **TO DECIDE:** DevOps team or automated rotation script

5. **Monitoring:** How do we detect if services use wrong auth method?
   - **TO IMPLEMENT:** Add logging/metrics in HMAC middleware to track auth failures

---

## SUCCESS CRITERIA

### Decision #1 - HMAC Authentication:
- [ ] All services use HMAC for S2S calls
- [ ] No services use JWT for internal endpoints
- [ ] payment-service consolidated to single HMAC format
- [ ] Secret rotation process documented

### Decision #2 - Internal Endpoints:
- [ ] marketplace-service `POST /internal/events` implemented and working
- [ ] blockchain-indexer `POST /internal/marketplace/sales` implemented
- [ ] All P0 endpoints implemented
- [ ] Services stop bypassing boundaries with direct DB access

### Decision #3 - HTTP Clients:
- [ ] All services use `@tickettoken/shared` clients
- [ ] Custom HTTP client code deleted
- [ ] Circuit breakers working consistently

### Decision #4 - Message Queues:
- [ ] minting-service using RabbitMQ (not Bull)
- [ ] marketplace-service RabbitMQ live (not stubbed)
- [ ] BullMQ consolidated to Bull
- [ ] pg-boss migrated to Bull
- [ ] Clear documentation: when to use RabbitMQ vs Bull

---

**STATUS:** All 4 decisions finalized. Ready for implementation.
**NEXT STEP:** Begin Week 1 P0 implementation.
