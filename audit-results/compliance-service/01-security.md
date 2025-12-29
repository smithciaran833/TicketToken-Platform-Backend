## Compliance Service Security Audit Report
### Audited Against: Docs/research/01-security.md

---

## 🔴 CRITICAL FINDINGS

### SEC-EXT6 | Hardcoded Database Password
**Severity:** CRITICAL  
**File:** `src/config/database.ts` (line 8)  
**Evidence:**
```typescript
password: process.env.DB_PASSWORD || 'TicketToken2024Secure!',
```
**Violation:** Hardcoded credential fallback exposes real password pattern in source code.  
**Fix:** Remove fallback, require env variable: `password: process.env.DB_PASSWORD!`

---

### SEC-EXT3 | Hardcoded Webhook Secret
**Severity:** CRITICAL  
**File:** `src/routes/webhook.routes.ts` (line 4)  
**Evidence:**
```typescript
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'webhook-secret-change-in-production';
```
**Violation:** Hardcoded secret fallback enables authentication bypass in environments without proper configuration.  
**Fix:** Fail fast if secret not provided:
```typescript
if (!process.env.WEBHOOK_SECRET) throw new Error('WEBHOOK_SECRET required');
```

---

### SEC-EXT1 | Webhook Signature Not Cryptographically Verified
**Severity:** CRITICAL  
**File:** `src/middleware/auth.middleware.ts` (lines 59-66)  
**Evidence:**
```typescript
export function webhookAuth(secret: string) {
  return async (request, reply): Promise<void> => {
    const signature = request.headers['x-webhook-signature'] as string;
    if (!signature || signature !== secret) {  // Simple string comparison!
      return reply.code(401).send({ error: 'Invalid webhook signature' });
    }
  };
}
```
**Violation:** Uses simple string comparison instead of HMAC-based signature verification. Attacker can send header `x-webhook-signature: webhook-secret-change-in-production` to bypass.  
**Fix:** Implement proper HMAC signature verification:
```typescript
import crypto from 'crypto';
const expectedSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) { ... }
```

---

## 🟠 HIGH FINDINGS

### SEC-R7-R12 | Rate Limiting NOT Applied
**Severity:** HIGH  
**File:** `src/server.ts`  
**Evidence:** Rate limiting middleware (`rate-limit.middleware.ts`) exists but is **NOT registered** in server.ts.
```typescript
// server.ts imports - NO rate limiting!
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
// MISSING: import { setupRateLimiting } from './middleware/rate-limit.middleware';
```
**Violation:** No rate limiting on any endpoints including auth-sensitive routes.  
**Fix:** Register rate limiting in server.ts:
```typescript
import { setupRateLimiting } from './middleware/rate-limit.middleware';
await setupRateLimiting(app);
```

---

### SEC-R3 | JWT Algorithm Not Explicitly Whitelisted
**Severity:** HIGH  
**File:** `src/middleware/auth.middleware.ts` (line 33)  
**Evidence:**
```typescript
const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
// No algorithm option specified!
```
**Violation:** Missing `algorithms` option allows algorithm confusion attacks (HS256 vs RS256, alg:none).  
**Fix:** Explicitly whitelist algorithm:
```typescript
const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as AuthUser;
```

---

### SEC-S3/SEC-S4 | Missing Role Checks (BFLA)
**Severity:** HIGH  
**File:** `src/routes/risk.routes.ts`  
**Evidence:**
```typescript
// These routes are inside authenticated scope but NO role check:
fastify.get('/risk/:entityId/score', riskController.calculateRiskScore);  // Any user can get risk scores
fastify.post('/risk/flag', riskController.flagVenue);                       // Any user can flag venues!
fastify.post('/risk/resolve', riskController.resolveFlag);                  // Any user can resolve flags!
```
**Violation:** BFLA - authenticated users can perform compliance officer actions (flagging/resolving risk).  
**Fix:** Add `requireComplianceOfficer` to all risk modification routes.

---

