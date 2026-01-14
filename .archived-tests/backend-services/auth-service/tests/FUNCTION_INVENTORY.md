# Auth Service - Function Inventory
> For integration test planning
> Generated: December 6, 2025

---

## 0. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | December 7, 2025 | Added sections: Changelog, Inter-Service Communication Map, Database ERD, Example Payloads, Environment-Specific Behavior, Biometric Edge Cases |
| 1.0.0 | December 6, 2025 | Initial function inventory with Routes, Validators, Controllers, Services, Middleware, Errors, Models, Utils, Config, Migrations, Application Bootstrap |

## Routes & Validators

---

## 1. Routes

### File: `src/routes/auth.routes.ts`
**Purpose**: Main route registration file that defines all authentication endpoints

#### Exports

##### `authRoutes(fastify: FastifyInstance, options: { container: Container })`
**Type**: Async function  
**Purpose**: Registers all authentication routes with the Fastify instance  
**Parameters**:
- `fastify: FastifyInstance` - Fastify server instance
- `options.container: Container` - Dependency injection container with all services

**Route Groups Registered**:

---

### PUBLIC ROUTES (No authentication required)

#### POST `/auth/register`
**Purpose**: Register a new user with email/password  
**Validation**: `registerSchema`  
**Rate Limiting**: `registrationRateLimiter`  
**Handler**: `AuthController.register()`  
**Body**:
- `email` (string, required) - User email
- `password` (string, required) - User password (min 8 chars)
- `firstName` (string, required) - User first name
- `lastName` (string, required) - User last name
- `phone` (string, optional) - User phone number
- `tenant_id` (UUID, required) - Tenant identifier

**Returns**: User object + JWT tokens

---

#### POST `/auth/login`
**Purpose**: Authenticate user with email/password  
**Validation**: `loginSchema`  
**Rate Limiting**: `loginRateLimiter` + `rateLimitService` (IP-based)  
**Handler**: `AuthController.login()`  
**Body**:
- `email` (string, required) - User email
- `password` (string, required) - User password
- `mfaToken` (string, optional) - 6-digit MFA token if MFA enabled

**Returns**: User object + JWT tokens (or MFA required flag)

---

#### POST `/auth/forgot-password`
**Purpose**: Request password reset email  
**Validation**: `forgotPasswordSchema`  
**Rate Limiting**: `rateLimitService` ('forgot-password')  
**Handler**: `AuthExtendedController.forgotPassword()`  
**Body**:
- `email` (string, required) - User email address

**Returns**: Success message

---

#### POST `/auth/reset-password`
**Purpose**: Reset password using token from email  
**Validation**: `resetPasswordSchema`  
**Rate Limiting**: `rateLimitService` ('reset-password')  
**Handler**: `AuthExtendedController.resetPassword()`  
**Body**:
- `token` (string, required) - Reset token from email
- `newPassword` (string, required) - New password (min 8 chars)

**Returns**: Success message

---

#### GET `/auth/verify-email`
**Purpose**: Verify user email address  
**Validation**: `verifyEmailSchema` (query params)  
**Handler**: `AuthExtendedController.verifyEmail()`  
**Query Params**:
- `token` (string, required) - Verification token from email

**Returns**: Success message

---

#### POST `/auth/refresh`
**Purpose**: Refresh access token using refresh token  
**Validation**: `refreshTokenSchema`  
**Handler**: `AuthController.refreshTokens()`  
**Body**:
- `refreshToken` (string, required) - Valid refresh token

**Returns**: New access token + new refresh token

---

### OAUTH ROUTES (Public - special authentication flow)

#### POST `/auth/oauth/:provider/callback`
**Purpose**: OAuth provider callback handler (Google, GitHub, Apple)  
**Validation**: `oauthCallbackSchema`  
**Rate Limiting**: `rateLimitService` ('oauth-callback')  
**Handler**: Inline OAuth authentication  
**Params**:
- `provider` (string, required) - OAuth provider name ('google', 'github', 'apple')

**Body**:
- `code` (string, required) - Authorization code from OAuth provider
- `tenant_id` (UUID, optional) - Tenant identifier for registration

**Returns**: User object + JWT tokens

---

#### POST `/auth/oauth/:provider/login`
**Purpose**: Legacy OAuth login endpoint (backward compatibility)  
**Validation**: `oauthLoginSchema`  
**Rate Limiting**: `rateLimitService` ('oauth-login')  
**Handler**: Inline OAuth authentication  
**Params**:
- `provider` (string, required) - OAuth provider name

**Body**:
- `code` (string, required) - Authorization code from OAuth provider

**Returns**: User object + JWT tokens

---

### WALLET ROUTES (Web3 authentication)

#### POST `/auth/wallet/nonce`
**Purpose**: Request nonce for wallet signature  
**Validation**: `walletNonceSchema`  
**Rate Limiting**: `rateLimitService` ('wallet-nonce')  
**Handler**: `WalletController.requestNonce()`  
**Body**:
- `publicKey` (string, required) - Wallet public key
- `chain` (string, required) - Blockchain ('solana' or 'ethereum')

**Returns**: `{ nonce: string, message: string }`

---

#### POST `/auth/wallet/register`
**Purpose**: Register new user with wallet signature  
**Validation**: `walletRegisterSchema`  
**Rate Limiting**: `rateLimitService` ('wallet-register')  
**Handler**: `WalletController.register()`  
**Body**:
- `publicKey` (string, required) - Wallet public key
- `signature` (string, required) - Signed message
- `nonce` (string, required) - Nonce from `/wallet/nonce`
- `chain` (string, required) - Blockchain ('solana' or 'ethereum')
- `tenant_id` (UUID, required) - Tenant identifier

**Returns**: User object + JWT tokens

---

#### POST `/auth/wallet/login`
**Purpose**: Login with wallet signature  
**Validation**: `walletLoginSchema`  
**Rate Limiting**: `rateLimitService` ('wallet-login')  
**Handler**: `WalletController.login()`  
**Body**:
- `publicKey` (string, required) - Wallet public key
- `signature` (string, required) - Signed message
- `nonce` (string, required) - Nonce from `/wallet/nonce`
- `chain` (string, required) - Blockchain ('solana' or 'ethereum')

**Returns**: User object + JWT tokens

---

### BIOMETRIC ROUTES (Public - passwordless login)

#### POST `/auth/biometric/challenge`
**Purpose**: Generate challenge for biometric login  
**Validation**: `biometricChallengeSchema`  
**Handler**: Inline biometric challenge generation  
**Body**:
- `userId` (UUID, required) - User identifier

**Returns**: `{ challenge: string }`

---

#### POST `/auth/biometric/authenticate`
**Purpose**: Authenticate with biometric credential  
**Validation**: `biometricAuthenticateSchema`  
**Handler**: Inline biometric verification  
**Body**:
- `userId` (UUID, required) - User identifier
- `credentialId` (UUID, required) - Biometric credential ID
- `signature` (string, required) - Signed challenge
- `challenge` (string, required) - Challenge string

**Returns**: JWT tokens on success

---

### AUTHENTICATED ROUTES (Require valid JWT)

All routes in this section require:
- Valid JWT access token in Authorization header
- Automatic tenant context injection
- Authentication middleware (`authMiddleware.authenticate`)

---

#### GET `/auth/verify`
**Purpose**: Verify JWT token validity and get token info  
**Handler**: `AuthController.verifyToken()`  
**Returns**: Token payload information

---

#### GET `/auth/me`
**Purpose**: Get current authenticated user information  
**Handler**: `AuthController.getCurrentUser()`  
**Returns**: User object

---

#### POST `/auth/logout`
**Purpose**: Logout current user and invalidate tokens  
**Handler**: `AuthController.logout()`  
**Returns**: Success message

---

#### POST `/auth/resend-verification`
**Purpose**: Resend email verification email  
**Handler**: `AuthExtendedController.resendVerification()`  
**Returns**: Success message

---

#### PUT `/auth/change-password`
**Purpose**: Change user password (requires current password)  
**Validation**: `changePasswordSchema`  
**Handler**: `AuthExtendedController.changePassword()`  
**Body**:
- `currentPassword` (string, required) - Current password
- `newPassword` (string, required) - New password (min 8 chars)

**Returns**: Success message

---

### MFA ROUTES (Authenticated)

#### POST `/auth/mfa/setup`
**Purpose**: Initialize MFA setup and get QR code  
**Validation**: `setupMFASchema`  
**Handler**: `AuthController.setupMFA()`  
**Returns**: `{ secret: string, qrCode: string }` - TOTP secret and QR code

---

#### POST `/auth/mfa/verify-setup`
**Purpose**: Verify MFA setup with first token  
**Validation**: `verifyMFASchema`  
**Handler**: `AuthController.verifyMFASetup()`  
**Body**:
- `token` (string, required) - 6-digit TOTP token

**Returns**: `{ backupCodes: string[] }` - Array of backup codes

---

#### POST `/auth/mfa/verify`
**Purpose**: Verify MFA token during login  
**Validation**: `verifyMFASchema`  
**Handler**: `AuthController.verifyMFA()`  
**Body**:
- `token` (string, required) - 6-digit TOTP token

**Returns**: Success message

---

#### POST `/auth/mfa/regenerate-backup-codes`
**Purpose**: Generate new backup codes  
**Handler**: `AuthController.regenerateBackupCodes()`  
**Returns**: `{ backupCodes: string[] }` - New array of backup codes

---

#### DELETE `/auth/mfa/disable`
**Purpose**: Disable MFA for user account  
**Validation**: `disableMFASchema`  
**Handler**: `AuthController.disableMFA()`  
**Body**:
- `password` (string, required) - Current password
- `token` (string, required) - 6-digit TOTP token

**Returns**: Success message

---

### WALLET MANAGEMENT (Authenticated)

#### POST `/auth/wallet/link`
**Purpose**: Link wallet to existing authenticated account  
**Validation**: `walletLinkSchema`  
**Rate Limiting**: `rateLimitService` ('wallet-link')  
**Handler**: `WalletController.linkWallet()`  
**Body**:
- `publicKey` (string, required) - Wallet public key
- `signature` (string, required) - Signed message
- `nonce` (string, required) - Nonce from `/wallet/nonce`
- `chain` (string, required) - Blockchain ('solana' or 'ethereum')

**Returns**: Success message

---

