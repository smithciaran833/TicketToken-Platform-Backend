# Phase A Continuation - 12 Remaining Services

**Date:** January 22, 2026
**Status:** WEEK 1 COMPLETE ✅
**Purpose:** Migration plan for standardizing HMAC authentication across remaining services

---

## Week 1 Migration Complete (4 Services)

| Service | Middleware Added | Tests | Status |
|---------|-----------------|-------|--------|
| **blockchain-indexer** | `src/middleware/internal-auth.middleware.ts` | 12/12 ✅ | COMPLETE |
| **api-gateway** | `src/middleware/internal-auth.middleware.ts` + payment.routes.ts fix | 12/12 ✅ | COMPLETE |
| **analytics-service** | `src/middleware/internal-auth.middleware.ts` | 12/12 ✅ | COMPLETE |
| **compliance-service** | `src/middleware/internal-auth.middleware.ts` (Express) | 12/12 ✅ | COMPLETE |

**Total Tests Added:** 48 (12 per service × 4 services)
**All Tests Passing:** Yes

---

## Validation Summary

| Batch | Category | Original Assessment | Validated | Adjustments |
|-------|----------|---------------------|-----------|-------------|
| **Batch 1** | Format Standardization | 6 services | **CONFIRMED** | ticket-service more complex than expected |
| **Batch 2** | JWT → HMAC Migration | 3 services | **NEEDS ADJUSTMENT** | event-service is HYBRID, not pure JWT |
| **Batch 3** | Infrastructure | 3 services | **CONFIRMED** | search-service can be SKIPPED (no S2S) |

### Key Findings

1. **Batch 1** services have HMAC implementations, but with varying degrees of standard compliance
2. **Batch 2** is mislabeled - event-service has partial HMAC, blockchain-indexer just needs feature flag
3. **Batch 3** api-gateway is 60% complete; search-service requires no migration (no S2S calls)

---

## Batch 1: Format Standardization (6 services)

### Service: ticket-service

**Current HMAC:** PARTIAL (Multiple implementations coexist)

**Format Match:** DIFFERENT

| Standard Header | Status | Current Implementation |
|-----------------|--------|----------------------|
| x-internal-service | ✅ Present | Used in internalRoutes |
| x-internal-timestamp | ✅ Present | Used in internalRoutes |
| x-internal-nonce | ❌ Missing | Not included in signature |
| x-internal-signature | ✅ Present | Custom HMAC-SHA256 |
| x-internal-body-hash | ❌ Missing | Body not signed |

**Issues Found:**
- 3 different S2S client implementations with different auth approaches
- **SECURITY:** Temporary signature bypass (`temp-signature`) in production code
- Mixed HMAC/JWT approach in InterServiceClient
- Webhook routes use different header names
- OrderServiceClient has minimal auth (only service name header)
- Shared `INTERNAL_SERVICE_SECRET` needs per-service breakdown

**Outgoing S2S Calls:**
| Client | Target | Auth Method |
|--------|--------|-------------|
| OrderServiceClient | order-service | X-Service-Name only (WEAK) |
| MintingServiceClient | minting-service | X-Internal-Auth header |
| InterServiceClient | auth/event/payment/notification | JWT + Legacy HMAC |

**Internal Routes:** 13 routes under `/internal/` using `verifyInternalService` middleware

**Migration Complexity:** **MODERATE-HIGH**

**Recommendation:** Migration order: **5** (significant cleanup required)

**Notes:** Remove temp-signature bypass immediately. Consolidate three client implementations into shared BaseServiceClient.

---

### Service: blockchain-service

**Current HMAC:** PARTIAL (Two parallel implementations)

**Format Match:** CLOSE

| Standard Header | Status | Current Implementation |
|-----------------|--------|----------------------|
| x-internal-service | ✅ Present | Used in internal-auth.ts |
| x-internal-timestamp | ❌ Different | Uses `x-timestamp` instead |
| x-internal-nonce | ❌ Missing | Not implemented |
| x-internal-signature | ✅ Present | HMAC-SHA256 |
| x-internal-body-hash | ❌ Missing | Not implemented |

