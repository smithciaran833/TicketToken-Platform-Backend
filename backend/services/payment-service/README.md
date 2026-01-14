# Payment Service

Payment processing service for the TicketToken platform. Handles all payment-related operations including Stripe integration, refunds, and revenue distribution.

## Features

- **Payment Processing**: Create and manage payment intents via Stripe
- **Stripe Connect**: Distribute payments to venues and artists
- **Refund Management**: Full and partial refund processing with transfer reversals
- **Webhook Processing**: Secure Stripe webhook handling with retry queue
- **Multi-tenancy**: Row-level security (RLS) for tenant isolation
- **Fraud Detection**: Basic fraud checks and AML screening
- **Escrow**: Hold payments for marketplace transactions

## Quick Start

### Prerequisites

- Node.js >= 18
- PostgreSQL 14+
- Redis 7+
- Stripe account with Connect enabled

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/payment_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=<32+ character secret>
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Optional
NODE_ENV=production
PORT=3003
LOG_LEVEL=info
TRUSTED_PROXY_IPS=10.0.0.0/8,172.16.0.0/12
```

### Installation

```bash
npm install
npm run build
npm run migrate
npm start
```

### Development

```bash
npm run dev    # Start with hot reload
npm run test   # Run tests
npm run lint   # Run linter
```

## API Endpoints

### Payment Operations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/payments/intents` | Create payment intent |
| GET | `/api/v1/payments/:id` | Get payment details |
| POST | `/api/v1/payments/:id/capture` | Capture payment |
| POST | `/api/v1/payments/:id/cancel` | Cancel payment |

### Refunds

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/refunds` | Create refund |
| GET | `/api/v1/refunds/:id` | Get refund status |

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/stripe` | Stripe webhook endpoint |

### Health Checks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/ready` | Readiness probe (K8s) |
| GET | `/health/startup` | Startup probe (K8s) |
| GET | `/health/integrations` | External service status |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Payment Service                       │
├─────────────────────────────────────────────────────────┤
│  Routes                                                  │
│  ├── payment.routes.ts                                  │
│  ├── refund.routes.ts                                   │
│  ├── webhook.routes.ts                                  │
│  └── health.routes.ts                                   │
├─────────────────────────────────────────────────────────┤
│  Controllers                                             │
│  ├── payment.controller.ts                              │
│  ├── refund.controller.ts                               │
│  └── webhook.controller.ts                              │
├─────────────────────────────────────────────────────────┤
│  Services                                                │
│  ├── stripe-connect-transfer.service.ts                 │
│  ├── payment.service.ts                                 │
│  └── refund.service.ts                                  │
├─────────────────────────────────────────────────────────┤
│  Middleware                                              │
│  ├── auth.middleware.ts                                 │
│  ├── tenant.middleware.ts                               │
│  └── rate-limit.middleware.ts                           │
└─────────────────────────────────────────────────────────┘
```

## Database Schema

### Core Tables

- `payment_transactions` - Payment records
- `payment_intents` - Stripe payment intent tracking
- `payment_refunds` - Refund records
- `stripe_transfers` - Connect transfer records
- `pending_transfers` - Failed transfer retry queue
- `connected_accounts` - Stripe Connect accounts
- `webhook_inbox` - Incoming webhook queue

### Multi-tenancy

All tables use Row Level Security (RLS) with tenant isolation:

```sql
-- Example policy
CREATE POLICY tenant_isolation ON payment_transactions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

## Stripe Connect Flow

```
1. Customer Payment → Platform Stripe Account
2. Webhook: payment_intent.succeeded
3. Calculate royalty splits
4. Create transfers to connected accounts
5. Track in stripe_transfers table
```

### Creating a Transfer

```typescript
import { stripeConnectTransferService } from './services/stripe-connect-transfer.service';

await stripeConnectTransferService.distributePayment({
  orderId: 'order-123',
  paymentIntentId: 'pi_xxx',
  chargeId: 'ch_xxx',
  tenantId: 'tenant-456',
  totalAmount: 10000, // $100.00
  transfers: [
    {
      stripeAccountId: 'acct_venue',
      amount: 8500, // $85.00
      recipientType: 'venue',
      recipientId: 'venue-789',
    },
    {
      stripeAccountId: 'acct_artist',
      amount: 1000, // $10.00
      recipientType: 'artist',
      recipientId: 'artist-012',
    },
  ],
});
```

## Security

### Authentication

- JWT tokens required on all endpoints
- Service-to-service: HMAC-signed requests
- Webhook: Stripe signature verification

### Rate Limiting

- Default: 100 requests/minute per IP
- Payment creation: 10 requests/minute per user
- Webhook: No limit (signed requests)

### Tenant Isolation

- RLS enforced at database level
- Tenant ID from JWT only (never body/headers)
- Cross-tenant access blocked

## Migrations

```bash
# Run all migrations
npm run migrate

# Rollback last migration
npm run migrate:rollback

# Create new migration
npm run migrate:make -- <name>
```

### Migration Order

1. `001_baseline_payment.ts` - Base tables
2. `002_add_rls_policies.ts` - Row Level Security
3. `003_add_concurrent_indexes.ts` - Performance indexes
4. `004_add_stripe_connect_tables.ts` - Connect support

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:coverage
```

## Deployment

### Docker

```bash
docker build -t payment-service .
docker run -p 3003:3003 --env-file .env payment-service
```

### Kubernetes

See `k8s/` directory for manifests.

Health check configuration:
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3003
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3003
  initialDelaySeconds: 5
  periodSeconds: 5

startupProbe:
  httpGet:
    path: /health/startup
    port: 3003
  failureThreshold: 30
  periodSeconds: 10
```

## Monitoring

### Metrics

- `payment_intent_created_total` - Payment intents created
- `payment_captured_total` - Successful captures
- `payment_failed_total` - Failed payments
- `refund_processed_total` - Refunds processed
- `transfer_created_total` - Transfers created
- `webhook_processed_total` - Webhooks processed

### Logging

Structured JSON logging with correlation IDs:

```json
{
  "level": "info",
  "time": "2025-12-31T22:00:00Z",
  "traceId": "abc123",
  "component": "PaymentController",
  "message": "Payment captured",
  "paymentId": "pay_xxx",
  "amount": 10000
}
```

## Troubleshooting

### Common Issues

1. **Stripe webhook 400 errors**
   - Verify webhook secret matches
   - Check raw body parsing is enabled

2. **Transfer failures**
   - Verify connected account is fully onboarded
   - Check `charges_enabled` and `payouts_enabled`

3. **RLS permission denied**
   - Ensure `app.current_tenant_id` is set
   - Check tenant ID in JWT matches data

### Runbooks

See `docs/runbooks/` for operational procedures.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

Proprietary - TicketToken Inc.
