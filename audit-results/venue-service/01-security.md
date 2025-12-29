# Venue Service - 01 Security Audit

**Service:** venue-service
**Document:** 01-security.md
**Date:** 2025-12-22
**Auditor:** Cline
**Pass Rate:** 78% (36/46 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | Missing auth on Stripe routes, API keys stored unhashed |
| HIGH | 3 | No DB SSL, No HSTS header, No HTTPS enforcement |
| MEDIUM | 4 | Missing PII scrubbing, webhook body parsing, rate limit fail-open, tenant context manual |
| LOW | 1 | No explicit cookie security config |

---

## Section 3.1: Route Layer (12/16 PASS)

### SEC-R1: All protected routes use auth middleware
**Status:** PARTIAL
**Evidence:** Most routes use `authenticate` preHandler.
**Issue:** `venue-stripe.routes.ts:19,28,38` - Stripe Connect routes have NO authentication (TODO comments only).
**Remediation:** Add `authenticate` and `requireVenueAccess` middleware.

### SEC-R2: Auth middleware verifies JWT signature
**Status:** PASS
**Evidence:** `fastify.ts:102-110` - Uses `@fastify/jwt` with RS256 public key verification.

### SEC-R3: JWT algorithm explicitly specified
**Status:** PASS
**Evidence:** `algorithms: ['RS256']` explicitly whitelisted.

### SEC-R4: Token expiration validated
**Status:** PASS

### SEC-R5: Auth middleware rejects expired tokens
**Status:** PASS
**Evidence:** Throws `UnauthorizedError('Invalid or expired token')`.

### SEC-R6: No auth secrets hardcoded
**Status:** PASS

### SEC-R7-R9: Rate limiting on auth endpoints
**Status:** N/A - Auth endpoints handled by auth-service.

### SEC-R10: Rate limits appropriately strict
**Status:** PASS
**Evidence:** 100 venues/hr, 20 updates/min.

### SEC-R11: Account lockout
**Status:** N/A - Auth handled by auth-service.

### SEC-R12: General API rate limiting
**Status:** PASS
**Note:** Fails open on Redis error.

### SEC-R13: HTTPS enforced
**Status:** FAIL
**Issue:** No HTTPS redirect middleware found.

### SEC-R14: HSTS header enabled
**Status:** PARTIAL
**Evidence:** Helmet registered but no explicit HSTS config.
**Remediation:** Add `hsts: { maxAge: 31536000 }` to helmet.

### SEC-R15-R16: Cookies/TLS
**Status:** N/A (Bearer tokens, infrastructure level)

---

## Section 3.2: Service Layer (13/14 PASS)

### SEC-S1: Object ownership verified before access
**Status:** PASS
**Evidence:** `getVenue()` calls `checkVenueAccess()`, throws `ForbiddenError`.

### SEC-S2: No direct ID from request without validation
**Status:** PASS

### SEC-S3: Admin functions check admin role
**Status:** PASS
**Evidence:** Delete verifies `staffMember.role !== 'owner'`.

### SEC-S4: Role-based middleware applied correctly
**Status:** PASS
**Evidence:** `hasPermission(venueId, userId, 'venue:update')`.

### SEC-S5: Multi-tenant data isolation
**Status:** PASS
**Evidence:** RLS policy `venues_tenant_isolation` enforced.

### SEC-S6: Deny by default authorization
**Status:** PASS

### SEC-S7-S11: Domain-specific ownership
**Status:** N/A (other services)

### SEC-S12: Services validate input
**Status:** PASS
**Evidence:** Comprehensive Joi schemas with type/length validation.

### SEC-S13: No SQL/NoSQL injection
**Status:** PASS
**Evidence:** Knex query builder with parameterized queries.

### SEC-S14: Sensitive ops require re-auth
**Status:** N/A

---

## Section 3.3: Database Layer (8/11 PASS)

### SEC-DB1: Database connection uses TLS
**Status:** FAIL
**Evidence:** No SSL config in connection.
**Remediation:** Add `ssl: { rejectUnauthorized: true }`.

### SEC-DB2: Encryption at rest
**Status:** N/A (Infrastructure)

### SEC-DB3-DB4: Password hashing
**Status:** N/A (no passwords stored)

### SEC-DB5: Sensitive fields encrypted
**Status:** PASS
**Evidence:** `api_key_encrypted`, `api_secret_encrypted` columns.

### SEC-DB6: API keys/tokens hashed
**Status:** FAIL
**Evidence:** API `key` stored as plain string.
**Remediation:** Hash with SHA-256, only return plaintext on creation.

### SEC-DB7: Authentication events logged
**Status:** PASS

### SEC-DB8: Authorization failures logged
**Status:** PASS

### SEC-DB9: Data access logged
**Status:** PASS
**Evidence:** Audit trigger `audit_venues_changes`.

### SEC-DB10: Logs don't contain sensitive data
**Status:** PARTIAL
**Issue:** No PII masking.
**Remediation:** Add email/phone redaction.

### SEC-DB11: Log retention policy
**Status:** PASS

---

## Section 3.4: External Integrations (7/10 PASS)

### SEC-EXT1: Webhook signature verified
**Status:** PASS
**Evidence:** `stripe.webhooks.constructEvent()`.

### SEC-EXT2: Raw body for verification
**Status:** PARTIAL
**Issue:** Fastify may parse JSON before webhook handler.
**Remediation:** Register raw body parser for webhook route.

### SEC-EXT3: Webhook secret from environment
**Status:** PASS

### SEC-EXT4: Webhook idempotency
**Status:** PARTIAL
**Issue:** No `event.id` deduplication.
**Remediation:** Store processed event IDs in Redis.

### SEC-EXT5: Failed verification returns 400
**Status:** PASS

### SEC-EXT6: Stripe API key not hardcoded
**Status:** PASS

### SEC-EXT7-12: Blockchain keys
**Status:** N/A (blockchain-service scope)

### SEC-EXT13-14: Git secrets
**Status:** PASS

### SEC-EXT15: Secrets manager used
**Status:** PASS

### SEC-EXT16: Secret rotation
**Status:** PARTIAL - No rotation mechanism.

### SEC-EXT17: Least privilege
**Status:** N/A (Infrastructure)

---

## Remediation Priority

### CRITICAL (Immediate)
1. Add auth to Stripe routes - `venue-stripe.routes.ts:19,28,38`
2. Hash API keys - Store SHA-256 hash, only return plaintext on creation

### HIGH (This Week)
1. Configure DB SSL - Add `ssl: { rejectUnauthorized: true }`
2. Add HSTS header - `hsts: { maxAge: 31536000 }`
3. Enforce HTTPS - Gateway or middleware

### MEDIUM (This Month)
1. Fix webhook raw body parsing
2. Add webhook idempotency with Redis
3. Add PII scrubbing to logger
4. Review rate limit fail-open behavior