#### DELETE `/auth/wallet/unlink/:publicKey`
**Purpose**: Unlink wallet from account  
**Rate Limiting**: `rateLimitService` ('wallet-unlink')  
**Handler**: `WalletController.unlinkWallet()`  
**Params**:
- `publicKey` (string, required) - Wallet public key to unlink

**Returns**: Success message

---

### BIOMETRIC MANAGEMENT (Authenticated)

#### POST `/auth/biometric/register`
**Purpose**: Register new biometric credential for user  
**Validation**: `biometricRegisterSchema`  
**Handler**: Inline biometric registration  
**Body**:
- `publicKey` (string, required) - Biometric public key (max 2048 chars)
- `deviceId` (string, required) - Device identifier
- `biometricType` (string, optional) - Type ('faceId', 'touchId', 'fingerprint')

**Returns**: Credential information (201 Created)

---

#### GET `/auth/biometric/challenge`
**Purpose**: Generate challenge for biometric setup verification  
**Handler**: Inline challenge generation  
**Returns**: `{ challenge: string }`

---

#### GET `/auth/biometric/devices`
**Purpose**: List all registered biometric devices  
**Handler**: Inline device listing  
**Returns**: `{ devices: BiometricDevice[] }`

---

#### DELETE `/auth/biometric/devices/:credentialId`
**Purpose**: Remove biometric device  
**Handler**: Inline device removal  
**Params**:
- `credentialId` (string, required) - Credential ID to remove

**Returns**: 204 No Content on success

---

### OAUTH LINKING (Authenticated)

#### POST `/auth/oauth/:provider/link`
**Purpose**: Link OAuth provider to existing account  
**Validation**: `oauthLinkSchema`  
**Handler**: `OAuthService.linkProvider()`  
**Params**:
- `provider` (string, required) - OAuth provider name

**Body**:
- `code` (string, required) - Authorization code from OAuth provider

**Returns**: Link confirmation

---

#### DELETE `/auth/oauth/:provider/unlink`
**Purpose**: Unlink OAuth provider from account  
**Handler**: `OAuthService.unlinkProvider()`  
**Params**:
- `provider` (string, required) - OAuth provider name

**Returns**: Success message

---

### SESSION MANAGEMENT (Authenticated)

#### GET `/auth/sessions`
**Purpose**: List all active sessions for user  
**Handler**: `SessionController.listSessions()`  
**Returns**: Array of session objects

---

#### DELETE `/auth/sessions/all`
**Purpose**: Invalidate all sessions (except current)  
**Handler**: `SessionController.invalidateAllSessions()`  
**Returns**: Success message

---

#### DELETE `/auth/sessions/:sessionId`
**Purpose**: Revoke specific session  
**Handler**: `SessionController.revokeSession()`  
**Params**:
- `sessionId` (UUID, required) - Session ID to revoke

**Returns**: Success message

---

### PROFILE MANAGEMENT (Authenticated)

#### GET `/auth/profile`
**Purpose**: Get user profile information  
**Handler**: `ProfileController.getProfile()`  
**Returns**: User profile object

---

#### PUT `/auth/profile`
**Purpose**: Update user profile information  
**Validation**: `updateProfileSchema`  
**Handler**: `ProfileController.updateProfile()`  
**Body**:
- `firstName` (string, optional) - Updated first name
- `lastName` (string, optional) - Updated last name
- `phone` (string, optional) - Updated phone number
- `email` (string, optional) - Updated email address

**Returns**: Updated user profile

---

### VENUE ROLE MANAGEMENT (Authenticated + Permissions)

#### POST `/auth/venues/:venueId/roles`
**Purpose**: Grant role to user at venue  
**Validation**: `grantRoleSchema`  
**Permission Required**: `roles:manage`  
**Handler**: Inline role granting  
**Params**:
- `venueId` (UUID, required) - Venue identifier

**Body**:
- `userId` (UUID, required) - User to grant role to
- `role` (string, required) - Role name to grant

**Returns**: Success message

---

#### DELETE `/auth/venues/:venueId/roles/:userId`
**Purpose**: Revoke all roles for user at venue  
**Permission Required**: `roles:manage`  
**Handler**: Inline role revocation  
**Params**:
- `venueId` (UUID, required) - Venue identifier
- `userId` (UUID, required) - User to revoke roles from

**Returns**: Success message

---

#### GET `/auth/venues/:venueId/roles`
**Purpose**: Get all roles at venue  
**Permission Required**: Venue access  
**Handler**: Inline role listing  
**Params**:
- `venueId` (UUID, required) - Venue identifier

**Returns**: `{ roles: VenueRole[] }`

---

## 2. Validators

### File: `src/validators/auth.validators.ts`
**Purpose**: Joi validation schemas for all authentication endpoints

#### Exports (23 Schemas)

---

### `registerSchema`
**Type**: Joi.Object  
**Purpose**: Validate user registration with email/password  
**Fields**:
- `email` (string, email, max 255, required)
- `password` (string, min 8, max 128, required)
- `firstName` (string, max 50, required)
- `lastName` (string, max 50, required)
- `phone` (string, max 20, optional)
- `tenant_id` (UUID, required) - With custom error messages

---

### `loginSchema`
**Type**: Joi.Object  
**Purpose**: Validate login credentials  
**Fields**:
- `email` (string, email, max 255, required)
- `password` (string, max 128, required)
- `mfaToken` (string, length 6, optional) - For MFA-enabled accounts

---

### `refreshTokenSchema`
**Type**: Joi.Object  
**Purpose**: Validate token refresh request  
**Fields**:
- `refreshToken` (string, required)

---

### `verifyEmailSchema`
**Type**: Joi.Object  
**Purpose**: Validate email verification token  
**Fields**:
- `token` (string, required)

---

### `forgotPasswordSchema`
**Type**: Joi.Object  
**Purpose**: Validate password reset request  
**Fields**:
- `email` (string, email, max 255, required)

---

### `resetPasswordSchema`
**Type**: Joi.Object  
**Purpose**: Validate password reset with token  
**Fields**:
- `token` (string, required)
- `newPassword` (string, min 8, max 128, required)

---

### `changePasswordSchema`
**Type**: Joi.Object  
**Purpose**: Validate password change (authenticated)  
**Fields**:
- `currentPassword` (string, max 128, required)
- `newPassword` (string, min 8, max 128, required)

---

### `setupMFASchema`
**Type**: Joi.Object  
**Purpose**: Validate MFA setup request (empty schema - no body required)  
**Fields**: None

---

### `verifyMFASchema`
**Type**: Joi.Object  
**Purpose**: Validate MFA token  
**Fields**:
- `token` (string, length 6, required) - 6-digit TOTP code

---

### `disableMFASchema`
**Type**: Joi.Object  
**Purpose**: Validate MFA disable request  
**Fields**:
- `password` (string, max 128, required)
- `token` (string, length 6, required)

---

### `walletNonceSchema`
**Type**: Joi.Object  
**Purpose**: Validate wallet nonce request  
**Fields**:
- `publicKey` (string, min 32, max 128, required)
- `chain` (string, valid: ['solana', 'ethereum'], required)

---

### `walletRegisterSchema`
**Type**: Joi.Object  
**Purpose**: Validate wallet-based registration  
**Fields**:
- `publicKey` (string, min 32, max 128, required)
- `signature` (string, min 64, max 256, required)
- `nonce` (string, min 32, max 128, required)
- `chain` (string, valid: ['solana', 'ethereum'], required)
- `tenant_id` (UUID, required)

---

### `walletLoginSchema`
**Type**: Joi.Object  
**Purpose**: Validate wallet-based login  
**Fields**:
- `publicKey` (string, min 32, max 128, required)
- `signature` (string, min 64, max 256, required)
- `nonce` (string, min 32, max 128, required)
- `chain` (string, valid: ['solana', 'ethereum'], required)

---

### `walletLinkSchema`
**Type**: Joi.Object  
**Purpose**: Validate wallet linking to account  
**Fields**:
- `publicKey` (string, min 32, max 128, required)
- `signature` (string, min 64, max 256, required)
- `nonce` (string, min 32, max 128, required)
- `chain` (string, valid: ['solana', 'ethereum'], required)

---

### `connectWalletSchema`
**Type**: Joi.Object  
**Purpose**: Validate wallet connection  
**Fields**:
- `walletAddress` (string, max 128, required)
- `walletType` (string, valid: ['phantom', 'solflare', 'metamask'], required)

---

### `biometricRegisterSchema`
**Type**: Joi.Object  
**Purpose**: Validate biometric credential registration  
**Fields**:
- `publicKey` (string, max 2048, required)
- `deviceId` (string, max 255, required)
- `biometricType` (string, valid: ['faceId', 'touchId', 'fingerprint'], optional)

---

### `biometricChallengeSchema`
**Type**: Joi.Object  
**Purpose**: Validate biometric challenge request  
**Fields**:
- `userId` (UUID, required)

---

### `biometricAuthenticateSchema`
**Type**: Joi.Object  
**Purpose**: Validate biometric authentication  
**Fields**:
- `userId` (UUID, required)
- `credentialId` (UUID, required)
- `signature` (string, max 2048, required)
- `challenge` (string, max 256, required)

---

### `oauthCallbackSchema`
**Type**: Joi.Object  
**Purpose**: Validate OAuth authorization callback  
**Fields**:
- `code` (string, max 2048, required)
- `state` (string, max 256, optional)
- `tenant_id` (UUID, optional)

---

### `oauthLinkSchema`
**Type**: Joi.Object  
**Purpose**: Validate OAuth provider linking  
**Fields**:
- `code` (string, max 2048, required)
- `state` (string, max 256, optional)

---

### `oauthLoginSchema`
**Type**: Joi.Object  
**Purpose**: Validate OAuth login (legacy)  
**Fields**:
- `code` (string, max 2048, required)
- `state` (string, max 256, optional)

---

### `updateProfileSchema`
**Type**: Joi.Object  
**Purpose**: Validate profile update  
**Fields**:
- `firstName` (string, max 50, optional)
- `lastName` (string, max 50, optional)
- `phone` (string, max 20, optional)
- `email` (string, email, max 255, optional)

---

### `grantRoleSchema`
**Type**: Joi.Object  
**Purpose**: Validate role grant request  
**Fields**:
- `userId` (UUID, required)
- `role` (string, max 50, required)

---

## Summary

### Route Statistics
- **Total Endpoints**: 33+
- **Public Endpoints**: 13 (registration, login, OAuth, wallet, biometric)
- **Authenticated Endpoints**: 20+ (MFA, profile, sessions, management)
- **HTTP Methods**: GET (7), POST (19), PUT (2), DELETE (5)

