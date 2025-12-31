# Secret Rotation Runbook

## Overview

This document describes procedures for rotating cryptographic secrets in the auth-service.

## Key Types

| Key Type | Purpose | Rotation Period | Grace Period |
|----------|---------|-----------------|--------------|
| JWT Keys | User access/refresh tokens | 90 days | 24 hours |
| S2S Keys | Service-to-service auth | 90 days | 24 hours |
| Encryption Key | MFA secrets, sensitive data | 180 days | N/A (re-encrypt) |

## Rotation Monitoring

### Check Rotation Status
```bash
# API endpoint (requires admin auth)
curl -H "Authorization: Bearer $TOKEN" \
  https://api.tickettoken.com/auth/admin/key-rotation/status

# Response:
{
  "jwt": { "lastRotation": "2024-01-15T...", "ageInDays": 45, "rotationNeeded": false },
  "s2s": { "lastRotation": "2024-01-15T...", "ageInDays": 45, "rotationNeeded": false },
  "config": { "maxKeyAgeDays": 90, "gracePeriodHours": 24 }
}
```

### Prometheus Metrics
```promql
# Key age in days
auth_key_age_days{key_type="jwt"}

# Rotation needed alert
auth_key_rotation_needed{key_type="jwt"} == 1
```

### Alert Rules
```yaml
- alert: KeyRotationNeeded
  expr: auth_key_rotation_needed == 1
  for: 1h
  labels:
    severity: warning
  annotations:
    summary: "Key rotation needed for {{ $labels.key_type }}"

- alert: KeyRotationOverdue
  expr: auth_key_age_days > 100
  for: 1h
  labels:
    severity: critical
  annotations:
    summary: "Key rotation overdue for {{ $labels.key_type }}"
```

## JWT Key Rotation

### Pre-Rotation Checklist

- [ ] Notify on-call team
- [ ] Verify current traffic levels are normal
- [ ] Ensure no deployments in progress
- [ ] Confirm rollback plan is ready

### Step 1: Generate New Key Pair
```bash
# Generate new keys
openssl genrsa -out jwt-private-new.pem 4096
openssl rsa -in jwt-private-new.pem -pubout -out jwt-public-new.pem

# Base64 encode for environment variables
base64 -w 0 jwt-private-new.pem > jwt-private-new.b64
base64 -w 0 jwt-public-new.pem > jwt-public-new.b64
```

### Step 2: Update Secrets Manager
```bash
# AWS Secrets Manager example
aws secretsmanager update-secret \
  --secret-id prod/auth-service/jwt-keys \
  --secret-string '{
    "JWT_PRIVATE_KEY": "'$(cat jwt-private-new.b64)'",
    "JWT_PUBLIC_KEY": "'$(cat jwt-public-new.b64)'",
    "JWT_PRIVATE_KEY_PREVIOUS": "'$(cat jwt-private-current.b64)'",
    "JWT_PUBLIC_KEY_PREVIOUS": "'$(cat jwt-public-current.b64)'"
  }'
```

### Step 3: Rolling Restart
```bash
# Kubernetes rolling restart
kubectl rollout restart deployment/auth-service -n production

# Monitor rollout
kubectl rollout status deployment/auth-service -n production
```

### Step 4: Verify
```bash
# Check JWKS endpoint shows both keys
curl https://api.tickettoken.com/.well-known/jwks.json | jq '.keys | length'
# Should return 2 (current + previous)

# Verify new tokens are signed with new key
curl -X POST https://api.tickettoken.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"..."}' | \
  jq -r '.tokens.accessToken' | \
  cut -d. -f1 | base64 -d | jq '.kid'
# Should show new key ID
```

### Step 5: Grace Period

Wait 24 hours for old tokens to expire naturally.

### Step 6: Remove Old Key

After grace period:
```bash
# Update secrets to remove previous key
aws secretsmanager update-secret \
  --secret-id prod/auth-service/jwt-keys \
  --secret-string '{
    "JWT_PRIVATE_KEY": "'$(cat jwt-private-new.b64)'",
    "JWT_PUBLIC_KEY": "'$(cat jwt-public-new.b64)'"
  }'

# Rolling restart
kubectl rollout restart deployment/auth-service -n production
```

## S2S Key Rotation

Same process as JWT keys, but use:
- `S2S_PRIVATE_KEY` / `S2S_PUBLIC_KEY`
- `S2S_PRIVATE_KEY_PREVIOUS` / `S2S_PUBLIC_KEY_PREVIOUS`

**Note:** Coordinate with all consuming services to ensure they update their token cache.

## Emergency Rotation (Key Compromise)

If a key is compromised:

### Immediate Actions

1. **Generate new keys immediately**
2. **Skip grace period** - revoke old key
3. **Force logout all users** (invalidate all refresh tokens)
4. **Notify all consuming services**
```bash
# Force invalidate all refresh tokens
redis-cli -h $REDIS_HOST KEYS "tenant:*:refresh_token:*" | xargs redis-cli DEL

# Or via API
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.tickettoken.com/auth/admin/revoke-all-tokens
```

### Post-Incident

1. Conduct security review
2. Determine how key was compromised
3. Update rotation procedures if needed
4. File incident report

## Encryption Key Rotation

Encryption keys require re-encrypting existing data:

1. Generate new encryption key
2. Decrypt all MFA secrets with old key
3. Re-encrypt with new key
4. Update database
5. Update ENCRYPTION_KEY environment variable
6. Restart services

**Warning:** This requires downtime or a migration script.
```sql
-- Example: Re-encrypt MFA secrets (run in maintenance window)
-- This would be done via a migration script, not raw SQL
```

## Rotation Schedule

| Week | Activity |
|------|----------|
| Week 1 | Review key ages, plan rotations |
| Week 2-3 | Execute planned rotations |
| Week 4 | Verify all rotations complete, update docs |

## Audit Trail

All rotations are logged:
```sql
SELECT * FROM audit_logs 
WHERE action LIKE 'key.%' 
ORDER BY created_at DESC 
LIMIT 20;
```

## Contacts

| Role | Contact |
|------|---------|
| Security Team | security@tickettoken.com |
| Platform On-Call | PagerDuty |
| Key Custodian | @security-lead |
