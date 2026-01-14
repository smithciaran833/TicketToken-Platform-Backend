# Transfer Service - Known Problems & Issues

> Generated from comprehensive code review on $(date +%Y-%m-%d)

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 4 |
| 🟠 High | 7 |
| 🟡 Medium | 7 |
| 🔵 Code Quality | 4 |
| **Total** | **22** |

---

## 🔴 Critical Security Issues

### 1. SQL Injection Vulnerability
- **File:** `src/services/transfer-analytics.service.ts`
- **Function:** `getTransferVelocity()`
- **Issue:** String interpolation used for SQL query parameter
- **Code:**
```typescript
// VULNERABLE
`AND created_at >= NOW() - INTERVAL '${hours} hours'`
```
- **Fix:**
```typescript
// SAFE - Use parameterized query
`AND created_at >= NOW() - INTERVAL '1 hour' * $2`, [tenantId, hours]
```
- **Impact:** Attacker could execute arbitrary SQL commands

---

### 2. Stub Authentication in WebSocket Service
- **File:** `src/services/event-stream.service.ts`
- **Function:** `verifyToken()`
- **Issue:** Authentication stub returns `true` for all requests
- **Code:**
```typescript
// DANGEROUS - No real authentication
private async verifyToken(token: string, userId: string): Promise<boolean> {
  return true;
}
```
- **Fix:**
```typescript
private async verifyToken(token: string, userId: string): Promise<boolean> {
  try {
    const decoded = await verifyJwt(token);
    return decoded.sub === userId && decoded.tenantId === this.currentTenantId;
  } catch {
    return false;
  }
}
```
- **Impact:** Any user can connect to any WebSocket room without authentication

---

### 3. Weak Random Number Generation (Batch IDs)
- **File:** `src/services/batch-transfer.service.ts`
- **Function:** `generateBatchId()`
- **Issue:** Uses `Math.random()` which is not cryptographically secure
- **Code:**
```typescript
// WEAK - Predictable
Math.random().toString(36).substr(2, 9)
```
- **Fix:**
```typescript
import crypto from 'crypto';
crypto.randomBytes(12).toString('hex')
```
- **Impact:** Batch IDs could be predicted by attackers

---

### 4. Weak Random Number Generation (Distributed Locks)
- **File:** `src/utils/distributed-lock.ts`
- **Function:** `generateLockValue()`
- **Issue:** Uses `Math.random()` for lock values
- **Code:**
```typescript
// WEAK - Predictable
Math.random().toString(36)
```
- **Fix:**
```typescript
import crypto from 'crypto';
crypto.randomBytes(16).toString('hex')
```
- **Impact:** Lock values could be guessed, allowing unauthorized lock release

---

## 🟠 High Priority Issues

### 5. Duplicate Signal Handlers
- **File:** `src/index.ts`
- **Issue:** SIGTERM and SIGINT handlers registered twice
- **Code:**
```typescript
// First registration
process.on('SIGTERM', () => {
  logger.info('SIGTERM received - initiating graceful shutdown');
});

// Later in file - second registration
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing database pool');
  await pool.end();
  process.exit(0);
});
```
- **Fix:** Remove duplicate handlers, consolidate into single handler
- **Impact:** Race condition during shutdown, unpredictable behavior

---

### 6. Module Throws on Import
- **File:** `src/config/solana.config.ts`
- **Issue:** Missing env vars cause crash at module import time
- **Code:**
```typescript
// Throws during import if env vars missing
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
```
- **Fix:** Use lazy initialization or factory pattern
- **Impact:** Cannot import module for testing without setting all env vars

---

### 7. Environment Pollution
- **File:** `src/config/secrets.ts`
- **Issue:** Secrets written directly to `process.env`
- **Code:**
```typescript
process.env[key] = secrets[key];
```
- **Fix:** Use isolated config object instead of mutating process.env
- **Impact:** Test pollution, secrets persist across test runs

---

### 8. RPC Health Check Interval Not Cleaned
- **File:** `src/utils/rpc-failover.ts`
- **Issue:** `setInterval` for health checks never cleared
- **Fix:** Add cleanup in shutdown handler
- **Impact:** Interval continues running after shutdown, prevents clean exit

---

### 9. Connection Cache Memory Leak
- **File:** `src/utils/rpc-failover.ts`
- **Issue:** `connectionCache` Map grows unbounded
- **Code:**
```typescript
const connectionCache = new Map<string, Connection>();
// Entries added but never removed
```
- **Fix:** Add LRU eviction or max size limit
- **Impact:** Memory grows indefinitely in long-running processes

---

### 10. Pool Event Handlers Not Removable
- **File:** `src/config/database.ts`
- **Issue:** Event handlers on pool cannot be removed for testing
- **Code:**
```typescript
pool.on('error', (err) => { ... });
pool.on('connect', (client) => { ... });
```
- **Fix:** Store handler references for removal, or use once() where appropriate
- **Impact:** Cannot cleanly recreate pool in tests

