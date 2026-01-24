# MASTER AUDIT REPORT - TicketToken Platform

**Generated:** 2026-01-23
**Services Audited:** 22 microservices
**Total Source Files:** 1,500+ TypeScript files
**Audit Reports Analyzed:** 23 individual service reports

---

## EXECUTIVE SUMMARY

The TicketToken Platform consists of 22 microservices with a total of **43 Critical** and **68 High** priority issues identified across all services. The platform demonstrates strong foundational architecture with HMAC-SHA256 authentication standardization and comprehensive RLS (Row-Level Security) implementation, but several critical gaps require immediate attention before production deployment.

### Platform Risk Assessment

| Risk Level | Count | Impact |
|------------|-------|--------|
| **CRITICAL** | 43 | Production blockers - must fix |
| **HIGH** | 68 | Should fix before production |
| **MEDIUM** | 75+ | Fix in next sprint |
| **LOW** | 100+ | Technical debt |

### Top 5 Platform-Wide Concerns

1. **Service Boundary Violations** - 15+ services directly query other services' database tables
2. **Mock/Placeholder Implementations** - Critical features like OFAC screening, virus scanning, wallet signature verification are stubs
3. **Hardcoded Secrets/Keys** - Multiple services have development key fallbacks
4. **HMAC Authentication Disabled by Default** - `USE_NEW_HMAC=false` in many services
5. **High `any` Type Usage** - 2,500+ occurrences reducing type safety

---

## CROSS-SERVICE PATTERN ANALYSIS

### Pattern 1: HMAC-SHA256 Implementation Consistency

| Service | HMAC Implemented | Enabled by Default | Replay Protection | Uses @tickettoken/shared |
|---------|------------------|-------------------|-------------------|-------------------------|
| api-gateway | ✅ | ❌ (`USE_NEW_HMAC=false`) | ✅ 60s | ✅ |
| auth-service | ✅ | ✅ | ✅ 60s | ✅ |
| venue-service | ✅ | ❌ (`USE_NEW_HMAC=false`) | ✅ 60s | ✅ |
| event-service | ✅ | ✅ | ✅ 60s | ✅ |
| ticket-service | ✅ | ❌ (`USE_NEW_HMAC=false`) | ✅ 60s | ✅ |
| payment-service | ✅ | ⚠️ Partial | ✅ 60s | ✅ |
| marketplace-service | ✅ | ⚠️ Dev bypass | ✅ 5min | ✅ |
| analytics-service | ✅ | ❌ | ✅ | ✅ |
| monitoring-service | ✅ | ❌ (`USE_NEW_HMAC=false`) | ✅ | ✅ |
| minting-service | ✅ | ✅ | ✅ 5min | ✅ |
| blockchain-service | ✅ | ✅ | ✅ 5min | ✅ |
| transfer-service | ✅ | ✅ | ✅ | ✅ |
| scanning-service | ⚠️ Missing on some routes | - | - | - |

**Issue:** 6+ services have HMAC disabled by default, allowing unauthenticated internal calls.

---

### Pattern 2: Service Boundary Violations

| Service | Tables Accessed (Not Owned) | Type | Severity |
|---------|---------------------------|------|----------|
| **analytics-service** | `tickets`, `events`, `users`, `orders`, `venues`, `payment_transactions` | READ | Medium |
| **analytics-service** | `events` (UPDATE `price_cents`) | WRITE | **CRITICAL** |
| **search-service** | 15+ tables across services | READ | **CRITICAL** |
| **ticket-service** | `orders`, `events`, `venues`, `users` | READ | **CRITICAL** |
| **payment-service** | `tickets`, `events`, `venues`, `users` | READ/WRITE | **CRITICAL** |
| **event-service** | `tickets` | READ | **CRITICAL** |
| **monitoring-service** | `events`, `ticket_transactions` | READ | Medium |
| **compliance-service** | Multiple cross-service | READ | Medium |

**Total Violations:** 100+ direct cross-service database queries

