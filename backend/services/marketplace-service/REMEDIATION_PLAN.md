# MARKETPLACE SERVICE - PRODUCTION REMEDIATION PLAN

**Current Status:** 4/10 Production Readiness  
**Target Status:** 10/10 Production Ready  
**Total Estimated Effort:** 65-70 hours (8-9 business days)

---

## OVERVIEW

This document outlines a 5-phase approach to bring marketplace-service to full production readiness. Each phase builds on the previous, with clear deliverables and success criteria.

### Phase Summary

| Phase | Focus | Effort | Priority |
|-------|-------|--------|----------|
| Phase 1 | Critical Blockers | 11 hours | 🔴 CRITICAL |
| Phase 2 | Purchase Flow Integration | 8 hours | 🔴 CRITICAL |
| Phase 3 | Financial Security | 12 hours | 🟡 HIGH |
| Phase 4 | Testing & Validation | 20 hours | 🟡 HIGH |
| Phase 5 | Production Hardening | 14 hours | 🟢 MEDIUM |

---

## PHASE 1: CRITICAL BLOCKERS (11 hours)

**Goal:** Fix the 4 critical blockers that prevent any deployment

### 1.1 Implement Ownership Verification (4 hours)

**Problem:** `verifyListingOwnership` middleware is a stub that only logs - anyone can modify/cancel anyone's listings

**Files to Modify:**
- `src/middleware/auth.middleware.ts` (lines 48-53)

**What Needs to Be Done:**
1. Query database to fetch listing by ID
2. Compare listing.sellerId with request.user.id
3. Return 403 Forbidden if user doesn't own the listing
4. Return 404 Not Found if listing doesn't exist
5. Continue to next handler if authorized

**Dependencies:**
- Requires listing model import
- Requires database query capability

**Success Criteria:**
- [ ] Middleware queries database for listing
- [ ] Returns 403 for unauthorized users
- [ ] Returns 404 for non-existent listings
- [ ] Allows owner to proceed
- [ ] Existing tests updated to verify authorization

**Risk Level:** LOW - Straightforward implementation

---

### 1.2 Fix Buy Controller Database Table (2 hours)

**Problem:** Buy controller tries to insert into `marketplace_purchases` table that doesn't exist (only `marketplace_transfers` exists)

**Files to Modify:**
- `src/controllers/buy.controller.ts` (entire file)

**What Needs to Be Done:**
1. Review migration to understand `marketplace_transfers` schema
2. Update buy controller to use `marketplace_transfers` instead of `marketplace_purchases`
3. Update all column references to match transfers table schema
4. Update variable names from `purchase` to `transfer`
5. Ensure all foreign keys and relationships are correct

**Alternative Approach:**
- Could create a migration to add `marketplace_purchases` table
- But using existing `marketplace_transfers` is cleaner (less duplication)

**Success Criteria:**
- [ ] Buy controller references correct table name
- [ ] All column names match schema
- [ ] Foreign key constraints satisfied
- [ ] Test purchase goes through without database errors

**Risk Level:** LOW - Simple find/replace operation

---

### 1.3 Replace Console.log with Logger (3 hours)

**Problem:** 69 console.log statements in production code prevent proper log aggregation and debugging

**Files to Modify:**
- `src/config/database.ts`
- `src/middleware/auth.middleware.ts` (line 53)
- `src/config/index.ts` (line 38)
- `src/index.ts` (line 4)
- Any other controllers/services with console.log

**What Needs to Be Done:**
1. Search codebase for all `console.log`, `console.error`, `console.warn`
2. Replace with appropriate logger methods:
   - `console.log` → `logger.info`
   - `console.error` → `logger.error`
   - `console.warn` → `logger.warn`
   - `console.debug` → `logger.debug`
3. Keep console.log in migration files (acceptable)
4. Remove console.log from seed files if present
5. Add structured context to important logs

**Success Criteria:**
- [ ] Zero console.* in src/ directory (except migrations)
- [ ] All logs use Winston logger
- [ ] Important logs include structured context
- [ ] Log levels appropriate for message type

**Risk Level:** LOW - Simple replace operation

---

### 1.4 Add Blockchain Health Check (2 hours)

**Problem:** Health check doesn't verify blockchain connectivity - service may appear healthy but unable to process transfers

**Files to Modify:**
- `src/routes/health.routes.ts`
- `src/services/blockchain.service.ts` (review connection method)

