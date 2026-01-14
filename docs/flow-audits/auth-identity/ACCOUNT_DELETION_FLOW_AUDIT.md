# ACCOUNT DELETION (GDPR) FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Account Deletion (GDPR Article 17 - Right to Erasure) |

---

## Executive Summary

**PARTIAL - Soft delete works, anonymization not scheduled**

| Component | Status |
|-----------|--------|
| Delete request endpoint | ✅ Complete |
| Email confirmation required | ✅ Complete |
| Soft delete (deleted_at) | ✅ Complete |
| Session revocation | ✅ Complete |
| Cache invalidation | ✅ Complete |
| Audit logging | ✅ Complete |
| Anonymization function | ✅ Exists (SQL) |
| Scheduled anonymization job | ❌ Not implemented |
| Data export before delete | ✅ Available separately |
| Recovery window | ✅ 30 days (documented) |

**Bottom Line:** Account deletion request works correctly - user is soft-deleted, sessions revoked, and audit logged. However, the 30-day anonymization is only documented, not actually scheduled. The `cleanup_expired_data()` SQL function exists but nothing calls it.

---

## Architecture Overview

### Account Deletion Flow
```
┌─────────────────────────────────────────────────────────────┐
│               ACCOUNT DELETION FLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   POST /api/v1/auth/gdpr/delete (Authenticated)             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Verify user exists                              │   │
│   │  2. Require email confirmation (prevents accidents) │   │
│   │  3. Soft delete: deleted_at = NOW, status = DELETED │   │
│   │  4. Revoke all active sessions                      │   │
│   │  5. Invalidate all caches                           │   │
│   │  6. Audit log the deletion request                  │   │
│   │  7. Return success with 30-day recovery notice      │   │
│   └─────────────────────────────────────────────────────┘   │
│                         │                                    │
│                         ▼                                    │
│   AFTER 30 DAYS (NOT IMPLEMENTED)                           │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  cleanup_expired_data() SQL function exists but     │   │
│   │  is NEVER CALLED by any scheduled job:              │   │
│   │                                                      │   │
│   │  - Anonymize email: deleted_<id>@removed.com        │   │
│   │  - Set first_name = 'Deleted', last_name = 'User'   │   │
│   │  - Set phone = NULL                                 │   │
│   │  - Delete wallet_connections                        │   │
│   │  - Delete oauth_connections                         │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## What Works ✅

### 1. Delete Request Endpoint

**Route:** `POST /api/v1/auth/gdpr/delete`

**File:** `backend/services/auth-service/src/controllers/profile.controller.ts`
```typescript
async requestDeletion(request: AuthenticatedRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const tenantId = request.user.tenant_id as string;
  const body = request.body as {
    confirmEmail: string;
    reason?: string;
  };

  try {
    // Verify user owns this account
    const userResult = await pool.query(
      `SELECT email FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [userId, tenantId]
    );

    if (userResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Require email confirmation to prevent accidental deletion
    if (userResult.rows[0].email.toLowerCase() !== body.confirmEmail?.toLowerCase()) {
      return reply.status(400).send({
        success: false,
        error: 'Email confirmation does not match',
        code: 'EMAIL_MISMATCH'
      });
    }

    // Begin deletion process - soft delete first
    await pool.query(
      `UPDATE users
       SET deleted_at = CURRENT_TIMESTAMP,
           status = 'DELETED',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );

    // Revoke all sessions
    await pool.query(
      `UPDATE user_sessions
       SET revoked_at = CURRENT_TIMESTAMP, ended_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );

    // Invalidate all caches
    await cacheFallbackService.invalidateUserCache(userId, tenantId);

    // Audit the deletion request
    await auditService.log({
      userId,
      tenantId,
      action: 'account.deletion_requested',
      actionType: 'data_access',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
      metadata: {
        reason: body.reason || 'not provided',
        scheduledAnonymization: '30 days'
      },
      status: 'success'
    });

    return reply.send({
      success: true,
      message: 'Account deletion initiated',
      details: {
        deletedAt: new Date().toISOString(),
        anonymizationScheduled: '30 days',
        note: 'Your account has been deactivated. Data will be fully anonymized after 30 days. Contact support within this period if you wish to recover your account.'
      }
    });
  } catch (error) {
    // error handling...
  }
}
```

### 2. Data Export (Available Separately)

Users can export data before deletion via:
```
GET /api/v1/auth/gdpr/export
```

This returns all user data in JSON format (GDPR Article 15 & 20 compliant).

### 3. Anonymization Function (Exists but Not Called)

**File:** `backend/services/auth-service/src/migrations/001_auth_baseline.ts`
```sql
CREATE OR REPLACE FUNCTION cleanup_expired_data() RETURNS void AS $$
DECLARE deleted_count INTEGER;
BEGIN
  -- Clean up old sessions
  DELETE FROM user_sessions WHERE ended_at < NOW() - INTERVAL '30 days';
  
  -- Clean up old audit logs (7 year retention)
  DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '7 years';
  
  -- Anonymize users deleted 30+ days ago
  UPDATE users 
  SET email = 'deleted_' || id || '@removed.com', 
      first_name = 'Deleted', 
      last_name = 'User', 
      phone = NULL, 
      deleted_at = NOW()
  WHERE deleted_at IS NOT NULL 
    AND deleted_at < NOW() - INTERVAL '30 days' 
    AND email NOT LIKE 'deleted_%';
  
  -- Delete associated data
  DELETE FROM wallet_connections 
  WHERE user_id IN (
    SELECT id FROM users 
    WHERE deleted_at IS NOT NULL 
    AND deleted_at < NOW() - INTERVAL '30 days'
  );
  
  DELETE FROM oauth_connections 
  WHERE user_id IN (
    SELECT id FROM users 
    WHERE deleted_at IS NOT NULL 
    AND deleted_at < NOW() - INTERVAL '30 days'
  );
  
  -- Orphan cleanup
  DELETE FROM user_sessions WHERE user_id NOT IN (SELECT id FROM users);
END;
$$ LANGUAGE plpgsql;
```

---

## What's Missing ❌

### 1. No Scheduled Job for Anonymization

The `cleanup_expired_data()` function exists but nothing calls it:
```bash
# No cron job
# No scheduled task
# No background worker
```

**Impact:** Users who delete their accounts are soft-deleted but NEVER anonymized. Their data remains in the database indefinitely.

### 2. No Account Recovery Endpoint

The 30-day recovery window is documented but there's no endpoint to recover:
```
POST /api/v1/auth/gdpr/recover  # DOES NOT EXIST
```

---

## API Endpoints

| Endpoint | Method | Auth | Purpose | Status |
|----------|--------|------|---------|--------|
| `/api/v1/auth/gdpr/delete` | POST | ✅ | Request account deletion | ✅ Working |
| `/api/v1/auth/gdpr/export` | GET | ✅ | Export all user data | ✅ Working |
| `/api/v1/auth/gdpr/recover` | POST | - | Recover deleted account | ❌ Missing |

---

## Request/Response

### Delete Request
```bash
POST /api/v1/auth/gdpr/delete
Authorization: Bearer <token>
Content-Type: application/json

{
  "confirmEmail": "user@example.com",
  "reason": "No longer using the service"
}

# Response
{
  "success": true,
  "message": "Account deletion initiated",
  "details": {
    "deletedAt": "2025-01-01T12:00:00.000Z",
    "anonymizationScheduled": "30 days",
    "note": "Your account has been deactivated. Data will be fully anonymized after 30 days. Contact support within this period if you wish to recover your account."
  }
}
```

---

## Database Changes on Deletion

### Immediate (Soft Delete)
```sql
UPDATE users
SET deleted_at = CURRENT_TIMESTAMP,
    status = 'DELETED',
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND tenant_id = $2
```

### Session Revocation
```sql
UPDATE user_sessions
SET revoked_at = CURRENT_TIMESTAMP, 
    ended_at = CURRENT_TIMESTAMP
WHERE user_id = $1 AND revoked_at IS NULL
```

### After 30 Days (NOT HAPPENING)
```sql
-- This should run but doesn't:
UPDATE users 
SET email = 'deleted_' || id || '@removed.com', 
    first_name = 'Deleted', 
    last_name = 'User', 
    phone = NULL
WHERE deleted_at < NOW() - INTERVAL '30 days'
```

---

## Security Features

| Feature | Status | Details |
|---------|--------|---------|
| Email confirmation | ✅ | Prevents accidental deletion |
| Soft delete first | ✅ | Allows recovery |
| Session revocation | ✅ | Immediate logout |
| Cache invalidation | ✅ | No stale data |
| Audit logging | ✅ | Full trail |
| Tenant isolation | ✅ | Multi-tenant safe |
| 30-day window | ⚠️ | Documented but not enforced |

---

## GDPR Compliance Status

| Requirement | Article | Status |
|-------------|---------|--------|
| Right to Erasure | Art. 17 | ⚠️ Partial (no actual erasure) |
| Data Portability | Art. 20 | ✅ Export works |
| Erasure within 30 days | Art. 17(1) | ❌ Never happens |
| Notification to third parties | Art. 17(2) | ❌ Not implemented |

---

## Files Involved

| File | Purpose |
|------|---------|
| `auth-service/src/routes/auth.routes.ts` | Route definition |
| `auth-service/src/controllers/profile.controller.ts` | Deletion logic |
| `auth-service/src/services/audit.service.ts` | Audit logging |
| `auth-service/src/services/cache-fallback.service.ts` | Cache invalidation |
| `auth-service/src/migrations/001_auth_baseline.ts` | Cleanup function |

---

## Recommendations

### P0 - Critical (GDPR Non-Compliance)

| Task | Effort |
|------|--------|
| Create scheduled job to run `cleanup_expired_data()` daily | 0.5 day |
| Add pg_cron or external scheduler | 0.5 day |

**Quick Fix:**
```sql
-- Using pg_cron extension
SELECT cron.schedule('cleanup-deleted-users', '0 2 * * *', 'SELECT cleanup_expired_data()');
```

Or create a background worker in Node:
```typescript
// auth-service/src/jobs/cleanup.job.ts
import cron from 'node-cron';
import { pool } from '../config/database';

cron.schedule('0 2 * * *', async () => {
  await pool.query('SELECT cleanup_expired_data()');
  console.log('Cleanup job completed');
});
```

### P2 - Account Recovery

| Task | Effort |
|------|--------|
| Create recovery endpoint | 0.5 day |
| Email verification for recovery | 0.5 day |

---

## Related Documents

- `USER_FEATURES_FLOW_AUDIT.md` - Profile management
- `SESSION_MANAGEMENT_FLOW_AUDIT.md` - Session revocation
- `GDPR_DATA_EXPORT_FLOW_AUDIT.md` - Data export (to be audited)
