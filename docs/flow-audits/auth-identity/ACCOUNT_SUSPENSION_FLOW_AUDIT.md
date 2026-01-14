# ACCOUNT SUSPENSION/BAN FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Account Suspension/Ban |

---

## Executive Summary

**NOT IMPLEMENTED - Schema exists, no logic**

| Component | Status |
|-----------|--------|
| Database status column | ✅ Exists |
| Status constraint (SUSPENDED) | ✅ Exists |
| Suspend user endpoint | ❌ Not implemented |
| Unsuspend user endpoint | ❌ Not implemented |
| Ban user endpoint | ❌ Not implemented |
| Login check for suspended | ❌ Not implemented |
| Admin routes | ❌ Not implemented |
| Suspension reasons | ❌ Not implemented |
| Suspension history | ❌ Not implemented |
| Auto-suspension triggers | ❌ Not implemented |

**Bottom Line:** The database has a `status` column with valid values `('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED')`, but there is no code to actually suspend users or check suspension status during login. Users cannot be suspended through any API.

---

## What Exists

### 1. Database Schema

**File:** `backend/services/auth-service/src/migrations/001_auth_baseline.ts`
```sql
-- Status column
table.string('status', 255).defaultTo('active');

-- Constraint
ALTER TABLE users ADD CONSTRAINT users_status_check 
CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED'))
```

### 2. Status Index
```sql
CREATE INDEX idx_users_status ON users(status);
```

---

## What's Missing

### 1. No Suspension Endpoints

Expected but not implemented:
```
POST /api/v1/admin/users/:userId/suspend
POST /api/v1/admin/users/:userId/unsuspend
POST /api/v1/admin/users/:userId/ban
```

### 2. No Login Check for Suspended Users

The login flow in `auth.service.ts` does NOT check if user is suspended:
```typescript
// Current login - NO suspension check
async login(data: any) {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
    [normalizeEmail(data.email)]
  );
  // Missing: AND status = 'ACTIVE'
  // Or: Check status after query and return appropriate error
}
```

### 3. No Admin Service

There is no admin service or admin routes for user management.

### 4. No Suspension History

Expected table (does not exist):
```sql
CREATE TABLE user_suspensions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  suspended_by UUID REFERENCES users(id),
  reason TEXT,
  suspended_at TIMESTAMP,
  unsuspended_at TIMESTAMP,
  unsuspended_by UUID,
  is_permanent BOOLEAN DEFAULT false
);
```

---

## Expected Implementation

### Account Suspension Flow (Not Built)
```
┌─────────────────────────────────────────────────────────────┐
│           EXPECTED SUSPENSION FLOW                           │
│                  (NOT IMPLEMENTED)                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ADMIN: POST /api/v1/admin/users/:userId/suspend           │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Verify admin permissions                        │   │
│   │  2. Get user                                        │   │
│   │  3. Update status = 'SUSPENDED'                     │   │
│   │  4. Record suspension reason                        │   │
│   │  5. Revoke all active sessions                      │   │
│   │  6. Invalidate all tokens                           │   │
│   │  7. Send notification email                         │   │
│   │  8. Audit log                                       │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   LOGIN: POST /api/v1/auth/login                            │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  After password verification:                       │   │
│   │  1. Check user.status                               │   │
│   │  2. If SUSPENDED → return 403 with reason           │   │
│   │  3. If PENDING → return 403 "verify email"          │   │
│   │  4. If ACTIVE → continue with login                 │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Impact

| Area | Impact |
|------|--------|
| Security | Cannot suspend compromised accounts |
| Fraud prevention | Cannot block malicious users |
| Compliance | Cannot respond to legal requests |
| Operations | Manual DB updates required |
| Audit | No suspension history |

---

## Recommendations

### P1 - Implement Suspension

| Task | Effort |
|------|--------|
| Add login status check | 0.5 day |
| Create admin suspension endpoints | 1 day |
| Add suspension history table | 0.5 day |
| Revoke sessions on suspend | 0.5 day |
| Send notification on suspend | 0.5 day |
| **Total** | **3 days** |

### Implementation Skeleton

**1. Login Check (auth.service.ts):**
```typescript
async login(data: any) {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
    [normalizeEmail(data.email)]
  );
  
  const user = result.rows[0];
  
  // Add status check
  if (user && user.status === 'SUSPENDED') {
    throw new AuthenticationError('Account suspended. Contact support.');
  }
  
  if (user && user.status === 'PENDING') {
    throw new AuthenticationError('Please verify your email before logging in.');
  }
  
  // Continue with password verification...
}
```

**2. Admin Suspend Endpoint:**
```typescript
// admin.routes.ts
fastify.post('/users/:userId/suspend', {
  preHandler: [authMiddleware, requireAdmin]
}, async (request, reply) => {
  const { userId } = request.params;
  const { reason, permanent } = request.body;
  const adminId = request.user.id;
  
  await pool.query('BEGIN');
  
  // Update status
  await pool.query(
    `UPDATE users SET status = 'SUSPENDED', updated_at = NOW() WHERE id = $1`,
    [userId]
  );
  
  // Record suspension
  await pool.query(
    `INSERT INTO user_suspensions (user_id, suspended_by, reason, is_permanent)
     VALUES ($1, $2, $3, $4)`,
    [userId, adminId, reason, permanent]
  );
  
  // Revoke all sessions
  await pool.query(
    `UPDATE user_sessions SET revoked_at = NOW(), ended_at = NOW()
     WHERE user_id = $1 AND ended_at IS NULL`,
    [userId]
  );
  
  await pool.query('COMMIT');
  
  // Audit log
  await auditService.log({
    action: 'user.suspended',
    userId: adminId,
    resourceId: userId,
    metadata: { reason, permanent }
  });
  
  return { success: true };
});
```

---

## Files Involved

| File | Purpose | Status |
|------|---------|--------|
| `auth-service/src/migrations/001_auth_baseline.ts` | Schema with status | ✅ Exists |
| `auth-service/src/services/auth.service.ts` | Login (missing check) | ⚠️ Needs update |
| `auth-service/src/routes/admin.routes.ts` | Admin routes | ❌ Missing |
| `auth-service/src/services/admin.service.ts` | Admin service | ❌ Missing |

---

## Related Documents

- `SESSION_MANAGEMENT_FLOW_AUDIT.md` - Session revocation
- `ACCOUNT_DELETION_FLOW_AUDIT.md` - Account removal
- `ADMIN_BACKOFFICE_FLOW_AUDIT.md` - Admin tools (different service)
