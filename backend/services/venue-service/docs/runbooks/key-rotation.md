# Key Rotation Procedures

**Document Owner:** Platform Security Team  
**Last Updated:** 2025-01-01  
**Review Cycle:** Quarterly

## Overview

This runbook documents the procedures for rotating cryptographic keys and secrets used by the venue-service. Regular key rotation reduces the impact of potential key compromise.

## Rotation Schedule

| Secret Type | Rotation Frequency | Auto-Rotation | Owner |
|-------------|-------------------|---------------|-------|
| JWT Signing Keys | 90 days | Yes (Vault) | Auth Team |
| Database Credentials | 30 days | Yes (Vault) | DB Team |
| Redis Password | 30 days | Yes (Vault) | Platform Team |
| Stripe API Keys | 365 days | Manual | Finance Team |
| Internal Service Secrets | 30 days | Yes (Vault) | Platform Team |
| API Key Hashing Pepper | Never* | N/A | Security Team |

*Only rotate if compromised

---

## 1. JWT Key Rotation (JW2)

### Prerequisites
- Access to secrets management (Vault/AWS Secrets Manager)
- RS256 key generation capability
- Kubernetes deployment access

### Procedure

#### Step 1: Generate New Key Pair
```bash
# Generate new RSA key pair
openssl genrsa -out jwt-private-new.pem 4096
openssl rsa -in jwt-private-new.pem -pubout -out jwt-public-new.pem

# Verify key
openssl rsa -in jwt-private-new.pem -check
```

#### Step 2: Add New Public Key (Grace Period)
```bash
# Upload new public key to Vault
vault kv put secret/venue-service/jwt \
  public_key_new=@jwt-public-new.pem \
  public_key_old=@jwt-public-current.pem

# Update venue-service to accept both keys
kubectl set env deployment/venue-service \
  JWT_PUBLIC_KEY_PATH=/secrets/jwt-public-new.pem \
  JWT_PUBLIC_KEY_OLD_PATH=/secrets/jwt-public-old.pem
```

#### Step 3: Rotate Auth Service to New Private Key
```bash
# Update auth-service with new private key
vault kv put secret/auth-service/jwt \
  private_key=@jwt-private-new.pem

# Restart auth-service to use new key
kubectl rollout restart deployment/auth-service
```

#### Step 4: Wait for Token Expiry
```bash
# Wait for all old tokens to expire (based on JWT TTL)
# Default: 24 hours for access tokens, 7 days for refresh tokens

# Monitor for old key usage
kubectl logs -l app=venue-service | grep "old key"
```

#### Step 5: Remove Old Key
```bash
# Remove old public key from venue-service
vault kv put secret/venue-service/jwt \
  public_key=@jwt-public-new.pem

kubectl rollout restart deployment/venue-service
```

### Rollback
```bash
# If issues occur, restore old keys
vault kv rollback -version=<previous_version> secret/venue-service/jwt
kubectl rollout restart deployment/venue-service
```

---

## 2. Database Credentials Rotation

### Prerequisites
- PostgreSQL superuser access
- Vault dynamic secrets configured
- Zero-downtime deployment capability

### Procedure (Vault Dynamic Secrets)

Vault handles this automatically with dynamic credentials:

```hcl
# Vault policy for venue-service
path "database/creds/venue-service" {
  capabilities = ["read"]
}
```

```bash
# Verify rotation is working
vault read database/creds/venue-service
# TTL should be 30 days by default
```

### Manual Rotation (If Required)

#### Step 1: Create New User
```sql
-- Connect to PostgreSQL
CREATE ROLE venue_service_v2 WITH LOGIN PASSWORD 'new_secure_password';
GRANT venue_service_role TO venue_service_v2;
```

#### Step 2: Update Secrets
```bash
vault kv put secret/venue-service/database \
  username=venue_service_v2 \
  password='new_secure_password'
```

#### Step 3: Rolling Restart
```bash
kubectl rollout restart deployment/venue-service
kubectl rollout status deployment/venue-service
```

#### Step 4: Remove Old User
```sql
-- After all pods using new credentials
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM venue_service_v1;
DROP ROLE venue_service_v1;
```

---

## 3. Redis Password Rotation

### Procedure

#### Step 1: Update Redis AUTH
```bash
# Connect to Redis
redis-cli -h redis.tickettoken.svc.cluster.local

# Set new password (Redis 6+)
CONFIG SET requirepass "new_secure_password"
CONFIG REWRITE

# For Redis Cluster
redis-cli --cluster call <cluster-node>:6379 CONFIG SET requirepass "new_password"
```

#### Step 2: Update Application Secrets
```bash
vault kv put secret/venue-service/redis \
  password='new_secure_password'

kubectl rollout restart deployment/venue-service
```

