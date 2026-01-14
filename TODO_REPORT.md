# TicketToken Platform - TODO Items Report

**Generated:** 2026-01-07  
**Total Items Found:** 179 (55 TODOs, 1 HACK, 110 NOTEs, 9 REVIEWs, 4 OPTIMIZEs)

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| 🔴 High (HACK, FIXME, XXX) | 1 |
| 🟡 Medium (TODO, REVIEW, DEPRECATED) | 64 |
| ⚪ Low (NOTE, OPTIMIZE, REFACTOR) | 114 |

---

## Summary by Service

| Service | Count | Status |
|---------|-------|--------|
| compliance-service | 20 | Needs attention |
| root (database/scripts) | 13 | Documentation |
| event-service | 12 | Active development |
| minting-service | 12 | Active development |
| order-service | 12 | Needs implementation |
| payment-service | 12 | Needs implementation |
| blockchain-service | 12 | Documentation |
| venue-service | 12 | Active development |
| analytics-service | 10 | Documentation |
| **auth-service** | **9** | **✅ All NOTEs only - no TODOs!** |
| frontend | 9 | UI comments |
| ticket-service | 8 | Needs implementation |
| shared | 6 | Active development |
| integration-service | 4 | Needs implementation |
| api-gateway | 4 | Documentation |
| file-service | 4 | Documentation |
| queue-service | 4 | Needs implementation |
| search-service | 4 | Active development |
| marketplace-service | 3 | Documentation |
| monitoring-service | 3 | Needs implementation |
| transfer-service | 2 | Needs implementation |
| smart-contracts | 2 | Documentation |
| packages | 1 | Test file |
| notification-service | 1 | Documentation |

---

## 🔴 HIGH PRIORITY (HACK)

### packages
| File | Line | Message |
|------|------|---------|
| `.archived-tests/packages/sdk-typescript-tests/unit/types/config.test.ts` | 20 | Testing runtime immutability |

---

## 🟡 MEDIUM PRIORITY (TODO Items)

### compliance-service (14 TODOs)

| File | Line | Description |
|------|------|-------------|
| `src/controllers/bank.controller.ts` | 13 | Update bankService.verifyBankAccount() to accept tenantId parameter |
| `src/controllers/bank.controller.ts` | 44 | Update bankService.createPayoutMethod() to accept tenantId parameter |
| `src/controllers/gdpr.controller.ts` | 24 | Update dataRetentionService to be tenant-aware |
| `src/controllers/webhook.controller.ts` | 16 | Look up tenant_id from item_id before logging |
| `src/controllers/webhook.controller.ts` | 32 | Add tenant_id check to WHERE clause for security |
| `src/controllers/webhook.controller.ts` | 76 | Extract customer/account ID and look up tenant_id before logging |
| `src/controllers/webhook.controller.ts` | 106 | Add tenant_id to WHERE clause for security once tenant is looked up |
| `src/routes/webhook.routes.ts` | 32 | Implement actual tax update processing |
| `src/routes/webhook.routes.ts` | 75 | Implement KYC update processing |
| `src/routes/webhook.routes.ts` | 118 | Implement risk alert processing |
| `src/routes/webhook.routes.ts` | 162 | Implement OFAC result processing |
| `src/services/privacy-export.service.ts` | 60 | Implement proper tenant context retrieval |
| `src/services/risk.service.ts` | 138 | Send notification to admin |
| `src/services/scheduler.service.ts` | 26 | Implement report generation |
| `tests/integration/tenant-isolation.test.ts` | 48 | Replace with actual API call |

### venue-service (5 TODOs)

| File | Line | Description |
|------|------|-------------|
| `src/controllers/venues.controller.ts` | 216 | Calculate available capacity from active events |
| `src/middleware/auth.middleware.ts` | 138 | Remove this fallback after migration to hashed keys is complete |
| `src/services/venue.service.ts` | 1 | Add createSpan export to tracing.ts |
| `src/services/venue.service.ts` | 107 | Consider queuing to dead letter queue for retry |
| `src/services/venue.service.ts` | 189 | Consider queuing to dead letter queue for retry |
| `src/services/venue.service.ts` | 232 | Consider queuing to dead letter queue for retry |

