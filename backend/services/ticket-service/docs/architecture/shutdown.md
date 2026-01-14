# Graceful Shutdown

## Overview

The service implements graceful shutdown to ensure in-flight requests complete and resources are properly released.

## Shutdown Sequence

1. **Receive signal** - SIGTERM or SIGINT
2. **Stop accepting requests** - Health checks return unhealthy
3. **Wait for in-flight requests** - Configurable timeout (30s default)
4. **Close connections** - Database, Redis, RabbitMQ
5. **Flush telemetry** - Traces and metrics
6. **Exit process** - Exit code 0

## Signals Handled

| Signal | Action |
|--------|--------|
| `SIGTERM` | Graceful shutdown |
| `SIGINT` | Graceful shutdown (Ctrl+C) |
| `SIGQUIT` | Graceful shutdown with core dump |

## Shutdown Hooks
```typescript
// Order of shutdown hooks
1. shutdownTracing()      // Flush OpenTelemetry spans
2. closeRabbitMQ()        // Close queue connections
3. closeRedis()           // Close Redis connections
4. closeDatabase()        // Close DB pool
5. closeServer()          // Stop HTTP server
```

## Configuration

| Setting | Default | Env Variable |
|---------|---------|--------------|
| Shutdown Timeout | 30000ms | `SHUTDOWN_TIMEOUT` |
| Drain Timeout | 10000ms | `DRAIN_TIMEOUT` |

## Kubernetes Integration
```yaml
# Pod spec
spec:
  terminationGracePeriodSeconds: 60
  containers:
    - name: ticket-service
      lifecycle:
        preStop:
          exec:
            command: ["/bin/sh", "-c", "sleep 5"]
```

## Health Check During Shutdown

During shutdown, health endpoints return:
```json
{
  "status": "shutting_down",
  "accepting_requests": false
}
```

## Connection Draining

Active connections are drained before closing:
- HTTP keep-alive connections finish current request
- Database transactions complete or rollback
- Queue messages are acknowledged or requeued
