# Auth Service - 04 Logging & Observability Audit

**Service:** auth-service
**Document:** 04-logging-observability.md
**Date:** 2025-12-22
**Auditor:** Cline + Human Review
**Pass Rate:** 66% (31/47)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | No OpenTelemetry/distributed tracing (0/8 checks) |
| HIGH | 3 | Correlation ID incomplete, no HTTP request metrics, audit gaps |
| MEDIUM | 4 | Stack traces in prod, error rate tracking, histogram buckets, config change logging |

---

## Section 3.1: Log Configuration (8/9 PASS)

### LC1: Structured JSON logging
**Status:** PASS
**Evidence:** Winston with `winston.format.json()`, Pino in Fastify.

### LC2: Log level per environment
**Status:** PASS
**Evidence:** `LOG_LEVEL` env var, pino-pretty only in dev.

### LC3: Redaction for sensitive fields
**Status:** PASS
**Evidence:** `PIISanitizer` from shared lib applied to all logs via sanitizingFormat.

### LC4: Correlation ID middleware
**Status:** PARTIAL
**Issue:** Accepts `x-request-id` but doesn't generate if missing or propagate to child loggers.
**Remediation:** Add middleware to generate and propagate correlation IDs.

### LC5: Request ID generation
**Status:** PASS
**Evidence:** `requestIdHeader: 'x-request-id'` in Fastify config.

### LC6: ISO 8601 timestamps
**Status:** PASS
**Evidence:** `winston.format.timestamp()`, `pino.stdTimeFunctions.isoTime`.

### LC7: Service name/version in context
**Status:** PASS
**Evidence:** `defaultMeta: { service: 'auth-service' }`, version in config/logger.ts.

### LC8: Log destination (stdout)
**Status:** PASS
**Evidence:** Console transport for container deployments.

### LC9: Log rotation
**Status:** N/A (handled by container/aggregation system)

### LC10: pino-pretty disabled in prod
**Status:** PASS
**Evidence:** `transport: env.NODE_ENV === 'development' ? {...} : undefined`

---

## Section 3.2: Sensitive Data Protection (9/10 PASS)

### SD1: Passwords never logged
**Status:** PASS
**Evidence:** PIISanitizer + boolean flags (`hasPassword: !!data.password`).

### SD2: Tokens/API keys redacted
**Status:** PASS

### SD3: PII fields redacted
**Status:** PASS
**Evidence:** `PIISanitizer.sanitizeRequest(req)` applied.

### SD4: Credit card data never logged
**Status:** PASS (N/A - auth doesn't handle CC)

### SD5: Session tokens redacted
**Status:** PASS

### SD6: Stripe data filtered
**Status:** N/A

### SD7: Solana private keys never logged
**Status:** PASS
**Evidence:** Only public keys logged, no private key storage.

### SD8: Request body filtered
**Status:** PASS

### SD9: Error stack traces controlled
**Status:** PARTIAL
**Issue:** Stack traces included in all environments.
**Remediation:** Exclude stacks in production.

### SD10: DB queries sanitized
**Status:** PASS

---

## Section 3.3: Security Event Logging (9/12 PASS)

### SE1: Login success/failure
**Status:** PASS
**Evidence:** `audit.service.ts` - `logLogin()` with success/failure status.

### SE2: Logout
**Status:** PARTIAL
**Issue:** No explicit logout audit method.
**Remediation:** Add `logLogout()` to AuditService.

### SE3: Password change/reset
**Status:** PASS
**Evidence:** `logPasswordChange()` exists.

### SE4: MFA enable/disable
**Status:** PARTIAL
**Issue:** `logMFAEnabled()` exists but not `logMFADisabled()`.
**Remediation:** Add MFA disable audit.

### SE5: Access denied
**Status:** PASS
**Evidence:** `auth.middleware.ts` logs with user/tenant/permission context.

### SE6: Role/permission changes
**Status:** PASS
**Evidence:** `logRoleGrant()` exists.

### SE7: Session events
**Status:** PARTIAL
**Issue:** Revocation logged, creation not explicitly audited.

### SE8: Validation failures
**Status:** PASS

### SE9: Rate limiting
**Status:** PASS

### SE10-12: Payment/Refunds/Exports
**Status:** N/A

### SE13: Sensitive data access
**Status:** PASS
**Evidence:** DB-level audit triggers.

### SE14: User management
**Status:** PASS
**Evidence:** `logRegistration()` exists.

### SE15: Config changes
**Status:** PARTIAL
**Issue:** No config change logging.

---

## Section 3.5: Distributed Tracing (0/8 PASS)

### DT1-DT8: OpenTelemetry
**Status:** FAIL (ALL)
**Issue:** No distributed tracing implemented whatsoever.
**Remediation:**
```typescript
// Add to index.ts before app import
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'auth-service',
  instrumentations: [getNodeAutoInstrumentations()]
});
sdk.start();
```

---

## Section 3.6: Metrics (5/8 PASS)

### M1: /metrics endpoint
**Status:** PASS
**Evidence:** `app.get('/metrics')` with Prometheus registry.

### M2: HTTP request rate
**Status:** PARTIAL
**Issue:** Only auth-specific counters, no general HTTP metrics.
**Remediation:** Add `fastify-metrics` plugin.

### M3: HTTP request duration
**Status:** PASS
**Evidence:** `authDuration` histogram exists.

### M4: Error rate trackable
**Status:** PARTIAL
**Issue:** No status_code labels on HTTP metrics.

### M5: Default Node.js metrics
**Status:** PASS
**Evidence:** `collectDefaultMetrics({ register })`.

### M6: Business metrics
**Status:** PASS
**Evidence:** `loginAttemptsTotal`, `registrationTotal`, `tokenRefreshTotal`.

### M7: Label cardinality controlled
**Status:** PASS
**Evidence:** Only `status` and `operation` labels.

### M8: Histogram buckets
**Status:** PARTIAL
**Issue:** Uses default buckets.
**Remediation:** Add explicit buckets for auth operations.

---

## Remediation Priority

### CRITICAL
1. **Implement OpenTelemetry** - Add distributed tracing for production debugging

### HIGH
1. **Complete correlation ID** - Generate if missing, propagate to all logs
2. **Add HTTP request metrics** - Install fastify-metrics plugin
3. **Complete audit logging** - Add logout, MFA disable, session creation

### MEDIUM
1. **Control stack traces** - Exclude in production
2. **Add status_code labels** - Enable error rate tracking
3. **Configure histogram buckets** - `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5]`

