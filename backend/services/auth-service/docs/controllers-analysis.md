# Auth Service Controllers Analysis
## Purpose: Integration Testing Documentation
## Source: src/controllers/*.ts
## Generated: 2026-01-15

---

## 1. auth.controller.ts (AuthController)

### 1.1 `register`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/register |
| **Input Extraction** | `request.body` (full body passed to service) |
| **Services Called** | 1. `authService.register(request.body)` |
| **Response Shape** | `{ user: {...}, tokens: {...} }` |
| **HTTP Status** | 201 (success), 409 (duplicate), 500 (error) |
| **Error Handling** | Catches duplicate errors (code 23505, DUPLICATE_EMAIL, 409 status), returns 409; other errors return 500 |
| **Side Effects** | `userCache.setUser()` - caches user after registration |
| **Data Transformations** | None - body passed directly |

### 1.2 `login`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/login |
| **Input Extraction** | `request.body.email`, `request.body.password`, `request.body.captchaToken`, `request.body.mfaToken`, `request.ip`, `request.headers['user-agent']` |
| **Services Called** | 1. `captchaService.isCaptchaRequired(identifier)` 2. `captchaService.verify()` (if needed) 3. `authService.login({email, password, ipAddress, userAgent})` 4. `captchaService.clearFailures()` 5. `mfaService.verifyTOTP()` / `mfaService.verifyBackupCode()` (if MFA) 6. `authService.regenerateTokensAfterMFA()` (if MFA verified) |
| **Response Shape** | Success: `{ user: {...}, tokens: {...} }`, MFA required: `{ requiresMFA: true, userId: string }` |
| **HTTP Status** | 200 (success), 428 (captcha required), 400 (captcha failed), 401 (invalid credentials/MFA), 500 (error) |
| **Error Handling** | Records failure with `captchaService.recordFailure()`, returns `requiresCaptcha` flag on 401 |
| **Side Effects** | `userCache.setUser()`, `sessionCache.setSession()` on success; console.log for debugging |
| **Data Transformations** | Lowercases email for identifier |

### 1.3 `refreshTokens`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/refresh |
| **Input Extraction** | `request.body.refreshToken`, `request.ip`, `request.headers['user-agent']` |
| **Services Called** | `authService.refreshTokens(refreshToken, ipAddress, userAgent)` |
| **Response Shape** | Service result (tokens) |
| **HTTP Status** | 200 (success), 401 (error) |
| **Error Handling** | All errors return 401 Unauthorized |
| **Side Effects** | None |
| **Data Transformations** | None |

### 1.4 `logout`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/logout |
| **Input Extraction** | `request.user.id` |
| **Services Called** | `authService.logout(userId)` |
| **Response Shape** | None (204 No Content) |
| **HTTP Status** | 204 |
| **Error Handling** | None explicit |
| **Side Effects** | `userCache.deleteUser()`, `sessionCache.deleteUserSessions()` |
| **Data Transformations** | None |

### 1.5 `getMe`
| Aspect | Details |
|--------|---------|
| **Route** | GET /auth/me |
| **Input Extraction** | `request.user.id` |
| **Services Called** | Direct DB query: `db('users').where('id', userId)...` |
| **Response Shape** | `{ user: {...} }` |
| **HTTP Status** | 200 (success), 404 (not found) |
| **Error Handling** | Returns 404 if user not found |
| **Side Effects** | Cache read/write: `userCache.getUser()`, `userCache.setUser()` |
| **Data Transformations** | None |

### 1.6 `getCacheStats`
| Aspect | Details |
|--------|---------|
| **Route** | GET /auth/cache-stats |
| **Input Extraction** | None |
| **Services Called** | `getCacheStats()` |
| **Response Shape** | Stats object |
| **HTTP Status** | 200 |
| **Error Handling** | None |
| **Side Effects** | None |
| **Data Transformations** | None |

### 1.7 `verifyToken`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/verify |
| **Input Extraction** | `request.user` (from auth middleware) |
| **Services Called** | None |
| **Response Shape** | `{ valid: true, user: {...} }` |
| **HTTP Status** | 200 |
| **Error Handling** | None (relies on auth middleware) |
| **Side Effects** | None |
| **Data Transformations** | None |

