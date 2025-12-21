# Service-to-Checklist Mapping Matrix

**Generated:** 2025-12-21  
**Purpose:** Map each of the 21 microservices to applicable research documentation for production readiness audits

---

## Overview

This document maps TicketToken's 21 microservices to the 38 production readiness research documents. Each service is assigned:
- **General Standards (01-13, 19-21)**: Universal best practices that apply to ALL services
- **Domain-Specific Standards (14-18, 22-38)**: Specialized standards based on service functionality

---

## Universal Standards (Apply to ALL Services)

All 21 services must be audited against these **13 general standards**:

| Doc # | Document Title | Applies To |
|-------|---------------|------------|
| 01 | Security | ALL |
| 02 | Input Validation | ALL |
| 03 | Error Handling | ALL |
| 04 | Logging & Observability | ALL |
| 05 | Service-to-Service Auth | ALL |
| 06 | Database Integrity | ALL |
| 07 | Idempotency | ALL |
| 08 | Rate Limiting | ALL |
| 09 | Multi-Tenancy | ALL |
| 10 | Testing | ALL |
| 11 | Documentation | ALL |
| 12 | Health Checks | ALL |
| 13 | Graceful Degradation | ALL |
| 19 | Configuration Management | ALL |
| 20 | Deployment & CI/CD | ALL |
| 21 | Database Migrations | ALL |

**Total General Checklist Items per Service:** ~650-700 items

---

## Service-Specific Mapping

### Priority 1: Critical Business Services

#### 1. **payment-service**

**Purpose:** Payment processing, fraud detection, fee distribution, refunds, tax compliance

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 25 | Compliance & Legal | PCI-DSS compliance, AML/KYC, sanctions screening, 1099-DA generation |
| 30 | Royalty Fee Calculation | Venue royalty splits, marketplace royalties, basis points calculation |
| 32 | Payment Split Accuracy | Platform fees, venue fees, seller payouts, split payments |
| 34 | Refund Scenarios | Full refunds, partial refunds, chargeback handling, refund policies |

**Priority:** CRITICAL  
**Estimated Checklist Items:** ~800

---

#### 2. **minting-service**

**Purpose:** NFT minting on Solana blockchain using Metaplex Bubblegum (compressed NFTs)

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 17 | Queues & Background Jobs | Bull queues for async minting, retry logic, job tracking |
| 26 | Blockchain Operations | Solana RPC, transaction confirmation, priority fees, retry logic |
| 31 | Blockchain-Database Consistency | Reconciliation between DB state and blockchain state |
| 36 | NFT Minting Integrity | Metaplex Bubblegum integration, metadata standards, IPFS storage |
| 37 | Wallet & Key Management | Hot wallet management, balance monitoring, key storage security |

**Priority:** CRITICAL  
**Estimated Checklist Items:** ~850

---

#### 3. **blockchain-service**

**Purpose:** Core Solana blockchain interactions, RPC management, transaction monitoring

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 26 | Blockchain Operations | RPC failover, connection pooling, transaction confirmation strategies |
| 31 | Blockchain-Database Consistency | Event listeners, transaction monitoring, state reconciliation |
| 36 | NFT Minting Integrity | NFT querying, asset verification, DAS API integration |
| 37 | Wallet & Key Management | Treasury wallet management, wallet connection tracking, signature verification |
| 38 | Time-Sensitive Operations | Transaction timeout handling, blockhash expiration |

**Priority:** CRITICAL  
**Estimated Checklist Items:** ~850

---

#### 4. **ticket-service**

**Purpose:** Ticket reservations, purchases, QR code generation/validation, transfers

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 17 | Queues & Background Jobs | Reservation expiry workers, cleanup jobs, minting queue |
| 27 | Ticket Lifecycle | Ticket states, reservation flow, validation, transfer workflow |
| 33 | Inventory Management | Real-time availability, distributed locking, reservation holds |
| 35 | QR Entry Validation | QR code encryption, rotating QR codes, scan tracking |
| 38 | Time-Sensitive Operations | Reservation timeouts, event start cutoffs, expiration handling |

**Priority:** CRITICAL  
**Estimated Checklist Items:** ~850

---

#### 5. **marketplace-service**

**Purpose:** Secondary ticket market with listings, purchases, escrow, disputes, tax reporting

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 23 | Webhooks (Outbound) | Payment webhooks, Stripe Connect webhooks |
| 25 | Compliance & Legal | Tax reporting (1099-K), KYC for high-value sales, geographic restrictions |
| 29 | Resale Business Rules | Markup limits, price caps, transfer cutoffs, venue-specific rules |
| 30 | Royalty Fee Calculation | Venue royalties on resales, creator royalties |
| 32 | Payment Split Accuracy | Platform fees, venue fees, seller payouts, Stripe application fees |
| 34 | Refund Scenarios | Dispute resolution, refund processing, escrow release |
| 38 | Time-Sensitive Operations | Listing expiration, transfer cutoffs, time-based pricing |

