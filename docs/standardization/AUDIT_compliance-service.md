# Audit Report: compliance-service Internal Endpoints

**Date:** January 21, 2026
**Auditor:** Claude Code
**Service Port:** 3010
**Purpose:** Determine if compliance-service needs /internal/ endpoints

---

## Executive Summary

**Recommendation: MODERATE /internal/ endpoints needed**

compliance-service currently has **NO** internal endpoints despite having an internal auth middleware ready. A significant architecture finding is that **compliance is DISTRIBUTED** - other services (payment-service, notification-service) have their own LOCAL compliance services rather than calling compliance-service.

This distributed model has implications:
- **Pro:** Reduced coupling, service-specific compliance rules
- **Con:** Inconsistent compliance checks, duplicated OFAC data, harder audit trail

Internal endpoints are needed primarily for:
1. **Centralized OFAC/sanctions screening** - Single source of truth
2. **Cross-service GDPR orchestration** - Coordinated data deletion
3. **Audit trail access** - Monitoring and compliance reporting

---

## 1. HTTP Calls TO compliance-service

### Search Methodology
- Searched for: `COMPLIANCE_SERVICE_URL`, `compliance-service`, `complianceClient`, `:3010`
- Examined: All `*Client.ts` files, service configurations

### Findings: NO direct service-to-service HTTP calls

| Service | Makes HTTP calls to compliance-service? | Notes |
|---------|----------------------------------------|-------|
| api-gateway | **Yes (proxy only)** | Routes `/compliance/*` to compliance-service |
| payment-service | **No** | Has LOCAL `AMLCheckerService` |
| notification-service | **No** | Has LOCAL `ComplianceService` |
| marketplace-service | No | Has COMPLIANCE_SERVICE_URL configured but unused |
| venue-service | No | Has COMPLIANCE_SERVICE_URL configured but unused |
| analytics-service | No | Has COMPLIANCE_SERVICE_URL configured but unused |
| event-service | No | Has COMPLIANCE_SERVICE_URL configured but unused |
| ticket-service | No | Has COMPLIANCE_SERVICE_URL configured but unused |

### Distributed Compliance Architecture

**Key Finding:** Services have LOCAL compliance implementations instead of calling compliance-service.

**payment-service:**
```typescript
// backend/services/payment-service/src/services/compliance/aml-checker.service.ts
export class AMLCheckerService {
  async checkTransaction(userId: string, amount: number, transactionType: string) {
    // Local AML checks: amount threshold, aggregate amounts,
    // suspicious patterns, sanctions list, PEP status
    // Does NOT call compliance-service
  }
}
```

**notification-service:**
```typescript
// backend/services/notification-service/src/services/compliance.service.ts
export class ComplianceService {
  async checkCompliance(request: NotificationRequest) {
    // Local consent checking, suppression lists, SMS time restrictions
    // Does NOT call compliance-service
  }
}
```

**Implications:**
- compliance-service is NOT the single source of truth for compliance checks
- OFAC data is duplicated (payment-service queries `sanctions_list` locally)
- Audit trail is fragmented across services

---

## 2. Queue Messages FROM compliance-service

### Search Methodology
- Searched for: `publish`, `emit`, `queue`, `amqplib`, `rabbitmq`, `bull`
- Examined: `src/services/*.ts`

### Findings: **NONE** - Uses setTimeout scheduling

**Scheduling Approach:**
- No message queue implementation (no Bull, RabbitMQ, pg-boss)
- Uses native JavaScript `setTimeout` for scheduled jobs
- Uses database table for notification queuing

**Scheduled Jobs:**
| Job | Schedule | Purpose |
|-----|----------|---------|
| `ofac-update` | Daily 3 AM | Download and update OFAC sanctions list |
| `compliance-checks` | Daily 4 AM | Run daily compliance checks |
| `weekly-report` | Sunday 2 AM | Generate weekly compliance report |
| `1099-generation` | Jan 15 yearly | Generate 1099 forms |

**Database-based Notification Queue:**
```typescript
// Queues notifications to database table instead of message broker
await db.query(`
  INSERT INTO notification_queue
  (recipient_email, notification_type, subject, body, status)
  VALUES ($1, 'admin_risk_alert', $2, $3, 'pending')
`);
```

**Events NOT Published:**
| Potential Event | Would be consumed by | Status |
|-----------------|---------------------|--------|
| `compliance.check.completed` | marketplace-service, payment-service | Not implemented |
| `gdpr.export.ready` | notification-service | Not implemented |
| `gdpr.deletion.completed` | auth-service, notification-service | Not implemented |
| `audit.log.created` | analytics-service | Not implemented |

---

## 3. Current /internal/ Routes

### Search Methodology
- Examined: `src/routes/*.ts`, `src/server.ts`
- Searched for: `/internal/` pattern

### Findings: **NONE**

compliance-service has NO `/internal/` routes. All routes are public API:

