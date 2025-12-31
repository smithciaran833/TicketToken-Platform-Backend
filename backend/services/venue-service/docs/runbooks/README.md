# Venue Service Runbooks

Operational procedures for managing the Venue Service in production.

## Table of Contents

1. [Service Overview](#service-overview)
2. [Health Checks](#health-checks)
3. [Common Issues](#common-issues)
4. [Incident Response](#incident-response)
5. [Deployment](#deployment)
6. [Database Operations](#database-operations)
7. [Monitoring & Alerts](#monitoring--alerts)

---

## Service Overview

- **Port**: 3002
- **Dependencies**: PostgreSQL, Redis
- **Health Endpoint**: `GET /health`
- **Metrics Endpoint**: `GET /metrics`

## Health Checks

### Check Service Health
```bash
curl http://venue-service:3002/health
```

### Check Detailed Health
```bash
curl http://venue-service:3002/health/full
```

### Expected Response
```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

---

## Common Issues

### Issue: Service Not Starting

**Symptoms**: Container restart loop, health check failures

**Diagnosis**:
```bash
# Check logs
kubectl logs -l app=venue-service --tail=100

# Check if database is reachable
kubectl exec -it venue-service-xxx -- nc -zv postgres 5432
```

**Resolution**:
1. Verify database credentials in secrets
2. Check if migrations need to run
3. Verify Redis connectivity

### Issue: High Latency

**Symptoms**: P99 latency > 500ms

**Diagnosis**:
```bash
# Check pool usage
curl http://venue-service:3002/metrics | grep db_pool

# Check slow queries in PostgreSQL
SELECT query, calls, mean_time FROM pg_stat_statements 
ORDER BY mean_time DESC LIMIT 10;
```

**Resolution**:
1. Check connection pool saturation
2. Look for missing indexes
3. Review recent query changes

### Issue: Rate Limit Errors

**Symptoms**: 429 responses, customer complaints

**Diagnosis**:
```bash
# Check rate limit logs
kubectl logs -l app=venue-service | grep "Rate limit exceeded"

# Check Redis rate limit keys
redis-cli KEYS "rate_limit:*"
```

**Resolution**:
1. Identify abusive traffic patterns
2. Temporarily increase limits if legitimate
3. Consider tenant-specific overrides

### Issue: Database Connection Failures

**Symptoms**: ECONNREFUSED, pool exhaustion

**Diagnosis**:
```bash
# Check pool metrics
curl http://venue-service:3002/metrics | grep db_pool_pending

# Check PostgreSQL connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'tickettoken_db';
```

**Resolution**:
1. Check PgBouncer status if used
2. Verify connection limits
3. Look for connection leaks (transactions not closed)

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P1 | Service down | 15 minutes | Complete outage |
| P2 | Degraded | 1 hour | High error rate |
| P3 | Minor | 4 hours | Single feature broken |
| P4 | Low | Next business day | Cosmetic issues |

### P1 Procedure

1. **Page on-call** (automatic via PagerDuty)
2. **Join incident channel** (#incident-active)
3. **Assess impact**:
   - How many users affected?
   - Which tenants?
   - What functionality is broken?
4. **Mitigate**:
   - Rollback if recent deployment
   - Scale up if capacity issue
   - Enable circuit breakers if dependency down
5. **Communicate**: Update status page
6. **Resolve**: Fix root cause
7. **Post-mortem**: Schedule within 48 hours

### Rollback Procedure

```bash
# Identify previous version
kubectl rollout history deployment/venue-service

# Rollback to previous
kubectl rollout undo deployment/venue-service

# Or rollback to specific version
kubectl rollout undo deployment/venue-service --to-revision=5
```

---

## Deployment

### Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Migration tested in staging
- [ ] Rollback plan documented
- [ ] Feature flags configured
- [ ] Monitoring alerts verified

### Deploy to Production

```bash
# Via CI/CD (preferred)
# Merge PR to main branch triggers deployment

# Manual deployment (emergency only)
kubectl set image deployment/venue-service \
  venue-service=gcr.io/tickettoken/venue-service:v1.2.3
```

### Verify Deployment

```bash
# Check rollout status
kubectl rollout status deployment/venue-service

# Verify health
curl http://venue-service:3002/health

# Check logs for errors
kubectl logs -l app=venue-service --since=5m | grep -i error
```

---

## Database Operations

### Run Migrations

```bash
# Via Kubernetes job
kubectl create job migrate-venue --from=cronjob/venue-migrate

# Manually in pod
kubectl exec -it venue-service-xxx -- npm run migrate
```

### Rollback Migration

```bash
kubectl exec -it venue-service-xxx -- npm run migrate:rollback
```

### Check Migration Status

```bash
kubectl exec -it venue-service-xxx -- npm run migrate:status
```

### Emergency: Direct Database Access

```bash
# Only for P1 incidents with proper authorization
kubectl exec -it postgres-0 -- psql -U postgres -d tickettoken_db
```

---

## Monitoring & Alerts

### Key Metrics

| Metric | Warning | Critical |
|--------|---------|----------|
| Error rate | > 1% | > 5% |
| P99 latency | > 500ms | > 2s |
| Pool utilization | > 70% | > 90% |
| Memory usage | > 70% | > 85% |

### Grafana Dashboards

- Venue Service Overview: `grafana.internal/d/venue-service`
- Database Performance: `grafana.internal/d/postgres`

### Alert Response

When you receive an alert:

1. Check the alert details in PagerDuty
2. Open Grafana dashboard for context
3. Check logs for errors
4. Follow relevant runbook section
5. Escalate if unable to resolve

---

## Contacts

- **Team Lead**: @venue-team-lead
- **On-call Schedule**: PagerDuty venue-service
- **Slack Channel**: #venue-service
- **Escalation**: #platform-oncall

---

Last updated: December 2024
