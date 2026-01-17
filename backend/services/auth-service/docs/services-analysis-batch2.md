# Auth Service Services Analysis - Batch 2
## MFA, External Auth, Identity
## Purpose: Integration Testing Documentation
## Source: mfa.service.ts, biometric.service.ts, device-trust.service.ts, oauth.service.ts, wallet.service.ts, captcha.service.ts, key-rotation.service.ts
## Generated: 2026-01-15

---

## 1. mfa.service.ts (MFAService)

### DATABASE OPERATIONS
| Operation | Table | Columns/Conditions |
|-----------|-------|-------------------|
| SELECT | `users` | `WHERE id = $1` (various methods) |
| UPDATE | `users` | `mfa_enabled = true, mfa_secret = $1, backup_codes = $2 WHERE id = $3` |
| UPDATE | `users` | `backup_codes = $1 WHERE id = $2` (on code use/regenerate) |
| UPDATE | `users` | `mfa_enabled = false, mfa_secret = null, backup_codes = null, updated_at = $1 WHERE id = $2` (disable) |

### REDIS OPERATIONS
| Method | Key Pattern | Operation | TTL |
|--------|-------------|-----------|-----|
| `setupTOTP` | `mfa:setup:{userId}` or `tenant:{tenantId}:mfa:setup:{userId}` | SETEX | 600s (10 min) |
| `verifyAndEnableTOTP` | `mfa:setup:{userId}` or `tenant:{tenantId}:mfa:setup:{userId}` | GET + DEL | - |
| `verifyTOTP` | `tenant:{tenantId}:mfa:recent:{userId}:{token}` | GET + SETEX | 90s |
| `requireMFAForOperation` | `tenant:{tenantId}:mfa:verified:{userId}` | GET | - |
| `markMFAVerified` | `tenant:{tenantId}:mfa:verified:{userId}` | SETEX | 300s (5 min) |
| `disableTOTP` | Multiple cleanup patterns | DEL | - |

### CRYPTOGRAPHIC OPERATIONS
| Operation | Library | Details |
|-----------|---------|---------|
| TOTP Secret Generation | speakeasy | `speakeasy.generateSecret({ length: 32 })` |
| TOTP Verification | speakeasy | `speakeasy.totp.verify({ window: 1-2 })` |
| QR Code Generation | qrcode | `QRCode.toDataURL(otpauthUrl)` |
| Backup Code Generation | crypto | `crypto.randomBytes(4).toString('hex')` × 10 codes |
| Backup Code Hashing | crypto | `crypto.createHash('sha256')` |
| Secret Encryption | crypto | AES-256-GCM with `env.ENCRYPTION_KEY` |
| Password Verification | bcrypt | `bcrypt.compare()` for disableTOTP |

### TIME-SENSITIVE LOGIC
| Timing | Value | Purpose |
|--------|-------|---------|
| MFA Setup TTL | 600s (10 min) | Secret expires in Redis |
| Idempotency Window | 5 min | Same secret returned if setup within window |
| Recent Token TTL | 90s | Prevent token replay |
| MFA Verified TTL | 300s (5 min) | High-security operation window |
| TOTP Window | 1-2 | 30-60 second tolerance |

### ERROR HANDLING
| Error | Condition |
|-------|-----------|
| Error | 'User not found' |
| Error | 'MFA is already enabled for this account' |
| Error | 'MFA setup expired or not found' |
| AuthenticationError | 'Invalid MFA token' |
| AuthenticationError | 'MFA token recently used' |
| AuthenticationError | 'MFA required for this operation' |
| Error | 'MFA is not enabled for this account' |
| Error | 'Invalid password' (for disable) |

### SERVICE DEPENDENCIES
- Rate limiters: `otpRateLimiter`, `mfaSetupRateLimiter`, `backupCodeRateLimiter`

### SENSITIVE OPERATIONS (Require MFA)
```
withdraw:funds, update:bank-details, delete:venue,
export:customer-data, disable:mfa
```

---

## 2. biometric.service.ts (BiometricService)

### DATABASE OPERATIONS
| Operation | Table | Columns/Conditions |
|-----------|-------|-------------------|
| SELECT | `biometric_credentials` | `WHERE user_id = $1 AND tenant_id = $2 AND device_id = $3` |
| INSERT | `biometric_credentials` | `id, user_id, tenant_id, device_id, public_key, credential_type, created_at` |
| SELECT | `biometric_credentials` | `WHERE id = $1 AND user_id = $2 AND tenant_id = $3` |
| SELECT | `biometric_credentials` | `SELECT id, device_id, credential_type, created_at WHERE user_id AND tenant_id` |
| DELETE | `biometric_credentials` | `WHERE id = $1 AND user_id = $2 AND tenant_id = $3` |

