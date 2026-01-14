# Integration Service TypeScript Remediation Plan

**Date:** January 5, 2026  
**Total Errors:** 210 errors across 30 files  
**Estimated Effort:** 4-6 hours

---

## Executive Summary

The integration service has significant TypeScript compilation errors primarily caused by a configuration module issue that cascades into ~150 errors. This document provides a prioritized remediation plan with specific fixes for each file.

---

## Error Categories Overview

| Category | Error Count | Priority | Effort |
|----------|-------------|----------|--------|
| Config Structure Mismatch | ~150 | P1 - Critical | 1 hour |
| Missing Exports/Imports | 7 | P2 - High | 30 min |
| Knex Type Issues | 3 | P2 - High | 15 min |
| Implicit `any` Types | ~15 | P3 - Medium | 30 min |
| Wrong Function Signatures | 3 | P3 - Medium | 15 min |
| Winston/Fastify API Issues | 6 | P3 - Medium | 30 min |
| Express/Fastify Type Conflicts | 6 | P4 - Low | 30 min |
| Module Augmentation Issues | 2 | P4 - Low | 15 min |

---

## Phase 1: Fix Root Cause (Priority 1)

### Task 1.1: Fix `src/config/index.ts` (Fixes ~150 errors)

**Problem:** Duplicate `export const config` declarations at lines 207 and 375.

**Solution:** Remove the first `config` export and keep only the nested structure export that other files expect.

```typescript
// REMOVE line 207:
// export const config = getConfig();

// KEEP lines 375+: The nested config structure
export const config = {
  server: { ... },
  database: { ... },
  redis: { ... },
  jwt: { ... },
  security: { ... },
  providers: { ... },
  services: { ... },
};

// Also fix the default export at line 356 - it references 'config' before declaration
// Move the default export AFTER the config declaration
```

**Files that will be fixed after this change:**
- `src/config/validate.ts` (55 errors)
- `src/services/providers/stripe-sync.service.ts` (31 errors)
- `src/services/oauth.service.ts` (24 errors)
- `src/providers/quickbooks/quickbooks.provider.ts` (10 errors)
- `src/services/providers/quickbooks-sync.service.ts` (10 errors)
- `src/providers/mailchimp/mailchimp.provider.ts` (7 errors)
- `src/providers/square/square.provider.ts` (7 errors)
- `src/services/token-vault.service.ts` (7 errors)
- `src/middleware/internal-auth.ts` (6 errors)
- `src/providers/stripe/stripe.provider.ts` (4 errors)
- `src/services/cache-integration.ts` (4 errors)
- `src/services/providers/square-sync.service.ts` (4 errors)
- `src/services/providers/mailchimp-sync.service.ts` (2 errors)

---

## Phase 2: Add Missing Exports (Priority 2)

### Task 2.1: Add `initializeRedis` to `src/config/redis.ts`

**Problem:** `src/index.ts` imports `initializeRedis` which doesn't exist.

**Solution:** Add the function:

```typescript
// Add to src/config/redis.ts
export async function initializeRedis(): Promise<void> {
  const client = getRedisClient();
  if (client) {
    await client.ping();
    logger.info('Redis initialized');
  }
}
```

### Task 2.2: Add `redisClient` export to `src/config/redis.ts`

**Problem:** `src/services/monitoring.service.ts` imports `redisClient` which doesn't exist.

**Solution:** Add the export:

```typescript
// Add to src/config/redis.ts
export const redisClient = getRedisClient();
```

Or change the import in monitoring.service.ts to use `getRedisClient()` function.

### Task 2.3: Add `verifyWebhookSignature` to `src/middleware/auth.middleware.ts`

**Problem:** `src/routes/webhook.routes.ts` imports `verifyWebhookSignature` which doesn't exist.

**Solution:** Add the middleware:

```typescript
// Add to src/middleware/auth.middleware.ts
export function verifyWebhookSignature(provider: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Webhook signature verification logic
    const signature = request.headers[`x-${provider}-signature`];
    if (!signature) {
      throw new UnauthorizedError(`Missing ${provider} webhook signature`);
    }
    // Verify signature based on provider
  };
}
```

### Task 2.4: Create `src/middleware/tenant-context.ts`

**Problem:** `src/server.ts` imports `setTenantContext` from a non-existent file.