**Issues Found:**
- Custom implementation in `/src/middleware/internal-auth.ts`
- Standard implementation via `@tickettoken/shared/clients` used in mintQueue/mint-worker
- One direct axios call bypasses shared client patterns (internal-mint.routes.ts)

**Outgoing S2S Calls:**
| Target | Method | Auth |
|--------|--------|------|
| minting-service | POST /internal/mint | Custom HMAC (non-standard) |
| ticket-service | via shared client | Standard HMAC |
| venue-service | via shared client | Standard HMAC |
| event-service | via shared client | Standard HMAC |
| order-service | via shared client | Standard HMAC |

**Internal Routes:** 1 route (`/internal/mint-tickets`) with custom HMAC validation

**Migration Complexity:** **MODERATE**

**Recommendation:** Migration order: **2**

**Notes:** Rename x-timestamp → x-internal-timestamp. Add nonce support. Replace custom internal-auth.ts with shared HmacValidator.

---

### Service: minting-service

**Current HMAC:** PARTIAL (Non-standard implementation)

**Format Match:** DIFFERENT

| Standard Header | Status | Current Implementation |
|-----------------|--------|----------------------|
| x-internal-service | ✅ Present | Matches standard |
| x-internal-timestamp | ❌ Different | Uses `x-timestamp` |
| x-internal-nonce | ❌ Missing | **CRITICAL: Replay attack vulnerable** |
| x-internal-signature | ✅ Present | Matches standard |
| x-internal-body-hash | ❌ Missing | Uses full body in payload |

**Issues Found:**
- **SECURITY:** No nonce validation = replay attack vulnerability
- Custom payload format: `${service}:${timestamp}:${body}` vs standard `${service}:${timestamp}:${nonce}:${method}:${path}:${bodyHash}`
- Outgoing calls via BaseServiceClient are already HMAC-ready

**Outgoing S2S Calls:**
| Target | Method | Auth |
|--------|--------|------|
| event-service | getEventPda(), getEventInternal() | Standard HMAC via shared client |
| ticket-service | updateNft() | Standard HMAC via shared client |

**Internal Routes:** 3 routes (`/internal/mint`, `/internal/mint/batch`, `/internal/mint/status/:ticketId`)

**Migration Complexity:** **MODERATE**

**Recommendation:** Migration order: **3**

**Notes:** Add nonce store (Redis) for replay prevention. Replace custom middleware with shared HmacValidator.

---

### Service: transfer-service

**Current HMAC:** PARTIAL (Custom implementation)

**Format Match:** DIFFERENT

| Standard Header | Status | Current Implementation |
|-----------------|--------|----------------------|
| x-internal-service | ✅ Present | Used in internal-auth.ts |
| x-internal-timestamp | ✅ Present | Matches |
| x-internal-nonce | ❌ Missing | Not in signature |
| x-internal-signature | ✅ Present | Matches |
| x-internal-body-hash | ❌ Missing | Not used |

**Issues Found:**
- HMAC middleware exists but is NOT registered on any routes
- `validateInternalRequest()` is defined but never used
- `buildInternalHeaders()` and `createInternalFetch()` exist but only tested, not used
- Webhook service uses custom HMAC (different from S2S HMAC)
- **NO /internal/ routes currently exposed**

**Outgoing S2S Calls:**
| Target | Method | Auth |
|--------|--------|------|
| Webhook deliveries | POST to external URLs | Custom webhook HMAC |

**Internal Routes:** NONE (middleware exists but not applied)

**Migration Complexity:** **MODERATE**

**Recommendation:** Migration order: **4**

**Notes:** Identify which operations should be exposed as /internal/ routes. Integrate with shared HMAC module. Current code is prepared but unused.

