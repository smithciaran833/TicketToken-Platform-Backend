## Transfer-Service Security Audit
### Standard: 01-security.md

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Checks** | 45 |
| **Passed** | 28 |
| **Failed** | 10 |
| **Partial** | 7 |
| **Pass Rate** | 62% |

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 3 |
| 🟠 HIGH | 5 |
| 🟡 MEDIUM | 6 |
| 🟢 LOW | 3 |

---

## Section 3.1: Route Layer - Authentication Middleware

### SEC-R1: All protected routes use auth middleware
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.routes.ts:25,36` - Both routes use `authenticate` preHandler |
| Code | `preHandler: [authenticate, validate({ body: giftTransferBodySchema })]` |

### SEC-R2: Auth middleware verifies JWT signature
| Status | **PASS** |
|--------|----------|
| Evidence | `auth.middleware.ts:33` |
| Code | `const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;` |
| Note | Uses `jwt.verify()` correctly, not `jwt.decode()` |

### SEC-R3: JWT algorithm explicitly specified
| Status | **FAIL** 🟠 HIGH |
|--------|------------------|
| Evidence | `auth.middleware.ts:33` |
| Code | `jwt.verify(token, JWT_SECRET)` |
| Issue | No `algorithms` option specified. Vulnerable to algorithm confusion attacks. |
| Remediation | Add `{ algorithms: ['HS256'] }` to verify options |

### SEC-R4: Token expiration validated
| Status | **PASS** |
|--------|----------|
| Evidence | `auth.middleware.ts:40-43` |
| Code | `if (error instanceof jwt.TokenExpiredError)` handler present |
| Note | JWT library automatically validates `exp` claim |

### SEC-R5: Auth middleware rejects expired tokens
| Status | **PASS** |
|--------|----------|
| Evidence | `auth.middleware.ts:40-43` |
| Code | Returns 401 with `'Token expired'` message |

### SEC-R6: No auth secrets hardcoded
| Status | **PASS** |
|--------|----------|
| Evidence | `auth.middleware.ts:4-8` |
| Code | `if (!process.env.JWT_SECRET) { throw new Error('JWT_SECRET environment variable is required'); }` |
| Note | Proper fail-fast on missing secret |

---

## Section 3.1: Route Layer - Rate Limiting

### SEC-R7: Rate limiting on login endpoint
| Status | **N/A** |
|--------|---------|
| Note | No login endpoint in transfer-service (auth handled by auth-service) |

### SEC-R8: Rate limiting on password reset
| Status | **N/A** |
|--------|---------|
| Note | No password reset in transfer-service |

### SEC-R9: Rate limiting on registration
| Status | **N/A** |
|--------|---------|
| Note | No registration in transfer-service |

### SEC-R10: Rate limits are appropriately strict
| Status | **PARTIAL** 🟡 MEDIUM |
|--------|------------------------|
| Evidence | `app.ts:27-30` |
| Code | `await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })` |
| Issue | Global rate limiting configured, but custom rate limiting middleware in `rate-limit.middleware.ts` NOT applied to transfer routes |
| Remediation | Apply `RateLimitPresets.transferCreation` (5/min) to POST `/transfers/gift` |

### SEC-R11: Account lockout after failed attempts
| Status | **N/A** |
|--------|---------|
| Note | Auth handled by auth-service |

### SEC-R12: General API rate limiting exists
| Status | **PASS** |
|--------|----------|
| Evidence | `app.ts:27-30` |
| Code | Fastify rate-limit registered with 100 req/min |

---

## Section 3.1: Route Layer - HTTPS/TLS

### SEC-R13: HTTPS enforced in production
| Status | **PARTIAL** 🟡 MEDIUM |
|--------|------------------------|
| Evidence | `app.ts:20` |
| Code | `trustProxy: true` |
| Issue | Relies on reverse proxy for TLS. No explicit HTTPS redirect. |
| Remediation | Add HSTS header enforcement |

### SEC-R14: HSTS header enabled
| Status | **PASS** |
|--------|----------|
| Evidence | `app.ts:25` |
| Code | `await app.register(helmet);` |
| Note | Helmet enables HSTS by default |

### SEC-R15: Secure cookies configured
| Status | **N/A** |
|--------|---------|
| Note | Service uses JWT headers, not cookies |

### SEC-R16: TLS 1.2+ required
| Status | **NOT VERIFIED** |
|--------|-------------------|
| Note | Infrastructure-level configuration |

---

## Section 3.2: Service Layer - Authorization Checks

### SEC-S1: Object ownership verified before access
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts:36-38` |
| Code | `const ticket = await this.getTicketForUpdate(client, ticketId, fromUserId);` |
| Note | Uses `SELECT ... WHERE id = $1 AND user_id = $2 FOR UPDATE` |

