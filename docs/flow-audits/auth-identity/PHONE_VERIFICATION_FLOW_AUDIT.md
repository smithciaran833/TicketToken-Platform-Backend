# PHONE VERIFICATION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Phone Verification |

---

## Executive Summary

**NOT IMPLEMENTED - Schema exists, no verification logic**

| Component | Status |
|-----------|--------|
| Database schema (phone column) | ✅ Exists |
| Database schema (phone_verified) | ✅ Exists |
| Phone masking function | ✅ Exists |
| SMS provider (Twilio) | ✅ Working |
| Send verification SMS | ❌ Not implemented |
| Verify phone endpoint | ❌ Not implemented |
| Resend verification | ❌ Not implemented |
| Phone verification routes | ❌ Not implemented |
| OTP generation | ❌ Not implemented |
| Rate limiting | ❌ N/A |

**Bottom Line:** The database has `phone` and `phone_verified` columns, and Twilio SMS infrastructure exists in the notification service, but there is no phone verification flow. Users can add a phone number to their profile, but it's never verified.

---

## What Exists

### 1. Database Schema

**File:** `backend/services/auth-service/src/migrations/001_auth_baseline.ts`
```typescript
table.string('phone', 20);
table.boolean('phone_verified').defaultTo(false);
```

**Index:**
```sql
CREATE INDEX idx_users_phone ON users(phone);
```

### 2. Phone Masking Function
```sql
CREATE OR REPLACE FUNCTION mask_phone(phone TEXT) RETURNS TEXT AS $$
BEGIN
  IF phone IS NULL THEN RETURN NULL; END IF;
  RETURN regexp_replace(phone, '(\d{3})(\d+)(\d{4})', '\1-***-\3');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### 3. Masked View
```sql
CREATE OR REPLACE VIEW users_masked AS
SELECT id, mask_email(email) as email, username, first_name, last_name, 
       mask_phone(phone) as phone, status, role, created_at, last_login_at, 
       email_verified, phone_verified
FROM users
```

### 4. Profile Update (Phone Storage Only)

**File:** `backend/services/auth-service/src/controllers/profile.controller.ts`
```typescript
async updateProfile(request: AuthenticatedRequest, reply: FastifyReply) {
  // ...
  if (updates.phone !== undefined) {
    allowedUpdates.phone = updates.phone;
    // NOTE: phone_verified is NOT set to false here
    // Phone is stored but never verified
  }
  // ...
}
```

### 5. SMS Infrastructure (Notification Service)

**File:** `backend/services/notification-service/src/providers/sms/twilio-sms.provider.ts`

Twilio provider exists and can send SMS:
```typescript
async send(input: SendSMSInput): Promise<NotificationResult> {
  const message = await this.client.messages.create({
    body: input.message,
    from: input.from || this.fromNumber,
    to: input.to
  });
  // ...
}
```

---

## What's Missing

### 1. No Verification Endpoints

Expected but not implemented:
```
POST /api/v1/auth/phone/send-verification
POST /api/v1/auth/phone/verify
POST /api/v1/auth/phone/resend
```

### 2. No OTP Generation/Verification

No code exists for:
- Generating 6-digit OTP
- Storing OTP in Redis with TTL
- Verifying OTP
- Rate limiting SMS sends

### 3. No Integration Between Services

- Auth service has no way to call notification service to send verification SMS
- No event publishing for phone verification

---

## Expected Implementation

### Phone Verification Flow (Not Built)
```
┌─────────────────────────────────────────────────────────────┐
│           EXPECTED PHONE VERIFICATION FLOW                   │
│                  (NOT IMPLEMENTED)                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   STEP 1: Send Verification                                  │
│   POST /api/v1/auth/phone/send-verification                 │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Validate phone number format                    │   │
│   │  2. Rate limit check (3/hour)                       │   │
│   │  3. Generate 6-digit OTP                            │   │
│   │  4. Store in Redis (5 min TTL)                      │   │
│   │  5. Send SMS via notification service               │   │
│   │  6. Return success                                  │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   STEP 2: Verify Code                                       │
│   POST /api/v1/auth/phone/verify                            │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Rate limit check (5/5min)                       │   │
│   │  2. Get OTP from Redis                              │   │
│   │  3. Compare with submitted code                     │   │
│   │  4. Update user: phone_verified = true              │   │
│   │  5. Delete OTP from Redis                           │   │
│   │  6. Audit log                                       │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Involved

| File | Purpose | Status |
|------|---------|--------|
| `auth-service/src/migrations/001_auth_baseline.ts` | Schema with phone columns | ✅ Exists |
| `auth-service/src/controllers/profile.controller.ts` | Profile update (stores phone) | ✅ Exists |
| `notification-service/src/providers/sms/twilio-sms.provider.ts` | SMS sending | ✅ Exists |
| `auth-service/src/routes/phone.routes.ts` | Phone verification routes | ❌ Missing |
| `auth-service/src/services/phone-verification.service.ts` | Verification logic | ❌ Missing |
| `auth-service/src/controllers/phone.controller.ts` | Phone controller | ❌ Missing |

---

## Impact

| Area | Impact |
|------|--------|
| Security | Phone numbers are unverified, can't be trusted for 2FA SMS |
| User trust | Users expect phone verification in modern apps |
| Feature parity | Email verification exists, phone does not |
| Future features | SMS notifications, 2FA via SMS blocked |

---

## Recommendations

### P1 - Implement Phone Verification

| Task | Effort |
|------|--------|
| Create phone verification service | 1 day |
| Create OTP generation/storage (Redis) | 0.5 day |
| Create phone routes | 0.5 day |
| Integrate with notification service | 0.5 day |
| Add rate limiting | 0.5 day |
| Add audit logging | 0.25 day |
| **Total** | **3-4 days** |

### Implementation Skeleton
```typescript
// auth-service/src/services/phone-verification.service.ts
class PhoneVerificationService {
  async sendVerification(userId: string, phoneNumber: string): Promise<void> {
    // Rate limit
    await phoneRateLimiter.consume(userId);
    
    // Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    
    // Store in Redis
    const redis = getRedis();
    await redis.setex(`phone-verify:${userId}`, 300, JSON.stringify({
      phone: phoneNumber,
      otp: this.hashOTP(otp),
      attempts: 0
    }));
    
    // Send SMS via notification service
    await this.notificationClient.sendSMS({
      to: phoneNumber,
      message: `Your TicketToken verification code is: ${otp}`
    });
  }
  
  async verifyPhone(userId: string, code: string): Promise<boolean> {
    const redis = getRedis();
    const data = await redis.get(`phone-verify:${userId}`);
    
    if (!data) throw new Error('Verification expired');
    
    const { phone, otp, attempts } = JSON.parse(data);
    
    if (attempts >= 5) throw new Error('Too many attempts');
    
    if (this.hashOTP(code) !== otp) {
      await redis.setex(`phone-verify:${userId}`, 300, JSON.stringify({
        phone, otp, attempts: attempts + 1
      }));
      return false;
    }
    
    // Update user
    await db('users').where('id', userId).update({
      phone_verified: true,
      updated_at: new Date()
    });
    
    await redis.del(`phone-verify:${userId}`);
    return true;
  }
}
```

---

## Related Documents

- `EMAIL_VERIFICATION_FLOW_AUDIT.md` - Similar flow that IS implemented
- `MFA_SETUP_FLOW_AUDIT.md` - Could use verified phone for SMS 2FA
- `NOTIFICATION_PREFERENCES_FLOW_AUDIT.md` - SMS preferences
