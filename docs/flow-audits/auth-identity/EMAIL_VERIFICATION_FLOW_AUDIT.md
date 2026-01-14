# EMAIL VERIFICATION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Email Verification |

---

## Executive Summary

**WORKING - Complete email verification flow**

| Component | Status |
|-----------|--------|
| Send verification email on register | ✅ Complete |
| Verify email endpoint | ✅ Complete |
| Resend verification endpoint | ✅ Complete |
| Token generation | ✅ Complete (32 bytes) |
| Token expiration | ✅ Complete (24 hours) |
| Rate limiting on resend | ✅ Complete (3/hour) |
| Multi-tenant support | ✅ Complete |
| Audit logging | ✅ Complete |
| API Gateway routing | ✅ Complete |

**Bottom Line:** Email verification works correctly. Tokens are securely generated, stored in Redis with TTL, and the flow handles tenant isolation properly. Resend has rate limiting to prevent abuse.

---

## Architecture Overview

### Email Verification Flow
```
┌─────────────────────────────────────────────────────────────┐
│              EMAIL VERIFICATION FLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   STEP 1: Registration (Automatic)                          │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. User registers                                  │   │
│   │  2. Generate 32-byte random token                   │   │
│   │  3. Store token in Redis (24 hour TTL)              │   │
│   │  4. Send verification email via Resend              │   │
│   │  5. User created with email_verified = false        │   │
│   └─────────────────────────────────────────────────────┘   │
│                         │                                    │
│                         ▼                                    │
│   STEP 2: User clicks email link                            │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  GET /auth/verify-email?token={token}               │   │
│   │  1. Look up token in Redis                          │   │
│   │  2. Validate user exists and email matches          │   │
│   │  3. Update user: email_verified = true              │   │
│   │  4. Delete token from Redis                         │   │
│   │  5. Audit log verification                          │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   STEP 3: Resend (Optional, Authenticated)                  │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  POST /auth/resend-verification                     │   │
│   │  1. Rate limit check (3 per hour)                   │   │
│   │  2. Check if already verified                       │   │
│   │  3. Generate new token                              │   │
│   │  4. Send new verification email                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Send Verification Email (On Registration)

**File:** `backend/services/auth-service/src/services/email.service.ts`
```typescript
async sendVerificationEmail(userId: string, email: string, firstName: string, tenantId?: string): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex');

  // Store token in Redis with tenant prefix
  const redis = getRedis();
  await redis.setex(
    redisKeys.emailVerify(token, tenantId),
    24 * 60 * 60,  // 24 hour expiration
    JSON.stringify({ userId, email, tenantId })
  );

  const verifyUrl = `${env.API_GATEWAY_URL}/auth/verify-email?token=${token}`;

  const template: EmailTemplate = {
    subject: 'Verify your TicketToken account',
    html: `
      <h2>Welcome to TicketToken, ${firstName}!</h2>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verifyUrl}" style="...">Verify Email</a>
      <p>This link expires in 24 hours.</p>
      <p>If you didn't create this account, please ignore this email.</p>
    `,
    text: `...`
  };

  await this.sendEmail(email, template);
}
```

### 2. Verify Email Endpoint

**Route:** `GET /api/v1/auth/verify-email?token={token}`

**File:** `backend/services/auth-service/src/routes/auth.routes.ts`
```typescript
fastify.get('/verify-email', {
  schema: { response: responseSchemas.verifyEmail },
  preHandler: async (request: any, reply: any) => {
    await validate(schemas.verifyEmailSchema, 'query')(request, reply);
  }
}, async (request: any, reply: any) => {
  return await extendedController.verifyEmail(request, reply);
});
```

**Controller:** `backend/services/auth-service/src/controllers/auth-extended.controller.ts`
```typescript
async verifyEmail(request: any, reply: any) {
  try {
    const { token } = request.query;

    if (!token) {
      return reply.status(400).send({
        error: 'Verification token is required'
      });
    }

    await this.authExtendedService.verifyEmail(token as string);

    reply.send({
      message: 'Email verified successfully'
    });
  } catch (error: any) {
    if (error instanceof ValidationError || error.message?.includes('Invalid') || error.message?.includes('expired')) {
      return reply.status(400).send({
        error: error.errors?.[0] || error.message || 'Invalid or expired verification token'
      });
    }

    console.error('Email verification error:', error);
    return reply.status(500).send({
      error: 'Failed to verify email'
    });
  }
}
```

**Service:** `backend/services/auth-service/src/services/auth-extended.service.ts`
```typescript
async verifyEmail(token: string): Promise<void> {
  const redis = getRedis();

  // Try to find token (with or without tenant prefix)
  let tokenData = await redis.get(`email-verify:${token}`);
  let tenantId: string | undefined;

  if (!tokenData) {
    const keys = await this.scanKeys(`tenant:*:email-verify:${token}`);
    if (keys.length > 0) {
      tokenData = await redis.get(keys[0]);
      const match = keys[0].match(/^tenant:([^:]+):email-verify:/);
      tenantId = match ? match[1] : undefined;
    }
  }

  if (!tokenData) {
    throw new ValidationError(['Invalid or expired verification token']);
  }

  const parsed = JSON.parse(tokenData);
  const userId = parsed.userId;
  const email = parsed.email;
  tenantId = tenantId || parsed.tenantId;

  // Verify user exists first
  const user = await db('users').withSchema('public')
    .where({ id: userId })
    .whereNull('deleted_at')
    .first();

  if (!user) {
    throw new ValidationError(['User not found']);
  }

  // Verify email matches
  if (user.email !== email) {
    throw new ValidationError(['Email mismatch']);
  }

  // Update user as verified
  const updated = await db('users').withSchema('public')
    .where({ id: userId })
    .whereNull('deleted_at')
    .update({
      email_verified: true,
      email_verified_at: new Date(),
      updated_at: new Date()
    });

  if (updated === 0) {
    throw new ValidationError(['Failed to update user']);
  }

  // Delete the verification token (try both patterns)
  await redis.del(`email-verify:${token}`);
  if (tenantId) {
    await redis.del(redisKeys.emailVerify(token, tenantId));
  }

  // Log the verification
  await db('audit_logs').insert({
    service: 'auth-service',
    action: 'email_verified',
    action_type: 'security',
    resource_type: 'user',
    user_id: userId,
    created_at: new Date()
  });

  console.log(`Email verified successfully for user: ${userId}`);
}
```

### 3. Resend Verification (Authenticated)

**Route:** `POST /api/v1/auth/resend-verification`

**File:** `backend/services/auth-service/src/routes/auth.routes.ts`
```typescript
fastify.post('/resend-verification', {
  schema: { response: responseSchemas.resendVerification },
  preHandler: async (request: any, reply: any) => {
    await validate(schemas.emptyBodySchema)(request, reply);
  }
}, async (request: any, reply: any) => {
  return extendedController.resendVerification(request, reply);
});
```

**Note:** This route is inside the `authenticatedRoutes` block, so auth is required.

**Service:** `backend/services/auth-service/src/services/auth-extended.service.ts`
```typescript
async resendVerificationEmail(userId: string): Promise<void> {
  // Rate limit resend requests
  const redis = getRedis();
  const rateLimitKey = `resend-verify:${userId}`;
  const attempts = await redis.incr(rateLimitKey);

  if (attempts === 1) {
    await redis.expire(rateLimitKey, 3600); // 1 hour
  }

  if (attempts > 3) {
    throw new ValidationError(['Too many resend attempts. Try again later.']);
  }

  // Get user
  const user = await db('users').withSchema('public')
    .where({ id: userId })
    .whereNull('deleted_at')
    .first();

  if (!user) {
    throw new ValidationError(['User not found']);
  }

  if (user.email_verified) {
    throw new ValidationError(['Email already verified']);
  }

  // Send new verification email with tenant context
  await this.emailService.sendVerificationEmail(
    user.id,
    user.email,
    user.first_name,
    user.tenant_id
  );
}
```

---

## API Endpoints

| Endpoint | Method | Auth | Purpose | Status |
|----------|--------|------|---------|--------|
| `/api/v1/auth/verify-email` | GET | ❌ Public | Verify email with token | ✅ Working |
| `/api/v1/auth/resend-verification` | POST | ✅ Required | Resend verification email | ✅ Working |

---

## Token Storage

### Redis Keys

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `email-verify:{token}` | 24 hours | Legacy token storage |
| `tenant:{tenantId}:email-verify:{token}` | 24 hours | Tenant-scoped token |
| `resend-verify:{userId}` | 1 hour | Rate limit counter |

### Token Data Structure
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "tenantId": "uuid"
}
```

