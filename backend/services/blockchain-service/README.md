# Blockchain Service

Production-ready Solana blockchain integration service for the TicketToken platform.

## Overview

The Blockchain Service provides a robust, production-hardened interface for interacting with the Solana blockchain. It handles NFT minting operations, transaction management, wallet operations, and real-time blockchain event monitoring.

## Features

### Core Capabilities
- ✅ **NFT Minting**: Create and manage ticket NFTs on Solana
- ✅ **Wallet Management**: Treasury wallet with automatic balance monitoring
- ✅ **Transaction Tracking**: Real-time transaction confirmation and status updates
- ✅ **Blockchain Queries**: NFT ownership, balances, and transaction history
- ✅ **Event Listeners**: Monitor on-chain events from smart contracts

### Production Hardening
- ✅ **Comprehensive Metrics**: Prometheus-compatible metrics for all operations
- ✅ **Retry Logic**: Exponential backoff for transient failures
- ✅ **Circuit Breakers**: Prevent cascading failures
- ✅ **RPC Failover**: Automatic failover between multiple RPC endpoints
- ✅ **Input Validation**: Comprehensive validation of all inputs
- ✅ **Internal Auth**: HMAC-based service-to-service authentication
- ✅ **Health Checks**: Detailed health monitoring for all components

### Security Features
- 🔒 HMAC-SHA256 signature-based internal authentication
- 🔒 Request replay attack prevention
- 🔒 Input sanitization and validation
- 🔒 Rate limiting on all endpoints
- 🔒 Secure private key management
- 🔒 CORS and Helmet security headers

## Architecture

```
blockchain-service/
├── src/
│   ├── config/              # Configuration management
│   ├── listeners/           # Blockchain event listeners
│   ├── middleware/          # Auth & validation middleware
│   ├── queues/              # Job queue management
│   ├── routes/              # API route handlers
│   ├── services/            # Business logic services
│   ├── utils/               # Utilities (metrics, retry, circuit breaker)
│   ├── wallets/             # Treasury wallet management
│   ├── workers/             # Background job workers
│   ├── app.ts               # Fastify application setup
│   └── index.ts             # Entry point
├── tests/
│   ├── unit/                # Unit tests
│   └── integration/         # Integration tests
└── docs/                    # Additional documentation
```

## Quick Start

### Prerequisites

- Node.js 20.x
- PostgreSQL 14+
- Redis 7+
- Solana DevNet/MainNet access
- Treasury wallet with SOL balance

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run migrate

# Start in development mode
npm run dev

# Start in production mode
npm run build
npm start
```

### Environment Configuration

Key environment variables (see `.env.example` for complete list):

```bash
# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
SOLANA_WALLET_PRIVATE_KEY=<your-private-key>
SOLANA_PROGRAM_ID=<deployed-program-id>

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/tickettoken

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Security
INTERNAL_SERVICE_SECRET=<256-bit-secret>
JWT_SECRET=<256-bit-secret>

