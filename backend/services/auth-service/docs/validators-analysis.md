# Auth Service Validators Analysis
## Purpose: Integration Testing Documentation
## Source: src/validators/auth.validators.ts, src/validators/response.schemas.ts
## Generated: January 15, 2026

---

# PART 1: INPUT VALIDATION SCHEMAS (`auth.validators.ts`)

**Validation Library:** Joi
**Strict Mode:** All schemas use `.unknown(false)` to reject extra fields

---

## CUSTOM VALIDATORS

| Validator Name | Type | Pattern/Rule | Max Length | Custom Message |
|----------------|------|--------------|------------|----------------|
| `e164Phone` | string | `/^\+?[1-9]\d{7,14}$/` | 20 | "Phone must be in E.164 format (e.g., +14155551234)" |

---

## AUTHENTICATION SCHEMAS

### 1. `registerSchema`
**Used by:** `POST /register`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `email` | string | ✅ Required | email format, max 255 | - |
| `password` | string | ✅ Required | min 8, max 128 | - |
| `firstName` | string | ✅ Required | max 50 | - |
| `lastName` | string | ✅ Required | max 50 | - |
| `phone` | string | Optional | E.164 pattern, max 20 | - |
| `tenant_id` | string | ✅ Required | UUID format | - |

---

### 2. `loginSchema`
**Used by:** `POST /login`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `email` | string | ✅ Required | email format, max 255 | - |
| `password` | string | ✅ Required | max 128 | - |
| `mfaToken` | string | Optional | exactly 6 chars | - |

---

### 3. `refreshTokenSchema`
**Used by:** `POST /refresh`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `refreshToken` | string | ✅ Required | max 512 | - |

---

### 4. `verifyEmailSchema`
**Used by:** `GET /verify-email` (query params)

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `token` | string | ✅ Required | max 256 | - |

---

### 5. `forgotPasswordSchema`
**Used by:** `POST /forgot-password`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `email` | string | ✅ Required | email format, max 255 | - |

---

### 6. `resetPasswordSchema`
**Used by:** `POST /reset-password`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `token` | string | ✅ Required | max 256 | - |
| `newPassword` | string | ✅ Required | min 8, max 128 | - |

---

### 7. `changePasswordSchema`
**Used by:** `PUT /change-password`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `currentPassword` | string | ✅ Required | max 128 | - |
| `newPassword` | string | ✅ Required | min 8, max 128 | - |

---

### 8. `logoutSchema`
**Used by:** `POST /logout`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `refreshToken` | string | Optional | max 512 | - |

---

## MFA SCHEMAS

### 9. `setupMFASchema`
**Used by:** `POST /mfa/setup`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| *(empty object)* | - | - | No fields | - |

---

### 10. `verifyMFASchema`
**Used by:** `POST /mfa/verify-setup`, `POST /mfa/verify`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `token` | string | ✅ Required | exactly 6 chars | - |

---

### 11. `disableMFASchema`
**Used by:** `DELETE /mfa/disable`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `password` | string | ✅ Required | max 128 | - |
| `token` | string | ✅ Required | exactly 6 chars | - |

---

## WALLET SCHEMAS

### 12. `walletNonceSchema`
**Used by:** `POST /wallet/nonce`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `publicKey` | string | ✅ Required | min 32, max 128 | - |
| `chain` | string | ✅ Required | enum: `solana`, `ethereum` | - |

---

### 13. `walletRegisterSchema`
**Used by:** `POST /wallet/register`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `publicKey` | string | ✅ Required | min 32, max 128 | - |
| `signature` | string | ✅ Required | min 64, max 256 | - |
| `nonce` | string | ✅ Required | min 32, max 128 | - |
| `chain` | string | ✅ Required | enum: `solana`, `ethereum` | - |
| `tenant_id` | string | ✅ Required | UUID format | - |

---

### 14. `walletLoginSchema`
**Used by:** `POST /wallet/login`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `publicKey` | string | ✅ Required | min 32, max 128 | - |
| `signature` | string | ✅ Required | min 64, max 256 | - |
| `nonce` | string | ✅ Required | min 32, max 128 | - |
| `chain` | string | ✅ Required | enum: `solana`, `ethereum` | - |