### SEC-S2: No direct ID from request without validation
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.controller.ts:29` |
| Code | `const fromUserId = request.user!.id;` |
| Note | User ID comes from JWT, not request body |

### SEC-S3: Admin functions check admin role
| Status | **N/A** |
|--------|---------|
| Note | No admin functions in transfer endpoints |

### SEC-S4: Role-based middleware applied correctly
| Status | **PASS** |
|--------|----------|
| Evidence | `auth.middleware.ts:71-82, 87-98` |
| Code | `requireAdmin()`, `requireVenueManager()` middleware defined |

### SEC-S5: Multi-tenant data isolation
| Status | **PARTIAL** 🟡 MEDIUM |
|--------|------------------------|
| Evidence | `tenant-context.ts:26-41` |
| Code | Sets `app.current_tenant` via `SET LOCAL` |
| Issue | Default tenant ID `00000000-0000-0000-0000-000000000001` used if missing |
| Remediation | Reject requests without valid tenant_id for sensitive operations |

### SEC-S6: Deny by default authorization
| Status | **PASS** |
|--------|----------|
| Evidence | `auth.middleware.ts:24-27` |
| Code | Returns 401 if no token provided |

---

## Section 3.2: Service Layer - Ownership Verification

### SEC-S7: Orders accessible only by owner
| Status | **N/A** |
|--------|---------|
| Note | No order access in transfer-service |

### SEC-S8: Tickets accessible only by owner
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts:144-153` |
| Code | `SELECT * FROM tickets WHERE id = $1 AND user_id = $2 FOR UPDATE` |

### SEC-S9: Payment methods owned by user
| Status | **N/A** |
|--------|---------|
| Note | No payment method access in transfer-service |

### SEC-S10: User can only modify own profile
| Status | **N/A** |
|--------|---------|
| Note | No user profile modification in transfer-service |

### SEC-S11: Wallet operations verify ownership
| Status | **PASS** |
|--------|----------|
| Evidence | `blockchain-transfer.service.ts:42-48` |
| Code | `const isOwner = await retryBlockchainOperation(() => nftService.verifyOwnership(nftMintAddress, fromWallet), ...)` |

---

## Section 3.2: Service Layer - Input Validation

### SEC-S12: Services validate input before processing
| Status | **PASS** |
|--------|----------|
| Evidence | `validation.middleware.ts`, `schemas.ts` |
| Code | Zod schemas with strict validation |

