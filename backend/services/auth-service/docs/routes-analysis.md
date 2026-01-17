# Auth Service Routes Analysis
## Purpose: Integration Testing Documentation
## Generated: January 15, 2026

---

### FILE 1: `auth.routes.ts`

#### PUBLIC ROUTES (No Authentication Required)

| # | HTTP Method + Path | Middleware Chain | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|------------------|-------------------|---------------|---------------|---------------|-------------------|
| 1 | `POST /register` | `registrationRateLimiter` → `validate(registerSchema)` | `AuthController.register` | body | No | Yes (`registrationRateLimiter`) | `registerSchema` |
| 2 | `POST /login` | `rateLimitService('login')` → `loginRateLimiter` → `validate(loginSchema)` | `AuthController.login` | body | No | Yes (dual: service + IP) | `loginSchema` |
| 3 | `POST /forgot-password` | `rateLimitService('forgot-password')` → `validate(forgotPasswordSchema)` | `AuthExtendedController.forgotPassword` | body | No | Yes (`forgot-password`) | `forgotPasswordSchema` |
| 4 | `POST /reset-password` | `rateLimitService('reset-password')` → `validate(resetPasswordSchema)` | `AuthExtendedController.resetPassword` | body | No | Yes (`reset-password`) | `resetPasswordSchema` |
| 5 | `GET /verify-email` | `validate(verifyEmailSchema, 'query')` | `AuthExtendedController.verifyEmail` | query | No | No | `verifyEmailSchema` |
| 6 | `POST /refresh` | `validate(refreshTokenSchema)` | `AuthController.refreshTokens` | body | No | No | `refreshTokenSchema` |

#### OAUTH ROUTES (Public - Special Auth Flow)

| # | HTTP Method + Path | Middleware Chain | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|------------------|-------------------|---------------|---------------|---------------|-------------------|
| 7 | `POST /oauth/:provider/callback` | `validate(providerParamSchema, 'params')` → `rateLimitService('oauth-callback')` → `validate(oauthCallbackSchema)` | Inline (`oauthService.authenticate`) | params, body | No | Yes (`oauth-callback`) | `providerParamSchema`, `oauthCallbackSchema` |
| 8 | `POST /oauth/:provider/login` | `validate(providerParamSchema, 'params')` → `rateLimitService('oauth-login')` → `validate(oauthLoginSchema)` | Inline (`oauthService.authenticate`) | params, body | No | Yes (`oauth-login`) | `providerParamSchema`, `oauthLoginSchema` |

#### WALLET ROUTES (Public - Special Auth Flow)

| # | HTTP Method + Path | Middleware Chain | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|------------------|-------------------|---------------|---------------|---------------|-------------------|
| 9 | `POST /wallet/nonce` | `rateLimitService('wallet-nonce')` → `validate(walletNonceSchema)` | `WalletController.requestNonce` | body | No | Yes (`wallet-nonce`) | `walletNonceSchema` |
| 10 | `POST /wallet/register` | `rateLimitService('wallet-register')` → `validate(walletRegisterSchema)` | `WalletController.register` | body | No | Yes (`wallet-register`) | `walletRegisterSchema` |
| 11 | `POST /wallet/login` | `rateLimitService('wallet-login')` → `validate(walletLoginSchema)` | `WalletController.login` | body | No | Yes (`wallet-login`) | `walletLoginSchema` |

#### PUBLIC BIOMETRIC ROUTES (Passwordless Login)

| # | HTTP Method + Path | Middleware Chain | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|------------------|-------------------|---------------|---------------|---------------|-------------------|
| 12 | `POST /biometric/challenge` | `validate(biometricChallengeSchema)` | Inline (`biometricService.generateChallenge`) | body | No | No | `biometricChallengeSchema` |
| 13 | `POST /biometric/authenticate` | `validate(biometricAuthenticateSchema)` | Inline (`biometricService.verifyBiometric`) | body | No | No | `biometricAuthenticateSchema` |

---

#### AUTHENTICATED ROUTES (Require Valid JWT)

**Base Middleware Applied to All:** `authMiddleware.authenticate` → `validateTenant`

| # | HTTP Method + Path | Additional Middleware | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|----------------------|-------------------|---------------|---------------|---------------|-------------------|
| 14 | `GET /verify` | `validate(emptyBodySchema)` | `AuthController.verifyToken` | headers (JWT) | Yes | No | `emptyBodySchema` |
| 15 | `GET /me` | `validate(emptyBodySchema)` | `AuthController.getCurrentUser` | headers (JWT) | Yes | No | `emptyBodySchema` |
| 16 | `POST /logout` | `validate(logoutSchema)` | `AuthController.logout` | body | Yes | No | `logoutSchema` |
| 17 | `POST /resend-verification` | `validate(emptyBodySchema)` | `AuthExtendedController.resendVerification` | headers (JWT) | Yes | No | `emptyBodySchema` |
| 18 | `PUT /change-password` | `validate(changePasswordSchema)` | `AuthExtendedController.changePassword` | body | Yes | No | `changePasswordSchema` |

