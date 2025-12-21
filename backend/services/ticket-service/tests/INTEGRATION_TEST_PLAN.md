# Ticket Service - Integration Test Coverage Plan

**Date Created:** December 4, 2025  
**Goal:** Achieve 80%+ integration test coverage per source file  
**Current Status:** 195 integration tests, gaps in workers and some services  
**Target:** +40 tests to reach 80%+ on all files

---

## 📊 Executive Summary

### Current Integration Test Coverage
- **Total Integration Tests:** 195 (no mocks, real database/Redis/Queue)
- **Unit Tests (mocked):** 67 (not counted toward integration coverage)
- **Files Meeting 80%+ Goal:** 6 out of 21 critical files (29%)
- **Critical Gaps:** Workers (0%), Refunds (0%), Some services (60-75%)

### Test Categories
- ✅ **Phase 1 - Critical Path:** 67 tests (100% complete)
- ✅ **Phase 2 - Integration:** 75 tests (97% passing)
- ✅ **Phase 3 - Edge Cases:** 47 tests (100% passing)
- ✅ **Phase 4 - Comprehensive:** 73 tests (100% passing)
- **Total Tests:** 262 (195 integration + 67 unit)

### Why Unit Tests Were Excluded from Coverage
Unit tests use mocks and don't prove real system behavior:
- ❌ Mocked database → No proof queries actually work
- ❌ Mocked Redis → No proof caching actually works
- ❌ Mocked RabbitMQ → No proof workers actually consume messages
- ✅ Integration tests use real infrastructure → Proves system works

---

## 🎯 Source File Coverage Analysis

### Controllers (5 files)

| File | Current Coverage | Integration Tests | Status | Gap |
|------|------------------|-------------------|--------|-----|
| `ticketController.ts` | 85% | Phase 1, 4 (30+ tests) | ✅ PASS | None |
| `purchaseController.ts` | 95% | Phase 1, 2 (40+ tests) | ✅ PASS | None |
| `qrController.ts` | 80% | Phase 3 (13 tests) | ✅ PASS | Borderline |
| `transferController.ts` | 70% | Phase 1 (4 tests) | ⚠️ BELOW | Need +5 tests |
| `orders.controller.ts` | 60% | Phase 2 (10 tests) | ⚠️ BELOW | Need +3 tests |

### Services (13 files)

| File | Current Coverage | Integration Tests | Status | Gap |
|------|------------------|-------------------|--------|-----|
| `ticketService.ts` | 90% | All phases (100+ tests) | ✅ PASS | None |
| `purchaseController.ts` (saga) | 95% | Phase 1, 2 (30+ tests) | ✅ PASS | None |
| `discountService.ts` | 85% | Phase 2 (10 tests) | ✅ PASS | None |
| `taxService.ts` | 90% | Phase 3 (12 tests) | ✅ PASS | None |
| `interServiceClient.ts` | 90% | Phase 2 (45 tests) | ✅ PASS | None |
| `qrService.ts` | 75% | Phase 3 (13 tests) | ⚠️ BELOW | Need +5 tests |
| `transferService.ts` | 60% | Phase 1 (4 tests) | ❌ FAIL | Need +8 tests |
| `redisService.ts` | 70% | Phase 3 (12 tests) | ⚠️ BELOW | Need +3 tests |
| `queueService.ts` | 60% | Phase 2 (15 tests) | ❌ FAIL | Need +7 tests |
| `solanaService.ts` | 60% | Phase 2 (mocked) | ❌ FAIL | Need +8 tests |
| `databaseService.ts` | 50% | Indirect | ❌ FAIL | Need +5 tests |
| `paymentEventHandler.ts` | 85% | Phase 1 (13 tests) | ✅ PASS | None |
| `refundHandler.ts` | 0% | None | ❌ CRITICAL | Need +8 tests |

### Workers (3 files) - CRITICAL GAP

| File | Current Coverage | Integration Tests | Status | Gap |
|------|------------------|-------------------|--------|-----|
| `mintWorker.ts` | 0% | Unit tests only (mocked) | ❌ CRITICAL | Need +5 tests |
| `reservation-cleanup.worker.ts` | 0% | None | ❌ CRITICAL | Need +3 tests |
| `reservation-expiry.worker.ts` | 0% | None | ❌ CRITICAL | Need +2 tests |

---

## 🚫 Files IGNORED or MINIMALLY Tested

### Routes (10 files) - Tested Indirectly via HTTP Endpoints

