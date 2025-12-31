# Rollback Procedures

## Overview

This document describes rollback procedures for the auth-service in case of deployment failures or critical issues.

## Quick Reference

| Scenario | Command | Time to Recovery |
|----------|---------|------------------|
| Application rollback | `kubectl rollout undo deployment/auth-service` | ~2 minutes |
| Database rollback | `npm run migrate:rollback` | ~5 minutes |
| Full rollback | See "Full Rollback Procedure" below | ~10 minutes |

## Pre-Rollback Checklist

Before initiating a rollback:

1. [ ] Confirm the issue is deployment-related (not external dependency)
2. [ ] Notify on-call team in #incidents Slack channel
3. [ ] Check current deployment status: `kubectl rollout status deployment/auth-service`
4. [ ] Identify the last known good version

## Application Rollback

### Kubernetes Rollback (Preferred)
```bash
# View rollout history
kubectl rollout history deployment/auth-service -n production

# Rollback to previous version
kubectl rollout undo deployment/auth-service -n production

# Rollback to specific revision
kubectl rollout undo deployment/auth-service -n production --to-revision=<N>

# Verify rollback
kubectl rollout status deployment/auth-service -n production
```

### Docker/Container Rollback

If not using Kubernetes:
```bash
# Stop current container
docker stop auth-service

# Start previous version
docker run -d --name auth-service \
  -e DATABASE_URL=$DATABASE_URL \
  -e REDIS_URL=$REDIS_URL \
  ghcr.io/tickettoken/auth-service:<previous-tag>
```

## Database Rollback

### Using Knex Migrations
```bash
# Rollback last migration batch
npm run migrate:rollback

# Rollback all migrations (CAUTION: destroys all data)
npm run migrate:rollback --all

# Check current migration status
npx knex migrate:status --knexfile knexfile.ts
```

### Point-in-Time Recovery (PostgreSQL)

For major issues requiring data restoration:
```bash
# 1. Stop application traffic
kubectl scale deployment/auth-service --replicas=0

# 2. Restore from backup (example using pg_restore)
pg_restore -h $DB_HOST -U $DB_USER -d auth_db_restored backup.dump

# 3. Verify data integrity
psql -h $DB_HOST -U $DB_USER -d auth_db_restored -c "SELECT COUNT(*) FROM users;"

# 4. Swap databases (coordinate with DBA)

# 5. Restart application
kubectl scale deployment/auth-service --replicas=3
```

## Full Rollback Procedure

### Step 1: Stop Traffic
```bash
# Scale down or route traffic away
kubectl scale deployment/auth-service --replicas=0 -n production
```

### Step 2: Rollback Application
```bash
kubectl rollout undo deployment/auth-service -n production
```

### Step 3: Rollback Database (if needed)
```bash
# Connect to production and rollback
DATABASE_URL=$PRODUCTION_DATABASE_URL npm run migrate:rollback
```

### Step 4: Restore Traffic
```bash
kubectl scale deployment/auth-service --replicas=3 -n production
```

### Step 5: Verify
```bash
# Check health endpoints
curl https://api.tickettoken.com/auth/health/ready

# Check logs for errors
kubectl logs -l app=auth-service -n production --tail=100

# Monitor metrics
# Check Grafana dashboard for error rates
```

## Rollback Verification Checklist

After rollback, verify:

- [ ] `/health/live` returns 200
- [ ] `/health/ready` returns 200
- [ ] Login flow works (test user)
- [ ] Token refresh works
- [ ] Error rate < 1% in Grafana
- [ ] No new errors in logs

## Emergency Contacts

| Role | Contact | Escalation Time |
|------|---------|-----------------|
| On-Call Engineer | PagerDuty | Immediate |
| Platform Lead | @platform-lead | 15 minutes |
| Database Admin | @dba-team | 15 minutes |
| Security (if breach) | @security | Immediate |

## Post-Rollback

1. Create incident ticket
2. Schedule post-mortem within 48 hours
3. Document root cause
4. Create follow-up tasks to prevent recurrence

## Rollback Testing

Rollbacks should be tested quarterly:
```bash
# In staging environment
npm run migrate           # Apply migrations
npm run migrate:rollback  # Test rollback
npm run migrate           # Re-apply

# Verify no data loss
npm test -- --grep "migration"
```

Last tested: ____________
Tested by: ____________
Result: ____________
