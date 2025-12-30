# Rate Limiting Runbook

## Symptoms
- Users reporting "Too many requests" errors
- 429 error spike
- Legitimate traffic being blocked

## Diagnosis

### 1. Check Current Limits
| Endpoint | Limit |
|----------|-------|
| Login | 5 per 15 min per IP |
| Registration | 3 per hour per IP |
| Password Reset | 3 per hour per IP |
| OTP Verify | 5 per 5 min per user |

### 2. Check Redis Keys
```bash
# See rate limit state for an IP/user
redis-cli KEYS "login:*" | head -20
redis-cli GET "login:<ip>"
redis-cli TTL "login:<ip>"
```

### 3. Identify Hot IPs
```bash
kubectl logs -l app=auth-service --tail=5000 | grep "429" | jq '.ip' | sort | uniq -c | sort -rn | head
```

## Resolution

### Reset Rate Limit for User/IP
```bash
redis-cli DEL "login:<ip>"
redis-cli DEL "login:<ip>:block"
```

### Temporary Limit Increase
Not recommended - instead:
1. Identify root cause (bot, misconfigured client)
2. Whitelist legitimate high-volume clients at API gateway
3. Fix client-side retry logic

### Block Malicious IP
Add to API gateway blocklist or WAF

## Tuning
Rate limits are configured in `src/utils/rateLimiter.ts`. Changes require deployment.

## Escalation
- DDoS suspected: Page Platform Team + Security