---

### 11. Redis Retry Gives Up Permanently
- **File:** `src/config/redis.ts`
- **Issue:** After 10 failed retries, reconnection stops forever
- **Code:**
```typescript
retryStrategy: (times: number) => {
  if (times > 10) {
    return null; // Stop retrying forever
  }
  return Math.min(times * 100, 3000);
}
```
- **Fix:** Always return a delay for infinite retry with exponential backoff
- **Impact:** Redis connection lost permanently after transient network issues

---

## 🟡 Medium Priority Issues

### 12. Duplicate Request ID Middleware Files
- **Files:** `src/middleware/request-id.ts` AND `src/middleware/requestId.ts`
- **Issue:** Two files implementing the same functionality
- **Fix:** Delete one, update imports
- **Impact:** Confusion, potential inconsistency

---

### 13. Duplicate Schema Definitions
- **Files:** `src/schemas/validation.ts` AND `src/validators/schemas.ts`
- **Issue:** `uuidSchema`, `emailSchema`, `paginationSchema` defined in both
- **Fix:** Consolidate into single schema file, re-export as needed
- **Impact:** Maintenance burden, potential inconsistency

---

### 14. No DATABASE_URL Support
- **File:** `src/config/database.ts`
- **Issue:** Only supports individual connection params
- **Fix:** Add `DATABASE_URL` parsing with fallback to individual params
- **Impact:** Cannot use standard connection string format

---

### 15. Missing Idempotency Response Capture
- **File:** `src/routes/transfer.routes.ts`
- **Issue:** No `captureIdempotencyResponse()` call after controller
- **Fix:** Add response capture hook
- **Impact:** Idempotency not fully working for transfer endpoints

---

### 16. No Route-Specific Rate Limits
- **File:** `src/routes/transfer.routes.ts`
- **Issue:** Uses only global rate limit, no endpoint-specific limits
- **Fix:** Add transfer-specific rate limits per endpoint
- **Impact:** All transfer endpoints share same limit

---

### 17. Dynamic Imports in Health Checks
- **File:** `src/routes/health.routes.ts`
- **Issue:** Uses `await import()` in health check handlers
- **Code:**
```typescript
const cacheModule = await import('../services/cache.service');
```
- **Fix:** Import at module level or inject dependencies
- **Impact:** Added latency on every health check request

---

### 18. Logger Silent in Test Mode
- **File:** `src/utils/logger.ts`
- **Issue:** Logger level set to 'silent' in test environment
- **Fix:** Allow override via environment variable
- **Impact:** Cannot debug test failures using log output

---

## 🔵 Code Quality Issues

### 19. Duplicate Error Class Definitions
- **Files:** `src/models/transfer.model.ts` AND `src/errors/index.ts`
- **Issue:** `TransferError`, `TransferNotFoundError`, `TransferExpiredError`, etc. defined in both
- **Fix:** Use single source of truth in `errors/index.ts`
- **Impact:** Confusion about which error class to use

---

### 20. Two Rate Limit Implementations
- **Files:** `src/middleware/rate-limit.middleware.ts` AND `src/middleware/rate-limit.ts`
- **Issue:** Two different rate limiting implementations exist
- **Fix:** Consolidate into single implementation
- **Impact:** Unclear which implementation is active

---

### 21. Memory Cache Cleanup Interval Not Stopped
- **File:** `src/services/cache.service.ts`
- **Issue:** Cleanup interval runs forever, not stopped on shutdown
- **Code:**
```typescript
setInterval(() => {
  // cleanup expired entries
}, 60000);
```
- **Fix:** Store interval ID, clear in shutdown handler
- **Impact:** Prevents clean process exit

---

### 22. Idempotency Cache Cleanup Not Stopped
- **File:** `src/middleware/idempotency.ts`
- **Issue:** Memory cache cleanup interval not cleared on shutdown
- **Fix:** Store interval ID, clear in shutdown handler
- **Impact:** Prevents clean process exit

---

## Recommended Fix Priority

### Immediate (Before Any Testing)
1. Fix SQL injection (#1)
2. Implement real WebSocket auth (#2)
3. Replace Math.random() with crypto (#3, #4)
4. Remove duplicate signal handlers (#5)

### Before Integration Testing
5. Fix module import throwing (#6)
6. Fix environment pollution (#7)
7. Add cleanup for intervals (#8, #21, #22)

### Before Production
8. Fix memory leak in RPC failover (#9)
9. Fix Redis retry strategy (#11)
10. Consolidate duplicate files (#12, #13, #19, #20)

### Technical Debt (Scheduled)
11. Add DATABASE_URL support (#14)
12. Add idempotency response capture (#15)
13. Add route-specific rate limits (#16)
14. Fix dynamic imports (#17)
15. Make logger testable (#18)

---

## References

- [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [Node.js Crypto Module](https://nodejs.org/api/crypto.html)
- [Graceful Shutdown Best Practices](https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/)