### Validation Statistics
- **Total Schemas**: 23
- **Authentication Schemas**: 8 (register, login, refresh, email verification, password management)
- **MFA Schemas**: 3 (setup, verify, disable)
- **Web3 Wallet Schemas**: 5 (nonce, register, login, link, connect)
- **Biometric Schemas**: 3 (register, challenge, authenticate)
- **OAuth Schemas**: 3 (callback, link, login)
- **Profile/Role Schemas**: 2 (update profile, grant role)

### Security Features
- **Rate Limiting**: Applied to all critical endpoints
- **Validation**: Joi schema validation on all inputs
- **Authentication**: JWT-based with refresh token rotation
- **Authorization**: Role-based access control for venue management
- **Multi-tenancy**: Tenant isolation via tenant_id
- **Audit Logging**: All authentication events tracked

---

## Integration Test Coverage Areas

### Critical Flows
1. **User Registration & Email Verification**
2. **Login & Token Refresh**
3. **Password Reset Flow**
4. **MFA Setup & Verification**
5. **OAuth Provider Integration**
6. **Web3 Wallet Authentication**
7. **Biometric Authentication**
8. **Session Management**
9. **Profile Updates**
10. **Role-Based Access Control**

### Edge Cases to Test
- Expired tokens
- Invalid credentials
- Rate limiting triggers
- MFA bypass attempts
- Concurrent session handling
- Token rotation attacks
- Cross-tenant access attempts
- Invalid OAuth codes
- Wallet signature verification failures
- Biometric credential reuse

---

## 3. Controllers

### File: `src/controllers/auth.controller.ts`
**Purpose**: Handles core authentication operations including registration, login, token refresh, logout, and MFA management

**Class**: `AuthController`  
**Constructor Dependencies**:
- `authService: AuthService` - Main authentication service
- `mfaService: MFAService` - Multi-factor authentication service

#### Public Methods

##### `register(request, reply)`
- **Parameters**: `request` (body: email, password, firstName, lastName, phone, tenant_id), `reply`
- **Returns**: `{ user, tokens }` (status 201)
- **What it does**: Creates new user account, caches user data
- **Route**: `POST /auth/register`
- **Error Responses**:
  - 409: Duplicate email/user already exists
  - 500: Registration failed

##### `login(request, reply)`
- **Parameters**: `request` (body: email, password, mfaToken?), `reply`
- **Returns**: `{ user, tokens }` OR `{ requiresMFA: true, userId }` (status 200)
- **What it does**: Authenticates user, handles MFA verification (TOTP + backup codes), caches session
- **Route**: `POST /auth/login`
- **Error Responses**:
  - 401: Invalid credentials / Invalid MFA token
  - 500: Login failed

##### `refreshTokens(request, reply)`
- **Parameters**: `request` (body: refreshToken), `reply`
- **Returns**: `{ accessToken, refreshToken }`
- **What it does**: Exchanges refresh token for new access/refresh token pair
- **Route**: `POST /auth/refresh`
- **Error Responses**:
  - 401: Invalid/expired token, token reuse detected

##### `logout(request, reply)`
- **Parameters**: `request` (user from JWT), `reply`
- **Returns**: 204 No Content
- **What it does**: Invalidates user session, clears cache
- **Route**: `POST /auth/logout`
- **Error Responses**: None (always 204)

##### `getMe(request, reply)`
- **Parameters**: `request` (user from JWT), `reply`
- **Returns**: `{ user }`
- **What it does**: Gets current user info with cache-first strategy
- **Route**: Legacy - not directly routed
- **Error Responses**:
  - 404: User not found

##### `getCacheStats(request, reply)`
- **Parameters**: `request`, `reply`
- **Returns**: Cache statistics object
- **What it does**: Returns cache hit/miss metrics
- **Route**: Utility method - not directly routed
- **Error Responses**: None

##### `verifyToken(request, reply)`
- **Parameters**: `request` (user from JWT), `reply`
- **Returns**: `{ valid: true, user }`
- **What it does**: Validates JWT and returns user payload
- **Route**: `GET /auth/verify`
- **Error Responses**: None (middleware rejects invalid tokens)

##### `getCurrentUser(request, reply)`
- **Parameters**: `request` (user from JWT), `reply`
- **Returns**: `{ user }`
- **What it does**: Returns authenticated user object
- **Route**: `GET /auth/me`
- **Error Responses**: None

##### `setupMFA(request, reply)`
- **Parameters**: `request` (user from JWT), `reply`
- **Returns**: `{ secret, qrCode: string }`
- **What it does**: Initiates MFA setup, generates TOTP secret and QR code
- **Route**: `POST /auth/mfa/setup`
- **Error Responses**:
  - 400: MFA already enabled
  - 500: Failed to setup MFA

##### `verifyMFASetup(request, reply)`
- **Parameters**: `request` (body: token, user from JWT), `reply`
- **Returns**: `{ backupCodes: string[] }`
- **What it does**: Verifies first TOTP token, enables MFA, generates backup codes
- **Route**: `POST /auth/mfa/verify-setup`
- **Error Responses**:
  - 400: Invalid/expired token
  - 500: Failed to verify MFA setup

##### `verifyMFA(request, reply)`
- **Parameters**: `request` (body: token, user from JWT), `reply`
- **Returns**: `{ valid: boolean }`
- **What it does**: Verifies TOTP token for authenticated user
- **Route**: `POST /auth/mfa/verify`
- **Error Responses**:
  - 500: Failed to verify MFA

##### `regenerateBackupCodes(request, reply)`
- **Parameters**: `request` (user from JWT), `reply`
- **Returns**: `{ backupCodes: string[] }`
- **What it does**: Generates new set of backup codes, invalidates old ones
- **Route**: `POST /auth/mfa/regenerate-backup-codes`
- **Error Responses**:
  - 400: MFA not enabled
  - 500: Failed to regenerate backup codes

##### `disableMFA(request, reply)`
- **Parameters**: `request` (body: password, token, user from JWT), `reply`
- **Returns**: `{ success: true }`
- **What it does**: Disables MFA after password + token verification
- **Route**: `DELETE /auth/mfa/disable`
- **Error Responses**:
  - 400: Invalid password/token
  - 500: Failed to disable MFA

---

### File: `src/controllers/auth-extended.controller.ts`
**Purpose**: Handles extended authentication operations like password reset and email verification

**Class**: `AuthExtendedController`  
**Constructor Dependencies**:
- `authExtendedService: AuthExtendedService` - Extended auth operations service

#### Public Methods

##### `forgotPassword(request, reply)`
- **Parameters**: `request` (body: email), `reply`
- **Returns**: `{ message }` (always 200 to prevent enumeration)
- **What it does**: Sends password reset email if account exists
- **Route**: `POST /auth/forgot-password`
- **Error Responses**:
  - 429: Too many requests
  - 200: Generic success message (even on error, prevents email enumeration)

##### `resetPassword(request, reply)`
- **Parameters**: `request` (body: token, newPassword), `reply`
- **Returns**: `{ message: 'Password has been reset successfully' }`
- **What it does**: Resets password using token from email
- **Route**: `POST /auth/reset-password`
- **Error Responses**:
  - 400: Invalid/expired token, weak password (ValidationError)
  - 500: Failed to reset password

##### `verifyEmail(request, reply)`
- **Parameters**: `request` (query: token), `reply`
- **Returns**: `{ message: 'Email verified successfully' }`
- **What it does**: Verifies email address using token
- **Route**: `GET /auth/verify-email`
- **Error Responses**:
  - 400: Token required, invalid/expired token (ValidationError)
  - 500: Failed to verify email

##### `resendVerification(request, reply)`
- **Parameters**: `request` (user from JWT), `reply`
- **Returns**: `{ message: 'Verification email sent' }`
- **What it does**: Resends verification email to authenticated user
- **Route**: `POST /auth/resend-verification`
- **Error Responses**:
  - 401: Unauthorized
  - 400: Already verified, too many requests (ValidationError)
  - 500: Failed to send verification email

##### `changePassword(request, reply)`
- **Parameters**: `request` (body: currentPassword, newPassword, user from JWT), `reply`
- **Returns**: `{ message: 'Password changed successfully' }`
- **What it does**: Changes password for authenticated user
- **Route**: `PUT /auth/change-password`
- **Error Responses**:
  - 401: Unauthorized, incorrect current password (AuthenticationError)
  - 400: Weak password, same as old password (ValidationError)
  - 500: Failed to change password

---

### File: `src/controllers/profile.controller.ts`
**Purpose**: Manages user profile viewing and updates with tenant isolation

**Class**: `ProfileController`  
**Constructor Dependencies**: None (uses direct database access via pool)

#### Public Methods

##### `getProfile(request, reply)`
- **Parameters**: `request: AuthenticatedRequest` (user with id, tenant_id), `reply: FastifyReply`
- **Returns**: `{ success: true, user: {...profile fields} }`
- **What it does**: Retrieves user profile with tenant isolation check
- **Route**: `GET /auth/profile`
- **Error Responses**:
  - 404: User not found (USER_NOT_FOUND)
  - 500: Failed to retrieve profile (INTERNAL_ERROR)

##### `updateProfile(request, reply)`
- **Parameters**: `request: AuthenticatedRequest` (body: firstName?, lastName?, phone?, email?), `reply: FastifyReply`
- **Returns**: Updated user profile (via getProfile)
- **What it does**: Updates allowed profile fields, sanitizes HTML tags, triggers email re-verification on email change, logs audit event
- **Route**: `PUT /auth/profile`
- **Error Responses**:
  - 422: No valid fields to update (VALIDATION_ERROR)
  - 500: Failed to update profile (INTERNAL_ERROR)

---

### File: `src/controllers/session.controller.ts`
**Purpose**: Manages user session listing and revocation with tenant isolation

**Class**: `SessionController`  
**Constructor Dependencies**: None (uses direct database access via pool)

#### Public Methods

##### `listSessions(request, reply)`
- **Parameters**: `request: AuthenticatedRequest` (user with id, tenant_id), `reply: FastifyReply`
- **Returns**: `{ success: true, sessions: [...active sessions] }`
- **What it does**: Lists all active sessions for user with tenant verification
- **Route**: `GET /auth/sessions`
- **Error Responses**:
  - 500: Failed to retrieve sessions (INTERNAL_ERROR)