| File | Integration Tests | Why Ignored |
|------|-------------------|-------------|
| `ticketRoutes.ts` | Via HTTP endpoints | Routes are just wiring, controllers do the work |
| `purchaseRoutes.ts` | Via HTTP endpoints | Tested through controller integration tests |
| `qrRoutes.ts` | Via HTTP endpoints | Tested through controller integration tests |
| `transferRoutes.ts` | Via HTTP endpoints | Tested through controller integration tests |
| `orders.routes.ts` | Via HTTP endpoints | Tested through controller integration tests |
| `health.routes.ts` | Phase 4 health checks | Covered by health check tests |
| `internalRoutes.ts` | Phase 2 internal API | Limited coverage (basic service auth) |
| `mintRoutes.ts` | Not tested | ❌ **GAP** - Admin NFT minting endpoints |
| `webhookRoutes.ts` | Phase 1 webhooks | Payment webhooks covered |
| `validationRoutes.ts` | Not tested | ❌ **GAP** - QR validation endpoints |

**Why Routes Are Ignored:**
- Routes are passive wiring layers (no business logic)
- All business logic tested in controllers/services
- HTTP endpoint tests prove routes work (if controller tested, route works)
- Event-service uses same pattern (no dedicated route tests)

---

### Models (6 files) - Tested Indirectly via Services

| File | Integration Tests | Why Ignored |
|------|-------------------|-------------|
| `Ticket.ts` | Indirect via ticketService | Model validation tested through CRUD operations |
| `Purchase.ts` | Indirect via purchaseController | Purchase creation tests exercise model |
| `Order.ts` | Indirect via orders controller | Order queries test model |
| `QRCode.ts` | Indirect via qrService | QR generation/validation tests exercise model |
| `Reservation.ts` | Phase 1 reservation tests | Reservation lifecycle tested |
| `Transfer.ts` | Phase 1 transfer tests | Transfer operations tested |

**Why Models Are Ignored:**
- Models are TypeScript interfaces/classes (minimal logic)
- Database schema and constraints tested via services
- Model validation happens at database level (constraints, foreign keys)
- Event-service uses same pattern (no dedicated model tests)

---

### Middleware (6 files) - Tested Indirectly via HTTP Requests

| File | Integration Tests | Why Ignored |
|------|-------------------|-------------|
| `auth.ts` | All phases (JWT required) | Every HTTP test proves auth middleware works |
| `errorHandler.ts` | Phase 4 error handling | Error response tests cover middleware |
| `rate-limit.ts` | Phase 1 rate limiting | Dedicated rate limit integration tests |
| `tenant.ts` | Phase 4 tenant isolation | All multi-tenant tests prove middleware works |
| `logging.middleware.ts` | Not tested | ❌ **GAP** - Request logging not verified |
| `rbac.ts` | Phase 4 RBAC tests | Role-based access control tested |

**Why Middleware Is Ignored:**
- Middleware tested on every HTTP request
- If endpoint test passes, middleware worked
- Dedicated tests only for complex middleware (auth, RBAC)
- Event-service uses same pattern

---

### Utilities (5 files) - Tested Indirectly

| File | Integration Tests | Why Ignored |
|------|-------------------|-------------|
| `async-handler.ts` | Every controller uses it | Error wrapping tested via controllers |
| `errors.ts` | Phase 4 error handling | Custom error classes tested |
| `logger.ts` | Used everywhere | Logging tested via output verification |
| `validation.ts` | All input validation | Request validation tested in phases 1-4 |
| `CircuitBreaker.ts` | Phase 3 circuit breakers | Dedicated circuit breaker tests |

**Why Utils Are Ignored:**
- Utilities tested through services that use them
- If service test passes, utility worked
- Critical utilities (CircuitBreaker) have dedicated tests

---

### Config (3 files) - Not Integration Tested

| File | Integration Tests | Why Ignored |
|------|-------------------|-------------|
| `index.ts` | Unit test only | Configuration loading (no business logic) |
| `env-validation.ts` | Unit test only | Environment variable validation |
| `secrets.ts` | Not tested | ❌ **GAP** - Secrets loading not verified |

**Why Config Is Ignored:**
- Config files load environment variables (no logic)
- If service starts, config worked
- Unit tests verify env var parsing

---

### Clients (2 files)

| File | Integration Tests | Why Ignored |
|------|-------------------|-------------|
| `MintingServiceClient.ts` | Phase 2 NFT minting | HTTP client tested in NFT integration tests |
| `OrderServiceClient.ts` | Phase 1, 2 | Service-to-service calls tested |