**What Needs to Be Done:**
1. Add new GET `/health/blockchain` endpoint
2. Call `blockchainService.getConnection().getBlockHeight()`
3. Return 200 OK if successful with block height
4. Return 503 Service Unavailable if RPC connection fails
5. Include timeout to prevent health check hanging
6. Add to main `/health` endpoint as well (aggregate status)

**Success Criteria:**
- [ ] New `/health/blockchain` endpoint exists
- [ ] Returns 200 when Solana RPC reachable
- [ ] Returns 503 when Solana RPC unreachable
- [ ] Includes current block height in response
- [ ] Has reasonable timeout (2-3 seconds max)
- [ ] Main `/health` endpoint shows blockchain status

**Risk Level:** LOW - Simple endpoint addition

---

### Phase 1 Success Criteria

- [ ] All ownership checks actually verify database
- [ ] Buy controller uses correct database table
- [ ] No console.log in production code
- [ ] Health checks verify blockchain connectivity
- [ ] Service can start without errors
- [ ] Basic purchases don't crash with database errors

**Estimated Total: 11 hours**

---

## PHASE 2: PURCHASE FLOW INTEGRATION (8 hours)

**Goal:** Connect buy controller to transfer service for proper purchase flow

### 2.1 Refactor Buy Controller to Use Transfer Service (6 hours)

**Problem:** Buy controller has duplicate logic and doesn't use the well-designed transfer service

**Files to Modify:**
- `src/controllers/buy.controller.ts` (major refactor)
- `src/services/transfer.service.ts` (may need minor updates)

**Current Flow (BROKEN):**
```
1. Buy controller locks listing
2. Buy controller inserts to wrong table
3. Buy controller marks listing sold immediately
4. Transfer never happens
5. Blockchain never called
```

**Target Flow:**
```
1. Buy controller validates request
2. Buy controller calls transferService.initiateTransfer()
3. Transfer service creates transfer record
4. Transfer service calls blockchainService.transferNFT()
5. On blockchain success, transfer service calls completeTransfer()
6. Complete transfer marks listing sold
7. Return success to buyer
```

**What Needs to Be Done:**
1. Remove duplicate validation logic from buy controller
2. Remove direct database operations from buy controller
3. Call `transferService.initiateTransfer()` with proper DTO
4. Handle transfer service response
5. Call `transferService.completeTransfer()` after blockchain confirmation
6. Call `transferService.failTransfer()` if blockchain fails
7. Return appropriate response to client
8. Remove event emission (let transfer service handle it)
9. Clean up transaction management (transfer service does this)

**Success Criteria:**
- [ ] Buy controller delegates to transfer service
- [ ] Transfer service creates records in correct table
- [ ] Blockchain integration actually called
- [ ] Listing only marked sold after blockchain confirmation
- [ ] Failures properly handled with rollback
- [ ] No duplicate logic between controller and service

**Risk Level:** MEDIUM - Requires careful refactoring

---

### 2.2 Add Blockchain Service Integration (2 hours)

**Problem:** Transfer service references blockchain service but integration may be incomplete

**Files to Modify:**
- `src/services/blockchain.service.ts` (review and enhance)
- `src/services/transfer.service.ts` (verify calls)

**What Needs to Be Done:**
1. Review blockchain service methods:
   - `transferNFT(from, to, mintAddress)`
   - `getWalletBalance(walletAddress)`
   - `validateTransaction(signature)`
   - `getConnection()`
2. Ensure all methods have proper error handling
3. Add retry logic for blockchain calls
4. Add timeout for long-running operations
5. Verify PDA derivation is correct
6. Test connection to Solana RPC

**Success Criteria:**
- [ ] All blockchain methods implemented
- [ ] Proper error handling on RPC failures
- [ ] Retry logic for transient errors
- [ ] Timeouts prevent hanging
- [ ] Connection pooling configured
- [ ] Works on devnet for testing

**Risk Level:** MEDIUM - Blockchain integration can be tricky

---

### Phase 2 Success Criteria

- [ ] Buy flow uses transfer service
- [ ] Blockchain actually called for transfers
- [ ] Listings marked sold only after blockchain confirmation
- [ ] Failed transfers reactivate listing
- [ ] End-to-end purchase flow works
- [ ] No duplicate code between controller and service

**Estimated Total: 8 hours**

---

## PHASE 3: FINANCIAL SECURITY (12 hours)

**Goal:** Implement escrow mechanism to protect buyer funds

### 3.1 Design Escrow Architecture (2 hours)

**Problem:** No escrow means buyers pay before transfer confirmed - financial risk

**Files to Review:**
- `src/idl/marketplace.json` (Solana program IDL)
- `src/services/blockchain.service.ts`
- Smart contract code (if available)

