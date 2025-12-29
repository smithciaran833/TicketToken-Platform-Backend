# Blockchain Indexer - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Data Consistency | 1 | CRITICAL |
| Multi-Tenancy | 1 | CRITICAL |
| Resilience | 2 | HIGH |
| Observability | 1 | MEDIUM |
| Frontend Features | 0 | - |

**Note:** This is primarily a background indexing service with minimal HTTP endpoints. Most issues relate to data consistency and resilience, not frontend features.

---

## CRITICAL Issues

### GAP-INDEXER-001: MongoDB Writes Fail Silently
- **Severity:** CRITICAL
- **Audit:** 06-database.md, 03-error-handling.md
- **Current:**
```typescript
} catch (error) {
  logger.error({ error, signature }, 'Failed to save to MongoDB');
  // ERROR NOT RE-THROWN - Silent failure!
}
```
- **Risk:** Blockchain data not saved to MongoDB, no retry, no tracking
- **Fix:** Add retry queue or track failed writes for later processing

### GAP-INDEXER-002: Tenant Context Errors Swallowed
- **Severity:** CRITICAL
- **Audit:** 09-multi-tenancy.md
- **Current:** If `setTenantContext` fails, error is swallowed, request proceeds without tenant context
- **Risk:** Queries execute without RLS filtering
- **Fix:** Return 500 if tenant context fails

---

## HIGH Issues

### GAP-INDEXER-003: RPC Failover Not Integrated
- **Severity:** HIGH
- **Audit:** 31-external-integrations.md, 13-graceful-degradation.md
- **Current:**
  - Excellent `RPCFailoverManager` exists in `rpcFailover.ts`
  - Main indexer uses direct `Connection`, NOT the failover manager
- **Risk:** Single RPC failure takes down indexer
- **Fix:** Use RPCFailoverManager in main indexer

### GAP-INDEXER-004: No Dead Letter Queue
- **Severity:** HIGH
- **Audit:** 36-background-jobs.md, 37-event-driven.md
- **Current:** Failed jobs logged but not queued for retry
- **Risk:** Failed transactions lost, no recovery mechanism

---

## MEDIUM Issues

### GAP-INDEXER-005: Missing Health Checks
- **Severity:** MEDIUM
- **Audit:** 12-health-checks.md
- **Current:** No MongoDB health check, no Redis health check
- **Impact:** Can't detect dependency failures

---

## Frontend-Related Gaps

**None identified.** This is a background service that indexes blockchain data. It has no user-facing endpoints.

The indexed data is consumed by other services (ticket-service, marketplace-service) which expose it to users.

---

## All Routes Inventory

### health.routes.ts (2 routes) - Background service
| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Basic health |
| GET | /health/db | Database check |

**Note:** This service is an indexer/worker, not an API service. It:
- Subscribes to Solana blockchain events
- Processes and indexes transactions
- Stores data in PostgreSQL and MongoDB
- Runs reconciliation jobs

---

## What Works Well

1. **Circuit breaker implementation** - Full state machine
2. **RPC failover manager** - Excellent design (just not integrated)
3. **Retry logic** - With exponential backoff
4. **Graceful shutdown** - SIGTERM/SIGINT handlers
5. **Rate limiting** - Implemented
6. **Configuration validation** - Fail-fast on invalid config
7. **Startup probe** - validateConfigOrExit()

---

## Priority Order for Fixes

### Immediate (Data Integrity)
1. GAP-INDEXER-001: Fix MongoDB silent failures
2. GAP-INDEXER-002: Don't swallow tenant context errors
3. GAP-INDEXER-003: Integrate RPC failover into indexer

### This Week
4. GAP-INDEXER-004: Implement dead letter queue
5. GAP-INDEXER-005: Add MongoDB/Redis health checks

