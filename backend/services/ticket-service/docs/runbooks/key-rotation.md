# Key Rotation Runbook

## Overview

This runbook describes procedures for rotating cryptographic keys and secrets in the Ticket Service.

## Keys Requiring Rotation

| Key | Rotation Frequency | Impact |
|-----|-------------------|--------|
| JWT_SECRET | 90 days | Auth interruption |
| QR_ENCRYPTION_KEY | 30 days | QR regeneration |
| INTERNAL_SERVICE_SECRET | 90 days | S2S auth |
| Per-Service Secrets | 90 days | S2S auth |
| Database Credentials | 90 days | Connection reset |
| Redis Password | 90 days | Cache reset |

## Prerequisites

- Admin access to AWS Secrets Manager or HashiCorp Vault
- kubectl access to production cluster
- Access to on-call communication channels

## JWT Secret Rotation

### Procedure

1. **Generate New Secret**
   ```bash
   # Generate 64+ character secret
   openssl rand -base64 48 | tr -d '\n'
   ```

2. **Update Secrets Manager**
   ```bash
   aws secretsmanager update-secret \
     --secret-id prod/ticket-service/jwt-secret \
     --secret-string '{"JWT_SECRET":"<new-secret>","JWT_SECRET_OLD":"<current-secret>"}'
   ```

3. **Deploy with Dual-Key Support**
   The service accepts tokens signed with both old and new keys during transition:
   ```typescript
   // config/index.ts supports JWT_SECRET_OLD for migration period
   ```

4. **Rolling Restart**
   ```bash
   kubectl rollout restart deployment/ticket-service -n production
   ```

5. **Monitor**
   ```bash
   # Watch for auth errors
   kubectl logs -f deployment/ticket-service -n production | grep -i "auth\|jwt"
   ```

6. **Remove Old Secret (after 24h)**
   ```bash
   aws secretsmanager update-secret \
     --secret-id prod/ticket-service/jwt-secret \
     --secret-string '{"JWT_SECRET":"<new-secret>"}'
   ```

### Rollback

If auth errors spike:
```bash
aws secretsmanager update-secret \
  --secret-id prod/ticket-service/jwt-secret \
  --secret-string '{"JWT_SECRET":"<old-secret>"}'
kubectl rollout restart deployment/ticket-service -n production
```

## QR Encryption Key Rotation

### Impact

- All existing QR codes become invalid
- Must regenerate QR codes after rotation

### Procedure

1. **Schedule During Low-Traffic Window**
   - Notify venue operators 24h in advance
   - Schedule for early morning (2-4 AM local)

2. **Generate New Key**
   ```bash
   # Must be exactly 32 characters for AES-256
   openssl rand -hex 16
   ```

3. **Update Secret**
   ```bash
   aws secretsmanager update-secret \
     --secret-id prod/ticket-service/qr-encryption \
     --secret-string '{"QR_ENCRYPTION_KEY":"<new-32-char-key>"}'
   ```

4. **Restart Service**
   ```bash
   kubectl rollout restart deployment/ticket-service -n production
   ```

5. **Regenerate QR Codes**
   ```bash
   # Trigger QR regeneration job
   curl -X POST https://api.tickettoken.io/admin/regenerate-qr \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

### Verification

```bash
# Test QR generation
curl https://api.tickettoken.io/tickets/{id}/qr \
  -H "Authorization: Bearer $TOKEN"
```

## Service-to-Service Secret Rotation

### Procedure

1. **Generate Per-Service Secrets**
   ```bash
   for service in auth event payment notification venue; do
     secret=$(openssl rand -base64 48 | tr -d '\n')
     echo "${service^^}_SERVICE_SECRET=$secret"
   done
   ```

2. **Update All Service Secrets**
   ```bash
   # Update ticket-service
   aws secretsmanager update-secret \
     --secret-id prod/ticket-service/s2s-secrets \
     --secret-string '{"AUTH_SERVICE_SECRET":"...","EVENT_SERVICE_SECRET":"..."}'
   
   # Update corresponding services
   aws secretsmanager update-secret \
     --secret-id prod/auth-service/s2s-secrets \
     --secret-string '{"TICKET_SERVICE_SECRET":"<same-as-ticket>"}'
   ```

3. **Rolling Restart All Services**
   ```bash
   for service in ticket-service auth-service event-service payment-service; do
     kubectl rollout restart deployment/$service -n production
   done
   ```

4. **Monitor S2S Calls**
   ```bash
   # Check for signature failures
   kubectl logs deployment/ticket-service -n production | grep -i "signature\|s2s"
   ```

## Database Credential Rotation

### Procedure

1. **Create New Database User**
   ```sql
   CREATE USER ticket_service_v2 WITH PASSWORD '<new-password>';
   GRANT ticket_service_role TO ticket_service_v2;
   ```

2. **Update Secret**
   ```bash
   aws secretsmanager update-secret \
     --secret-id prod/ticket-service/database \
     --secret-string '{"DATABASE_URL":"postgresql://ticket_service_v2:<new-password>@..."}'
   ```

3. **Restart Service**
   ```bash
   kubectl rollout restart deployment/ticket-service -n production
   ```

4. **Verify Connections**
   ```sql
   SELECT usename, count(*) FROM pg_stat_activity 
   WHERE usename LIKE 'ticket_service%' 
   GROUP BY usename;
   ```

5. **Drop Old User (after 24h)**
   ```sql
   DROP USER ticket_service_v1;
   ```

## Automated Rotation

For AWS Secrets Manager automated rotation:

```bash
# Enable rotation
aws secretsmanager rotate-secret \
  --secret-id prod/ticket-service/jwt-secret \
  --rotation-lambda-arn arn:aws:lambda:us-east-1:xxx:function:secret-rotation

# Configure schedule (90 days)
aws secretsmanager update-secret \
  --secret-id prod/ticket-service/jwt-secret \
  --rotation-rules '{"AutomaticallyAfterDays": 90}'
```

## Emergency Rotation

If key compromise suspected:

1. **Immediate Actions**
   - Page on-call engineer
   - Generate new secrets immediately
   - Do NOT follow normal rollout - emergency restart

2. **Emergency Commands**
   ```bash
   # Generate all new secrets
   ./scripts/generate-emergency-secrets.sh
   
   # Force immediate restart (all pods at once)
   kubectl delete pods -l app=ticket-service -n production
   
   # Monitor for issues
   kubectl logs -f deployment/ticket-service -n production
   ```

3. **Post-Incident**
   - Document timeline
   - Identify compromise source
   - Review access logs
   - File incident report

## Contacts

- **Security Team**: security@tickettoken.io
- **On-Call**: PagerDuty escalation policy
- **Slack**: #incident-response
