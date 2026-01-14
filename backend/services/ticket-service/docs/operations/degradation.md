# Degradation Mode

## Overview

When external dependencies fail, the service can operate in degraded mode to maintain partial functionality.

## Degraded Features

| Feature | Normal | Degraded | Trigger |
|---------|--------|----------|---------|
| Ticket purchase | Full blockchain | DB-only, queue mint | Blockchain circuit open |
| QR validation | On-chain verify | DB-only verify | Blockchain circuit open |
| Caching | Redis | In-memory LRU | Redis connection failed |
| Metrics | Full export | Local buffer | OTLP unavailable |

## Activation

Degraded mode activates automatically when:
- Circuit breaker opens (5 failures in 60s)
- Dependency health check fails
- Connection timeout exceeded

## Manual Override
```bash
# Enable degraded mode
curl -X POST /internal/admin/degraded-mode \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"feature": "blockchain", "enabled": true}'

# Check status
curl /health/detailed
```

## Health Response in Degraded Mode
```json
{
  "status": "degraded",
  "checks": {
    "database": { "status": "healthy" },
    "redis": { "status": "healthy" },
    "blockchain": { "status": "degraded", "reason": "circuit_open" }
  },
  "degradedFeatures": ["blockchain_verify", "nft_minting"]
}
```

## Recovery

Automatic recovery when:
- Circuit breaker enters half-open state
- Health check passes
- Manual override disabled

## Monitoring

Alerts trigger when degraded:
- `service_degraded_mode{feature="blockchain"} == 1`
- Slack notification to #incidents
- PagerDuty for extended degradation (>30 min)