---

## Security Features

| Feature | Status | Details |
|---------|--------|---------|
| Cryptographically secure token | ✅ | 32-byte random (crypto.randomBytes) |
| Token expiration | ✅ | 24 hours |
| Email match validation | ✅ | Prevents token reuse for different email |
| User existence check | ✅ | Validates user still exists |
| Rate limiting on resend | ✅ | 3 per hour per user |
| Multi-tenant support | ✅ | Tenant-prefixed Redis keys |
| Token deletion after use | ✅ | Single-use tokens |
| Audit logging | ✅ | Logs successful verification |

---

## Database Updates
```sql
UPDATE users
SET email_verified = true,
    email_verified_at = NOW(),
    updated_at = NOW()
WHERE id = $1 AND deleted_at IS NULL
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `auth-service/src/routes/auth.routes.ts` | Route definitions |
| `auth-service/src/controllers/auth-extended.controller.ts` | Controller |
| `auth-service/src/services/auth-extended.service.ts` | Verification logic |
| `auth-service/src/services/email.service.ts` | Email sending |
| `api-gateway/src/routes/auth.routes.ts` | Gateway proxy |

---

## Minor Improvements (P3)

| Issue | Suggestion | Effort |
|-------|------------|--------|
| Token in URL (GET request) | Consider POST with token in body | 0.5 day |
| No verification reminder | Send reminder if not verified after 24h | 1 day |
| Hardcoded rate limit | Make configurable via env | 0.25 day |

---

## Related Documents

- `USER_REGISTRATION_AUTH_FLOW_AUDIT.md` - Registration sends verification email
- `PASSWORD_RESET_FLOW_AUDIT.md` - Similar token-based flow
