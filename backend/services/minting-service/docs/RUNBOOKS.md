# Operations Runbooks

This document contains operational procedures for the minting service.

## Table of Contents

1. [Deployment](#deployment)
2. [Rollback Procedures](#rollback-procedures)
3. [Incident Response](#incident-response)
4. [Common Issues](#common-issues)
5. [Monitoring Alerts](#monitoring-alerts)

---

## Deployment

### Pre-Deployment Checklist

- [ ] All tests passing in CI
- [ ] Security scan completed
- [ ] CHANGELOG updated
- [ ] Database migrations reviewed
- [ ] Rollback plan documented
- [ ] On-call engineer notified

### Standard Deployment (Kubernetes)

```bash
# 1. Build and push new image
docker build -t minting-service:v1.2.0 .
docker tag minting-service:v1.2.0 registry.example.com/minting-service:v1.2.0
docker push registry.example.com/minting-service:v1.2.0

# 2. Update deployment
kubectl set image deployment/minting-service \
  minting-service=registry.example.com/minting-service:v1.2.0 \
  -n production

# 3. Monitor rollout
kubectl rollout status deployment/minting-service -n production

# 4. Verify health
curl -s https://minting-api.example.com/health | jq
```

### Blue-Green Deployment

```bash
# 1. Deploy to green environment
kubectl apply -f k8s/green-deployment.yaml

# 2. Run smoke tests against green
./scripts/smoke-test.sh https://minting-green.internal

# 3. Switch traffic to green
kubectl patch service minting-service \
  -p '{"spec":{"selector":{"version":"green"}}}'

# 4. Monitor for 15 minutes

# 5. Scale down blue (if successful)
kubectl scale deployment/minting-service-blue --replicas=0
```

### Database Migration Deployment

```bash
# 1. Take database backup FIRST
pg_dump -h $DB_HOST -U $DB_USER minting > backup-$(date +%Y%m%d).sql

# 2. Run migrations in maintenance window
npm run migrate

# 3. Verify migration success
psql -h $DB_HOST -U $DB_USER -c "SELECT * FROM knex_migrations ORDER BY id DESC LIMIT 5;"

# 4. Deploy application
kubectl rollout restart deployment/minting-service
```

---

## Rollback Procedures

### Quick Rollback (Kubernetes)

**Time to execute: 2-5 minutes**

```bash
# 1. Check rollout history
kubectl rollout history deployment/minting-service -n production

# 2. Rollback to previous version
kubectl rollout undo deployment/minting-service -n production

# 3. Or rollback to specific revision
kubectl rollout undo deployment/minting-service -n production --to-revision=3

# 4. Verify rollback
kubectl rollout status deployment/minting-service -n production
```

### Rollback with Database Changes

**Time to execute: 10-30 minutes**

If the deployment included database migrations:

```bash
# 1. PAUSE all minting operations
curl -X POST https://minting-api.example.com/admin/queue/pause \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 2. Wait for in-flight jobs to complete
watch 'kubectl exec -it $(kubectl get pod -l app=minting-service -o name | head -1) -- \
  curl -s localhost:3000/admin/queue/stats | jq'

# 3. Rollback application
kubectl rollout undo deployment/minting-service -n production

# 4. Rollback migration (if needed)
npm run migrate:rollback

# 5. Resume queue
curl -X POST https://minting-api.example.com/admin/queue/resume \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Emergency Rollback

**Use when: Service is completely down**

```bash
# 1. Immediately rollback deployment
kubectl rollout undo deployment/minting-service -n production

# 2. Scale up emergency pods
kubectl scale deployment/minting-service -n production --replicas=5

# 3. Check logs for cause
kubectl logs -l app=minting-service -n production --tail=100

# 4. Notify incident channel
# Post in #incidents Slack channel
```

### Rollback Decision Tree

```
Is the service responding to health checks?
├── YES: Is error rate > 5%?
│   ├── YES: Proceed with quick rollback
│   └── NO: Monitor for 15 minutes
└── NO: Emergency rollback immediately
```

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| SEV1 | Service down | 5 minutes | All minting failed |
| SEV2 | Major degradation | 15 minutes | >50% mint failures |
| SEV3 | Minor issues | 1 hour | Slow response times |
| SEV4 | Low impact | 24 hours | Non-critical bugs |

### SEV1: Complete Service Outage

```bash
# 1. Acknowledge incident
# Page on-call, post in #incidents

# 2. Quick diagnostics (2 min max)
kubectl get pods -n production -l app=minting-service
kubectl logs -l app=minting-service --tail=50
curl -s https://minting-api.example.com/health

# 3. Immediate mitigation
# Option A: Rollback
kubectl rollout undo deployment/minting-service

# Option B: Scale up
kubectl scale deployment/minting-service --replicas=10

# Option C: Restart
kubectl rollout restart deployment/minting-service

# 4. Verify recovery
for i in {1..10}; do
  curl -s https://minting-api.example.com/health | jq '.status'
  sleep 5
done

# 5. Post-incident
# - Update status page
# - Write incident report
# - Schedule postmortem
```

### SEV2: High Error Rate

```bash
# 1. Check error patterns
kubectl logs -l app=minting-service --tail=200 | grep ERROR

# 2. Check queue health
curl -s https://minting-api.example.com/admin/queue/stats

# 3. Check external dependencies
curl -s https://minting-api.example.com/health/detailed | jq

# 4. Common fixes:
# - Solana RPC issues: Switch to fallback RPC
kubectl set env deployment/minting-service \
  SOLANA_RPC_ENDPOINT=$FALLBACK_RPC_URL

# - IPFS issues: Enable failover
kubectl set env deployment/minting-service \
  IPFS_FAILOVER_ENABLED=true

# - Database connection issues: Check PgBouncer
kubectl exec -it pgbouncer-0 -- pgbouncer -R
```

### Communication Templates

**Status Page Update:**
```
[INVESTIGATING] Minting Service Degradation
We are investigating reports of delayed minting operations.
Started: 2026-01-02 16:00 UTC
Impact: Some ticket minting requests may be delayed
```

**Resolution:**
```
[RESOLVED] Minting Service Degradation
The issue has been resolved. Minting operations are functioning normally.
Duration: 45 minutes
Root Cause: Database connection pool exhaustion
```

---

## Common Issues

### Issue: Jobs Stuck in Queue

**Symptoms:** Queue waiting count increasing, no completed jobs

**Diagnosis:**
```bash
# Check queue stats
curl -s localhost:3000/admin/queue/stats | jq

# Check for stale jobs
curl -s localhost:3000/admin/queue/stale

# Check worker status
curl -s localhost:3000/health/detailed | jq '.components.queue'
```

**Resolution:**
```bash
# 1. Force retry stale jobs
curl -X POST localhost:3000/admin/queue/retry-stale

# 2. Or restart workers
kubectl rollout restart deployment/minting-worker
```

### Issue: Insufficient Wallet Balance

**Symptoms:** Mints failing with "Insufficient balance" error

**Diagnosis:**
```bash
# Check wallet balance
curl -s localhost:3000/health/solana | jq '.wallet'

# Check spending rate
curl -s localhost:3000/metrics | grep minting_sol_spent
```

**Resolution:**
```bash
# 1. Transfer SOL from treasury
solana transfer $MINTING_WALLET 5 --from treasury.json

# 2. Verify balance restored
curl -s localhost:3000/health/solana | jq '.wallet.balance'
```

### Issue: Solana RPC Rate Limited

**Symptoms:** 429 errors, slow response times

**Diagnosis:**
```bash
# Check circuit breaker
curl -s localhost:3000/health/detailed | jq '.components.circuitBreakers'

# Check RPC metrics
curl -s localhost:3000/metrics | grep rpc
```

**Resolution:**
```bash
# 1. Switch to fallback RPC
kubectl set env deployment/minting-service \
  SOLANA_RPC_ENDPOINT=$FALLBACK_RPC

# 2. Or reduce concurrency
kubectl set env deployment/minting-service \
  MINT_CONCURRENCY=2
```

### Issue: IPFS Upload Failures

**Symptoms:** Metadata upload errors, CID verification failures

**Diagnosis:**
```bash
# Check IPFS health
curl -s localhost:3000/health/detailed | jq '.components.ipfs'

# Check Pinata status
curl -s https://api.pinata.cloud/data/testAuthentication \
  -H "Authorization: Bearer $PINATA_JWT"
```

**Resolution:**
```bash
# 1. Enable failover to NFT.Storage
kubectl set env deployment/minting-service \
  IPFS_FAILOVER_ENABLED=true

# 2. Clear IPFS cache
curl -X POST localhost:3000/admin/cache/clear?prefix=ipfs
```

---

## Monitoring Alerts

### Alert: High Queue Depth

**Threshold:** > 1000 waiting jobs for 5 minutes

**Actions:**
1. Check if workers are processing
2. Check for external dependency issues
3. Scale up workers if needed

```bash
kubectl scale deployment/minting-worker --replicas=5
```

### Alert: High Error Rate

**Threshold:** > 5% error rate for 5 minutes

**Actions:**
1. Check logs for error patterns
2. Check external dependencies
3. Consider rollback if recent deployment

### Alert: Low Wallet Balance

**Threshold:** < 1 SOL

**Actions:**
1. Transfer SOL from treasury immediately
2. Investigate if spending is abnormal

### Alert: High Event Loop Lag

**Threshold:** > 100ms for 5 minutes

**Actions:**
1. Check CPU usage
2. Profile for CPU-bound operations
3. Scale horizontally if needed

### Prometheus Alert Rules

```yaml
groups:
  - name: minting-service
    rules:
      - alert: HighQueueDepth
        expr: minting_queue_depth{state="waiting"} > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High queue depth
          
      - alert: HighErrorRate
        expr: rate(minting_errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
          
      - alert: LowWalletBalance
        expr: minting_wallet_balance_sol < 1
        for: 1m
        labels:
          severity: critical
          
      - alert: HighEventLoopLag
        expr: minting_event_loop_lag_ms > 100
        for: 5m
        labels:
          severity: warning
```

---

## Useful Commands

### Quick Status Check

```bash
# Full health
curl -s localhost:3000/health/detailed | jq

# Queue status
curl -s localhost:3000/admin/queue/stats | jq

# Recent errors
kubectl logs -l app=minting-service --tail=50 | grep ERROR
```

### Performance Investigation

```bash
# Check metrics
curl -s localhost:3000/metrics | grep -E 'minting_(duration|queue)'

# Check database queries
kubectl exec -it postgres-0 -- psql -c "SELECT * FROM pg_stat_activity WHERE application_name LIKE 'minting%';"

# Check Redis memory
kubectl exec -it redis-0 -- redis-cli INFO memory
```