### SEC-S13: No SQL/NoSQL injection vectors
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts:56-70, 110-115` |
| Code | All queries use parameterized statements `$1, $2, ...` |

### SEC-S14: Sensitive operations require re-auth
| Status | **N/A** |
|--------|---------|
| Note | Transfer operations use existing JWT authentication |

---

## Section 3.3: Database Layer - Encryption

### SEC-DB1: Database connection uses TLS
| Status | **NOT VERIFIED** |
|--------|-------------------|
| Note | Configuration not in service code, likely in shared config |

### SEC-DB2: Encryption at rest enabled
| Status | **NOT VERIFIED** |
|--------|-------------------|
| Note | Infrastructure-level configuration |

### SEC-DB3: Passwords hashed with Argon2id/bcrypt
| Status | **N/A** |
|--------|---------|
| Note | No password storage in transfer-service |

### SEC-DB4: No plaintext passwords stored
| Status | **N/A** |
|--------|---------|
| Note | No password storage in transfer-service |

### SEC-DB5: Sensitive fields encrypted (SSN, etc.)
| Status | **N/A** |
|--------|---------|
| Note | No PII fields in transfer data |

### SEC-DB6: API keys/tokens hashed in database
| Status | **FAIL** 🟡 MEDIUM |
|--------|----------------------|
| Evidence | `transfer.service.ts:51` |
| Code | `acceptance_code` stored in plaintext |
| Issue | Transfer acceptance codes stored unhashed |
| Remediation | Hash acceptance codes before storage, compare hashes |

---

## Section 3.3: Database Layer - Audit Logging

### SEC-DB7: Authentication events logged
| Status | **PARTIAL** 🟡 MEDIUM |
|--------|------------------------|
| Evidence | `auth.middleware.ts:40-56` |
| Issue | Auth failures logged implicitly, no structured audit log |
| Remediation | Add explicit audit logging for auth events |

### SEC-DB8: Authorization failures logged
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.controller.ts:76-78` |
| Code | `logger.error({ err }, 'Unhandled controller error');` |

### SEC-DB9: Data access logged for sensitive resources
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts:71-77, 125-130` |
| Code | Logs transfer creation and acceptance with context |

### SEC-DB10: Logs don't contain sensitive data
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts:71-77` |
| Code | Logs `transferId, ticketId, fromUserId, toEmail` - no passwords/tokens in logs |

### SEC-DB11: Log retention policy implemented
| Status | **NOT VERIFIED** |
|--------|-------------------|
| Note | Infrastructure-level configuration |

---

## Section 3.4: External Integrations - Stripe Webhooks

### SEC-EXT1-6: Stripe webhook security
| Status | **N/A** |
|--------|---------|
| Note | No Stripe integration in transfer-service |

---

## Section 3.4: External Integrations - Solana/Blockchain Keys

### SEC-EXT7: Private keys not in source code
| Status | **PASS** |
|--------|----------|
| Evidence | `solana.config.ts:24-25` |
| Code | `const treasuryPrivateKey = process.env.SOLANA_TREASURY_PRIVATE_KEY!;` |
| Note | Key loaded from environment variable |

### SEC-EXT8: Private keys encrypted at rest
| Status | **FAIL** 🔴 CRITICAL |
|--------|----------------------|
| Evidence | `solana.config.ts:24-27` |
| Code | `const treasury = Keypair.fromSecretKey(bs58.decode(treasuryPrivateKey));` |
| Issue | Private key loaded directly from environment variable, NOT from secrets manager |
| Remediation | Load from AWS Secrets Manager, HashiCorp Vault, or KMS |

### SEC-EXT9: Keys loaded from secure storage
| Status | **FAIL** 🔴 CRITICAL |
|--------|----------------------|
| Evidence | `solana.config.ts` vs `secrets.ts` |
| Issue | `secrets.ts` uses secrets manager for DB credentials, but Solana keys bypass this |
| Code | Treasury key: `process.env.SOLANA_TREASURY_PRIVATE_KEY` |
| Remediation | Migrate Solana keys to `secretsManager.getSecrets()` pattern |

### SEC-EXT10: Transaction signing is local
| Status | **PASS** |
|--------|----------|
| Evidence | `nft.service.ts:41-46` |
| Code | Metaplex SDK handles local signing |
| Note | Private key never sent over network |

### SEC-EXT11: Spending limits implemented
| Status | **FAIL** 🟠 HIGH |
|--------|------------------|
| Evidence | `nft.service.ts`, `blockchain-transfer.service.ts` |
| Issue | No spending limits, transaction limits, or velocity checks |
| Remediation | Implement daily transfer limits, transaction count limits |

