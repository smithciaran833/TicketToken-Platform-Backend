# Payment Service - Complete Issue Registry

**Audit Date:** January 2026
**Status:** 52 of ~100 files audited
**Critical Issues Found:** 29
**Total Issues Found:** 150+

---

## Executive Summary

**CODEBASE STATUS: NOT PRODUCTION READY**

### Critical Findings:
1. **3 features completely non-functional** (marketplace, 1099-DA PDFs, refunds in payment.controller)
2. **40+ endpoints with no authentication** (public access to sensitive data)
3. **Multiple tenant isolation failures** (cross-tenant data leaks)
4. **4 memory leaks** (service will crash after hours/days)
5. **Multiple SQL injection risks**
6. **No error handling in 80% of codebase**

### Financial Risk: HIGH
- Refunds use fake Stripe IDs (money loss on every refund)
- Cross-tenant data access (financial data exposed)
- Revenue analytics broken (no tenant isolation)

### Legal Risk: HIGH
- Tax compliance (1099-DA) completely broken
- No audit trails for sensitive operations
- PII exposure through unauthenticated endpoints

### Security Risk: CRITICAL
- Webhook signature verification missing
- No authentication on payment intents
- Fraud detection system publicly accessible
- Royalty data publicly accessible

---

## CRITICAL ISSUES (Priority 0 - Fix Immediately)

### C01: Webhook Signature Verification Missing
**File:** `src/routes/webhook.routes.ts`
**Line:** 8-15
**Risk:** Anyone can POST fake webhook events
**Impact:** Complete payment system compromise, free tickets, fake refunds
**Exploit:** Attacker sends fake `payment_intent.succeeded` event → gets tickets without paying

**Fix Required:**
- Create `src/middleware/stripe-webhook-verify.middleware.ts`
- Verify `stripe-signature` header using `stripe.webhooks.constructEvent()`
- Configure Fastify to preserve raw body for webhook route
- Store `STRIPE_WEBHOOK_SECRET` in environment variables

---

### C02: Royalty Routes - No Authentication (8 endpoints)
**File:** `src/routes/royalty.routes.ts`
**Lines:** All routes
**Risk:** Public access to revenue data
**Impact:** PII leak, competitive intelligence, data breach, ability to mark discrepancies as resolved
**Endpoints Exposed:**
- GET /royalties/report/:venueId
- GET /royalties/payouts/:recipientId
- GET /royalties/distributions
- POST /royalties/reconcile
- GET /royalties/reconciliation/:runId
- GET /royalties/discrepancies
- PUT /royalties/discrepancies/:id/resolve
- POST /royalties/report/:venueId

**Fix Required:**
- Add `fastify.addHook('preHandler', authenticate)` at top of route file
- Add authorization checks (venue owners see own data, recipients see own payouts, admin sees all)
- Add tenant isolation checks on all DB queries

---

### C03: Fraud Detection - No Authentication (17 endpoints)
**File:** `src/routes/fraud.routes.ts`
**Lines:** All routes
**Risk:** Public access to fraud detection system
**Impact:** Attackers can reverse-engineer fraud checks, whitelist themselves, block IPs
**Endpoints Exposed:**
- POST /fraud/check
- GET /fraud/review
- GET /fraud/checks/:orderId
- GET /fraud/signals
- GET /fraud/rules
- POST /fraud/rules
- PUT /fraud/rules/:id
- DELETE /fraud/rules/:id
- GET /fraud/ip/:ip
- POST /fraud/ip/:ip/block
- (and 7 more)

**Fix Required:**
- Add `fastify.addHook('preHandler', authenticate)`
- Split into access levels: Public (none), Admin (rule management), Internal S2S (fraud checks)
- Add audit logging for all rule/IP changes
- Remove detailed fraud signals from responses

---