**Solution:** Create the file:

```typescript
// Create src/middleware/tenant-context.ts
import { FastifyRequest, FastifyReply } from 'fastify';

export async function setTenantContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Extract tenant context from JWT or headers
  const tenantId = request.user?.tenantId || request.headers['x-tenant-id'];
  if (tenantId) {
    (request as any).tenantId = tenantId;
  }
}
```

### Task 2.5: Create `src/config/kms.ts`

**Problem:** `src/services/credential-encryption.service.ts` imports `kmsService` from non-existent file.

**Solution:** Create the KMS service module:

```typescript
// Create src/config/kms.ts
export const kmsService = {
  async encrypt(data: string, context: any) { /* ... */ },
  async decrypt(ciphertext: string, context: any) { /* ... */ },
  async encryptAccessToken(token: string, venueId: string, integrationType: string) { /* ... */ },
  async decryptAccessToken(ciphertext: string, venueId: string, integrationType: string) { /* ... */ },
  async encryptRefreshToken(token: string, venueId: string, integrationType: string) { /* ... */ },
  async decryptRefreshToken(ciphertext: string, venueId: string, integrationType: string) { /* ... */ },
  async encryptApiKey(key: string, venueId: string, integrationType: string, keyName: string) { /* ... */ },
  async decryptApiKey(ciphertext: string, venueId: string, integrationType: string, keyName: string) { /* ... */ },
  async encryptApiSecret(secret: string, venueId: string, integrationType: string, keyName: string) { /* ... */ },
  async decryptApiSecret(ciphertext: string, venueId: string, integrationType: string, keyName: string) { /* ... */ },
  async encryptWebhookSecret(secret: string, venueId: string, integrationType: string) { /* ... */ },
  async decryptWebhookSecret(ciphertext: string, venueId: string, integrationType: string) { /* ... */ },
};
```

### Task 2.6: Create `src/services/recovery.service.ts`

**Problem:** `src/controllers/admin.controller.ts` imports `recoveryService` from non-existent file.

**Solution:** Create the recovery service:

```typescript
// Create src/services/recovery.service.ts
export const recoveryService = {
  async processDeadLetterQueue(): Promise<void> { /* ... */ },
  async recoverStaleOperations(): Promise<void> { /* ... */ },
};
```

---

## Phase 3: Fix Knex Type Issues (Priority 2)

### Task 3.1: Fix `src/config/database.ts`

**Problem:** `Knex.PgConnectionConfig` doesn't exist, `createTimeoutMillis` invalid.

**Solution:**

```typescript
// Change line 30 from:
const connectionConfig: Knex.PgConnectionConfig = {

// To:
const connectionConfig: Knex.StaticConnectionConfig = {

// Also change line 91 similarly

// For line 54, remove createTimeoutMillis:
pool: {
  min: dbConfig.pool.min,
  max: dbConfig.pool.max,
  acquireTimeoutMillis: 30000,
  // Remove: createTimeoutMillis: 30000,
  destroyTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  reapIntervalMillis: 1000,
  createRetryIntervalMillis: 200,
  ...
}
```

---

## Phase 4: Fix Type Annotations (Priority 3)

### Task 4.1: Fix `src/config/queue.ts`

**Problem:** Implicit `any` on `job` and `err` parameters.

**Solution:**

```typescript
import Bull, { Job } from 'bull';

queue.on('completed', (job: Job) => {
  logger.info(`Job completed in ${priority} queue`, { jobId: job.id });
});

queue.on('failed', (job: Job, err: Error) => {
  logger.error(`Job failed in ${priority} queue`, { jobId: job.id, error: err.message });
});
```

### Task 4.2: Fix `src/utils/logger.ts`

**Problem:** `winston.format` not callable, `info` implicit any.

**Solution:**

```typescript
import winston, { format } from 'winston';

// Change line 194 from:
const redactFormat = winston.format((info) => {

// To:
const redactFormat = format((info: winston.Logform.TransformableInfo) => {
  // ...
  return info;
})();
```

### Task 4.3: Fix `src/utils/metrics.ts`

**Problem:** `reply.addHook` doesn't exist on `FastifyReply`.

**Solution:**