### payment-service (6 TODOs)

| File | Line | Description |
|------|------|-------------|
| `src/controllers/group-payment.controller.ts` | 75 | Make getGroupPayment public or add a public method |
| `src/controllers/venue.controller.ts` | 79 | Implement getPayoutHistory method |
| `src/jobs/background-job-processor.ts` | 699 | Implement actual event publishing (e.g., to RabbitMQ, Kafka, etc.) |
| `src/routes/admin.routes.ts` | 282 | Implement cache clearing based on cache type |
| `src/routes/admin.routes.ts` | 299 | Implement database query for audit log |
| `src/routes/admin.routes.ts` | 324 | Implement maintenance mode toggle |

### order-service (6 TODOs)

| File | Line | Description |
|------|------|-------------|
| `src/controllers/tax.controller.ts` | 16 | Tax services not yet implemented - stubbed for now |
| `src/services/order-modification.service.ts` | 43 | Fetch from ticket service |
| `src/services/order-search.service.ts` | 153 | Join with events table if needed |
| `src/utils/pdf-generator.ts` | 26 | Implement actual PDF generation using PDFKit or similar |
| `src/utils/pdf-generator.ts` | 42 | Implement multi-ticket PDF generation |
| `src/utils/pdf-generator.ts` | 56 | Implement actual QR code generation using 'qrcode' npm package |

### minting-service (3 TODOs)

| File | Line | Description |
|------|------|-------------|
| `src/config/wallet-provider.ts` | 146 | Implement fetching public key from KMS |
| `src/config/wallet-provider.ts` | 159 | Implement KMS signing |
| `src/routes/internal-mint.ts` | 354 | Query mint status from database |

### queue-service (4 TODOs)

| File | Line | Description |
|------|------|-------------|
| `src/workers/background/analytics.processor.ts` | 55 | Send to actual analytics service (Mixpanel, Segment, etc) |
| `src/workers/communication/email.processor.ts` | 45 | Implement actual SendGrid email sending |
| `src/workers/money/nft-mint.processor.ts` | 48 | Implement actual Solana NFT minting |
| `src/workers/money/refund.processor.ts` | 47 | Implement actual Stripe refund |

### ticket-service (2 TODOs)

| File | Line | Description |
|------|------|-------------|
| `src/routes/purchaseRoutes.ts` | 121 | Add confirmPurchase method to purchaseController |
| `src/routes/purchaseRoutes.ts` | 170 | Add cancelReservation method to purchaseController |

### transfer-service (2 TODOs)

| File | Line | Description |
|------|------|-------------|
| `src/index.ts` | 120 | implement testSolanaConnection |
| `src/services/event-stream.service.ts` | 186 | Implement actual token verification |

### search-service (2 TODOs)

| File | Line | Description |
|------|------|-------------|
| `src/scripts/sync-data.ts` | 42 | Phase 2: Add MongoDB content via venue-enrichment.service |
| `src/scripts/sync-data.ts` | 88 | Phase 2: Add MongoDB content via event-enrichment.service |

### event-service (1 TODO)

| File | Line | Description |
|------|------|-------------|
| `src/services/event-state-machine.ts` | 440 | Implement actual notification logic |

### integration-service (1 TODO)

| File | Line | Description |
|------|------|-------------|
| `src/utils/error-handler.ts` | 204 | Integrate with alerting service |

### marketplace-service (1 TODO)

| File | Line | Description |
|------|------|-------------|
| `src/jobs/listing-expiration.ts` | 218 | Integrate with notification service |

### monitoring-service (2 TODOs)

| File | Line | Description |
|------|------|-------------|
| `src/services/websocket-manager.service.ts` | 180 | Implement JWT token validation |
| `src/services/websocket.service.ts` | 8 | Implement actual WebSocket support later |