### REDIS OPERATIONS
| Method | Key Pattern | Operation | TTL |
|--------|-------------|-----------|-----|
| `generateChallenge` | `tenant:{tenantId}:biometric_challenge:{userId}` | SETEX | 300s (5 min) |
| `verifyBiometric` | `tenant:{tenantId}:biometric_challenge:{userId}` | GET + DEL | - |
| Fallback | `biometric_challenge:{userId}` | GET + DEL | - |

### CRYPTOGRAPHIC OPERATIONS
| Operation | Library | Details |
|-----------|---------|---------|
| Challenge Generation | crypto | `crypto.randomBytes(32).toString('hex')` |
| Credential ID | crypto | `crypto.randomUUID()` |
| Signature Verification | crypto | `crypto.createHash('sha256').update(challenge + publicKey)` |

### ERROR HANDLING
| Error | Condition |
|-------|-----------|
| AuthenticationError | 'Device already registered' |
| AuthenticationError | 'Challenge expired or not found' |
| AuthenticationError | 'Invalid challenge' |
| AuthenticationError | 'Biometric credential not found' |
| AuthenticationError | 'Invalid biometric signature' |

### BIOMETRIC TYPES
- `faceId`, `touchId`, `fingerprint`

---

## 3. device-trust.service.ts (DeviceTrustService)

### DATABASE OPERATIONS
| Operation | Table | Columns/Conditions |
|-----------|-------|-------------------|
| SELECT | `trusted_devices` | `WHERE user_id = $1 AND device_fingerprint = $2 AND tenant_id = $3` |
| INSERT | `trusted_devices` | `user_id, tenant_id, device_fingerprint, trust_score, last_seen` |
| UPDATE | `trusted_devices` | `trust_score = $1, last_seen = $2 WHERE id = $3` |

### REDIS OPERATIONS
None

### CRYPTOGRAPHIC OPERATIONS
| Operation | Library | Details |
|-----------|---------|---------|
| Fingerprint Generation | crypto | `crypto.createHash('sha256').update(components.join('|'))` |

### FINGERPRINT COMPONENTS
- `user-agent`, `accept-language`, `accept-encoding`, `ip`

### TRUST SCORE CALCULATION
| Factor | Points |
|--------|--------|
| Base score | 50 |
| Age bonus (per 10 days, max 20) | +2 per 10 days |
| Last seen < 1 day | +30 |
| Last seen < 7 days | +20 |
| Last seen < 30 days | +10 |
| Success bonus | +5 |
| Failure penalty | -10 |

### TIME-SENSITIVE LOGIC
- Trust threshold: score < 30 requires additional verification
- Max score: 100

---

## 4. oauth.service.ts (OAuthService)

### DATABASE OPERATIONS
| Operation | Table | Columns/Conditions |
|-----------|-------|-------------------|
| SELECT | `oauth_connections` JOIN `users` | `WHERE provider = $1 AND provider_user_id = $2 AND tenant_id = $3` |
| UPDATE | `oauth_connections` | `SET profile_data = $1, updated_at = NOW() WHERE provider = $2 AND provider_user_id = $3` |
| UPDATE | `users` | `SET first_name, last_name, avatar_url, last_login_at, updated_at WHERE id = $1` |
| SELECT | `users` | `WHERE email = $1 AND tenant_id = $2` |
| INSERT | `users` | Full user record for new OAuth user |
| INSERT | `oauth_connections` | `id, user_id, tenant_id, provider, provider_user_id, profile_data, created_at, updated_at` |
| INSERT | `user_sessions` | `id, user_id, tenant_id, started_at, ip_address, user_agent, metadata` |
| DELETE | `oauth_connections` | `WHERE user_id = $1 AND provider = $2` |

### TRANSACTIONS
| Method | Transaction Type |
|--------|-----------------|
| `findOrCreateUser` | BEGIN → Multiple operations → COMMIT/ROLLBACK |

### EXTERNAL API CALLS
| Provider | Endpoint | Method | Headers |
|----------|----------|--------|---------|
| Google | Token exchange | OAuth2Client | - |
| Google | ID Token verification | OAuth2Client | - |
| GitHub | `https://github.com/login/oauth/access_token` | POST | `Accept: application/json` |
| GitHub | `https://api.github.com/user` | GET | `Bearer {token}`, `Accept: application/vnd.github.v3+json` |
| GitHub | `https://api.github.com/user/emails` | GET | `Bearer {token}`, `Accept: application/vnd.github.v3+json` |

### CIRCUIT BREAKER CONFIGURATION
```javascript
{ timeout: 5000, errorThresholdPercentage: 50, resetTimeout: 30000 }
```

