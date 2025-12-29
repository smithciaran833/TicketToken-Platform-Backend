# Auth Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED

---

## Endpoints Reviewed

### Authentication
- POST /register ✅
- POST /login ✅
- POST /logout ✅
- POST /refresh-token ✅
- POST /verify-email ✅
- POST /resend-verification ✅
- POST /forgot-password ✅
- POST /reset-password ✅
- POST /change-password ✅

### Profile
- GET /me ✅
- PUT /me ✅
- DELETE /me ✅
- GET /me/preferences ✅
- PUT /me/preferences ✅

### Sessions
- GET /sessions ✅
- DELETE /sessions/:id ✅
- DELETE /sessions (all) ✅

### OAuth
- GET /oauth/google ✅
- GET /oauth/google/callback ✅
- GET /oauth/apple ✅
- GET /oauth/apple/callback ✅
- POST /oauth/:provider/link ✅
- DELETE /oauth/:provider/unlink ✅

### Wallets
- POST /wallets/link ✅
- GET /wallets ✅
- DELETE /wallets/:id ✅
- PUT /wallets/:id/set-primary ✅
- POST /wallets/:id/verify ✅

### 2FA
- POST /2fa/setup ✅
- POST /2fa/verify ✅
- POST /2fa/disable ✅
- GET /2fa/backup-codes ✅
- POST /2fa/verify-backup ✅

### Venue Roles
- POST /venues/:venueId/roles ✅
- DELETE /venues/:venueId/roles/:userId ✅
- GET /venues/:venueId/roles ✅

### Admin
- GET /admin/users ✅
- GET /admin/users/:id ✅
- PUT /admin/users/:id ✅
- DELETE /admin/users/:id ✅
- POST /admin/users/:id/roles ✅

---

## Database Tables

| Table | Status |
|-------|--------|
| users | ✅ Complete |
| sessions | ✅ Complete |
| refresh_tokens | ✅ Complete |
| password_reset_tokens | ✅ Complete |
| email_verifications | ✅ Complete |
| user_preferences | ✅ Complete |
| oauth_accounts | ✅ Complete |
| wallet_connections | ✅ Complete |
| login_history | ✅ Complete |
| two_factor_auth | ✅ Complete |
| two_factor_backup_codes | ✅ Complete |
| roles | ✅ Complete |
| user_venue_roles | ✅ Complete |

---

## Gaps Identified

### GAP-AUTH-001: Phone Format Validation
- **Severity:** MEDIUM
- **Current:** `phone: Joi.string().max(20)` - no format validation
- **Needed:** E.164 pattern validation `/^\+?[1-9]\d{1,14}$/`
- **Found in audit:** Yes (02-input-validation.md)
- **Fix location:** `src/validators/auth.validators.ts`

### GAP-AUTH-002: Phone Verification Flow
- **Severity:** MEDIUM
- **Current:** `phone` field exists, `phone_verified` boolean exists, but no way to verify
- **Needed:** 
  - POST /auth/phone/send-code - Send SMS verification code
  - POST /auth/phone/verify - Verify code and set phone_verified=true
- **Found in audit:** No
- **Dependencies:** notification-service (SMS sending)

### GAP-AUTH-003: Artist Role System
- **Severity:** HIGH (but not auth-service responsibility alone)
- **Current:** `user_venue_roles` exists for venue staff
- **Needed:** `user_artist_roles` table + artist RBAC permissions
- **Found in audit:** No
- **Note:** Artist profiles should live in event-service. Auth-service only needs the role linking table.
- **See:** PLATFORM_GAPS.md

---

## Cross-Service Dependencies

| This service needs from | What |
|------------------------|------|
| notification-service | SMS sending for phone verification |
| event-service | Artist profiles (if artist roles are added) |

| Other services need from this | What |
|------------------------------|------|
| All services | JWT validation, user lookup |
| venue-service | User-venue role checking |
| event-service | Will need user-artist role checking |

---

## Audit Findings Reference

| Audit File | Relevant Findings |
|------------|-------------------|
| 02-input-validation.md | Phone pattern missing (GAP-AUTH-001) |
| 25-compliance-legal.md | GDPR export/delete endpoints mentioned but compliance-service handles |