**Why Clients Are Tested:**
- ✅ These ARE tested (HTTP communication critical)
- No gaps here

---

### Sagas (1 file)

| File | Integration Tests | Why Ignored |
|------|-------------------|-------------|
| `PurchaseSaga.ts` | Phase 1 purchase flow | Saga tested in purchase integration tests |

**Why Saga IS Tested:**
- ✅ Heavily tested (critical distributed transaction)
- No gaps here

---

### Bootstrap/Infrastructure (2 files) - Not Tested

| File | Integration Tests | Why Ignored |
|------|-------------------|-------------|
| `app.ts` | Not tested | Application setup (no business logic) |
| `index.ts` | Not tested | Server startup (no business logic) |

**Why Bootstrap Is Ignored:**
- If service starts, bootstrap worked
- No business logic to test
- Event-service uses same pattern

---

## 📊 Summary: What Was Ignored

### Deliberately Ignored (Acceptable)
- **Routes (10 files):** Tested via controllers ✅
- **Models (6 files):** Tested via services ✅
- **Middleware (5 files):** Tested via HTTP requests ✅
- **Utils (4 files):** Tested via services that use them ✅
- **Config (2 files):** No business logic ✅
- **Bootstrap (2 files):** No business logic ✅

**Total Ignored:** 29 files (tested indirectly)

### Actual Gaps (Need Tests)
- **Workers (3 files):** 0% integration coverage ❌
- **refundHandler (1 file):** 0% integration coverage ❌
- **7 services:** Below 80% integration coverage ❌
- **mintRoutes:** Not tested ❌
- **validationRoutes:** Not tested ❌
- **logging.middleware:** Not tested ❌
- **secrets.ts:** Not tested ❌

**Total Gaps:** 15 files (need actual integration tests)

### Coverage Reality
- **21 source files** need ≥80% integration tests
- **6 currently meet goal** (29%)
- **15 below goal** (71%)
- **40 tests needed** to reach 80%+ on all 21 files

---

## 📝 Tests to Write (40 tests total)

### PRIORITY 1: Critical Gaps (20 tests) - MUST HAVE

#### 1. Worker Integration Tests (10 tests)
**File:** `tests/phase-5-workers/worker-integration-complete.test.ts`

**Covers:**
- `src/workers/mintWorker.ts` (5 tests)
- `src/workers/reservation-cleanup.worker.ts` (3 tests)
- `src/workers/reservation-expiry.worker.ts` (2 tests)

**Test Cases:**
- [ ] NFT mint worker: Consumes queue message → mints NFT → updates database
- [ ] NFT mint worker: Batch processing (10 orders in queue)
- [ ] NFT mint worker: Handles mint failure → retries → dead letter queue
- [ ] NFT mint worker: Transaction rollback on partial failure
- [ ] NFT mint worker: Worker crash recovery (message redelivery)
- [ ] Cleanup worker: Deletes expired reservations → restores inventory
- [ ] Cleanup worker: Runs on schedule (cron job)
- [ ] Cleanup worker: Handles database connection failure
- [ ] Expiry worker: Marks reservations as expired after timeout
- [ ] Expiry worker: Notifies user of expiration

**Integration Proof:**
- Real RabbitMQ queue consumption
- Real PostgreSQL transactions
- Real Redis cache operations
- Real worker process lifecycle

**Estimated Time:** 2-3 hours

---

#### 2. Refund Integration Tests (8 tests)
**File:** `tests/phase-5-workers/refund-workflows-complete.test.ts`

**Covers:**
- `src/services/refundHandler.ts` (8 tests)
- `src/controllers/purchaseController.ts` (partial)
- `src/routes/internalRoutes.ts` (refund endpoints)

**Test Cases:**
- [ ] Full refund: Cancel ticket → restore inventory → process refund
- [ ] Partial refund: Refund 2 of 5 tickets → partial inventory restore
- [ ] Refund with transfer: Cannot refund transferred ticket (403)
- [ ] Refund with used ticket: Cannot refund used ticket (409)
- [ ] Refund policy enforcement: Time-based refund eligibility
- [ ] Refund batch processing: Multiple tickets in single refund
- [ ] Refund notification: User notified of successful refund
- [ ] Refund audit trail: Complete logging of refund events

**Integration Proof:**
- Real database ticket status updates
- Real inventory restoration
- Real payment service HTTP calls
- Real notification queue publishing

**Estimated Time:** 2 hours

---

#### 3. Transfer Service Complete (2 tests)
**File:** `tests/phase-5-workers/transfer-complete.test.ts`