# Service Configuration
PORT=3015
NODE_ENV=production
LOG_LEVEL=info
```

## API Documentation

### Health & Monitoring

#### `GET /health`
Basic health check

**Response:**
```json
{
  "status": "ok",
  "service": "blockchain-service",
  "timestamp": "2025-11-13T14:30:00.000Z"
}
```

#### `GET /health/detailed`
Comprehensive health check with all subsystems

**Response:**
```json
{
  "service": "blockchain-service",
  "status": "healthy",
  "checks": {
    "database": { "status": "healthy", "message": "Database connection active" },
    "solana": { "status": "healthy", "message": "Solana RPC connection active", "currentSlot": 123456 },
    "treasury": { "status": "healthy", "balance": 10.5, "balanceSOL": "10.5000 SOL" },
    "listeners": { "status": "healthy" },
    "queues": { "status": "healthy" },
    "rpcFailover": { "status": "healthy", "endpoints": [...] }
  }
}
```

#### `GET /metrics`
Prometheus metrics endpoint

Returns metrics in Prometheus format for:
- RPC request latency and count
- Transaction submission/confirmation rates
- Mint operation success/failure rates
- Treasury balance
- Circuit breaker states
- Queue job statistics
- HTTP request metrics

#### `GET /metrics/circuit-breakers`
Get circuit breaker statistics

**Response:**
```json
{
  "timestamp": "2025-11-13T14:30:00.000Z",
  "circuitBreakers": {
    "rpcCall": {
      "state": "CLOSED",
      "failureCount": 0,
      "successCount": 0,
      "lastFailureTime": null
    }
  }
}
```

### Blockchain Operations

#### `GET /blockchain/balance/:address`
Get SOL balance for an address

**Parameters:**
- `address` - Solana public key

**Response:**
```json
{
  "address": "ABC123...",
  "balance": 1000000000,
  "sol": 1.0
}
```

#### `GET /blockchain/nfts/:address`
Get NFTs owned by an address

**Parameters:**
- `address` - Solana public key

**Response:**
```json
{
  "address": "ABC123...",
  "count": 5,
  "nfts": [...]
}
```

#### `GET /blockchain/transaction/:signature`
Get transaction details

**Parameters:**
- `signature` - Transaction signature

**Response:**
```json
{
  "signature": "5abc...",
  "transaction": {...}
}
```

#### `POST /blockchain/confirm-transaction`
Confirm a transaction

**Request Body:**
```json
{
  "signature": "5abc...",
  "commitment": "confirmed",
  "timeout": 60000
}
```

**Response:**
```json
{
  "signature": "5abc...",
  "confirmed": true,
  "slot": 123456
}
```

### Internal Operations (Authenticated)

#### `POST /internal/mint-tickets`
Mint ticket NFTs (internal service only)

**Headers:**
- `x-internal-service`: Service name
- `x-timestamp`: Request timestamp
- `x-internal-signature`: HMAC-SHA256 signature

**Request Body:**
```json
{
  "ticketIds": ["ticket1", "ticket2"],
  "eventId": "event123",
  "userId": "user456",
  "queue": "ticket.mint"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "job789"
}
```

## Testing

### Run All Tests
```bash
npm test
```

### Run Unit Tests
```bash
npm run test:unit
```

### Run Integration Tests
```bash
npm run test:integration
```

### Test Coverage
```bash
npm run test:coverage
```

### Manual Testing with Devnet

1. Request devnet SOL from faucet:
```bash
solana airdrop 2 <your-wallet-address> --url devnet
```

2. Run devnet validation tests:
```bash
npm run test:integration -- devnet-validation
```

## Operational Guide

### Monitoring

Monitor these key metrics in Prometheus/Grafana:

- `blockchain_rpc_request_duration_seconds` - RPC latency
- `blockchain_transactions_confirmed_total` - Transaction success rate
- `blockchain_mints_completed_total` - Mint success rate
- `blockchain_treasury_balance_sol` - Treasury balance
- `blockchain_circuit_breaker_state` - Circuit breaker health
- `blockchain_queue_size` - Job queue backlog

### Treasury Balance Alerts

Set up alerts for:
- Treasury balance < 0.5 SOL (warning)
- Treasury balance < 0.1 SOL (critical)

### Circuit Breaker Management

Reset circuit breakers via API:
```bash
curl -X POST http://localhost:3015/metrics/circuit-breakers/rpcCall/reset
```

### Troubleshooting

#### High RPC Latency
- Check RPC endpoint health
- Enable RPC failover with multiple endpoints
- Review circuit breaker stats

#### Failed Transactions
- Check treasury wallet balance
- Review transaction logs
- Check Solana network status

#### Low Treasury Balance
- Fund treasury wallet immediately
- Check alerts configuration
- Review spending patterns

## Development

### Code Structure

```typescript
// Example: Using retry logic
import { withRetry, RETRY_CONFIGS } from './utils/retry';

const result = await withRetry(
  () => connection.getBalance(address),
  'getBalance',
  RETRY_CONFIGS.rpcCall
);

// Example: Using circuit breaker
import { circuitBreakerManager, CIRCUIT_BREAKER_CONFIGS } from './utils/circuitBreaker';

const result = await circuitBreakerManager.execute(
  'rpcCall',
  () => connection.getSlot(),
  CIRCUIT_BREAKER_CONFIGS.rpcCall
);

// Example: Recording metrics
import { trackMintOperation } from './utils/metrics';

trackMintOperation('initiated');
try {
  await mintNFT();
  trackMintOperation('completed', duration);
} catch (error) {
  trackMintOperation('failed', undefined, error.message);
}
```

### Adding New Endpoints

1. Create route handler in `src/routes/`
2. Add input validation middleware
3. Implement business logic in `src/services/`
4. Add metrics tracking
5. Write unit and integration tests
6. Update this README

## Production Deployment

### Pre-deployment Checklist

- [ ] All environment variables configured
- [ ] Treasury wallet funded
- [ ] Database migrations applied
- [ ] SSL/TLS certificates installed
- [ ] Monitoring alerts configured
- [ ] Rate limiting tuned
- [ ] Circuit breaker thresholds set
- [ ] Backup RPC endpoints configured

### Performance Tuning

- **Rate Limiting**: Adjust based on expected load
- **Circuit Breakers**: Tune thresholds for your SLA
- **Retry Logic**: Configure attempts based on network conditions
- **Connection Pooling**: Tune database pool size
- **Queue Concurrency**: Adjust worker count based on capacity

## Security Considerations

### Private Key Management
- Never commit private keys to version control
- Use environment variables or secure key management systems
- Rotate keys periodically
- Monitor wallet balance and transactions

### Internal Service Auth
- Use strong secrets (minimum 32 characters)
- Rotate secrets regularly
- Monitor for failed authentication attempts
- Implement IP whitelisting if possible

### Rate Limiting
- Default: 100 requests per minute
- Adjust based on service needs
- Monitor for abuse patterns

## Support & Maintenance

### Logs
Structured JSON logs with levels:
- `error`: Critical errors requiring immediate attention
- `warn`: Warning conditions
- `info`: Informational messages
- `debug`: Detailed debug information

### Common Issues

**Issue**: Service won't start
- Check all required environment variables
- Verify database connectivity
- Check Solana RPC endpoint availability

**Issue**: Transactions failing
- Check treasury balance
- Verify RPC endpoint health
- Review transaction logs for specific errors

**Issue**: High memory usage
- Check for connection leaks
- Review queue job accumulation
- Monitor listener subscription count

## Contributing

1. Follow TypeScript best practices
2. Write tests for new features
3. Update documentation
4. Follow existing code patterns
5. Add metrics for new operations

## License

Proprietary - TicketToken Platform

## Contact

For support or questions, contact the backend team.
