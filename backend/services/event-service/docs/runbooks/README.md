# Event Service Runbooks

> **Version:** 1.0.0  
> **Last Updated:** 2024-12-31  
> **Service:** event-service

## Table of Contents

1. [Incident Response](#incident-response)
2. [Common Troubleshooting](#common-troubleshooting)
3. [Escalation Contacts](#escalation-contacts)
4. [Health Checks](#health-checks)
5. [Recovery Procedures](#recovery-procedures)

---

## Incident Response

### Incident Severity Levels

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| **P1 - Critical** | Complete service outage | 15 minutes | Event creation blocked, database down |
| **P2 - High** | Significant degradation | 30 minutes | Slow response times, partial failures |
| **P3 - Medium** | Minor impact | 2 hours | Non-critical feature unavailable |
| **P4 - Low** | Minimal impact | 24 hours | Cosmetic issues, warnings |

### Incident Response Steps

#### Step 1: Acknowledge
```bash
# Check service status
curl http://localhost:3003/health/live
curl http://localhost:3003/health/ready

# Check logs
kubectl logs -f deployment/event-service -n tickettoken --tail=100
```

#### Step 2: Assess Impact
- How many users affected?
- Which endpoints are failing?
- Is the database accessible?
- Are dependent services (venue-service) healthy?

#### Step 3: Mitigate
- If database issue: Check connection pool, restart service
- If memory issue: Scale horizontally, investigate memory leaks
- If dependent service down: Enable circuit breaker fallbacks

#### Step 4: Communicate
- Update status page
- Notify stakeholders via Slack #incident-response
- Create incident ticket

#### Step 5: Resolve & Document
- Implement fix
- Verify resolution
- Create post-mortem

---

## Common Troubleshooting

### Database Connection Issues

**Symptoms:**
- 503 Service Unavailable
- "ECONNREFUSED" errors in logs
- Health check failing

**Resolution:**
```bash
# 1. Check database connectivity
psql -h $DB_HOST -U $DB_USER -d event_service -c "SELECT 1;"

# 2. Check connection pool status
curl http://localhost:3003/health/ready | jq '.checks.database'

# 3. If pool exhausted, restart service
kubectl rollout restart deployment/event-service -n tickettoken

# 4. Check for long-running queries
psql -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
         FROM pg_stat_activity 
         WHERE state = 'active' AND query_start < now() - interval '1 minute';"
```

### High Latency

**Symptoms:**
- Response times > 1s
- Timeout errors
- Gateway timeouts (504)

**Resolution:**
```bash
# 1. Check current load
kubectl top pods -n tickettoken -l app=event-service

# 2. Check database query performance
# Look for slow queries in logs

# 3. Scale if needed
kubectl scale deployment/event-service -n tickettoken --replicas=4

# 4. Check Redis cache hit rate
redis-cli INFO stats | grep hit
```

### Event Creation Failures

**Symptoms:**
- 400/422 validation errors
- 500 errors on POST /events
- Events not appearing after creation

**Resolution:**
```bash
# 1. Check validation errors in response
curl -X POST /api/v1/events -d '{}' -H 'Content-Type: application/json' | jq

# 2. Verify venue service is accessible
curl http://venue-service:3002/health/live

# 3. Check tenant context is being passed
# Look for "tenant_id is required" errors

# 4. Verify user permissions
# Check JWT token has correct role/permissions
```

### Tenant Isolation Issues

**Symptoms:**
- Cross-tenant data access
- Missing tenant_id errors
- RLS policy violations

**Resolution:**
```bash
# 1. Verify RLS policies are active
psql -c "SELECT tablename, policyname, permissive, roles 
         FROM pg_policies 
         WHERE schemaname = 'event_service';"

# 2. Check tenant context in request
# Ensure X-Tenant-ID header or JWT tenant_id is present

# 3. Verify app.tenant_id is being set
# Check logs for "Setting tenant context"

# 4. Test RLS manually
psql -c "SET app.tenant_id = 'test-tenant-id'; SELECT * FROM events LIMIT 1;"
```

### Circuit Breaker Open

**Symptoms:**
- "Circuit breaker opened" in logs
- Venue validation failing
- 503 errors for venue-related operations

**Resolution:**
```bash
# 1. Check venue-service health
curl http://venue-service:3002/health/live

# 2. Wait for half-open state (30s default)
# Circuit will auto-recover

# 3. If venue-service is down, investigate that service

# 4. Check circuit breaker stats
curl http://localhost:3003/health/ready | jq '.checks.dependencies'
```

---

## Escalation Contacts

### Primary On-Call

| Role | Contact | Method |
|------|---------|--------|
| **Primary On-Call** | [On-Call Engineer] | PagerDuty |
| **Secondary On-Call** | [Backup Engineer] | PagerDuty |
| **Engineering Manager** | [Manager Name] | Slack/Phone |

### Service Owners

| Area | Owner | Slack |
|------|-------|-------|
| Event Service | [Team Lead] | @event-team |
| Database | [DBA] | @database-team |
| Infrastructure | [SRE] | @platform-team |

### External Dependencies

| Service | Support | SLA |
|---------|---------|-----|
| PostgreSQL (Cloud) | [Cloud Provider Support] | 99.99% |
| Redis (Cloud) | [Cloud Provider Support] | 99.95% |
| Solana RPC | [Helius/Other Support] | Best effort |

---

## Health Checks

### Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `/health/live` | Liveness probe | `{ "status": "UP" }` |
| `/health/ready` | Readiness probe | `{ "status": "UP", "checks": {...} }` |

### Automated Monitoring

```bash
# Kubernetes probes (configured in deployment)
livenessProbe:
  httpGet:
    path: /health/live
    port: 3003
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3003
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Manual Health Check

```bash
# Full health check with dependencies
curl -s http://localhost:3003/health/ready | jq

# Expected output:
# {
#   "status": "UP",
#   "service": "event-service",
#   "version": "1.0.0",
#   "timestamp": "2024-12-31T12:00:00.000Z",
#   "checks": {
#     "database": "UP",
#     "redis": "UP",
#     "memory": "OK",
#     "diskSpace": "OK"
#   }
# }
```

---

## Recovery Procedures

### Service Restart

```bash
# Graceful restart (preferred)
kubectl rollout restart deployment/event-service -n tickettoken

# Monitor rollout
kubectl rollout status deployment/event-service -n tickettoken

# Verify pods are healthy
kubectl get pods -n tickettoken -l app=event-service
```

### Database Recovery

```bash
# 1. Check for connection issues
psql -h $DB_HOST -c "SELECT 1;"

# 2. If connection pool exhausted, restart service
kubectl rollout restart deployment/event-service

# 3. If data corruption suspected, restore from backup
# Contact DBA team immediately

# 4. Run integrity checks
psql -c "SELECT * FROM events WHERE tenant_id IS NULL;" # Should return 0 rows
```

### Cache Invalidation

```bash
# Clear specific cache keys
redis-cli KEYS "event:*" | xargs redis-cli DEL
redis-cli KEYS "venue:events:*" | xargs redis-cli DEL

# Clear all event-service cache (use with caution)
redis-cli KEYS "event-service:*" | xargs redis-cli DEL
```

### Rollback Deployment

```bash
# View rollout history
kubectl rollout history deployment/event-service -n tickettoken

# Rollback to previous version
kubectl rollout undo deployment/event-service -n tickettoken

# Rollback to specific revision
kubectl rollout undo deployment/event-service -n tickettoken --to-revision=2
```

---

## Appendix

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `VENUE_SERVICE_URL` | Venue service endpoint | Yes |
| `NODE_ENV` | Environment (production/staging) | Yes |
| `LOG_LEVEL` | Logging level (info/debug/error) | No |

### Useful Commands

```bash
# View recent logs
kubectl logs -f deployment/event-service -n tickettoken --since=5m

# Check resource usage
kubectl top pods -n tickettoken -l app=event-service

# Port forward for local debugging
kubectl port-forward svc/event-service 3003:3003 -n tickettoken

# Execute shell in pod
kubectl exec -it deployment/event-service -n tickettoken -- /bin/sh
```

### Related Runbooks

- [Venue Service Runbook](../../venue-service/docs/runbooks/README.md)
- [Database Migration Runbook](./migration-rollback.md)
- [Key Rotation Runbook](./key-rotation.md)
- [Disaster Recovery Plan](../../platform/docs/disaster-recovery.md)
