# Environment Variables

## Required in Production

These variables MUST be set in production or the service will fail to start.

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `JWT_SECRET` | JWT signing secret (64+ chars) | `<random-64-chars>` |
| `INTERNAL_SERVICE_SECRET` | S2S auth secret (64+ chars) | `<random-64-chars>` |
| `QR_ENCRYPTION_KEY` | QR code encryption (32 chars) | `<random-32-chars>` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://:pass@host:6379` |
| `RABBITMQ_URL` | RabbitMQ connection string | `amqps://user:pass@host:5671` |

## Per-Service Secrets

Each calling service needs its own secret:

| Variable | Service |
|----------|---------|
| `AUTH_SERVICE_SECRET` | auth-service |
| `EVENT_SERVICE_SECRET` | event-service |
| `PAYMENT_SERVICE_SECRET` | payment-service |
| `NOTIFICATION_SERVICE_SECRET` | notification-service |
| `VENUE_SERVICE_SECRET` | venue-service |
| `BLOCKCHAIN_SERVICE_SECRET` | blockchain-service |
| `ORDER_SERVICE_SECRET` | order-service |
| `SCANNING_SERVICE_SECRET` | scanning-service |
| `TRANSFER_SERVICE_SECRET` | transfer-service |
| `MARKETPLACE_SERVICE_SECRET` | marketplace-service |

## Database Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_POOL_MIN` | `0` | Minimum pool connections |
| `DB_POOL_MAX` | `20` | Maximum pool connections |
| `DB_STATEMENT_TIMEOUT` | `30000` | Query timeout (ms) |
| `DB_LOCK_TIMEOUT` | `10000` | Lock wait timeout (ms) |
| `DB_SSL_ENABLED` | `true` (prod) | Enable SSL/TLS |
| `DB_SSL_CA` | - | Custom CA certificate path |

## Redis Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | - | Connection string |
| `REDIS_TIMEOUT` | `5000` | Operation timeout (ms) |
| `REDIS_MAX_RETRIES` | `3` | Max retry attempts |

## RabbitMQ Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `RABBITMQ_URL` | - | Connection string (use `amqps://`) |
| `RABBITMQ_USERNAME` | - | Username (not admin) |
| `RABBITMQ_PASSWORD` | - | Password |
| `RABBITMQ_VHOST` | `/ticket-service` | Virtual host |

## Blockchain Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLANA_RPC_ENDPOINTS` | - | Comma-separated RPC URLs |
| `SOLANA_RPC_TIMEOUT` | `30000` | RPC timeout (ms) |
| `SOLANA_NETWORK` | `mainnet-beta` | Network name |

## Observability

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_TRACING` | `true` | Enable OpenTelemetry |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | - | OTLP collector URL |
| `ENABLE_METRICS` | `true` | Enable Prometheus metrics |
| `LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |
| `SERVICE_VERSION` | - | Version for traces |

## Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_MAX` | `100` | Default requests per window |
| `RATE_LIMIT_WINDOW` | `60000` | Window size (ms) |
| `TRUSTED_PROXIES` | `loopback` | Trusted proxy IPs |

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `HTTP_REQUEST_TIMEOUT` | `30000` | Request timeout (ms) |
