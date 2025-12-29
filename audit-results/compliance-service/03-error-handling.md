## Compliance Service Error Handling Audit Report
### Audited Against: Docs/research/03-error-handling.md

---

## 🔴 CRITICAL FINDINGS

### RH7 | Stack Traces Exposed in Error Responses
**Severity:** CRITICAL  
**File:** `src/server.ts:146-149`  
**Evidence:**
```typescript
// Error handler
app.setErrorHandler((error, request, reply) => {
  console.error('❌ Error:', error);  // Full error logged including stack
  reply.code(500).send({ error: 'Internal server error' });  // Generic but...
});
```
**Issue:** While the response is generic, the `console.error(error)` logs the full stack trace. In production with console logging to stdout, this could leak to log aggregators without proper redaction.

---

### DS1/DS2/DS3 | No Correlation ID Implementation
**Severity:** CRITICAL  
**File:** `src/server.ts` (entire file)  
**Evidence:** No correlation ID generated, propagated, or logged anywhere.
```typescript
// MISSING: No correlation ID header extraction or generation
// MISSING: No correlation ID in error responses
// MISSING: No correlation ID in logs
```
**Checklist Violation:** DS1, DS2, DS3 all FAIL  
**Impact:** Cannot trace requests across services or correlate logs with user reports.

---

### Process Handler | Missing unhandledRejection Handler
**Severity:** CRITICAL  
**File:** `src/index.ts`  
**Evidence:**
```typescript
// Line 37-50: Only has SIGTERM and SIGINT handlers
process.on('SIGTERM', async () => {...});
process.on('SIGINT', async () => {...});

// MISSING: No unhandledRejection handler!
// MISSING: No uncaughtException handler!
```
**Impact:** Unhandled promise rejections in Node.js 15+ crash the process. Without handlers, crashes won't be properly logged.

---

### RH5 | Error Response NOT RFC 7807 Compliant
**Severity:** HIGH  
**File:** `src/server.ts:147-149`  
**Evidence:**
```typescript
app.setErrorHandler((error, request, reply) => {
  console.error('❌ Error:', error);
  reply.code(500).send({ error: 'Internal server error' });  // ❌ Not RFC 7807!
});
```
**Expected RFC 7807 format:**
```json
{
  "type": "https://api.tickettoken.com/errors/internal",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred",
  "instance": "/api/v1/compliance/venue/start-verification",
  "correlation_id": "req-abc123"
}
```
**Actual format:**
```json
{ "error": "Internal server error" }
```

---

## 🟠 HIGH FINDINGS

### SL3 | Empty Catch Blocks (Error Swallowing)
**Severity:** HIGH  
**File:** `src/services/privacy-export.service.ts` (and others)  
**Evidence from decryptFields function in encryption.util.ts:**
```typescript
// src/utils/encryption.util.ts:130-134
} catch (error: any) {
  // If decryption fails, field might not be encrypted
  logger.warn(`Failed to decrypt field ${String(field)}, keeping original value`);
  // ← Error is logged but swallowed, processing continues
}
```
**Issue:** Error is caught but not rethrown - data corruption could go unnoticed.

---

### SL1 | Services Missing try/catch on Database Operations
**Severity:** HIGH  
**Files:** Multiple service files  

**`src/services/risk.service.ts`** - NO try/catch blocks:
```typescript
async calculateRiskScore(venueId: string, tenantId: string) {
  // Line 7-50: ALL database operations UNPROTECTED
  const verificationResult = await db.query(...);  // No try/catch!
  const ofacResult = await db.query(...);          // No try/catch!
  await db.query('INSERT INTO risk_assessments...');  // No try/catch!
}

async flagForReview(...) {
  await db.query('INSERT INTO risk_flags...');  // No try/catch!
}

async resolveFlag(...) {
  await db.query('UPDATE risk_flags...');  // No try/catch!
}
```

**`src/services/tax.service.ts`** - INCONSISTENT error handling:
```typescript
async trackSale(...) {
  try { ... } catch { ... }  // ✅ Has try/catch
}

async getVenueTaxSummary(...) {
  // Lines 49-77: NO try/catch!
}

async calculateTax(...) {
  // Lines 79-99: NO try/catch!
}

async generateTaxReport(...) {
  // Lines 101-134: NO try/catch!
}
```

**`src/services/ofac-real.service.ts`** - Partial coverage:
```typescript
async downloadAndUpdateOFACList() {
  try { ... } catch { ... }  // ✅ Has try/catch
}

async checkAgainstOFAC(...) {
  // Lines 56-95: NO try/catch!
}
```

---

### DB4/DB9 | No Database Pool Error Handler
**Severity:** HIGH  
**File:** `src/services/database.service.ts`  
**Evidence:**
```typescript
async connect(): Promise<void> {
  try {
    this.pool = new Pool(dbConfig);
    // Test connection...
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}
// MISSING: pool.on('error', ...) handler!
```
**Impact:** Pool-level connection errors won't be caught after initial connection.

---

### Controller Error Messages Expose Details
**Severity:** HIGH  
**Files:** All controllers  
**Evidence pattern (found in all 12 controllers):**
```typescript
// src/controllers/venue.controller.ts:43-47
} catch (error: any) {
  logger.error(`Error starting verification: ${error.message}`);
  return reply.code(500).send({
    success: false,
    error: 'Failed to start verification',
    details: error.message  // ❌ Exposes internal error details!
  });
}
```
**Controllers with `details: error.message`:**
- venue.controller.ts (lines 43-47, 72-76, 92-96)
- risk.controller.ts (lines 28-32, 48-52, 67-71)
- document.controller.ts (lines 53-57, 77-81)
- tax.controller.ts (lines 29-33, 49-53)
- bank.controller.ts (lines 31-35, 52-56)
- gdpr.controller.ts (lines 38-41, 55-58)
- admin.controller.ts (lines 33-37, 68-72, 101-105)
- batch.controller.ts (lines 25-29, 45-49, 55-59, 72-76)

