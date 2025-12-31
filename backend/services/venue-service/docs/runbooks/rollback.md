# Deployment Rollback Procedures

**Document Owner:** Platform Team  
**Last Updated:** 2025-01-01  
**Review Cycle:** Quarterly

## Overview

This runbook documents procedures for rolling back venue-service deployments when issues are detected post-deployment.

---

## Quick Reference

| Scenario | Rollback Method | RTO |
|----------|----------------|-----|
| Application bug | Kubernetes rollback | < 5 min |
| Database migration issue | Migration down + app rollback | 15-30 min |
| Configuration error | ConfigMap/Secret rollback | < 5 min |
| Feature flag issue | Toggle flag off | < 1 min |

---

## 1. Application Rollback (No Database Changes)

### Trigger Conditions
- Elevated error rates (> 1% 5xx responses)
- P50 latency increase > 50%
- Critical functionality broken
- Memory leaks detected

### Procedure

#### Step 1: Identify Current and Previous Revision
```bash
# List deployment history
kubectl rollout history deployment/venue-service -n tickettoken

# Check current revision
kubectl describe deployment/venue-service -n tickettoken | grep Revision
```

#### Step 2: Rollback to Previous Version
```bash
# Rollback to previous revision
kubectl rollout undo deployment/venue-service -n tickettoken

# Or rollback to specific revision
kubectl rollout undo deployment/venue-service -n tickettoken --to-revision=<N>

# Monitor rollback progress
kubectl rollout status deployment/venue-service -n tickettoken
```

#### Step 3: Verify Rollback
```bash
# Check pods are running
kubectl get pods -l app=venue-service -n tickettoken

# Check logs for errors
kubectl logs -l app=venue-service -n tickettoken --tail=100

# Verify health endpoint
curl -s https://api.tickettoken.com/api/venues/health | jq .
```

#### Step 4: Post-Rollback
1. Create incident ticket
2. Notify stakeholders in #deployments Slack channel
3. Investigate root cause
4. Create fix and deploy to staging first

---

## 2. Database Migration Rollback

### Trigger Conditions
- Migration fails mid-execution
- Data corruption detected
- Performance degradation from new indexes/constraints
- Foreign key violations blocking operations

### Pre-Rollback Checklist
- [ ] Confirm migration has a `down()` function
- [ ] Identify affected tables
- [ ] Check for data dependencies
- [ ] Notify on-call DBA

### Procedure

#### Step 1: Identify Failed Migration
```bash
# Check migration status
kubectl exec -it deployment/venue-service -n tickettoken -- \
  npx knex migrate:status

# Or connect directly to database
psql $DATABASE_URL -c "SELECT * FROM knex_migrations ORDER BY id DESC LIMIT 5;"
```

#### Step 2: Run Migration Down
```bash
# Rollback last migration
kubectl exec -it deployment/venue-service -n tickettoken -- \
  npx knex migrate:rollback

# Rollback multiple migrations
kubectl exec -it deployment/venue-service -n tickettoken -- \
  npx knex migrate:rollback --all
```

#### Step 3: Rollback Application
```bash
# Rollback to app version before migration
kubectl rollout undo deployment/venue-service -n tickettoken
```

#### Step 4: Verify Database State
```bash
# Check tables exist and have correct schema
psql $DATABASE_URL -c "\d venues"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM venues;"
```

### Dangerous Migrations (Extra Care Required)

For migrations that:
- Drop columns/tables
- Modify data types
- Delete data

**Always** have a backup before deploying:

```bash
# Pre-deployment backup
pg_dump $DATABASE_URL --schema-only > schema_backup_$(date +%Y%m%d).sql
pg_dump $DATABASE_URL --data-only -t affected_table > data_backup_$(date +%Y%m%d).sql

# If rollback needed - restore from backup
psql $DATABASE_URL < schema_backup_20250101.sql
```

---

## 3. Configuration Rollback

### ConfigMap Rollback
```bash
# List ConfigMap history (if using versioned names)
kubectl get configmaps -n tickettoken | grep venue-service

# Rollback ConfigMap
kubectl get configmap venue-service-config-v1 -n tickettoken -o yaml | \
  sed 's/v1/current/g' | kubectl apply -f -

# Restart pods to pick up new config
kubectl rollout restart deployment/venue-service -n tickettoken
```

### Secret Rollback (via Vault)
```bash
# List secret versions
vault kv metadata get secret/venue-service/config

# Rollback to previous version
vault kv rollback -version=<N> secret/venue-service/config

# Restart pods
kubectl rollout restart deployment/venue-service -n tickettoken
```

---

## 4. Feature Flag Rollback

For features behind feature flags, disable without deployment:

```bash
# Using LaunchDarkly/Unleash/ConfigCat
# Toggle flag in dashboard or via API

# Or via environment variable
kubectl set env deployment/venue-service \
  FEATURE_NEW_PRICING=false -n tickettoken
```

---

## 5. Blue-Green Deployment Rollback

If using blue-green deployment strategy:

```bash
# Switch traffic back to blue (stable) environment
kubectl patch service venue-service -n tickettoken \
  -p '{"spec":{"selector":{"version":"blue"}}}'

# Scale down green deployment
kubectl scale deployment/venue-service-green --replicas=0 -n tickettoken
```

---

## 6. Canary Deployment Rollback

If using canary releases:

```bash
# Remove canary from traffic split
kubectl patch virtualservice venue-service -n tickettoken --type=merge \
  -p '{"spec":{"http":[{"route":[{"destination":{"host":"venue-service","subset":"stable"},"weight":100}]}]}}'

# Scale down canary
kubectl scale deployment/venue-service-canary --replicas=0 -n tickettoken
```

---

## Automated Rollback (ArgoCD)

If using ArgoCD with automated sync:

```bash
# Sync to previous commit
argocd app sync venue-service --revision=<previous-commit-sha>

# Or rollback to previous successful sync
argocd app rollback venue-service

# Disable auto-sync temporarily
argocd app set venue-service --sync-policy=none
```

---

## Verification Checklist

After any rollback, verify:

- [ ] All pods are Running and Ready
- [ ] Health check endpoints return 200
- [ ] Error rate returned to baseline
- [ ] Latency returned to baseline
- [ ] Core functionality works (test in production)
- [ ] Alerts have cleared
- [ ] Database connectivity verified

```bash
# Quick verification script
./scripts/verify-rollback.sh

# Manual checks
kubectl get pods -l app=venue-service -n tickettoken
curl -s https://api.tickettoken.com/api/venues/health
curl -s https://api.tickettoken.com/metrics | grep http_requests_total
```

---

## Communication Template

```
🔴 **Rollback Initiated - venue-service**

**Time:** [TIMESTAMP]
**Severity:** [HIGH/MEDIUM]
**Rollback From:** v1.2.3 → v1.2.2
**Reason:** [Brief description]

**Impact:**
- [What users might experience]

**Actions Taken:**
1. Kubernetes rollback initiated
2. [Migration rollback if applicable]
3. Monitoring recovery

**ETA for Resolution:** [Time estimate]

**Incident Ticket:** [LINK]
```

---

## Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| On-Call Engineer | PagerDuty | Immediate |
| Platform Lead | @platform-lead | 15 min |
| DBA On-Call | @dba-oncall | DB issues |
| Security | @security-team | Security incidents |
