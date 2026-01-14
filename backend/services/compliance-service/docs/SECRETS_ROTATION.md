# Secrets Rotation Guide

**AUDIT FIX: CFG-M2** - No rotation documentation

## Overview

This document describes procedures for rotating secrets used by the compliance service.

## Secret Types

| Secret | Rotation Period | Impact During Rotation |
|--------|-----------------|------------------------|
| JWT_SECRET | 90 days | Dual-key support required |
| WEBHOOK_SECRET | 90 days | Coordinate with Stripe |
| DATABASE_PASSWORD | 90 days | Connection pool refresh |
| REDIS_PASSWORD | 180 days | Connection refresh |
| INTERNAL_SERVICE_TOKEN | 90 days | Dual-token support |
| STRIPE_WEBHOOK_SECRET | Per-endpoint | Stripe dashboard |

---

## JWT Secret Rotation

### Overview

JWT secrets require dual-key support during rotation to prevent authentication failures.

### Procedure

1. **Generate new secret**
   ```bash
   # Generate a secure 256-bit secret
   openssl rand -base64 32
   ```

2. **Update AWS Secrets Manager**
   ```bash
   # Add new secret while keeping old one
   aws secretsmanager update-secret \
     --secret-id compliance-service/secrets \
     --secret-string '{
       "JWT_SECRET": "new-secret-value",
       "JWT_SECRET_OLD": "old-secret-value",
       "JWT_SECRET_ROTATION_DATE": "2026-01-03"
     }'
   ```

3. **Deploy with dual-key support**
   - The auth middleware will try new key first, then old key
   - Tokens signed with old key remain valid until expiry

4. **Wait for token expiry**
   - Default token TTL: 1 hour
   - Wait at least 2 hours for all old tokens to expire

5. **Remove old secret**
   ```bash
   aws secretsmanager update-secret \
     --secret-id compliance-service/secrets \
     --secret-string '{
       "JWT_SECRET": "new-secret-value"
     }'
   ```

### Code Support

```typescript
// src/config/secrets.ts
async function validateJwt(token: string): Promise<JwtPayload> {
  const secrets = await getSecrets();
  
  // Try new secret first
  try {
    return jwt.verify(token, secrets.JWT_SECRET) as JwtPayload;
  } catch (error) {
    // Fall back to old secret during rotation
    if (secrets.JWT_SECRET_OLD) {
      return jwt.verify(token, secrets.JWT_SECRET_OLD) as JwtPayload;
    }
    throw error;
  }
}
```

---

## Webhook Secret Rotation

### Stripe Webhook Secret

1. **Generate new endpoint in Stripe Dashboard**
   - Go to Developers → Webhooks
   - Create new endpoint with same URL
   - Copy new signing secret

2. **Update secrets**
   ```bash
   aws secretsmanager update-secret \
     --secret-id compliance-service/secrets \
     --secret-string '{
       "STRIPE_WEBHOOK_SECRET": "whsec_new_value",
       "STRIPE_WEBHOOK_SECRET_OLD": "whsec_old_value"
     }'
   ```

3. **Deploy and verify**
   - Monitor webhook logs for successful verifications
   - Check for any signature validation failures

4. **Disable old endpoint in Stripe**
   - After confirming new endpoint works
   - Remove old webhook endpoint
   - Remove old secret from Secrets Manager

### Internal Webhook Secret

1. **Update secret**
   ```bash
   aws secretsmanager update-secret \
     --secret-id compliance-service/secrets \
     --secret-string '{
       "WEBHOOK_SECRET": "new-value",
       "WEBHOOK_SECRET_OLD": "old-value"
     }'
   ```

2. **Update all services sending webhooks**
   - Notify dependent services
   - Coordinate deployment

---

## Database Password Rotation

### Prerequisites

- RDS Multi-AZ deployment
- Application supports connection refresh
- Maintenance window scheduled

### Procedure

1. **Modify RDS master password**
   ```bash
   aws rds modify-db-instance \
     --db-instance-identifier compliance-db \
     --master-user-password "new-secure-password" \
     --apply-immediately
   ```

