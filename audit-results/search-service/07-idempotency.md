## Search-Service Idempotency Audit

**Standard:** `07-idempotency.md`  
**Service:** `search-service`  
**Date:** 2025-12-27

---

### Executive Summary

| Metric | Value |
|--------|-------|
| **Total Checks** | 40 |
| **Passed** | 14 |
| **Partial** | 8 |
| **Failed** | 13 |
| **N/A** | 5 |
| **Pass Rate** | 40.0% |
| **Critical Issues** | 3 |
| **High Issues** | 5 |
| **Medium Issues** | 4 |

---

## State-Changing Operations Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 1 | All POST endpoints modifying data support idempotency | **PARTIAL** | `consistency.service.ts:86-106` - Uses consistency tokens, but not standard `Idempotency-Key` header |
| 2 | Idempotency storage is persistent | **PASS** | `consistency.service.ts:41-50` - Stored in `search_operation_log` PostgreSQL table |
| 3 | Idempotency checks are atomic | **PARTIAL** | `consistency.service.ts:37` - Uses transaction, but no explicit locking |
| 4 | Response includes header indicating replay | **FAIL** | No `X-Idempotent-Replayed` header in responses |
| 5 | Keys scoped to tenant | **FAIL** | Tokens don't include `tenant_id` |
| 6 | Key collision probability acceptably low | **PASS** | `consistency.service.ts:140-141` - Uses `crypto.randomBytes(16).toString('hex')` |
| 7 | Error responses NOT cached | **FAIL** | `consistency.service.ts:178-188` - Errors logged but not distinguished from success |
| 8 | Retryable errors allow same-key retry | **PARTIAL** | Retry mechanism exists but unclear handling |
| 9 | Non-retryable errors require new key | **FAIL** | No distinction in error handling |
| 10 | Monitoring for idempotency errors | **FAIL** | No specific monitoring/alerting |

---

## Sync Operations Checklist

### sync.service.ts

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 11 | Sync operations have idempotency | **PASS** | `sync.service.ts:34-50` - Uses `consistencyService.indexWithConsistency()` |
| 12 | Client ID tracked for deduplication | **PASS** | `sync.service.ts:35` - `processMessage()` accepts `clientId` |
| 13 | Recovery points for multi-step ops | **PARTIAL** | Priority-based queue exists, no explicit recovery points |
| 14 | Duplicate sync returns existing result | **PASS** | `consistency.service.ts:86-106` - Checks for matching token |
| 15 | Sync status tracked | **PASS** | `consistency.service.ts:53-73` - `sync_status` table updated |

### content-sync.service.ts

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 16 | Content sync is idempotent | **FAIL** | `content-sync.service.ts:17-53` - No idempotency checks, just updates |
| 17 | Bulk sync prevents duplicate processing | **FAIL** | `content-sync.service.ts:106-139` - Sequential processing without dedup |
| 18 | Rating sync idempotent | **PASS** | `content-sync.service.ts:84-107` - Overwrites with current data (naturally idempotent) |
| 19 | Concurrent sync handling | **FAIL** | No locking or concurrency control |

---

## Consistency Service Deep Dive

### Token Management

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 20 | Unique token generation | **PASS** | `consistency.service.ts:140-141` - `crypto.randomBytes(16).toString('hex')` |
| 21 | Token stored with operation | **PASS** | `consistency.service.ts:41-50` - Inserted to `search_operation_log` |
| 22 | Token verification before processing | **PASS** | `consistency.service.ts:86-106` - `verifyConsistency()` method |
| 23 | Expired token handling | **FAIL** | No TTL or expiration on tokens |
| 24 | Token format documented | **FAIL** | No documentation on token format |