---

### Service: compliance-service

**Current HMAC:** PARTIAL (Webhook HMAC works, S2S not standardized)

**Format Match:** CLOSE

| Standard Header | Status | Current Implementation |
|-----------------|--------|----------------------|
| x-internal-service | ⚠️ Different | Uses `x-service-id` |
| x-internal-timestamp | ⚠️ Different | Uses `x-webhook-timestamp` for webhooks |
| x-internal-nonce | ⚠️ Different | Uses `x-webhook-nonce` for webhooks |
| x-internal-signature | ⚠️ Different | Uses `x-webhook-signature` for webhooks |
| x-internal-body-hash | ❌ Missing | Not implemented |

**Issues Found:**
- Two different internal auth implementations exist
- Webhook HMAC properly implemented with timing-safe comparison
- S2S internal auth uses `x-internal-service-secret` (legacy shared secret, not HMAC)
- **NO /internal/ routes exposed**
- **NO outgoing S2S HTTP calls** (compliance-service is data owner, not client)

**Outgoing S2S Calls:** NONE

**Internal Routes:** NONE

**Migration Complexity:** **SIMPLE-MODERATE**

**Recommendation:** Migration order: **1** (lowest risk - no S2S calls)

**Notes:** Unify internal auth to use standard HMAC headers. Remove duplicate internal-auth.ts. Currently low priority since no S2S dependencies.

---

### Service: analytics-service

**Current HMAC:** PARTIAL (Legacy + shared parallel)

**Format Match:** DIFFERENT

| Standard Header | Status | Current Implementation |
|-----------------|--------|----------------------|
| x-internal-service | ✅ Present | In legacy internal-auth.ts |
| x-internal-timestamp | ✅ Present | 5-minute window |
| x-internal-nonce | ❌ Missing | Not implemented in legacy |
| x-internal-signature | ✅ Present | HMAC-SHA256 |
| x-internal-body-hash | ❌ Missing | Signs service:timestamp:method:path:body |

**Issues Found:**
- Custom legacy HMAC in `/src/middleware/internal-auth.ts`
- Standard HMAC available via shared module (feature-flagged)
- **NO /internal/ routes exposed**
- Primarily event-driven (RabbitMQ), minimal HTTP S2S

**Outgoing S2S Calls:** Minimal (via BaseServiceClient if needed)

**Internal Routes:** NONE (service has no S2S routes exposed)

**Migration Complexity:** **SIMPLE**

**Recommendation:** Migration order: **1** (tied with compliance-service)

**Notes:** Enable `USE_NEW_HMAC=true`. Remove custom internal-auth.ts. Low priority since no exposed /internal/ routes.

---

## Batch 2: JWT → HMAC Migration (3 services)

### Service: auth-service

**Current S2S Auth:** JWT (RS256)

**Format Match:** NO (uses JWT, not HMAC)

| Standard Header | Status | Current Implementation |
|-----------------|--------|----------------------|
| All HMAC headers | ❌ Missing | Uses `x-service-token` (JWT) |

**Issues Found:**
- Uses separate S2S keypair from user JWT (good practice)
- Well-structured S2S middleware with service allowlist
- HTTP clients prepared (`internalClients`) but NOT used for outgoing calls
- **NO outgoing S2S calls currently made** (receives calls only)

**Outgoing S2S Calls:**
| Target | Status | Auth |
|--------|--------|------|
| venue-service | Defined but NOT USED | Would use JWT |
| notification-service | Defined but NOT USED | Would use JWT |
| api-gateway | Defined but NOT USED | Would use JWT |

**Internal Routes:** 9 routes under `/auth/internal/*` using `verifyServiceToken()` (JWT)

**Migration Complexity:** **MODERATE**

**Recommendation:** Migration order: **2** (critical service, careful migration)

**Notes:** Central authentication service. Migration requires parallel support (accept both JWT and HMAC during transition). Focus on incoming /internal/ routes first.

