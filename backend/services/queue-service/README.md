# Queue Service

Asynchronous job processing service for TicketToken platform. Handles payment processing, refunds, and NFT minting operations with 3-tier persistence (Redis, PostgreSQL, MongoDB).

## Features

### 🎯 Core Capabilities
- **Payment Processing** - Stripe payment intents with automatic retry
- **Refund Management** - Full and partial refund processing
- **NFT Minting** - Solana NFT creation via Metaplex
- **NFT Transfers** - Secondary market support
- **Multi-Channel Notifications** - Email and webhooks
- **Production Monitoring** -Prometheus metrics + health checks

### 🔒 Security
- JWT authentication
- Webhook signature verification
- Environment-driven configuration
- No hardcoded secrets
- Input validation

### 📊 Observability
- Kubernetes health probes (liveness, readiness, startup)
- Prometheus metrics (40+ metrics)
- Structured logging
- Queue statistics
- System metrics

## Quick Start

### Prerequisites
- Node.js >= 20.x
- Redis >= 6.x
- Stripe account
- Solana wallet (devnet/mainnet)
- SMTP server (for emails)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run migrations (if needed)
npm run migrate

# Start development server
npm run dev
```

### Environment Variables

```bash
# Service Configuration
NODE_ENV=development
PORT=3011
JWT_SECRET=your-jwt-secret-key

# Redis (Queue Backend)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Stripe Payment Processing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_API_VERSION=2023-10-16
STRIPE_WEBHOOK_SECRET=whsec_...

# Solana NFT Minting
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=base58-encoded-private-key

# Email Notifications
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@example.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@tickettoken.com
ADMIN_EMAIL=admin@tickettoken.com

# Webhook Notifications (Optional)
PAYMENT_WEBHOOK_URL=https://your-api.com/webhooks/payment
REFUND_WEBHOOK_URL=https://your-api.com/webhooks/refund
NFT_WEBHOOK_URL=https://your-api.com/webhooks/nft
ADMIN_WEBHOOK_URL=https://your-api.com/webhooks/admin
```

## API Endpoints

### Health Checks

```bash
GET /health/live      # Liveness probe
GET /health/ready     # Readiness probe
GET /health/startup   # Startup probe
```

### Metrics

```bash
GET /metrics                # Prometheus format
GET /metrics/json           # JSON format
GET /metrics/queue-stats    # Queue statistics
GET /metrics/system         # System metrics
```

### Job Queues

The service manages three primary queues:
- `payment` - Payment processing jobs
- `refund` - Refund processing jobs
- `mint` - NFT minting jobs

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific test suites
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
```

### Building

```bash
# Build TypeScript
npm run build

# Clean build artifacts
npm run clean

# Type check without building
npm run typecheck
```

## Monitoring

### Prometheus Metrics

The service exposes comprehensive metrics at `/metrics`:

**Job Metrics:**
- `queue_jobs_processed_total` - Total jobs processed (by queue, status)
- `queue_jobs_failed_total` - Total jobs failed (by queue, reason)
- `queue_job_processing_duration_seconds` - Processing duration histogram
- `queue_active_jobs` - Current active jobs
- `queue_size` - Jobs waiting in queue

**Payment Metrics:**
- `payments_processed_total` - Payments processed (by currency, status)
- `payment_amount_total_cents` - Total payment amount
- `refunds_processed_total` - Refunds processed (by currency, status)
- `refund_amount_total_cents` - Total refund amount

**NFT Metrics:**
- `nfts_minted_total` - NFTs minted (by status)
- `nft_transfers_total` - NFT transfers (by status)
- `solana_wallet_balance_sol` - Wallet balance

**Communication Metrics:**
- `emails_sent_total` - Emails sent (by type)
- `emails_failed_total` - Emails failed (by type)
- `webhooks_sent_total` - Webhooks sent (by event)
- `webhooks_failed_total` - Webhooks failed (by event)

**System Metrics:**
- `service_uptime_seconds` - Service uptime
- `service_memory_usage_bytes` - Memory usage (by type)
- `service_cpu_usage_percent` - CPU usage

### Health Checks

```bash
# Check if service is alive
curl http://localhost:3011/health/live

# Check if service is ready to handle traffic
curl http://localhost:3011/health/ready

# Check if service has finished starting
curl http://localhost:3011/health/startup
```

## Deployment

### Docker

```bash
# Build image
docker build -t queue-service:latest .

# Run container
docker run -p 3011:3011 \
  --env-file .env \
  queue-service:latest
```

### Kubernetes

See `k8s/` directory for Kubernetes manifests including:
- Deployment with health checks
- Service definition
- ConfigMap for configuration
- Secret for sensitive data
- ServiceMonitor for Prometheus

### Docker Compose

```bash
# Start all services
docker-compose up queue-service

# Start in detached mode
docker-compose up -d queue-service

# View logs
docker-compose logs -f queue-service
```

## Architecture

### Job Processing Flow

```
Client Request
    ↓
Add Job to Queue (Redis)
    ↓
Bull Worker picks up job
    ↓
Process Payment/Refund/Mint
    ↓
Send Notifications (Email + Webhook)
    ↓
Record Metrics
    ↓
Update Job Status
    ↓
Complete
```

### Technology Stack

- **Runtime:** Node.js 20.x + TypeScript
- **Framework:** Fastify
- **Queue:** Bull (Redis-backed)
- **Payments:** Stripe SDK
- **Blockchain:** Solana Web3.js + Metaplex
- **Email:** Nodemailer
- **Metrics:** prom-client (Prometheus)
- **Testing:** Jest

## Troubleshooting

### Common Issues

**Queue Jobs Not Processing**
- Check Redis connection
- Verify worker is running
- Check job logs in Bull Board

**Payment Failures**
- Verify Stripe API key
- Check webhook signature
- Review Stripe dashboard

**NFT Minting Failures**
- Check Solana RPC connectivity
- Verify wallet balance (> 0.01 SOL)
- Confirm private key format

**Email Not Sending**
- Verify SMTP credentials
- Check email service logs
- Test connection with test endpoint

### Logs

Structured JSON logs are written to stdout:

```bash
# Follow logs in development
npm run dev

# Follow logs in Docker
docker logs -f queue-service

# Follow logs in Kubernetes
kubectl logs -f deployment/queue-service
```

## Performance

### Recommended Resources

**Development:**
- CPU: 1 core
- Memory: 512MB
- Redis: Shared instance

**Production:**
- CPU: 2+ cores
- Memory: 2GB+
- Redis: Dedicated instance with persistence

### Scaling

The service can be scaled horizontally:
- Multiple workers can process different queues
- Redis handles job distribution
- No shared state between instances
- Metrics aggregated by Prometheus

## Security Considerations

1. **Never commit `.env` file**
2. **Rotate Stripe webhook secrets regularly**
3. **Keep Solana private key secure**
4. **Use strong JWT secrets**
5. **Monitor failed authentication attempts**
6. **Review audit logs regularly**

## Contributing

1. Follow TypeScript best practices
2. Write tests for new features
3. Update documentation
4. Follow commit conventions
5. Ensure CI passes

## License

Proprietary - TicketToken Platform

## Support

For issues or questions:
- GitHub Issues: [repository-url]
- Slack: #queue-service
- Email: dev@tickettoken.com