| Route Category | Path | Auth | Notes |
|---------------|------|------|-------|
| Health | `/health/*` | None | Health checks |
| Webhooks | `/webhooks/*` | HMAC | Provider webhooks |
| Venue Compliance | `/api/v1/compliance/venues/*` | JWT | Venue compliance status |
| Tax | `/api/v1/compliance/tax/*` | JWT | Tax calculations, 1099 |
| OFAC | `/api/v1/compliance/ofac/*` | JWT + Compliance Officer | Sanctions screening |
| Dashboard | `/api/v1/compliance/dashboard/*` | JWT | Compliance metrics |
| Documents | `/api/v1/compliance/documents/*` | JWT | Document management |
| Risk | `/api/v1/compliance/risk/*` | JWT + Compliance Officer | Risk assessment |
| Bank | `/api/v1/compliance/bank/*` | JWT | Bank verification |
| GDPR | `/api/v1/compliance/gdpr/*` | JWT | Privacy requests |
| Admin | `/api/v1/compliance/admin/*` | JWT + Admin | Admin operations |
| Batch | `/api/v1/compliance/batch/*` | JWT + Admin | Batch operations |

### Internal Auth Middleware EXISTS but UNUSED

```typescript
// backend/services/compliance-service/src/middleware/internal-auth.ts
const ALLOWED_INTERNAL_SERVICES = new Set([
  'api-gateway',
  'auth-service',
  'payment-service',
  'transfer-service',
  'marketplace-service',
  'notification-service',
  'admin-service'
]);

export function internalAuth(options?: { allowedServices?: string[] }) {
  // Validates x-internal-service and x-internal-secret headers
  // Uses timing-safe comparison
  // Ready to use but not attached to any routes
}
```

---

## 4. What Other Services NEED from compliance-service

### Analysis of Distributed vs Centralized Compliance

**Services with Local Compliance:**
| Service | Local Implementation | Should Call compliance-service? |
|---------|---------------------|--------------------------------|
| payment-service | `AMLCheckerService`, `TaxCalculatorService` | **Yes** - for single OFAC source |
| notification-service | `ComplianceService` (consent) | No - consent is notification-specific |
| marketplace-service | Venue settings compliance flags | **Maybe** - for listing validation |

### Recommended /internal/ Endpoints

#### HIGH PRIORITY

**1. POST /internal/ofac/screen**
- **Purpose:** Single source of truth for OFAC/sanctions screening
- **Used by:** payment-service, marketplace-service, transfer-service
- **Why internal:** Security-sensitive, needs audit trail, deduplicates OFAC data

```typescript
fastify.post('/internal/ofac/screen', {
  preHandler: [internalAuth()]
}, async (request, reply) => {
  const { name, country, dateOfBirth, entityType } = request.body;
  const callingService = request.internalService;

  const result = await ofacService.screenEntity({
    name,
    country,
    dateOfBirth,
    entityType
  });

  // Log screening request for audit
  await auditService.log({
    action: 'ofac_screening',
    callingService,
    entityName: name,
    result: result.matched ? 'MATCH' : 'CLEAR'
  });

  return reply.send({
    matched: result.matched,
    matchScore: result.score,
    matchDetails: result.matched ? result.details : undefined,
    screeningId: result.screeningId
  });
});
```

**2. POST /internal/gdpr/export**
- **Purpose:** Initiate GDPR export from another service
- **Used by:** auth-service (on user request), admin-service
- **Why internal:** Coordinate multi-service data collection

**3. POST /internal/gdpr/delete**
- **Purpose:** Orchestrate GDPR deletion across services
- **Used by:** auth-service (after user deletion)
- **Why internal:** Must coordinate deletion across all services

```typescript
fastify.post('/internal/gdpr/delete', {
  preHandler: [internalAuth({ allowedServices: ['auth-service', 'admin-service'] })]
}, async (request, reply) => {
  const { userId, reason, requestedBy } = request.body;

  // Start deletion workflow
  const result = await gdprService.initiateAccountDeletion(userId, reason);

  // Notify other services to delete user data
  await Promise.all([
    notifyService('payment-service', 'gdpr.delete.user', { userId }),
    notifyService('ticket-service', 'gdpr.delete.user', { userId }),
    notifyService('marketplace-service', 'gdpr.delete.user', { userId }),
  ]);

  return reply.code(202).send({
    requestId: result.requestId,
    status: 'pending',
    estimatedCompletion: result.estimatedCompletion
  });
});
```

#### MEDIUM PRIORITY

**4. POST /internal/compliance/check**
- **Purpose:** Synchronous compliance check for transactions
- **Used by:** payment-service, marketplace-service
- **Why internal:** Blocking check before transaction approval

```typescript
fastify.post('/internal/compliance/check', {
  preHandler: [internalAuth()]
}, async (request, reply) => {
  const { userId, entityId, entityType, amount, transactionType } = request.body;

  const result = await complianceService.runCheck({
    userId,
    entityId,
    entityType,
    amount,
    transactionType
  });

  return reply.send({
    passed: result.passed,
    requiresReview: result.requiresReview,
    flags: result.flags,
    riskScore: result.riskScore,
    checkId: result.checkId
  });
});
```