### C04: Batch Refund - Cross-Tenant Data Leak
**File:** `src/routes/internal.routes.ts`
**Lines:** 460-512
**Risk:** Tenant A can refund Tenant B's orders
**Impact:** Direct financial theft, tenant isolation breach
**Exploit:**
```
POST /internal/refunds/batch
{
  "eventId": "victim-event-id",
  "tenantId": "attacker-tenant-id"
}
→ Refunds victim's orders, drains their Stripe account
```

**Fix Required:**
```typescript
// Before querying orders:
const event = await db('events')
  .where('id', eventId)
  .where('tenant_id', tenantId)
  .first();

if (!event) {
  return reply.code(403).send({ error: 'Forbidden' });
}

// In orders query:
.where('orders.tenant_id', tenantId)  // CRITICAL
```

---

### C05: Refunds Use Fake Stripe IDs
**File:** `src/controllers/payment.controller.ts`
**Line:** 322
**Risk:** Refunds recorded in DB but not executed in Stripe
**Impact:** Customer keeps money, business loses revenue, accounting mismatch
**Code:**
```typescript
const refundId = `re_test_${Date.now()}`; // FAKE STRIPE ID
```

**Fix Required:**
- Call real Stripe API: `stripe.refunds.create({ payment_intent: paymentIntentId, amount })`
- Use returned `refund.id` instead of generating fake ID
- Handle Stripe errors properly
- Add retry logic for transient failures

---

### C06: Marketplace Returns Mock Data
**File:** `src/controllers/marketplace.controller.ts`
**Lines:** 43-52, 72-78
**Risk:** Marketplace feature is non-functional
**Impact:** Users see fake data, can't actually buy/sell tickets
**Code:**
```typescript
const listing = {
  id: `listing_${Date.now()}`,
  ticketId: 'mock-ticket-123',
  price: 15000,  // Hardcoded
  seller: 'mock-seller'
}
```

**Fix Required:**
- Implement real database schema for listings
- Create real queries to fetch actual listings
- Integrate with escrow and royalty systems properly
- Remove all hardcoded mock data

---

### C07: 1099-DA PDF Returns Placeholder Text
**File:** `src/controllers/compliance.controller.ts`
**Line:** 71
**Risk:** Tax compliance completely broken
**Impact:** IRS reporting failure, legal liability
**Code:**
```typescript
return 'PDF content would be here';
```

**Fix Required:**
- Implement real PDF generation using library (PDFKit, Puppeteer, etc.)
- Fetch actual 1099-DA data from database
- Generate compliant IRS Form 1099-DA
- Return actual PDF buffer to client

---

### C08: Payment Intents - No Authentication
**File:** `src/controllers/intentsController.ts`
**Lines:** All methods
**Risk:** Anyone can create payment intents
**Impact:** Resource exhaustion, API abuse, Stripe quota drain
**Issue:** No authentication check before creating payment intents

**Fix Required:**
- Add authentication middleware to route
- Add tenant isolation
- Add rate limiting (10 intents/min per user)
- Validate amount and currency before Stripe call

---

### C09: Webhook Tenant Isolation Broken
**File:** `src/controllers/webhook.controller.ts`
**Line:** 76
**Risk:** Webhooks update wrong tenant's data
**Impact:** Cross-tenant data corruption
**Code:**
```typescript
const tenant_id = metadata?.tenantId || '00000000-0000-0000-0000-000000000000';
```

**Fix Required:**
- Reject webhooks without valid tenant metadata
- Don't use fallback UUID (zeros)
- Log webhook rejection for investigation
- Ensure all Stripe objects have tenant metadata

---

### C10: Group Payment Routes - Partial Auth
**File:** `src/routes/group-payment.routes.ts`
**Lines:** 19-22, 26-29, 43-46
**Risk:** Anyone can contribute to group payments, view status/history
**Impact:** Fraud vector, PII leak
**Endpoints Without Auth:**
- POST /:groupId/contribute/:memberId
- GET /:groupId/status
- GET /:groupId/history

**Fix Required:**
- Add `authenticate` middleware to all 3 routes
- Create `validateGroupMember` middleware
- Verify user is member of group before allowing access

---