**Priority:** CRITICAL  
**Estimated Checklist Items:** ~900

---

### Priority 2: Core Platform Services

#### 6. **order-service**

**Purpose:** Order lifecycle management, refunds, modifications, tax calculation

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 17 | Queues & Background Jobs | Order expiration jobs, reconciliation jobs, archiving |
| 24 | Scheduled Jobs & Cron | Daily summaries, weekly reports, cleanup jobs |
| 25 | Compliance & Legal | Refund compliance (FTC, state laws), tax calculation |
| 34 | Refund Scenarios | Refund policies, partial refunds, eligibility checking |
| 38 | Time-Sensitive Operations | Order reservation timeouts, payment windows |

**Priority:** HIGH  
**Estimated Checklist Items:** ~800

---

#### 7. **auth-service**

**Purpose:** User authentication, authorization, session management, JWT tokens

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 25 | Compliance & Legal | GDPR, CCPA, data protection, consent management |
| 37 | Wallet & Key Management | Wallet signature verification, web3 authentication |

**Priority:** HIGH  
**Estimated Checklist Items:** ~750

---

#### 8. **event-service**

**Purpose:** Event management, venue coordination, event lifecycle

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 28 | Event State Management | Event lifecycle states, status transitions, cancellations |
| 38 | Time-Sensitive Operations | Event start/end times, sale windows, cutoff times |

**Priority:** HIGH  
**Estimated Checklist Items:** ~750

---

#### 9. **venue-service**

**Purpose:** Venue management, settings, branding, marketplace rules

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 14 | File Handling | Venue logos, branding assets, image uploads |
| 29 | Resale Business Rules | Venue-specific marketplace rules, royalty settings |

**Priority:** HIGH  
**Estimated Checklist Items:** ~750

---

#### 10. **notification-service**

**Purpose:** Multi-channel notifications (email, SMS, push), campaign management, GDPR compliance

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 15 | Notifications | Multi-channel delivery, template management, personalization |
| 17 | Queues & Background Jobs | Email/SMS queues, batch sending, retry logic |
| 23 | Webhooks (Outbound) | SendGrid/Twilio webhooks, delivery status callbacks |
| 24 | Scheduled Jobs & Cron | Campaign scheduling, abandoned cart emails, data retention |
| 25 | Compliance & Legal | GDPR compliance, consent management, data portability, suppression lists |

**Priority:** HIGH  
**Estimated Checklist Items:** ~850

---

### Priority 3: Supporting Services

#### 11. **file-service**

**Purpose:** File uploads, virus scanning, CDN, storage quotas

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 14 | File Handling | Upload validation, magic bytes, virus scanning, S3 security, presigned URLs |

**Priority:** MEDIUM  
**Estimated Checklist Items:** ~750

---

#### 12. **search-service**

**Purpose:** Elasticsearch-based search for events, tickets, listings

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 16 | Caching | Search result caching, query caching |
| 18 | Search | Elasticsearch integration, indexing strategies, search optimization |

**Priority:** MEDIUM  
**Estimated Checklist Items:** ~750

---

#### 13. **analytics-service**

**Purpose:** Business metrics, reporting, dashboards, data aggregation

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 16 | Caching | Metrics caching, dashboard caching |
| 24 | Scheduled Jobs & Cron | Daily/weekly/monthly aggregations, report generation |

**Priority:** MEDIUM  
**Estimated Checklist Items:** ~750

---

#### 14. **compliance-service**

**Purpose:** KYC/AML, sanctions screening, compliance checks

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 25 | Compliance & Legal | KYC verification, AML checks, sanctions list screening, audit trails |

**Priority:** MEDIUM  
**Estimated Checklist Items:** ~750

---

#### 15. **api-gateway**

**Purpose:** API gateway, routing, rate limiting, authentication

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 22 | API Versioning | Version management, deprecation, backward compatibility |

**Priority:** MEDIUM  
**Estimated Checklist Items:** ~750

---

#### 16. **scanning-service**

**Purpose:** QR code scanning, ticket validation at venue entry

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 35 | QR Entry Validation | QR scanning, validation logic, duplicate scan prevention |
| 38 | Time-Sensitive Operations | Event entry windows, validation timeouts |

**Priority:** MEDIUM  
**Estimated Checklist Items:** ~750

---

#### 17. **transfer-service**

**Purpose:** Ticket transfer operations between users

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 26 | Blockchain Operations | On-chain NFT transfers, transaction confirmation |
| 27 | Ticket Lifecycle | Transfer workflows, acceptance, cancellation |
| 38 | Time-Sensitive Operations | Transfer cutoffs, acceptance timeouts |

