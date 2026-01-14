# Order Service C4 Architecture Diagrams

## C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              TICKETTOKEN PLATFORM                                │
│                                                                                  │
│  ┌────────────┐                                              ┌────────────┐     │
│  │   Users    │                                              │   Admin    │     │
│  │(Customers) │                                              │   Portal   │     │
│  └─────┬──────┘                                              └─────┬──────┘     │
│        │                                                           │            │
│        │ HTTPS                                                     │ HTTPS      │
│        ▼                                                           ▼            │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                           API GATEWAY                                    │   │
│  │            (Authentication, Rate Limiting, Routing)                      │   │
│  └──────────────────────────────┬──────────────────────────────────────────┘   │
│                                 │                                               │
│                    ┌────────────┼────────────┐                                  │
│                    ▼            ▼            ▼                                  │
│             ┌───────────┐ ┌───────────┐ ┌───────────┐                          │
│             │  Event    │ │  Order    │ │  Ticket   │                          │
│             │  Service  │ │  Service  │ │  Service  │                          │
│             └───────────┘ └─────┬─────┘ └───────────┘                          │
│                                 │                                               │
│                    ┌────────────┴────────────┐                                  │
│                    ▼                         ▼                                  │
│             ┌───────────┐             ┌───────────┐                             │
│             │  Payment  │             │ Transfer  │                             │
│             │  Service  │             │  Service  │                             │
│             └─────┬─────┘             └───────────┘                             │
│                   │                                                             │
│                   ▼                                                             │
│             ┌───────────┐                                                       │
│             │   Stripe  │  [External System]                                    │
│             │    API    │                                                       │
│             └───────────┘                                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## C4 Container Diagram - Order Service

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              ORDER SERVICE                                      │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                         FASTIFY APPLICATION                              │  │
│  │                                                                          │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐    │  │
│  │  │   Routes   │  │   Routes   │  │   Routes   │  │    Routes      │    │  │
│  │  │  /orders   │  │   /tax     │  │  /refund   │  │   /health      │    │  │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └────────────────┘    │  │
│  │        │               │               │                                 │  │
│  │        └───────────────┼───────────────┘                                 │  │
│  │                        ▼                                                  │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │  │
│  │  │                      MIDDLEWARE LAYER                            │    │  │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────┐  │    │  │
│  │  │  │ JWT Auth    │ │  Tenant     │ │  Validation │ │ Rate     │  │    │  │
│  │  │  │ Plugin      │ │  Middleware │ │  Middleware │ │ Limiter  │  │    │  │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘ └──────────┘  │    │  │
│  │  └─────────────────────────────────────────────────────────────────┘    │  │
│  │                        │                                                  │  │
│  │                        ▼                                                  │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │  │
│  │  │                      SERVICE LAYER                               │    │  │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────┐  │    │  │
│  │  │  │ Order       │ │  Refund     │ │  Dispute    │ │ Tax      │  │    │  │
│  │  │  │ Service     │ │  Eligibility│ │  Service    │ │ Service  │  │    │  │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘ └──────────┘  │    │  │
│  │  └─────────────────────────────────────────────────────────────────┘    │  │
│  │                        │                                                  │  │
│  │                        ▼                                                  │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │  │
│  │  │                    SERVICE CLIENTS                               │    │  │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │    │  │
│  │  │  │ Payment     │ │  Ticket     │ │  Event      │                │    │  │
│  │  │  │ Client      │ │  Client     │ │  Client     │                │    │  │
│  │  │  │ (Circuit    │ │  (Circuit   │ │  (Circuit   │                │    │  │
│  │  │  │  Breaker)   │ │   Breaker)  │ │   Breaker)  │                │    │  │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘                │    │  │
│  │  └─────────────────────────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                   │
│  │   PostgreSQL   │  │     Redis      │  │   RabbitMQ     │                   │
│  │   (via        │  │   (Caching,    │  │   (Events,     │                   │
│  │    PgBouncer) │  │    Sessions)   │  │    Pub/Sub)    │                   │
│  └────────────────┘  └────────────────┘  └────────────────┘                   │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### Routes
| Route | Purpose | Auth Required |
|-------|---------|---------------|
| `/api/v1/orders` | Order CRUD, checkout | Yes |
| `/api/v1/tax` | Tax calculations, jurisdictions | Yes |
| `/api/v1/refund-policy` | Refund policies management | Yes |
| `/health/*` | Health checks | No |
| `/metrics` | Prometheus metrics | No |

### Service Clients
| Client | Target Service | Features |
|--------|---------------|----------|
| PaymentClient | payment-service | Circuit breaker, retry, S2S auth |
| TicketClient | ticket-service | Circuit breaker, transfer checks |
| EventClient | event-service | Event details, dates |

### Data Flows

1. **Order Creation Flow**
   ```
   User → API Gateway → Order Service → Ticket Service (reserve)
                                     → Payment Service (payment intent)
   ```

2. **Refund Flow**
   ```
   User → Order Service → Eligibility Check → Ticket Service (transfer check)
                                            → Payment Service (refund)
                                            → Dispute Service (check disputes)
   ```

3. **Dispute Flow**
   ```
   Payment Service (webhook) → Order Service → Lock refunds
                                            → Alert team
                                            → Track dispute
   ```
