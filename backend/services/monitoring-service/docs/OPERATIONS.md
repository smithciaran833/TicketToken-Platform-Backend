# Monitoring Service Operations Runbook

Day-to-day operations guide for the monitoring service.

## Table of Contents

- [Daily Operations](#daily-operations)
- [Alert Response](#alert-response)
- [Common Issues](#common-issues)
- [Maintenance Tasks](#maintenance-tasks)
- [Performance Tuning](#performance-tuning)
- [Incident Response](#incident-response)

## Daily Operations

### Morning Checklist

**Every morning, verify:**

```bash
# 1. Service health
curl https://monitoring.tickettoken.com/health | jq

# 2. All 21 services being monitored
curl -H "Authorization: Bearer $TOKEN" \
  https://monitoring.tickettoken.com/api/v1/monitoring/services | jq

# 3. Worker status
curl -H "Authorization: Bearer $TOKEN" \
  https://monitoring.tickettoken.com/api/v1/monitoring/workers | jq

# 4. Active alerts
curl -H "Authorization: Bearer $TOKEN" \
  https://monitoring.tickettoken.com/api/alerts?status=active | jq

# 5. Check logs for errors
tail -n 100 /app/logs/monitoring-error.log
```

### Weekly Checklist

**Every week:**

- [ ] Review alert history and tune thresholds
- [ ] Check disk space usage
- [ ] Review database size and plan archival
- [ ] Test alert notifications (email, Slack, PagerDuty)
- [ ] Review false positive rate
- [ ] Update documentation if needed

### Monthly Checklist

**Every month:**

- [ ] Review and archive old metrics (> 90 days)
- [ ] Review and update alert rules
- [ ] Audit access logs
- [ ] Review system performance metrics
- [ ] Update dependencies (security patches)
- [ ] Review backup strategy
- [ ] Capacity planning review

## Alert Response

### Alert Severity Levels

**Critical** - Immediate action required
- Response time: < 5 minutes
- Escalation: On-call → Team Lead → Manager
- Examples: Service completely down, data loss risk

**Error** - Prompt action required
- Response time: < 15 minutes  
- Escalation: On-call → Team Lead
- Examples: High error rates, payment failures

**Warning** - Investigation needed
- Response time: < 1 hour
- Escalation: On-call
- Examples: Slow database, high queue depth

**Info** - Awareness only
- Response time: Review during business hours
- No escalation
- Examples: Traffic spikes, revenue changes

### Alert Response Workflow

#### 1. Acknowledge Alert

```bash
# Via API
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "acknowledgedBy": "oncall@tickettoken.com",
    "notes": "Investigating the issue"
  }' \
  https://monitoring.tickettoken.com/api/alerts/acknowledge/<alert-id>

# Via Slack: Click "Acknowledge" button in alert message
```

#### 2. Investigate

**Check logs:**
```bash
# Service logs
kubectl logs -f deployment/<service-name> --tail=100

# Monitoring service logs
tail -f /app/logs/monitoring-combined.log

# Search for errors
grep -i "error" /app/logs/monitoring-error.log | tail -20
```

**Check metrics:**
```bash
# Get current metrics
curl https://monitoring.tickettoken.com/metrics | grep <metric-name>

# Check service health
curl https://monitoring.tickettoken.com/health
```

**Check dependencies:**
```bash
# Database
psql $DATABASE_URL -c "SELECT 1"

# Redis
redis-cli ping

# Other services
for service in auth venue event; do
  echo "Checking $service-service..."
  curl http://$service-service:3000/health
done
```

#### 3. Resolve Issue

**Common resolutions:**

- Restart service
- Scale up resources
- Clear cache
- Run cleanup tasks
- Apply hotfix

#### 4. Post-Resolution

```bash
# Verify resolution
curl https://monitoring.tickettoken.com/health

# Add notes to alert
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"notes": "Resolved by restarting service"}' \
  https://monitoring.tickettoken.com/api/alerts/<alert-id>/notes
```

### Specific Alert Responses

#### High Refund Rate

**Symptoms:** Refund rate > 10%

**Investigation:**
1. Check for fraud patterns
2. Review recent refund requests
3. Check payment provider status
4. Verify refund processing pipeline

**Actions:**
- Investigate suspicious refunds
- Contact fraud detection team if needed
- Review refund policies

#### Payment Failure Spike

**Symptoms:** Payment failure rate > 20%

**Investigation:**
1. Check payment provider status
2. Review error codes in logs
3. Check database connectivity
4. Verify API rate limits

**Actions:**
```bash
# Check Stripe status
curl https://status.stripe.com/api/v2/status.json

# Check payment service health
curl http://payment-service:3004/health

# Review recent payments
psql $DATABASE_URL -c "
  SELECT status, COUNT(*) 
  FROM payments 
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY status"
```

#### Database Slow

**Symptoms:** DB queries > 1000ms

**Investigation:**
1. Check active connections
2. Review slow query log
3. Check for long-running queries
4. Verify connection pool size

**Actions:**
```bash
# Check connections
psql $DATABASE_URL -c "
  SELECT count(*), state 
  FROM pg_stat_activity 
  GROUP BY state"

# Check slow queries
psql $DATABASE_URL -c "
  SELECT pid, now() - query_start as duration, query 
  FROM pg_stat_activity 
  WHERE state != 'idle'
  ORDER BY duration DESC 
  LIMIT 10"

# Kill long-running query (if needed)
psql $DATABASE_URL -c "SELECT pg_terminate_backend(<pid>)"
```

#### API Error Rate High

**Symptoms:** Error rate > 5%

**Investigation:**
1. Check logs for error patterns
2. Review recent deployments
3. Check external dependencies
4. Verify rate limiting

**Actions:**
```bash
# Check error distribution
curl https://monitoring.tickettoken.com/metrics | grep errors_total

# Check logs
tail -100 /app/logs/monitoring-error.log

# If needed, rollback deployment
kubectl rollout undo deployment/<service-name>
```

## Common Issues

### Service Won't Start

**Symptoms:**
- Container keeps restarting
- Health check fails
- "Connection refused" errors

**Diagnosis:**
```bash
# Check logs
docker logs monitoring-service --tail=50

# Check if port is in use
lsof -i :3017

# Check environment variables
docker exec monitoring-service env | grep -E "DATABASE|REDIS|JWT"
```

**Resolution:**
```bash
# Fix environment
docker stop monitoring-service
# Update .env file
docker start monitoring-service

# Or restart with correct env
docker run -d \
  --name monitoring-service \
  -e DATABASE_URL=correct-url \
  ...
```

### High Memory Usage

**Symptoms:**
- Memory usage > 80%
- OOM killer activating
- Slow response times

**Diagnosis:**
```bash
# Check memory
docker stats monitoring-service

# Check Node.js heap
curl http://localhost:3017/metrics | grep process_resident_memory

# Check for memory leaks
node --inspect dist/index.js
```

**Resolution:**
```bash
# Increase memory limit (Docker)
docker run -d \
  --memory="2g" \
  --memory-swap="2g" \
  ...

# Increase memory limit (Kubernetes)
kubectl patch deployment monitoring-service \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"monitoring-service","resources":{"limits":{"memory":"2Gi"}}}]}}}}'

# Optimize workers if needed
# Edit worker intervals in code
```

### Database Connection Pool Exhausted

**Symptoms:**
- "Pool connection timeout" errors
- Requests hanging
- 503 errors

**Diagnosis:**
```bash
# Check pool stats
curl http://localhost:3017/metrics | grep db_pool

# Check active connections
psql $DATABASE_URL -c "
  SELECT count(*) as connections, 
         application_name 
  FROM pg_stat_activity 
  GROUP BY application_name"
```

**Resolution:**
```bash
# Increase pool size (temporarily)
# Update DATABASE_POOL_MAX in .env
docker restart monitoring-service

# Or kill idle connections
psql $DATABASE_URL -c "
  SELECT pg_terminate_backend(pid) 
  FROM pg_stat_activity 
  WHERE application_name = 'monitoring-service' 
    AND state = 'idle' 
    AND state_change < now() - interval '5 minutes'"
```

### Alerts Not Being Sent

**Symptoms:**
- No alert notifications received
- Alerts show in dashboard but no emails/Slack

**Diagnosis:**
```bash
# Check alert manager status
curl http://localhost:3017/api/v1/monitoring/workers | jq '.workers[] | select(.name == "alert-evaluation")'

# Check notification channels
tail -f /app/logs/monitoring-combined.log | grep -i "notification\|alert"

# Test SMTP
telnet $SMTP_HOST $SMTP_PORT
```

**Resolution:**
```bash
# Verify env variables
env | grep -E "SMTP|SLACK|PAGERDUTY"

# Test email manually
npm run test:email

# Restart workers
# ... (depends on deployment method)
```

### Metrics Not Being Collected

**Symptoms:**
- /metrics endpoint empty or stale
- Grafana shows "No Data"
- Prometheus not scraping

**Diagnosis:**
```bash
# Check /metrics endpoint
curl http://localhost:3017/metrics

# Check Prometheus targets
curl http://prometheus:9090/api/v1/targets | jq

# Check if collectors are running
curl http://localhost:3017/api/v1/monitoring/workers
```

**Resolution:**
```bash
# Restart collectors
# Restart service

# Verify Prometheus configuration
cat /etc/prometheus/prometheus.yml | grep monitoring-service

# Check network connectivity
curl -v http://monitoring-service:3017/metrics
```

## Maintenance Tasks

### Database Cleanup

**Archive old data (monthly):**

```sql
-- Archive old metrics (> 90 days)
BEGIN;
CREATE TABLE metrics_archive_2025_01 AS 
  SELECT * FROM metrics 
  WHERE timestamp < NOW() - INTERVAL '90 days';

DELETE FROM metrics 
WHERE timestamp < NOW() - INTERVAL '90 days';

COMMIT;

-- Archive old alerts (> 30 days)
BEGIN;
CREATE TABLE alerts_archive_2025_01 AS 
  SELECT * FROM alerts 
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND status = 'resolved';

DELETE FROM alerts 
WHERE created_at < NOW() - INTERVAL '30 days'
  AND status = 'resolved';

COMMIT;

-- Vacuum to reclaim space
VACUUM ANALYZE metrics;
VACUUM ANALYZE alerts;
```

### Log Rotation

**Configure logrotate:**

```bash
# /etc/logrotate.d/monitoring-service
/app/logs/monitoring-*.log {
  daily
  rotate 7
  compress
  delaycompress
  notifempty
  create 0640 nodejs nodejs
  sharedscripts
  postrotate
    docker kill -s USR1 monitoring-service
  endscript
}
```

### Certificate Renewal

**For HTTPS/TLS certificates:**

```bash
# Check expiration
echo | openssl s_client -servername monitoring.tickettoken.com \
  -connect monitoring.tickettoken.com:443 2>/dev/null | \
  openssl x509 -noout -dates

# Renew with certbot
sudo certbot renew

# Reload nginx
sudo nginx -s reload
```

### Backup and Restore

**Backup monitoring database:**

```bash
# Backup
pg_dump $DATABASE_URL > monitoring_backup_$(date +%Y%m%d).sql

# Compress
gzip monitoring_backup_$(date +%Y%m%d).sql

# Upload to S3
aws s3 cp monitoring_backup_$(date +%Y%m%d).sql.gz \
  s3://tickettoken-backups/monitoring/
```

**Restore:**

```bash
# Download from S3
aws s3 cp s3://tickettoken-backups/monitoring/monitoring_backup_20250118.sql.gz .

# Decompress
gunzip monitoring_backup_20250118.sql.gz

# Restore
psql $DATABASE_URL < monitoring_backup_20250118.sql
```

## Performance Tuning

### Optimize Database Queries

```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_metrics_timestamp 
  ON metrics(timestamp DESC);

CREATE INDEX CONCURRENTLY idx_alerts_created_status 
  ON alerts(created_at, status);

-- Update statistics
ANALYZE metrics;
ANALYZE alerts;
```

### Optimize Redis

```bash
# Configure persistence
redis-cli CONFIG SET save "900 1 300 10 60 10000"

# Set maxmemory policy
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Tune Worker Intervals

Adjust intervals based on needs:

```typescript
// src/workers/metric-aggregation.worker.ts
this.interval = 10 * 60 * 1000; // 10 minutes instead of 5

// src/workers/alert-evaluation.worker.ts  
this.interval = 120 * 1000; // 2 minutes instead of 1
```

### Scale Horizontally

**Kubernetes:**
```bash
kubectl scale deployment monitoring-service --replicas=3
```

**Docker Swarm:**
```bash
docker service scale monitoring-service=3
```

## Incident Response

### Critical Service Down

**Priority:** P0 - Critical

**Response:**

1. **Immediate (< 5 min):**
   - Acknowledge alert
   - Check service status
   - Attempt automatic restart

2. **Short-term (5-15 min):**
   - Review logs for root cause
   - Check dependencies
   - Implement temporary fix

3. **Resolution:**
   - Apply permanent fix
   - Verify service healthy
   - Document incident

4. **Post-mortem (**within 48 hours):**
   - Write incident report
   - Identify improvements
   - Update runbooks

### Data Loss Risk

**Priority:** P0 - Critical

**Response:**

1. **Stop the bleeding:**
   - Isolate affected components
   - Enable read-only mode if possible
   - Stop writes to corrupted data

2. **Assess damage:**
   - Identify affected data
   - Check backup availability
   - Estimate recovery time

3. **Recover:**
   - Restore from backup
   - Replay transactions if needed
   - Verify data integrity

4. **Verify:**
   - Run data validation
   - Check application functionality
   - Monitor closely

### Performance Degradation

**Priority:** P1 - High

**Response:**

1. **Identify bottleneck:**
   - Check CPU, memory, disk I/O  
   - Review database slow queries
   - Check network latency

2. **Quick wins:**
   - Clear caches
   - Scale up resources temporarily
   - Kill slow queries

3. **Long-term:**
   - Optimize queries
   - Add indexes
   - Refactor code

## On-Call Procedures

### Handoff Checklist

When going on-call:

- [ ] Verify phone notifications working
- [ ] Test VPN access
- [ ] Review current alerts
- [ ] Check recent incidents
- [ ] Review escalation contacts
- [ ] Ensure laptop charged and ready

When going off-call:

- [ ] Brief next on-call person
- [ ] Document any ongoing issues
- [ ] Hand over open incidents
- [ ] Update runbooks if needed

### Escalation Contacts

**Business Hours (9 AM - 6 PM):**
- On-Call Engineer: oncall@tickettoken.com
- Team Lead: teamlead@tickettoken.com

**After Hours:**
- On-Call Engineer (Primary): +1-555-0001
- On-Call Engineer (Backup): +1-555-0002
- Engineering Manager: +1-555-0100

**Emergency (P0 incidents):**
- CTO: +1-555-0200
- CEO: +1-555-0300

## Useful Commands Reference

### Docker

```bash
# View logs
docker logs -f monitoring-service

# Execute command in container
docker exec -it monitoring-service bash

# Restart service
docker restart monitoring-service

# Check resource usage
docker stats monitoring-service
```

### Kubernetes

```bash
# Get pods
kubectl get pods -n tickettoken-monitoring

# View logs
kubectl logs -f deployment/monitoring-service -n tickettoken-monitoring

# Execute command
kubectl exec -it deployment/monitoring-service -n tickettoken-monitoring -- bash

# Port forward
kubectl port-forward svc/monitoring-service 3017:3017 -n tickettoken-monitoring
```

### Database

```bash
# Connect to database
psql $DATABASE_URL

# Check connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity"

# Check database size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size('monitoring_prod'))"
```

### Monitoring

```bash
# Check health
curl http://localhost:3017/health | jq

# Get metrics
curl http://localhost:3017/metrics

# Check alerts
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3017/api/alerts | jq
```

## Support Contact

**For operational issues:**
- Slack: #monitoring-support
- Email: ops@tickettoken.com
- PagerDuty: Monitoring Service

**For questions:**
- Documentation: `/docs`
- Runbook: This document
- API Docs: `/docs/API.md`

---

**Last Updated:** 2025-11-18  
**Maintainer:** DevOps Team
