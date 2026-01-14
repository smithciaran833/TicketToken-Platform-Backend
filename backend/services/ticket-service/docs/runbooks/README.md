# Ticket Service Runbooks

## Overview

This directory contains operational runbooks for the Ticket Service. Each runbook provides step-by-step procedures for common operational tasks.

## Runbook Index

| Runbook | Description | When to Use |
|---------|-------------|-------------|
| [restart.md](./restart.md) | Service restart procedures | When service needs restart |
| [scaling.md](./scaling.md) | Horizontal scaling procedures | During load spikes |
| [rollback.md](./rollback.md) | Application rollback procedures | After failed deployment |
| [key-rotation.md](./key-rotation.md) | Secret/key rotation procedures | Scheduled rotation or compromise |
| [migration-rollback.md](./migration-rollback.md) | Database migration rollback | After failed migration |
| [blockchain-incidents.md](./blockchain-incidents.md) | Blockchain incident response | RPC failures, sync issues |

## Severity Levels

| Level | Response Time | Examples |
|-------|--------------|----------|
| P1 - Critical | 15 minutes | Service down, data loss |
| P2 - High | 1 hour | Degraded performance, partial outage |
| P3 - Medium | 4 hours | Non-critical feature issues |
| P4 - Low | 24 hours | Minor issues, cosmetic |

## On-Call Escalation

1. **Primary On-Call**: Check PagerDuty schedule
2. **Secondary On-Call**: Backup engineer
3. **Engineering Manager**: For P1 incidents
4. **VP Engineering**: For extended P1 incidents (>2 hours)

## Common Procedures

### Check Service Health

```bash
# Quick health check
curl -s https://api.tickettoken.io/health | jq

# Detailed health check (requires auth)
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.tickettoken.io/health/detailed | jq
```

### View Logs

```bash
# Recent logs
kubectl logs deployment/ticket-service -n production --tail=100

# Follow logs
kubectl logs -f deployment/ticket-service -n production

# Search for errors
kubectl logs deployment/ticket-service -n production | grep -i error
```

### Check Metrics

```bash
# View in Grafana
open https://grafana.tickettoken.io/d/ticket-service

# Raw Prometheus metrics
curl http://ticket-service:3004/metrics
```

### Database Connection

```bash
# Connect to production database
kubectl run -it --rm psql --image=postgres:14 \
  --restart=Never -- psql $DATABASE_URL

# Check connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'tickettoken';
```

### Redis Status

```bash
# Connect to Redis
kubectl run -it --rm redis-cli --image=redis:7 \
  --restart=Never -- redis-cli -h redis-master

# Check memory
INFO memory

# Check keys
KEYS ticket:*
```

## Contact Information

| Role | Contact |
|------|---------|
| On-Call Engineer | PagerDuty |
| Security Team | security@tickettoken.io |
| Database Team | dba@tickettoken.io |
| Platform Team | #platform-team (Slack) |

## Related Documentation

- [README.md](../../README.md) - Service overview
- [API Documentation](../openapi.yaml) - OpenAPI spec
- [Architecture](../architecture/) - C4 diagrams
- [ADRs](../adr/) - Architecture decisions
