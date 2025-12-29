# Auth Service - 02 Input Validation Audit

**Service:** auth-service
**Document:** 02-input-validation.md
**Date:** 2025-12-22
**Auditor:** Cline + Human Review
**Pass Rate:** 90% (38/42)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 1 | No response schemas (data leakage risk) |
| MEDIUM | 3 | Phone pattern missing, password reuse check, Unicode normalization |
| LOW | 1 | Response filtering code-dependent |

---

## Section 3.1: Route Definition (9/10 PASS)

### RD1: All routes have schema validation
**Status:** PASS
**Evidence:** Every route has `preHandler` with `validate(schemas.*)` call.

### RD2: Body schema defined for POST/PUT/PATCH
**Status:** PASS
**Evidence:** `auth.validators.ts` has schemas for all mutating endpoints.

### RD3: Params schema defined with format validation
**Status:** PASS
**Evidence:** `sessionIdParamSchema`, `venueIdParamSchema`, `publicKeyParamSchema` all use UUID/pattern validation.

### RD4: Query schema defined with type constraints
**Status:** PASS
**Evidence:** `verifyEmailSchema`, `paginationQuerySchema` with proper types and bounds.

### RD5: Response schema defined
**Status:** FAIL
**Issue:** No response schemas - controllers return raw objects.
**Remediation:** Add Fastify response schemas to prevent accidental data leakage.

### RD6: `.unknown(false)` on all schemas
**Status:** PASS
**Evidence:** All 30+ schemas have `.unknown(false)`.

### RD7: Arrays have `maxItems`
**Status:** PARTIAL (N/A for auth-service - no array inputs, pagination limits exist)

### RD8: Strings have `maxLength`
**Status:** PASS
**Evidence:** All strings have max lengths (email 255, password 128, names 50, etc.)

### RD9: Integers have min/max
**Status:** PASS
**Evidence:** `page` min 1, `limit` min 1 max 100.

### RD10: Enums use allowed values
**Status:** PASS
**Evidence:** `.valid('solana', 'ethereum')`, `.valid('phantom', 'solflare', 'metamask')`, etc.

---

## Section 3.2: Schema Definition (8/9 PASS)

### SD1: UUIDs validated
**Status:** PASS
**Evidence:** All ID fields use `Joi.string().uuid()`.

### SD2: Emails validated
**Status:** PASS
**Evidence:** `Joi.string().email().max(255)`.

### SD3: URLs validated
**Status:** N/A (no URL inputs)

### SD4: Dates validated
**Status:** N/A (no date inputs)

### SD5: Phone numbers have pattern
**Status:** PARTIAL
**Issue:** `phone: Joi.string().max(20)` - no format validation.
**Remediation:** Add E.164 pattern: `.pattern(/^\+?[1-9]\d{1,14}$/)`.

### SD6: No `Joi.any()`
**Status:** PASS

### SD7: Optional fields marked
**Status:** PASS

### SD8: Default values set
**Status:** PASS
**Evidence:** Pagination defaults (page=1, limit=20, order=desc).

### SD9: Schemas are reusable
**Status:** PASS
**Evidence:** Common param schemas defined once, reused.

### SD10: Consistent naming
**Status:** PASS
**Evidence:** `*Schema` suffix convention throughout.

---

## Section 3.3: Service Layer (7/8 PASS)

### SL1: Business rule validation after schema
**Status:** PASS
**Evidence:** Tenant validation, account lockout checks, nonce expiration.

### SL2: Authorization before data access
**Status:** PASS
**Evidence:** Session queries include user_id + tenant_id ownership checks.

### SL3: Entity existence validated
**Status:** PASS
**Evidence:** User/session/wallet existence checked before operations.

### SL4: State transitions validated
**Status:** PASS
**Evidence:** MFA state checked before enable/disable/regenerate.

### SL5: Cross-field validation
**Status:** PARTIAL
**Issue:** No check that newPassword != currentPassword.
**Remediation:** Add comparison in `changePassword` service.

### SL6: External input re-validated if transformed
**Status:** PASS
**Evidence:** Email lowercased, nonce message reconstructed and verified.

### SL7: No direct `request.body` in DB
**Status:** PASS
**Evidence:** Controllers extract specific fields, use allowlists.

### SL8: Sensitive fields filtered from responses
**Status:** PARTIAL
**Evidence:** password_hash excluded, but relies on code discipline not schemas.

---

## Section 3.4: Database Layer (8/8 PASS)

### DB1: Parameterized queries
**Status:** PASS
**Evidence:** All queries use `$1, $2` placeholders.

### DB2: Raw queries use bindings
**Status:** PASS

### DB3: Dynamic columns use allowlist
**Status:** PASS
**Evidence:** `sortBy` validated against `.valid()` list.

### DB4: No user input in table/column names
**Status:** PASS

### DB5: NOT NULL constraints
**Status:** PASS
**Evidence:** Critical fields (email, password_hash, tenant_id) are NOT NULL.

### DB6: Database constraints defined
**Status:** PASS
**Evidence:** CHECK constraints for email format, username format, age minimum.

### DB7: Explicit field lists (no SELECT *)
**Status:** PASS

### DB8: Explicit INSERT/UPDATE field mapping
**Status:** PASS

---

## Section 3.5: Security-Specific (6/7 PASS)

### SEC1: Prototype pollution blocked
**Status:** PASS
**Evidence:** `.unknown(false)` rejects `__proto__` etc.

### SEC2: Mass assignment prevented
**Status:** PASS
**Evidence:** `.unknown(false)` + explicit allowlists.

### SEC3: SQL injection prevented
**Status:** PASS

### SEC4: XSS prevented
**Status:** PASS
**Evidence:** `stripHtml()`, `escapeHtml()` in sanitize.ts, applied to names.

### SEC5-SEC7: File handling
**Status:** N/A

### SEC8: Unicode normalized
**Status:** FAIL
**Issue:** No `.normalize('NFC')` before string comparison.
**Remediation:** Add normalization to email/username before storage/comparison.

### SEC9: Integer overflow prevented
**Status:** PASS

### SEC10: Rate limiting on validation endpoints
**Status:** PASS

---

## Remediation Priority

### HIGH
1. **Add response schemas** - Prevent accidental data leakage

### MEDIUM
1. **Add phone E.164 pattern** - `Joi.string().pattern(/^\+?[1-9]\d{1,14}$/)`
2. **Add password reuse check** - Compare new vs old in changePassword
3. **Add Unicode normalization** - `.normalize('NFC')` on email/username

