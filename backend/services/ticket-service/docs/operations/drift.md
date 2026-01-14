# Configuration Drift Detection

## Overview

Configuration drift occurs when running configuration diverges from source of truth (Git, secrets manager).

## Detection Methods

### Environment Variables

Compare running config vs expected:
```bash
# Export current config
kubectl exec deploy/ticket-service -- env | sort > running.env

# Compare with expected
diff expected.env running.env
```

### Secrets

Verify secrets match Secrets Manager:
```bash
# Check secret versions
aws secretsmanager describe-secret --secret-id ticket-service/prod

# Compare hashes (not values)
kubectl get secret ticket-service -o jsonpath='{.data}' | md5sum
```

### Database Schema

Compare against migrations:
```bash
# Check migration status
npm run migrate:status

# Verify schema
pg_dump --schema-only $DATABASE_URL > current_schema.sql
diff expected_schema.sql current_schema.sql
```

## Automated Checks

### Startup Validation

Service validates config on startup:
- Required env vars present
- Secret lengths meet minimums
- Database migrations applied

### Health Check

`/health/detailed` includes config validation:
```json
{
  "config": {
    "status": "valid",
    "warnings": [],
    "drift": false
  }
}
```

## Remediation

### Environment Drift
```bash
# Restart with correct config
kubectl rollout restart deployment/ticket-service
```

### Secret Drift
```bash
# Sync secrets from manager
./scripts/sync-secrets.sh

# Restart to pick up changes
kubectl rollout restart deployment/ticket-service
```

### Schema Drift
```bash
# Apply pending migrations
npm run migrate:latest

# Or rollback if needed
npm run migrate:rollback
```

## Prevention

1. **GitOps** - All config in version control
2. **Immutable deploys** - No runtime config changes
3. **Automated sync** - Secrets synced on deploy
4. **Validation** - Pre-deploy config checks