### C11: Fee Calculator - No Authentication
**File:** `src/routes/fee-calculator.routes.ts`
**Lines:** All routes
**Risk:** Public fee calculation exposure
**Impact:** Competitive intelligence, algorithm reverse-engineering
**Issue:** Anyone can query fee structure and tiers

**Fix Required:**
- Decision needed: Should this be public?
- If keeping public: Add rate limiting (10 req/min per IP), return rounded fees
- If making private: Add authenticate middleware

---

### C12: Stripe API Key Empty String Fallback
**File:** `src/routes/internal.routes.ts`
**Line:** 30
**Risk:** Service appears working but payments fail
**Impact:** Silent production failure, all payments broken
**Code:**
```typescript
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
```

**Fix Required:**
```typescript
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
```

---

### C13: RabbitMQ - No Error Handling
**File:** `src/services/queueService.ts`
**Lines:** All methods
**Risk:** Queue operations fail silently
**Impact:** Message loss, silent failures, no observability
**Issue:** No try-catch blocks, no error event listeners, no reconnection logic

**Fix Required:**
- Add try-catch to all methods
- Add error event listeners on connection/channel
- Implement reconnection logic with exponential backoff
- Add logging for all failures

---

### C14: Memory Leak - Processing Locks Never Clear
**File:** `src/services/event-ordering.service.ts`
**Line:** 31
**Risk:** Memory grows unbounded
**Impact:** Service crashes after hours/days
**Code:**
```typescript
private processingLocks = new Map<string, boolean>(); // Never cleared
```

**Fix Required:**
- Clear locks after processing completes
- Add TTL for locks (auto-clear after timeout)
- Or use Redis-based locks instead of in-memory Map

---

### C15: Memory Leak - Alert Counts Never Clear
**File:** `src/services/alerting.service.ts`
**Line:** 73
**Risk:** Memory grows unbounded
**Impact:** Service crashes, rate limiting broken in multi-instance deployments
**Code:**
```typescript
private alertCounts = new Map<string, number>(); // Never cleared
```

**Fix Required:**
- Clear old entries periodically (e.g., every hour)
- Move rate limiting to Redis for multi-instance support
- Add max Map size limit

---

### C16: Memory Leak - Duplicate Event Handlers
**File:** `src/services/databaseService.ts`
**Lines:** 109-116
**Risk:** Event handlers accumulate on every connection
**Impact:** Memory leak, performance degradation, connection pool exhaustion
**Issue:** `pool.on('connect')` registered multiple times

**Fix Required:**
- Register event handler once in `initialize()` method
- Use `pool.once()` if should only fire once
- Or track if handler already registered

---

### C17: CSV Injection
**File:** `src/services/payment-analytics.service.ts`
**Line:** 342
**Risk:** Formula injection in CSV exports
**Impact:** Excel formula execution when users download analytics
**Issue:** CSV built without escaping special characters (`=`, `+`, `-`, `@`)

**Fix Required:**
- Escape CSV special characters
- Prefix values starting with `=`, `+`, `-`, `@` with single quote
- Use CSV library (csv-stringify) instead of manual concatenation

---

### C18: SQL Injection - Template String Interpolation
**File:** `src/services/escrow.service.ts`
**Line:** 218
**Risk:** SQL injection if holdPeriodDays from user input
**Impact:** Database compromise
**Code:**
```typescript
const query = `... WHERE hold_until <= NOW() - INTERVAL '${holdPeriodDays} days'`;
```

**Fix Required:**
- Use parameterized queries
- Validate holdPeriodDays as integer
- Use query builder instead of template strings

---

### C19: SQL Injection - Template String Interpolation
**File:** `src/services/chargeback-reserve.service.ts`
**Line:** 218
**Risk:** Same as C18
**Impact:** Database compromise

**Fix Required:** Same as C18

---

### C20: SQL Injection - Template String Interpolation
**File:** `src/services/venue-analytics.service.ts`
**Line:** 246
**Risk:** Same as C18
**Impact:** Database compromise
**Code:**
```typescript
WHERE DATE >= NOW() - INTERVAL '${months} months'
```