##### `revokeSession(request, reply)`
- **Parameters**: `request: AuthenticatedRequest` (params: sessionId, user), `reply: FastifyReply`
- **Returns**: `{ success: true, message: 'Session revoked successfully' }`
- **What it does**: Revokes specific session after verifying ownership and tenant, logs audit event
- **Route**: `DELETE /auth/sessions/:sessionId`
- **Error Responses**:
  - 404: Session not found (SESSION_NOT_FOUND)
  - 500: Failed to revoke session (INTERNAL_ERROR)

##### `invalidateAllSessions(request, reply)`
- **Parameters**: `request: AuthenticatedRequest` (user with id, tenant_id), `reply: FastifyReply`
- **Returns**: `{ success: true, message, sessions_revoked: number }`
- **What it does**: Ends all active sessions for user, logs audit event with count
- **Route**: `DELETE /auth/sessions/all`
- **Error Responses**:
  - 403: Forbidden (user/tenant mismatch)
  - 500: Failed to invalidate sessions (INTERNAL_ERROR)

---

### File: `src/controllers/wallet.controller.ts`
**Purpose**: Handles Web3 wallet authentication (Solana/Ethereum) including registration, login, and linking

**Class**: `WalletController`  
**Constructor Dependencies**:
- `walletService: WalletService` - Web3 wallet operations service

#### Public Methods

##### `requestNonce(request, reply)`
- **Parameters**: `request` (body: publicKey, chain), `reply`
- **Returns**: `{ nonce: string, message: string }` (status 200)
- **What it does**: Generates nonce for wallet signature challenge
- **Route**: `POST /auth/wallet/nonce`
- **Error Responses**:
  - 500: Failed to generate nonce

##### `register(request, reply)`
- **Parameters**: `request` (body: publicKey, signature, nonce, chain, tenant_id), `reply`
- **Returns**: `{ user, tokens }` (status 201) OR `{ success: false, error }`
- **What it does**: Registers new user using wallet signature verification
- **Route**: `POST /auth/wallet/register`
- **Error Responses**:
  - 401: Invalid signature (AuthenticationError) 
  - 409: Wallet already registered (duplicate)
  - 500: Registration failed

##### `login(request, reply)`
- **Parameters**: `request` (body: publicKey, signature, nonce, chain), `reply`
- **Returns**: `{ user, tokens }` (status 200) OR `{ success: false, error }`
- **What it does**: Authenticates user using wallet signature
- **Route**: `POST /auth/wallet/login`
- **Error Responses**:
  - 401: Invalid signature, wallet not found (AuthenticationError)
  - 500: Login failed

##### `linkWallet(request, reply)`
- **Parameters**: `request` (body: publicKey, signature, nonce, chain, user from JWT), `reply`
- **Returns**: `{ success: true }` (status 200) OR `{ success: false, error }`
- **What it does**: Links wallet to existing authenticated user account
- **Route**: `POST /auth/wallet/link`
- **Error Responses**:
  - 401: Invalid signature (AuthenticationError)
  - 500: Failed to link wallet

##### `unlinkWallet(request, reply)`
- **Parameters**: `request` (params: publicKey, user from JWT), `reply`
- **Returns**: `{ success: true }` (status 200) OR `{ success: false, error }`
- **What it does**: Removes wallet connection from user account
- **Route**: `DELETE /auth/wallet/unlink/:publicKey`
- **Error Responses**:
  - 401: Wallet not found (AuthenticationError)
  - 500: Failed to unlink wallet

---

## Controller Summary

### Statistics
- **Total Controllers**: 5
- **Total Public Methods**: 29
- **Authentication Methods**: 6 (register, login, refresh, logout, verify token, get user)
- **MFA Methods**: 5 (setup, verify setup, verify, regenerate codes, disable)
- **Password Management Methods**: 3 (forgot, reset, change)
- **Email Verification Methods**: 2 (verify, resend)
- **Profile Methods**: 2 (get, update)
- **Session Methods**: 3 (list, revoke one, revoke all)
- **Wallet Methods**: 5 (nonce, register, login, link, unlink)

### Key Patterns

1. **Error Handling**: All controllers implement try-catch with appropriate HTTP status codes
2. **Security**: 
   - Email enumeration prevention in forgot password (always returns success)
   - Generic error messages to prevent information leakage
   - Tenant isolation in Profile and Session controllers
3. **Caching**: AuthController uses Redis for user and session data
4. **Audit Logging**: Session and Profile controllers log security events to audit_logs table
5. **MFA Flow**: Login supports both TOTP and backup codes with automatic fallback
6. **Sanitization**: Profile controller strips HTML to prevent XSS attacks
7. **Authentication Sources**: Supports traditional (email/password), OAuth, Web3 wallets, and biometrics
8. **Response Consistency**: Controllers return structured responses with success/error flags

### Error Response Patterns

- **400**: Validation errors, bad requests, invalid tokens
- **401**: Authentication failures, invalid credentials, unauthorized access
- **403**: Forbidden, tenant mismatch
- **404**: Resource not found (user, session)
- **409**: Conflicts (duplicate email, wallet already registered)
- **422**: Unprocessable entity, validation errors
- **429**: Rate limit exceeded
- **500**: Internal server errors, unexpected failures

---

## 4. Services

### Core Authentication Services

#### AuthService (`src/services/auth.service.ts`)
**Dependencies**: JWTService, EmailService  
**Methods**: register, login, refreshTokens, logout, verifyEmail, forgotPassword, resetPassword, changePassword, getUserById, regenerateTokensAfterMFA  
**DB Tables**: users, tenants, user_sessions, invalidated_tokens  
**Redis Keys**: None (uses timing attack prevention)  
**External**: Email sending (async)  
**Errors**: Duplicate email, Invalid credentials, User not found  

#### AuthExtendedService (`src/services/auth-extended.service.ts`)
**Dependencies**: EmailService  
**Methods**: requestPasswordReset, resetPassword, verifyEmail, resendVerificationEmail, changePassword  
**DB Tables**: users, user_sessions, audit_logs  
**Redis Keys**: `password-reset:*`, `email-verify:*`, `resend-verify:*`  
**External**: Resend email API  
**Errors**: ValidationError, AuthenticationError, Rate limit exceeded  

#### JWTService (`src/services/jwt.service.ts`)
**Dependencies**: None  
**Methods**: generateTokenPair, verifyAccessToken, refreshTokens, invalidateTokenFamily, revokeAllUserTokens, decode, verifyRefreshToken, getPublicKey  
**DB Tables**: users  
**Redis Keys**: `refresh_token:*`  
**External**: RS256 key files (jwt-private.pem, jwt-public.pem)  
**Errors**: TokenError, Token reuse detected, Token expired  

#### MFAService (`src/services/mfa.service.ts`)
**Dependencies**: None  
**Methods**: setupTOTP, verifyAndEnableTOTP, verifyTOTP, verifyBackupCode, regenerateBackupCodes, requireMFAForOperation, markMFAVerified, disableTOTP  
**DB Tables**: users (mfa_enabled, mfa_secret, backup_codes)  
**Redis Keys**: `mfa:setup:*`, `mfa:recent:*:*`, `mfa:verified:*`  
**External**: None  
**Errors**: AuthenticationError, MFA required, Token recently used  

#### PasswordSecurityService (`src/services/password-security.service.ts`)
**Dependencies**: None  
**Methods**: hashPassword, verifyPassword, validatePassword, generateSecurePassword  
**DB Tables**: None  
**Redis Keys**: None  
**External**: None  
**Errors**: Validation errors (password requirements)  

---

### Security & Protection Services

#### RBACService (`src/services/rbac.service.ts`)
**Dependencies**: None  
**Methods**: getUserPermissions, checkPermission, requirePermission, grantVenueRole, revokeVenueRole, getUserVenueRoles  
**DB Tables**: user_venue_roles  
**Redis Keys**: None  
**External**: None  
**Errors**: AuthorizationError  

#### BruteForceProtectionService (`src/services/brute-force-protection.service.ts`)
**Dependencies**: Redis  
**Methods**: recordFailedAttempt, clearFailedAttempts, isLocked, getLockInfo  
**DB Tables**: None  
**Redis Keys**: `failed_auth:*`, `auth_lock:*`  
**External**: None  
**Errors**: None (returns lock status)  

#### LockoutService (`src/services/lockout.service.ts`)
**Dependencies**: None  
**Methods**: recordFailedAttempt, checkLockout, clearFailedAttempts  
**DB Tables**: None  
**Redis Keys**: `lockout:user:*`, `lockout:ip:*`  
**External**: None  
**Errors**: RateLimitError  

#### RateLimitService (`src/services/rate-limit.service.ts`)
**Dependencies**: None  
**Methods**: consume  
**DB Tables**: None  
**Redis Keys**: `rate:*`  
**External**: None  
**Errors**: Rate limit exceeded  

#### DeviceTrustService (`src/services/device-trust.service.ts`)
**Dependencies**: None  
**Methods**: generateFingerprint, calculateTrustScore, recordDeviceActivity, requiresAdditionalVerification  
**DB Tables**: trusted_devices  
**Redis Keys**: None  
**External**: None  
**Errors**: None  

---

### Alternative Authentication Services

#### WalletService (`src/services/wallet.service.ts`)
**Dependencies**: JWTService  
**Methods**: generateNonce, verifySolanaSignature, verifyEthereumSignature, registerWithWallet, loginWithWallet, linkWallet, unlinkWallet  
**DB Tables**: users, wallet_connections, user_sessions  
**Redis Keys**: `wallet-nonce:*`  
**External**: Solana web3.js, ethers.js  
**Errors**: AuthenticationError (Invalid signature, Nonce expired, Wallet not found)  

#### OAuthService (`src/services/oauth.service.ts`)
**Dependencies**: JWTService  
**Methods**: authenticate, linkProvider, unlinkProvider, handleOAuthLogin (legacy), linkOAuthProvider (legacy)  
**DB Tables**: users, oauth_connections, user_sessions  
**Redis Keys**: None  
**External**: Google OAuth2 API, GitHub API  
**Errors**: AuthenticationError, ValidationError  

#### BiometricService (`src/services/biometric.service.ts`)
**Dependencies**: None  
**Methods**: registerBiometric, verifyBiometric, generateChallenge, listBiometricDevices, removeBiometricDevice, getCredential  
**DB Tables**: biometric_credentials  
**Redis Keys**: `biometric_challenge:*`  
**External**: None (WebAuthn signature verification)  
**Errors**: AuthenticationError  