2. **Update Secrets Manager**
   ```bash
   aws secretsmanager update-secret \
     --secret-id compliance-service/database \
     --secret-string '{
       "password": "new-secure-password"
     }'
   ```

3. **Trigger rolling restart**
   ```bash
   kubectl rollout restart deployment/compliance-service
   ```

4. **Verify connections**
   ```bash
   kubectl logs -l app=compliance-service | grep "Database connected"
   ```

### Connection Pool Handling

```typescript
// Connection pool automatically refreshes on error
pool.on('error', (err, client) => {
  logger.error({ err }, 'Database pool error, refreshing connection');
  // Pool automatically removes errored connections
});
```

---

## Redis Password Rotation

### Procedure

1. **Update ElastiCache password**
   ```bash
   aws elasticache modify-replication-group \
     --replication-group-id compliance-redis \
     --auth-token "new-redis-password" \
     --auth-token-update-strategy ROTATE \
     --apply-immediately
   ```

2. **Update Secrets Manager**
   ```bash
   aws secretsmanager update-secret \
     --secret-id compliance-service/redis \
     --secret-string '{
       "password": "new-redis-password"
     }'
   ```

3. **Restart pods**
   ```bash
   kubectl rollout restart deployment/compliance-service
   ```

---

## Internal Service Token Rotation

### Procedure

1. **Generate new token**
   ```bash
   openssl rand -base64 32
   ```

2. **Update all services** (coordinate deployment)
   - compliance-service (verifier)
   - auth-service (caller)
   - user-service (caller)

3. **Deploy with dual-token support**
   ```bash
   aws secretsmanager update-secret \
     --secret-id compliance-service/secrets \
     --secret-string '{
       "INTERNAL_SERVICE_TOKEN": "new-token",
       "INTERNAL_SERVICE_TOKEN_OLD": "old-token"
     }'
   ```

4. **Deploy consumers with new token**

5. **Remove old token**

---

## Automation

### Scheduled Rotation

Use AWS Secrets Manager rotation Lambda:

```typescript
// rotation-lambda/index.ts
export async function handler(event: RotationEvent): Promise<void> {
  const { SecretId, Step } = event;
  
  switch (Step) {
    case 'createSecret':
      await createNewSecret(SecretId);
      break;
    case 'setSecret':
      await setNewSecret(SecretId);
      break;
    case 'testSecret':
      await testNewSecret(SecretId);
      break;
    case 'finishSecret':
      await finishRotation(SecretId);
      break;
  }
}
```

### Monitoring

```yaml
# CloudWatch Alarm for rotation
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  SecretRotationAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: compliance-service-secret-rotation-due
      MetricName: DaysSinceLastRotation
      Namespace: AWS/SecretsManager
      Statistic: Maximum
      Period: 86400
      EvaluationPeriods: 1
      Threshold: 80
      ComparisonOperator: GreaterThanThreshold
```

---

## Emergency Rotation

### When to Use

- Suspected secret compromise
- Employee departure with secret access
- Security incident

### Procedure

1. **Immediate rotation without dual-key**
   - Accept brief service disruption
   - Rotate secret immediately
   - Restart all pods

2. **Commands**
   ```bash
   # Rotate immediately
   aws secretsmanager update-secret \
     --secret-id compliance-service/secrets \
     --secret-string '{"JWT_SECRET": "emergency-new-secret"}'
   
   # Force restart all pods
   kubectl rollout restart deployment/compliance-service
   
   # Monitor for errors
   kubectl logs -f -l app=compliance-service --tail=100
   ```

3. **Post-incident**
   - Document incident
   - Review access logs
   - Update rotation schedule

---

## Checklist

### Pre-Rotation

- [ ] Notify team of planned rotation
- [ ] Schedule maintenance window (if needed)
- [ ] Verify dual-key support code is deployed
- [ ] Test in staging first
- [ ] Document rollback procedure

### During Rotation

- [ ] Update secrets in Secrets Manager
- [ ] Deploy service with new secrets
- [ ] Monitor error rates
- [ ] Verify authentication still works
- [ ] Check dependent service connectivity

### Post-Rotation

- [ ] Remove old secrets after grace period
- [ ] Update documentation
- [ ] Schedule next rotation
- [ ] Review rotation logs