---

### Pattern 3: `any` Type Usage Counts

| Service | `any` Count | Risk Level |
|---------|-------------|------------|
| venue-service | 375 | High |
| payment-service | 287 | High |
| event-service | 194 | Medium |
| auth-service | ~200 | Medium |
| ticket-service | ~140 | Medium |
| search-service | 104 | Medium |
| compliance-service | 130+ | Medium |
| file-service | 74 | Medium |
| analytics-service | 61 files | Medium |
| monitoring-service | 50+ | Medium |

**Platform Total:** ~2,500+ `any` type usages

---

### Pattern 4: PII Exposure Risks

| Service | PII Type | Risk | Mitigation |
|---------|----------|------|------------|
| analytics-service | Email, name in customer profiles | HIGH | Anonymization service exists but not always used |
| compliance-service | EIN/TIN stored plaintext | **CRITICAL** | Should be encrypted |
| auth-service | PII in users table | LOW | RLS + masking functions |
| payment-service | TIN encrypted | LOW | AES-256-GCM (but static salt) |
| notification-service | Email addresses | LOW | Proper handling |

---

### Pattern 5: Missing PKCE in OAuth

| Service | OAuth Implemented | PKCE | Risk |
|---------|------------------|------|------|
| integration-service | ✅ Stripe, Square, QuickBooks, Mailchimp | ❌ None | **HIGH** |
| auth-service | ✅ Google OAuth | ⚠️ Partial | Medium |

**Issue:** OAuth flows in integration-service lack PKCE, vulnerable to authorization code interception.

---

### Pattern 6: Hardcoded Secrets/Keys

| Service | File | Secret Type | Value/Pattern |
|---------|------|-------------|---------------|
| **integration-service** | `token-vault.service.ts:11` | Encryption key | `'default-dev-key-do-not-use-in-prod'` |
| **integration-service** | `kms.ts:59` | KMS fallback | Development key |
| **minting-service** | `admin-auth.ts:11` | Admin secret | `'admin-secret'` fallback |
| **api-gateway** | `config/index.ts:63-65` | JWT secrets | Dev fallbacks |
| **monitoring-service** | Various | Credentials | Hardcoded defaults |

---

### Pattern 7: Mock/Placeholder Implementations

| Service | Feature | Status | Impact |
|---------|---------|--------|--------|
| **compliance-service** | OFAC Screening | MOCKED - always returns "no match" | **CRITICAL** - Sanctions compliance failure |
| **compliance-service** | IRS e-filing | NOT implemented | HIGH - Tax compliance |
| **file-service** | Virus Scanner | Falls back to mock if ClamAV unavailable | **CRITICAL** - Malware risk |
| **marketplace-service** | Wallet signature verification | Placeholder - always returns true | **CRITICAL** - Wallet ownership bypass |
| **marketplace-service** | Blockchain transfer | Placeholder implementations | **CRITICAL** |
| **analytics-service** | ML Models | TensorFlow installed but models not trained | HIGH |
| **analytics-service** | Event Processors | Placeholder code only | HIGH |
| **monitoring-service** | Blockchain metrics | Uses `Math.random()` | HIGH |
| **monitoring-service** | ML training | Stub methods | Medium |
| **integration-service** | AWS KMS | `throw new Error('Real KMS not implemented yet')` | **CRITICAL** |

---

### Pattern 8: Rate Limiting Gaps

| Service | Rate Limiting | Gaps |
|---------|--------------|------|
| api-gateway | ✅ Redis-backed | Venue tier spoofable via header |
| marketplace-service | ✅ Per-user | No IP-based for public endpoints |
| scanning-service | ⚠️ Missing on some routes | **CRITICAL** - Auth missing |
| file-service | ✅ Implemented | None identified |
| payment-service | ✅ Velocity limits | None identified |

---

## MASTER PRIORITY LIST

### CRITICAL ISSUES (43 Total) - Must Fix Before Production