### 1.8 `getCurrentUser`
| Aspect | Details |
|--------|---------|
| **Route** | GET /auth/current-user |
| **Input Extraction** | `request.user` |
| **Services Called** | None |
| **Response Shape** | `{ user: {...} }` |
| **HTTP Status** | 200 |
| **Error Handling** | None |
| **Side Effects** | None |
| **Data Transformations** | None |

### 1.9 `setupMFA`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/mfa/setup |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id` |
| **Services Called** | `mfaService.setupTOTP(userId, tenantId)` |
| **Response Shape** | Service result (QR code, secret) |
| **HTTP Status** | 200 (success), 400 (already enabled), 500 (error) |
| **Error Handling** | Checks for "already enabled" message → 400 |
| **Side Effects** | None |
| **Data Transformations** | None |

### 1.10 `verifyMFASetup`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/mfa/verify-setup |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id`, `request.body.token` |
| **Services Called** | `mfaService.verifyAndEnableTOTP(userId, token, tenantId)` |
| **Response Shape** | Service result (backup codes) |
| **HTTP Status** | 200 (success), 400 (invalid/expired), 500 (error) |
| **Error Handling** | Checks for "Invalid" or "expired" → 400 |
| **Side Effects** | None |
| **Data Transformations** | None |

### 1.11 `verifyMFA`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/mfa/verify |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id`, `request.body.token` |
| **Services Called** | `mfaService.verifyTOTP(userId, token, tenantId)` |
| **Response Shape** | `{ valid: boolean }` |
| **HTTP Status** | 200 (success), 500 (error) |
| **Error Handling** | All errors → 500 |
| **Side Effects** | None |
| **Data Transformations** | None |

### 1.12 `regenerateBackupCodes`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/mfa/backup-codes |
| **Input Extraction** | `request.user.id` |
| **Services Called** | `mfaService.regenerateBackupCodes(userId)` |
| **Response Shape** | Service result (codes array) |
| **HTTP Status** | 200 (success), 400 (MFA not enabled), 500 (error) |
| **Error Handling** | Checks for "not enabled" → 400 |
| **Side Effects** | None |
| **Data Transformations** | None |

### 1.13 `disableMFA`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/mfa/disable |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id`, `request.body.password`, `request.body.token` |
| **Services Called** | `mfaService.disableTOTP(userId, password, token, tenantId)` |
| **Response Shape** | `{ success: true }` |
| **HTTP Status** | 200 (success), 400 (invalid password/token), 500 (error) |
| **Error Handling** | Checks for "Invalid" → 400 |
| **Side Effects** | None |
| **Data Transformations** | None |

---

## 2. auth-extended.controller.ts (AuthExtendedController)

### 2.1 `forgotPassword`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/forgot-password |
| **Input Extraction** | `request.body.email`, `request.ip` |
| **Services Called** | `authExtendedService.requestPasswordReset(email, ipAddress)` |
| **Response Shape** | `{ message: 'If an account exists...' }` (always same) |
| **HTTP Status** | 200 (always, for enumeration protection), 429 (rate limit) |
| **Error Handling** | Rate limit → 429; all others → 200 (enumeration protection) |
| **Side Effects** | None |
| **Data Transformations** | None |

### 2.2 `resetPassword`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/reset-password |
| **Input Extraction** | `request.body.token`, `request.body.newPassword`, `request.ip` |
| **Services Called** | `authExtendedService.resetPassword(token, newPassword, ipAddress)` |
| **Response Shape** | `{ message: 'Password has been reset successfully' }` |
| **HTTP Status** | 200 (success), 400 (validation/expired/invalid), 500 (error) |
| **Error Handling** | ValidationError or expired/invalid → 400; logs raw error with stack trace |
| **Side Effects** | console.error with detailed error info |
| **Data Transformations** | Extracts first error from `error.errors` array |

### 2.3 `verifyEmail`
| Aspect | Details |
|--------|---------|
| **Route** | GET /auth/verify-email |
| **Input Extraction** | `request.query.token` |
| **Services Called** | `authExtendedService.verifyEmail(token)` |
| **Response Shape** | `{ message: 'Email verified successfully' }` |
| **HTTP Status** | 200 (success), 400 (missing/invalid/expired token), 500 (error) |
| **Error Handling** | Missing token → 400; ValidationError/invalid/expired → 400 |
| **Side Effects** | console.error on error |
| **Data Transformations** | Casts token to string |