**What Needs to Be Done:**
1. Review Solana marketplace program capabilities
2. Determine if escrow PDA already exists in program
3. Design escrow flow:
   - Create escrow PDA
   - Transfer buyer funds to escrow
   - Execute NFT transfer
   - Release escrow to seller on success
   - Refund buyer on failure
4. Document escrow state transitions
5. Identify required program updates

**Success Criteria:**
- [ ] Escrow architecture documented
- [ ] State diagram created
- [ ] Program capabilities assessed
- [ ] Required changes identified
- [ ] Refund mechanism designed

**Risk Level:** MEDIUM - Requires blockchain expertise

---

### 3.2 Implement Escrow PDA Creation (4 hours)

**Problem:** Funds not held securely during transfer

**Files to Modify:**
- `src/services/blockchain.service.ts` (add escrow methods)
- `src/services/transfer.service.ts` (integrate escrow)

**What Needs to Be Done:**
1. Add `createEscrowAccount()` method
2. Derive escrow PDA from listing + buyer
3. Initialize escrow with buyer deposit
4. Store escrow details in transfer record
5. Add escrow timeout mechanism (e.g., 5 minutes)
6. Handle escrow account cleanup

**Success Criteria:**
- [ ] Escrow PDA created for each purchase
- [ ] Buyer funds locked in escrow
- [ ] Escrow details recorded in database
- [ ] Timeout mechanism prevents stuck funds
- [ ] Account rent handling correct

**Risk Level:** HIGH - Blockchain code requires careful testing

---

### 3.3 Implement Escrow Release/Refund (4 hours)

**Problem:** Need to release funds to seller or refund buyer

**Files to Modify:**
- `src/services/blockchain.service.ts`
- `src/services/transfer.service.ts`

**What Needs to Be Done:**
1. Add `releaseEscrowToSeller()` method
2. Called after successful NFT transfer
3. Verify NFT transfer before releasing funds
4. Add `refundEscrowToBuyer()` method
5. Called on transfer failure or timeout
6. Update transfer service to call appropriate method
7. Handle partial failures (NFT transferred but escrow release fails)

**Success Criteria:**
- [ ] Escrow released on successful transfer
- [ ] Buyer refunded on failure
- [ ] Platform/venue fees deducted before release
- [ ] All blockchain operations atomic
- [ ] Proper error handling
- [ ] Audit trail in database

**Risk Level:** HIGH - Financial operations require precision

---

### 3.4 Add Escrow Monitoring (2 hours)

**Problem:** Need to monitor stuck escrows and handle edge cases

**Files to Create:**
- `src/services/escrow-monitor.service.ts`
- `src/cron/escrow-cleanup.ts`

**What Needs to Be Done:**
1. Create background job to check escrow status
2. Find escrows older than timeout period
3. Automatically refund timed-out escrows
4. Alert on suspicious escrow patterns
5. Track escrow metrics (total locked, average time, etc.)
6. Add admin endpoint to manually resolve escrows

**Success Criteria:**
- [ ] Cron job runs every 5 minutes
- [ ] Timed-out escrows automatically refunded
- [ ] Alerts sent for stuck escrows
- [ ] Metrics tracked in monitoring
- [ ] Admin can manually intervene

**Risk Level:** MEDIUM - Background job management

---

### Phase 3 Success Criteria

- [ ] Escrow holds buyer funds until transfer confirmed
- [ ] Automatic refund on failure
- [ ] No way for buyer to lose money without getting NFT
- [ ] Platform/venue fees properly deducted
- [ ] Monitoring and alerts for stuck escrows
- [ ] Audit trail of all escrow operations

**Estimated Total: 12 hours**

---

## PHASE 4: TESTING & VALIDATION (20 hours)

**Goal:** Comprehensive test coverage for all flows

### 4.1 Unit Tests for Core Services (8 hours)

**Files to Create:**
- `src/tests/unit/listing.service.test.ts`
- `src/tests/unit/transfer.service.test.ts`
- `src/tests/unit/blockchain.service.test.ts`
- `src/tests/unit/fee.service.test.ts`
- `src/tests/unit/validation.service.test.ts`

**What Needs to Be Done:**
1. Test listing creation with various inputs
2. Test price cap enforcement (300% max)
3. Test ownership verification
4. Test transfer initiation and completion
5. Test transfer failure handling
6. Test fee calculation accuracy
7. Test escrow creation and release
8. Test blockchain service methods with mocks
9. Mock all external dependencies
10. Test error conditions and edge cases

