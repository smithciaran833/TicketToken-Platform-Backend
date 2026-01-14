# Compliance Service Deployment Guide

**AUDIT FIX: DEP-M3** - Deployment strategy documentation

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Deployment Strategies](#deployment-strategies)
3. [Environment Configuration](#environment-configuration)
4. [Database Migrations](#database-migrations)
5. [Rollback Procedures](#rollback-procedures)
6. [Health Checks](#health-checks)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- Docker 20.10+
- kubectl 1.25+
- Helm 3.10+
- PostgreSQL client (psql)
- Node.js 20 LTS

### Required Access

- Kubernetes cluster access (staging/production)
- Container registry credentials
- AWS Secrets Manager access
- Database credentials
- Monitoring dashboards

---

## Deployment Strategies

### Blue-Green Deployment

The compliance service uses blue-green deployment for zero-downtime releases.

```yaml
# Current production: blue
# New version: green

Steps:
1. Deploy green version alongside blue
2. Run smoke tests against green
3. Switch traffic to green
4. Monitor for 15 minutes
5. Decommission blue (keep for 24h rollback)
```

### Canary Deployment

For high-risk changes, use canary deployment:

```yaml
# Phase 1: 5% traffic to canary
# Phase 2: 25% traffic (after 30min if healthy)
# Phase 3: 50% traffic (after 1hr if healthy)
# Phase 4: 100% traffic (after 2hr if healthy)
```

### Deployment Commands

```bash
# Build and push image
docker build -t tickettoken/compliance-service:${VERSION} .
docker push tickettoken/compliance-service:${VERSION}

# Deploy to staging
kubectl apply -f k8s/deployment.yaml -n tickettoken-staging

# Deploy to production (blue-green)
kubectl apply -f k8s/deployment.yaml -n tickettoken-prod

# Canary deployment
helm upgrade compliance-service ./helm/compliance-service \
  --set canary.enabled=true \
  --set canary.weight=5
```

---

## Environment Configuration

### Staging Environment

```yaml
Replicas: 2
Resources:
  CPU: 100m-250m
  Memory: 256Mi-384Mi
Database: staging-compliance-db
Redis: staging-redis
Feature Flags:
  - DETAILED_HEALTH_CHECKS: true
  - METRICS_ENDPOINT: true
  - LOAD_SHEDDING: true
```

### Production Environment

```yaml
Replicas: 3-10 (HPA)
Resources:
  CPU: 100m-500m
  Memory: 256Mi-512Mi
Database: prod-compliance-db (RDS)
Redis: prod-redis (ElastiCache)
Feature Flags:
  - DETAILED_HEALTH_CHECKS: true
  - METRICS_ENDPOINT: true
  - LOAD_SHEDDING: true
  - BULKHEAD_PATTERN: true
```

### Secrets Management

All secrets are stored in AWS Secrets Manager:

```bash
# Fetch secrets
aws secretsmanager get-secret-value \
  --secret-id compliance-service/production \
  --query SecretString --output text

# Required secrets:
# - DATABASE_URL
# - REDIS_URL
# - JWT_SECRET
# - WEBHOOK_SECRET
# - STRIPE_WEBHOOK_SECRET
```

---

## Database Migrations

### Pre-Deployment Migration

Migrations run before deployment:

```bash
# Check pending migrations
npm run migrate:status

# Run migrations (dry run)
npm run migrate:dry

# Run migrations
npm run migrate:up

# Rollback if needed
npm run migrate:down
```

### Migration Safety

1. **lock_timeout**: Set to 10s to prevent blocking
2. **statement_timeout**: Set to 60s for long-running queries
3. **CONCURRENTLY**: Use for index creation
4. **Backwards Compatible**: Never drop columns in first migration

### Migration Checklist

- [ ] Migration tested in staging
- [ ] Rollback script tested
- [ ] No breaking schema changes
- [ ] Indexes created CONCURRENTLY
- [ ] lock_timeout configured
- [ ] DBA review (for production)

---

## Rollback Procedures

### Application Rollback

```bash
# View deployment history
kubectl rollout history deployment/compliance-service -n tickettoken-prod

# Rollback to previous version
kubectl rollout undo deployment/compliance-service -n tickettoken-prod

# Rollback to specific revision
kubectl rollout undo deployment/compliance-service \
  --to-revision=N -n tickettoken-prod
```

### Database Rollback

```bash
# View migration history
npm run migrate:status

# Rollback last migration
npm run migrate:down

# Rollback to specific version
npm run migrate:rollback --to 20260101_previous_migration
```

### Emergency Rollback

For critical issues:

```bash
# 1. Scale down new version
kubectl scale deployment/compliance-service --replicas=0 -n tickettoken-prod

# 2. Redeploy previous version
kubectl set image deployment/compliance-service \
  compliance-service=tickettoken/compliance-service:${PREVIOUS_VERSION}

# 3. Scale up
kubectl scale deployment/compliance-service --replicas=3 -n tickettoken-prod
```

---

## Health Checks

### Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `/health/live` | Liveness probe | 200 OK |
| `/health/ready` | Readiness probe | 200 OK with dependencies |
| `/metrics` | Prometheus metrics | Prometheus format |

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3008
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3008
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 5
  failureThreshold: 3

startupProbe:
  httpGet:
    path: /health/live
    port: 3008
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 30
```

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2026-01-03T23:00:00.000Z",
  "version": "1.0.0",
  "uptime": 86400,
  "components": {
    "database": { "status": "healthy", "latency": "2ms" },
    "redis": { "status": "healthy", "latency": "1ms" },
    "memory": { "status": "healthy", "used": "45%" },
    "cpu": { "status": "healthy", "load": "0.3" }
  }
}
```

---

## Monitoring

### Key Metrics

| Metric | Threshold | Alert |
|--------|-----------|-------|
| `http_request_duration_seconds` | p99 < 500ms | Warning if exceeded |
| `http_requests_total` | N/A | Track rate |
| `error_rate` | < 1% | Critical if exceeded |
| `database_connection_pool_size` | < 90% | Warning if exceeded |
| `redis_connection_errors` | 0 | Critical if > 0 |

### Dashboards

1. **Service Health**: [Grafana Dashboard](https://grafana.tickettoken.io/d/compliance)
2. **Error Tracking**: [Sentry Project](https://sentry.io/tickettoken/compliance)
3. **Logs**: [CloudWatch Logs](https://console.aws.amazon.com/cloudwatch/)

### Alerts

```yaml
Critical:
  - Service down (no healthy pods)
  - Error rate > 5%
  - Database connection failures

Warning:
  - p99 latency > 500ms
  - Error rate > 1%
  - Memory usage > 85%
  - Pod restarts > 3 in 10min
```

---

## Troubleshooting

### Common Issues

#### 1. Pod Not Starting

```bash
# Check pod status
kubectl describe pod -l app=compliance-service -n tickettoken-prod

# Check logs
kubectl logs -l app=compliance-service -n tickettoken-prod --tail=100

# Common causes:
# - Missing secrets
# - Database connection issues
# - Image pull errors
```

#### 2. High Latency

```bash
# Check database connections
kubectl exec -it <pod> -- npm run db:status

# Check Redis connections
kubectl exec -it <pod> -- npm run redis:ping

# Check for slow queries
# Review database metrics in RDS console
```

#### 3. Memory Issues

```bash
# Check memory usage
kubectl top pods -l app=compliance-service -n tickettoken-prod

# Enable memory profiling
kubectl exec -it <pod> -- node --inspect dist/index.js

# Solutions:
# - Increase memory limits
# - Check for memory leaks
# - Review bulkhead settings
```

#### 4. Database Migration Failures

```bash
# Check migration status
npm run migrate:status

# View migration logs
kubectl logs <pod> | grep migration

# Manual rollback if needed
npm run migrate:down --step 1

# Verify database state
psql $DATABASE_URL -c "SELECT * FROM knex_migrations ORDER BY id DESC LIMIT 5"
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing in CI
- [ ] Security scan completed
- [ ] Code review approved
- [ ] Staging deployment tested
- [ ] Database migrations reviewed
- [ ] Secrets updated (if needed)
- [ ] Monitoring alerts configured
- [ ] Rollback plan documented

### During Deployment

- [ ] Deploy to staging first
- [ ] Run smoke tests
- [ ] Monitor error rates
- [ ] Check latency metrics
- [ ] Verify health endpoints
- [ ] Test critical paths

### Post-Deployment

- [ ] Verify production health
- [ ] Monitor for 30 minutes
- [ ] Check error tracking
- [ ] Update deployment log
- [ ] Notify team of completion

---

## Contact

- **On-Call Engineer**: PagerDuty rotation
- **Platform Team**: #platform-team Slack
- **Security Issues**: security@tickettoken.io
