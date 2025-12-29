# Marketplace Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Multi-Tenancy | 2 | CRITICAL |
| Idempotency | 1 | HIGH |
| S2S Auth | 1 | HIGH |
| Validation | 1 | HIGH |
| Refunds | 1 | HIGH |
| Operational | 2 | MEDIUM |
| Frontend Features | 2 | MEDIUM |

**Good News:** Authentication is actually implemented (unlike order-service).

---

## CRITICAL Issues

### GAP-MARKETPLACE-001: Silent Failure on Tenant Context
- **Severity:** CRITICAL
- **Audit:** 09-multi-tenancy.md
- **Current:** When tenant context fails, request proceeds anyway
- **Risk:** Cross-tenant data leakage, wrong tenant sees other's listings
- **Fix:**
```typescript
if (!tenantId) {
  reply.status(500).send({ error: 'Failed to establish tenant context' });
  return;
}
```

### GAP-MARKETPLACE-002: No Tenant in Model Methods
- **Severity:** CRITICAL
- **Audit:** 09-multi-tenancy.md
- **Current:**
  - Models use global `db` import
  - tenant_id relies on DB default, not passed explicitly
  - No tenant parameter in method signatures
- **Risk:** Queries could return cross-tenant data if RLS bypassed

---

## HIGH Issues

### GAP-MARKETPLACE-003: Zero Idempotency Implementation
- **Severity:** HIGH
- **Audit:** 07-idempotency.md
- **Current:**
  - No idempotency middleware exists
  - No header parsing
  - No Redis storage of keys
  - No duplicate detection
- **Critical endpoints missing idempotency:**
  - `initiateTransfer` - could duplicate transfers
  - `completeFiatTransfer` - could double-charge
  - POST /listings - could create duplicate listings
  - POST /purchase - could duplicate purchases
- **Fix:** Implement idempotency middleware with Redis storage

### GAP-MARKETPLACE-004: No S2S Authentication
- **Severity:** HIGH
- **Audit:** 05-s2s-auth.md
- **Current:**
  - No middleware to validate internal requests
  - No service identity verification
  - No source IP validation
  - No request signing
  - Plain HTTP (no mTLS)
- **Fix:** Add internal auth middleware, service tokens

### GAP-MARKETPLACE-005: Disputes Routes - Zero Validation
- **Severity:** HIGH
- **Audit:** 02-input-validation.md
- **Current:** `disputes.routes.ts` has NO validation on any route
- **Routes affected:**
  - POST / (create dispute) - ❌ no validation
  - GET /my-disputes - ❌ no validation
  - GET /:disputeId - ❌ no validation
  - POST /:disputeId/evidence - ❌ no validation
- **Risk:** Invalid data, injection attacks, mass assignment

### GAP-MARKETPLACE-006: Missing Refund Scenarios
- **Severity:** HIGH
- **Audit:** 34-refund-scenarios.md
- **Implemented:**
  - Escrow timeout ✅
  - Manual admin ✅
- **Missing:**
  - Event cancellation refund ❌
  - Buyer request refund ❌
  - Fraud detection refund ❌
- **Additional issues:**
  - Refund reason not stored
  - Fee reversal not tracked
  - No refund audit trail

---

## MEDIUM Issues

### GAP-MARKETPLACE-007: No Prometheus Metrics
- **Severity:** MEDIUM
- **Audit:** 04-logging-observability.md
- **Current:** All metrics checks FAIL
  - No /metrics endpoint (note: metrics.routes.ts exists but returns stubs)
  - No request duration tracking
  - No request counters
  - No database metrics
  - No Redis metrics
  - No blockchain metrics
  - No distributed tracing
- **Impact:** Can't monitor marketplace health

### GAP-MARKETPLACE-008: No Circuit Breakers
- **Severity:** MEDIUM
- **Audit:** 13-graceful-degradation.md
- **Missing:**
  - Blockchain calls - no circuit breaker
  - Stripe calls - no circuit breaker
  - External service calls - no circuit breaker
- **Risk:** Cascading failures when dependencies down

### GAP-MARKETPLACE-009: No Request ID in Errors
- **Severity:** MEDIUM
- **Audit:** 03-error-handling.md
- **Current:** Errors don't include request ID, user ID, or path
- **Impact:** Can't trace errors in production

---

## Frontend-Related Gaps

### GAP-MARKETPLACE-010: Watchlist is a Stub
- **Severity:** MEDIUM
- **User Story:** "I want to save listings I'm interested in"
- **Current:**
  - GET /watchlist exists but returns `{ watchlist: [] }` always
  - No POST endpoint to add to watchlist
  - No DELETE endpoint to remove from watchlist
  - No `user_watchlist` table exists
  - `favorite_count` column exists on listings but never updated
- **Needed:**
  - Create `user_watchlist` table (user_id, listing_id, created_at)
  - POST /watchlist/:listingId - add to watchlist
  - DELETE /watchlist/:listingId - remove from watchlist
  - GET /watchlist - return actual user's watchlist
  - Increment/decrement `favorite_count` on listing
- **Impact:** Can't build "Saved Listings" feature