#### Security Critical (15)
| # | Service | Issue | File:Line |
|---|---------|-------|-----------|
| 1 | compliance-service | OFAC screening MOCKED - always "no match" | `ofac.service.ts` |
| 2 | compliance-service | EIN/TIN stored plaintext | `venue_verifications` table |
| 3 | compliance-service | Documents on local filesystem | File storage |
| 4 | compliance-service | No IRS e-filing integration | Tax compliance |
| 5 | integration-service | Hardcoded encryption key | `token-vault.service.ts:11` |
| 6 | integration-service | KMS development key fallback | `kms.ts:59` |
| 7 | file-service | No magic number validation | `file.validator.ts:21-30` |
| 8 | file-service | Mock virus scanner fallback | `antivirus.service.ts:105-110` |
| 9 | file-service | No S3 server-side encryption | `s3.provider.ts:39-48` |
| 10 | file-service | Double extension bypass | File upload |
| 11 | marketplace-service | Wallet signature verification placeholder | `wallet-helper.ts:29-34` |
| 12 | minting-service | Hardcoded admin secret fallback | `admin-auth.ts:11` |
| 13 | scanning-service | Missing authentication on routes | Multiple routes |
| 14 | scanning-service | Missing HMAC on internal calls | Internal API |
| 15 | payment-service | Static salt in encryption | `crypto.util.ts:197` |

#### Service Boundary Critical (10)
| # | Service | Issue | File:Line |
|---|---------|-------|-----------|
| 16 | analytics-service | WRITE to `events.price_cents` | `dynamic-pricing.service.ts:147` |
| 17 | search-service | No tenant isolation on pro search | Professional search endpoints |
| 18 | search-service | 15+ direct DB queries | Enrichment services |
| 19 | search-service | Direct model imports | `content-sync.service.ts:2-3` |
| 20 | ticket-service | 15+ cross-service queries | Multiple files |
| 21 | ticket-service | Full CRUD on orders table | `Order.ts` model |
| 22 | event-service | Direct `tickets` table query | `internal.routes.ts:223` |
| 23 | payment-service | Updates `users` table | `stripe-handler.ts:411-434` |
| 24 | payment-service | Missing HMAC on internal calls | `stripe-handler.ts:486` |
| 25 | monitoring-service | Direct `events`, `ticket_transactions` queries | `sales-tracker.ts` |

#### Authentication Critical (8)
| # | Service | Issue | File:Line |
|---|---------|-------|-----------|
| 26 | api-gateway | Cache invalidation unauthenticated | `response-cache.ts:112-123` |
| 27 | monitoring-service | WebSocket auth NOT implemented | `websocket-manager.service.ts:180` |
| 28 | scanning-service | Multiple routes without auth | Route handlers |
| 29 | queue-service | Solana private key in env variable | Environment config |
| 30 | transfer-service | Solana private key exposure | Environment config |
| 31 | notification-service | HMAC disabled by default | Internal auth |
| 32 | notification-service | Email template injection | Template rendering |
| 33 | notification-service | WebSocket auth placeholder | WS endpoints |

#### Infrastructure Critical (10)
| # | Service | Issue | File:Line |
|---|---------|-------|-----------|
| 34 | order-service | Double-spend on concurrent purchases | Race condition |
| 35 | order-service | No distributed lock on checkout | Checkout flow |
| 36 | queue-service | Transaction ordering not guaranteed | Queue processing |
| 37 | queue-service | No dead-letter queue | Failed messages |
| 38 | marketplace-service | Blockchain service placeholders | `blockchain.service.ts` |
| 39 | integration-service | AWS KMS not implemented | `kms.ts` |
| 40 | integration-service | Two competing encryption services | Architecture |
| 41 | notification-service | SMS provider not implemented | SMS service |
| 42 | payment-service | In-memory replay protection | `webhook-signature.ts:301` |
| 43 | compliance-service | Manual review workflow incomplete | Review system |

---

### HIGH PRIORITY ISSUES (68 Total)

