# Compliance Service Runbooks

**AUDIT FIX: DOC-H3**

Operational runbooks for the Compliance Service.

## Table of Contents

- [Service Overview](#service-overview)
- [Quick Reference](#quick-reference)
- [Incident Response](#incident-response)
- [Common Issues](#common-issues)
- [Maintenance Procedures](#maintenance-procedures)
- [Monitoring & Alerts](#monitoring--alerts)

---

## Service Overview

| Property | Value |
|----------|-------|
| Service Name | compliance-service |
| Port | 3008 |
| Health Check | `/health`, `/health/live`, `/health/ready` |
| Dependencies | PostgreSQL, Redis, Auth Service |
| Owner Team | Platform Security |
| On-Call | #compliance-oncall |

### Critical Functions

- **GDPR**: Data export and deletion requests
- **OFAC/SDN**: Sanctions screening
- **Tax/1099**: IRS form generation
- **Risk Assessment**: Venue risk scoring

---

## Quick Reference

### Health Checks

```bash
# Liveness probe
curl http://localhost:3008/health/live

# Readiness probe
curl http://localhost:3008/health/ready

# Deep health check
curl http://localhost:3008/health/deep
```

### Service Control

```bash
# Start service
npm start

# Development mode
npm run dev

# Run migrations
npm run migrate

# Rollback migration
npm run migrate:rollback
```

### Log Access

```bash
# Kubernetes logs
kubectl logs -f deployment/compliance-service -n production

# Docker logs
docker logs -f compliance-service

# Filter errors
kubectl logs deployment/compliance-service | grep -E '"level":(50|60)'
```

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| SEV1 | Complete outage | < 15 min | Service down, data breach |
| SEV2 | Degraded | < 30 min | Slow response, partial failure |
| SEV3 | Minor issue | < 2 hours | Non-critical errors |
| SEV4 | Informational | Next business day | Cleanup needed |

---

### INC-001: Service Not Responding

**Symptoms:**
- Health checks failing
- 502/503 errors
- Connection timeouts

**Diagnosis:**
```bash
# Check pod status
kubectl get pods -l app=compliance-service

# Check recent events
kubectl describe pod <pod-name>

# Check logs
kubectl logs -f <pod-name> --tail=100
```

**Resolution Steps:**

1. **Check dependencies:**
```bash
# PostgreSQL
kubectl exec -it <pod-name> -- nc -zv postgres 5432

# Redis
kubectl exec -it <pod-name> -- nc -zv redis 6379
```

2. **Restart service (if needed):**
```bash
kubectl rollout restart deployment/compliance-service
```

3. **Check resource usage:**
```bash
kubectl top pod <pod-name>
```

4. **Scale if needed:**
```bash
kubectl scale deployment/compliance-service --replicas=3
```

---

### INC-002: Database Connection Issues

**Symptoms:**
- `ECONNREFUSED` errors
- Pool exhaustion
- Slow queries

**Diagnosis:**
```bash
# Check connection count
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='compliance';"

# Check long-running queries
psql -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
         FROM pg_stat_activity 
         WHERE state != 'idle' 
         ORDER BY duration DESC LIMIT 10;"
```

**Resolution Steps:**

1. **Kill long-running queries:**
```sql
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE duration > interval '5 minutes' 
AND state != 'idle';
```

2. **Check pool configuration:**
```bash
kubectl exec -it <pod-name> -- env | grep DB_POOL
```

3. **Restart database connection pool:**
```bash
kubectl rollout restart deployment/compliance-service
```

---

### INC-003: Redis Connection Issues

**Symptoms:**
- Cache misses
- Rate limiting not working
- Slow response times

**Diagnosis:**
```bash
# Check Redis connectivity
redis-cli -h redis ping

# Check memory usage
redis-cli -h redis info memory

# Check connected clients
redis-cli -h redis info clients
```

**Resolution Steps:**

1. **Clear cache (if needed):**
```bash
redis-cli -h redis FLUSHDB
```

2. **Check Redis cluster status:**
```bash
redis-cli -h redis cluster info
```

3. **Service will fall back to in-memory rate limiting if Redis is unavailable**

---

### INC-004: High Memory Usage

**Symptoms:**
- OOMKilled pods
- Slow response times
- Event loop lag warnings

**Diagnosis:**
```bash
# Check memory usage
kubectl top pod <pod-name>

# Check Node.js memory
kubectl exec -it <pod-name> -- node -e "console.log(process.memoryUsage())"
```

**Resolution Steps:**

1. **Trigger garbage collection:**
```bash
kubectl exec -it <pod-name> -- kill -USR2 1
```

2. **Scale horizontally:**
```bash
kubectl scale deployment/compliance-service --replicas=4
```

3. **Check for memory leaks in logs**

---

### INC-005: Rate Limiting Triggered

**Symptoms:**
- 429 Too Many Requests errors
- Retry-After headers in responses

**Diagnosis:**
```bash
# Check rate limit metrics
curl http://localhost:3008/metrics | grep rate_limit

# Check Redis rate limit keys
redis-cli -h redis KEYS "compliance:ratelimit:*"
```

**Resolution Steps:**

1. **Identify source of requests:**
```bash
kubectl logs <pod-name> | grep "Rate limit exceeded" | jq .ip
```

2. **Temporarily increase limits (if legitimate):**
```bash
kubectl set env deployment/compliance-service RATE_LIMIT_MAX=200
```

3. **Block abusive IPs at load balancer level**

---

### INC-006: GDPR Export Failure

**Symptoms:**
- Export requests stuck in "pending"
- User complaints about data export

**Diagnosis:**
```sql
-- Check pending exports
SELECT * FROM gdpr_requests 
WHERE type = 'export' AND status = 'pending' 
ORDER BY created_at DESC;
```

**Resolution Steps:**

1. **Check export job logs:**
```bash
kubectl logs <pod-name> | grep "gdpr_export"
```

2. **Manually retry export:**
```sql
UPDATE gdpr_requests SET status = 'pending', attempts = 0 
WHERE id = '<request_id>';
```

3. **Check S3/storage connectivity**

---

### INC-007: OFAC Screening Errors

**Symptoms:**
- Screening requests failing
- False positives/negatives

**Diagnosis:**
```sql
-- Check SDN list freshness
SELECT MAX(updated_at) FROM ofac_sdn_list;

-- Check screening failures
SELECT * FROM screening_logs 
WHERE status = 'error' 
ORDER BY created_at DESC LIMIT 10;
```

**Resolution Steps:**

1. **Refresh OFAC data:**
```bash
npm run ofac:refresh
```

2. **Check external API status:**
```bash
curl -s https://sanctionssearch.ofac.treas.gov/healthcheck
```

3. **Fall back to cached data if API unavailable**

---

## Common Issues

### Issue: Slow Health Checks

**Cause:** Database or Redis connection issues

**Solution:**
- Health checks have 5-second timeouts
- Check dependency connectivity
- Review connection pool settings

### Issue: JWT Validation Failures

**Cause:** Clock skew, expired secrets, wrong issuer

**Solution:**
1. Check server time: `date`
2. Verify JWT_SECRET matches auth service
3. Check JWT issuer/audience configuration

### Issue: Webhook Processing Failures

**Cause:** Invalid signatures, duplicate events

**Solution:**
1. Verify WEBHOOK_SECRET is correct
2. Check idempotency key processing
3. Review webhook logs for details

---

## Maintenance Procedures

### Database Migration

```bash
# 1. Create backup
pg_dump compliance > backup_$(date +%Y%m%d).sql

# 2. Run migration
npm run migrate

# 3. Verify
npm run migrate:status
```

### Secret Rotation

1. **Database Password:**
```bash
# Update in secrets manager
aws secretsmanager update-secret --secret-id compliance/db

# Restart service to pick up new password
kubectl rollout restart deployment/compliance-service
```

2. **JWT Secret:**
```bash
# Coordinate with auth service
# Update both services simultaneously
```

3. **Webhook Secret:**
```bash
# Update in secrets manager
# Notify webhook providers of new secret
```

### Scaling

```bash
# Horizontal scaling
kubectl scale deployment/compliance-service --replicas=5

# Vertical scaling (edit deployment)
kubectl edit deployment/compliance-service
# Update resources.requests and resources.limits
```

---

## Monitoring & Alerts

### Key Metrics

| Metric | Warning | Critical |
|--------|---------|----------|
| Response time (p99) | > 500ms | > 2s |
| Error rate | > 1% | > 5% |
| CPU usage | > 70% | > 90% |
| Memory usage | > 70% | > 85% |
| Event loop lag | > 100ms | > 300ms |
| Connection pool used | > 80% | > 95% |

### Alert Response

| Alert | Response |
|-------|----------|
| HighErrorRate | Check logs, investigate errors |
| HighLatency | Check DB queries, Redis, load |
| PodCrashLooping | Check logs, resource limits |
| MemoryPressure | Scale pods, check for leaks |
| DiskPressure | Clean logs, check data growth |

### Dashboard Links

- Grafana: `https://grafana.internal/d/compliance-service`
- Prometheus: `https://prometheus.internal/graph?g0.expr=compliance`
- PagerDuty: `https://pagerduty.com/services/compliance`

---

## Contacts

| Role | Contact |
|------|---------|
| On-Call | #compliance-oncall |
| Service Owner | compliance-team@company.com |
| Security Team | security@company.com |
| DBA | dba-team@company.com |

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-03 | Audit | Initial runbooks |