### GAP-MARKETPLACE-011: Recommendations May Be Stub
- **Severity:** LOW
- **User Story:** "Show me listings I might like"
- **Current:**
  - GET /recommended exists
  - Returns empty array on error
  - Need to verify actual recommendation logic
- **Verify:** Check if search.service.ts has real recommendation algorithm

---

## All Routes Inventory

### listings.routes.ts (5 routes) - AUTH ✅
| Method | Path | Auth | Validation |
|--------|------|------|------------|
| GET | /:id | ❌ | ❌ |
| GET | /my-listings | ✅ | ❌ |
| POST | / | ✅ | ✅ |
| PUT | /:id/price | ✅ | ✅ |
| DELETE | /:id | ✅ | ❌ |

### transfers.routes.ts (5 routes) - AUTH ✅
| Method | Path | Auth | Validation |
|--------|------|------|------------|
| POST | /purchase | ✅ | ❌ |
| POST | /direct | ✅ | ❌ |
| GET | /history | ✅ | ❌ |
| GET | /:id | ✅ | ❌ |
| POST | /:id/cancel | ✅ | ❌ |

### disputes.routes.ts (4 routes) - AUTH ✅, NO VALIDATION ❌
| Method | Path | Auth | Validation |
|--------|------|------|------------|
| POST | / | ✅ | ❌ |
| GET | /my-disputes | ✅ | ❌ |
| GET | /:disputeId | ✅ | ❌ |
| POST | /:disputeId/evidence | ✅ | ❌ |

### search.routes.ts (3 routes)
| Method | Path | Auth | Validation |
|--------|------|------|------------|
| GET | / | ❌ | ❌ |
| GET | /recommended | ✅ | ❌ |
| GET | /watchlist | ✅ | ❌ (stub) |

### seller-onboarding.routes.ts (4 routes) - AUTH ✅
| Method | Path | Auth | Validation |
|--------|------|------|------------|
| POST | /onboard | ✅ | ❌ |
| GET | /status | ✅ | ❌ |
| POST | /refresh-link | ✅ | ❌ |
| GET | /can-accept-fiat | ✅ | ❌ |

### venue.routes.ts (4 routes) - AUTH + ROLE ✅
| Method | Path | Auth | Validation |
|--------|------|------|------------|
| GET | /:venueId/settings | ✅ | ❌ |
| PUT | /:venueId/settings | ✅ | ❌ |
| GET | /:venueId/listings | ✅ | ❌ |
| GET | /:venueId/sales-report | ✅ | ❌ |

### admin.routes.ts (5 routes) - ADMIN AUTH ✅
| Method | Path | Auth | Validation |
|--------|------|------|------------|
| GET | /stats | ✅ admin | ❌ |
| GET | /disputes | ✅ admin | ❌ |
| PUT | /disputes/:id/resolve | ✅ admin | ❌ |
| GET | /flagged-users | ✅ admin | ❌ |
| POST | /ban-user | ✅ admin | ❌ |

### tax.routes.ts (3 routes) - AUTH ✅
| Method | Path | Auth | Validation |
|--------|------|------|------------|
| GET | /transactions | ✅ | ❌ |
| GET | /report/:year | ✅ | ❌ |
| GET | /1099k/:year | ✅ | ❌ |

### webhook.routes.ts (2 routes)
| Method | Path | Auth | Validation |
|--------|------|------|------------|
| POST | /stripe | Stripe sig | ❌ |
| POST | /payment-completed | ❌ | ❌ |

---

## Database Tables (11 tables)

| Table | Purpose |
|-------|---------|
| marketplace_listings | Active listings |
| marketplace_transfers | Transfer records |
| platform_fees | Fee configurations |
| venue_marketplace_settings | Per-venue settings |
| marketplace_price_history | Price changes |
| marketplace_disputes | Dispute records |
| dispute_evidence | Evidence uploads |
| tax_transactions | Tax records |
| anti_bot_activities | Bot detection |
| anti_bot_violations | Bot violations |
| marketplace_blacklist | Banned users |
| user_watchlist | ❌ MISSING |

---

## Cross-Service Dependencies

| This service needs from | What |
|------------------------|------|
| ticket-service | Ticket ownership verification |
| event-service | Event details, pricing rules |
| payment-service | Escrow, transfers |
| auth-service | User verification |
| venue-service | Venue settings, ownership |

| Other services need from this | What |
|------------------------------|------|
| payment-service | Listing prices for escrow |
| notification-service | Sale/purchase notifications |

---

## Priority Order for Fixes

### Immediate (Security)
1. GAP-MARKETPLACE-001: Block on tenant context failure
2. GAP-MARKETPLACE-002: Pass tenant through model methods
3. GAP-MARKETPLACE-005: Add validation to disputes routes

### This Week (Data Integrity)
4. GAP-MARKETPLACE-003: Implement idempotency
5. GAP-MARKETPLACE-004: Add S2S authentication
6. GAP-MARKETPLACE-006: Implement missing refund scenarios

### This Month (Operational/Frontend)
7. GAP-MARKETPLACE-007: Add Prometheus metrics
8. GAP-MARKETPLACE-008: Add circuit breakers
9. GAP-MARKETPLACE-010: Implement watchlist feature
10. GAP-MARKETPLACE-009: Add request ID to errors

