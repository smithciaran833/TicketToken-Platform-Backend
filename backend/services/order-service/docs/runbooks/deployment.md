# Order Service Deployment Runbook

## Prerequisites

- [ ] Access to Kubernetes cluster
- [ ] kubectl configured with correct context
- [ ] Docker registry access
- [ ] Database credentials available
- [ ] All environment variables documented

## Pre-Deployment Checklist

### 1. Code Review
- [ ] All PRs approved and merged to main
- [ ] All tests passing in CI
- [ ] Coverage thresholds met (80%+ overall)
- [ ] No critical security vulnerabilities

### 2. Database Migrations
- [ ] Review pending migrations
- [ ] Test migrations on staging
- [ ] Verify rollback scripts exist
- [ ] Create database backup (for production)

```bash
# Check pending migrations
cd backend/services/order-service
npm run migrate:status

# Run migrations (staging first)
npm run migrate:latest
```

### 3. Configuration Review
- [ ] Environment variables updated
- [ ] Secrets rotated if needed
- [ ] Feature flags configured
- [ ] Rate limits appropriate

## Deployment Steps

### Step 1: Build Docker Image

```bash
# Build the image
docker build -t tickettoken/order-service:${VERSION} .

# Tag for registry
docker tag tickettoken/order-service:${VERSION} \
  registry.example.com/tickettoken/order-service:${VERSION}

# Push to registry
docker push registry.example.com/tickettoken/order-service:${VERSION}
```

### Step 2: Deploy to Staging

```bash
# Update staging deployment
kubectl -n staging set image deployment/order-service \
  order-service=registry.example.com/tickettoken/order-service:${VERSION}

# Watch rollout
kubectl -n staging rollout status deployment/order-service

# Verify health
curl https://staging.order-service.internal/health/ready
```

### Step 3: Run Smoke Tests on Staging

```bash
# Run integration tests against staging
npm run test:integration:staging

# Manual verification checklist:
# - [ ] Create order
# - [ ] View order
# - [ ] Process refund
# - [ ] Check health endpoints
```

### Step 4: Deploy to Production

```bash
# Update production deployment
kubectl -n production set image deployment/order-service \
  order-service=registry.example.com/tickettoken/order-service:${VERSION}

# Watch rollout (with timeout)
kubectl -n production rollout status deployment/order-service --timeout=300s

# Verify pods are running
kubectl -n production get pods -l app=order-service
```

### Step 5: Post-Deployment Verification

```bash
# Check health
curl https://order-service.internal/health/ready
curl https://order-service.internal/health

# Check metrics
curl https://order-service.internal/metrics | grep order_

# Verify logs
kubectl -n production logs -l app=order-service --tail=100
```

## Monitoring After Deployment

### Key Metrics to Watch (15-30 minutes)

1. **Error Rate**
   - Should be < 0.1% for 5xx errors
   - Alert if > 1%

2. **Response Time**
   - p50 < 100ms
   - p99 < 500ms

3. **Order Success Rate**
   - Should be > 99%

4. **Database Connections**
   - Should not exceed pool limit

### Grafana Dashboards
- Order Service Overview: `/d/order-service/overview`
- Order Processing: `/d/order-service/processing`

## Rollback Procedure

See [rollback.md](./rollback.md) for detailed rollback procedures.

Quick rollback:
```bash
kubectl -n production rollout undo deployment/order-service
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl -n production describe pod -l app=order-service

# Check events
kubectl -n production get events --sort-by='.lastTimestamp'

# Common issues:
# - Image pull failed: Check registry credentials
# - Readiness probe failing: Check database/Redis connectivity
# - OOM killed: Increase memory limits
```

### High Error Rate

```bash
# Check recent logs
kubectl -n production logs -l app=order-service --since=5m | grep -i error

# Check dependent services
curl https://payment-service.internal/health/ready
curl https://ticket-service.internal/health/ready
```

### Database Connection Issues

```bash
# Check connection count
SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE '%order%';

# Check for locks
SELECT * FROM pg_locks WHERE granted = false;
```

## Emergency Contacts

| Role | Contact | Escalation Time |
|------|---------|-----------------|
| On-call Engineer | PagerDuty | Immediate |
| Platform Team | #platform-team | 5 minutes |
| Database Admin | #dba-team | 10 minutes |