**Success Criteria:**
- [ ] 80%+ code coverage for services
- [ ] All happy paths tested
- [ ] All error conditions tested
- [ ] Edge cases covered
- [ ] Mocked external dependencies
- [ ] Fast execution (< 30 seconds)

**Risk Level:** LOW - Standard unit testing

---

### 4.2 Integration Tests for Purchase Flow (6 hours)

**Files to Create/Update:**
- `src/tests/integration/purchase-flow.test.ts`
- `src/tests/integration/escrow.test.ts`
- Update existing `listing.test.ts`

**What Needs to Be Done:**
1. Test end-to-end purchase flow:
   - Create listing
   - Buyer purchases
   - Escrow created
   - NFT transferred
   - Escrow released
   - Listing marked sold
2. Test concurrent purchase attempts (should lock)
3. Test purchase failure scenarios
4. Test escrow timeout and refund
5. Test fee distribution
6. Use test database and devnet Solana
7. Clean up test data after each test

**Success Criteria:**
- [ ] Complete purchase flow tested end-to-end
- [ ] Concurrent purchases handled correctly
- [ ] Escrow tested with actual blockchain
- [ ] All failure modes tested
- [ ] Tests clean up after themselves
- [ ] Can run repeatedly without issues

**Risk Level:** MEDIUM - Requires devnet setup

---

### 4.3 Load and Stress Testing (4 hours)

**Files to Create:**
- `src/tests/load/concurrent-purchases.test.ts`
- `src/tests/load/listing-creation.test.ts`

**What Needs to Be Done:**
1. Simulate 100 concurrent listing creations
2. Simulate 50 concurrent purchases of same listing
3. Test distributed lock performance
4. Test database connection pool under load
5. Identify bottlenecks
6. Test service behavior at capacity
7. Verify no deadlocks or race conditions

**Success Criteria:**
- [ ] Service handles 100 concurrent requests
- [ ] Distributed locks prevent race conditions
- [ ] Only one buyer gets the listing
- [ ] No deadlocks detected
- [ ] Response times acceptable under load
- [ ] Database connections properly pooled

**Risk Level:** MEDIUM - May expose race conditions

---

### 4.4 Security Testing (2 hours)

**Files to Create:**
- `src/tests/security/authorization.test.ts`

**What Needs to Be Done:**
1. Attempt to modify another user's listing (should fail)
2. Attempt to cancel another user's listing (should fail)
3. Test price manipulation attacks
4. Test SQL injection in search queries
5. Test JWT tampering
6. Test rate limiting effectiveness
7. Verify no sensitive data in logs

**Success Criteria:**
- [ ] Authorization properly enforced
- [ ] No user can access other users' data
- [ ] SQL injection prevented
- [ ] JWT validation secure
- [ ] Rate limiting works
- [ ] No secrets in logs

**Risk Level:** LOW - Validation of existing security

---

### Phase 4 Success Criteria

- [ ] 80%+ test coverage overall
- [ ] All critical paths tested
- [ ] Integration tests pass on devnet
- [ ] Load tests show acceptable performance
- [ ] Security tests pass
- [ ] CI/CD pipeline includes all tests

**Estimated Total: 20 hours**

---

## PHASE 5: PRODUCTION HARDENING (14 hours)

**Goal:** Polish for production deployment

### 5.1 Implement Ticket Value Lookup (4 hours)

**Problem:** `getTicketMarketValue()` returns hardcoded $100

**Files to Modify:**
- `src/services/listing.service.ts` (line 107-109)
- `src/services/ticket-integration.service.ts` (create)

**What Needs to Be Done:**
1. Create ticket integration service
2. Call ticket-service API to get face value
3. Add caching for ticket values (Redis)
4. Handle ticket-service unavailability
5. Fall back to original_face_value from listing data
6. Add retry logic with exponential backoff
7. Update listing creation to pass face value

**Success Criteria:**
- [ ] Real ticket values fetched from ticket-service
- [ ] Values cached for performance
- [ ] Graceful degradation if service unavailable
- [ ] No hardcoded $100 value
- [ ] Works with actual ticket-service

**Risk Level:** LOW - Service integration

---

### 5.2 Implement Fee Distribution (4 hours)

**Problem:** `processFeeDistributions()` is empty stub

**Files to Modify:**
- `src/services/fee.service.ts` (line 113-115)

**What Needs to Be Done:**
1. Implement batch fee distribution
2. Query all fees with `platform_fee_collected = false`
3. Group by wallet address
4. Check minimum payout threshold
5. Execute blockchain payment to platform wallet
6. Execute blockchain payment to venue wallet
7. Update fee records with signatures
8. Handle partial failures
9. Add retry for failed distributions

