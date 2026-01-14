# Database Connection Pool Configuration

## Pool Settings

| Setting | Default | Env Variable | Description |
|---------|---------|--------------|-------------|
| Min Connections | 0 | `DB_POOL_MIN` | Minimum idle connections |
| Max Connections | 20 | `DB_POOL_MAX` | Maximum total connections |
| Idle Timeout | 10000ms | `DB_IDLE_TIMEOUT` | Close idle connections after |
| Acquire Timeout | 30000ms | `DB_ACQUIRE_TIMEOUT` | Max wait for available connection |

## Why Min = 0?

Setting `DB_POOL_MIN=0` allows the pool to scale down completely during low traffic, which:
- Reduces resource usage during idle periods
- Enables graceful degradation under load
- Supports serverless-style scaling

## Sizing Guidelines

| Workload | Min | Max | Notes |
|----------|-----|-----|-------|
| Development | 0 | 5 | Low resource usage |
| Staging | 0 | 10 | Match production patterns |
| Production | 0 | 20 | Based on: CPU cores * 2 + disk spindles |
| High Traffic | 0 | 50 | Requires RDS/connection pooler |

## Connection Formula
```
max_connections = (cpu_cores * 2) + effective_spindle_count
```

For cloud databases, start with 20 and adjust based on:
- Connection wait time metrics
- Active connection count
- Query latency percentiles

## Monitoring

Key metrics to watch:
- `database_connection_pool{state="active"}` - In-use connections
- `database_connection_pool{state="idle"}` - Available connections
- `database_connection_pool{state="waiting"}` - Requests waiting for connection

## Configuration Example
```bash
# .env
DB_POOL_MIN=0
DB_POOL_MAX=20
DB_IDLE_TIMEOUT=10000
DB_ACQUIRE_TIMEOUT=30000
```