### SEC-S1/SEC-S2 | Potential BOLA in GDPR Routes
**Severity:** HIGH  
**File:** `src/routes/gdpr.routes.ts` (lines 24-29, 44-49)  
**Evidence:**
```typescript
fastify.post('/privacy/export', async (request, reply) => {
  const { userId, reason } = request.body as { userId: string; reason: string };
  // NO verification that request.user.id === userId!
  const result = await privacyExportService.requestDataExport(userId, reason);
  ...
});
```
**Violation:** User ID from request body without ownership verification allows any authenticated user to request data export/deletion for ANY user.  
**Fix:** Either use `request.user.id` directly OR verify ownership:
```typescript
if (request.user.id !== userId && !request.user.roles?.includes('admin')) {
  return reply.code(403).send({ error: 'Cannot request data for other users' });
}
```

---

### SEC-DB1 | No TLS/SSL for Database Connection
**Severity:** HIGH  
**File:** `src/config/database.ts`  
**Evidence:**
```typescript
export const dbConfig = {
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '6432'),
  // NO ssl configuration!
};
```
**Violation:** Database connection not explicitly configured for TLS.  
**Fix:** Add SSL configuration:
```typescript
ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
```

---

## 🟡 MEDIUM FINDINGS

### SEC-DB10 | Sensitive Data in Console Logs
**Severity:** MEDIUM  
**Files:** Multiple files use `console.log` with request bodies  
**Evidence:**
- `src/routes/webhook.routes.ts`: `console.log('Tax update webhook received', { tenantId, body: request.body });`
- `src/config/database.ts`: `console.log('📦 Database config loaded for:', dbConfig.database);`
**Violation:** Console.log may expose sensitive data in production logs.  
**Fix:** Use structured logger with redaction:
```typescript
logger.info({ tenantId, event: 'tax-update' }, 'Webhook received');  // Don't log full body
```

---

### SEC-R14 | HSTS Not Explicitly Configured
**Severity:** MEDIUM  
**File:** `src/server.ts`  
**Evidence:**
```typescript
await app.register(helmet);  // Default helmet options
```
**Violation:** Helmet registered with defaults, HSTS should be explicitly configured for production.  
**Fix:** Configure HSTS explicitly:
```typescript
await app.register(helmet, {
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
});
```

---

### Metrics Route Not Registered
**Severity:** MEDIUM  
**File:** `src/server.ts`  
**Evidence:** `metrics.routes.ts` exists but is NOT imported or registered in server.ts.  
**Impact:** Prometheus metrics endpoint is not available, monitoring gaps.  
**Fix:** Register metrics routes in server.ts.

---

## ✅ PASSING CHECKS

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| SEC-R1 | Protected routes use auth middleware | ✅ PASS | `authenticate` hook applied to API scope in server.ts |
| SEC-R2 | Auth middleware verifies JWT signature | ✅ PASS | `jwt.verify(token, JWT_SECRET)` used |
| SEC-R4 | Token expiration validated | ✅ PASS | `jwt.verify()` automatically validates `exp` |
| SEC-R5 | Auth rejects expired tokens | ✅ PASS | jwt.verify throws on expired tokens |
| SEC-R6 | JWT_SECRET not hardcoded | ✅ PASS | `JWT_SECRET = process.env.JWT_SECRET` with fail-fast |
| SEC-S5 | Multi-tenant data isolation | ✅ PASS | `tenant_id` required in JWT, set on `request.tenantId` |
| SEC-EXT13 | Secrets in .gitignore | ✅ PASS | `.env` in root .gitignore |
| SEC-EXT15 | Secrets manager used | ✅ PASS | `secretsManager` from shared utils in secrets.ts |

---

## 📊 SUMMARY

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 3 |
| 🟠 HIGH | 5 |
| 🟡 MEDIUM | 3 |
| ✅ PASS | 8 |

---

## 🛠️ RECOMMENDED PRIORITY FIXES

1. **[IMMEDIATE]** Remove hardcoded database password fallback
2. **[IMMEDIATE]** Remove hardcoded webhook secret fallback  
3. **[IMMEDIATE]** Implement HMAC-based webhook signature verification
4. **[24-48 HOURS]** Register rate limiting middleware in server.ts
5. **[24-48 HOURS]** Add algorithm whitelist to JWT verification
6. **[24-48 HOURS]** Fix BFLA in risk routes - add role checks
7. **[24-48 HOURS]** Fix BOLA in GDPR routes - verify ownership
8. **[1 WEEK]** Enable TLS for database connections
9. **[1 WEEK]** Replace console.log with structured logger