#### Authentication/Authorization (18)
| Service | Issue | Impact |
|---------|-------|--------|
| api-gateway | JWT secrets have dev fallbacks | Secret exposure |
| api-gateway | HMAC disabled by default | Unauthenticated S2S |
| api-gateway | Venue tier spoofable via header | Rate limit bypass |
| venue-service | HMAC disabled by default | Unauthenticated S2S |
| venue-service | Table name interpolation risk | SQL injection potential |
| ticket-service | HMAC feature flag bypass | Unauthenticated S2S |
| auth-service | SQL injection risk in OAuth | `oauth.service.ts:72` |
| auth-service | Debug breadcrumbs in production | Info disclosure |
| auth-service | Unnecessary React dependencies | Bundle bloat |
| marketplace-service | Dev mode HMAC bypass | Unauthenticated S2S |
| marketplace-service | Missing JWT issuer/audience validation | Token confusion |
| payment-service | Multiple unauthenticated internal calls | Security bypass |
| monitoring-service | HMAC disabled by default | Unauthenticated S2S |
| minting-service | No TLS for RabbitMQ | Data in transit |
| minting-service | SSL rejectUnauthorized: false | MITM risk |
| integration-service | No PKCE in OAuth | Auth code interception |
| scanning-service | Missing rate limiting | DoS risk |
| compliance-service | No proper secret rotation | Key management |

#### Mock/Incomplete Implementations (15)
| Service | Issue | Impact |
|---------|-------|--------|
| analytics-service | ML models not trained | Predictions useless |
| analytics-service | Event processors placeholder | Events not processed |
| analytics-service | Export storage mock | No real exports |
| monitoring-service | Mock blockchain metrics | Fake data |
| monitoring-service | Stub ML training | No anomaly detection |
| file-service | PDF watermarking disabled | Document security |
| marketplace-service | Anti-bot fails open | Bot bypass on errors |
| marketplace-service | Blockchain service incomplete | Transfer failures |
| event-service | Cancellation workflow incomplete | Refunds won't work |
| event-service | Token revocation not implemented | Can't invalidate tokens |
| ticket-service | NFT minting mocked | No real NFTs |
| ticket-service | Unimplemented endpoints (501) | Feature gaps |
| order-service | Webhook retry not implemented | Lost events |
| notification-service | Push notifications stub | No mobile push |
| compliance-service | KYC workflow incomplete | Can't verify users |

#### Data/Privacy (12)
| Service | Issue | Impact |
|---------|-------|--------|
| analytics-service | PII in customer profiles | Data exposure |
| analytics-service | No GDPR right-to-erasure | Compliance violation |
| compliance-service | Documents on local filesystem | Data loss risk |
| compliance-service | No document versioning | Audit trail gaps |
| monitoring-service | Metrics data not encrypted | Data exposure |
| search-service | PII in search results | Data leakage |
| notification-service | Email addresses logged | PII in logs |
| file-service | No encryption at rest | Data exposure |
| order-service | Order history not anonymized | GDPR risk |
| queue-service | Message payload not encrypted | Data in transit |
| transfer-service | Transfer history exposure | Privacy risk |
| blockchain-indexer | Transaction data in clear | Privacy concerns |

#### Architecture/Design (23)
| Service | Issue | Impact |
|---------|-------|--------|
| ticket-service | Duplicate transfer logic | Data inconsistency |
| ticket-service | Cross-service foreign keys | Tight coupling |
| analytics-service | 15+ service boundary violations | Architecture debt |
| search-service | Direct model imports | Tight coupling |
| marketplace-service | No distributed lock on expiration job | Duplicate processing |
| marketplace-service | Markup validation only at creation | Price manipulation |
| event-service | Notification placeholders | No notifications |
| minting-service | Route tests missing | Coverage gap |
| payment-service | Cross-service DB in refund policy | Boundary violation |
| order-service | Saga compensation incomplete | Orphaned data |
| notification-service | Channel fallback missing | Delivery failures |
| monitoring-service | Alert thresholds hardcoded | Inflexibility |
| compliance-service | Audit trail gaps | Compliance risk |
| integration-service | OAuth token refresh missing | Token expiration |
| file-service | No CDN integration | Performance |
| scanning-service | No offline mode | Venue connectivity |
| queue-service | No priority queues | SLA violations |
| transfer-service | No cancellation workflow | User experience |
| blockchain-service | Duplicate circuit breaker files | Code debt |
| blockchain-indexer | No reorg handling | Blockchain reliability |
| venue-service | SSL renewal ACME not implemented | Cert management |
| venue-service | Integration sync logic TODO | Feature incomplete |
| auth-service | No OpenAPI spec export | Documentation |