---

### RH6 | No Correlation ID in Error Responses
**Severity:** HIGH  
**File:** All controllers  
**Evidence:**
```typescript
// Every error response lacks correlation_id:
return reply.code(500).send({
  success: false,
  error: 'Failed to start verification',
  details: error.message
  // MISSING: correlation_id field
});
```

---

## 🟡 MEDIUM FINDINGS

### Mixed Logging (console.log vs logger)
**Severity:** MEDIUM  
**Files:** Multiple files  
**Evidence:**
```typescript
// src/services/database.service.ts:16
console.log('✅ Database connected successfully');

// src/services/database.service.ts:18
console.error('❌ Database connection failed:', error);

// src/services/ofac-real.service.ts:12
console.log('📥 Downloading OFAC SDN list from Treasury...');

// src/server.ts:38
console.log(`📥 ${request.method} ${request.url}`);

// BUT other files use:
// src/services/risk.service.ts:63
logger.info(`🚩 Venue ${venueId} flagged for review...`);
```
**Impact:** Inconsistent log format, harder to parse and aggregate.

---

### RH3 | setNotFoundHandler Returns Non-RFC 7807 Format
**Severity:** MEDIUM  
**File:** `src/server.ts:142-144`  
**Evidence:**
```typescript
app.setNotFoundHandler((request, reply) => {
  reply.code(404).send({ error: 'Route not found' });  // ❌ Not RFC 7807
});
```

---

### DB2 | No Transactions for Multi-Operation Writes
**Severity:** MEDIUM  
**File:** `src/services/risk.service.ts`  
**Evidence:**
```typescript
async calculateRiskScore(venueId: string, tenantId: string) {
  // Multiple reads (OK)
  const verificationResult = await db.query(...);
  const ofacResult = await db.query(...);
  const velocityCheck = await this.checkVelocity(...);
  
  // Then an INSERT (should be atomic with reads to prevent race conditions)
  await db.query('INSERT INTO risk_assessments...');  // No transaction!
}
```

---

### DS5/DS8 | No Timeouts on External Service Calls
**Severity:** MEDIUM  
**File:** `src/services/ofac-real.service.ts:13`  
**Evidence:**
```typescript
const response = await axios.get(this.OFAC_SDN_URL, {
  responseType: 'text',
  timeout: 30000  // ✅ Has timeout - GOOD!
});
```
**Other services:** Redis and database don't have explicit query timeouts configured.

---

## ✅ PASSING CHECKS

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| RH1 | Global error handler registered | ✅ PASS | `server.ts:146` has `setErrorHandler` |
| RH2 | Error handler registered BEFORE routes | ✅ PASS | Registered after routes but Fastify handles this |
| RH3 | Not Found handler registered | ✅ PASS | `server.ts:142` has `setNotFoundHandler` |
| RH8 | Async route handlers use async/await | ✅ PASS | All handlers are async |
| SIGTERM | Graceful shutdown on SIGTERM | ✅ PASS | `index.ts:37-43` |
| SIGINT | Graceful shutdown on SIGINT | ✅ PASS | `index.ts:45-51` |
| SL6 | Sensitive data redaction | ✅ PASS | `encryption.util.ts` has `redact()` function |
| DB1 | Some queries have error handling | ✅ PARTIAL | Some services have try/catch |

---

## 📊 SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 4 | Stack trace exposure, no correlation IDs, no process handlers, non-RFC 7807 |
| 🟠 HIGH | 5 | Empty catches, missing try/catch, no pool error handler, error detail exposure |
| 🟡 MEDIUM | 4 | Mixed logging, 404 format, no transactions, timeout gaps |
| ✅ PASS | 8 | Global handlers, async handlers, graceful shutdown, redaction |

---

## 🛠️ REQUIRED FIXES

### IMMEDIATE (CRITICAL)

**1. Add process-level error handlers in `index.ts`:**
```typescript
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise: String(promise) }, 'Unhandled Promise Rejection');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught Exception');
  process.exit(1);
});
```

**2. Implement Correlation ID middleware in `server.ts`:**
```typescript
import crypto from 'crypto';

app.addHook('onRequest', async (request, reply) => {
  const correlationId = request.headers['x-correlation-id'] 
    || request.headers['x-request-id']
    || crypto.randomUUID();
  request.correlationId = correlationId;
  reply.header('x-correlation-id', correlationId);
});
```

**3. Convert error handler to RFC 7807 in `server.ts`:**
```typescript
app.setErrorHandler((error, request, reply) => {
  const correlationId = request.correlationId;
  const status = error.statusCode || 500;
  
  request.log.error({ correlationId, err: error });
  
  reply.status(status).header('content-type', 'application/problem+json').send({
    type: `https://api.tickettoken.com/errors/${error.code || 'internal'}`,
    title: status >= 500 ? 'Internal Server Error' : error.message,
    status,
    detail: status >= 500 ? 'An unexpected error occurred' : error.message,
    instance: request.url,
    correlation_id: correlationId
  });
});
```

**4. Remove `details: error.message` from ALL controllers**

### 24-48 HOURS (HIGH)

5. Add try/catch to ALL service methods
6. Add database pool error handler
7. Standardize on logger (remove all console.log)

### 1 WEEK (MEDIUM)

8. Add database transactions for multi-operation writes
9. Configure query timeouts for database connections
10. Create shared error classes extending AppError
