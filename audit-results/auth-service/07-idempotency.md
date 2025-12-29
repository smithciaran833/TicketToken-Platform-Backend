# Auth Service - 07 Idempotency Audit

**Service:** auth-service
**Document:** 07-idempotency.md
**Date:** 2025-12-22
**Auditor:** Cline + Human Review
**Pass Rate:** 0% formal (2/6 natural idempotency)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 1 | No idempotency key middleware |
| MEDIUM | 2 | Password reset sends multiple emails, MFA setup generates multiple secrets |
| LOW | 1 | Registration returns 409 not original data |

**Context:** Auth-service is not payment-critical. Stripe/ticket/NFT idempotency handled by other services. Main concern is UX issues from duplicate requests.

---

## N/A Sections

- **Payment Flow (Stripe):** N/A - handled by payment-service
- **Webhook Handlers:** N/A - OAuth uses redirects
- **Ticket Purchases:** N/A - handled by ticket-service
- **NFT Minting:** N/A - handled by minting-service

---

## State-Changing Operations (0/10 PASS)

### Check 1: POST endpoints support idempotency keys
**Status:** FAIL
**Issue:** No `Idempotency-Key` header handling.
**Remediation:** Add idempotency middleware for register, forgot-password, MFA setup.

### Check 2: Persistent idempotency storage
**Status:** PARTIAL
**Issue:** Redis available but not used for idempotency.

### Check 3-10: Atomicity, replay headers, tenant scoping, etc.
**Status:** FAIL
**Issue:** No idempotency system to evaluate.

---

## Auth-Specific Operations

### Registration
**Status:** PARTIAL (Natural Idempotency)
**Evidence:** Email unique constraint returns 409 on duplicate.
**Limitation:** Returns error, not original user data.

### Password Reset
**Status:** FAIL
**Issue:** Each request generates new token, sends new email.
**Remediation:** Deduplicate within 5-min window using Redis.

### MFA Setup
**Status:** FAIL
**Issue:** Each call generates new secret.
**Remediation:** Track pending MFA setup in Redis, return same secret within window.

### Token Refresh
**Status:** PASS (Correctly Non-Idempotent)
**Evidence:** Should generate new tokens each time for security.

### Wallet Connection
**Status:** PASS (Natural Idempotency)
**Evidence:** Check-then-create pattern returns existing connection.

### Login
**Status:** PASS (Correctly Non-Idempotent)
**Evidence:** Each login creates new session - correct behavior.

---

## Remediation Priority

### HIGH
1. **Add idempotency middleware** - For registration, forgot-password
```typescript
const cached = await redis.get(`idempotency:${key}`);
if (cached) {
  reply.header('X-Idempotent-Replayed', 'true');
  return reply.send(JSON.parse(cached));
}
```

### MEDIUM
1. **Deduplicate password reset** - Same email within 5 min returns existing token
2. **Track MFA setup state** - Return same secret if setup in progress