---

## TOTAL EFFORT ESTIMATES

### By Severity

| Severity | Issue Count | Estimated Days | Team Members |
|----------|-------------|----------------|--------------|
| Critical | 43 | 65-85 days | 4-6 senior devs |
| High | 68 | 45-60 days | 3-5 devs |
| Medium | 75+ | 30-40 days | 2-4 devs |
| Low | 100+ | 20-30 days | 2-3 devs |

### By Category

| Category | Issues | Estimated Days |
|----------|--------|----------------|
| Security fixes | 25 | 20-30 |
| Service boundary refactoring | 30 | 40-50 |
| Mock implementations → Real | 20 | 30-45 |
| Authentication gaps | 18 | 15-20 |
| Type safety (`any` removal) | 2500+ occurrences | 20-30 |
| Test coverage | All services | 30-40 |

**Total Estimated Effort:** 160-220 developer-days (4-6 months with 4-person team)

---

## RECOMMENDED FIX STRATEGY

### Option A: Security-First (Recommended)

**Phase 1: Critical Security (Weeks 1-4)**
- Fix all hardcoded secrets/keys
- Implement real OFAC screening
- Enable HMAC by default everywhere
- Fix authentication gaps on routes
- Implement wallet signature verification

**Phase 2: Service Boundaries (Weeks 5-10)**
- Create internal APIs for cross-service data
- Remove direct database queries
- Implement proper S2S clients

**Phase 3: Mock to Real (Weeks 11-16)**
- Implement real virus scanning
- Real AWS KMS integration
- Real blockchain operations
- Complete OAuth with PKCE

**Phase 4: Quality & Compliance (Weeks 17-24)**
- Type safety improvements
- GDPR compliance
- Test coverage
- Documentation

### Option B: Feature-First

Focus on completing mock implementations first, then security hardening. **Not recommended** due to exposure risk.

### Option C: Parallel Tracks

Run security and feature tracks simultaneously with separate teams. Higher resource requirement but faster overall.

---

## SERVICE DEPENDENCY GRAPH