### 2.4 `resendVerification`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/resend-verification |
| **Input Extraction** | `request.user.id` |
| **Services Called** | `authExtendedService.resendVerificationEmail(userId)` |
| **Response Shape** | `{ message: 'Verification email sent' }` |
| **HTTP Status** | 200 (success), 401 (no user), 400 (already verified/rate limit), 500 (error) |
| **Error Handling** | Checks `request.user` → 401 if missing; ValidationError/already verified/too many → 400 |
| **Side Effects** | console.error on error |
| **Data Transformations** | None |

### 2.5 `changePassword`
| Aspect | Details |
|--------|---------|
| **Route** | POST /auth/change-password |
| **Input Extraction** | `request.user.id`, `request.body.currentPassword`, `request.body.newPassword` |
| **Services Called** | `authExtendedService.changePassword(userId, currentPassword, newPassword)` |
| **Response Shape** | `{ message: 'Password changed successfully' }` |
| **HTTP Status** | 200 (success), 401 (wrong current password), 400 (validation), 500 (error) |
| **Error Handling** | AuthenticationError/incorrect/current password → 401; ValidationError/must/different → 400 |
| **Side Effects** | console.error on error |
| **Data Transformations** | None |

---

## 3. profile.controller.ts (ProfileController)

### 3.1 `getProfile`
| Aspect | Details |
|--------|---------|
| **Route** | GET /profile |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id` |
| **Services Called** | `cacheFallbackService.withFallback()` with direct `pool.query()` or cached fallback |
| **Response Shape** | `{ success: true, user: {...} }` |
| **HTTP Status** | 200 (success), 404 (not found), 500 (error) |
| **Error Handling** | User not found → 404; general errors → 500 |
| **Side Effects** | `cacheFallbackService.cacheUserProfile()` after DB fetch |
| **Headers Set** | `X-Cache: fallback`, `X-Cache-Age: {age}` if from cache |
| **Data Transformations** | None |

### 3.2 `updateProfile`
| Aspect | Details |
|--------|---------|
| **Route** | PUT /profile |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id`, `request.body` (firstName, lastName, phone, email), `request.ip`, `request.headers['user-agent']` |
| **Services Called** | Direct `pool.query()` for UPDATE |
| **Response Shape** | Returns `getProfile()` result |
| **HTTP Status** | 200 (success), 422 (validation), 500 (error) |
| **Error Handling** | ValidationError → 422 |
| **Side Effects** | `cacheFallbackService.invalidateUserCache()`, `auditService.log()` with action 'profile.updated' |
| **Data Transformations** | `stripHtml()` on firstName/lastName; lowercase email; sets `email_verified = false` on email change |

### 3.3 `exportData` (GDPR Article 15 & 20)
| Aspect | Details |
|--------|---------|
| **Route** | GET /profile/export |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id`, `request.ip` |
| **Services Called** | Multiple direct `pool.query()` calls (users, user_sessions, wallet_connections, oauth_connections, user_venue_roles, user_addresses, audit_logs), `auditService.logDataExport()` |
| **Response Shape** | `{ exportedAt, exportFormat, user, sessions, walletConnections, oauthConnections, venueRoles, addresses, activityLog }` |
| **HTTP Status** | 200 (success), 404 (not found), 500 (error) |
| **Error Handling** | User not found → 404 |
| **Side Effects** | `auditService.logDataExport()` |
| **Headers Set** | `Content-Type: application/json`, `Content-Disposition: attachment; filename="user-data-export-{userId}.json"` |
| **Data Transformations** | None |

### 3.4 `updateConsent`
| Aspect | Details |
|--------|---------|
| **Route** | PUT /profile/consent |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id`, `request.body.marketingConsent`, `request.ip`, `request.headers['user-agent']` |
| **Services Called** | Direct `pool.query()` for UPDATE |
| **Response Shape** | `{ success: true, message: 'Consent preferences updated', consent: { marketingConsent, updatedAt } }` |
| **HTTP Status** | 200 (success), 400 (missing data), 500 (error) |
| **Error Handling** | Missing consent data → 400 |
| **Side Effects** | `cacheFallbackService.invalidateUserCache()`, `auditService.log()` with action 'consent.granted' or 'consent.withdrawn' |
| **Data Transformations** | None |

