# Security Audit Review: auth-service

**Generated:** 2025-12-21T01:18:52.001Z

## Summary

- **Total Findings:** 133
- **Critical:** 55
- **High:** 52
- **Medium:** 26
- **Low:** 0

## Instructions

Review each finding below and determine if it's a TRUE ISSUE or FALSE POSITIVE.

For each finding, add one of these judgments:

- ✅ **TRUE ISSUE** - Legitimate security/validation problem that should be fixed
- ❌ **FALSE POSITIVE** - Incorrectly flagged, no actual issue
- ⚠️ **NEEDS CONTEXT** - Requires more information to determine

Add a brief reason for your judgment.

---

## 🔴 SEC-R1: Route without authentication middleware

**Severity:** CRITICAL  
**Count:** 32 findings

Review each finding and mark as TRUE ISSUE or FALSE POSITIVE with brief reason.

### Finding 1

- **File:** `src/routes/auth.routes.ts`
- **Line:** 74
- **Code:** `fastify.post('/forgot-password', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 2

- **File:** `src/routes/auth.routes.ts`
- **Line:** 83
- **Code:** `fastify.post('/reset-password', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 3

- **File:** `src/routes/auth.routes.ts`
- **Line:** 100
- **Code:** `fastify.get('/verify-email', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 4

- **File:** `src/routes/auth.routes.ts`
- **Line:** 109
- **Code:** `fastify.post('/refresh', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 5

- **File:** `src/routes/auth.routes.ts`
- **Line:** 122
- **Code:** `fastify.post('/oauth/:provider/callback', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 6

- **File:** `src/routes/auth.routes.ts`
- **Line:** 176
- **Code:** `fastify.post('/wallet/nonce', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 7

- **File:** `src/routes/auth.routes.ts`
- **Line:** 202
- **Code:** `fastify.post('/biometric/challenge', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 8

- **File:** `src/routes/auth.routes.ts`
- **Line:** 252
- **Code:** `fastify.get('/verify', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 9

- **File:** `src/routes/auth.routes.ts`
- **Line:** 261
- **Code:** `fastify.get('/me', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 10

- **File:** `src/routes/auth.routes.ts`
- **Line:** 270
- **Code:** `fastify.post('/logout', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 11

- **File:** `src/routes/auth.routes.ts`
- **Line:** 279
- **Code:** `fastify.post('/resend-verification', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 12

- **File:** `src/routes/auth.routes.ts`
- **Line:** 288
- **Code:** `fastify.put('/change-password', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 13

- **File:** `src/routes/auth.routes.ts`
- **Line:** 300
- **Code:** `fastify.post('/mfa/setup', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 14

- **File:** `src/routes/auth.routes.ts`
- **Line:** 308
- **Code:** `fastify.post('/mfa/verify-setup', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 15

- **File:** `src/routes/auth.routes.ts`
- **Line:** 316
- **Code:** `fastify.post('/mfa/verify', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 16

- **File:** `src/routes/auth.routes.ts`
- **Line:** 324
- **Code:** `fastify.post('/mfa/regenerate-backup-codes', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 17

- **File:** `src/routes/auth.routes.ts`
- **Line:** 332
- **Code:** `fastify.delete('/mfa/disable', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 18

- **File:** `src/routes/auth.routes.ts`
- **Line:** 344
- **Code:** `fastify.post('/wallet/link', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 19

- **File:** `src/routes/auth.routes.ts`
- **Line:** 351
- **Code:** `fastify.delete('/wallet/unlink/:publicKey', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 20

- **File:** `src/routes/auth.routes.ts`
- **Line:** 387
- **Code:** `fastify.get('/biometric/challenge', async (request: any, reply: any) => {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 21

- **File:** `src/routes/auth.routes.ts`
- **Line:** 393
- **Code:** `fastify.get('/biometric/devices', async (request: any, reply: any) => {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 22

- **File:** `src/routes/auth.routes.ts`
- **Line:** 399
- **Code:** `fastify.delete('/biometric/devices/:credentialId', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 23

- **File:** `src/routes/auth.routes.ts`
- **Line:** 421
- **Code:** `fastify.post('/oauth/:provider/link', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 24

- **File:** `src/routes/auth.routes.ts`
- **Line:** 432
- **Code:** `fastify.delete('/oauth/:provider/unlink', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 25

- **File:** `src/routes/auth.routes.ts`
- **Line:** 446
- **Code:** `fastify.get('/sessions', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 26

- **File:** `src/routes/auth.routes.ts`
- **Line:** 456
- **Code:** `fastify.delete('/sessions/all', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 27

- **File:** `src/routes/auth.routes.ts`
- **Line:** 464
- **Code:** `fastify.delete('/sessions/:sessionId', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 28

- **File:** `src/routes/auth.routes.ts`
- **Line:** 477
- **Code:** `fastify.get('/profile', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 29

- **File:** `src/routes/auth.routes.ts`
- **Line:** 485
- **Code:** `fastify.put('/profile', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 30

- **File:** `src/routes/auth.routes.ts`
- **Line:** 497
- **Code:** `fastify.post('/venues/:venueId/roles', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 31

- **File:** `src/routes/auth.routes.ts`
- **Line:** 515
- **Code:** `fastify.delete('/venues/:venueId/roles/:userId', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 32

- **File:** `src/routes/auth.routes.ts`
- **Line:** 532
- **Code:** `fastify.get('/venues/:venueId/roles', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

## 🔴 SEC-S5: Database query without tenant_id filter - multi-tenant isolation risk

**Severity:** CRITICAL  
**Count:** 22 findings

Review each finding and mark as TRUE ISSUE or FALSE POSITIVE with brief reason.

### Finding 1

- **File:** `src/services/wallet.service.ts`
- **Line:** 220
- **Code:** `'SELECT * FROM wallet_connections WHERE wallet_address = $1 AND network = $2 AND verified = true',`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 2

- **File:** `src/services/wallet.service.ts`
- **Line:** 342
- **Code:** `'SELECT user_id FROM wallet_connections WHERE wallet_address = $1 AND network = $2',`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 3

- **File:** `src/services/wallet.service.ts`
- **Line:** 379
- **Code:** `'DELETE FROM wallet_connections WHERE user_id = $1 AND wallet_address = $2',`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 4

- **File:** `src/services/oauth.service.ts`
- **Line:** 161
- **Code:** ``SELECT user_id FROM oauth_connections`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 5

- **File:** `src/services/oauth.service.ts`
- **Line:** 240
- **Code:** ``SELECT * FROM users WHERE id = $1`,`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 6

- **File:** `src/services/oauth.service.ts`
- **Line:** 329
- **Code:** ``SELECT id FROM oauth_connections`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 7

- **File:** `src/services/oauth.service.ts`
- **Line:** 340
- **Code:** ``SELECT user_id FROM oauth_connections`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 8

- **File:** `src/services/oauth.service.ts`
- **Line:** 369
- **Code:** ``DELETE FROM oauth_connections`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 9

- **File:** `src/services/auth.service.ts`
- **Line:** 35
- **Code:** `'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 10

- **File:** `src/services/auth.service.ts`
- **Line:** 51
- **Code:** `'SELECT id FROM tenants WHERE id = $1',`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 11

- **File:** `src/services/auth.service.ts`
- **Line:** 417
- **Code:** `'SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL',`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 12

- **File:** `src/services/auth.service.ts`
- **Line:** 465
- **Code:** `'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW() AND deleted_at IS NULL',`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 13

- **File:** `src/services/auth.service.ts`
- **Line:** 488
- **Code:** `'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 14

- **File:** `src/migrations/001_auth_baseline.ts`
- **Line:** 66
- **Code:** `IF field_name != 'updated_at' AND old_data_json->field_name IS DISTINCT FROM new_data_json->field_name THEN`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 15

- **File:** `src/migrations/001_auth_baseline.ts`
- **Line:** 89
- **Code:** `IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_transactions') THEN`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 16

- **File:** `src/migrations/001_auth_baseline.ts`
- **Line:** 90
- **Code:** `UPDATE users u SET total_spent = COALESCE((SELECT SUM(pt.amount) FROM payment_transactions pt WHERE pt.user_id = u.id AND pt.status = 'completed' AND pt.deleted_at IS NULL), 0);`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 17

- **File:** `src/migrations/001_auth_baseline.ts`
- **Line:** 93
- **Code:** `IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tickets') THEN`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 18

- **File:** `src/migrations/001_auth_baseline.ts`
- **Line:** 94
- **Code:** `UPDATE users u SET events_attended = COALESCE((SELECT COUNT(DISTINCT t.event_id) FROM tickets t WHERE t.user_id = u.id AND t.status IN ('used') AND t.deleted_at IS NULL), 0);`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 19

- **File:** `src/migrations/001_auth_baseline.ts`
- **Line:** 145
- **Code:** `DELETE FROM user_sessions WHERE ended_at < NOW() - INTERVAL '30 days';`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 20

- **File:** `src/migrations/001_auth_baseline.ts`
- **Line:** 158
- **Code:** `DELETE FROM wallet_connections WHERE user_id NOT IN (SELECT id FROM users);`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 21

- **File:** `src/migrations/001_auth_baseline.ts`
- **Line:** 159
- **Code:** `DELETE FROM user_sessions WHERE user_id NOT IN (SELECT id FROM users);`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 22

- **File:** `src/controllers/session.controller.ts`
- **Line:** 122
- **Code:** ``SELECT id FROM users`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

## 🔴 SEC-R2: JWT decode used instead of verify - no signature verification

**Severity:** CRITICAL  
**Count:** 1 findings

Review each finding and mark as TRUE ISSUE or FALSE POSITIVE with brief reason.

### Finding 1

- **File:** `src/services/jwt.service.ts`
- **Line:** 254
- **Code:** `return jwt.decode(token);`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

## 🟠 RD1: Route without schema validation

**Severity:** HIGH  
**Count:** 39 findings

Review each finding and mark as TRUE ISSUE or FALSE POSITIVE with brief reason.

### Finding 1

- **File:** `src/routes/auth.routes.ts`
- **Line:** 48
- **Code:** `fastify.post('/register', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 2

- **File:** `src/routes/auth.routes.ts`
- **Line:** 57
- **Code:** `fastify.post('/login', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 3

- **File:** `src/routes/auth.routes.ts`
- **Line:** 74
- **Code:** `fastify.post('/forgot-password', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 4

- **File:** `src/routes/auth.routes.ts`
- **Line:** 83
- **Code:** `fastify.post('/reset-password', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 5

- **File:** `src/routes/auth.routes.ts`
- **Line:** 100
- **Code:** `fastify.get('/verify-email', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 6

- **File:** `src/routes/auth.routes.ts`
- **Line:** 109
- **Code:** `fastify.post('/refresh', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 7

- **File:** `src/routes/auth.routes.ts`
- **Line:** 122
- **Code:** `fastify.post('/oauth/:provider/callback', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 8

- **File:** `src/routes/auth.routes.ts`
- **Line:** 151
- **Code:** `fastify.post('/oauth/:provider/login', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 9

- **File:** `src/routes/auth.routes.ts`
- **Line:** 176
- **Code:** `fastify.post('/wallet/nonce', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 10

- **File:** `src/routes/auth.routes.ts`
- **Line:** 183
- **Code:** `fastify.post('/wallet/register', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 11

- **File:** `src/routes/auth.routes.ts`
- **Line:** 190
- **Code:** `fastify.post('/wallet/login', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 12

- **File:** `src/routes/auth.routes.ts`
- **Line:** 202
- **Code:** `fastify.post('/biometric/challenge', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 13

- **File:** `src/routes/auth.routes.ts`
- **Line:** 213
- **Code:** `fastify.post('/biometric/authenticate', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 14

- **File:** `src/routes/auth.routes.ts`
- **Line:** 252
- **Code:** `fastify.get('/verify', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 15

- **File:** `src/routes/auth.routes.ts`
- **Line:** 261
- **Code:** `fastify.get('/me', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 16

- **File:** `src/routes/auth.routes.ts`
- **Line:** 270
- **Code:** `fastify.post('/logout', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 17

- **File:** `src/routes/auth.routes.ts`
- **Line:** 279
- **Code:** `fastify.post('/resend-verification', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 18

- **File:** `src/routes/auth.routes.ts`
- **Line:** 288
- **Code:** `fastify.put('/change-password', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 19

- **File:** `src/routes/auth.routes.ts`
- **Line:** 300
- **Code:** `fastify.post('/mfa/setup', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 20

- **File:** `src/routes/auth.routes.ts`
- **Line:** 308
- **Code:** `fastify.post('/mfa/verify-setup', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 21

- **File:** `src/routes/auth.routes.ts`
- **Line:** 316
- **Code:** `fastify.post('/mfa/verify', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 22

- **File:** `src/routes/auth.routes.ts`
- **Line:** 324
- **Code:** `fastify.post('/mfa/regenerate-backup-codes', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 23

- **File:** `src/routes/auth.routes.ts`
- **Line:** 332
- **Code:** `fastify.delete('/mfa/disable', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 24

- **File:** `src/routes/auth.routes.ts`
- **Line:** 344
- **Code:** `fastify.post('/wallet/link', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 25

- **File:** `src/routes/auth.routes.ts`
- **Line:** 351
- **Code:** `fastify.delete('/wallet/unlink/:publicKey', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 26

- **File:** `src/routes/auth.routes.ts`
- **Line:** 364
- **Code:** `fastify.post('/biometric/register', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 27

- **File:** `src/routes/auth.routes.ts`
- **Line:** 387
- **Code:** `fastify.get('/biometric/challenge', async (request: any, reply: any) => {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 28

- **File:** `src/routes/auth.routes.ts`
- **Line:** 393
- **Code:** `fastify.get('/biometric/devices', async (request: any, reply: any) => {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 29

- **File:** `src/routes/auth.routes.ts`
- **Line:** 399
- **Code:** `fastify.delete('/biometric/devices/:credentialId', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 30

- **File:** `src/routes/auth.routes.ts`
- **Line:** 421
- **Code:** `fastify.post('/oauth/:provider/link', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 31

- **File:** `src/routes/auth.routes.ts`
- **Line:** 432
- **Code:** `fastify.delete('/oauth/:provider/unlink', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 32

- **File:** `src/routes/auth.routes.ts`
- **Line:** 446
- **Code:** `fastify.get('/sessions', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 33

- **File:** `src/routes/auth.routes.ts`
- **Line:** 456
- **Code:** `fastify.delete('/sessions/all', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 34

- **File:** `src/routes/auth.routes.ts`
- **Line:** 464
- **Code:** `fastify.delete('/sessions/:sessionId', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 35

- **File:** `src/routes/auth.routes.ts`
- **Line:** 477
- **Code:** `fastify.get('/profile', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 36

- **File:** `src/routes/auth.routes.ts`
- **Line:** 485
- **Code:** `fastify.put('/profile', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 37

- **File:** `src/routes/auth.routes.ts`
- **Line:** 497
- **Code:** `fastify.post('/venues/:venueId/roles', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 38

- **File:** `src/routes/auth.routes.ts`
- **Line:** 515
- **Code:** `fastify.delete('/venues/:venueId/roles/:userId', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 39

- **File:** `src/routes/auth.routes.ts`
- **Line:** 532
- **Code:** `fastify.get('/venues/:venueId/roles', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

## 🟠 SEC-DB10: Log statement may contain sensitive data (password/token/secret)

**Severity:** HIGH  
**Count:** 11 findings

Review each finding and mark as TRUE ISSUE or FALSE POSITIVE with brief reason.

### Finding 1

- **File:** `src/controllers/auth.controller.ts`
- **Line:** 63
- **Code:** `console.log('[LOGIN] MFA required, no token provided');`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 2

- **File:** `src/controllers/auth.controller.ts`
- **Line:** 71
- **Code:** `console.log('[LOGIN] Verifying MFA token...');`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 3

- **File:** `src/services/auth.service.ts`
- **Line:** 62
- **Code:** `this.log.debug('Hashing password');`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 4

- **File:** `src/services/auth.service.ts`
- **Line:** 303
- **Code:** `this.log.info('Token refresh attempt', { ipAddress, userAgent });`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 5

- **File:** `src/services/auth.service.ts`
- **Line:** 330
- **Code:** `this.log.info('Token refresh successful', { userId: user.id });`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 6

- **File:** `src/services/auth.service.ts`
- **Line:** 347
- **Code:** `this.log.warn('Token refresh failed', {`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 7

- **File:** `src/services/auth.service.ts`
- **Line:** 409
- **Code:** `this.log.info('Password reset request');`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 8

- **File:** `src/services/auth.service.ts`
- **Line:** 433
- **Code:** `this.log.error('Failed to send password reset email', err)`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 9

- **File:** `src/services/auth.service.ts`
- **Line:** 462
- **Code:** `this.log.info('Password reset attempt');`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 10

- **File:** `src/services/auth.service.ts`
- **Line:** 485
- **Code:** `this.log.info('Password change attempt', { userId });`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 11

- **File:** `src/services/auth-extended.service.ts`
- **Line:** 274
- **Code:** `console.log('All sessions invalidated due to password change for user:', userId);`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

## 🟠 RD2: Schema without .unknown(false) - allows extra fields (mass assignment risk)

**Severity:** HIGH  
**Count:** 2 findings

Review each finding and mark as TRUE ISSUE or FALSE POSITIVE with brief reason.

### Finding 1

- **File:** `src/validators/auth.validators.ts`
- **Line:** 56
- **Code:** `export const setupMFASchema`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 2

- **File:** `src/validators/auth.validators.ts`
- **Line:** 215
- **Code:** `export const emptyBodySchema`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

## 🟡 RD3: String field without maxLength constraint

**Severity:** MEDIUM  
**Count:** 26 findings

Review each finding and mark as TRUE ISSUE or FALSE POSITIVE with brief reason.

### Finding 1

- **File:** `src/validators/auth.validators.ts`
- **Line:** 13
- **Code:** `tenant_id: Joi.string().uuid().required().messages({`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 2

- **File:** `src/validators/auth.validators.ts`
- **Line:** 23
- **Code:** `mfaToken: Joi.string().length(6).optional(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 3

- **File:** `src/validators/auth.validators.ts`
- **Line:** 59
- **Code:** `token: Joi.string().length(6).required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 4

- **File:** `src/validators/auth.validators.ts`
- **Line:** 64
- **Code:** `token: Joi.string().length(6).required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 5

- **File:** `src/validators/auth.validators.ts`
- **Line:** 73
- **Code:** `chain: Joi.string().valid('solana', 'ethereum').required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 6

- **File:** `src/validators/auth.validators.ts`
- **Line:** 80
- **Code:** `chain: Joi.string().valid('solana', 'ethereum').required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 7

- **File:** `src/validators/auth.validators.ts`
- **Line:** 81
- **Code:** `tenant_id: Joi.string().uuid().required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 8

- **File:** `src/validators/auth.validators.ts`
- **Line:** 88
- **Code:** `chain: Joi.string().valid('solana', 'ethereum').required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 9

- **File:** `src/validators/auth.validators.ts`
- **Line:** 95
- **Code:** `chain: Joi.string().valid('solana', 'ethereum').required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 10

- **File:** `src/validators/auth.validators.ts`
- **Line:** 100
- **Code:** `walletType: Joi.string().valid('phantom', 'solflare', 'metamask').required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 11

- **File:** `src/validators/auth.validators.ts`
- **Line:** 110
- **Code:** `biometricType: Joi.string().valid('faceId', 'touchId', 'fingerprint').optional(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 12

- **File:** `src/validators/auth.validators.ts`
- **Line:** 114
- **Code:** `userId: Joi.string().uuid().required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 13

- **File:** `src/validators/auth.validators.ts`
- **Line:** 118
- **Code:** `userId: Joi.string().uuid().required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 14

- **File:** `src/validators/auth.validators.ts`
- **Line:** 119
- **Code:** `credentialId: Joi.string().uuid().required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 15

- **File:** `src/validators/auth.validators.ts`
- **Line:** 132
- **Code:** `tenant_id: Joi.string().uuid().optional(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 16

- **File:** `src/validators/auth.validators.ts`
- **Line:** 163
- **Code:** `userId: Joi.string().uuid().required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 17

- **File:** `src/validators/auth.validators.ts`
- **Line:** 172
- **Code:** `provider: Joi.string()`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 18

- **File:** `src/validators/auth.validators.ts`
- **Line:** 182
- **Code:** `sessionId: Joi.string().uuid().required()`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 19

- **File:** `src/validators/auth.validators.ts`
- **Line:** 186
- **Code:** `venueId: Joi.string().uuid().required()`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 20

- **File:** `src/validators/auth.validators.ts`
- **Line:** 190
- **Code:** `userId: Joi.string().uuid().required()`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 21

- **File:** `src/validators/auth.validators.ts`
- **Line:** 194
- **Code:** `credentialId: Joi.string().uuid().required()`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 22

- **File:** `src/validators/auth.validators.ts`
- **Line:** 198
- **Code:** `venueId: Joi.string().uuid().required(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 23

- **File:** `src/validators/auth.validators.ts`
- **Line:** 199
- **Code:** `userId: Joi.string().uuid().required()`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 24

- **File:** `src/validators/auth.validators.ts`
- **Line:** 203
- **Code:** `publicKey: Joi.string()`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 25

- **File:** `src/validators/auth.validators.ts`
- **Line:** 221
- **Code:** `sortBy: Joi.string().valid('created_at', 'updated_at', 'name').optional(),`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

### Finding 26

- **File:** `src/validators/auth.validators.ts`
- **Line:** 222
- **Code:** `order: Joi.string().valid('asc', 'desc').default('desc')`

**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_

**Reason:** _[Brief explanation]_

---

## Additional Context

### Common False Positives

**Routes without authentication:**
- Public routes like /login, /register, /forgot-password are intentionally unauthenticated
- OAuth callbacks, email verification, token refresh routes need special handling

**Routes without validation:**
- Check if validation exists in preHandler block on subsequent lines
- Validation may be in parent route group

**Queries without tenant_id:**
- System queries (migrations, information_schema) don't need tenant filtering
- Queries on tenants table itself
- Global cleanup/maintenance jobs

**Logs with sensitive keywords:**
- Check if actual sensitive data is logged or just the word "password"/"token"
- Logs like "Password reset request" don't contain actual passwords

### Service Context

**Service:** auth-service
**Type:** Authentication Service
**Public Routes Expected:** Yes (login, register, password reset)

