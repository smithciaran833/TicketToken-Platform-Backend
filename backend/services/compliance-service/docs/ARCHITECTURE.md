# Compliance Service Architecture

**AUDIT FIX: DOC-M2** - No C4 architecture diagrams

## C4 Model Overview

This document describes the architecture of the Compliance Service using the C4 model.

---

## Level 1: System Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                              TicketToken Platform                            │
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │  Users   │    │  Venue   │    │  Admin   │    │ External │             │
│  │          │────│  Owners  │────│  Staff   │────│  Auditor │             │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘             │
│       │               │               │               │                     │
│       └───────────────┴───────┬───────┴───────────────┘                     │
│                               │                                             │
│                               ▼                                             │
│                    ┌─────────────────────┐                                  │
│                    │    API Gateway      │                                  │
│                    │  (Authentication)   │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                             │
│       ┌───────────────────────┼───────────────────────┐                     │
│       │                       │                       │                     │
│       ▼                       ▼                       ▼                     │
│  ┌──────────┐         ┌────────────────┐       ┌──────────┐               │
│  │  User    │         │  COMPLIANCE    │       │  Other   │               │
│  │ Service  │────────▶│   SERVICE      │◀──────│ Services │               │
│  └──────────┘         └───────┬────────┘       └──────────┘               │
│                               │                                             │
│                               ▼                                             │
│                    ┌─────────────────────┐                                  │
│                    │  External Systems   │                                  │
│                    │  (Stripe, OFAC)     │                                  │
│                    └─────────────────────┘                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### External Actors

| Actor | Description |
|-------|-------------|
| Users | End users requesting GDPR data export/deletion |
| Venue Owners | Business owners subject to tax reporting |
| Admin Staff | TicketToken compliance officers |
| External Auditor | Third-party compliance auditors |

### External Systems

| System | Purpose |
|--------|---------|
| Stripe | Payment webhooks, dispute notifications |
| OFAC | SDN list for sanctions screening |
| IRS | 1099 form submission |

---

## Level 2: Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Compliance Service                                 │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                          API Layer (Fastify)                          │  │
│  │                                                                        │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │  │
│  │  │   GDPR     │  │   Risk     │  │   Tax      │  │  Webhook   │     │  │
│  │  │  Routes    │  │  Routes    │  │  Routes    │  │  Routes    │     │  │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘     │  │
│  └────────┼───────────────┼───────────────┼───────────────┼─────────────┘  │
│           │               │               │               │                 │
│           ▼               ▼               ▼               ▼                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         Service Layer                                  │  │
│  │                                                                        │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │  │
│  │  │   GDPR     │  │   Risk     │  │   Tax      │  │   OFAC     │     │  │
│  │  │  Service   │  │  Service   │  │  Service   │  │  Service   │     │  │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘     │  │
│  └────────┼───────────────┼───────────────┼───────────────┼─────────────┘  │
│           │               │               │               │                 │
│           ▼               ▼               ▼               ▼                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         Data Layer                                     │  │
│  │                                                                        │  │
│  │  ┌─────────────────────┐           ┌─────────────────────┐           │  │
│  │  │     PostgreSQL      │           │       Redis         │           │  │
│  │  │     (Primary DB)    │           │     (Cache/Lock)    │           │  │
│  │  │                     │           │                     │           │  │
│  │  │  - gdpr_requests    │           │  - Rate limiting    │           │  │
│  │  │  - risk_flags       │           │  - Session cache    │           │  │
│  │  │  - tax_forms        │           │  - Distributed lock │           │  │
│  │  │  - audit_logs       │           │  - Feature flags    │           │  │
│  │  └─────────────────────┘           └─────────────────────┘           │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Containers

| Container | Technology | Purpose |
|-----------|------------|---------|
| API Layer | Fastify | HTTP request handling, validation |
| Service Layer | TypeScript | Business logic |
| PostgreSQL | PostgreSQL 15 | Primary data storage with RLS |
| Redis | Redis 7 | Caching, rate limiting, distributed locks |

---

