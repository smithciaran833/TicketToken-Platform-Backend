# Order Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Authentication | 3 | CRITICAL |
| Refunds/Chargebacks | 3 | CRITICAL |
| S2S Communication | 2 | HIGH |
| Data Integrity | 2 | HIGH |
| Operational | 3 | MEDIUM |
| Compliance | 1 | HIGH |
| Frontend Features | 3 | MEDIUM |

**HEADLINE: Authentication is a stub. All 45+ order endpoints are completely unprotected.**

---

## CRITICAL Issues

### GAP-ORDER-001: Authentication is a Stub
- **Severity:** CRITICAL
- **Audit:** 01-security.md
- **Current:**
```typescript
// routes/order.routes.ts lines 6-7
// Stub authenticate middleware (not implemented)
const authenticate = async (request: any, reply: any) => {
  // DOES NOTHING
};
```
- **Reality:**
  - `authenticate` middleware is used on all 14 order routes
  - But it's an empty stub that does nothing
  - Real JWT plugin exists in `plugins/jwt-auth.plugin.ts` but NEVER REGISTERED
  - ALL order operations are completely unprotected
- **Risk:**
  - Anyone can create orders for any user
  - Anyone can view any order
  - Anyone can cancel any order
  - Anyone can request refunds on any order
- **Fix:** Register JWT plugin in app.ts, replace stub with real middleware

### GAP-ORDER-002: Hardcoded JWT Secret
- **Severity:** CRITICAL
- **Audit:** 01-security.md
- **Location:** `plugins/jwt-auth.plugin.ts` line 28
- **Current:** `'your-secret-key-change-in-production'`
- **Fix:** Remove default, fail fast if JWT_SECRET not set

### GAP-ORDER-003: Internal Routes Exposed Without Auth
- **Severity:** CRITICAL
- **Audit:** 05-s2s-auth.md
- **Current:** Internal auth middleware is COMMENTED OUT
- **Risk:** Anyone can call internal endpoints, impersonate other services
- **Fix:** Uncomment and properly configure internal auth

### GAP-ORDER-004: No Chargeback/Dispute Handling
- **Severity:** CRITICAL
- **Audit:** 34-refund-scenarios.md
- **Current:** No handlers for:
  - `dispute.created`
  - `dispute.updated`
  - `dispute.closed`
- **Missing:**
  - Disputes not linked to orders
  - No evidence collection
  - No team alerts
  - No dispute rate monitoring
- **Risk:** Lose all disputes, Stripe shuts down account

### GAP-ORDER-005: Missing Connect Refund Parameters
- **Severity:** CRITICAL
- **Audit:** 34-refund-scenarios.md
- **Current:** Refund requests don't include:
  - `reverse_transfer: true`
  - `refund_application_fee: true`
- **Risk:** Platform loses money on every refund (same as payment-service)

### GAP-ORDER-006: No Transfer Check Before Refund
- **Severity:** CRITICAL
- **Audit:** 34-refund-scenarios.md
- **Current:** Can refund order even if tickets transferred
- **Exploit:**
  1. Buy ticket
  2. Transfer to friend
  3. Request refund
  4. Get money back AND friend has ticket
- **Fix:** Check `ticket.user_id !== original_purchaser` before allowing refund

---

## HIGH Issues

### GAP-ORDER-007: No S2S Authentication
- **Severity:** HIGH
- **Audit:** 05-s2s-auth.md
- **Current:**
  - All internal calls use plain HTTP (not HTTPS)
  - No auth headers on outbound requests
  - No correlation IDs propagated
  - No tenant context forwarded
  - Service URLs: `http://tickettoken-event:3003` (no TLS)
- **Fix:** Add HTTPS, service tokens, correlation IDs

### GAP-ORDER-008: Tax Routes - Zero Validation
- **Severity:** HIGH
- **Audit:** 02-input-validation.md
- **Current:** `tax.routes.ts` - 0 out of 15 routes have validation
- **Routes affected:**
  - POST /jurisdictions
  - POST /rates
  - POST /categories
  - POST /exemptions
  - POST /calculate
  - POST /provider/configure
  - POST /reports
  - All PATCH routes
- **Risk:** Tax manipulation, invalid data, mass assignment