### api-gateway (1 TODO)

| File | Line | Description |
|------|------|-------------|
| `src/middleware/timeout.middleware.ts` | 168 | Export timeout metrics to monitoring system |

### shared (2 TODOs)

| File | Line | Description |
|------|------|-------------|
| `src/redis/utils/serialization.ts` | 171 | Add actual compression here if needed (e.g., using zlib) |
| `src/redis/utils/serialization.ts` | 189 | Check for compression marker and decompress if needed |

### archived-tests (1 TODO)

| File | Line | Description |
|------|------|-------------|
| `.archived-tests/backend-services/order-service/tests/unit/jobs/reconciliation.job.test.ts` | 3 | Fix fake timer tests - currently hanging |

---

## ⚪ LOW PRIORITY (NOTE Items by Service)

### auth-service (9 NOTEs - all in archived tests)
- All items are documentation notes in test files
- No actionable TODO items in production code
- **Service is clean!** ✅

### blockchain-service (14 NOTEs)
- Primarily migration documentation
- RLS policy explanations
- Wallet format notes

### event-service (9 NOTEs)
- Database configuration notes
- Model behavior documentation
- API notes

### analytics-service (10 NOTEs)
- Connection pooling notes
- Test setup documentation
- Migration notes

### venue-service (6 NOTEs)
- Route registration notes
- Stripe integration notes
- Order checking notes

### payment-service (5 NOTEs)
- Fee handling documentation
- RLS policy notes
- Contribution tracking notes

### minting-service (6 NOTEs)
- Migration notes
- Health endpoint documentation
- Bull Board configuration

### file-service (3 NOTEs)
- Upload controller notes
- Migration documentation
- RLS policy notes

### order-service (4 NOTEs)
- Migration documentation
- Service client notes
- Note template references

---

## Auth Service Analysis

The **auth-service** has **0 TODO items** in production code. All 9 items found are:
- **Type:** NOTE (informational)
- **Location:** `.archived-tests/` directory only
- **Purpose:** Test documentation explaining mock behavior

### Files with NOTEs (all archived tests):
1. `auth.controller.test.ts:459` - Test may need actual auth middleware
2. `auth.routes.test.ts:46` - Test would ideally import actual routes
3. `dependencies.integration.test.ts:15` - createDependencyContainer import note
4. `jwt.service.test.ts:404` - Family storage in Redis metadata
5. `jwt.service.test.ts:543` - Family tracking mechanism note
6. `oauth.service.test.ts:114` - Real Google API call note
7. `oauth.service.test.ts:384` - provider_id check note
8. `wallet.controller.test.ts:174` - Mock signature verification note
9. `wallet.service.test.ts:200` - Solana keypair test note

**Conclusion:** Auth service production code is TODO-free and well-maintained.

---

## Priority Action Items

### 🚨 Critical (Immediate)
1. **compliance-service tenant isolation** - Multiple TODOs related to tenant_id lookup for security

### ⚠️ High (This Sprint)
1. **queue-service implementations** - Email, NFT minting, refund processors need real implementations
2. **payment-service admin routes** - Cache clearing, audit log, maintenance mode

### 📋 Medium (Backlog)
1. **order-service PDF generation** - Implement actual PDF/QR generation
2. **minting-service KMS** - Implement KMS public key fetching and signing
3. **ticket-service purchase flow** - Add confirmPurchase and cancelReservation methods

### 📝 Low (Documentation)
1. Most NOTE items are documentation and don't require code changes
2. REVIEW items are mostly comment formatting in route files

---

## Running the Scanner

```bash
# Scan all services
node tools/scan-todos.js

# Scan specific service
node tools/scan-todos.js --service auth

# Get summary only
node tools/scan-todos.js --summary

# Export to JSON
node tools/scan-todos.js --json -o todos.json

# Group by severity
node tools/scan-todos.js --severity
```