---

### Infrastructure Services

#### CacheService (`src/services/cache.service.ts`)
**Methods**: get, set, checkLimit  
**DB Tables**: None  
**Redis Keys**: None (in-memory Map)  
**External**: None  
**Errors**: None  

#### cache-integration (`src/services/cache-integration.ts`)
**Purpose**: Redis cache abstraction layer  
**Exports**: sessionCache, userCache, tokenBlacklist, rateLimitCache, getCacheStats  
**DB Tables**: None  
**Redis Keys**: `auth:session:*`, `auth:user:*`, `blacklist:*`, `ratelimit:*`  
**External**: @tickettoken/shared cache system  

#### EmailService (`src/services/email.service.ts`)
**Dependencies**: None  
**Methods**: sendVerificationEmail, sendPasswordResetEmail, sendMFABackupCodesEmail  
**DB Tables**: None  
**Redis Keys**: `email-verify:*`, `password-reset:*`  
**External**: Resend API  
**Errors**: Failed to send email  

#### AuditService (`src/services/audit.service.ts`)
**Methods**: log, logLogin, logRegistration, logPasswordChange, logMFAEnabled, logTokenRefresh, logRoleGrant  
**DB Tables**: audit_logs  
**Redis Keys**: None  
**External**: None  
**Errors**: None (logs failure but doesn't throw)  

#### MonitoringService (`src/services/monitoring.service.ts`)
**Methods**: performHealthCheck, getMetrics, setupMonitoring (Fastify routes)  
**DB Tables**: Uses connection pools for health checks  
**Redis Keys**: None  
**External**: Prometheus metrics format  
**Endpoints**: /health, /metrics, /live, /ready  

---

## Service Summary

**Total Services**: 18  
**Categories**: Core Auth (5), Security (5), Alternative Auth (3), Infrastructure (5)  
**Database Tables Used**: 11 (users, tenants, user_sessions, audit_logs, invalidated_tokens, trusted_devices, user_venue_roles, wallet_connections, oauth_connections, biometric_credentials)  
**Redis Key Patterns**: 15+ patterns for tokens, rate limiting, MFA, caching  
**External Integrations**: Resend (email), Google/GitHub OAuth, Web3 (Solana/Ethereum)  

---

## 5. Middleware

### File: `src/middleware/auth.middleware.ts`
**Purpose**: JWT authentication and RBAC permission enforcement middleware

#### Exports

##### `createAuthMiddleware(jwtService: JWTService, rbacService: RBACService)`
- **Parameters**: `jwtService: JWTService`, `rbacService: RBACService`
- **Returns**: Object with 3 middleware functions

##### Returned Methods:

**`authenticate(request, reply)`**
- **Attaches to request**: `request.user = { id, tenant_id, email, role, permissions }`
- **Rejects when**: 
  - Missing Authorization header → `AuthenticationError: Missing or invalid authorization header`
  - Header doesn't start with "Bearer " → same error
  - Invalid/expired token → `AuthenticationError: Invalid token`

**`requirePermission(permission: string)`**
- **Parameters**: `permission: string` (e.g., 'roles:manage')
- **Returns**: Middleware function
- **Rejects when**:
  - No `request.user` → `AuthenticationError: Authentication required`
  - User lacks permission → `AuthorizationError: Missing required permission: {permission}`

**`requireVenueAccess(request, reply)`**
- **Rejects when**:
  - No `request.user` → `AuthenticationError: Authentication required`
  - No `venueId` in params → `Error: Venue ID required`
  - User has no roles at venue → `AuthorizationError: No access to this venue`

---

### File: `src/middleware/tenant.middleware.ts`
**Purpose**: Multi-tenant isolation and validation middleware

#### Exports

##### `validateTenant(request: FastifyRequest, reply: FastifyReply)`
- **Type**: Async FastifyPreHandler
- **Attaches to request**: Nothing (validates existing `request.user.tenant_id`)
- **Rejects when**:
  - No `request.user` → 401 `AUTH_REQUIRED`
  - No `tenant_id` in JWT → 403 `MISSING_TENANT_ID`

##### `validateResourceTenant(userTenantId: string, resourceTenantId: string)`
- **Parameters**: Two tenant UUIDs to compare
- **Returns**: `boolean` (true if match)

##### `addTenantFilter(tenantId: string)`
- **Parameters**: `tenantId: string`
- **Returns**: `{ tenant_id: tenantId }` for Knex queries

##### `TenantIsolationError` (class)
- **Extends**: `Error`
- **Properties**: `statusCode = 403`, `code = 'TENANT_ISOLATION_VIOLATION'`
- **Used when**: Cross-tenant access is attempted

---

### File: `src/middleware/validation.middleware.ts`
**Purpose**: Request body/query/params validation using Joi schemas

#### Exports

##### `validate(schema: Joi.Schema, source: 'body' | 'query' | 'params' = 'body')`
- **Parameters**: 
  - `schema: Joi.Schema` - Validation schema
  - `source: 'body' | 'query' | 'params'` - Where to get data (default: 'body')
- **Returns**: Middleware function
- **Attaches to request**: Replaces source with validated/stripped data
- **Rejects when**: Validation fails → `statusCode: 400` with errors array
  - `errors: [{ field: string, message: string }]`

---

## 6. Errors

### File: `src/errors/index.ts`
**Purpose**: Custom error classes for auth-service

| Error Class | Status Code | When Used |
|------------|-------------|-----------|
| `AppError` | (base class) | Parent for all custom errors. Properties: `statusCode`, `isOperational = true` |
| `ValidationError` | 422 | Joi validation failures, invalid input format. Has `errors: any[]` property |
| `NotFoundError` | 404 | User, session, or resource not found. Takes `resource` param for message |
| `AuthenticationError` | 401 | Invalid credentials, expired token, missing auth header |
| `AuthorizationError` | 403 | Missing permission, tenant violation, access denied |
| `ConflictError` | 409 | Duplicate email, wallet already registered |
| `RateLimitError` | 429 | Too many requests. Has optional `ttl?: number` property |
| `TokenError` | 401 | Invalid/expired token, token reuse detected |

**All errors have**:
- `statusCode: number`
- `isOperational: boolean = true`
- Stack trace via `Error.captureStackTrace`

---

## 7. Models

### File: `src/models/user.model.ts`
**Purpose**: TypeScript interfaces for database entities

#### `User` Interface (31 fields)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | UUID primary key |
| `email` | string | Unique, lowercase |
| `password_hash` | string | bcrypt hash |
| `first_name` | string | |
| `last_name` | string | |
| `phone` | string? | Optional |
| `email_verified` | boolean | Default false |
| `phone_verified` | boolean | Default false |
| `kyc_status` | 'pending' \| 'verified' \| 'rejected' | |
| `kyc_level` | number | |
| `mfa_enabled` | boolean | Default false |
| `mfa_secret` | string? | TOTP secret |
| `backup_codes` | string[]? | MFA backup codes |
| `created_at` | Date | |
| `updated_at` | Date | |
| `last_login_at` | Date? | |
| `last_login_ip` | string? | IP address |
| `failed_login_attempts` | number | Default 0 |
| `locked_until` | Date? | Account lockout timestamp |
| `password_reset_token` | string? | |
| `password_reset_expires` | Date? | |
| `email_verification_token` | string? | |
| `email_verification_expires` | Date? | |
| `deleted_at` | Date? | Soft delete |
| `deleted_by` | string? | |
| `deletion_reason` | string? | |
| `version` | number | Optimistic locking |

#### `UserVenueRole` Interface

| Field | Type |
|-------|------|
| `id` | string (UUID) |
| `user_id` | string (UUID) |
| `venue_id` | string (UUID) |
| `role` | 'venue-owner' \| 'venue-manager' \| 'box-office' \| 'door-staff' |
| `granted_by` | string (UUID) |
| `granted_at` | Date |
| `expires_at` | Date? |
| `is_active` | boolean |

#### `UserSession` Interface

| Field | Type |
|-------|------|
| `id` | string (UUID) |
| `user_id` | string (UUID) |
| `session_token` | string |
| `ip_address` | string |
| `user_agent` | string |
| `created_at` | Date |
| `expires_at` | Date |
| `revoked_at` | Date? |

#### `LoginAttempt` Interface

| Field | Type |
|-------|------|
| `id` | string (UUID) |
| `email` | string |
| `ip_address` | string |
| `success` | boolean |
| `attempted_at` | Date |
| `failure_reason` | string? |

---

## 8. Utils

### File: `src/utils/logger.ts`
**Purpose**: Winston logger with automatic PII sanitization

#### Exports

##### `logger` (Winston Logger instance)
- Auto-sanitizes all log data using `@tickettoken/shared/PIISanitizer`
- JSON format in production, colorized simple format in development
- Default meta: `{ service: 'auth-service' }`
- Log level from `process.env.LOG_LEVEL` or 'info'

##### `logError(message: string, error: any, meta?: any)`
- Sanitizes error and metadata before logging at error level

##### `logRequest(req: any, meta?: any)`
- Logs sanitized request info at info level

##### `logResponse(req: any, res: any, body?: any, meta?: any)`
- Logs sanitized response info at info level

**Side effects**: Overrides `console.log`, `console.error`, `console.warn` globally to auto-sanitize output

**Used by**: All services and controllers via import

---

### File: `src/utils/metrics.ts`
**Purpose**: Prometheus metrics for monitoring

#### Exports

##### `register` (Prometheus Registry)
- Collects default metrics (CPU, memory, event loop lag, etc.)
- Exposed at `/metrics` endpoint in app.ts

##### `loginAttemptsTotal` (Counter)
- **Name**: `auth_login_attempts_total`
- **Labels**: `status` ('success', 'failure')
- **Used by**: AuthController.login

##### `registrationTotal` (Counter)
- **Name**: `auth_registrations_total`
- **Labels**: `status`
- **Used by**: AuthController.register

##### `tokenRefreshTotal` (Counter)
- **Name**: `auth_token_refresh_total`
- **Labels**: `status`
- **Used by**: AuthController.refreshTokens

##### `authDuration` (Histogram)
- **Name**: `auth_operation_duration_seconds`
- **Labels**: `operation`
- **Used by**: Auth operations timing

---

### File: `src/utils/rateLimiter.ts`
**Purpose**: Redis-based rate limiting utility

#### `RateLimiter` Class

##### Constructor
```typescript
new RateLimiter(keyPrefix: string, options: {
  points: number;       // Number of requests allowed
  duration: number;     // Time window in seconds
  blockDuration?: number; // Block duration after limit (default: duration * 2)
})
```

##### Methods

**`consume(key: string, points = 1): Promise<void>`**
- Increments Redis counter for `{keyPrefix}:{key}`
- Sets TTL on first request
- Throws `RateLimitError` with TTL when limit exceeded or blocked

**`reset(key: string): Promise<void>`**
- Clears rate limit counter and block key

#### Pre-configured Instances

| Instance | Key Prefix | Points | Duration | Block Duration |
|----------|-----------|--------|----------|----------------|
| `loginRateLimiter` | 'login' | 5 | 15 min (900s) | 15 min |
| `registrationRateLimiter` | 'register' | 3 | 1 hour (3600s) | 1 hour |
| `passwordResetRateLimiter` | 'password-reset' | 3 | 1 hour (3600s) | 1 hour |

**Redis Keys**: `{prefix}:{key}` (counter), `{prefix}:{key}:block` (block flag)

**Used by**: auth.routes.ts preHandler hooks

---

### File: `src/utils/sanitize.ts`
**Purpose**: XSS prevention through input sanitization

#### Exports

##### `stripHtml(input: string): string`
- Removes all HTML tags using regex: `/<[^>]*>/g`
- Returns trimmed string
- Safe for non-string input (returns unchanged)

##### `escapeHtml(input: string): string`
- Escapes HTML special characters:
  - `&` → `&amp;`
  - `<` → `&lt;`
  - `>` → `&gt;`
  - `"` → `&quot;`
  - `'` → `&#x27;`

##### `sanitizeName(input: string): string`
- Alias for `stripHtml()` - use for firstName, lastName, displayName

##### `sanitizeObject<T>(obj: T, fields: string[]): T`
- Strips HTML from specified string fields in object
- Returns sanitized copy (original unchanged)

##### `USER_SANITIZE_FIELDS` (Constant)
```typescript
['firstName', 'lastName', 'first_name', 'last_name', 'display_name', 'bio', 'username']
```

**Used by**: 
- `AuthService.register()` - sanitizes firstName, lastName
- `ProfileController.updateProfile()` - sanitizes profile fields

---

## Summary Statistics

| Category | Files | Exports |
|----------|-------|---------|
| Middleware | 3 | 7 functions + 1 class |
| Errors | 1 | 8 error classes |
| Models | 1 | 4 interfaces |
| Utils | 4 | 4 logger exports, 4 metrics, 1 class + 3 instances, 5 sanitize functions |

---

## 9. Config

### File: `src/config/database.ts`
**Purpose**: PostgreSQL pool and Knex instance configuration

#### Exports
- `pool` - pg Pool instance (max 5 connections, 30s idle timeout, 10s connection timeout)
- `db` - Knex instance with pg client (min 1, max 5 connections)

#### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | 'localhost' | Database host |
| `DB_PORT` | '6432' | Database port (PgBouncer) |
| `DB_NAME` | 'tickettoken_db' | Database name |
| `DB_USER` | 'postgres' | Database user |
| `DB_PASSWORD` | 'postgres' | Database password |

**Features**: Sets search_path to 'public' on each connection

---

### File: `src/config/dependencies.ts`
**Purpose**: Awilix dependency injection container setup

#### Exports
- `createDependencyContainer()` - Factory function returning configured container
- `Container` type - Container return type
- `Cradle` type - Container cradle type

#### Registered Dependencies
| Category | Services |
|----------|----------|
| Config | `env`, `db`, `redis` |
| Core Auth | `jwtService`, `authService`, `authExtendedService`, `rbacService`, `mfaService` |
| Alt Auth | `walletService`, `oauthService`, `biometricService` |
| Security | `rateLimitService`, `deviceTrustService` |
| Supporting | `emailService`, `lockoutService`, `auditService`, `monitoringService` |

**Injection Mode**: CLASSIC (constructor parameter injection)

---

### File: `src/config/env.ts`
**Purpose**: Environment variable validation and typed configuration

#### Exports
- `EnvConfig` interface - Full type definition for all env vars
- `env` - Validated environment configuration object

#### Environment Variables

**Server**:
| Variable | Type | Default |
|----------|------|---------|
| `NODE_ENV` | 'development' \| 'test' \| 'staging' \| 'production' | 'development' |
| `PORT` | number | 3001 |
| `LOG_LEVEL` | string | 'info' |

**Database**: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (required in production)

**Redis**: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD

**JWT (RS256)**:
| Variable | Default |
|----------|---------|
| `JWT_ISSUER` | 'tickettoken-auth' |
| `JWT_ACCESS_EXPIRES_IN` | '15m' |
| `JWT_REFRESH_EXPIRES_IN` | '7d' |
| `JWT_PRIVATE_KEY_PATH` | ~/tickettoken-secrets/jwt-private.pem |
| `JWT_PUBLIC_KEY_PATH` | ~/tickettoken-secrets/jwt-public.pem |

**OAuth - Google**: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

**OAuth - GitHub**: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI

**OAuth - Apple**: APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID

**Security**:
| Variable | Default |
|----------|---------|
| `BCRYPT_ROUNDS` | 12 |
| `LOCKOUT_MAX_ATTEMPTS` | 5 |
| `LOCKOUT_DURATION_MINUTES` | 15 |
| `ENCRYPTION_KEY` | (required in production) |

**MFA**: MFA_ISSUER ('TicketToken'), MFA_WINDOW (2)

**Email**: RESEND_API_KEY (required in production), EMAIL_FROM

**Service URLs**: API_GATEWAY_URL, VENUE_SERVICE_URL, NOTIFICATION_SERVICE_URL

**Validation**: Throws on missing required vars; RESEND_API_KEY required in production

---

### File: `src/config/logger.ts`
**Purpose**: Pino logger configuration with component child loggers

#### Exports
- `logger` - Base pino logger instance
- `dbLogger` - Database component logger
- `redisLogger` - Redis component logger
- `authLogger` - Auth component logger
- `apiLogger` - API component logger
- `auditLogger` - Security audit events logger (always at 'info' level)
- `logWithContext(context, message, extra?)` - Helper function
- `createRequestLogger()` - Middleware factory for request logging

**Features**:
- ISO timestamps
- Pretty printing in development (pino-pretty)
- JSON format in production
- Base metadata: service, environment, version

---

### File: `src/config/oauth.ts`
**Purpose**: OAuth provider configuration objects

#### Exports
- `oauthConfig` - Object with provider configurations:
  ```typescript
  {
    google: { clientId, clientSecret, redirectUri },
    github: { clientId, clientSecret, redirectUri },
    facebook: { clientId, clientSecret, redirectUri }
  }
  ```
- `oauthProviders` - Array: `['google', 'github', 'facebook']`

#### Environment Variables
- GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
- GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI
- FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET, FACEBOOK_REDIRECT_URI

---

### File: `src/config/redis.ts`
**Purpose**: Redis client configuration with pub/sub support

#### Exports
- `redis` - Main ioredis client instance
- `redisPub` - Duplicate client for publishing
- `redisSub` - Duplicate client for subscribing
- `closeRedisConnections()` - Async function for graceful shutdown

#### Environment Variables
| Variable | Default |
|----------|---------|
| `REDIS_HOST` | 'redis' |
| `REDIS_PORT` | 6379 |
| `REDIS_PASSWORD` | undefined |

**Features**:
- Retry strategy with exponential backoff (max 2s)
- Max 3 retries per request
- Ready check enabled
- Offline queue enabled
- Event handlers for connect, error, ready

---

### File: `src/config/secrets.ts`
**Purpose**: AWS Secrets Manager integration for sensitive configuration

#### Exports
- `loadSecrets()` - Async function returning fetched secrets

#### Secrets Loaded
- `POSTGRES_PASSWORD`
- `POSTGRES_USER`
- `POSTGRES_DB`
- `REDIS_PASSWORD`

#### Dependencies
- `@tickettoken/shared/utils/secrets-manager`
- `@tickettoken/shared/config/secrets.config`

**Environment Variables**: SERVICE_NAME (for logging)

---

### File: `src/config/swagger.ts`
**Purpose**: OpenAPI/Swagger documentation configuration

#### Exports
- `swaggerOptions` - OpenAPI spec configuration:
  - Title: 'TicketToken Auth Service API'
  - Version: '1.0.0'
  - Security: Bearer JWT
  - Tags: auth, mfa, roles
- `swaggerUiOptions` - Swagger UI settings:
  - Route prefix: '/docs'
  - Doc expansion: 'list'
  - Deep linking enabled

#### Environment Variables
- `AUTH_SERVICE_URL` (default: 'http://auth-service:3001')

---

## 10. Migrations

### File: `src/migrations/001_auth_baseline.ts`
**Purpose**: Creates all auth-service database tables, indexes, triggers, and functions

#### Tables Created (11)

| Table | Columns | Purpose |
|-------|---------|---------|
| `tenants` | id, name, slug, status, settings, created_at, updated_at | Multi-tenancy |
| `users` | 66 columns | Core user data |
| `user_sessions` | id, user_id, started_at, ended_at, ip_address, user_agent, revoked_at, metadata | Session tracking |
| `user_venue_roles` | id, user_id, venue_id, role, granted_by, is_active, expires_at, granted_at, revoked_at, revoked_by | RBAC |
| `audit_logs` | id, service, action, action_type, user_id, resource_type, resource_id, table_name, record_id, changed_fields, old_data, new_data, metadata, ip_address, user_agent, success, error_message | Audit trail |
| `invalidated_tokens` | token (PK), user_id, invalidated_at, expires_at | Token blacklist |
| `token_refresh_log` | id, user_id, ip_address, user_agent, refreshed_at, metadata | Refresh tracking |
| `oauth_connections` | id, user_id, provider, provider_user_id, profile_data, created_at, updated_at | OAuth links |
| `wallet_connections` | id, user_id, wallet_address, network, verified, last_login_at, created_at | Web3 wallets |
| `biometric_credentials` | id, user_id, device_id, public_key, credential_type, created_at | WebAuthn creds |
| `trusted_devices` | id, user_id, device_fingerprint, trust_score, last_seen, created_at | Device trust |

#### Users Table Key Columns (66 total)
- **Identity**: id, email, password_hash, username, display_name
- **Profile**: first_name, last_name, bio, avatar_url, date_of_birth, phone
- **Location**: country_code, city, state_province, postal_code, timezone
- **Status**: status (PENDING/ACTIVE/SUSPENDED/DELETED), role, permissions, is_active
- **MFA**: two_factor_enabled, two_factor_secret, backup_codes, mfa_enabled, mfa_secret
- **Password**: last_password_change, password_reset_token, password_reset_expires
- **Login**: last_login_at, last_login_ip, login_count, failed_login_attempts, locked_until
- **Settings**: preferences (JSONB), notification_preferences, privacy_settings
- **Legal**: terms_accepted_at, privacy_accepted_at, marketing_consent
- **Referrals**: referral_code, referred_by, referral_count
- **Financial**: lifetime_value, total_spent, events_attended, ticket_purchase_count
- **OAuth**: provider, provider_user_id
- **Web3**: wallet_address, network, verified
- **Metadata**: metadata (JSONB), tags, tenant_id
- **Timestamps**: created_at, updated_at, deleted_at

#### Functions Created (3)
- `update_updated_at_column()` - Auto-update timestamp on row update
- `generate_user_referral_code()` - Generate unique 8-char referral code
- `increment_referral_count()` - Increment referrer's count when referred user verifies email

#### Triggers (3)
- `trigger_generate_referral_code` - BEFORE INSERT on users
- `trigger_increment_referral_count` - AFTER UPDATE on users.email_verified
- `trigger_update_users_timestamp` - BEFORE UPDATE on users

#### Indexes (20+)
- Standard: email, username, phone, role, status, deleted_at, country_code, referral_code
- Composite: role+status, status+created_at
- GIN (JSONB): metadata, permissions, preferences
- Full-text search: username, display_name, first_name, last_name, email

#### Constraints
- `check_email_lowercase` - email must be lowercase
- `check_username_format` - ^[a-zA-Z0-9_]{3,30}$
- `check_referral_not_self` - referred_by cannot equal id
- `check_age_minimum` - date_of_birth must be >= 13 years ago
- `users_status_check` - status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED')

#### Default Data
- Inserts default tenant: `00000000-0000-0000-0000-000000000001`

---

## 11. Application Bootstrap

### File: `src/app.ts`
**Purpose**: Fastify application builder with plugins and routes

#### Exports
- `buildApp()` - Async function returning configured FastifyInstance

#### Bootstrap Process
1. **Create Fastify** with options:
   - Logger: pino with level from env, pino-pretty in development
   - `trustProxy: true`
   - `requestIdHeader: 'x-request-id'`
   - `disableRequestLogging: false`

2. **Register Plugins**:
   - `@fastify/cors` - origin: true, credentials: true
   - `@fastify/helmet` - CSP disabled
   - `@fastify/csrf-protection` - Signed cookies, httpOnly, secure in production
   - `@fastify/rate-limit` - Global disabled, max 100 per 15 min

3. **Create Dependency Container** via `createDependencyContainer()`

4. **Register Routes**:
   - `GET /health` → `{ status: 'healthy', service: 'auth-service', timestamp }`
   - `GET /metrics` → Prometheus metrics from prom-client
   - `authRoutes` at `/auth` prefix

5. **Global Error Handler** mapping:
   - CSRF errors → 403
   - Rate limit (429) → 429
   - Validation (422) → 422
   - Conflict (already exists) → 409
   - Auth failures → 401
   - Fastify validation → 400
   - Default → 500

---

### File: `src/index.ts`
**Purpose**: Main service entry point

#### Bootstrap Flow
1. Test database: `await pool.query('SELECT NOW()')`
2. Test Redis: `await redis.ping()`
3. Build app: `await buildApp()`
4. Start server: `await app.listen({ port: env.PORT, host: '0.0.0.0' })`
5. Register shutdown handlers for SIGTERM, SIGINT

#### Graceful Shutdown
```
SIGTERM/SIGINT received →
  app.close() →
  pool.end() →
  closeRedisConnections() →
  process.exit(0)
```

**Default Port**: 3001

---

### File: `src/index-with-secrets.ts`
**Purpose**: Alternative entry point with AWS Secrets Manager

#### Bootstrap Flow
1. Load dotenv from project root (`../../../../.env`)
2. Call `loadSecrets()` from config/secrets
3. Log loaded secrets (redacted for security)
4. Service started confirmation

**Use Case**: Production environments using AWS Secrets Manager

---

### File: `src/types.ts`
**Purpose**: Shared TypeScript type definitions

#### Type Definitions

```typescript
interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;          // User UUID
    email: string;       // User email
    role?: string;       // User role (optional)
    tenant_id?: string;  // Tenant UUID (optional)
    permissions?: string[]; // Permission array (optional)
  };
}
```

**Used by**: All controllers and middleware that access `request.user`

---

## Config Summary

| Category | Files | Key Exports |
|----------|-------|-------------|
| Database | 1 | pool, db (Knex) |
| DI Container | 1 | createDependencyContainer(), Container, Cradle |
| Environment | 1 | env, EnvConfig |
| Logging | 1 | logger + 4 child loggers + helpers |
| OAuth | 1 | oauthConfig, oauthProviders |
| Redis | 1 | redis + pub/sub + close function |
| Secrets | 1 | loadSecrets() |
| Swagger | 1 | swaggerOptions, swaggerUiOptions |

**Total Environment Variables**: ~50

---

```markdown
## 12. Inter-Service Communication Map

### External HTTP Calls Made by Auth Service

| Service/API | URL | Method | Called From | Purpose |
|-------------|-----|--------|-------------|---------|
| **Google OAuth2** | Google OAuth2 Library | POST | `OAuthService.exchangeGoogleCode()` | Exchange auth code for tokens via `google-auth-library` |
| **Google Token Verify** | Google OAuth2 Library | POST | `OAuthService.exchangeGoogleCode()` | Verify ID token and get user profile |
| **GitHub OAuth** | `https://github.com/login/oauth/access_token` | POST | `OAuthService.exchangeGitHubCode()` | Exchange auth code for access token |
| **GitHub User API** | `https://api.github.com/user` | GET | `OAuthService.exchangeGitHubCode()` | Get user profile (id, name, avatar) |
| **GitHub Emails API** | `https://api.github.com/user/emails` | GET | `OAuthService.exchangeGitHubCode()` | Get user email if not public |
| **Resend Email API** | `https://api.resend.com/emails` | POST | `EmailService.sendEmail()` | Send emails (production only) |

### Service URL Configuration (Not Currently Used for HTTP Calls)

| Service | Environment Variable | Default Value | Notes |
|---------|---------------------|---------------|-------|
| API Gateway | `API_GATEWAY_URL` | `http://api-gateway:3000` | Used in email links (verify, reset) |
| Venue Service | `VENUE_SERVICE_URL` | `http://venue-service:3002` | Configured but not actively called |
| Notification Service | `NOTIFICATION_SERVICE_URL` | `http://notification-service:3008` | Configured but not actively called |

### OAuth Provider Configuration

| Provider | Client ID Env | Client Secret Env | Redirect URI Env |
|----------|--------------|-------------------|------------------|
| Google | `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_SECRET` | `GOOGLE_REDIRECT_URI` |
| GitHub | `GITHUB_CLIENT_ID` | `GITHUB_CLIENT_SECRET` | `GITHUB_REDIRECT_URI` |
| Apple | `APPLE_CLIENT_ID` | `APPLE_TEAM_ID`, `APPLE_KEY_ID` | N/A |

---

## 13. Database ERD / Relationships

### Entity Relationship Diagram (ASCII)
```

┌─────────────┐ │ tenants │ │─────────────│ │ id (PK) │ │ name │ │ slug │ │ status │ │ settings │ └─────┬───────┘ │ │ 1:N ▼ ┌─────────────────────────────────────────────────────────────────────────┐ │ users │ │─────────────────────────────────────────────────────────────────────────│ │ id (PK) │ email │ tenant_id (FK) │ referred_by (FK self) │ ... 66 cols │ └────┬────┴───────┴────────────────┴───────────────────────┴──────────────┘ │ │ 1:N (CASCADE DELETE on all child tables) ├──────────────────┬──────────────────┬──────────────────┬────────────────────┐ ▼ ▼ ▼ ▼ ▼ ┌────────────────┐ ┌──────────────┐ ┌──────────────────┐ ┌─────────────────┐ ┌──────────────┐ │ user_sessions │ │ audit_logs │ │ user_venue_roles │ │ oauth_connections│ │wallet_connect│ │────────────────│ │──────────────│ │──────────────────│ │─────────────────│ │──────────────│ │ id (PK) │ │ id (PK) │ │ id (PK) │ │ id (PK) │ │ id (PK) │ │ user_id (FK) │ │ user_id (FK) │ │ user_id (FK) │ │ user_id (FK) │ │ user_id (FK) │ │ started_at │ │ action │ │ venue_id │ │ provider │ │ wallet_addr │ │ ended_at │ │ resource_type│ │ role │ │ provider_user_id│ │ network │ │ ip_address │ │ ip_address │ │ granted_by (FK) │ │ profile_data │ │ verified │ │ user_agent │ │ metadata │ │ revoked_by (FK) │ │ created_at │ │ last_login_at│ │ revoked_at │ │ success │ │ is_active │ └─────────────────┘ └──────────────┘ └────────────────┘ └──────────────┘ │ expires_at │ └──────────────────┘ │ ├──────────────────┬──────────────────┬──────────────────┐ ▼ ▼ ▼ ▼ ┌──────────────────┐ ┌──────────────────┐ ┌────────────────┐ ┌─────────────────┐ │biometric_credent │ │ trusted_devices │ │invalidated_tok │ │token_refresh_log│ │──────────────────│ │──────────────────│ │────────────────│ │─────────────────│ │ id (PK) │ │ id (PK) │ │ token (PK) │ │ id (PK) │ │ user_id (FK) │ │ user_id (FK) │ │ user_id (FK) │ │ user_id (FK) │ │ device_id │ │ device_fingerprnt│ │ invalidated_at │ │ refreshed_at │ │ public_key │ │ trust_score │ │ expires_at │ │ ip_address │ │ credential_type │ │ last_seen │ └────────────────┘ │ user_agent │ └──────────────────┘ └──────────────────┘ └─────────────────┘

````javascript

### Foreign Key Relationships Table

| Child Table | FK Column | Parent Table | Parent Column | On Delete |
|-------------|-----------|--------------|---------------|-----------|
| `users` | `tenant_id` | `tenants` | `id` | (none) |
| `users` | `referred_by` | `users` | `id` | (self-ref) |
| `user_sessions` | `user_id` | `users` | `id` | CASCADE |
| `user_venue_roles` | `user_id` | `users` | `id` | CASCADE |
| `user_venue_roles` | `granted_by` | `users` | `id` | (none) |
| `user_venue_roles` | `revoked_by` | `users` | `id` | (none) |
| `audit_logs` | `user_id` | `users` | `id` | SET NULL |
| `invalidated_tokens` | `user_id` | `users` | `id` | CASCADE |
| `token_refresh_log` | `user_id` | `users` | `id` | CASCADE |
| `oauth_connections` | `user_id` | `users` | `id` | CASCADE |
| `wallet_connections` | `user_id` | `users` | `id` | CASCADE |
| `biometric_credentials` | `user_id` | `users` | `id` | CASCADE |
| `trusted_devices` | `user_id` | `users` | `id` | CASCADE |

---

## 14. Example Payloads

### OAuth Flows

#### Google OAuth Callback
**POST** `/auth/oauth/google/callback`

Request:
```json
{
  "code": "4/0AX4XfWh...<google_auth_code>",
  "tenant_id": "00000000-0000-0000-0000-000000000001"
}
````

Response (Success):

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@gmail.com",
    "firstName": "John",
    "lastName": "Doe",
    "emailVerified": true,
    "tenant_id": "00000000-0000-0000-0000-000000000001"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIs..."
  },
  "sessionId": "660e8400-e29b-41d4-a716-446655440001",
  "provider": "google"
}
```

#### GitHub OAuth Callback

__POST__ `/auth/oauth/github/callback`

Request:

```json
{
  "code": "abc123def456...<github_auth_code>",
  "tenant_id": "00000000-0000-0000-0000-000000000001"
}
```

Response: Same structure as Google

---

### Wallet Authentication

#### Request Nonce

__POST__ `/auth/wallet/nonce`

Request:

```json
{
  "publicKey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "chain": "solana"
}
```

Response:

```json
{
  "nonce": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
  "message": "Sign this message to authenticate with TicketToken\nNonce: a1b2c3d4...\nTimestamp: 1701936000000"
}
```

#### Wallet Register

__POST__ `/auth/wallet/register`

Request:

```json
{
  "publicKey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "signature": "3AhUobXv...base58_encoded_signature",
  "nonce": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
  "chain": "solana",
  "tenant_id": "00000000-0000-0000-0000-000000000001"
}
```

Response:

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "wallet-7xkxtg2cw87d97tj@internal.wallet",
    "email_verified": true,
    "mfa_enabled": false,
    "tenant_id": "00000000-0000-0000-0000-000000000001"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIs..."
  },
  "wallet": {
    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "chain": "solana",
    "connected": true
  }
}
```

