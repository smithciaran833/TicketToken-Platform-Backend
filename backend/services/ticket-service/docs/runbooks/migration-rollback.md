# Migration Rollback Runbook

## Overview

This runbook describes procedures for rolling back database migrations in the Ticket Service.

## Prerequisites

- Database admin access
- kubectl access to production cluster
- Backup verification completed

## Before Rolling Back

### 1. Verify Backup

```bash
# List recent backups
aws rds describe-db-snapshots \
  --db-instance-identifier tickettoken-production \
  --snapshot-type automated

# Verify backup is complete
aws rds describe-db-snapshots \
  --db-snapshot-identifier <snapshot-id> \
  --query 'DBSnapshots[0].Status'
```

### 2. Take Manual Backup

```bash
# Create manual snapshot before rollback
aws rds create-db-snapshot \
  --db-instance-identifier tickettoken-production \
  --db-snapshot-identifier pre-rollback-$(date +%Y%m%d-%H%M%S)
```

### 3. Notify Stakeholders

- Post in #deployments Slack channel
- Update status page to maintenance mode
- Notify on-call engineers

## Rolling Back Migrations

### Method 1: Knex Migration Rollback

For simple rollbacks using Knex:

```bash
# Connect to the service pod
kubectl exec -it deployment/ticket-service -n production -- /bin/sh

# Check current migration status
npx knex migrate:status

# Rollback last batch
npx knex migrate:rollback

# Rollback specific number of batches
npx knex migrate:rollback --step 2
```

### Method 2: Manual SQL Rollback

For complex rollbacks or when Knex rollback fails:

```bash
# Connect to database
kubectl run -it --rm psql-client --image=postgres:14 \
  --restart=Never -- psql $DATABASE_URL
```

```sql
-- Check migration history
SELECT * FROM knex_migrations ORDER BY id DESC LIMIT 10;

-- Remove migration record
DELETE FROM knex_migrations WHERE name = '007_add_security_tables.ts';

-- Run down migration manually
-- (Copy SQL from migration's down() function)
```

### Method 3: Point-in-Time Recovery

For major issues requiring full recovery:

```bash
# Restore from snapshot to new instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier tickettoken-recovery \
  --db-snapshot-identifier <snapshot-id>

# Or point-in-time recovery
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier tickettoken-production \
  --target-db-instance-identifier tickettoken-recovery \
  --restore-time "2025-01-01T10:00:00Z"
```

## Migration-Specific Rollbacks

### 007_add_security_tables.ts

```sql
-- Down migration
DROP TABLE IF EXISTS failed_login_attempts;
DROP TABLE IF EXISTS user_spending_limits;
DROP TABLE IF EXISTS multisig_approvals;
```

### 006_add_ticket_state_machine.ts

```sql
-- Down migration
ALTER TABLE tickets DROP COLUMN IF EXISTS blockchain_sync_status;
ALTER TABLE tickets DROP COLUMN IF EXISTS sync_attempts;
ALTER TABLE tickets DROP COLUMN IF EXISTS last_sync_error;
DROP TABLE IF EXISTS ticket_state_transitions;
DROP TYPE IF EXISTS ticket_state;
DROP TYPE IF EXISTS revocation_reason;
```

### 005_add_idempotency_keys.ts

```sql
-- Down migration
DROP TABLE IF EXISTS idempotency_keys;
```

### 004_add_rls_role_verification.ts

```sql
-- Down migration (CAUTION: Removes security)
-- Only run if absolutely necessary
DROP POLICY IF EXISTS tickets_tenant_isolation ON tickets;
DROP POLICY IF EXISTS ticket_scans_tenant_isolation ON ticket_scans;
```

### 003_add_blockchain_tracking.ts

```sql
-- Down migration
DROP TABLE IF EXISTS blockchain_sync_log;
DROP TABLE IF EXISTS pending_transactions;
DROP TYPE IF EXISTS tx_status;
DROP TYPE IF EXISTS sync_direction;
```

### 002_add_ticket_scans.ts

```sql
-- Down migration
DROP TABLE IF EXISTS ticket_scans;
```

## Post-Rollback Steps

### 1. Restart Services

```bash
# Rolling restart to pick up schema changes
kubectl rollout restart deployment/ticket-service -n production
```

### 2. Verify Application Health

```bash
# Check health endpoints
curl https://api.tickettoken.io/health/ready

# Check logs for errors
kubectl logs deployment/ticket-service -n production --tail=100
```

### 3. Run Smoke Tests

```bash
# Run integration tests against production
npm run test:smoke:production
```

### 4. Monitor Metrics

Check Grafana dashboards for:
- Error rates
- Response times
- Database connection pool
- Memory usage

### 5. Update Documentation

```bash
# Update CHANGELOG.md with rollback info
# Update FIX_PROGRESS.md if applicable
```

## Troubleshooting

### Migration Lock

If migration is stuck:

```sql
-- Check for locks
SELECT * FROM knex_migrations_lock;

-- Force unlock (USE WITH CAUTION)
UPDATE knex_migrations_lock SET is_locked = 0 WHERE is_locked = 1;
```

### Inconsistent State

If database is in inconsistent state:

```sql
-- Check actual schema vs migration records
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;

-- Compare with expected tables from migrations
```

### Foreign Key Violations

```sql
-- Find FK constraints
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint WHERE contype = 'f';

-- Temporarily disable for cleanup (DANGEROUS)
SET session_replication_role = 'replica';
-- ... cleanup ...
SET session_replication_role = 'origin';
```

## Emergency Contacts

- **Database DBA**: dba@tickettoken.io
- **On-Call Engineer**: PagerDuty
- **Platform Team**: #platform-team Slack

## Related Documents

- [Rollback Procedure](./rollback.md) - Application rollback
- [Restart Procedure](./restart.md) - Service restart
- [Scaling Procedure](./scaling.md) - Horizontal scaling