**Priority:** MEDIUM  
**Estimated Checklist Items:** ~750

---

#### 18. **blockchain-indexer**

**Purpose:** Index blockchain events, sync on-chain data

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 17 | Queues & Background Jobs | Event processing queues, indexing workers |
| 26 | Blockchain Operations | Event listening, transaction parsing, block monitoring |
| 31 | Blockchain-Database Consistency | State synchronization, reorg handling |

**Priority:** MEDIUM  
**Estimated Checklist Items:** ~800

---

#### 19. **queue-service**

**Purpose:** Centralized queue management (RabbitMQ/Bull wrapper)

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 17 | Queues & Background Jobs | Queue configuration, dead letter queues, retry policies |

**Priority:** MEDIUM  
**Estimated Checklist Items:** ~750

---

#### 20. **integration-service**

**Purpose:** Third-party integrations (Stripe, Twilio, external APIs)

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 23 | Webhooks (Outbound) | Webhook delivery, signature verification, retry logic |

**Priority:** MEDIUM  
**Estimated Checklist Items:** ~750

---

#### 21. **monitoring-service**

**Purpose:** System monitoring, alerting, health checks

**General Standards:** 01-13, 19-21 ✅

**Domain-Specific Standards:**
| Doc # | Document Title | Rationale |
|-------|---------------|-----------|
| 24 | Scheduled Jobs & Cron | Metric collection jobs, alert evaluation |

**Priority:** LOW  
**Estimated Checklist Items:** ~750

---

## Summary Statistics

| Priority | Service Count | Avg Checklist Items | Total Items |
|----------|---------------|---------------------|-------------|
| CRITICAL | 5 | ~850 | ~4,250 |
| HIGH | 5 | ~800 | ~4,000 |
| MEDIUM | 10 | ~750 | ~7,500 |
| LOW | 1 | ~750 | ~750 |
| **TOTAL** | **21** | **~780** | **~16,500** |

---

## Domain-Specific Document Usage

| Doc # | Title | Used By (Count) | Services |
|-------|-------|-----------------|----------|
| 14 | File Handling | 2 | file-service, venue-service |
| 15 | Notifications | 1 | notification-service |
| 16 | Caching | 2 | search-service, analytics-service |
| 17 | Queues & Background Jobs | 6 | minting-service, ticket-service, order-service, notification-service, blockchain-indexer, queue-service |
| 18 | Search | 1 | search-service |
| 22 | API Versioning | 1 | api-gateway |
| 23 | Webhooks (Outbound) | 3 | marketplace-service, notification-service, integration-service |
| 24 | Scheduled Jobs & Cron | 4 | order-service, notification-service, analytics-service, monitoring-service |
| 25 | Compliance & Legal | 5 | payment-service, marketplace-service, order-service, auth-service, notification-service, compliance-service |
| 26 | Blockchain Operations | 4 | minting-service, blockchain-service, transfer-service, blockchain-indexer |
| 27 | Ticket Lifecycle | 2 | ticket-service, transfer-service |
| 28 | Event State Management | 1 | event-service |
| 29 | Resale Business Rules | 2 | marketplace-service, venue-service |
| 30 | Royalty Fee Calculation | 2 | payment-service, marketplace-service |
| 31 | Blockchain-Database Consistency | 3 | minting-service, blockchain-service, blockchain-indexer |
| 32 | Payment Split Accuracy | 2 | payment-service, marketplace-service |
| 33 | Inventory Management | 1 | ticket-service |
| 34 | Refund Scenarios | 3 | payment-service, marketplace-service, order-service |
| 35 | QR Entry Validation | 2 | ticket-service, scanning-service |
| 36 | NFT Minting Integrity | 2 | minting-service, blockchain-service |
| 37 | Wallet & Key Management | 3 | minting-service, blockchain-service, auth-service |
| 38 | Time-Sensitive Operations | 6 | blockchain-service, ticket-service, marketplace-service, order-service, event-service, transfer-service, scanning-service |

---

## Notes

1. **All services** inherit the 13 general standards (01-13, 19-21)
2. **Domain-specific** standards are additive based on service capabilities
3. **Total checklist items** are estimates based on document complexity
4. **Priority** levels guide audit sequencing (Critical → High → Medium → Low)
5. Some services may have **overlapping** domain standards (e.g., both blockchain and payment operations)

---

**Next Steps:**
1. Review this mapping with the development team
2. Adjust priorities based on business criticality
3. Begin audit execution starting with CRITICAL priority services
4. Refer to `AUDIT-EXECUTION-PLAN.md` for detailed audit workflow

---

*Generated: 2025-12-21*  
*Document Version: 1.0*
