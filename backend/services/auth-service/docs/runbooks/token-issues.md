# Token Issues Runbook

## Symptoms
- "Token expired" errors for recently issued tokens
- "Invalid token" errors
- Token refresh failing

## Diagnosis

### 1. Decode Token (without verification)
```bash
# JWT.io or:
echo "<token>" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq
```

### 2. Check Token Claims
- `exp`: Expiry timestamp
- `iat`: Issued at timestamp
- `sub`: User ID
- `tenant_id`: Should be present

### 3. Check Key Mismatch
```bash
# List available keys
kubectl exec -it <pod> -- node -e "console.log(require('./dist/services/jwt.service').getJWKS())"
```

### 4. Check Redis for Refresh Token
```bash
redis-cli GET "tenant:<tenant_id>:refresh_token:<jti>"
```

## Resolution

### Token Expired
- Normal behavior - client should refresh
- If access token TTL too short, adjust JWT_ACCESS_EXPIRES_IN

### Invalid Signature
1. Check if key rotation recently occurred
2. Old tokens signed with previous key should still validate (if previous key loaded)
3. User may need to re-login

### Refresh Token Not Found
1. Token was revoked (logout, password change)
2. Token expired (7 day TTL)
3. Redis data loss - user needs to re-login

### Token Reuse Detected
Security feature - entire token family revoked. User must re-authenticate.

## Escalation
- Suspected token theft/replay attack: Security Team