#### Wallet Login

__POST__ `/auth/wallet/login`

Request:

```json
{
  "publicKey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "signature": "3AhUobXv...base58_encoded_signature",
  "nonce": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
  "chain": "solana"
}
```

Response: Same structure as Wallet Register

---

### Biometric Authentication

#### Generate Challenge

__POST__ `/auth/biometric/challenge`

Request:

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Response:

```json
{
  "challenge": "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b"
}
```

#### Register Biometric

__POST__ `/auth/biometric/register` (Authenticated)

Request:

```json
{
  "publicKey": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCA...",
  "deviceId": "iPhone-14-Pro-A1B2C3D4",
  "biometricType": "faceId"
}
```

Response:

```json
{
  "success": true,
  "credentialId": "770e8400-e29b-41d4-a716-446655440002",
  "type": "faceId"
}
```

#### Authenticate with Biometric

__POST__ `/auth/biometric/authenticate`

Request:

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "credentialId": "770e8400-e29b-41d4-a716-446655440002",
  "signature": "sha256_hash_of_challenge_and_public_key",
  "challenge": "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b"
}
```

Response:

```json
{
  "valid": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### MFA Setup & Verification

#### MFA Setup

__POST__ `/auth/mfa/setup` (Authenticated)

Request: No body required

Response:

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
}
```

#### Verify MFA Setup

__POST__ `/auth/mfa/verify-setup` (Authenticated)

Request:

```json
{
  "token": "123456"
}
```

Response:

```json
{
  "backupCodes": [
    "A1B2-C3D4",
    "E5F6-G7H8",
    "I9J0-K1L2",
    "M3N4-O5P6",
    "Q7R8-S9T0",
    "U1V2-W3X4",
    "Y5Z6-A7B8",
    "C9D0-E1F2",
    "G3H4-I5J6",
    "K7L8-M9N0"
  ]
}
```

#### Verify MFA Token

__POST__ `/auth/mfa/verify` (Authenticated)

Request:

```json
{
  "token": "654321"
}
```

Response:

```json
{
  "valid": true
}
```

---

### Token Refresh

__POST__ `/auth/refresh`

Request:

```json
{
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1NTBlODQwMC..."
}
```

Response:

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU1MGU4NDAw...",
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1NTBlODQwMC..."
}
```