### ERROR HANDLING
| Error | Condition |
|-------|-----------|
| AuthenticationError | 'No ID token received from Google' |
| AuthenticationError | 'Invalid Google token payload' |
| AuthenticationError | 'Google authentication failed' |
| AuthenticationError | 'No email found in GitHub profile' |
| AuthenticationError | 'GitHub authentication failed' |
| ValidationError | 'Unsupported OAuth provider' |
| ValidationError | 'User not found' |
| ValidationError | '{provider} account already linked to your account' |
| ValidationError | 'This OAuth account is already linked to another user' |
| ValidationError | 'No {provider} account linked to your account' |

### SERVICE DEPENDENCIES
- JWTService: `generateTokenPair()`
- AuditService: `logSessionCreated()`

### SIDE EFFECTS
- Session audit log on OAuth login

---

## 5. wallet.service.ts (WalletService)

### DATABASE OPERATIONS
| Operation | Table | Columns/Conditions |
|-----------|-------|-------------------|
| INSERT | `users` | `email, password_hash='', email_verified=true, tenant_id, created_at` |
| INSERT | `wallet_connections` | `user_id, tenant_id, wallet_address, network, verified, created_at` |
| INSERT | `user_sessions` | `user_id, tenant_id, started_at` |
| SELECT | `wallet_connections` JOIN `users` | `WHERE wallet_address = $1 AND network = $2 AND verified = true` |
| SELECT | `users` | `WHERE id = $1 AND deleted_at IS NULL` |
| UPDATE | `users` | `SET last_login_at = NOW() WHERE id = $1` |
| DELETE | `wallet_connections` | `WHERE user_id = $1 AND wallet_address = $2` |

### TRANSACTIONS
| Method | Transaction Type |
|--------|-----------------|
| `registerWithWallet` | BEGIN → INSERT user → INSERT wallet → INSERT session → COMMIT |
| `loginWithWallet` | BEGIN → INSERT session → UPDATE user → COMMIT |

### REDIS OPERATIONS
| Method | Key Pattern | Operation | TTL |
|--------|-------------|-----------|-----|
| `generateNonce` | `tenant:{tenantId}:wallet-nonce:{nonce}` | SETEX | 900s (15 min) |
| `getNonceData` | `tenant:{tenantId}:wallet-nonce:{nonce}` or `wallet-nonce:{nonce}` | GET | - |
| `deleteNonce` | Both patterns | DEL | - |

### CRYPTOGRAPHIC OPERATIONS
| Operation | Library | Details |
|-----------|---------|---------|
| Nonce Generation | crypto | `crypto.randomBytes(32).toString('hex')` |
| Solana Signature | nacl/tweetnacl | `nacl.sign.detached.verify(message, signature, publicKey)` |
| Ethereum Signature | ethers | `ethers.verifyMessage(message, signature)` |
| Base58 Decode | bs58 | For Solana signatures |
| PublicKey Validation | @solana/web3.js | `new PublicKey(publicKey)` |

### TIME-SENSITIVE LOGIC
| Timing | Value | Purpose |
|--------|-------|---------|
| Nonce expiry | 900s (15 min) | `expiresAt: timestamp + 900000` |

### ERROR HANDLING
| Error | Condition |
|-------|-----------|
| AuthenticationError | 'Nonce expired or not found' |
| AuthenticationError | 'Nonce mismatch' |
| AuthenticationError | 'Invalid wallet signature' |
| AuthenticationError | 'Wallet not connected to any account' |
| AuthenticationError | 'User not found' |
| AuthenticationError | 'Wallet already connected to another account' |
| AuthenticationError | 'Wallet not found or not linked to your account' |

### SERVICE DEPENDENCIES
- JWTService: `generateTokenPair()`
- AuditService: `logSessionCreated()`

### CHAINS SUPPORTED
- Solana, Ethereum

---

## 6. captcha.service.ts (CaptchaService)

### DATABASE OPERATIONS
None

### REDIS OPERATIONS
| Method | Key Pattern | Operation | TTL |
|--------|-------------|-----------|-----|
| `isCaptchaRequired` | `captcha:failures:{identifier}` | GET | - |
| `recordFailure` | `captcha:failures:{identifier}` | INCR + EXPIRE | 900s (15 min) |
| `clearFailures` | `captcha:failures:{identifier}` | DEL | - |

### EXTERNAL API CALLS
| Provider | Endpoint | Method | Content-Type |
|----------|----------|--------|--------------|
| reCAPTCHA | `https://www.google.com/recaptcha/api/siteverify` | POST | `application/x-www-form-urlencoded` |
| hCaptcha | `https://hcaptcha.com/siteverify` | POST | `application/x-www-form-urlencoded` |

### TIME-SENSITIVE LOGIC
| Constant | Value | Purpose |
|----------|-------|---------|
| CAPTCHA_THRESHOLD | 3 | Failed attempts before requiring CAPTCHA |
| CAPTCHA_WINDOW | 900s (15 min) | Window for counting failures |

