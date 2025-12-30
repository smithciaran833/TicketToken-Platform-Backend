# Secret Rotation Procedures

## JWT Keys

### Rotation Steps
1. Generate new key pair
2. Add as JWT_PRIVATE_KEY_NEW / JWT_PUBLIC_KEY_NEW
3. Deploy - service now signs with new, verifies both
4. Wait for old tokens to expire (7 days for refresh)
5. Move new keys to primary, remove old
6. Deploy final config

### Commands
```bash
# Generate new key pair
openssl genrsa -out jwt-private-new.pem 2048
openssl rsa -in jwt-private-new.pem -pubout -out jwt-public-new.pem

# Update secrets manager
aws secretsmanager update-secret --secret-id auth/jwt-private-new --secret-string file://jwt-private-new.pem
```

## Database Credentials
1. Create new DB user with same permissions
2. Update secrets manager with new credentials
3. Rolling restart of service
4. Verify connections using new credentials
5. Drop old DB user

## Redis Password
1. Update Redis AUTH password
2. Update secrets manager
3. Rolling restart of service

## Encryption Key
⚠️ CAUTION: Rotating encryption key requires re-encrypting all encrypted data.

1. Add new key as ENCRYPTION_KEY_NEW
2. Deploy migration to re-encrypt MFA secrets
3. Verify all data re-encrypted
4. Swap keys
5. Remove old key

## Schedule
| Secret | Rotation Frequency |
|--------|-------------------|
| JWT Keys | 90 days |
| DB Credentials | 90 days |
| Redis Password | 90 days |
| Encryption Key | Annually |
| OAuth Secrets | Per provider policy |