#### Step 3: Verify Connectivity
```bash
kubectl exec -it deployment/venue-service -- \
  node -e "require('ioredis').createClient().ping().then(console.log)"
```

---

## 4. Stripe API Key Rotation (SK5)

### Prerequisites
- Stripe Dashboard admin access
- Webhook endpoint reconfiguration capability

### Procedure

#### Step 1: Create New API Key in Stripe Dashboard
1. Go to Stripe Dashboard → Developers → API Keys
2. Click "Create restricted key" or "Roll" on existing key
3. Copy new secret key (only shown once)

#### Step 2: Update Secrets
```bash
# Store new key
vault kv put secret/venue-service/stripe \
  secret_key='sk_live_new...' \
  publishable_key='pk_live_...' \
  webhook_secret='whsec_...'

# Update Kubernetes secret
kubectl create secret generic stripe-keys \
  --from-literal=STRIPE_SECRET_KEY='sk_live_new...' \
  --dry-run=client -o yaml | kubectl apply -f -
```

#### Step 3: Rolling Restart
```bash
kubectl rollout restart deployment/venue-service
```

#### Step 4: Verify Webhook
```bash
# Test webhook endpoint
curl -X POST https://api.tickettoken.com/api/venues/stripe/webhook \
  -H "stripe-signature: test" \
  -d '{"type":"test"}'
# Should return 400 (invalid signature) not 500

# Monitor logs for successful webhooks
kubectl logs -l app=venue-service | grep "webhook"
```

#### Step 5: Revoke Old Key
1. Go to Stripe Dashboard → Developers → API Keys
2. Click "..." on old key → "Delete"

---

## 5. Internal Service Secret Rotation

### Procedure

#### Step 1: Generate New Secret
```bash
# Generate cryptographically secure secret
openssl rand -base64 32 > internal_service_secret.txt
```

#### Step 2: Dual-Accept Period
```bash
# Update venue-service to accept both old and new
vault kv put secret/venue-service/internal \
  secret_new=$(cat internal_service_secret.txt) \
  secret_old=$CURRENT_SECRET

kubectl set env deployment/venue-service \
  INTERNAL_SERVICE_SECRET_NEW="$(cat internal_service_secret.txt)" \
  INTERNAL_SERVICE_SECRET_OLD="$CURRENT_SECRET"
```

#### Step 3: Update Calling Services
```bash
# Update all services that call venue-service
for svc in auth-service event-service ticket-service; do
  vault kv put secret/${svc}/outbound \
    venue_service_secret=$(cat internal_service_secret.txt)
  kubectl rollout restart deployment/${svc}
done
```

#### Step 4: Remove Old Secret
```bash
vault kv put secret/venue-service/internal \
  secret=$(cat internal_service_secret.txt)

kubectl set env deployment/venue-service \
  INTERNAL_SERVICE_SECRET="$(cat internal_service_secret.txt)" \
  INTERNAL_SERVICE_SECRET_OLD-
```

---

## Monitoring & Alerts

### Key Expiry Alerts
```yaml
# Prometheus alert for upcoming key expiry
groups:
  - name: key_rotation
    rules:
      - alert: JWTKeyExpiryWarning
        expr: (jwt_key_expiry_timestamp - time()) < 604800  # 7 days
        labels:
          severity: warning
        annotations:
          summary: "JWT signing key expires in less than 7 days"
          
      - alert: StripeKeyExpiryWarning
        expr: (stripe_key_created_timestamp + 31536000 - time()) < 2592000  # 30 days before 1 year
        labels:
          severity: warning
        annotations:
          summary: "Stripe API key should be rotated"
```

### Rotation Metrics
```typescript
// Add to venue-service metrics
const keyRotationGauge = new Gauge({
  name: 'secret_last_rotation_timestamp',
  help: 'Timestamp of last secret rotation',
  labelNames: ['secret_type'],
});
```

---

## Emergency Rotation (Compromised Key)

If a key is suspected to be compromised:

1. **Immediately** generate new keys
2. **Revoke** old keys in external systems (Stripe, etc.)
3. **Deploy** new keys to all services simultaneously
4. **Invalidate** all active sessions/tokens if JWT key
5. **Audit** logs for unauthorized access
6. **Report** to security team

```bash
# Emergency JWT rotation script
./scripts/emergency-jwt-rotate.sh --force --notify-users
```

---

## Audit Trail

All key rotations should be logged:

```json
{
  "event": "key_rotation",
  "secret_type": "jwt_signing_key",
  "rotated_by": "platform-engineer@tickettoken.com",
  "timestamp": "2025-01-01T00:00:00Z",
  "reason": "scheduled_rotation",
  "jira_ticket": "SEC-1234"
}
```