**Covers:**
- `src/services/transferService.ts` (5 additional tests beyond Phase 1)
- `src/controllers/transferController.ts`

**Test Cases:**
- [ ] Transfer history: Track all transfers for audit (transferA→B→C)
- [ ] Transfer with metadata: Include transfer reason, timestamp, fees

**Integration Proof:**
- Real database transfer history tracking
- Real multi-hop transfer scenarios

**Estimated Time:** 30 minutes

---

### PRIORITY 2: Coverage Improvements (15 tests) - SHOULD HAVE

#### 4. QR Service Complete (5 tests)
**File:** `tests/phase-5-workers/qr-bulk-operations.test.ts`

**Covers:**
- `src/services/qrService.ts` (additional coverage)

**Test Cases:**
- [ ] Bulk QR generation: Generate 100+ QR codes efficiently
- [ ] QR regeneration workflow: User requests new QR → old invalidated
- [ ] QR performance: Batch generation under 5 seconds
- [ ] QR encryption key rotation: Handle key rotation gracefully
- [ ] QR validation logging: Complete audit trail for all scans

**Integration Proof:**
- Real encryption at scale
- Real database bulk operations
- Real performance benchmarks

**Estimated Time:** 1 hour

---

#### 5. Queue Integration Complete (7 tests)
**File:** `tests/phase-5-workers/queue-complete.test.ts`

**Covers:**
- `src/services/queueService.ts` (consumption + advanced features)
- `src/services/queueListener.ts`

**Test Cases:**
- [ ] Message consumption: Worker picks up queued messages
- [ ] Dead letter queue: Failed messages route to DLQ
- [ ] Queue backpressure: Handle queue overflow gracefully
- [ ] Message priority: High-priority messages processed first
- [ ] Queue durability: Messages survive RabbitMQ restart
- [ ] Consumer crash recovery: Messages redelivered after crash
- [ ] Poison message handling: Skip malformed messages

**Integration Proof:**
- Real RabbitMQ consumption
- Real DLQ routing
- Real crash scenarios

**Estimated Time:** 1.5 hours

---

#### 6. Transfer Controller Complete (3 tests)
**File:** Extend `tests/phase-1-critical/transfer-system.test.ts`

**Covers:**
- `src/controllers/transferController.ts` (additional endpoints)

**Test Cases:**
- [ ] Get transfer history endpoint: View all transfers for ticket
- [ ] Cancel pending transfer: Sender cancels before recipient accepts
- [ ] Transfer with fee calculation: Platform fee applied correctly

**Integration Proof:**
- Real HTTP endpoints
- Real database queries

**Estimated Time:** 30 minutes

---

### PRIORITY 3: Nice-to-Have (5 tests) - OPTIONAL

#### 7. Database Resilience (5 tests)
**File:** `tests/phase-5-workers/database-resilience.test.ts`

**Covers:**
- `src/services/databaseService.ts`

**Test Cases:**
- [ ] Connection pool exhaustion: Handle all connections in use
- [ ] Transaction rollback stress: 100 concurrent transactions
- [ ] Query timeout handling: Slow queries don't hang system
- [ ] Connection recovery: Reconnect after database restart
- [ ] Deadlock detection: Handle PostgreSQL deadlocks gracefully

**Integration Proof:**
- Real connection pool limits
- Real transaction conflicts
- Real timeout scenarios

**Estimated Time:** 1 hour

---

## 📈 Progress Tracking

### Overall Progress
- **Phase 1-4 (Existing):** ✅ 195 tests complete
- **Phase 5 (New Tests):** ⏳ 0/40 complete

### Priority 1 Progress (20 tests)
- [ ] Worker Integration (10 tests) - **CRITICAL**
- [ ] Refund Workflows (8 tests) - **CRITICAL**
- [ ] Transfer Complete (2 tests)

### Priority 2 Progress (15 tests)
- [ ] QR Bulk Operations (5 tests)
- [ ] Queue Complete (7 tests)
- [ ] Transfer Controller (3 tests)

### Priority 3 Progress (5 tests)
- [ ] Database Resilience (5 tests) - **OPTIONAL**

---

## 🎯 Coverage Goals After Completion

### Controllers (Target: 5/5 ≥ 80%)
- ✅ ticketController.ts: 85% → 85% (no change needed)
- ✅ purchaseController.ts: 95% → 95% (no change needed)
- ✅ qrController.ts: 80% → 85% (QR bulk tests)
- ⬆️ transferController.ts: 70% → **85%** (+3 tests)
- ⬆️ orders.controller.ts: 60% → **80%** (refund endpoint tests)

