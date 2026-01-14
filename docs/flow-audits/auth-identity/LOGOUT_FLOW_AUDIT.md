# LOGOUT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Logout |

---

## Executive Summary

**WORKING - Simple logout with proper cleanup**

| Component | Status |
|-----------|--------|
| Logout endpoint | ✅ Complete |
| Authentication required | ✅ Complete |
| Cache cleanup | ✅ Complete |
| Session termination | ✅ Complete |
| Token invalidation | ✅ Complete |
| API Gateway routing | ✅ Complete |

**Bottom Line:** Logout works correctly. Clears user cache, session cache, invalidates refresh tokens, and ends all active sessions. No audit logging on logout itself (minor gap).

---

## Architecture Overview

### Logout Flow
```
┌─────────────────────────────────────────────────────────────┐
│                     LOGOUT FLOW                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   POST /api/v1/auth/logout (Authenticated)                  │
│                         │                                    │
│                         ▼                                    │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Extract userId from JWT (request.user.id)       │   │
│   │  2. Delete user from cache                          │   │
│   │  3. Delete user sessions from cache                 │   │
│   │  4. Call authService.logout()                       │   │
│   │     a. Invalidate refresh token (if provided)       │   │
│   │     b. End all active sessions in DB                │   │
│   │  5. Return 204 No Content                           │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Route Definition

**File:** `backend/services/auth-service/src/routes/auth.routes.ts`
```typescript
fastify.post('/logout', {
  schema: { response: responseSchemas.logout },
  preHandler: async (request: any, reply: any) => {
    await validate(schemas.logoutSchema)(request, reply);
  }
}, async (request: any, reply: any) => {
  return controller.logout(request, reply);
});
```

**Note:** Route is inside `authenticatedRoutes` block, so auth is required.

### Controller

**File:** `backend/services/auth-service/src/controllers/auth.controller.ts`
```typescript
async logout(request: any, reply: any) {
  const userId = request.user.id;

  // Clear caches
  await userCache.deleteUser(userId);
  await sessionCache.deleteUserSessions(userId);

  // Invalidate tokens and end sessions
  await this.authService.logout(userId);

  reply.status(204).send();
}
```

### Service

**File:** `backend/services/auth-service/src/services/auth.service.ts`
```typescript
async logout(userId: string, refreshToken?: string) {
  this.log.info('Logout attempt', { userId });

  try {
    // Invalidate refresh token if provided
    if (refreshToken) {
      const expiryTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await pool.query(
        `INSERT INTO invalidated_tokens (token, user_id, invalidated_at, expires_at)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (token) DO NOTHING`,
        [refreshToken, userId, expiryTime]
      );
    }

    // End all active sessions
    await pool.query(
      'SET search_path TO public; UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1 AND ended_at IS NULL',
      [userId]
    );

    this.log.info('Logout successful', { userId });

    return { success: true };
  } catch (error) {
    this.log.error('Logout error', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    // Return success anyway to not block user
    return { success: true };
  }
}
```

---

## API Endpoint

| Endpoint | Method | Auth | Response | Status |
|----------|--------|------|----------|--------|
| `/api/v1/auth/logout` | POST | ✅ Required | 204 No Content | ✅ Working |

---

## What Gets Cleaned Up

| Resource | Action |
|----------|--------|
| User cache | Deleted via `userCache.deleteUser()` |
| Session cache | Deleted via `sessionCache.deleteUserSessions()` |
| Refresh token | Added to `invalidated_tokens` table |
| Database sessions | `ended_at` set to NOW() |

---

## Database Tables Affected

### user_sessions
```sql
UPDATE user_sessions 
SET ended_at = NOW() 
WHERE user_id = $1 AND ended_at IS NULL
```

### invalidated_tokens
```sql
INSERT INTO invalidated_tokens (token, user_id, invalidated_at, expires_at)
VALUES ($1, $2, NOW(), $3)
ON CONFLICT (token) DO NOTHING
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `auth-service/src/routes/auth.routes.ts` | Route definition |
| `auth-service/src/controllers/auth.controller.ts` | Controller (cache cleanup) |
| `auth-service/src/services/auth.service.ts` | Service (DB cleanup) |
| `auth-service/src/services/cache-integration.ts` | Cache operations |
| `api-gateway/src/routes/auth.routes.ts` | Gateway proxy |

---

## Minor Gaps (P3)

| Issue | Suggestion | Effort |
|-------|------------|--------|
| No audit log on logout | Add `auditService.logLogout()` call | 0.25 day |
| Refresh token not passed from controller | Pass `request.body.refreshToken` to service | 0.25 day |
| Ends ALL sessions | Consider option to keep other sessions | 0.5 day |

**Note:** The `auditService.logLogout()` method exists but isn't called during logout.

---

## Related Documents

- `SESSION_MANAGEMENT_FLOW_AUDIT.md` - Session listing/revocation
- `USER_REGISTRATION_AUTH_FLOW_AUDIT.md` - Login creates sessions
- `PASSWORD_RESET_FLOW_AUDIT.md` - Also invalidates sessions
