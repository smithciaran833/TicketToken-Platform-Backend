# Rollback Procedure

## Overview

This runbook documents rollback procedures for the ticket-service when a deployment causes issues.

## Decision Matrix

| Severity | Symptoms | Action |
|----------|----------|--------|
| P1 Critical | All purchases failing | Immediate rollback |
| P2 High | >5% error rate | Rollback within 15 min |
| P3 Medium | Performance degradation | Investigate, then decide |
| P4 Low | Minor bugs | Fix forward preferred |

## Pre-Rollback Checklist

- [ ] Identify the problematic deployment/commit
- [ ] Confirm rollback target version is stable
- [ ] Check for database migration dependencies
- [ ] Notify on-call team and stakeholders
- [ ] Prepare to monitor post-rollback

## Kubernetes Rollback

### Rollback to Previous Version

```bash
# View deployment history
kubectl rollout history deployment/ticket-service -n production

# Rollback to previous revision
kubectl rollout undo deployment/ticket-service -n production

# Monitor rollback progress
kubectl rollout status deployment/ticket-service -n production
```

### Rollback to Specific Revision

```bash
# View available revisions with details
kubectl rollout history deployment/ticket-service -n production --revision=5

# Rollback to specific revision
kubectl rollout undo deployment/ticket-service -n production --to-revision=5

# Verify the rollback
kubectl describe deployment ticket-service -n production | grep Image
```

### Rollback Using Image Tag

```bash
# Set specific image version
kubectl set image deployment/ticket-service \
  ticket-service=registry.example.com/ticket-service:v1.2.3 \
  -n production

# Or patch the deployment
kubectl patch deployment ticket-service -n production -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"ticket-service","image":"registry.example.com/ticket-service:v1.2.3"}]}}}}'
```

## Docker Compose Rollback

```bash
# Pull specific version
docker pull registry.example.com/ticket-service:v1.2.3

# Update and restart
docker-compose up -d ticket-service

# Or edit docker-compose.yml and restart
vim docker-compose.yml  # Change image tag
docker-compose up -d ticket-service
```

## Database Migration Rollback

⚠️ **WARNING**: Database rollbacks can cause data loss. Proceed with caution.

### Check Migration Status

```bash
# Connect to database
psql -h $DB_HOST -U $DB_USER -d tickettoken

# Check applied migrations
SELECT * FROM schema_migrations ORDER BY applied_at DESC LIMIT 10;
```

### Rollback Last Migration

```bash
# View current migration
npm run migrate:status

# Rollback one migration
npm run migrate:rollback

# Rollback multiple migrations
npm run migrate:rollback -- --step=3
```

### Manual Migration Rollback

If automated rollback fails:

```sql
-- Example: Rollback column addition
BEGIN;

-- Remove new column
ALTER TABLE tickets DROP COLUMN IF EXISTS new_column;

-- Update migration record
DELETE FROM schema_migrations WHERE name = '008_add_new_column';

COMMIT;
```

## Feature Flag Rollback

For features behind flags, disable without full rollback:

```bash
# Disable feature via environment variable
kubectl set env deployment/ticket-service \
  FEATURE_NEW_CHECKOUT=false \
  -n production

# Or via ConfigMap
kubectl patch configmap ticket-service-config -n production -p \
  '{"data":{"FEATURE_NEW_CHECKOUT":"false"}}'
kubectl rollout restart deployment/ticket-service -n production
```

## Post-Rollback Verification

### 1. Health Checks

```bash
# Check all health endpoints
curl http://ticket-service.production/health
curl http://ticket-service.production/health/ready
curl http://ticket-service.production/health/live

# Expected: All return 200
```

### 2. Functional Verification

```bash
# Test ticket listing
curl -H "Authorization: Bearer $TOKEN" \
  http://ticket-service.production/api/v1/tickets

# Test reservation (use test event)
curl -X POST http://ticket-service.production/api/v1/tickets/reserve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventId":"test-event-id","tickets":[{"ticketTypeId":"test-type","quantity":1}]}'
```

### 3. Metrics Verification

```bash
# Check error rate
curl -s http://prometheus:9090/api/v1/query \
  --data-urlencode 'query=rate(http_request_errors_total{service="ticket-service"}[5m])' | jq

# Check latency
curl -s http://prometheus:9090/api/v1/query \
  --data-urlencode 'query=histogram_quantile(0.99, http_request_duration_seconds{service="ticket-service"})' | jq
```

### 4. Log Analysis

```bash
# Check for errors post-rollback
kubectl logs -l app=ticket-service -n production --since=10m | grep -i error

# Count error occurrences
kubectl logs -l app=ticket-service -n production --since=10m | grep -c ERROR
```

## Rollback Scenarios

### Scenario 1: API Breaking Change

```bash
# Symptoms: 400/500 errors from clients
# Action: Immediate rollback

kubectl rollout undo deployment/ticket-service -n production
# Then fix API compatibility in new version
```

### Scenario 2: Performance Regression

```bash
# Symptoms: High latency, timeouts
# Action: Rollback and investigate

kubectl rollout undo deployment/ticket-service -n production
# Review APM traces for slow queries/calls
```

### Scenario 3: Memory Leak

```bash
# Symptoms: OOM kills, increasing memory usage
# Action: Rollback and profile

kubectl rollout undo deployment/ticket-service -n production
# Review memory dumps, heap snapshots
```

### Scenario 4: Database Corruption

```bash
# Symptoms: Data inconsistencies, constraint violations
# Action: Rollback app and migration carefully

# 1. Stop traffic
kubectl scale deployment/ticket-service --replicas=0 -n production

# 2. Assess damage
psql -c "SELECT * FROM tickets WHERE status = 'invalid';"

# 3. Rollback migration if needed
npm run migrate:rollback

# 4. Fix data manually if required
# 5. Rollback application
kubectl rollout undo deployment/ticket-service -n production

# 6. Restore traffic
kubectl scale deployment/ticket-service --replicas=3 -n production
```

## Communication Template

```
Subject: [INCIDENT] Ticket Service Rollback - [Date/Time]

Status: ROLLBACK IN PROGRESS / COMPLETED

Affected Service: ticket-service
Previous Version: v1.3.0
Rollback Version: v1.2.3

Reason: [Brief description of issue]

Impact: [User impact description]

Timeline:
- HH:MM - Issue detected
- HH:MM - Rollback initiated
- HH:MM - Rollback completed
- HH:MM - Service verified healthy

Next Steps:
- [ ] Root cause analysis
- [ ] Fix implementation
- [ ] Staged rollout plan

Contact: [On-call engineer]
```

## Prevention

- Always run migrations in staging first
- Use feature flags for gradual rollout
- Implement canary deployments
- Monitor error rates during deployment
- Have rollback plan ready before deploying
