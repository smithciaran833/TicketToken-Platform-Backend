# Key and Secret Rotation Runbook

## Overview

This runbook documents the procedures for rotating secrets and credentials used by the event-service. Regular rotation is a security best practice that limits the impact of credential compromise.

**AUDIT FIX (SEC-EXT16)**: Secret rotation procedures documented.

## Secrets Inventory

| Secret | Location | Rotation Frequency | Impact if Compromised |
|--------|----------|-------------------|----------------------|
| JWT_SECRET | AWS Secrets Manager | 90 days | User auth compromised |
| SERVICE_TOKEN_SECRET | AWS Secrets Manager | 30 days | S2S auth compromised |
| DATABASE_PASSWORD | AWS Secrets Manager | 90 days | Data breach |
| REDIS_PASSWORD | AWS Secrets Manager | 90 days | Cache/session compromise |
| API_KEY_ENCRYPTION_KEY | AWS Secrets Manager | 180 days | API keys compromised |

---

## Pre-Rotation Checklist

Before rotating any secret:

- [ ] Notify on-call team
- [ ] Verify backup of current secret
- [ ] Check deployment pipeline is green
- [ ] Verify rollback procedure is ready
- [ ] Schedule rotation during low-traffic period
- [ ] Ensure all consumers of the secret are identified

---

## JWT Secret Rotation

The JWT_SECRET is used to sign user authentication tokens.

### Procedure

1. **Generate new secret**
   ```bash
   # Generate cryptographically secure 64-byte key
   NEW_SECRET=$(openssl rand -base64 64)
   echo "New JWT Secret: $NEW_SECRET"
   ```

2. **Update AWS Secrets Manager with dual keys (graceful rotation)**
   ```bash
   # Enable dual-key period: old key continues to work for validation
   aws secretsmanager update-secret \
     --secret-id event-service/jwt-secret \
     --secret-string "{\"current\": \"$NEW_SECRET\", \"previous\": \"$OLD_SECRET\"}"
   ```

3. **Deploy service update**
   - Service will now:
     - Sign new tokens with `current` key
     - Validate with both `current` and `previous` keys

4. **Wait for token expiration (24-48 hours)**
   - All tokens signed with old key will expire
   - Monitor for auth failures in logs

5. **Remove old key**
   ```bash
   aws secretsmanager update-secret \
     --secret-id event-service/jwt-secret \
     --secret-string "{\"current\": \"$NEW_SECRET\"}"
   ```

### Verification
```bash
# Check auth endpoint
curl -X POST https://api.tickettoken.com/api/v1/auth/validate \
  -H "Authorization: Bearer $TEST_TOKEN"
```

---

## Service Token Secret Rotation

The SERVICE_TOKEN_SECRET is used for service-to-service authentication.

### Procedure

1. **Generate new secret**
   ```bash
   NEW_S2S_SECRET=$(openssl rand -base64 32)
   ```

2. **Update all dependent services first**
   - venue-service
   - ticket-service
   - order-service
   - payment-service

3. **Update event-service secrets**
   ```bash
   aws secretsmanager update-secret \
     --secret-id event-service/s2s-secret \
     --secret-string "$NEW_S2S_SECRET"
   ```

4. **Rolling restart all services**
   ```bash
   kubectl rollout restart deployment/event-service -n production
   kubectl rollout restart deployment/venue-service -n production
   # ... repeat for all services
   ```

5. **Monitor for S2S auth errors**
   ```bash
   kubectl logs -l app=event-service -n production | grep -i "s2s.*fail"
   ```

### Emergency Rollback
```bash
# Restore previous version of secret
aws secretsmanager put-secret-value \
  --secret-id event-service/s2s-secret \
  --secret-string "$OLD_S2S_SECRET"

# Force restart
kubectl rollout restart deployment/event-service -n production
```

---

## Database Password Rotation

### Procedure

1. **Create new database user (zero-downtime approach)**
   ```sql
   -- In PostgreSQL
   CREATE USER event_service_v2 WITH PASSWORD 'new_password';
   GRANT event_service TO event_service_v2;
   ```

2. **Update secret with new credentials**
   ```bash
   aws secretsmanager update-secret \
     --secret-id event-service/database \
     --secret-string '{"username": "event_service_v2", "password": "new_password"}'
   ```

3. **Rolling restart event-service**
   ```bash
   kubectl rollout restart deployment/event-service -n production
   ```

4. **Verify connections**
   ```bash
   # Check connection pool
   curl http://localhost:3003/health | jq '.checks.database'
   ```

5. **Disable old user after 24 hours**
   ```sql
   ALTER USER event_service NOLOGIN;
   -- Later: DROP USER event_service;
   ```

---

## Redis Password Rotation

### Procedure (AWS ElastiCache)

1. **Update ElastiCache AUTH token**
   ```bash
   aws elasticache modify-replication-group \
     --replication-group-id event-service-redis \
     --auth-token new_token \
     --auth-token-update-strategy ROTATE
   ```

2. **Update secret**
   ```bash
   aws secretsmanager update-secret \
     --secret-id event-service/redis \
     --secret-string "$NEW_REDIS_TOKEN"
   ```

3. **Rolling restart**
   ```bash
   kubectl rollout restart deployment/event-service -n production
   ```

---

## API Key Encryption Key Rotation

This key encrypts API keys stored in the database.

### Procedure

1. **Add new key as secondary**
   ```bash
   aws secretsmanager update-secret \
     --secret-id event-service/api-key-encryption \
     --secret-string '{"primary": "new_key", "secondary": "old_key"}'
   ```

2. **Run re-encryption migration**
   ```bash
   # This migrates encrypted API keys to new key
   npm run migrate:api-keys
   ```

3. **Remove old key**
   ```bash
   aws secretsmanager update-secret \
     --secret-id event-service/api-key-encryption \
     --secret-string '{"primary": "new_key"}'
   ```

---

## Automated Rotation with AWS Secrets Manager

For supported secrets, enable automatic rotation:

```bash
aws secretsmanager rotate-secret \
  --secret-id event-service/jwt-secret \
  --rotation-lambda-arn arn:aws:lambda:us-east-1:123456789:function:secret-rotator \
  --rotation-rules AutomaticallyAfterDays=90
```

### Rotation Lambda Function

The rotation lambda should:
1. Create new secret version
2. Test new credentials
3. Update secret
4. Clean up old version

---

## Environment Variables

All secrets should be accessed via config, not direct `process.env`:

```typescript
// Good - using config
import { config } from './config';
const secret = config.auth.jwtSecret;

// Bad - direct env access
const secret = process.env.JWT_SECRET; // Avoid this
```

This allows for:
- Centralized validation
- Default value handling
- Type safety
- Easy testing/mocking

---

## Monitoring & Alerting

Set up alerts for:

1. **Secret access anomalies**
   ```sql
   -- CloudWatch Insights query
   filter @logGroup = "/aws/secretsmanager"
   | stats count() by eventName
   | filter eventName = "GetSecretValue"
   ```

2. **Auth failures spike**
   ```promql
   rate(auth_failures_total{service="event-service"}[5m]) > 10
   ```

3. **Secret expiration warning**
   - Set up reminder 2 weeks before scheduled rotation

---

## Incident Response

If a secret is compromised:

1. **Immediate rotation** - Follow procedures above
2. **Audit access logs** - Check who accessed the secret
3. **Invalidate affected sessions/tokens**
4. **Notify security team**
5. **Document in incident report**

---

## Contacts

| Role | Contact |
|------|---------|
| Security Team | security@tickettoken.com |
| Platform Team | platform@tickettoken.com |
| On-Call | PagerDuty escalation |