```
                                    ┌─────────────────┐
                                    │   api-gateway   │
                                    │  (Entry Point)  │
                                    └────────┬────────┘
                                             │
                 ┌───────────────────────────┼───────────────────────────┐
                 │                           │                           │
                 ▼                           ▼                           ▼
        ┌────────────────┐         ┌────────────────┐         ┌────────────────┐
        │  auth-service  │◄────────│ venue-service  │         │ event-service  │
        │   (Identity)   │         │   (Venues)     │◄────────│   (Events)     │
        └───────┬────────┘         └───────┬────────┘         └───────┬────────┘
                │                          │                          │
                │                          │                          │
                ▼                          ▼                          ▼
        ┌────────────────┐         ┌────────────────┐         ┌────────────────┐
        │ ticket-service │◄────────│ order-service  │◄────────│payment-service │
        │   (Tickets)    │         │   (Orders)     │         │  (Payments)    │
        └───────┬────────┘         └───────┬────────┘         └───────┬────────┘
                │                          │                          │
                │                          │                          │
                ▼                          ▼                          ▼
        ┌────────────────┐         ┌────────────────┐         ┌────────────────┐
        │minting-service │◄────────│transfer-service│         │marketplace-svc │
        │  (NFT Mint)    │         │  (Transfers)   │         │ (Resale P2P)   │
        └───────┬────────┘         └────────────────┘         └────────────────┘
                │
                ▼
        ┌────────────────┐         ┌────────────────┐         ┌────────────────┐
        │blockchain-svc  │◄────────│blockchain-idx  │         │scanning-service│
        │(Solana Ops)    │         │  (Indexing)    │         │ (Check-in)     │
        └────────────────┘         └────────────────┘         └────────────────┘

        ┌─────────────────────── Support Services ───────────────────────┐
        │                                                                 │
        │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
        │  │notification-svc│  │ search-service │  │analytics-service│  │
        │  │ (Email/SMS)    │  │(Elasticsearch) │  │  (Metrics/ML)   │  │
        │  └────────────────┘  └────────────────┘  └────────────────┘   │
        │                                                                 │
        │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
        │  │ queue-service  │  │monitoring-svc  │  │compliance-svc  │   │
        │  │  (Bull/MQ)     │  │ (Observability)│  │ (AML/KYC)      │   │
        │  └────────────────┘  └────────────────┘  └────────────────┘   │
        │                                                                 │
        │  ┌────────────────┐  ┌────────────────┐                       │
        │  │integration-svc │  │  file-service  │                       │
        │  │ (Third-party)  │  │ (Uploads/S3)   │                       │
        │  └────────────────┘  └────────────────┘                       │
        │                                                                 │
        └─────────────────────────────────────────────────────────────────┘
```

### Critical Path Services
If these fail, core business stops:
1. **api-gateway** - All traffic
2. **auth-service** - All authentication
3. **payment-service** - All purchases
4. **ticket-service** - All ticket operations
5. **event-service** - All event data

### Service Boundary Fix Priority
Based on violation count and business impact:

1. **analytics-service** → event-service (WRITE violation)
2. **ticket-service** → order-service (15+ queries)
3. **search-service** → all services (15+ queries)
4. **payment-service** → auth-service (user updates)
5. **event-service** → ticket-service (scan stats)

---

## SERVICE-BY-SERVICE SUMMARY

| Service | Critical | High | Medium | Files | `any` | Production Ready |
|---------|----------|------|--------|-------|-------|------------------|
| api-gateway | 1 | 3 | 5 | 66 | 25 | ⚠️ Needs fixes |
| auth-service | 0 | 4 | 6 | 75 | 200 | ✅ Good |
| venue-service | 0 | 2 | 3 | 85 | 375 | ✅ Good |
| event-service | 1 | 2 | 3 | 100 | 194 | ⚠️ Needs fixes |
| ticket-service | 3 | 3 | 2 | 50 | 140 | ❌ Major issues |
| payment-service | 3 | 2 | 3 | 80 | 287 | ⚠️ Needs fixes |
| order-service | 2 | 3 | 2 | 50 | ~100 | ⚠️ Needs fixes |
| marketplace-service | 2 | 5 | 4 | 112 | 25 | ❌ Major issues |
| minting-service | 1 | 2 | 3 | 56 | ~20 | ⚠️ Needs fixes |
| blockchain-service | 0 | 0 | 4 | 65 | ~30 | ✅ Good |
| blockchain-indexer | 0 | 2 | 2 | 40 | ~30 | ✅ Good |
| transfer-service | 1 | 3 | 2 | 40 | ~50 | ⚠️ Needs fixes |
| scanning-service | 4 | 3 | 3 | 35 | ~40 | ❌ Major issues |
| queue-service | 3 | 3 | 2 | 30 | ~30 | ❌ Major issues |
| notification-service | 3 | 5 | 3 | 60 | ~80 | ❌ Major issues |
| analytics-service | 1 | 4 | 4 | 128 | 61 files | ⚠️ Needs fixes |
| search-service | 3 | 3 | 3 | 48 | 104 | ❌ Major issues |
| monitoring-service | 3 | 4 | 3 | 82 | 50 | ❌ Major issues |
| compliance-service | 4 | 7 | 4 | 91 | 130 | ❌ Major issues |
| integration-service | 4 | 4 | 3 | 83 | 50 | ❌ Major issues |
| file-service | 4 | 4 | 4 | 65 | 74 | ❌ Major issues |

