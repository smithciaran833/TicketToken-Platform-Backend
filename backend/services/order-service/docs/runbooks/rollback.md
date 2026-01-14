# Order Service Rollback Runbook

## When to Rollback

Rollback immediately if:
- Error rate > 5% for more than 2 minutes
- P99 latency > 2s for more than 5 minutes
- Critical functionality broken (order creation, payments)
- Data corruption detected
- Security vulnerability discovered

## Quick Rollback (Kubernetes)

### Immediate Rollback to Previous Version

```bash
# Rollback to previous revision
kubectl -n production rollout undo deployment/order-service

# Watch the rollback
kubectl -n production rollout status deployment/order-service

# Verify pods are healthy
kubectl -n production get pods -l app=order-service
```

### Rollback to Specific Version

```bash
# List rollout history
kubectl -n production rollout history deployment/order-service

# Rollback to specific revision (e.g., revision 5)
kubectl -n production rollout undo deployment/order-service --to-revision=5

# Or deploy specific image version
kubectl -n production set image deployment/order-service \
  order-service=registry.example.com/tickettoken/order-service:v1.2.3
```

## Database Migration Rollback

### Before Rolling Back Code

If the deployment included database migrations, they may need to be rolled back first.

```bash
# Check current migration status
npm run migrate:status

# Rollback last migration
npm run migrate:rollback

# Rollback multiple migrations (be careful!)
npm run migrate:rollback --all
```

### Rollback Specific Migration

```bash
# List migrations
npm run migrate:list

# Rollback to specific migration
npm run migrate:down --name=<migration_name>
```

### Data Recovery

If data was modified:

1. **Identify affected data**
   ```sql
   -- Check audit logs
   SELECT * FROM order_events 
   WHERE created_at > '2024-01-01 00:00:00' 
   ORDER BY created_at DESC;
   ```

2. **Restore from backup if needed**
   ```bash
   # Contact DBA team for point-in-time recovery
   # Backup location: s3://tickettoken-backups/order-service/
   ```

## Post-Rollback Verification

### 1. Health Checks

```bash
# Check all health endpoints
curl https://order-service.internal/health/startup
curl https://order-service.internal/health/live
curl https://order-service.internal/health/ready
curl https://order-service.internal/health
```

### 2. Functional Tests

```bash
# Run smoke tests
npm run test:smoke

# Manual checks:
# - [ ] Can create new orders
# - [ ] Can view existing orders
# - [ ] Can process refunds
# - [ ] Webhooks are processing
```

### 3. Metrics Verification

Check Grafana dashboards:
- Error rate returning to baseline
- Latency returning to normal
- Order success rate > 99%

## Communication

### During Rollback

1. **Alert the team**
   ```
   @here Initiating rollback of order-service from v${NEW} to v${OLD}
   Reason: [Brief description]
   ETA: 5 minutes
   ```

2. **Update status page** if customer-facing impact

### After Rollback

1. **Notify stakeholders**
   ```
   Rollback of order-service complete.
   - Previous version: v${NEW}
   - Current version: v${OLD}
   - Impact duration: X minutes
   - Root cause investigation: In progress
   ```

2. **Create incident ticket**
   - Document timeline
   - Capture logs and metrics
   - Schedule post-mortem

## Rollback Decision Matrix

| Symptom | Action | Wait Time |
|---------|--------|-----------|
| Error rate > 10% | Immediate rollback | 0 min |
| Error rate > 5% | Monitor, prepare rollback | 2 min |
| Error rate > 1% | Investigate, consider rollback | 5 min |
| P99 > 5s | Immediate rollback | 0 min |
| P99 > 2s | Monitor, prepare rollback | 5 min |
| Memory leak suspected | Schedule rollback | 15 min |
| Single pod crashes | Let K8s restart, monitor | 5 min |

## Emergency Contacts

| Role | Contact | When to Contact |
|------|---------|-----------------|
| On-call Engineer | PagerDuty | Immediate |
| Engineering Lead | Slack DM | If rollback fails |
| DBA Team | #dba-team | Database rollback needed |
| Security Team | #security | Security issue discovered |

## Post-Mortem Template

After stabilization, schedule a post-mortem:

1. **Timeline**: What happened and when
2. **Impact**: Users affected, revenue impact
3. **Root Cause**: Why did this happen
4. **Detection**: How was it detected
5. **Resolution**: What fixed it
6. **Prevention**: How do we prevent this
7. **Action Items**: Specific tasks with owners
