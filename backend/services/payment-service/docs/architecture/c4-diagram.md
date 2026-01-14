# Payment Service C4 Architecture Diagrams

**LOW FIX: Create C4 diagrams for architecture documentation**

## Level 1: System Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TICKETTOKEN PLATFORM                               │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │   Mobile    │
                    │    App      │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Web App   │
                    │  (React)    │
                    └──────┬──────┘
                           │
                           │ HTTPS
                           ▼
                ┌────────────────────┐
                │    API Gateway     │
                │    (Kong/Nginx)    │
                └─────────┬──────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────────┐
│   Auth      │  │   Event     │  │    PAYMENT      │
│   Service   │  │   Service   │  │    SERVICE      │◄────────────┐
└─────────────┘  └─────────────┘  └────────┬────────┘             │
                                           │                       │
                                           │ HTTPS                 │
                                           ▼                       │
                                  ┌─────────────────┐              │
                                  │     Stripe      │              │
                                  │   (Payment      │              │
                                  │   Provider)     │ ◄────────────┤
                                  └─────────────────┘   Webhooks   │
                                                                   │
                                  ┌─────────────────┐              │
                                  │   PostgreSQL    │◄─────────────┤
                                  │   (Database)    │              │
                                  └─────────────────┘              │
                                                                   │
                                  ┌─────────────────┐              │
                                  │     Redis       │◄─────────────┘
                                  │   (Cache/Jobs)  │
                                  └─────────────────┘
```

## Level 2: Container Diagram (Payment Service)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PAYMENT SERVICE                                    │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Fastify HTTP Server                            │   │
│  │                                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │   Health    │  │  Payment    │  │   Refund    │  │  Webhook    │  │   │
│  │  │   Routes    │  │   Routes    │  │   Routes    │  │   Routes    │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │   │
│  │         │                │                │                │         │   │
│  │         └────────────────┴────────────────┴────────────────┘         │   │
│  │                                   │                                   │   │
│  │                    ┌──────────────┴──────────────┐                   │   │
│  │                    │       Middleware Stack       │                   │   │
│  │                    │  ┌─────────────────────────┐│                   │   │
│  │                    │  │ Auth → Tenant → Rate    ││                   │   │
│  │                    │  │ Limit → Idempotency     ││                   │   │
│  │                    │  └─────────────────────────┘│                   │   │
│  │                    └──────────────┬──────────────┘                   │   │
│  └───────────────────────────────────┼───────────────────────────────────┘   │
│                                      │                                       │
│  ┌───────────────────────────────────┴───────────────────────────────────┐   │
│  │                         Service Layer                                  │   │
│  │                                                                        │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐  │   │
│  │  │   Payment     │  │    Refund     │  │    Stripe Connect         │  │   │
│  │  │   Processor   │  │    Service    │  │    Transfer Service       │  │   │
│  │  └───────────────┘  └───────────────┘  └───────────────────────────┘  │   │
│  │                                                                        │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐  │   │
│  │  │     Fee       │  │   Escrow      │  │     Alerting              │  │   │
│  │  │  Calculator   │  │   Service     │  │     Service               │  │   │
│  │  └───────────────┘  └───────────────┘  └───────────────────────────┘  │   │
│  │                                                                        │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐   │
│  │                         Data Layer                                      │   │
│  │                                                                         │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐   │   │
│  │  │   Database    │  │    Cache      │  │      Job Queue            │   │   │
│  │  │   Service     │  │   Service     │  │   (BullMQ + Redis)        │   │   │
│  │  │  (PostgreSQL) │  │   (Redis)     │  │                           │   │   │
│  │  └───────────────┘  └───────────────┘  └───────────────────────────┘   │   │
│  │                                                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Level 3: Component Diagram (Payment Processing)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Payment Processing Flow                                │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────┐     ┌──────────────┐     ┌─────────────────┐
    │ Client  │────▶│ PaymentRoute │────▶│ AuthMiddleware  │
    │ Request │     │              │     │ (JWT Verify)    │
    └─────────┘     └──────────────┘     └────────┬────────┘
                                                  │
                    ┌──────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────┐     ┌─────────────────────┐
    │   TenantMiddleware    │────▶│  RateLimitMiddleware│
    │   (RLS Context)       │     │  (Redis Counter)    │
    └───────────────────────┘     └──────────┬──────────┘
                                             │
                    ┌────────────────────────┘
                    │
                    ▼
    ┌───────────────────────┐     ┌─────────────────────┐
    │ IdempotencyMiddleware │────▶│  ValidationMiddle   │
    │ (Dedup Requests)      │     │  (Zod Schema)       │
    └───────────────────────┘     └──────────┬──────────┘
                                             │
                    ┌────────────────────────┘
                    │
                    ▼
    ┌───────────────────────┐     ┌─────────────────────┐
    │   PaymentController   │────▶│  FeeCalculation     │
    │   (Business Logic)    │     │  Service            │
    └───────────────────────┘     └──────────┬──────────┘
                                             │
                    ┌────────────────────────┘
                    │
                    ▼
    ┌───────────────────────┐     ┌─────────────────────┐
    │ PaymentProcessorSvc   │────▶│   Stripe API        │
    │ (Circuit Breaker)     │     │   (Payment Intent)  │
    └───────────────────────┘     └──────────┬──────────┘
                                             │
                    ┌────────────────────────┘
                    │
                    ▼
    ┌───────────────────────┐     ┌─────────────────────┐
    │   DatabaseService     │────▶│   Outbox Pattern    │
    │   (Transaction)       │     │   (Event Publish)   │
    └───────────────────────┘     └─────────────────────┘
```