#### MFA ROUTES (Authenticated)

| # | HTTP Method + Path | Additional Middleware | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|----------------------|-------------------|---------------|---------------|---------------|-------------------|
| 19 | `POST /mfa/setup` | `validate(setupMFASchema)` | `AuthController.setupMFA` | body | Yes | No | `setupMFASchema` |
| 20 | `POST /mfa/verify-setup` | `validate(verifyMFASchema)` | `AuthController.verifyMFASetup` | body | Yes | No | `verifyMFASchema` |
| 21 | `POST /mfa/verify` | `validate(verifyMFASchema)` | `AuthController.verifyMFA` | body | Yes | No | `verifyMFASchema` |
| 22 | `POST /mfa/regenerate-backup-codes` | `validate(emptyBodySchema)` | `AuthController.regenerateBackupCodes` | headers (JWT) | Yes | No | `emptyBodySchema` |
| 23 | `DELETE /mfa/disable` | `validate(disableMFASchema)` | `AuthController.disableMFA` | body | Yes | No | `disableMFASchema` |

#### WALLET MANAGEMENT (Authenticated)

| # | HTTP Method + Path | Additional Middleware | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|----------------------|-------------------|---------------|---------------|---------------|-------------------|
| 24 | `POST /wallet/link` | `rateLimitService('wallet-link')` → `validate(walletLinkSchema)` | `WalletController.linkWallet` | body | Yes | Yes (`wallet-link`) | `walletLinkSchema` |
| 25 | `DELETE /wallet/unlink/:publicKey` | `validate(publicKeyParamSchema, 'params')` → `rateLimitService('wallet-unlink')` → `validate(emptyBodySchema)` | `WalletController.unlinkWallet` | params | Yes | Yes (`wallet-unlink`) | `publicKeyParamSchema`, `emptyBodySchema` |

#### BIOMETRIC ROUTES (Authenticated)

| # | HTTP Method + Path | Additional Middleware | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|----------------------|-------------------|---------------|---------------|---------------|-------------------|
| 26 | `POST /biometric/register` | `validate(biometricRegisterSchema)` | Inline (`biometricService.registerBiometric`) | body | Yes | No | `biometricRegisterSchema` |
| 27 | `GET /biometric/challenge` | None | Inline (`biometricService.generateChallenge`) | headers (JWT) | Yes | No | None |
| 28 | `GET /biometric/devices` | None | Inline (`biometricService.listBiometricDevices`) | headers (JWT) | Yes | No | None |
| 29 | `DELETE /biometric/devices/:credentialId` | `validate(credentialIdParamSchema, 'params')` → `validate(emptyBodySchema)` | Inline (`biometricService.removeBiometricDevice`) | params | Yes | No | `credentialIdParamSchema`, `emptyBodySchema` |

#### OAUTH LINKING (Authenticated)

| # | HTTP Method + Path | Additional Middleware | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|----------------------|-------------------|---------------|---------------|---------------|-------------------|
| 30 | `POST /oauth/:provider/link` | `validate(providerParamSchema, 'params')` → `validate(oauthLinkSchema)` | Inline (`oauthService.linkProvider`) | params, body | Yes | No | `providerParamSchema`, `oauthLinkSchema` |
| 31 | `DELETE /oauth/:provider/unlink` | `validate(providerParamSchema, 'params')` → `validate(emptyBodySchema)` | Inline (`oauthService.unlinkProvider`) | params | Yes | No | `providerParamSchema`, `emptyBodySchema` |

#### SESSION MANAGEMENT (Authenticated)

| # | HTTP Method + Path | Additional Middleware | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|----------------------|-------------------|---------------|---------------|---------------|-------------------|
| 32 | `GET /sessions` | `validate(paginationQuerySchema, 'query')` | `SessionController.listSessions` | query | Yes | No | `paginationQuerySchema` |
| 33 | `DELETE /sessions/all` | `validate(emptyBodySchema)` | `SessionController.invalidateAllSessions` | headers (JWT) | Yes | No | `emptyBodySchema` |
| 34 | `DELETE /sessions/:sessionId` | `validate(sessionIdParamSchema, 'params')` → `validate(emptyBodySchema)` | `SessionController.revokeSession` | params | Yes | No | `sessionIdParamSchema`, `emptyBodySchema` |

#### PROFILE MANAGEMENT (Authenticated)

| # | HTTP Method + Path | Additional Middleware | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|----------------------|-------------------|---------------|---------------|---------------|-------------------|
| 35 | `GET /profile` | `validate(emptyBodySchema)` | `ProfileController.getProfile` | headers (JWT) | Yes | No | `emptyBodySchema` |
| 36 | `PUT /profile` | `validate(updateProfileSchema)` | `ProfileController.updateProfile` | body | Yes | No | `updateProfileSchema` |

#### GDPR / DATA RIGHTS (Authenticated)