### Legend
- ✅ **Good** - Minor issues, production-ready with fixes
- ⚠️ **Needs fixes** - Moderate issues, fixable in 1-2 weeks
- ❌ **Major issues** - Critical issues, needs significant work

---

## IMMEDIATE ACTION ITEMS

### Week 1 Priorities

1. **Enable HMAC by default** in all services
   - Change `USE_NEW_HMAC` default to `true`
   - Test all internal API calls

2. **Remove hardcoded secrets**
   - integration-service: Remove `'default-dev-key-do-not-use-in-prod'`
   - minting-service: Remove `'admin-secret'` fallback
   - api-gateway: Remove JWT secret fallbacks

3. **Add authentication to critical routes**
   - scanning-service: All routes
   - api-gateway: `/admin/cache/invalidate`
   - monitoring-service: WebSocket endpoints

4. **Fix critical security implementations**
   - compliance-service: Real OFAC screening (external API)
   - file-service: Real virus scanning (ClamAV required)
   - marketplace-service: Real wallet signature verification

5. **Address service boundary WRITE violations**
   - analytics-service: Create event-service API for price updates
   - payment-service: Use auth-service API for user updates

---

## APPENDIX: AUDIT REPORT SOURCES

| Service | Report Location | Lines |
|---------|----------------|-------|
| api-gateway | `API_GATEWAY_AUDIT_REPORT.md` | 874 |
| auth-service | `AUTH_SERVICE_AUDIT_REPORT.md` | 897 |
| venue-service | `VENUE_SERVICE_AUDIT_REPORT.md` | 726 |
| event-service | `EVENT_SERVICE_AUDIT_REPORT.md` | 684 |
| ticket-service | `TICKET_SERVICE_AUDIT_REPORT.md` | 814 |
| payment-service | `PAYMENT_SERVICE_AUDIT_REPORT.md` | 770 |
| marketplace-service | `MARKETPLACE_SERVICE_AUDIT_REPORT.md` + `_BATCH2.md` | 1731 |
| minting-service | `MINTING_SERVICE_AUDIT_REPORT.md` | 825 |
| blockchain-service | `BLOCKCHAIN_SERVICE_AUDIT_REPORT.md` | 762 |
| blockchain-indexer | `BLOCKCHAIN_INDEXER_AUDIT_REPORT.md` | 400+ |
| transfer-service | `TRANSFER_SERVICE_AUDIT_REPORT.md` | 400+ |
| scanning-service | `SCANNING_SERVICE_AUDIT_REPORT.md` | 400+ |
| queue-service | `QUEUE_SERVICE_AUDIT_REPORT.md` | 400+ |
| notification-service | `NOTIFICATION_SERVICE_AUDIT_REPORT.md` | 500+ |
| order-service | `ORDER_SERVICE_AUDIT_REPORT.md` | 400+ |
| analytics-service | `ANALYTICS_SERVICE_AUDIT_REPORT.md` | 645 |
| search-service | `SEARCH_SERVICE_AUDIT_REPORT.md` | 667 |
| monitoring-service | `MONITORING_SERVICE_AUDIT_REPORT.md` | 679 |
| compliance-service | `COMPLIANCE_SERVICE_AUDIT_REPORT.md` | 735 |
| integration-service | `INTEGRATION_SERVICE_AUDIT_REPORT.md` | 807 |
| file-service | `FILE_SERVICE_AUDIT_REPORT.md` | 651 |

---

*Report compiled by Claude Opus 4.5*
*Generated: 2026-01-23*
*Total Services Analyzed: 22*
*Total Critical Issues: 43*
*Total High Priority Issues: 68*
