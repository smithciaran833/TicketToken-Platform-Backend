## Service-to-Service Authentication Audit: analytics-service

### Audit Against: `Docs/research/05-service-to-service-auth.md`

---

## Service Client Checklist (Calling Other Services)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Service uses mTLS OR signed tokens for outbound calls | ❌ FAIL | No mTLS/JWT for internal calls. `config/index.ts` shows plain HTTP URLs for services |
| 2 | Service credentials NOT hardcoded in source code | ⚠️ PARTIAL | Secrets manager used (`secrets.ts`) but hardcoded fallbacks exist |
| 3 | Credentials retrieved from secrets manager at runtime | ✅ PASS | `secrets.ts` uses `secretsManager.getSecrets()` |
| 4 | Each service has unique credentials | ⚠️ PARTIAL | Common DB credentials, not per-service |
| 5 | Short-lived credentials used (< 1 hour preferred) | ❌ FAIL | JWT `expiresIn: '7d'` - 7 days is too long |
| 6 | Credential rotation automated | ❓ UNKNOWN | Not visible in code |
| 7 | Failed authentication attempts logged | ✅ PASS | Auth middleware logs failures |

**Service URLs (config/index.ts:54-61):**
```typescript
services: {
  auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
  venue: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
  // ...
},
// ❌ Using HTTP, not HTTPS
// ❌ No service authentication tokens configured
```

---

## Service Endpoint Checklist (Receiving Requests)

### Authentication Enforcement

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | ALL endpoints require authentication | ✅ PASS | Routes use `app.addHook('onRequest', authenticate)` |
| 2 | Authentication middleware applied globally | ✅ PASS | Hook at route plugin level |
| 3 | Token verification uses cryptographic validation | ✅ PASS | `jwt.verify(token, config.jwt.secret)` |
| 4 | Tokens verified with signature check | ✅ PASS | Uses `jwt.verify()` not `jwt.decode()` |
| 5 | Token expiration (`exp`) checked | ✅ PASS | Handles `TokenExpiredError` |
| 6 | Token issuer (`iss`) validated | ❌ FAIL | No `iss` validation in verify options |
| 7 | Token audience (`aud`) validated | ❌ FAIL | No `aud` validation in verify options |

**JWT Verification (auth.middleware.ts:40):**
```typescript
const decoded = jwt.verify(token, config.jwt.secret) as any;
// ❌ MISSING issuer validation
// ❌ MISSING audience validation
// ❌ MISSING algorithm specification

// Should be:
const decoded = jwt.verify(token, config.jwt.secret, {
  algorithms: ['RS256'],
  issuer: 'tickettoken-auth-service',
  audience: 'tickettoken-services'
}) as any;
```

### Authorization

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 8 | Service identity extracted from request | ❌ FAIL | No service identity verification |
| 9 | Per-endpoint authorization rules | ✅ PASS | Uses `authorize(['analytics.read'])` etc. |
| 10 | Allowlist of services for each endpoint | ❌ FAIL | No service-level allowlists |
| 11 | Unauthorized access attempts logged | ⚠️ PARTIAL | Returns 403 but doesn't explicitly log |
| 12 | No default-allow authorization policy | ✅ PASS | `authorize()` denies if permission not found |

---

## Service Identity Verification Checklist

### For JWT Service Tokens

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 7 | Token signature algorithm is RS256/ES256 (asymmetric) | ❌ FAIL | No algorithm specified, likely HS256 (symmetric) |
| 8 | Public key retrieved securely | N/A | Using symmetric key |
| 9 | `sub` claim contains service identity | ⚠️ PARTIAL | Contains user ID, not service ID |
| 10 | `iss` claim validated | ❌ FAIL | Not validated |
| 11 | `aud` claim validated | ❌ FAIL | Not validated |
| 12 | `exp` claim checked | ✅ PASS | Checked |
| 13 | Token not accepted if expired | ✅ PASS | Returns 401 on expiration |

---

## Message Queue Security Checklist

### RabbitMQ

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | TLS/SSL enabled for connections | ❌ FAIL | Uses `amqp://` not `amqps://` |
| 2 | Each service has unique credentials | ❌ FAIL | Single shared URL from config |
| 3 | Permissions restricted per service | ❌ FAIL | No per-service permissions visible |
| 4 | Virtual hosts used to isolate environments | ❓ UNKNOWN | Not visible in code |
| 5 | Default guest user disabled | ❓ UNKNOWN | Infrastructure level |
| 6 | Management plugin access restricted | ❓ UNKNOWN | Infrastructure level |

**RabbitMQ Connection (rabbitmq.ts:10):**
```typescript
amqp.connect(config.rabbitmq.url, (error: any, conn: any) => {
  // ...
});

// config/index.ts:36-40
rabbitmq: {
  url: process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672',  // ❌ Plain AMQP, not AMQPS
  exchange: process.env.RABBITMQ_EXCHANGE || 'tickettoken_events',
  queue: process.env.RABBITMQ_QUEUE || 'analytics_events',
},
```

**Issues Found:**
1. ❌ Using `amqp://` (unencrypted) instead of `amqps://` (TLS)
2. ❌ No SSL/TLS configuration
3. ❌ Single shared connection URL (no per-service credentials)
4. ❌ Wide routing key binding (`#` = all messages)
```typescript
// rabbitmq.ts:29-31 - Binds to ALL messages
channel.bindQueue(queue.queue, config.rabbitmq.exchange, '#');
// ❌ Should be more specific routing keys
```

---