### GAP-ORDER-009: Refund Policy Routes - Zero Validation
- **Severity:** HIGH
- **Audit:** 02-input-validation.md
- **Current:** `refund-policy.routes.ts` - 0 out of 13 routes have validation
- **Risk:** Invalid policies, rule manipulation

### GAP-ORDER-010: No Database SSL
- **Severity:** HIGH
- **Audit:** 01-security.md
- **Current:** `config/database.ts` has no SSL configuration
- **Risk:** Database credentials and data visible on network

### GAP-ORDER-011: GDPR Non-Compliant
- **Severity:** HIGH
- **Audit:** 25-compliance-legal.md
- **ALL checks FAIL:**
  - No data export endpoint (DSAR)
  - No user deletion endpoint (right to erasure)
  - No consent management
  - No breach notification process
  - No data portability
  - No processing restrictions
- **Legal risk:** GDPR fines up to 4% of annual revenue

---

## MEDIUM Issues

### GAP-ORDER-012: Scheduled Jobs Broken
- **Severity:** MEDIUM
- **Audit:** 24-scheduled-jobs-cron.md
- **Current:**
  - `alertJobFailure` is empty stub function
  - `jobMetricsService` returns hardcoded 0
  - No dead letter queue
  - Lock TTL (5min) < job timeout (10min) - jobs can overlap
  - No job failure persistence
- **Impact:** Jobs fail silently, no monitoring, no recovery

### GAP-ORDER-013: No Health Startup Probe
- **Severity:** MEDIUM
- **Audit:** 12-health-checks.md
- **Current:** Missing `/health/startup` for Kubernetes
- **Impact:** K8s can't properly manage pod lifecycle

### GAP-ORDER-014: No Request ID in Error Responses
- **Severity:** MEDIUM
- **Audit:** 03-error-handling.md
- **Current:**
```typescript
reply.status(500).send({ error: 'Failed to create order' });
// No requestId for debugging!
```
- **Impact:** Can't trace errors in production

---

## Frontend-Related Gaps

### GAP-ORDER-015: No Receipt/Invoice Endpoint
- **Severity:** MEDIUM
- **User Story:** "I want to download a receipt for my purchase"
- **Current:**
  - `pdf-generator.ts` utility exists
  - No route exposes it
- **Needed:**
  - GET /orders/:id/receipt - PDF receipt download
  - GET /orders/:id/invoice - Formal invoice for business
- **Impact:** Users can't get purchase documentation

### GAP-ORDER-016: No Order Confirmation Notification Route
- **Severity:** MEDIUM
- **User Story:** "I want to receive confirmation when my order completes"
- **Current:**
  - Comment says "Order confirmation is handled by internal API call"
  - No explicit notification routes
- **Needed:**
  - Verify notification-service integration working
  - POST /orders/:id/resend-confirmation
- **Impact:** Users may not receive order confirmations

### GAP-ORDER-017: Order History Filtering
- **Severity:** LOW
- **User Story:** "I want to see my past orders filtered by date/status"
- **Current:** GET /user/:userId exists but unclear what filters supported
- **Needed:**
  - Query params: ?status=completed&from=2024-01-01&to=2024-12-31
  - Pagination: ?page=1&limit=20
- **Verify:** Check if these already work

---

## All Routes Inventory

### order.routes.ts (14 routes) - ALL USE STUB AUTH
| Method | Path | Auth | Validation |
|--------|------|------|------------|
| POST | / | ⚠️ STUB | ✅ |
| GET | /:orderId | ⚠️ STUB | ❌ |
| GET | /user/:userId | ⚠️ STUB | ❌ |
| POST | /:orderId/capture | ⚠️ STUB | ❌ |
| POST | /:orderId/cancel | ⚠️ STUB | ❌ |
| POST | /:orderId/refund | ⚠️ STUB | ❌ |
| POST | /:orderId/complete | ⚠️ STUB | ❌ |
| GET | /:orderId/items | ⚠️ STUB | ❌ |
| GET | /:orderId/timeline | ⚠️ STUB | ❌ |
| GET | /:orderId/refunds | ⚠️ STUB | ❌ |
| POST | /:orderId/notes | ⚠️ STUB | ❌ |
| POST | /bulk | ⚠️ STUB | ❌ |
| GET | /analytics/summary | ⚠️ STUB | ❌ |
| GET | /reports | ⚠️ STUB | ❌ |