### ERROR HANDLING
| Return | Condition |
|--------|-----------|
| `{ success: true }` | No secret key or fail-open mode |
| `{ success: false, errorCodes: ['missing-input-response'] }` | No token provided |
| `{ success: false, errorCodes: ['verification-failed'] }` | API call fails (when not fail-open) |

### RECAPTCHA V3 SCORE
- Configurable via `env.CAPTCHA_MIN_SCORE`
- Scores 0.0 to 1.0

---

## 7. key-rotation.service.ts (KeyRotationService)

### DATABASE OPERATIONS
None

### REDIS OPERATIONS
| Method | Key Pattern | Operation | TTL |
|--------|-------------|-----------|-----|
| `initialize` | `key-rotation:config` | GET | - |
| `checkRotationNeeded` | `key-rotation:{type}:last-rotation` | GET | - |
| `recordRotation` | `key-rotation:{type}:last-rotation` | SET | - |
| `updateConfig` | `key-rotation:config` | SET | - |
| `acquireRotationLock` | `key-rotation:lock:{type}` | SET NX EX | configurable (default 300s) |
| `releaseRotationLock` | `key-rotation:lock:{type}` | DEL | - |

### CRYPTOGRAPHIC OPERATIONS
| Operation | Library | Details |
|-----------|---------|---------|
| RSA Key Generation | crypto | `crypto.generateKeyPairSync('rsa', { modulusLength: 4096 })` |
| Key ID Generation | crypto | `key-${timestamp}-${randomBytes(4)}` |
| Key Fingerprint | crypto | `SHA-256(publicKey).substring(0, 16)` |

### TIME-SENSITIVE LOGIC
| Config | Default | Purpose |
|--------|---------|---------|
| gracePeriodHours | 24 | Keep old key active after rotation |
| notifyBeforeDays | 7 | Alert before expiry |
| maxKeyAgeDays | 90 | Force rotation interval |
| autoRotateEnabled | false | Manual rotation by default |

### SIDE EFFECTS
| Effect | Method |
|--------|--------|
| Audit log | `recordRotation` → `auditService.log({ action: 'key.rotated' })` |
| Audit log | `updateConfig` → `auditService.log({ action: 'key-rotation.config.updated' })` |

### KEY LIFECYCLE STATES
- `active`, `rotating`, `deprecated`, `revoked`

---

## Summary: External Dependencies

| Service | External APIs | Blockchain | Circuit Breaker |
|---------|--------------|------------|-----------------|
| MFAService | None | None | None |
| BiometricService | None | None | None |
| DeviceTrustService | None | None | None |
| OAuthService | Google, GitHub | None | Yes (GitHub) |
| WalletService | None | Solana, Ethereum | None |
| CaptchaService | reCAPTCHA, hCaptcha | None | None |
| KeyRotationService | None | None | None |

---

## Summary: Tables Used

| Table | Services |
|-------|----------|
| `users` | MFA, OAuth, Wallet |
| `biometric_credentials` | Biometric |
| `trusted_devices` | DeviceTrust |
| `oauth_connections` | OAuth |
| `wallet_connections` | Wallet |
| `user_sessions` | OAuth, Wallet |

---

## Integration Testing Implications

### Database Setup Requirements
1. **Tables required:**
   - `users` - with MFA columns (mfa_enabled, mfa_secret, backup_codes)
   - `biometric_credentials` - for WebAuthn/passkey support
   - `trusted_devices` - for device trust scoring
   - `oauth_connections` - for Google/GitHub OAuth
   - `wallet_connections` - for Solana/Ethereum wallet auth
   - `user_sessions` - for session tracking

### Redis Setup Requirements
1. **Key prefixes to seed/verify:**
   - `mfa:setup:{userId}` - MFA setup state
   - `tenant:{tenantId}:mfa:recent:{userId}:{token}` - Token replay prevention
   - `tenant:{tenantId}:mfa:verified:{userId}` - MFA verification window
   - `tenant:{tenantId}:biometric_challenge:{userId}` - Biometric challenges
   - `tenant:{tenantId}:wallet-nonce:{nonce}` - Wallet auth nonces
   - `captcha:failures:{identifier}` - CAPTCHA failure counts
   - `key-rotation:*` - Key rotation state

### External API Mocking
| Service | Mock Requirements |
|---------|------------------|
| OAuth | Google OAuth2Client, GitHub API |
| Captcha | reCAPTCHA/hCaptcha verify endpoints |

### Blockchain Mocking
| Chain | Mock Requirements |
|-------|------------------|
| Solana | `@solana/web3.js` PublicKey, nacl signature verify |
| Ethereum | ethers.verifyMessage |

### Time-Based Testing Considerations
- MFA setup expiration (10 min)
- Token replay prevention (90s)
- MFA verified window (5 min)
- Biometric challenge expiry (5 min)
- Wallet nonce expiry (15 min)
- Key rotation intervals (90 days)