---

## 15. Environment-Specific Behavior

### Behavior by Environment

| Feature | Development | Test | Production | |---------|-------------|------|------------| | __Email Sending__ | Console log only | Console log only | Resend API | | __Logger Format__ | pino-pretty (colorized) | pino-pretty | JSON format | | __CSRF Secure Cookie__ | `false` | `false` | `true` | | __RESEND_API_KEY__ | Optional (placeholder) | Optional (placeholder) | Required | | __JWT Keys__ | Default path | Default path | Must configure | | __Rate Limiting__ | Enabled | Enabled | Enabled |

### Email Service Environment Check

From `email.service.ts`:

```typescript
if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
  console.log('📧 Email would be sent:', { to, subject, preview });
  return; // Don't send real email
}
// Production: send via Resend API
```

### Environment Variables That Change Behavior

| Variable | Effect When Changed | |----------|---------------------| | `NODE_ENV` | Controls email sending, logger format, CSRF cookies | | `LOG_LEVEL` | Controls pino verbosity (debug, info, warn, error) | | `ENABLE_SWAGGER` | Enables/disables Swagger UI at `/docs` | | `BCRYPT_ROUNDS` | Password hashing rounds (higher = slower but more secure) | | `MFA_WINDOW` | TOTP time window for verification (default: 2 = ±60 seconds) | | `LOCKOUT_MAX_ATTEMPTS` | Failed logins before lockout (default: 5) | | `LOCKOUT_DURATION_MINUTES` | Lockout duration (default: 15) |