## Level 4: Code Diagram (Fee Calculation)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FeeCalculationService                                     │
└─────────────────────────────────────────────────────────────────────────────┘

class FeeCalculationService {
  ┌────────────────────────────────────────────────────────────────────────┐
  │ Constants                                                               │
  │ ├── PLATFORM_FEE_PERCENT: 2.5%                                         │
  │ ├── PLATFORM_FEE_FIXED: $0.30                                          │
  │ ├── STRIPE_FEE_PERCENT: 2.9%                                           │
  │ └── STRIPE_FEE_FIXED: $0.30                                            │
  └────────────────────────────────────────────────────────────────────────┘
  
  ┌────────────────────────────────────────────────────────────────────────┐
  │ Methods                                                                 │
  │                                                                         │
  │ calculateFees(amount, currency)                                        │
  │   ├── Input: amount (cents), currency (ISO 4217)                       │
  │   ├── Output: { platformFee, stripeFee, netAmount, totalFee }          │
  │   └── Process:                                                         │
  │       1. Validate amount > 0                                           │
  │       2. Get currency-specific rates                                   │
  │       3. Calculate platform fee: amount * 0.025 + 30                   │
  │       4. Calculate Stripe fee: amount * 0.029 + 30                     │
  │       5. Calculate net: amount - platformFee                           │
  │       6. Round all values to avoid floating point errors               │
  │                                                                         │
  │ calculateRefundFees(originalAmount, refundAmount)                      │
  │   ├── Input: original amount, refund amount                            │
  │   ├── Output: { adjustedRefund, feeRefund, royaltyRefund }             │
  │   └── Process:                                                         │
  │       1. Calculate proportional fee adjustment                         │
  │       2. Handle partial vs full refund                                 │
  │       3. Calculate royalty reversal if applicable                      │
  │                                                                         │
  │ calculateSplitPayment(amount, recipients[])                            │
  │   ├── Input: amount, array of { accountId, percentage }                │
  │   ├── Output: { transfers[], platformAmount }                          │
  │   └── Process:                                                         │
  │       1. Validate percentages sum to 100%                              │
  │       2. Calculate each recipient's share                              │
  │       3. Handle rounding (remainder goes to first recipient)           │
  │       4. Deduct platform fee from each share                           │
  └────────────────────────────────────────────────────────────────────────┘
}
```

## Data Flow Diagrams

### Payment Creation Flow

```
┌─────────┐  1. Create Payment  ┌─────────────────┐
│  User   │──────────────────▶  │  Payment API    │
└─────────┘                     └────────┬────────┘
                                         │
            2. Validate & Auth           │
            ◀────────────────────────────┘
                                         │
            3. Check Rate Limit          ▼