**5. GET /internal/audit-logs**
- **Purpose:** Get audit logs for monitoring/analytics
- **Used by:** monitoring-service, analytics-service
- **Why internal:** Bulk data access for reporting

#### LOW PRIORITY

**6. GET /internal/compliance/status/:entityId**
- **Purpose:** Check compliance status of an entity
- **Used by:** venue-service, marketplace-service
- **Note:** Could use public API with internal auth instead

---

## 5. Architecture Considerations

### Current: Distributed Compliance Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CURRENT ARCHITECTURE                           │
│                                                                         │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐  │
│  │ payment-service │     │ notification-svc │     │ marketplace-svc │  │
│  │                 │     │                 │     │                 │  │
│  │ AMLCheckerSvc   │     │ ComplianceSvc   │     │ (no compliance) │  │
│  │ TaxCalculator   │     │ (consent mgmt)  │     │                 │  │
│  │ sanctions_list  │     │ consent_records │     │                 │  │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘  │
│           │                       │                       │           │
│           └───────────────────────┼───────────────────────┘           │
│                                   │                                   │
│                          NO HTTP CALLS                                │
│                                   │                                   │
│  ┌────────────────────────────────┴───────────────────────────────┐  │
│  │                     compliance-service:3010                     │  │
│  │                                                                 │  │
│  │  ISOLATED - Only receives requests via api-gateway             │  │
│  │                                                                 │  │
│  │  Tables: risk_assessments, tax_records, ofac_screenings,       │  │
│  │          gdpr_requests, compliance_documents                   │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended: Centralized Compliance Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       RECOMMENDED ARCHITECTURE                          │
│                                                                         │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐  │
│  │ payment-service │     │ marketplace-svc │     │  auth-service   │  │
│  │                 │     │                 │     │                 │  │
│  │ Before payment: │     │ Before listing: │     │ On deletion:    │  │
│  │ → compliance    │     │ → compliance    │     │ → GDPR delete   │  │
│  │   check         │     │   check         │     │                 │  │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘  │
│           │                       │                       │           │
│           ▼                       ▼                       ▼           │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    compliance-service:3010                      │  │
│  │                                                                 │  │
│  │  INTERNAL ENDPOINTS (NEW):                                     │  │
│  │  ├── POST /internal/compliance/check    → Sync compliance      │  │
│  │  ├── POST /internal/ofac/screen         → OFAC screening       │  │
│  │  ├── POST /internal/gdpr/export         → GDPR export          │  │
│  │  ├── POST /internal/gdpr/delete         → GDPR deletion        │  │
│  │  └── GET /internal/audit-logs           → Audit data           │  │
│  │                                                                 │  │
│  │  SINGLE SOURCE OF TRUTH for:                                   │  │
│  │  - OFAC sanctions list                                         │  │
│  │  - Compliance checks                                           │  │
│  │  - Audit trail                                                 │  │
│  │  - GDPR orchestration                                          │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Summary

| Question | Answer |
|----------|--------|
| Services calling compliance-service | **None** (only api-gateway proxies) |
| Data other services need | OFAC screening, compliance checks, GDPR orchestration |
| Current /internal/ routes | **None** |
| Missing /internal/ routes | 5-6 recommended (2 high, 2 medium, 1-2 low priority) |
| Queue events | Not implemented (uses setTimeout scheduling) |
| Internal auth middleware | Ready but unused |
| Architecture pattern | **DISTRIBUTED** - services have local compliance logic |

### Priority Actions

| Priority | Action | Impact |
|----------|--------|--------|
| **HIGH** | Add `POST /internal/ofac/screen` | Single source of truth for sanctions |
| **HIGH** | Add `POST /internal/gdpr/delete` | Coordinated user deletion |
| **HIGH** | Add `POST /internal/gdpr/export` | Coordinated data export |
| **MEDIUM** | Add `POST /internal/compliance/check` | Centralized compliance checks |
| **MEDIUM** | Add `GET /internal/audit-logs` | Monitoring and reporting |
| LOW | Migrate payment-service AML to use compliance-service | Reduce duplication |
| LOW | Implement event publishing for compliance events | Better observability |

### Final Recommendation

compliance-service needs **MODERATE** changes to become the central compliance hub:

1. **Add internal endpoints** for OFAC screening, GDPR operations, and compliance checks
2. **Migrate distributed compliance** from payment-service to use centralized endpoints
3. **Keep notification-service consent management local** (it's notification-specific)

The current distributed model works but creates:
- Duplicated OFAC data across services
- Inconsistent compliance rules
- Fragmented audit trail
- Harder regulatory reporting

Centralizing to compliance-service would improve:
- Single source of truth for sanctions/OFAC
- Consistent compliance rules across all services
- Unified audit trail for regulatory compliance
- Easier compliance reporting and monitoring