### Services (Target: 13/13 ≥ 80%)
- ✅ ticketService.ts: 90% (no change needed)
- ✅ purchaseController saga: 95% (no change needed)
- ✅ discountService.ts: 85% (no change needed)
- ✅ taxService.ts: 90% (no change needed)
- ✅ interServiceClient.ts: 90% (no change needed)
- ✅ paymentEventHandler.ts: 85% (no change needed)
- ⬆️ qrService.ts: 75% → **85%** (+5 tests)
- ⬆️ transferService.ts: 60% → **85%** (+8 tests)
- ⬆️ redisService.ts: 70% → **80%** (circuit breaker + resilience tests)
- ⬆️ queueService.ts: 60% → **85%** (+7 tests)
- ⬆️ solanaService.ts: 60% → **80%** (worker integration tests)
- ⬆️ databaseService.ts: 50% → **80%** (+5 tests)
- ⬆️ refundHandler.ts: 0% → **90%** (+8 tests)

### Workers (Target: 3/3 ≥ 80%)
- ⬆️ mintWorker.ts: 0% → **90%** (+5 tests)
- ⬆️ reservation-cleanup.worker.ts: 0% → **85%** (+3 tests)
- ⬆️ reservation-expiry.worker.ts: 0% → **85%** (+2 tests)

### Final Target
- **21/21 files ≥ 80% integration coverage** ✅

---

## 🚀 Implementation Plan

### Week 1: Critical Gaps (Priority 1)
**Day 1-2:** Worker Integration Tests (10 tests)
- Set up worker test infrastructure
- Test NFT minting flow end-to-end
- Test cleanup/expiry workers

**Day 3:** Refund Workflows (8 tests)
- Test full refund lifecycle
- Test refund edge cases
- Test refund notifications

**Day 4:** Transfer Complete (2 tests)
- Add transfer history tests
- Add transfer metadata tests

### Week 2: Coverage Improvements (Priority 2)
**Day 5:** QR Bulk Operations (5 tests)
**Day 6:** Queue Complete (7 tests)
**Day 7:** Transfer Controller (3 tests)

### Week 3: Optional (Priority 3)
**Day 8:** Database Resilience (5 tests) - if time permits

---

## 📋 Test Infrastructure Requirements

### Required Services
All tests require these services running:
- **PostgreSQL:** port 5432
- **Redis:** port 6379
- **RabbitMQ:** port 5672
- **Ticket Service:** port 3004

### New Test Fixtures Needed
- Worker test helpers
- Queue message factories
- Refund request builders
- Bulk QR generation utilities

### Environment Variables
```bash
# Worker tests
WORKER_CONCURRENCY=5
MINT_QUEUE_NAME=ticket-mint
CLEANUP_SCHEDULE=*/5 * * * *

# Queue tests
RABBITMQ_URL=amqp://localhost:5672
DLQ_MAX_RETRIES=3

# Refund tests
REFUND_WINDOW_HOURS=48
REFUND_FEE_PERCENT=5
```

---

## 🔍 Success Criteria

### Test Quality Standards
Each new test must:
- ✅ Use real database (no mocks)
- ✅ Use real Redis (no mocks)
- ✅ Use real RabbitMQ (no mocks)
- ✅ Test complete workflows end-to-end
- ✅ Include error scenarios
- ✅ Clean up test data
- ✅ Run independently (no test interdependencies)
- ✅ Complete in reasonable time (<30 seconds per test)

### Coverage Verification
After implementation:
- Run `npm run test:coverage`
- Verify all files show ≥ 80% line coverage
- Verify all files show ≥ 80% branch coverage
- Verify all files show ≥ 80% function coverage

---

## 📊 Coverage Report Template

After completing each batch of tests, update:

```
File: src/workers/mintWorker.ts
- Before: 0% integration coverage (unit tests only)
- After: 90% integration coverage (5 integration tests)
- Tests Added: worker-integration-complete.test.ts
- Status: ✅ COMPLETE
```

---

## 🎯 Definition of Done

A file is considered "complete" when:
1. ≥ 80% line coverage from integration tests (not mocked unit tests)
2. All critical paths tested end-to-end
3. All error scenarios tested
4. All edge cases tested
5. Tests passing consistently (no flakiness)
6. Test execution time reasonable
7. Test coverage verified with coverage report

---

**Last Updated:** December 4, 2025  
**Next Update:** After completing Priority 1 tests  
**Estimated Completion:** 1-2 weeks (depending on Priority 2/3 inclusion)