### 3.5 `requestDeletion` (GDPR Article 17)
| Aspect | Details |
|--------|---------|
| **Route** | POST /profile/delete |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id`, `request.body.confirmEmail`, `request.body.reason`, `request.ip`, `request.headers['user-agent']` |
| **Services Called** | Multiple direct `pool.query()` calls (verify user, soft delete, revoke sessions) |
| **Response Shape** | `{ success: true, message: 'Account deletion initiated', details: { deletedAt, anonymizationScheduled, note } }` |
| **HTTP Status** | 200 (success), 404 (not found), 400 (email mismatch), 500 (error) |
| **Error Handling** | User not found → 404; Email mismatch → 400 |
| **Side Effects** | `cacheFallbackService.invalidateUserCache()`, `auditService.log()` with action 'account.deletion_requested' |
| **Data Transformations** | Lowercases both emails for comparison |

### 3.6 `getConsent`
| Aspect | Details |
|--------|---------|
| **Route** | GET /profile/consent |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id` |
| **Services Called** | Direct `pool.query()` |
| **Response Shape** | `{ success: true, consent: { marketing: { granted, date }, terms: { acceptedAt, version }, privacy: { acceptedAt, version } } }` |
| **HTTP Status** | 200 (success), 404 (not found), 500 (error) |
| **Error Handling** | User not found → 404 |
| **Side Effects** | None |
| **Data Transformations** | Transforms DB row to structured consent object |

---

## 4. session.controller.ts (SessionController)

### 4.1 `listSessions`
| Aspect | Details |
|--------|---------|
| **Route** | GET /sessions |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id` |
| **Services Called** | Direct `pool.query()` JOIN users and user_sessions |
| **Response Shape** | `{ success: true, sessions: [{id, ip_address, user_agent, started_at, ended_at, revoked_at, metadata, user_id}] }` |
| **HTTP Status** | 200 (success), 500 (error) |
| **Error Handling** | General errors → 500 |
| **Side Effects** | console.error on error |
| **Data Transformations** | None |

### 4.2 `revokeSession`
| Aspect | Details |
|--------|---------|
| **Route** | DELETE /sessions/:sessionId |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id`, `request.params.sessionId`, `request.ip`, `request.headers['user-agent']` |
| **Services Called** | Direct `pool.query()` for SELECT + UPDATE |
| **Response Shape** | `{ success: true, message: 'Session revoked successfully' }` |
| **HTTP Status** | 200 (success), 404 (not found), 500 (error) |
| **Error Handling** | Session not found or doesn't belong to user → 404 |
| **Side Effects** | Direct INSERT to audit_logs table (action: 'session_revoked', service: 'auth-service') |
| **Data Transformations** | None |

### 4.3 `invalidateAllSessions`
| Aspect | Details |
|--------|---------|
| **Route** | POST /sessions/invalidate-all |
| **Input Extraction** | `request.user.id`, `request.user.tenant_id`, `request.ip`, `request.headers['user-agent']` |
| **Services Called** | Direct `pool.query()` for user verification + UPDATE |
| **Response Shape** | `{ success: true, message: '{count} sessions invalidated', sessions_revoked: number }` |
| **HTTP Status** | 200 (success), 403 (forbidden), 500 (error) |
| **Error Handling** | User not in tenant → 403 |
| **Side Effects** | Direct INSERT to audit_logs table (action: 'all_sessions_invalidated', service: 'auth-service') |
| **Data Transformations** | None |

---

## 5. wallet.controller.ts (WalletController)

### 5.1 `requestNonce`
| Aspect | Details |
|--------|---------|
| **Route** | POST /wallet/nonce |
| **Input Extraction** | `request.body.publicKey`, `request.body.chain` |
| **Services Called** | `walletService.generateNonce(publicKey, chain)` |
| **Response Shape** | Service result (nonce) |
| **HTTP Status** | 200 (success), 500 (error) |
| **Error Handling** | All errors → 500 |
| **Side Effects** | console.error on error |
| **Data Transformations** | None |