## Secrets Management Checklist

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Secrets manager in use | ✅ PASS | `secretsManager` from shared utils |
| 2 | No secrets in source code | ❌ FAIL | Hardcoded fallbacks in config |
| 3 | No secrets in env vars for production | ⚠️ PARTIAL | Falls back to env vars |
| 4 | No secrets in CI/CD config files | ❓ UNKNOWN | Not visible |
| 5 | Secrets not logged anywhere | ⚠️ PARTIAL | No explicit logging but no redaction |
| 6 | Each service has unique secrets | ⚠️ PARTIAL | Common DB secrets loaded |
| 7 | Automatic secret rotation configured | ❌ NOT FOUND | No rotation visible |
| 8 | Secret access is audited | ❓ UNKNOWN | Not visible |
| 9 | Least privilege access to secrets | ❓ UNKNOWN | Not visible |
| 10 | Emergency rotation documented | ❓ UNKNOWN | Not visible |

**Secrets Loading (secrets.ts:8-24):**
```typescript
export async function loadSecrets() {
  const commonSecrets = [
    SECRETS_CONFIG.POSTGRES_PASSWORD,
    SECRETS_CONFIG.POSTGRES_USER,
    SECRETS_CONFIG.POSTGRES_DB,
    SECRETS_CONFIG.REDIS_PASSWORD,
  ];
  // ✅ Uses secrets manager
  // ⚠️ Common secrets, not service-specific
}
```

**Hardcoded Fallbacks (config/index.ts) - CRITICAL:**
```typescript
database: {
  password: process.env.DB_PASSWORD || 'postgres',  // ❌ Hardcoded fallback
},
jwt: {
  secret: process.env.JWT_SECRET || 'this-is-a-very-long-secret-key...',  // ❌ Hardcoded
},
influxdb: {
  token: process.env.INFLUXDB_TOKEN || 'my-super-secret-auth-token',  // ❌ Hardcoded
},
privacy: {
  customerHashSalt: process.env.CUSTOMER_HASH_SALT || 'default-salt-change-this',  // ❌ Hardcoded
}
```

---

## Network Security Checklist

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | All internal traffic encrypted (TLS/mTLS) | ❌ FAIL | HTTP URLs for services |
| 2 | Network policies restrict S2S communication | ❓ UNKNOWN | Infrastructure level |
| 3 | Services cannot reach arbitrary external endpoints | ❓ UNKNOWN | Infrastructure level |
| 4 | Egress filtering configured | ❓ UNKNOWN | Infrastructure level |
| 5 | Internal DNS used | ⚠️ PARTIAL | Uses service names but HTTP |
| 6 | No services exposed directly to internet | ❓ UNKNOWN | Infrastructure level |
| 7 | Service mesh or network policies enforce allowlists | ❌ FAIL | No service mesh visible |

---

## Message Gateway Analysis

**Good Practices Found (message-gateway.service.ts):**
```typescript
// ✅ Masks sensitive recipient data before logging
private maskRecipient(recipient: string): string {
  if (recipient.includes('@')) {
    const [user, domain] = recipient.split('@');
    return `${user.substring(0, 2)}***@${domain}`;
  }
  return '***';
}

// ✅ Logs with masked data
this.log.info('Message queued', { 
  messageId: message.id, 
  channel, 
  recipient: this.maskRecipient(recipient) 
});
```

**Issues Found:**
- ❌ No authentication between analytics service and notification service
- ❌ Messages published without signing/encryption
- ❌ No message integrity verification

---

## Summary

### Critical Issues (Must Fix Before Production)
| Issue | Location | Risk |
|-------|----------|------|
| No mTLS/TLS for internal service calls | `config/index.ts` | MITM attacks, credential theft |
| RabbitMQ uses plain AMQP (no TLS) | `config/rabbitmq.ts` | Message interception |
| JWT missing issuer/audience validation | `auth.middleware.ts` | Token substitution attacks |
| Hardcoded secret fallbacks | `config/index.ts` | Credential exposure |
| No service identity verification | Auth middleware | Any client with valid user token can call |
| JWT uses symmetric signing (HS256) | Implied | Secret must be shared across services |
| JWT expiration too long (7 days) | `config/index.ts` | Extended window for token abuse |

### High Issues (Should Fix)
| Issue | Location | Risk |
|-------|----------|------|
| No algorithm specified for JWT | `auth.middleware.ts` | Algorithm confusion attacks |
| Wide RabbitMQ routing key binding (#) | `rabbitmq.ts` | Receives all messages |
| No per-service RabbitMQ credentials | Config | Cannot revoke single service access |
| No service-level authorization | Routes | All authenticated users have access |

### Compliance Score: 28% (10/36 checks passed)

- ✅ PASS: 10
- ⚠️ PARTIAL: 7
- ❌ FAIL: 14
- ❓ UNKNOWN: 9
- N/A: 1

### Priority Fixes

1. **Enable TLS for RabbitMQ:**
```typescript
amqp.connect({
  protocol: 'amqps',
  hostname: process.env.RABBITMQ_HOST,
  port: 5671,
  ssl: { ca: [fs.readFileSync('/etc/ssl/rabbitmq-ca.pem')] }
});
```

2. **Add JWT validation options:**
```typescript
const decoded = jwt.verify(token, config.jwt.secret, {
  algorithms: ['RS256'],
  issuer: 'tickettoken-auth-service',
  audience: 'analytics-service'
});
```

3. **Use HTTPS for internal service calls**

4. **Remove hardcoded secret fallbacks**

5. **Implement service identity verification** for service-to-service calls

6. **Reduce JWT expiration** to 15-60 minutes