```typescript
// Change the approach - hooks should be added to FastifyInstance, not reply
// The httpMetricsHook should be registered differently:

export function registerMetricsHook(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', async (request) => {
    (request as any).startTime = process.hrtime.bigint();
  });
  
  fastify.addHook('onResponse', async (request, reply) => {
    const startTime = (request as any).startTime;
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;
    
    recordHttpRequest(
      request.method,
      request.routeOptions?.url || request.url,
      reply.statusCode,
      durationMs
    );
  });
}
```

---

## Phase 5: Fix Function Signatures (Priority 3)

### Task 5.1: Fix `src/utils/circuit-breaker.ts`

**Problem:** `ServiceUnavailableError` called with wrong arguments.

**Solution:**

```typescript
// Change line 98 from:
throw new ServiceUnavailableError(
  `Service ${this.name} is temporarily unavailable`,
  { retryAfter: Math.ceil(this.resetTimeout / 1000) }
);

// To:
throw new ServiceUnavailableError(this.name);
```

### Task 5.2: Fix `src/middleware/internal-auth.ts`

**Problem:** `ForbiddenError` called with wrong arguments.

**Solution:**

```typescript
// Change from:
throw new ForbiddenError(
  `Permission '${permission}' required`,
  { serviceName: request.internalService?.serviceName }
);

// To:
throw new ForbiddenError(
  `Permission '${permission}' required`,
  request.id as string,
  request.internalService?.serviceName
);
```

---

## Phase 6: Fix Type Conflicts (Priority 4)

### Task 6.1: Fix `src/middleware/validation.middleware.ts`

**Problem:** Express types mixed with Fastify, readonly `request.query`.

**Solution:** Either:
1. Add `@types/express` to devDependencies, OR
2. Remove Express-related code and keep only Fastify implementation

For readonly `request.query`:
```typescript
// Instead of assigning to request.query, create a new validated query object
const validatedQuery = value;
(request as any).validatedQuery = validatedQuery;
```

### Task 6.2: Fix `src/middleware/request-id.middleware.ts`

**Problem:** Module augmentation conflicts with existing Fastify `id` property.

**Solution:**

```typescript
// Change the augmentation to not conflict with existing property
declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    // Remove 'id' - it already exists on FastifyRequest
  }
}

// In the middleware, don't try to set request.id, only set request.requestId
request.requestId = requestId;
// Remove: request.id = requestId;
```

---

## Verification Checklist

After completing all fixes, run these commands to verify:

```bash
# Run TypeScript compiler
npx tsc --noEmit

# Expected: 0 errors

# Run tests
npm test

# Run linter
npm run lint
```

---

## Files Changed Summary

| File | Action |
|------|--------|
| `src/config/index.ts` | Remove duplicate export, reorder default export |
| `src/config/database.ts` | Fix Knex types |
| `src/config/redis.ts` | Add `initializeRedis`, `redisClient` exports |
| `src/config/queue.ts` | Add type annotations |
| `src/config/kms.ts` | **CREATE** - KMS service |
| `src/middleware/auth.middleware.ts` | Add `verifyWebhookSignature` |
| `src/middleware/tenant-context.ts` | **CREATE** - Tenant context middleware |
| `src/middleware/internal-auth.ts` | Fix ForbiddenError call |
| `src/middleware/validation.middleware.ts` | Fix type conflicts |
| `src/middleware/request-id.middleware.ts` | Fix module augmentation |
| `src/services/recovery.service.ts` | **CREATE** - Recovery service |
| `src/utils/logger.ts` | Fix Winston format |
| `src/utils/metrics.ts` | Fix Fastify hooks |
| `src/utils/circuit-breaker.ts` | Fix ServiceUnavailableError call |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking runtime behavior | Medium | High | Thorough testing after changes |
| Missing edge cases | Low | Medium | Review all usages before fixing |
| New type errors | Low | Low | Run tsc after each phase |

---

## Rollback Plan

If issues arise after deployment:
1. Revert to previous commit
2. Document specific issue
3. Address in next iteration

---

## Notes

- The nested config structure at line 375 in `src/config/index.ts` is incomplete and may need additional properties populated based on `getConfig()` values
- Some missing modules (kms.ts, recovery.service.ts, tenant-context.ts) need full implementation, not just stubs
- Consider adding integration tests after fixes to prevent regression
