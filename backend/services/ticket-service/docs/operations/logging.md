# Logging Operations

## Log Rotation

| Setting | Value | Description |
|---------|-------|-------------|
| Max file size | 100 MB | Rotate when file reaches size |
| Max files | 10 | Keep last 10 rotated files |
| Compress | gzip | Compress rotated files |
| Max age | 30 days | Delete files older than |

## Log Retention

| Environment | Retention | Storage |
|-------------|-----------|---------|
| Development | 7 days | Local disk |
| Staging | 14 days | CloudWatch |
| Production | 90 days | CloudWatch + S3 |

## Log Levels

| Level | When to Use |
|-------|-------------|
| `error` | Unrecoverable errors, exceptions |
| `warn` | Recoverable issues, deprecations |
| `info` | Business events, state changes |
| `debug` | Detailed debugging (dev only) |

## Configuration
```bash
# .env
LOG_LEVEL=info              # Minimum level to log
LOG_FORMAT=json             # json or pretty
LOG_TIMESTAMP=true          # Include timestamps
LOG_COLORIZE=false          # Color output (dev only)
```

## Log Aggregation

Logs are shipped to centralized logging via:

1. **Container stdout** → Docker logging driver
2. **CloudWatch agent** → CloudWatch Logs
3. **Fluent Bit** → Elasticsearch (optional)

## Searching Logs

Logs include these searchable fields:

| Field | Description |
|-------|-------------|
| `traceId` | Distributed trace ID |
| `spanId` | Current span ID |
| `tenantId` | Tenant identifier |
| `userId` | User identifier |
| `requestId` | HTTP request ID |
| `service` | Service name |

Example CloudWatch query:
```
fields @timestamp, @message
| filter tenantId = "tenant-123"
| filter level = "error"
| sort @timestamp desc
| limit 100
```