### Rate Limiting Configuration

__RateLimiter Utility__ (`utils/rateLimiter.ts`): | Limiter | Points | Duration | Block Duration | |---------|--------|----------|----------------| | `loginRateLimiter` | 5 attempts | 15 minutes | 15 minutes | | `registrationRateLimiter` | 3 attempts | 1 hour | 1 hour | | `passwordResetRateLimiter` | 3 attempts | 1 hour | 1 hour |

__RateLimitService__ (`services/rate-limit.service.ts`): | Action | Points | Duration | |--------|--------|----------| | `login` | 5 | 60 seconds | | `register` | 3 | 300 seconds | | `wallet` | 10 | 60 seconds |

### What Gets Mocked in Test Mode

- Email sending (console logged instead)
- No actual external OAuth API calls should be made in unit tests
- Redis operations should use test instance or mock

---

## 16. Biometric Edge Cases & Platform Considerations

### Current Implementation Notes

__Signature Verification (Simplified)__: The current implementation uses SHA256 hash for signature verification rather than full WebAuthn:

```typescript
const expectedSignature = crypto
  .createHash('sha256')
  .update(challenge + credential.public_key)
  .digest('hex');
const valid = signature === expectedSignature;
```

This is a __simplified implementation__ - production WebAuthn verification would use the actual WebAuthn specification.

### Challenge Handling

| Aspect | Implementation | |--------|----------------| | __Challenge Generation__ | `crypto.randomBytes(32).toString('hex')` | | __Challenge TTL__ | 300 seconds (5 minutes) in Redis | | __Challenge Storage__ | Redis key: `biometric_challenge:{userId}` | | __One-Time Use__ | Challenge deleted after verification attempt |

### Supported Biometric Types

| Type | Value | Platform | |------|-------|----------| | Face ID | `faceId` | iOS 11+, macOS | | Touch ID | `touchId` | iOS, macOS with Touch Bar | | Fingerprint | `fingerprint` | Android, Windows Hello |

### Edge Cases to Handle in Tests

1. __Expired Challenge__

   - Challenge not found in Redis (TTL expired)
   - Error: `AuthenticationError: Challenge expired or not found`

2. __Invalid Challenge__

   - Provided challenge doesn't match stored
   - Error: `AuthenticationError: Invalid challenge`

3. __Duplicate Device Registration__

   - Same user + device_id already exists
   - Error: `AuthenticationError: Device already registered`

4. __Credential Not Found__

   - credentialId doesn't exist for user
   - Error: `AuthenticationError: Biometric credential not found`

5. __Invalid Signature__

   - Signature doesn't match expected hash
   - Error: `AuthenticationError: Invalid biometric signature`

### Browser/Platform Compatibility Notes

| Browser | WebAuthn Support | Notes | |---------|-----------------|-------| | Chrome 67+ | ✅ Full | Best support | | Firefox 60+ | ✅ Full | | | Safari 13+ | ✅ Full | macOS, iOS | | Edge 79+ | ✅ Full | Chromium-based | | Mobile Safari | ✅ | iOS 14.5+ for Face ID | | Chrome Android | ✅ | Fingerprint, Face unlock |

### Platform Authenticator Differences

| Platform | Authenticator Type | Storage | |----------|-------------------|---------| | iOS | Platform (Face ID/Touch ID) | Secure Enclave | | macOS | Platform (Touch ID) | Secure Enclave | | Android | Platform (Biometric) | TEE/StrongBox | | Windows | Windows Hello | TPM | | Cross-platform | Security Key (USB/NFC) | Hardware token |

### Test Considerations

1. __Mock Signature Generation__:

   ```typescript
   const mockSignature = crypto
     .createHash('sha256')
     .update(challenge + publicKey)
     .digest('hex');
   ```

2. __Redis Required__: Biometric flow requires Redis for challenge storage

3. __Device ID Uniqueness__: Each device_id must be unique per user

4. __No Counter Implementation__: Current implementation lacks credential counter for replay protection (WebAuthn spec recommends this)

5. __Public Key Size__: Max 2048 characters per validator schema

```
```

