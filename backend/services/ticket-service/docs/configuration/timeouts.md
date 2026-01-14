# Timeout Configuration

## Database Timeouts

| Setting | Default | Env Variable | Description |
|---------|---------|--------------|-------------|
| Statement Timeout | 30000ms | `DB_STATEMENT_TIMEOUT` | Max time for a single query |
| Lock Timeout | 10000ms | `DB_LOCK_TIMEOUT` | Max time to wait for row locks |
| Connection Timeout | 5000ms | `DB_CONNECTION_TIMEOUT` | Max time to establish connection |
| Idle Timeout | 10000ms | `DB_IDLE_TIMEOUT` | Time before idle connections are closed |

## HTTP Timeouts

| Setting | Default | Env Variable | Description |
|---------|---------|--------------|-------------|
| Request Timeout | 30000ms | `HTTP_REQUEST_TIMEOUT` | Max time for incoming requests |
| Keep-Alive Timeout | 5000ms | `HTTP_KEEP_ALIVE_TIMEOUT` | Keep-alive connection timeout |

## External Service Timeouts

| Setting | Default | Env Variable | Description |
|---------|---------|--------------|-------------|
| Service Call Timeout | 10000ms | `SERVICE_TIMEOUT` | Timeout for inter-service calls |
| Blockchain RPC Timeout | 30000ms | `SOLANA_RPC_TIMEOUT` | Timeout for Solana RPC calls |
| Redis Timeout | 5000ms | `REDIS_TIMEOUT` | Timeout for Redis operations |

## Health Check Timeouts

| Setting | Default | Description |
|---------|---------|-------------|
| Health Check Query | 5000ms | Max time for DB health check query |
| Readiness Probe | 5000ms | K8s readiness probe timeout |
| Liveness Probe | 5000ms | K8s liveness probe timeout |

## Configuration Example
```bash
# .env
DB_STATEMENT_TIMEOUT=30000
DB_LOCK_TIMEOUT=10000
HTTP_REQUEST_TIMEOUT=30000
SERVICE_TIMEOUT=10000
SOLANA_RPC_TIMEOUT=30000
```