---

### 15. `walletLinkSchema`
**Used by:** `POST /wallet/link`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `publicKey` | string | ✅ Required | min 32, max 128 | - |
| `signature` | string | ✅ Required | min 64, max 256 | - |
| `nonce` | string | ✅ Required | min 32, max 128 | - |
| `chain` | string | ✅ Required | enum: `solana`, `ethereum` | - |

---

### 16. `connectWalletSchema`
**Note:** Not used in current routes (may be legacy)

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `walletAddress` | string | ✅ Required | max 128 | - |
| `walletType` | string | ✅ Required | enum: `phantom`, `solflare`, `metamask` | - |

---

## BIOMETRIC SCHEMAS

### 17. `biometricRegisterSchema`
**Used by:** `POST /biometric/register`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `publicKey` | string | ✅ Required | max 2048 | - |
| `deviceId` | string | ✅ Required | max 255 | - |
| `biometricType` | string | Optional | enum: `faceId`, `touchId`, `fingerprint` | - |

---

### 18. `biometricChallengeSchema`
**Used by:** `POST /biometric/challenge` (public)

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `userId` | string | ✅ Required | UUID format | - |

---

### 19. `biometricAuthenticateSchema`
**Used by:** `POST /biometric/authenticate`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `userId` | string | ✅ Required | UUID format | - |
| `credentialId` | string | ✅ Required | UUID format | - |
| `signature` | string | ✅ Required | max 2048 | - |
| `challenge` | string | ✅ Required | max 256 | - |

---

## OAUTH SCHEMAS

### 20. `oauthCallbackSchema`
**Used by:** `POST /oauth/:provider/callback`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `code` | string | ✅ Required | max 2048 | - |
| `state` | string | Optional | max 256 | - |
| `tenant_id` | string | Optional | UUID format | - |

---

### 21. `oauthLinkSchema`
**Used by:** `POST /oauth/:provider/link`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `code` | string | ✅ Required | max 2048 | - |
| `state` | string | Optional | max 256 | - |

---

### 22. `oauthLoginSchema`
**Used by:** `POST /oauth/:provider/login`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `code` | string | ✅ Required | max 2048 | - |
| `state` | string | Optional | max 256 | - |

---

## PROFILE SCHEMAS

### 23. `updateProfileSchema`
**Used by:** `PUT /profile`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `firstName` | string | Optional | max 50 | - |
| `lastName` | string | Optional | max 50 | - |
| `phone` | string | Optional | E.164 pattern, max 20 | - |
| `email` | string | Optional | email format, max 255 | - |

---

## ROLE MANAGEMENT SCHEMAS

### 24. `grantRoleSchema`
**Used by:** `POST /venues/:venueId/roles`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `userId` | string | ✅ Required | UUID format | - |
| `role` | string | ✅ Required | max 50 | - |

---

## PARAM VALIDATION SCHEMAS

### 25. `providerParamSchema`
**Used by:** OAuth routes (params)

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `provider` | string | ✅ Required | enum: `google`, `github`, `facebook`, `apple` | - |

---

### 26. `sessionIdParamSchema`
**Used by:** `DELETE /sessions/:sessionId`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `sessionId` | string | ✅ Required | UUID format | - |

---

### 27. `venueIdParamSchema`
**Used by:** Venue role routes

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `venueId` | string | ✅ Required | UUID format | - |

---

### 28. `userIdParamSchema`
**Used by:** Various routes

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `userId` | string | ✅ Required | UUID format | - |

---

### 29. `credentialIdParamSchema`
**Used by:** `DELETE /biometric/devices/:credentialId`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `credentialId` | string | ✅ Required | UUID format | - |

---

### 30. `venueIdAndUserIdParamSchema`
**Used by:** `DELETE /venues/:venueId/roles/:userId`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `venueId` | string | ✅ Required | UUID format | - |
| `userId` | string | ✅ Required | UUID format | - |

---

