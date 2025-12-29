# Blockchain-Indexer Service - 03 Error Handling Audit

**Service:** blockchain-indexer
**Document:** 03-error-handling.md
**Date:** 2025-12-26
**Auditor:** Cline AI
**Pass Rate:** 60% (25/42 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | MongoDB write errors swallowed, tenant context errors swallowed |
| HIGH | 5 | No RFC 7807, no correlation ID, no unhandledRejection, main indexer lacks failover |
| MEDIUM | 4 | No 404 handler, no statement timeout, no DLQ |
| LOW | 2 | No error class hierarchy, no circuit breaker metrics |

## Route Handler (6/10)

- Global error handler - PASS
- Handler before routes - PASS
- Not found handler - FAIL (MEDIUM)
- Schema validation format - PARTIAL
- RFC 7807 format - FAIL (HIGH)
- Correlation ID in errors - FAIL (HIGH)
- Stack traces hidden - PARTIAL
- Async handlers - PASS
- No floating promises - PASS

## Service Layer (5/8)

- Try/catch on public methods - PASS
- Errors include context - PASS
- No empty catch blocks - FAIL (CRITICAL - MongoDB swallowed)
- Domain error classes - FAIL
- Error codes documented - FAIL
- No sensitive data in errors - PASS
- External errors wrapped - PARTIAL
- Timeouts on I/O - PARTIAL

## Database (4/4 applicable)

- Queries wrapped - PARTIAL
- Pool errors handled - PASS
- DB errors not exposed - PASS
- Query timeouts - PARTIAL (connection only)

## Solana Integration (2/2 applicable)

- RPC errors categorized - PASS
- Multiple RPC endpoints - PASS

## Distributed Systems (5/9 applicable)

- Correlation ID generated - PARTIAL
- Correlation ID propagated - FAIL
- Correlation ID in logs - FAIL
- Circuit breaker - PASS
- Retry with backoff - PASS
- Health checks - PASS
- Graceful degradation - PARTIAL

## Background Jobs (2/6 applicable)

- Progress tracked - PASS
- Workers don't swallow - FAIL

## Process Handlers (1/3)

- Graceful shutdown - PASS
- unhandledRejection - FAIL (HIGH)
- uncaughtException - FAIL (HIGH)

## Critical Issues

### 1. MongoDB Errors Swallowed
```typescript
// transactionProcessor.ts:84-89
} catch (error) {
  logger.error({ error, signature }, 'Failed to save to MongoDB');
  // ERROR SWALLOWED - No re-throw!
}
```

### 2. Tenant Context Errors Swallowed
```typescript
// index.ts:77-80
} catch (error) {
  // Allow request to proceed
}
```

### 3. No Process Error Handlers
```typescript
// Missing:
process.on('unhandledRejection', ...)
process.on('uncaughtException', ...)
```

### 4. Main Indexer Doesn't Use Failover
```typescript
// Uses direct Connection, not RPCFailoverManager
this.connection = new Connection(config.solana.rpcUrl);
```

## Positive Findings

- Global error handler registered
- Graceful shutdown implemented
- Circuit breaker exists in rpcFailover.ts
- Retry with exponential backoff
- Health checks report dependencies
- RPC errors categorized

## Remediations

### CRITICAL
1. Re-throw or track MongoDB failures
2. Log and reject on tenant context failure
3. Add unhandledRejection handler
4. Add uncaughtException handler

### HIGH
1. Implement RFC 7807 error format
2. Add correlation ID to all logs
3. Integrate RPCFailoverManager in indexer
4. Add setNotFoundHandler

### MEDIUM
1. Add statement_timeout to PostgreSQL
2. Add dead letter handling
3. Create custom error class hierarchy

Error Handling Score: 60/100