**Fix Required:** Same as C18

---

### C21: Cache Stampede
**File:** `src/services/cache.service.ts`
**Method:** `getOrCompute()`
**Risk:** Race condition on concurrent cache misses
**Impact:** Database hammered under high load, multiple computation of same value
**Issue:** No locking mechanism prevents concurrent execution of computeFn

**Fix Required:**
- Implement cache stampede prevention (lock while computing)
- Use Redis lock or in-memory semaphore
- Second request waits for first to complete, then reads cached value

---

### C22: Tenant Isolation Completely Broken
**File:** `src/services/core/venue-analytics.service.ts`
**Lines:** All queries
**Risk:** Cross-tenant data leak
**Impact:** Venue A can see Venue B's revenue data
**Issue:** ALL queries missing `WHERE tenant_id = ?` clause

**Methods Affected:**
- `getMonthlyVolume()`
- `getVenueMetrics()`
- `getVolumeForPeriod()`
- `getYearToDateVolume()`
- `getMonthlyVolumeTrend()`
- `qualifiesForTierUpgrade()`

**Fix Required:**
- Add `tenant_id` parameter to all methods
- Add `.where('tenant_id', tenantId)` to all queries
- Update all callers to pass tenantId

---

### C23: No Database Transactions
**File:** `src/services/core/payment-processor.service.ts`
**Lines:** 153-173
**Risk:** Database writes not atomic
**Impact:** Payments recorded but not processed (or vice versa), inconsistent state
**Issue:** Multiple DB operations without transaction wrapper

**Fix Required:**
- Wrap all DB operations in transaction
- Rollback on any failure
- Ensure Stripe calls happen inside transaction scope (or use saga pattern)

---

### C24: Refund Controller Continues with Null Stripe
**File:** `src/controllers/refundController.ts`
**Line:** 100
**Risk:** Code continues if Stripe client is null
**Impact:** Runtime crashes on first Stripe API call
**Code:**
```typescript
getStripe() // Returns null if STRIPE_SECRET_KEY missing
// Code continues anyway
```

**Fix Required:**
- Check if getStripe() returns null
- Throw error immediately if null
- Don't proceed with refund logic

---

### C25: Deprecated Solana API
**File:** `src/services/core/gas-fee-estimator.service.ts`
**Line:** 104
**Risk:** API will be removed, code will break
**Impact:** Gas fee estimation fails, NFT minting blocked
**Code:**
```typescript
getRecentBlockhash() // DEPRECATED
```

**Fix Required:**
```typescript
getLatestBlockhash() // Use new API
```

---

### C26: Webhook Processor - Undefined User ID
**File:** `src/services/webhookProcessor.ts`
**Lines:** 83-90
**Risk:** Proceeds with undefined userId
**Impact:** Webhooks processed with bad data, database corruption
**Issue:** Warns about missing userId but continues anyway

**Fix Required:**
- Reject webhook if userId is undefined
- Don't proceed with processing
- Log error and return failure to Stripe (will retry)

---

### C27: Refund Policy - No Tenant Isolation in Join
**File:** `src/services/refund-policy.service.ts`
**Line:** 79
**Risk:** Cross-tenant data leak
**Impact:** Refund policies applied to wrong tenant's events
**Code:**
```typescript
.join('events', 'payment_transactions.event_id', 'events.id')
// Missing: .where('events.tenant_id', tenantId)
```

**Fix Required:**
- Add tenant check in JOIN condition
- Verify all queries have tenant isolation

---

### C28: Background Interval Leak
**File:** `src/services/transaction-timeout.service.ts`
**Line:** 67
**Risk:** Multiple intervals created if start() called multiple times
**Impact:** Memory leak, excessive DB queries
**Issue:** No check if interval already running

**Fix Required:**
- Check if interval exists before creating new one
- Clear interval in stop() method
- Ensure only one interval runs

---