┌─────────────────┐             ┌─────────────────┐
│     Redis       │◀────────────│  Rate Limiter   │
│  (Rate Limits)  │             └────────┬────────┘
└─────────────────┘                      │
                                         │
            4. Calculate Fees            ▼
                                ┌─────────────────┐
                                │ Fee Calculator  │
                                └────────┬────────┘
                                         │
            5. Create PaymentIntent      ▼
┌─────────────────┐             ┌─────────────────┐
│    Stripe       │◀────────────│ Payment Svc     │
│  (Idempotent)   │             └────────┬────────┘
└─────────────────┘                      │
                                         │
            6. Store Transaction         ▼
┌─────────────────┐             ┌─────────────────┐
│   PostgreSQL    │◀────────────│ Database Svc    │
│  (Transaction)  │             └────────┬────────┘
└─────────────────┘                      │
                                         │
            7. Publish Event             ▼
┌─────────────────┐             ┌─────────────────┐
│   Outbox Table  │◀────────────│  Event Store    │
│  (Transactional)│             └─────────────────┘
└─────────────────┘
```

### Webhook Processing Flow

```
┌─────────────────┐  1. Webhook Event  ┌─────────────────┐
│     Stripe      │───────────────────▶│  Webhook Route  │
└─────────────────┘                    └────────┬────────┘
                                                │
            2. Verify Signature                 │
            (Timing-Safe Compare)               ▼
                                       ┌─────────────────┐
                                       │ Signature Check │
                                       └────────┬────────┘
                                                │
            3. Check Dedup                      ▼
┌─────────────────┐                    ┌─────────────────┐
│    Redis        │◀───────────────────│  Dedup Check    │
│  (Event IDs)    │                    └────────┬────────┘
└─────────────────┘                             │
                                                │
            4. Queue for Processing             ▼
┌─────────────────┐                    ┌─────────────────┐
│  Redis Queue    │◀───────────────────│  Job Enqueue    │
│  (BullMQ)       │                    └────────┬────────┘
└─────────────────┘                             │
                                                │
            5. Return 200 Immediately           ▼
                                       ┌─────────────────┐
                                       │  Response 200   │
                                       └─────────────────┘

            [Async Processing]
┌─────────────────┐                    ┌─────────────────┐
│  Redis Queue    │───────────────────▶│  Job Worker     │
│  (BullMQ)       │                    └────────┬────────┘
└─────────────────┘                             │
                                                │
            6. Process Event                    ▼
┌─────────────────┐                    ┌─────────────────┐
│   PostgreSQL    │◀───────────────────│ Webhook Handler │
│  (Update State) │                    └────────┬────────┘
└─────────────────┘                             │
                                                │
            7. Notify Services                  ▼
┌─────────────────┐                    ┌─────────────────┐
│ Other Services  │◀───────────────────│  Event Publish  │
│ (Order, Ticket) │                    └─────────────────┘
└─────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Security Layers                                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 1: Network Security                                                    │
│  • TLS 1.3 encryption                                                       │
│  • WAF (Web Application Firewall)                                           │
│  • DDoS protection                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 2: Authentication                                                      │
│  • JWT validation (RS256)                                                   │
│  • API key for service-to-service                                           │
│  • HMAC signatures for webhooks                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 3: Authorization                                                       │
│  • Role-based access control (RBAC)                                         │
│  • Tenant isolation (RLS)                                                   │
│  • Resource ownership validation                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 4: Input Validation                                                    │
│  • Zod schema validation                                                    │
│  • Parameterized queries (SQL injection prevention)                         │
│  • Content-Type validation                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 5: Data Security                                                       │
│  • PCI-DSS compliance (no card data stored)                                 │
│  • Encryption at rest (AES-256)                                             │
│  • Audit logging                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---
*Generated: 2026-01-01 | Version: 1.0.0*
