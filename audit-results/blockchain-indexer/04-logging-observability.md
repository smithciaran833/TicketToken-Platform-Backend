# Blockchain-Indexer Service - 04 Logging & Observability Audit

**Service:** blockchain-indexer
**Document:** 04-logging-observability.md
**Date:** 2025-12-26
**Auditor:** Cline AI
**Pass Rate:** 56% (22/39 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | No sensitive data redaction, correlation ID not in logs |
| HIGH | 6 | No request.log usage, no security event logging, deprecated prettyPrint, metrics not instrumented |
| MEDIUM | 5 | No child loggers, no tracing, duplicate metrics implementations |
| LOW | 3 | No version in log context, no custom serializers |

## Log Configuration (5/9 applicable)

- Structured JSON logging - PASS
- Log level configurable - PASS
- Redaction configured - FAIL (CRITICAL)
- Correlation ID middleware - PARTIAL
- Request ID generation - PASS
- ISO 8601 timestamps - PASS
- Service name in context - PARTIAL (no version)
- Log destination (stdout) - PASS
- pino-pretty production - PARTIAL (deprecated option)

## Sensitive Data Protection (2/5 applicable)

- Tokens/API keys redacted - FAIL
- Solana keys not logged - PASS
- Error stack traces controlled - PARTIAL
- Database queries sanitized - PASS

## Security Event Logging (2/4 applicable)

- Access denied logging - PARTIAL
- Validation failures logged - FAIL
- Rate limit exceeded - FAIL
- Sensitive data access - PASS

## Fastify/Pino (3/6)

- Logger in Fastify options - PARTIAL (disabled)
- request.log used - FAIL (HIGH)
- Serializers configured - FAIL
- genReqId configured - PASS
- Child loggers used - FAIL (MEDIUM)
- Async logging - PASS

## Distributed Tracing (0/8)

- OpenTelemetry SDK - FAIL
- Auto-instrumentation - FAIL
- Trace ID in logs - FAIL
- Context propagation - FAIL
- Error spans - FAIL
- Custom spans - FAIL
- Sampling configured - FAIL

## Metrics (7/7) EXCELLENT

- /metrics endpoint - PASS
- Request rate tracked - PASS
- Request duration tracked - PASS
- Error rate trackable - PASS
- Default Node.js metrics - PASS
- Business metrics defined - PASS
- Label cardinality controlled - PASS
- Histogram buckets appropriate - PASS

## Critical Issues

### 1. No Sensitive Data Redaction
```typescript
// logger.ts - Missing:
redact: {
  paths: ['*.password', '*.token', '*.secret'],
  censor: '[REDACTED]'
}
```

### 2. request.log Not Used
```typescript
// Uses global logger without request context
logger.info({ ... }, 'message');
// Should use:
request.log.info({ ... }, 'message');
```

### 3. Metrics Not Instrumented in Processors
```typescript
// transactionProcessor.ts - metrics defined but not called
// Missing: transactionsProcessedTotal.inc()
```

### 4. Duplicate Metrics Implementations
- src/utils/metrics.ts (used)
- src/metrics/metricsCollector.ts (unused)

## Metrics Defined

- blockchain_indexer_transactions_processed_total
- blockchain_indexer_blocks_processed_total
- blockchain_indexer_current_slot
- blockchain_indexer_indexer_lag
- blockchain_indexer_rpc_errors_total
- blockchain_indexer_transaction_processing_duration_seconds
- blockchain_indexer_reconciliation_runs_total
- blockchain_indexer_discrepancies_found_total

## Remediations

### CRITICAL
1. Add redaction config to logger
2. Add correlation ID to all logs

### HIGH
1. Enable Fastify request logger
2. Add security event logging
3. Fix deprecated prettyPrint
4. Instrument processors with metrics

### MEDIUM
1. Set up OpenTelemetry
2. Add child loggers for context
3. Remove duplicate metricsCollector.ts
4. Add request/response logging hooks

### LOW
1. Add version to log base context
2. Add custom serializers

Logging & Observability Score: 56/100