### C29: Admin Routes - Weak Role Check
**File:** `src/routes/admin.routes.ts`
**Lines:** 28-42
**Risk:** JWT not verified, admin check bypassable
**Impact:** Unauthorized admin access if JWT middleware has bugs
**Code:**
```typescript
const user = (request as any).user;
if (!user || !user.roles || !user.roles.includes('admin')) {
// No JWT signature verification
```

**Fix Required:**
- Verify JWT signature in requireAdmin middleware
- Add audit logging for all admin actions
- Add MFA requirement for destructive operations

---

## HIGH PRIORITY ISSUES (Priority 1 - Fix Within 1 Week)

### H01: Type Safety - `as any` Used 100+ Times
**Impact:** Runtime crashes, type confusion attacks
**Files:** All controllers, most services
**Fix:** Remove all `as any`, add proper types and validation

### H02: No Error Handling in 80% of Codebase
**Impact:** Silent failures, poor observability
**Files:** 7 of 8 controllers, 15+ services
**Fix:** Add try-catch blocks to all async methods

### H03: Missing Input Validation
**Impact:** Type errors, crashes, potential exploits
**Files:** Most controllers and services
**Fix:** Add validation schemas (Zod/Joi) for all inputs

### H04: Unused Imports
**Files:** 5 controllers (serviceCache), multiple services
**Fix:** Remove unused imports

### H05: Health/Metrics Endpoints - No Auth
**Files:** `health.routes.ts`, `metrics.routes.ts`
**Impact:** Information disclosure
**Fix:** Add auth or network-level restrictions

### H06: Mock Audit Service
**File:** `src/controllers/refundController.ts`
**Lines:** 92-96
**Impact:** No real audit trail
**Fix:** Implement real audit logging to database

### H07: Inconsistent Field Naming
**Files:** `webhook.controller.ts`, `payment_transactions` table
**Issue:** `stripe_intent_id` vs `stripe_payment_intent_id`
**Fix:** Standardize column names

### H08: Division by Zero Risks
**Files:** Multiple services
**Fix:** Add checks before division operations

### H09: No Circuit Breakers for External APIs
**Files:** Tax calculator, CoinGecko, venue-service calls
**Fix:** Add circuit breaker pattern for all HTTP calls

### H10: Error Swallowing with Silent Fallbacks
**Files:** Most services
**Fix:** Log errors before using fallback values

---

## MEDIUM PRIORITY ISSUES (Priority 2 - Fix Within 2-4 Weeks)

### M01: No Rate Limiting
**Impact:** API abuse, resource exhaustion
**Fix:** Add rate limiting to all public endpoints

### M02: Hardcoded URLs and Timeouts
**Fix:** Move to configuration

### M03: No Pagination on Large Queries
**Fix:** Add limit/offset to queries that could return large result sets

### M04: Floating Point Arithmetic
**Fix:** Use integer arithmetic for money (cents)

### M05: Manual Data Filtering
**File:** `group-payment.controller.ts`
**Fix:** Use serializers consistently

### M06: No Transaction Timeouts
**Fix:** Add timeouts to long-running database operations

### M07: Incomplete Status Mappings
**File:** `payment-processor.service.ts`
**Fix:** Handle all Stripe payment intent statuses

### M08: Missing Idempotency Checks
**Fix:** Add proper idempotency key handling

---

## ARCHITECTURAL ISSUES

### A01: Tenant Isolation Not Enforced
**Scope:** Entire codebase
**Impact:** Multi-tenant architecture fundamentally compromised
**Fix:** Add RLS policies at database level + application-level checks

### A02: No Distributed Tracing
**Impact:** Debugging production issues difficult
**Fix:** Implement OpenTelemetry tracing throughout

### A03: No Centralized Error Handling
**Impact:** Inconsistent error responses
**Fix:** Implement global error handler

### A04: Configuration Management
**Impact:** Environment-specific settings scattered
**Fix:** Centralize configuration with validation

---

## TESTING REQUIREMENTS