## Level 3: Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Service Layer                                     │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         GDPR Module                                    │  │
│  │                                                                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │  │
│  │  │   Export     │  │   Delete     │  │   Consent    │                 │  │
│  │  │  Generator   │  │   Handler    │  │   Manager    │                 │  │
│  │  │              │  │              │  │              │                 │  │
│  │  │ - Collect    │  │ - Anonymize  │  │ - Record     │                 │  │
│  │  │ - Transform  │  │ - Cascade    │  │ - Withdraw   │                 │  │
│  │  │ - Package    │  │ - Verify     │  │ - History    │                 │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Risk Module                                    │  │
│  │                                                                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │  │
│  │  │   Risk       │  │    Flag      │  │  Velocity    │                 │  │
│  │  │  Scorer      │  │   Manager    │  │  Detector    │                 │  │
│  │  │              │  │              │  │              │                 │  │
│  │  │ - Calculate  │  │ - Create     │  │ - Track      │                 │  │
│  │  │ - Threshold  │  │ - Update     │  │ - Alert      │                 │  │
│  │  │ - History    │  │ - Resolve    │  │ - Pattern    │                 │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          Tax Module                                    │  │
│  │                                                                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │  │
│  │  │   1099       │  │   W9         │  │  Threshold   │                 │  │
│  │  │  Generator   │  │   Collector  │  │  Calculator  │                 │  │
│  │  │              │  │              │  │              │                 │  │
│  │  │ - Generate   │  │ - Validate   │  │ - Track      │                 │  │
│  │  │ - Submit     │  │ - Store      │  │ - Notify     │                 │  │
│  │  │ - Correct    │  │ - Encrypt    │  │ - Report     │                 │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         OFAC Module                                    │  │
│  │                                                                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │  │
│  │  │    SDN       │  │   Screen     │  │   Match      │                 │  │
│  │  │   Syncer     │  │   Engine     │  │   Handler    │                 │  │
│  │  │              │  │              │  │              │                 │  │
│  │  │ - Download   │  │ - Name       │  │ - Verify     │                 │  │
│  │  │ - Parse      │  │ - Address    │  │ - Escalate   │                 │  │
│  │  │ - Update     │  │ - Fuzzy      │  │ - Report     │                 │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Level 4: Code Diagram