### 5.2 `register`
| Aspect | Details |
|--------|---------|
| **Route** | POST /wallet/register |
| **Input Extraction** | `request.body.publicKey`, `request.body.signature`, `request.body.nonce`, `request.body.chain`, `request.body.tenant_id` |
| **Services Called** | `walletService.registerWithWallet(publicKey, signature, nonce, chain, tenant_id)` |
| **Response Shape** | `{ success: false, error: string }` on error; service result on success |
| **HTTP Status** | 201 (success), 409 (duplicate wallet), [AuthenticationError.statusCode] (auth errors), 500 (error) |
| **Error Handling** | AuthenticationError → uses error.statusCode; duplicate (23505 code or message) → 409 |
| **Side Effects** | console.error on error |
| **Data Transformations** | None |

### 5.3 `login`
| Aspect | Details |
|--------|---------|
| **Route** | POST /wallet/login |
| **Input Extraction** | `request.body.publicKey`, `request.body.signature`, `request.body.nonce`, `request.body.chain` |
| **Services Called** | `walletService.loginWithWallet(publicKey, signature, nonce, chain)` |
| **Response Shape** | Service result (user + tokens) |
| **HTTP Status** | 200 (success), [AuthenticationError.statusCode] (auth errors), 500 (error) |
| **Error Handling** | AuthenticationError → uses error.statusCode |
| **Side Effects** | console.error on error |
| **Data Transformations** | None |

### 5.4 `linkWallet`
| Aspect | Details |
|--------|---------|
| **Route** | POST /wallet/link |
| **Input Extraction** | `request.user.id`, `request.body.publicKey`, `request.body.signature`, `request.body.nonce`, `request.body.chain` |
| **Services Called** | `walletService.linkWallet(userId, publicKey, signature, nonce, chain)` |
| **Response Shape** | Service result |
| **HTTP Status** | 200 (success), [AuthenticationError.statusCode] (auth errors), 500 (error) |
| **Error Handling** | AuthenticationError → uses error.statusCode |
| **Side Effects** | console.error on error |
| **Data Transformations** | None |

### 5.5 `unlinkWallet`
| Aspect | Details |
|--------|---------|
| **Route** | DELETE /wallet/:publicKey |
| **Input Extraction** | `request.user.id`, `request.params.publicKey` |
| **Services Called** | `walletService.unlinkWallet(userId, publicKey)` |
| **Response Shape** | Service result |
| **HTTP Status** | 200 (success), [AuthenticationError.statusCode] (auth errors), 500 (error) |
| **Error Handling** | AuthenticationError → uses error.statusCode |
| **Side Effects** | console.error on error |
| **Data Transformations** | None |

---

## Summary Statistics

| Controller | Methods | Services Used | Direct DB Queries | Audit Logging |
|------------|---------|---------------|-------------------|---------------|
| AuthController | 13 | AuthService, MFAService, CaptchaService, CacheServices | 1 (getMe) | None (via services) |
| AuthExtendedController | 5 | AuthExtendedService | 0 | None (via service) |
| ProfileController | 6 | CacheFallbackService, AuditService | 6 methods all use pool.query() | 4 methods |
| SessionController | 3 | None | 3 (all direct) | 2 methods (direct INSERT) |
| WalletController | 5 | WalletService | 0 | None (via service) |

---

## Integration Testing Considerations

### Authentication Requirements by Endpoint
| Endpoint Group | Auth Required | Notes |
|----------------|---------------|-------|
| POST /auth/register | No | Public |
| POST /auth/login | No | Public |
| POST /auth/refresh | No | Uses refreshToken |
| POST /auth/forgot-password | No | Public |
| POST /auth/reset-password | No | Uses reset token |
| GET /auth/verify-email | No | Uses verification token |
| POST /wallet/nonce | No | Public |
| POST /wallet/register | No | Public |
| POST /wallet/login | No | Public |
| All other endpoints | Yes | Requires valid JWT |

### Multi-Tenant Considerations
- ProfileController, SessionController verify `tenant_id` on all operations
- WalletController accepts `tenant_id` in registration request body
- AuthController passes tenant context through services

### Cache Dependencies
- UserCache: register, login, logout, getMe
- SessionCache: login, logout
- CacheFallbackService: getProfile, updateProfile, updateConsent, requestDeletion

### Audit Trail Requirements
- ProfileController: 4 methods with explicit audit logging
- SessionController: 2 methods with direct audit_logs INSERT
- Other controllers: Audit via service layer