### tax.routes.ts (15 routes) - ZERO VALIDATION
| Method | Path | Auth | Validation |
|--------|------|------|------------|
| POST | /jurisdictions | ❌ | ❌ |
| GET | /jurisdictions | ❌ | ❌ |
| PATCH | /jurisdictions/:id | ❌ | ❌ |
| POST | /rates | ❌ | ❌ |
| GET | /rates | ❌ | ❌ |
| POST | /categories | ❌ | ❌ |
| GET | /categories | ❌ | ❌ |
| POST | /exemptions | ❌ | ❌ |
| GET | /exemptions/customer/:id | ❌ | ❌ |
| POST | /exemptions/:id/verify | ❌ | ❌ |
| POST | /calculate | ❌ | ❌ |
| GET | /orders/:orderId | ❌ | ❌ |
| POST | /provider/configure | ❌ | ❌ |
| GET | /provider/config | ❌ | ❌ |
| POST | /reports | ❌ | ❌ |
| GET | /reports | ❌ | ❌ |
| POST | /reports/:id/file | ❌ | ❌ |

### refund-policy.routes.ts (13 routes) - ZERO VALIDATION
| Method | Path | Auth | Validation |
|--------|------|------|------------|
| POST | /policies | ❌ | ❌ |
| GET | /policies | ❌ | ❌ |
| GET | /policies/:id | ❌ | ❌ |
| PATCH | /policies/:id | ❌ | ❌ |
| DELETE | /policies/:id | ❌ | ❌ |
| POST | /rules | ❌ | ❌ |
| GET | /policies/:id/rules | ❌ | ❌ |
| GET | /rules/:id | ❌ | ❌ |
| PATCH | /rules/:id | ❌ | ❌ |
| DELETE | /rules/:id/deactivate | ❌ | ❌ |
| DELETE | /rules/:id | ❌ | ❌ |
| POST | /reasons | ❌ | ❌ |
| GET | /reasons | ❌ | ❌ |
| GET | /reasons/:id | ❌ | ❌ |
| PATCH | /reasons/:id | ❌ | ❌ |
| DELETE | /reasons/:id | ❌ | ❌ |
| POST | /check-eligibility | ❌ | ❌ |

---

## Database Tables (15 tables)

| Table | Purpose |
|-------|---------|
| orders | Main orders |
| order_items | Line items |
| order_events | Event sourcing |
| order_addresses | Billing/shipping |
| refund_policies | Policy definitions |
| refund_reasons | Reason codes |
| order_refunds | Refund records |
| refund_policy_rules | Policy rules |
| refund_compliance_log | Compliance audit |
| order_modifications | Change history |
| order_splits | Split payments |
| bulk_operations | Bulk ops tracking |
| promo_codes | Discount codes |
| promo_code_redemptions | Code usage |
| order_notes | Internal notes |

---

## Cross-Service Dependencies

| This service needs from | What |
|------------------------|------|
| payment-service | Process payments, refunds |
| ticket-service | Create tickets, check transfer status |
| event-service | Event details, pricing |
| notification-service | Order confirmations |
| auth-service | User verification (NOT WORKING) |

| Other services need from this | What |
|------------------------------|------|
| payment-service | Order context for payments |
| ticket-service | Order completion trigger |
| analytics-service | Order metrics |

---

## Priority Order for Fixes

### BEFORE LAUNCH (Security)
1. GAP-ORDER-001: Enable real authentication (CRITICAL)
2. GAP-ORDER-002: Remove hardcoded JWT secret
3. GAP-ORDER-003: Enable internal auth middleware
4. GAP-ORDER-006: Add transfer check before refund

### Immediate (Money/Legal)
5. GAP-ORDER-004: Add dispute webhook handlers
6. GAP-ORDER-005: Add Connect refund parameters
7. GAP-ORDER-011: GDPR compliance (legal risk)

### This Week (Data Integrity)
8. GAP-ORDER-008: Add validation to tax routes
9. GAP-ORDER-009: Add validation to refund-policy routes
10. GAP-ORDER-010: Enable database SSL
11. GAP-ORDER-007: Add S2S authentication

### This Month (Operational/Frontend)
12. GAP-ORDER-012: Fix scheduled jobs
13. GAP-ORDER-015: Receipt/invoice endpoint
14. GAP-ORDER-016: Confirmation notification route
15. GAP-ORDER-013: Add startup probe
16. GAP-ORDER-014: Add requestId to errors