---

### Service: event-service

**Current S2S Auth:** HYBRID (Custom JWT-like token + Raw HMAC)

**Format Match:** CLOSE

| Standard Header | Status | Outgoing | Incoming |
|-----------------|--------|----------|----------|
| x-internal-service | ✅ Present | X-Service-ID | ✅ Present |
| x-internal-timestamp | ✅ Present | In token | ✅ Present |
| x-internal-nonce | ❌ Missing | In token (not separate header) | ❌ Missing |
| x-internal-signature | ⚠️ Different | X-Service-Token (base64 JSON) | ✅ Present |
| x-internal-body-hash | ❌ Missing | Not used | ❌ Missing |

**Issues Found:**
- Outgoing calls use custom JWT-like token (base64-encoded JSON with HMAC signature)
- Incoming /internal/ routes use raw HMAC (non-standard)
- **NOT a pure JWT service** - categorization was incorrect
- Has HMAC infrastructure but non-standard format

**Outgoing S2S Calls:**
| Target | Method | Auth |
|--------|--------|------|
| venue-service | GET /api/v1/venues/:id | X-Service-Token (custom) |
| venue-service | GET /health/live | X-Service-Token |
| auth-service | GET /health/live | X-Service-Token |

**Internal Routes:** 3 routes (`/internal/events/:id`, `/internal/events/:id/pda`, `/internal/events/:id/scan-stats`)

**Migration Complexity:** **MODERATE**

**Recommendation:** Migration order: **3**

**Notes:** Standardize both incoming and outgoing to use standard HMAC headers. Remove custom JWT-like token implementation.

---

### Service: blockchain-indexer

**Current S2S Auth:** JWT (via shared BaseServiceClient)

**Format Match:** **EXACT** (if HMAC enabled)

| Standard Header | Status | When USE_NEW_HMAC=true |
|-----------------|--------|------------------------|
| x-internal-service | ✅ Ready | Sent via BaseServiceClient |
| x-internal-timestamp | ✅ Ready | Sent via BaseServiceClient |
| x-internal-nonce | ✅ Ready | Sent via BaseServiceClient |
| x-internal-signature | ✅ Ready | Sent via BaseServiceClient |
| x-internal-body-hash | ✅ Ready | Sent via BaseServiceClient |

**Issues Found:**
- Uses `@tickettoken/shared/clients` which has full HMAC support
- Currently using legacy API key auth (USE_NEW_HMAC=false)
- **Just needs feature flag enabled**

**Outgoing S2S Calls:**
| Target | Method | Auth (current) | Auth (with flag) |
|--------|--------|----------------|------------------|
| ticket-service | checkTokenExists, getTicketByToken, updateMarketplaceStatus, etc. | API Key | HMAC |

**Internal Routes:** 1 route (`POST /internal/*`) using JWT

**Migration Complexity:** **SIMPLE**

**Recommendation:** Migration order: **1** (just enable flag)

**Notes:** Set `USE_NEW_HMAC=true` and `INTERNAL_HMAC_SECRET`. Verify ticket-service accepts HMAC.

---

## Batch 3: Infrastructure (3 services)

### Service: api-gateway

**Current Proxy Auth:** HMAC (60% complete)

**Format Match:** EXACT (for routes using `createAuthenticatedProxy()`)

| Route Category | HMAC Status | Files |
|----------------|-------------|-------|
| All standard proxies | ✅ HMAC | venues, events, tickets, marketplace, notification, analytics, compliance, file, integration, queue, search, auth |
| **payment.routes.ts** | ❌ **MISSING** | Direct axios without HMAC |
| webhook.routes.ts | ⚠️ By design | External webhooks (should NOT have internal auth) |

**Issues Found:**
- `generateInternalAuthHeaders()` properly implemented
- 16/18 proxy routes have HMAC authentication
- **CRITICAL GAP:** `payment.routes.ts` missing HMAC (lines 52-117)
- `tickets.routes.ts` has duplicate proxy logic (works but needs consolidation)

