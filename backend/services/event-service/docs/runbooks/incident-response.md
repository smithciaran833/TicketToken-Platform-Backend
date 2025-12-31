# Event Service Incident Response Playbook

**CRITICAL FIX for audit findings (11-documentation.md)**

This document provides procedures for handling common incidents in the event-service.

---

## Table of Contents

1. [Service Down](#1-service-down)
2. [Database Issues](#2-database-issues)
3. [High Latency](#3-high-latency)
4. [Security Incidents](#4-security-incidents)
5. [Event State Corruption](#5-event-state-corruption)
6. [Capacity/Overselling](#6-capacityoverselling)
7. [General Escalation Matrix](#7-general-escalation-matrix)

---

## 1. Service Down

### Symptoms
- Health check endpoints returning 5xx
- No response from service
- Kubernetes pods in CrashLoopBackOff

### Diagnostic Steps

```bash
# 1. Check pod status
kubectl get pods -l app=event-service -n production

# 2. Check pod logs
kubectl logs -l app=event-service -n production --tail=100

# 3. Check health endpoints
curl http://event-service:3003/health/live
curl http://event-service:3003/health/ready

# 4. Check resource usage
kubectl top pods -l app=event-service -n production
```

### Resolution Steps

1. **Check if recent deployment**
   ```bash
   kubectl rollout history deployment/event-service -n production
   # If bad deployment, rollback:
   kubectl rollout undo deployment/event-service -n production
   ```

2. **Check database connectivity**
   ```bash
   # From within cluster
   kubectl exec -it <pod-name> -- psql "$DATABASE_URL" -c "SELECT 1"
   ```

3. **Check Redis connectivity**
   ```bash
   kubectl exec -it <pod-name> -- redis-cli -h $REDIS_HOST ping
   ```

4. **Restart pods if necessary**
   ```bash
   kubectl rollout restart deployment/event-service -n production
   ```

5. **Scale up if resource exhaustion**
   ```bash
   kubectl scale deployment/event-service --replicas=5 -n production
   ```

### Recovery Verification
- [ ] /health/live returns 200
- [ ] /health/ready returns 200
- [ ] API requests succeed
- [ ] Metrics flowing to monitoring

---

## 2. Database Issues

### Connection Pool Exhaustion

**Symptoms:**
- "ECONNREFUSED" errors in logs
- "Pool is exhausted" errors
- 503 errors from API

**Resolution:**
```bash
# 1. Check current connections
psql -h $DB_HOST -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE datname='event_service';"

# 2. Kill idle connections
psql -h $DB_HOST -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='event_service' AND state='idle' AND query_start < NOW() - INTERVAL '1 hour';"

# 3. Increase pool size (requires restart)
# Update EVENT_SERVICE_DB_POOL_MAX in config/secrets

# 4. Restart service
kubectl rollout restart deployment/event-service -n production
```

### Query Timeouts (504 errors)

**Symptoms:**
- 504 Gateway Timeout errors
- Slow queries in logs
- High database CPU

**Resolution:**
```bash
# 1. Identify slow queries
psql -h $DB_HOST -U postgres -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' AND (now() - pg_stat_activity.query_start) > interval '5 seconds';"

# 2. Kill long-running queries
psql -h $DB_HOST -U postgres -c "SELECT pg_terminate_backend(<pid>);"

# 3. Check for missing indexes
psql -h $DB_HOST -U postgres -c "SELECT * FROM pg_stat_user_tables WHERE seq_scan > idx_scan ORDER BY seq_scan DESC LIMIT 10;"

# 4. Run ANALYZE to update statistics
psql -h $DB_HOST -U postgres -c "ANALYZE events;"
```

### Database Migration Issues

See [migration-rollback.md](./migration-rollback.md) for detailed rollback procedures.

---

## 3. High Latency

### Symptoms
- P95 latency > 500ms
- Slow response alerts from monitoring
- User complaints

### Diagnostic Steps

```bash
# 1. Check current latency metrics
curl http://event-service:3003/metrics | grep http_request_duration

# 2. Check database latency
kubectl exec -it <pod-name> -- psql "$DATABASE_URL" -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# 3. Check Redis latency
kubectl exec -it <pod-name> -- redis-cli --latency-history -h $REDIS_HOST

# 4. Check external service latency (venue-service)
# Look for circuit breaker logs
kubectl logs -l app=event-service -n production | grep "circuit breaker"
```

### Resolution Steps

1. **Enable caching if disabled**
   ```bash
   # Check if Redis is accessible
   redis-cli -h $REDIS_HOST ping
   ```

2. **Clear problematic cache entries**
   ```bash
   redis-cli -h $REDIS_HOST KEYS "event:*" | xargs redis-cli -h $REDIS_HOST DEL
   ```

3. **Check if rate limiting is too aggressive**
   - Review rate limit metrics
   - Temporarily increase limits if legitimate traffic

4. **Scale horizontally**
   ```bash
   kubectl scale deployment/event-service --replicas=10 -n production
   ```

5. **Enable degraded mode if external services are slow**
   - Circuit breaker will handle this automatically
   - Check logs for "degraded mode" messages

---

## 4. Security Incidents

### Unauthorized Access Attempt

**Symptoms:**
- 401/403 errors in logs
- Invalid JWT token errors
- Suspicious IP patterns

**Immediate Actions:**
```bash
# 1. Identify the source IP
kubectl logs -l app=event-service -n production | grep "401\|403" | tail -100

# 2. Block IP at ingress level
kubectl edit configmap nginx-ip-blacklist -n ingress

# 3. Rotate API keys if compromised
# Update SERVICE_API_KEYS in secrets and restart

# 4. Rotate JWT signing key if token leak suspected
# Coordinate with auth-service team
```

### Data Breach Suspicion

**Immediate Actions:**
1. **DO NOT RESTART SERVICES** - preserve logs
2. Capture current state:
   ```bash
   kubectl logs -l app=event-service -n production --since=24h > incident-logs.txt
   kubectl get pods -l app=event-service -n production -o yaml > pod-state.yaml
   ```
3. **Notify security team immediately**
4. **Enable audit logging if not already enabled**
5. Check database audit logs:
   ```sql
   SELECT * FROM event_audit_log WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC;
   ```

### Tenant Isolation Breach

**Symptoms:**
- User accessing another tenant's events
- Cross-tenant data in logs

**Immediate Actions:**
1. **CRITICAL**: Shut down affected endpoint
   ```bash
   kubectl scale deployment/event-service --replicas=0 -n production
   ```
2. Analyze logs to identify scope
3. Check RLS policies are applied:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'events';
   ```
4. Verify tenant context middleware is active
5. **Notify affected tenants**

---

## 5. Event State Corruption

### Symptoms
- Events stuck in invalid states
- State transitions failing
- Inconsistent data between services

### Diagnostic Steps
```sql
-- Check for events in invalid states
SELECT id, status, updated_at FROM events 
WHERE status NOT IN ('DRAFT', 'PUBLISHED', 'ON_SALE', 'SALES_PAUSED', 'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- Check for orphaned schedules
SELECT es.id FROM event_schedules es 
LEFT JOIN events e ON e.id = es.event_id 
WHERE e.id IS NULL;

-- Check for events past their date but not completed
SELECT id, status FROM events 
WHERE status NOT IN ('COMPLETED', 'CANCELLED') 
AND EXISTS (SELECT 1 FROM event_schedules WHERE event_id = events.id AND ends_at < NOW());
```

### Resolution Steps

1. **Fix invalid states manually**
   ```sql
   -- Use with caution
   UPDATE events SET status = 'DRAFT', updated_at = NOW() 
   WHERE status NOT IN ('DRAFT', 'PUBLISHED', 'ON_SALE', 'SALES_PAUSED', 'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
   ```

2. **Trigger missed state transitions**
   ```bash
   # Trigger manual scan
   curl -X POST http://event-service:3003/api/v1/admin/trigger-transition-scan \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

3. **Check job queue**
   ```bash
   # View pending jobs
   redis-cli -h $REDIS_HOST LRANGE bull:event-transitions:waiting 0 100
   ```

---

## 6. Capacity/Overselling

### Symptoms
- More tickets sold than capacity
- Capacity count inconsistencies
- Race condition errors

### Immediate Actions

1. **Stop sales for affected event**
   ```sql
   UPDATE events SET status = 'SALES_PAUSED' WHERE id = '<event_id>';
   ```

2. **Audit capacity**
   ```sql
   SELECT 
     ec.id,
     ec.tier_name,
     ec.total_capacity,
     ec.available_capacity,
     ec.sold_count,
     (ec.total_capacity - ec.available_capacity - ec.sold_count) as discrepancy
   FROM event_capacity ec
   WHERE ec.event_id = '<event_id>';
   ```

3. **Reconcile with ticket service**
   ```bash
   # Call ticket service to get actual counts
   curl http://ticket-service:3004/api/v1/events/<event_id>/ticket-counts
   ```

4. **Fix capacity**
   ```sql
   -- After verifying actual counts
   UPDATE event_capacity 
   SET available_capacity = total_capacity - <actual_sold_count>,
       sold_count = <actual_sold_count>,
       updated_at = NOW()
   WHERE event_id = '<event_id>';
   ```

---

## 7. General Escalation Matrix

| Severity | Response Time | Escalation Path | Example |
|----------|--------------|-----------------|---------|
| **P1 - Critical** | 15 min | On-call → Team Lead → Engineering Director | Service completely down, data breach |
| **P2 - High** | 1 hour | On-call → Team Lead | Major feature broken, high latency |
| **P3 - Medium** | 4 hours | On-call | Minor feature broken, intermittent issues |
| **P4 - Low** | Next business day | Ticket | Documentation issues, minor bugs |

### Communication Templates

**P1 Incident Slack Message:**
```
🚨 P1 INCIDENT - Event Service
Status: [INVESTIGATING/IDENTIFIED/MONITORING/RESOLVED]
Impact: [describe user impact]
Start Time: [UTC timestamp]
Current Actions: [what's being done]
ETA to Resolution: [if known]
Incident Commander: @[name]
```

**Stakeholder Email:**
```
Subject: [P1] Event Service Incident - [Brief Description]

Impact:
- [List affected functionality]
- [List affected users/tenants]

Timeline:
- [HH:MM UTC] - Issue detected
- [HH:MM UTC] - Investigation started
- [HH:MM UTC] - Root cause identified
- [HH:MM UTC] - Resolution implemented

Root Cause: [Brief description]

Resolution: [What was done]

Prevention: [Actions to prevent recurrence]
```

---

## Post-Incident Actions

1. [ ] Create incident report within 24 hours
2. [ ] Schedule post-mortem meeting
3. [ ] Update runbooks based on learnings
4. [ ] Create tickets for preventive measures
5. [ ] Communicate resolution to stakeholders

---

## Contact Information

| Role | Contact |
|------|---------|
| Event Service On-Call | PagerDuty: event-service-oncall |
| Platform Team | #platform-team Slack |
| Security Team | #security-incidents Slack |
| DBA Team | #dba-support Slack |

---

*Last Updated: December 2024*
*Document Owner: Event Service Team*