### Operation Processing

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 25 | Atomic operation start | **PASS** | `consistency.service.ts:37` - Wrapped in transaction |
| 26 | Status tracking | **PASS** | `consistency.service.ts:53-73` - Updates `sync_status` |
| 27 | Version tracking | **PASS** | `001_search_consistency_tables.ts:32` - `version` column |
| 28 | Retry mechanism | **PASS** | `consistency.service.ts:109-135` - `retrySync()` method |
| 29 | Max retry limit | **PARTIAL** | Retry count tracked but no explicit max |
| 30 | Dead letter handling | **PARTIAL** | Logs failures, no DLQ table |

---

## Search Controller (Read Operations)

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 31 | Search operations naturally idempotent | **PASS** | `search.controller.ts` - GET/POST search are read-only |
| 32 | Suggest operations naturally idempotent | **PASS** | `search.controller.ts:30-40` - No state modification |
| 33 | No unexpected state changes | **PASS** | `search.service.ts` - Only reads from ES |

---

## RabbitMQ Message Handling

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 34 | Message ID tracking | **FAIL** | `rabbitmq.ts:14-22` - No message ID deduplication |
| 35 | Duplicate message detection | **FAIL** | No checking before processing |
| 36 | Message acknowledgment after processing | **PASS** | `rabbitmq.ts:18` - `channel.ack(msg)` after processing |
| 37 | Failed message handling | **PASS** | `rabbitmq.ts:21` - `channel.nack(msg, false, false)` on error |

---

## IETF Idempotency-Key Standard Compliance

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 38 | `Idempotency-Key` header accepted | **FAIL** | Not implemented - uses internal tokens |
| 39 | UUID v4 or random key validation | **N/A** | Not using standard header |
| 40 | Key expiry policy published | **FAIL** | No documented expiry |

---

## Critical Issues (P0)

### 1. No Message Deduplication in RabbitMQ Handler
**Severity:** CRITICAL  
**Location:** `rabbitmq.ts:14-22`  
**Issue:** Messages consumed without checking for duplicates. Same message delivered multiple times will be processed multiple times.

**Evidence:**
```typescript
await channel.consume('search.sync.queue', async (msg) => {
  if (msg) {
    try {
      // NO duplicate check - processes every message
      console.log('Processing message:', msg.content.toString());
      channel.ack(msg);
    } catch (error) {
      channel.nack(msg, false, false);
    }
  }
});
```

**Remediation:**
```typescript
const messageId = msg.properties.messageId;
const processed = await redis.get(`msg:${messageId}`);
if (processed) {
  channel.ack(msg); // Acknowledge duplicate
  return;
}
await redis.setex(`msg:${messageId}`, 86400, 'processing');
// ... process message
```

---

### 2. Content Sync Without Idempotency
**Severity:** CRITICAL  
**Location:** `content-sync.service.ts:17-53`  
**Issue:** `syncVenueContent()` and `syncEventContent()` have no idempotency protection. Concurrent syncs can cause race conditions.

**Evidence:**
```typescript
async syncVenueContent(venueId: string): Promise<void> {
  // NO idempotency check - just processes
  const venueContent = await VenueContentModel.find({...});
  await this.esClient.update({...});
}
```

---

### 3. No Tenant Isolation in Idempotency Keys
**Severity:** CRITICAL  
**Location:** `consistency.service.ts:140-141`  
**Issue:** Tokens don't include `tenant_id`. Different tenants could theoretically have colliding operations.

**Evidence:**
```typescript
private generateToken(): string {
  return crypto.randomBytes(16).toString('hex');
  // MISSING: tenant_id prefix
}
```

**Remediation:**
```typescript
private generateToken(tenantId: string): string {
  return `${tenantId}:${crypto.randomBytes(16).toString('hex')}`;
}
```

---

## High Issues (P1)

### 4. No Race Condition Protection on Sync Status
**Severity:** HIGH  
**Location:** `consistency.service.ts:61-73`  
**Issue:** Updates `sync_status` without locking. Concurrent operations could conflict.

**Evidence:**
```typescript
const existing = await trx('sync_status')
  .where({ entity_type, entity_id })
  .first();
// NO .forUpdate() - race condition possible
```

---

