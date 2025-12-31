# Migration Rollback Runbook

**AUDIT FIX:** Missing rollback documentation for migrations

## Overview

This runbook covers safe rollback procedures for venue-service database migrations.

## Pre-Rollback Checklist

- [ ] Identify which migration(s) need rollback
- [ ] Review the `down` function in the migration file
- [ ] Check for data loss implications
- [ ] Take database backup if rolling back in production
- [ ] Notify relevant teams (on-call, dev)
- [ ] Have DBA on standby for complex rollbacks

## Rollback Commands

### Check Current Migration Status

```bash
npm run migrate:status
```

Output shows:
- ✓ Completed migrations (already applied)
- ○ Pending migrations (not yet applied)

### Rollback Last Batch

```bash
npm run migrate:rollback
```

This rolls back ALL migrations from the last batch (group of migrations run together).

### Rollback Specific Number of Batches

```bash
npx knex migrate:rollback --step=2
```

Rolls back the last 2 batches.

### Rollback All Migrations

**⚠️ DANGER: This will destroy all data!**

```bash
npx knex migrate:rollback --all
```

Only use in development environments.

## Migration-Specific Rollback Notes

### 001_create_venues

**Rollback impact:** Destroys all venue data  
**Data backup required:** Yes  
**Can be safely rolled back:** Only in development

```sql
-- Pre-rollback: Export data
COPY venues TO '/tmp/venues_backup.csv' WITH CSV HEADER;
COPY venue_settings TO '/tmp/settings_backup.csv' WITH CSV HEADER;
```

### 004_add_webhook_events_table

**Rollback impact:** Drops webhook_events table  
**Data backup required:** If webhook history is needed  
**Can be safely rolled back:** Yes, webhooks will be reprocessed

### 006_add_rls_with_check

**Rollback impact:** Removes RLS WITH CHECK clauses  
**Data backup required:** No  
**Security impact:** Reduces INSERT/UPDATE validation  
**Can be safely rolled back:** Yes, but re-apply quickly

### 007_add_version_column

**Rollback impact:** Removes optimistic locking  
**Data backup required:** No  
**Can be safely rolled back:** Yes, but concurrent updates may conflict

### 008_add_check_constraints

**Rollback impact:** Removes data validation constraints  
**Data backup required:** No  
**Can be safely rolled back:** Yes, but invalid data may be inserted

### 010_add_venue_operations_resale_tables

**Rollback impact:** Drops venue_operations, transfer_history, resale tables  
**Data backup required:** Yes  
**Can be safely rolled back:** Only if no operations/transfers recorded

## Emergency Rollback Procedure

### 1. Stop the Service

```bash
# Kubernetes
kubectl scale deployment venue-service --replicas=0 -n production

# Docker
docker-compose stop venue-service
```

### 2. Take Backup

```bash
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -f backup_$(date +%Y%m%d_%H%M%S).dump
```

### 3. Execute Rollback

```bash
# From service directory
npm run migrate:rollback
```

### 4. Verify Database State

```bash
npm run migrate:status
```

### 5. Test Critical Paths

```bash
# Health check
curl http://localhost:3004/health

# Basic query test
curl http://localhost:3004/venues -H "Authorization: Bearer $TOKEN"
```

### 6. Restart Service

```bash
# Kubernetes
kubectl scale deployment venue-service --replicas=3 -n production

# Docker
docker-compose start venue-service
```

## Common Rollback Issues

### Issue: Foreign Key Constraint Violation

**Error:** `cannot drop table "x" because other objects depend on it`

**Solution:**
```sql
-- Defer constraints
SET CONSTRAINTS ALL DEFERRED;

-- Or drop dependent objects
DROP TABLE child_table CASCADE;
```

### Issue: Data Type Incompatibility

**Error:** `column "x" cannot be cast automatically to type y`

**Solution:**
```sql
-- Manual data conversion before rollback
ALTER TABLE venues ALTER COLUMN status TYPE varchar USING status::varchar;
```

### Issue: RLS Policy Blocking Rollback

**Error:** `permission denied for table x`

**Solution:**
```sql
-- Temporarily disable RLS
ALTER TABLE venues DISABLE ROW LEVEL SECURITY;
-- Run rollback
-- Re-enable
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
```

## Post-Rollback Verification

1. **Check migration status:**
   ```bash
   npm run migrate:status
   ```

2. **Verify data integrity:**
   ```sql
   SELECT COUNT(*) FROM venues;
   SELECT COUNT(*) FROM venue_settings;
   ```

3. **Check constraints:**
   ```sql
   SELECT conname, contype FROM pg_constraint 
   WHERE conrelid = 'venues'::regclass;
   ```

4. **Verify RLS:**
   ```sql
   SELECT policy_name FROM pg_policies WHERE tablename = 'venues';
   ```

## Recovery from Failed Rollback

1. Restore from backup:
   ```bash
   pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME -c backup_file.dump
   ```

2. Reset migration state:
   ```sql
   DELETE FROM knex_migrations WHERE name = 'failed_migration.ts';
   ```

3. Contact DBA team for complex recovery scenarios.

## Contacts

- **Database Team:** dba@tickettoken.com
- **On-Call:** #oncall Slack channel
- **Escalation:** Platform Engineering Lead