**Success Criteria:**
- [ ] Platform fees automatically distributed
- [ ] Venue fees automatically paid
- [ ] Minimum thresholds respected
- [ ] Blockchain signatures recorded
- [ ] Failed distributions retried
- [ ] Audit trail complete

**Risk Level:** MEDIUM - Financial operations

---

### 5.3 Add Comprehensive Monitoring (3 hours)

**Files to Create:**
- `src/utils/metrics.ts` (enhance existing)
- `src/middleware/metrics.middleware.ts`

**What Needs to Be Done:**
1. Add Prometheus metrics:
   - Total listings created
   - Total purchases completed
   - Total value transacted
   - Purchase success rate
   - Escrow timeout rate
   - Average purchase time
   - Blockchain error rate
2. Add custom dashboards for Grafana
3. Add structured logging for key events
4. Add performance tracing
5. Track database query performance

**Success Criteria:**
- [ ] All key metrics exposed
- [ ] Grafana dashboard created
- [ ] Alerts configured for anomalies
- [ ] Logs structured and searchable
- [ ] Performance issues identifiable

**Risk Level:** LOW - Observability enhancement

---

### 5.4 Documentation and Runbooks (3 hours)

**Files to Create:**
- `backend/services/marketplace-service/README.md` (enhance)
- `backend/services/marketplace-service/docs/API.md`
- `backend/services/marketplace-service/docs/RUNBOOK.md`
- `backend/services/marketplace-service/docs/ARCHITECTURE.md`

**What Needs to Be Done:**
1. Document all API endpoints with examples
2. Document purchase flow with diagrams
3. Document escrow mechanism
4. Create operational runbook:
   - How to handle stuck transactions
   - How to manually resolve escrows
   - How to investigate failed transfers
   - How to diagnose blockchain issues
5. Document fee distribution process
6. Add troubleshooting guide
7. Document monitoring and alerts

**Success Criteria:**
- [ ] All APIs documented
- [ ] Architecture diagrams created
- [ ] Runbook covers common scenarios
- [ ] Troubleshooting guide complete
- [ ] New team members can understand system

**Risk Level:** LOW - Documentation

---

### Phase 5 Success Criteria

- [ ] Real ticket values used
- [ ] Fees automatically distributed
- [ ] Comprehensive monitoring in place
- [ ] Documentation complete
- [ ] Service ready for production launch

**Estimated Total: 14 hours**

---

## OVERALL SUCCESS CRITERIA

### Production Readiness Targets

| Category | Current | Target | Status |
|----------|---------|--------|--------|
| Security | 5/10 | 10/10 | 🔴 |
| Functionality | 6/10 | 10/10 | 🟡 |
| Testing | 3/10 | 9/10 | 🔴 |
| Monitoring | 6/10 | 10/10 | 🟡 |
| Documentation | 4/10 | 9/10 | 🔴 |
| **Overall** | **4/10** | **10/10** | 🔴 |

### Final Checklist Before Production

- [ ] All 4 critical blockers resolved
- [ ] Purchase flow integrated and tested
- [ ] Escrow fully implemented and tested
- [ ] 80%+ test coverage achieved
- [ ] Load testing passed
- [ ] Security audit completed
- [ ] Monitoring dashboard deployed
- [ ] Runbook reviewed by ops team
- [ ] Disaster recovery plan documented
- [ ] Rollback plan prepared

---

## IMPLEMENTATION APPROACH

### Phase Ordering Rationale

1. **Phase 1 First:** Must fix blockers before anything else works
2. **Phase 2 Next:** Connect the core purchase flow
3. **Phase 3 Then:** Add financial security (escrow)
4. **Phase 4 Follows:** Validate everything works correctly
5. **Phase 5 Last:** Polish and prepare for production

### Risk Mitigation

- Deploy to staging after each phase
- Test thoroughly before moving to next phase
- Keep phases small and focused
- Document issues and learnings
- Pair program on high-risk items (blockchain, escrow)

### Dependencies

- DevNet Solana access for testing
- Ticket-service availability for integration
- Redis for caching and locking
- Monitoring infrastructure (Prometheus/Grafana)

---

## NEXT STEPS

1. Review this plan with the team
2. Prioritize any additional items
3. Begin Phase 1 implementation
4. Work through phases sequentially
5. Deploy to production after Phase 5

**Ready to begin Phase 1? Let's fix those critical blockers!**