### GDPR Export Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       GDPR Export Request Flow                           │
│                                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│  │ Request  │───▶│ Identity │───▶│ Collect  │───▶│ Package  │         │
│  │ Handler  │    │ Verify   │    │ Data     │    │ Export   │         │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘         │
│       │               │               │               │                 │
│       ▼               ▼               ▼               ▼                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│  │ Validate │    │  Email   │    │ Query    │    │ Generate │         │
│  │ Schema   │    │  OTP     │    │ Services │    │   JSON   │         │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘         │
│       │               │               │               │                 │
│       │               │               ▼               │                 │
│       │               │         ┌──────────┐         │                 │
│       │               │         │ Services:│         │                 │
│       │               │         │ - User   │         │                 │
│       │               │         │ - Event  │         │                 │
│       │               │         │ - Ticket │         │                 │
│       │               │         │ - Payment│         │                 │
│       │               │         └──────────┘         │                 │
│       │               │               │               │                 │
│       └───────────────┴───────────────┴───────────────┘                 │
│                               │                                         │
│                               ▼                                         │
│                    ┌─────────────────────┐                              │
│                    │  Store Export URL   │                              │
│                    │  (Signed, Expires)  │                              │
│                    └─────────────────────┘                              │
│                               │                                         │
│                               ▼                                         │
│                    ┌─────────────────────┐                              │
│                    │ Send Email with Link│                              │
│                    └─────────────────────┘                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Risk Assessment Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│    ┌─────────┐         ┌─────────┐         ┌─────────┐                 │
│    │ Webhook │────────▶│ Process │────────▶│ Score   │                 │
│    │ Event   │         │ Payment │         │ Risk    │                 │
│    └─────────┘         └─────────┘         └─────────┘                 │
│         │                                        │                      │
│         │                                        ▼                      │
│         │                               ┌──────────────┐                │
│         │                               │ Risk >= 70?  │                │
│         │                               └──────┬───────┘                │
│         │                                      │                        │
│         │                     ┌────────────────┼────────────────┐       │
│         │                     │ YES            │            NO  │       │
│         │                     ▼                │                ▼       │
│         │              ┌──────────┐            │         ┌──────────┐  │
│         │              │ Create   │            │         │ Update   │  │
│         │              │ Flag     │            │         │ Score    │  │
│         │              └──────────┘            │         └──────────┘  │
│         │                     │                │                        │
│         │                     ▼                │                        │
│         │              ┌──────────┐            │                        │
│         │              │ Notify   │            │                        │
│         │              │ Slack    │            │                        │
│         │              └──────────┘            │                        │
│         │                                      │                        │
│         └──────────────────────────────────────┘                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Security Layers                                  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                   1. Network Security                              │  │
│  │                                                                     │  │
│  │  • TLS 1.3 for all connections                                     │  │
│  │  • WAF protection at load balancer                                 │  │
│  │  • Private VPC for internal services                               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                               │                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                   2. Authentication                                │  │
│  │                                                                     │  │
│  │  • JWT token validation                                            │  │
│  │  • Service-to-service authentication                               │  │
│  │  • Webhook signature verification                                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                               │                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                   3. Authorization                                 │  │
│  │                                                                     │  │
│  │  • Role-based access control (RBAC)                                │  │
│  │  • Row-level security (RLS) in PostgreSQL                          │  │
│  │  • Tenant isolation                                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                               │                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                   4. Data Protection                               │  │
│  │                                                                     │  │
│  │  • Encryption at rest (AES-256)                                    │  │
│  │  • Field-level encryption for PII                                  │  │
│  │  • Secure secrets management (AWS SM)                              │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                               │                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                   5. Monitoring & Audit                            │  │
│  │                                                                     │  │
│  │  • Request/response logging                                        │  │
│  │  • Audit trail for sensitive operations                            │  │
│  │  • Real-time alerting                                              │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AWS Infrastructure                               │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                           VPC                                       │ │
│  │                                                                      │ │
│  │  ┌──────────────────┐   ┌──────────────────┐                       │ │
│  │  │   Public Subnet  │   │   Public Subnet  │                       │ │
│  │  │                  │   │                  │                       │ │
│  │  │  ┌────────────┐  │   │  ┌────────────┐  │                       │ │
│  │  │  │    ALB     │  │   │  │    ALB     │  │                       │ │
│  │  │  │ (Primary)  │  │   │  │ (Standby)  │  │                       │ │
│  │  │  └─────┬──────┘  │   │  └────────────┘  │                       │ │
│  │  │        │         │   │                  │                       │ │
│  │  └────────┼─────────┘   └──────────────────┘                       │ │
│  │           │                                                         │ │
│  │  ┌────────┼───────────────────────────────────────────────────────┐ │
│  │  │        ▼           Private Subnets                              │ │
│  │  │                                                                  │ │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │ │
│  │  │  │     EKS      │  │     EKS      │  │     EKS      │          │ │
│  │  │  │   Pod 1      │  │   Pod 2      │  │   Pod 3      │          │ │
│  │  │  │ Compliance   │  │ Compliance   │  │ Compliance   │          │ │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘          │ │
│  │  │                                                                  │ │
│  │  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │  │                    RDS (PostgreSQL)                       │  │ │
│  │  │  │                                                            │  │ │
│  │  │  │  Primary (Multi-AZ)      Read Replica                     │  │ │
│  │  │  └──────────────────────────────────────────────────────────┘  │ │
│  │  │                                                                  │ │
│  │  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │  │                   ElastiCache (Redis)                     │  │ │
│  │  │  │                                                            │  │ │
│  │  │  │  Primary (Cluster Mode)      Replica                      │  │ │
│  │  │  └──────────────────────────────────────────────────────────┘  │ │
│  │  │                                                                  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Node.js | 20 LTS |
| Framework | Fastify | 4.x |
| Language | TypeScript | 5.x |
| Database | PostgreSQL | 15.x |
| Cache | Redis | 7.x |
| Queue | BullMQ | 4.x |
| Container | Docker | 24.x |
| Orchestration | Kubernetes (EKS) | 1.28 |
| Cloud | AWS | - |

---

## Decision Records

### ADR-001: Fastify over Express

**Status**: Accepted

**Context**: Need performant HTTP framework for high-throughput compliance API.

**Decision**: Use Fastify for:
- Better performance (2x throughput)
- Built-in schema validation
- TypeScript-first design
- Plugin architecture

### ADR-002: PostgreSQL RLS for Multi-Tenancy

**Status**: Accepted

**Context**: Need secure tenant data isolation.

**Decision**: Use PostgreSQL Row Level Security:
- Database-enforced isolation
- Cannot be bypassed by application bugs
- Works with all query types

### ADR-003: Redis for Distributed State

**Status**: Accepted

**Context**: Need shared state across pods for rate limiting and caching.

**Decision**: Use Redis for:
- Rate limiting (sliding window)
- Distributed locks
- Feature flag caching
- Session caching
