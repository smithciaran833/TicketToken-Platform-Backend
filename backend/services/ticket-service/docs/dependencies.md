# Dependencies

## Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| fastify | ^4.x | HTTP framework |
| @fastify/rate-limit | ^9.x | Rate limiting |
| knex | ^3.x | SQL query builder |
| pg | ^8.x | PostgreSQL driver |
| ioredis | ^5.x | Redis client |
| amqplib | ^0.10.x | RabbitMQ client |
| zod | ^3.x | Schema validation |
| jsonwebtoken | ^9.x | JWT handling |
| @solana/web3.js | ^1.x | Solana blockchain |
| winston | ^3.x | Logging |
| prom-client | ^15.x | Prometheus metrics |

## OpenTelemetry

| Package | Purpose |
|---------|---------|
| @opentelemetry/api | Tracing API |
| @opentelemetry/sdk-node | Node.js SDK |
| @opentelemetry/auto-instrumentations-node | Auto-instrumentation |
| @opentelemetry/exporter-trace-otlp-http | OTLP exporter |

## Dev Dependencies

| Package | Purpose |
|---------|---------|
| typescript | Type checking |
| jest | Testing framework |
| supertest | HTTP testing |
| eslint | Linting |
| prettier | Formatting |

## External Services

| Service | Purpose | Required |
|---------|---------|----------|
| PostgreSQL | Primary database | Yes |
| Redis | Cache, rate limiting | Yes |
| RabbitMQ | Message queue | Yes |
| Solana RPC | Blockchain | Yes |
| OTLP Collector | Tracing | No |

## Updating Dependencies
```bash
# Check for updates
npm outdated

# Update patch versions
npm update

# Update major versions (review changelog first)
npm install package@latest
```

## Security Audits
```bash
# Check for vulnerabilities
npm audit

# Fix automatically where possible
npm audit fix
```