### 31. `publicKeyParamSchema`
**Used by:** `DELETE /wallet/unlink/:publicKey`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `publicKey` | string | ✅ Required | min 32, max 128, pattern: `/^[1-9A-HJ-NP-Za-km-z]+$/` (Base58) | - |

---

## EMPTY/QUERY SCHEMAS

### 32. `emptyBodySchema`
**Used by:** Many routes requiring no body

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| *(empty object)* | - | - | No fields allowed | - |

---

### 33. `paginationQuerySchema`
**Used by:** `GET /sessions`

| Field | Type | Required | Validation Rules | Default |
|-------|------|----------|------------------|---------|
| `page` | number | Optional | integer, min 1 | `1` |
| `limit` | number | Optional | integer, min 1, max 100 | `20` |
| `sortBy` | string | Optional | enum: `created_at`, `updated_at`, `name` | - |
| `order` | string | Optional | enum: `asc`, `desc` | `desc` |

---

# PART 2: RESPONSE SCHEMAS (`response.schemas.ts`)

**Validation Library:** Zod (converted to JSON Schema via `zodToJsonSchema`)
**Purpose:** Fastify response validation to prevent accidental data leakage (RD5)

---

## SHARED/REUSABLE SCHEMAS

### `SafeUserSchema`
**Fields exposed for user data:**

| Field | Type | Nullable |
|-------|------|----------|
| `id` | UUID | No |
| `email` | email | No |
| `username` | string | Yes |
| `display_name` | string | Yes |
| `first_name` | string | Yes |
| `last_name` | string | Yes |
| `phone` | string | Yes |
| `email_verified` | boolean | No |
| `phone_verified` | boolean | Yes |
| `mfa_enabled` | boolean | No |
| `role` | string | No |
| `tenant_id` | UUID | No |
| `status` | string | Yes |
| `created_at` | string/date | No |
| `updated_at` | string/date | No |
| `last_login_at` | string/date | Yes |
| `password_changed_at` | string/date | Yes |

**Note:** Sensitive fields like `password_hash`, `mfa_secret`, `backup_codes` are NOT included.

---

### `TokensSchema`

| Field | Type | Optional |
|-------|------|----------|
| `accessToken` | string | No |
| `refreshToken` | string | No |
| `expiresIn` | number | Yes |

---

## RESPONSE SCHEMAS BY ENDPOINT