### Integration Tests Needed:
1. Webhook signature verification (with Stripe CLI)
2. All authenticated endpoints (401 without token)
3. Cross-tenant isolation (403 on cross-tenant access)
4. Payment flow end-to-end (with Stripe test mode)
5. Refund flow end-to-end
6. Memory leak tests (long-running service tests)
7. Concurrent operation tests (race conditions)
8. Idempotency tests
9. Error recovery tests (external service failures)
10. Load tests (cache stampede, rate limiting)

---

## ESTIMATED FIX EFFORT

| Priority | Issue Count | Effort (Hours) | Dependencies |
|----------|-------------|----------------|--------------|
| P0 - Critical | 29 | 150-200 | Stripe testing, database migrations |
| P1 - High | 10 | 60-80 | None |
| P2 - Medium | 8 | 40-50 | None |
| Architecture | 4 | 80-100 | Team coordination |
| Testing | N/A | 100-120 | All fixes complete |
| **TOTAL** | **51** | **430-550** | **2-3 months (2 devs)** |

---

## DEPLOYMENT STRATEGY

1. **Phase 1: Stop the Bleeding (Week 1)**
   - Disable fake features (marketplace, 1099-DA)
   - Fix webhook signature verification
   - Add auth to all unprotected endpoints
   - Fix critical memory leaks
   - Fix refund Stripe calls

2. **Phase 2: Foundation (Weeks 2-3)**
   - Fix tenant isolation everywhere
   - Add error handling to critical paths
   - Fix SQL injection vulnerabilities
   - Add input validation

3. **Phase 3: Stabilization (Weeks 4-6)**
   - Fix remaining bugs
   - Add integration tests
   - Implement proper features
   - Add monitoring/alerting

4. **Phase 4: Production Hardening (Weeks 7-8)**
   - Load testing
   - Security audit
   - Performance optimization
   - Documentation

---

## RISK ASSESSMENT

**Current State: UNDEPLOYABLE**

### Risks if Deployed As-Is:
- **Financial Loss:** Refunds don't work, cross-tenant data access
- **Legal Liability:** Tax compliance broken, PII exposure
- **Security Breach:** No authentication on 40+ endpoints
- **Service Crashes:** Memory leaks will crash service
- **Data Corruption:** No tenant isolation, race conditions

### Minimum Safe State:
Fix all 29 P0 critical issues (~150-200 hours)

### Recommended State:
Fix P0 + P1 + Architecture (~300-400 hours)

---

## FILES AUDITED

**Completed (52 files):**
- ✅ Routes (19 files)
- ✅ Controllers (8 files)
- ✅ Services Root (18 files)
- ✅ Services/Core (7 files)

**Remaining (~48 files):**
- Services/compliance (4 files)
- Services/fraud (5 files)
- Services/marketplace (4 files)
- Services/blockchain (4 files)
- Services/group (4 files)
- Services/high-demand (4 files)
- Services/reconciliation (2 files)
- Services/security (1 file)
- Services/webhooks (1 file)
- Services/state-machine (3 files)
- Webhooks (3 files)
- Jobs (6 files)
- Cron (2 files)
- Workers (4 files)
- Models (4 files)

**Note:** Additional issues likely in remaining files.

---

## APPENDIX: Quick Reference

### Critical Files to Review First:
1. `src/routes/webhook.routes.ts` - No signature verification
2. `src/routes/royalty.routes.ts` - No auth
3. `src/routes/fraud.routes.ts` - No auth
4. `src/routes/internal.routes.ts` - Tenant leak + Stripe key
5. `src/controllers/payment.controller.ts` - Fake refunds
6. `src/controllers/marketplace.controller.ts` - Fake feature
7. `src/controllers/compliance.controller.ts` - Fake PDFs
8. `src/services/venue-analytics.service.ts` - No tenant isolation
9. `src/services/event-ordering.service.ts` - Memory leak
10. `src/services/alerting.service.ts` - Memory leak

### Safe to Use (Relatively):
- `src/controllers/refundController.ts` (well-implemented)
- `src/services/metrics.service.ts` (clean)
- `src/services/cache-integration.ts` (thin wrapper)