**Backend Services Proxied:**
- auth-service ✅
- venue-service ✅
- event-service ✅
- ticket-service ✅
- **payment-service ❌ MISSING HMAC**
- marketplace-service ✅
- (and 12 more with HMAC)

**Migration Complexity:** **SIMPLE-MODERATE**

**Recommendation:** Migration order: **1**

**Notes:** Add 3 lines to payment.routes.ts. Webhook routes intentionally bypass internal auth (external provider signatures). Consolidate duplicate proxy patterns.

---

### Service: monitoring-service

**Current Auth:** NONE (bare axios for health checks)

**Format Match:** NON-COMPLIANT

| Standard Header | Status |
|-----------------|--------|
| All HMAC headers | ❌ Missing |

**Issues Found:**
- All health check calls use bare `axios.get()` without authentication
- 5 files need HMAC wrapper:
  - `service.checker.ts`
  - `health.service.ts`
  - `http.collector.ts`
  - `notification.manager.ts`
  - `sales-tracker.ts`
- System-level calls without tenant context

**Outgoing S2S Calls:**
| Target | Method | Auth |
|--------|--------|------|
| All services | GET /health | NONE |
| All services | GET /health/* | NONE |
| PagerDuty | POST | None (external) |
| Custom webhooks | POST | None |

**Internal Routes:** NONE

**Migration Complexity:** **MODERATE**

**Recommendation:** Migration order: **2**

**Notes:** Wrap health check calls with HMAC. May need special "system" tenant handling. External webhook calls (PagerDuty) should NOT have internal HMAC.

---

### Service: search-service

**Current Auth:** JWT only (no S2S)

**Format Match:** N/A (no S2S calls)

**Issues Found:**
- **ZERO outgoing S2S HTTP calls**
- Communicates via: PostgreSQL, MongoDB, Elasticsearch, Redis, RabbitMQ (all direct clients)
- Pure queue consumer architecture
- No /internal/ routes exposed

**Outgoing S2S Calls:** NONE

**Internal Routes:** NONE

**Migration Complexity:** **NONE REQUIRED**

**Recommendation:** **SKIP**

**Notes:** No action needed. Search-service is self-contained queue consumer with no S2S HTTP dependencies.

---

## Recommended Migration Order

### Week 1 - Low Risk Services (Quick Wins):

| # | Service | Reason | Effort |
|---|---------|--------|--------|
| 1 | **blockchain-indexer** | Just enable USE_NEW_HMAC flag, shared client ready | 1 hour |
| 2 | **api-gateway** | Add 3 lines to payment.routes.ts | 2 hours |
| 3 | **analytics-service** | Enable flag, remove legacy middleware | 3 hours |
| 4 | **compliance-service** | No S2S dependencies, unify auth headers | 4 hours |

### Week 2 - Medium Risk Services:

| # | Service | Reason | Effort |
|---|---------|--------|--------|
| 5 | **blockchain-service** | Rename headers, add nonce, replace custom auth | 6 hours |
| 6 | **minting-service** | Add nonce store, fix replay vulnerability | 6 hours |
| 7 | **monitoring-service** | Wrap all health check calls | 8 hours |
| 8 | **transfer-service** | Integrate unused middleware, identify internal routes | 6 hours |

### Week 3 - High Risk Services:

| # | Service | Reason | Effort |
|---|---------|--------|--------|
| 9 | **auth-service** | Critical service, needs parallel auth support | 12 hours |
| 10 | **event-service** | Standardize hybrid implementation | 10 hours |
| 11 | **ticket-service** | Complex cleanup: 3 clients, temp-signature, consolidation | 16 hours |

### Week 4 - Skip:

| Service | Reason |
|---------|--------|
| **search-service** | No S2S calls, no migration needed |

---

## Critical Findings

### Security Issues Requiring Immediate Attention

1. **ticket-service: `temp-signature` bypass** (internal-auth.ts:35-38)
   - Allows requests with signature `temp-signature` to pass validation
   - **SEVERITY:** HIGH - Must remove before production

2. **minting-service: Replay attack vulnerability**
   - No nonce validation in HMAC
   - Attackers can replay requests within 5-minute window
   - **SEVERITY:** HIGH - Add Redis nonce store

3. **api-gateway: payment-service calls unauthenticated**
   - `payment.routes.ts` makes direct axios calls without HMAC
   - **SEVERITY:** MEDIUM - Add generateInternalAuthHeaders()

### Batch Categorization Corrections

1. **event-service** is HYBRID (has partial HMAC), not pure JWT
   - Reclassify from "JWT → HMAC" to "Format Standardization"

2. **blockchain-indexer** just needs feature flag
   - Simpler than expected, move to Week 1

3. **search-service** has no S2S calls
   - Remove from migration scope entirely

### Architecture Issues

1. **Inconsistent header naming:**
   - `x-timestamp` vs `x-internal-timestamp`
   - `X-Service-Token` vs `x-internal-signature`
   - Must standardize to `x-internal-*` prefix

2. **Multiple HMAC implementations:**
   - Custom per-service (ticket, blockchain, minting, transfer, compliance, analytics)
   - Shared module `@tickettoken/shared/hmac`
   - Must migrate all to shared module

3. **Unused code:**
   - transfer-service has HMAC middleware defined but not registered
   - auth-service has HTTP clients defined but not used

---

## Ready to Proceed?

**YES** - with the following conditions:

1. ✅ Phase A (9 services) already complete and tested
2. ✅ Shared HMAC module (`@tickettoken/shared/hmac`) available and tested
3. ✅ Feature flag pattern (`USE_NEW_HMAC`) established
4. ✅ Integration test pattern (12 tests per service) established

**Prerequisites before Week 1:**
- [ ] Remove `temp-signature` bypass from ticket-service (security fix)
- [ ] Ensure Redis available for nonce stores
- [ ] Verify all services have `INTERNAL_HMAC_SECRET` env var configured

**Rollback Strategy:**
- All services support dual-mode (legacy + HMAC) via feature flag
- Feature flag can be disabled per-service without deployment
- 5-minute timestamp window allows gradual rollout

---

## Appendix: Service Analysis Summary

| Service | Current HMAC | Format Match | /internal/ Routes | Outgoing S2S | Complexity |
|---------|--------------|--------------|-------------------|--------------|------------|
| ticket-service | PARTIAL | DIFFERENT | 13 routes | 3 targets | MODERATE-HIGH |
| blockchain-service | PARTIAL | CLOSE | 1 route | 5 targets | MODERATE |
| minting-service | PARTIAL | DIFFERENT | 3 routes | 2 targets | MODERATE |
| transfer-service | PARTIAL | DIFFERENT | 0 routes | 1 target | MODERATE |
| compliance-service | PARTIAL | CLOSE | 0 routes | 0 targets | SIMPLE |
| analytics-service | PARTIAL | DIFFERENT | 0 routes | Minimal | SIMPLE |
| auth-service | NO (JWT) | N/A | 9 routes | 0 targets | MODERATE |
| event-service | HYBRID | CLOSE | 3 routes | 2 targets | MODERATE |
| blockchain-indexer | NO (JWT) | EXACT* | 1 route | 1 target | SIMPLE |
| api-gateway | 60% | EXACT | N/A | 18 targets | SIMPLE |
| monitoring-service | NO | N/A | 0 routes | 8 targets | MODERATE |
| search-service | N/A | N/A | 0 routes | 0 targets | **SKIP** |

*blockchain-indexer format is EXACT when USE_NEW_HMAC=true

---

**Document Version:** 1.0
**Last Updated:** January 22, 2026
**Author:** Automated Analysis