| # | HTTP Method + Path | Additional Middleware | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|----------------------|-------------------|---------------|---------------|---------------|-------------------|
| 37 | `GET /gdpr/export` | `validate(emptyBodySchema)` | `ProfileController.exportData` | headers (JWT) | Yes | No | `emptyBodySchema` |
| 38 | `GET /consent` | `validate(emptyBodySchema)` | `ProfileController.getConsent` | headers (JWT) | Yes | No | `emptyBodySchema` |
| 39 | `PUT /consent` | None | `ProfileController.updateConsent` | body | Yes | No | None |
| 40 | `POST /gdpr/delete` | None | `ProfileController.requestDeletion` | headers (JWT) | Yes | No | None |

#### VENUE ROLE MANAGEMENT (Authenticated + Permissions)

| # | HTTP Method + Path | Additional Middleware | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|----------------------|-------------------|---------------|---------------|---------------|-------------------|
| 41 | `POST /venues/:venueId/roles` | `validate(venueIdParamSchema, 'params')` → `authMiddleware.requirePermission('roles:manage')` → `validate(grantRoleSchema)` | Inline (`rbacService.grantVenueRole`) | params, body | Yes + Permission | No | `venueIdParamSchema`, `grantRoleSchema` |
| 42 | `DELETE /venues/:venueId/roles/:userId` | `validate(venueIdAndUserIdParamSchema, 'params')` → `authMiddleware.requirePermission('roles:manage')` → `validate(emptyBodySchema)` | Inline (`rbacService.revokeVenueRoles`) | params | Yes + Permission | No | `venueIdAndUserIdParamSchema`, `emptyBodySchema` |
| 43 | `GET /venues/:venueId/roles` | `validate(venueIdParamSchema, 'params')` → `authMiddleware.requireVenueAccess` | Inline (`rbacService.getVenueRoles`) | params | Yes + VenueAccess | No | `venueIdParamSchema` |

---

### FILE 2: `internal.routes.ts`

**Base Middleware Applied to All Routes:** `verifyServiceToken` (S2S authentication)

| # | HTTP Method + Path | Middleware Chain | Controller/Handler | Input Sources | Auth Required | Rate Limiting | Validation Schema |
|---|-------------------|------------------|-------------------|---------------|---------------|---------------|-------------------|
| 1 | `POST /validate-permissions` | `verifyServiceToken` | Inline (direct DB query) | body (`userId`, `permissions`, `venueId?`) | S2S Only | No | None (inline validation) |
| 2 | `POST /validate-users` | `verifyServiceToken` | Inline (direct DB query) | body (`userIds[]`) | S2S Only | No | None (inline - max 100 limit) |
| 3 | `GET /user-tenant/:userId` | `verifyServiceToken` | Inline (direct DB query) | params (`userId`) | S2S Only | No | None |
| 4 | `GET /health` | `verifyServiceToken` | Inline (returns status) | None | S2S Only | No | None |
| 5 | `GET /users/:userId` | `verifyServiceToken` | Inline (direct DB query) | params (`userId`), headers (`x-tenant-id?`) | S2S Only | No | None |
| 6 | `GET /users/by-email/:email` | `verifyServiceToken` | Inline (direct DB query) | params (`email` URL-encoded), headers (`x-tenant-id?`) | S2S Only | No | None (inline email validation) |
| 7 | `GET /users/admins` | `verifyServiceToken` | Inline (direct DB query) | query (`tenantId?`, `roles?`), headers (`x-tenant-id?`) | S2S Only | No | None (inline role validation) |
| 8 | `GET /users/:userId/tax-info` | `verifyServiceToken` | Inline (direct DB query) | params (`userId`), headers (`x-tenant-id?`, `x-trace-id?`) | S2S Only | No | None |
| 9 | `GET /users/:userId/chargeback-count` | `verifyServiceToken` | Inline (direct DB query) | params (`userId`), query (`monthsBack?`), headers (`x-tenant-id?`, `x-trace-id?`) | S2S Only | No | None |
| 10 | `POST /users/batch-verification-check` | `verifyServiceToken` | Inline (direct DB query) | body (`userIds[]`), headers (`x-tenant-id?`, `x-trace-id?`) | S2S Only | No | None (inline - max 100 limit) |

---

### Summary Statistics

| File | Total Endpoints | Public | Authenticated | S2S Internal | Rate Limited |
|------|----------------|--------|---------------|--------------|--------------|
| `auth.routes.ts` | 43 | 13 | 30 | 0 | 14 |
| `internal.routes.ts` | 10 | 0 | 0 | 10 | 0 |

---

### Key Observations

1. **auth.routes.ts**:
   - Uses Fastify's `preHandler` hooks for middleware chaining
   - All authenticated routes have `authMiddleware.authenticate` + `validateTenant` applied via a registered plugin
   - Rate limiting is applied to sensitive public endpoints (login, register, password reset, OAuth, wallet)
   - Some endpoints require additional permission checks (`requirePermission`, `requireVenueAccess`)

2. **internal.routes.ts**:
   - All routes protected by `verifyServiceToken` (S2S middleware) at group level
   - No validation schemas - validation is done inline
   - Uses `x-tenant-id` and `x-trace-id` headers for tenant isolation and tracing
   - Comments indicate which services consume each endpoint