| Response Schema | HTTP Status | Used By Route | Shape |
|-----------------|-------------|---------------|-------|
| `register` | 201 | `POST /register` | `{ user: SafeUser, tokens: Tokens }` |
| `login` | 200 | `POST /login` | `{ user: SafeUser, tokens: Tokens }` OR `{ requiresMFA: bool, userId: UUID }` |
| `refresh` | 200 | `POST /refresh` | `{ accessToken, refreshToken, expiresIn? }` |
| `verifyToken` | 200 | `GET /verify` | `{ valid: bool, user: SafeUser }` |
| `getCurrentUser` | 200 | `GET /me` | `{ user: SafeUser }` |
| `logout` | 200 | `POST /logout` | `{ success: bool, message? }` |
| `forgotPassword` | 200 | `POST /forgot-password` | `{ message }` |
| `resetPassword` | 200 | `POST /reset-password` | `{ message }` |
| `changePassword` | 200 | `PUT /change-password` | `{ message }` |
| `verifyEmail` | 200 | `GET /verify-email` | `{ message }` |
| `resendVerification` | 200 | `POST /resend-verification` | `{ message }` |
| `setupMFA` | 200 | `POST /mfa/setup` | `{ secret, qrCode, backupCodes? }` |
| `verifyMFASetup` | 200 | `POST /mfa/verify-setup` | `{ success: bool, backupCodes: string[] }` |
| `verifyMFA` | 200 | `POST /mfa/verify` | `{ valid: bool }` |
| `regenerateBackupCodes` | 200 | `POST /mfa/regenerate-backup-codes` | `{ backupCodes: string[] }` |
| `disableMFA` | 200 | `DELETE /mfa/disable` | `{ success: bool }` |
| `walletNonce` | 200 | `POST /wallet/nonce` | `{ nonce, expiresAt? }` |
| `walletRegister` | 201 | `POST /wallet/register` | `{ success?, user: SafeUser, tokens: Tokens }` |
| `walletLogin` | 200 | `POST /wallet/login` | `{ success?, user: SafeUser, tokens: Tokens }` |
| `walletLink` | 200 | `POST /wallet/link` | `{ success, message?, wallet?: { publicKey, chain, linkedAt } }` |
| `walletUnlink` | 200 | `DELETE /wallet/unlink/:publicKey` | `{ success, message? }` |
| `biometricChallenge` | 200 | `POST /biometric/challenge`, `GET /biometric/challenge` | `{ challenge }` |
| `biometricAuthenticate` | 200 | `POST /biometric/authenticate` | `{ success, tokens: Tokens }` |
| `biometricRegister` | 201 | `POST /biometric/register` | `{ success, credentialId }` |
| `biometricDevices` | 200 | `GET /biometric/devices` | `{ devices: [{ credentialId, deviceId, biometricType, createdAt, lastUsedAt? }] }` |
| `deleteBiometricDevice` | 204 | `DELETE /biometric/devices/:credentialId` | `{ success: bool }` |
| `oauthCallback` | 200 | `POST /oauth/:provider/callback`, `POST /oauth/:provider/login` | `{ user: SafeUser, tokens: Tokens }` |
| `oauthLink` | 200 | `POST /oauth/:provider/link` | `{ success, provider }` |
| `oauthUnlink` | 200 | `DELETE /oauth/:provider/unlink` | `{ success: bool }` |
| `listSessions` | 200 | `GET /sessions` | `{ success, sessions: [{ id, ip_address?, user_agent?, started_at, ended_at?, revoked_at?, metadata?, user_id }] }` |
| `revokeSession` | 200 | `DELETE /sessions/:sessionId` | `{ success, message }` |
| `invalidateAllSessions` | 200 | `DELETE /sessions/all` | `{ success, message, sessions_revoked }` |
| `getProfile` | 200 | `GET /profile` | `{ success, user: SafeUser }` |
| `updateProfile` | 200 | `PUT /profile` | `{ success, user: SafeUser }` |
| `exportData` | 200 | `GET /gdpr/export` | `{ exportedAt, exportFormat, user, sessions, walletConnections, oauthConnections, venueRoles, addresses, activityLog }` |
| `getConsent` | 200 | `GET /consent` | `{ success, consent: { marketing: {...}, terms: {...}, privacy: {...} } }` |
| `updateConsent` | 200 | `PUT /consent` | `{ success, message, consent: { marketingConsent, updatedAt } }` |
| `requestDeletion` | 200 | `POST /gdpr/delete` | `{ success, message, details: { deletedAt, anonymizationScheduled, note } }` |
| `grantVenueRole` | 200 | `POST /venues/:venueId/roles` | `{ success, message }` |
| `revokeVenueRole` | 200 | `DELETE /venues/:venueId/roles/:userId` | `{ success, message }` |
| `getVenueRoles` | 200 | `GET /venues/:venueId/roles` | `{ roles: [{ userId, role, isActive, createdAt, expiresAt? }] }` |
| `validatePermissions` | 200 | Internal S2S | `{ valid, reason?, userId?, role?, venueRole?, tenantId? }` |
| `validateUsers` | 200 | Internal S2S | `{ users: [...], found?, requested?, error? }` |
| `userTenant` | 200 | Internal S2S | `{ id, tenant_id, tenant_name, tenant_slug }` |
| `internalHealth` | 200 | Internal S2S | `{ status, service, timestamp }` |

---

## SUMMARY STATISTICS

| Category | Count |
|----------|-------|
| **Input Validation Schemas (Joi)** | 33 |
| **Response Schemas (Zod)** | 38 |
| **Custom Validators** | 1 (E.164 phone) |
| **Enum Validations** | 6 (chain, walletType, biometricType, provider, sortBy, order) |
| **UUID Validations** | 10+ fields |
| **Email Validations** | 5 fields |
| **Length Constraints** | All string fields have max length |
