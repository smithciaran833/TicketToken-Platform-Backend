# C4 Model - Context Diagram

## Ticket Service - System Context

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                    USERS                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐                       │
│  │   Fan   │    │  Venue  │    │ Artist  │    │  Admin  │                       │
│  │  (User) │    │  Owner  │    │         │    │         │                       │
│  └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘                       │
│       │              │              │              │                            │
└───────┼──────────────┼──────────────┼──────────────┼────────────────────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY                                           │
│                    (Authentication, Routing, Rate Limiting)                      │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         TICKET SERVICE                                           │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          Core Capabilities                              │    │
│  │  • Ticket lifecycle management (create, reserve, purchase, transfer)    │    │
│  │  • QR code generation and validation                                    │    │
│  │  • NFT minting orchestration (compressed NFTs on Solana)                │    │
│  │  • Check-in/scanning support                                            │    │
│  │  • Transfer and resale coordination                                     │    │
│  │  • Ticket state machine (MINTED → ACTIVE → USED → EXPIRED)              │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└────┬─────────────────────┬─────────────────────┬────────────────────────────────┘
     │                     │                     │
     ▼                     ▼                     ▼
┌────────────┐      ┌────────────┐       ┌────────────┐
│  Event     │      │  Payment   │       │ Blockchain │
│  Service   │      │  Service   │       │  Service   │
│            │      │            │       │            │
│ • Events   │      │ • Stripe   │       │ • Solana   │
│ • Venues   │      │ • Refunds  │       │ • cNFTs    │
│ • Pricing  │      │ • Wallets  │       │ • Transfers│
└────────────┘      └────────────┘       └────────────┘
     │                     │                     │
     └─────────────────────┼─────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   SUPPORTING SERVICES  │
              │                        │
              │  • Auth Service        │
              │  • Notification Service│
              │  • Scanning Service    │
              │  • Transfer Service    │
              │  • Marketplace Service │
              │  • Order Service       │
              └────────────────────────┘
```

## External Systems

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SYSTEMS                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐               │
│  │     SOLANA       │  │      STRIPE      │  │      REDIS       │               │
│  │   BLOCKCHAIN     │  │    PAYMENTS      │  │      CACHE       │               │
│  │                  │  │                  │  │                  │               │
│  │ • NFT Minting    │  │ • Payment Intent │  │ • Rate Limiting  │               │
│  │ • Transfers      │  │ • Refunds        │  │ • Session Cache  │               │
│  │ • Ownership      │  │ • Webhooks       │  │ • Circuit State  │               │
│  │ • Merkle Trees   │  │                  │  │                  │               │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘               │
│                                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐               │
│  │    POSTGRESQL    │  │    RABBITMQ      │  │   JAEGER/OTEL    │               │
│  │    DATABASE      │  │     QUEUES       │  │     TRACING      │               │
│  │                  │  │                  │  │                  │               │
│  │ • Ticket Data    │  │ • Async Events   │  │ • Distributed    │               │
│  │ • RLS Policies   │  │ • DLQ Support    │  │   Tracing        │               │
│  │ • Idempotency    │  │ • Tenant Queues  │  │ • Metrics        │               │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘               │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Ticket Purchase Flow
```
Fan App → API Gateway → Ticket Service → Event Service (validate)
                                       → Payment Service (charge)
                                       → Blockchain Service (mint NFT)
                                       → Notification Service (confirm)
```

### Ticket Transfer Flow
```
Fan App → API Gateway → Ticket Service → Transfer Service (validate)
                                       → Blockchain Service (transfer NFT)
                                       → Notification Service (notify both)
```

### Check-in Flow
```
Venue Scanner → API Gateway → Ticket Service → Scanning Service (validate)
                                             → Update ticket status
                                             → Log scan event
```

## Security Boundaries

| Boundary | Description |
|----------|-------------|
| Internet → API Gateway | TLS 1.3, JWT Auth, Rate Limiting |
| API Gateway → Services | mTLS, Service-to-Service JWT |
| Services → Database | TLS, RLS, Non-superuser Role |
| Services → Redis | TLS, AUTH |
| Services → RabbitMQ | TLS, Per-service Credentials |

## Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TICKET SERVICE CONTAINER                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                  │
│  │      API        │  │    Services     │  │   Middleware    │                  │
│  │                 │  │                 │  │                 │                  │
│  │ • purchaseRoutes│  │ • ticketService │  │ • auth          │                  │
│  │ • transferRoutes│  │ • queueService  │  │ • tenant        │                  │
│  │ • healthRoutes  │  │ • solanaService │  │ • idempotency   │                  │
│  │                 │  │ • security      │  │ • rate-limit    │                  │
│  │                 │  │ • stateMachine  │  │ • errorHandler  │                  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘                  │
│           │                    │                    │                           │
│           └────────────────────┼────────────────────┘                           │
│                                │                                                │
│  ┌─────────────────────────────┴─────────────────────────────────────────┐      │
│  │                          INFRASTRUCTURE                               │      │
│  │                                                                        │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │      │
│  │  │ Database │  │  Redis   │  │ RabbitMQ │  │  Tracing │              │      │
│  │  │ Service  │  │  Service │  │  Queue   │  │  Service │              │      │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘              │      │
│  │                                                                        │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                            │      │
│  │  │ Metrics  │  │  Logger  │  │ Resilience│                            │      │
│  │  │          │  │          │  │ (CB, Retry)│                            │      │
│  │  └──────────┘  └──────────┘  └──────────┘                            │      │
│  └────────────────────────────────────────────────────────────────────────┘      │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Node.js 20 | JavaScript runtime |
| Framework | Fastify | HTTP server |
| Database | PostgreSQL 15 | Primary data store |
| Cache | Redis 7 | Rate limiting, caching |
| Queue | RabbitMQ | Async messaging |
| Blockchain | Solana | NFT minting |
| Tracing | OpenTelemetry | Distributed tracing |
| Metrics | Prometheus | Monitoring |
| Language | TypeScript | Type safety |