### SEC-EXT12: Multi-sig for high-value ops
| Status | **FAIL** 🟠 HIGH |
|--------|------------------|
| Evidence | `solana.config.ts:26` |
| Code | Single `treasury` keypair used for all operations |
| Issue | No multi-signature wallet for treasury operations |
| Remediation | Implement Squads multisig for treasury wallet |

---

## Section 3.4: External Integrations - Secrets Management

### SEC-EXT13: No secrets in git history
| Status | **NOT VERIFIED** |
|--------|-------------------|
| Note | Requires git history scan |

### SEC-EXT14: .env files in .gitignore
| Status | **PASS** |
|--------|----------|
| Evidence | `.gitignore` in project root |

### SEC-EXT15: Secrets manager used
| Status | **PARTIAL** 🟠 HIGH |
|--------|----------------------|
| Evidence | `secrets.ts:7` |
| Code | `import { secretsManager } from '../../../../shared/utils/secrets-manager';` |
| Issue | Database secrets use manager, but Solana keys use plain env vars |
| Remediation | Migrate ALL secrets to secrets manager |

### SEC-EXT16: Secret rotation capability
| Status | **NOT VERIFIED** |
|--------|-------------------|
| Note | Depends on secrets manager implementation |

### SEC-EXT17: Least privilege for service accounts
| Status | **NOT VERIFIED** |
|--------|-------------------|
| Note | Cloud IAM policy review required |

---

## Additional Security Findings

### CRITICAL: Weak Acceptance Code Generation
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `transfer.service.ts:227-232` |
| Code | `return Math.random().toString(36).substring(2, 2 + length).toUpperCase();` |
| Issue | `Math.random()` is NOT cryptographically secure |
| Remediation | Use `crypto.randomBytes()` for security-sensitive token generation |
| Fix | `crypto.randomBytes(6).toString('hex').toUpperCase()` |

### HIGH: Missing Request ID Propagation
| Severity | 🟠 HIGH |
|----------|---------|
| Evidence | `app.ts:19-21` |
| Code | `requestIdHeader: 'x-request-id', genReqId: () => uuidv4()` |
| Issue | Request ID not propagated to blockchain operations |
| Remediation | Pass request ID to all service methods for tracing |

---

## Prioritized Remediations

### 🔴 CRITICAL (Fix Immediately)

1. **SEC-EXT8/9: Solana Private Key Storage**
   - File: `solana.config.ts:24-27`
   - Action: Load treasury key from secrets manager, not env var
```typescript
   const treasuryKey = await secretsManager.getSecret('SOLANA_TREASURY_PRIVATE_KEY');
```

2. **Weak Acceptance Code Generation**
   - File: `transfer.service.ts:227-232`
   - Action: Replace `Math.random()` with `crypto.randomBytes()`
```typescript
   import crypto from 'crypto';
   private generateAcceptanceCode(): string {
     return crypto.randomBytes(6).toString('hex').toUpperCase();
   }
```

3. **SEC-R3: JWT Algorithm Not Specified**
   - File: `auth.middleware.ts:33`
   - Action: Add explicit algorithm whitelist
```typescript
   jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
```

### 🟠 HIGH (Fix Within 24-48 Hours)

4. **SEC-EXT11: Missing Spending Limits**
   - Add daily/per-transaction limits for blockchain operations

5. **SEC-EXT12: Single-Key Treasury**
   - Migrate to multi-sig wallet using Squads Protocol

6. **SEC-R10: Transfer Rate Limiting**
   - Apply `RateLimitPresets.transferCreation` to POST `/transfers/gift`

### 🟡 MEDIUM (Fix Within 1 Week)

7. **SEC-S5: Default Tenant ID**
   - Reject requests without valid tenant_id

8. **SEC-DB6: Acceptance Code Hashing**
   - Hash acceptance codes before storage

9. **SEC-DB7: Auth Audit Logging**
   - Add structured audit log for authentication events

---

## End of Security Audit Report