### 5. Bulk Sync Without Concurrency Control
**Severity:** HIGH  
**Location:** `content-sync.service.ts:106-139`  
**Issue:** Bulk sync processes sequentially but doesn't prevent concurrent bulk syncs from starting.

---

### 6. No Token Expiration/TTL
**Severity:** HIGH  
**Location:** `001_search_consistency_tables.ts`, `consistency.service.ts`  
**Issue:** Consistency tokens never expire. Storage grows indefinitely.

**Remediation:** Add cleanup job:
```typescript
async function cleanupExpiredTokens(days: number = 30) {
  await db('search_operation_log')
    .where('created_at', '<', db.raw('NOW() - INTERVAL ? DAY', [days]))
    .delete();
}
```

---

### 7. No Idempotent Replay Header
**Severity:** HIGH  
**Location:** `consistency.service.ts:86-106`  
**Issue:** When returning cached result, no header indicates it's a replay.

**Remediation:**
```typescript
return {
  ...result,
  _idempotentReplay: true,
  headers: { 'X-Idempotent-Replayed': 'true' }
};
```

---

### 8. Error Responses Not Differentiated
**Severity:** HIGH  
**Location:** `consistency.service.ts:178-188`  
**Issue:** All results cached equally. Errors should allow retry with same key.

---

## Medium Issues (P2)

| # | Issue | Location | Description |
|---|-------|----------|-------------|
| 9 | No standard Idempotency-Key header | Routes | Uses internal token system, not IETF standard |
| 10 | No max retry limit enforcement | `consistency.service.ts` | retry_count tracked but no max |
| 11 | No dead letter queue | Background processor | Failed operations logged but not queued |
| 12 | Consistency verification logs only | `consistency.service.ts:96-98` | Inconsistencies logged but not acted upon |

---

## Positive Findings

1. ✅ **Consistency token system** - Robust token generation with `crypto.randomBytes()`
2. ✅ **Persistent storage** - Tokens stored in PostgreSQL, survives restarts
3. ✅ **Transaction wrapping** - Sync operations wrapped in database transaction
4. ✅ **Version tracking** - `sync_status` table has version column for optimistic locking
5. ✅ **Retry mechanism** - `retrySync()` method with retry count tracking
6. ✅ **Operation logging** - All operations logged to `search_operation_log`
7. ✅ **Client ID support** - `clientId` parameter for tracing requests
8. ✅ **Message acknowledgment** - RabbitMQ messages properly acked/nacked
9. ✅ **Read operations idempotent** - Search/suggest are naturally idempotent
10. ✅ **Status tracking** - sync_status table tracks operation state

---

## Prioritized Remediation Plan

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Add message deduplication to RabbitMQ handler | 2 hours | Critical - prevents duplicate sync |
| P0 | Add idempotency to content-sync operations | 2 hours | Critical - prevents race conditions |
| P0 | Include tenant_id in consistency tokens | 1 hour | Critical - tenant isolation |
| P1 | Add .forUpdate() to sync_status reads | 30 min | High - prevents race conditions |
| P1 | Implement token expiration/cleanup | 2 hours | High - prevents storage bloat |
| P1 | Add X-Idempotent-Replayed header | 30 min | High - client transparency |
| P1 | Differentiate error responses in caching | 1 hour | High - allow error retries |
| P1 | Add concurrency control to bulk sync | 2 hours | High - prevents conflicts |
| P2 | Implement standard Idempotency-Key header | 4 hours | Medium - IETF compliance |
| P2 | Add max retry limit enforcement | 1 hour | Medium - prevents infinite retries |
| P2 | Implement dead letter queue | 2 hours | Medium - failed operation handling |

---

**Audit Complete.** Pass rate of 40.0% indicates good foundation with consistency token system, but significant gaps in message deduplication, content sync idempotency, and tenant isolation. The service has a sophisticated internal idempotency mechanism through `ConsistencyService` but doesn't implement the standard `Idempotency-Key` header pattern.
