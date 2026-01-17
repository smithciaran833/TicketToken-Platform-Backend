# Auth Service Services Analysis - Batch 3
## Infrastructure & Support
## Purpose: Integration Testing Documentation
## Source: cache.service.ts, cache-fallback.service.ts, cache-integration.ts, email.service.ts, audit.service.ts, rbac.service.ts, monitoring.service.ts
## Generated: 2026-01-15

---

### 1. cache.service.ts

**DATABASE OPERATIONS:** None

**REDIS OPERATIONS:** None (uses in-memory Map, not Redis)

**SERVICE DEPENDENCIES:** None

**EXTERNAL CALLS:** None

**CACHING STRATEGY:**
- Simple in-memory cache using JavaScript `Map`
- TTL-based expiration (seconds)
- Operations: `get()`, `set(key, value, ttl)`, `checkLimit(key, limit, window)`

**ERROR HANDLING:** None (returns null on miss/expiry)

**Note:** This appears to be a fallback/stub cache - NOT the primary caching mechanism.

---

### 2. cache-fallback.service.ts

**DATABASE OPERATIONS:** None (but integrates with DB operations as fallback)

**REDIS OPERATIONS:**
| Key Pattern | Operation | TTL |
|-------------|-----------|-----|
| `cache:user:{tenantId}:{userId}:profile` | GET/SETEX/DEL | 300s (5 min) |
| `cache:user:{tenantId}:{userId}:permissions` | GET/SETEX/DEL | 60s (1 min) |
| `cache:tenant:{tenantId}:config` | defined but unused | 600s (10 min) |

**SERVICE DEPENDENCIES:**
- `../config/redis` → `getRedis()`
- `../utils/metrics` → `register` (prom-client)
- `../utils/logger` → `logger`

**EXTERNAL CALLS:** None

**CACHING STRATEGY:**
- **Fallback only** - used when database is unavailable
- Read-through pattern with `withFallback()` method
- Caches: user profiles, permissions
- **Invalidation triggers:** `invalidateUserCache()` - deletes both profile and permissions keys

**FALLBACK BEHAVIOR:**
- `withFallback()` tries DB first, falls back to Redis cache
- Only activates on connection errors: `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `Connection terminated`
- Returns `{ data, fromCache: boolean }` to indicate source

**ERROR HANDLING:**
- All cache operations wrapped in try/catch - failures are logged but don't throw
- Re-throws original DB error if cache also misses

**METRICS:**
- `auth_cache_fallback_total` (Counter) - labels: operation, status
- `auth_cache_hit_total` (Counter) - labels: operation
- `auth_cache_miss_total` (Counter) - labels: operation

---

### 3. cache-integration.ts

**DATABASE OPERATIONS:** None

**REDIS OPERATIONS:**
| Key Pattern | Operation | TTL |
|-------------|-----------|-----|
| `auth:session:{sessionId}` | GET/SET/DEL | 300s (5 min) |
| `auth:user:{userId}` | GET/SET/DEL | 300s (5 min) |
| `auth:blacklist:{token}` | GET/SET | varies (expiresIn) |
| `auth:ratelimit:{key}` | GET/SET/DEL | window (varies) |

**SERVICE DEPENDENCIES:**
- `@tickettoken/shared` → `createCache()`
- `../config/env` → `env`

**EXTERNAL CALLS:** None

**CACHING STRATEGY:**
- Two-tier cache (local L1 + Redis L2) via shared library
- **Session cache:** L1+L2, 5 min TTL, tagged by `user:{userId}`
- **User cache:** L1+L2, 5 min TTL
- **Token blacklist:** L2 only (Redis), TTL = token expiry time
- **Rate limit:** L2 only (Redis)

**CACHE INVALIDATION:**
- `sessionCache.deleteUserSessions(userId)` - deletes by tag
- `userCache.deleteUser(userId)` - deletes key + all tagged entries
- `rateLimitCache.reset(key)` - deletes specific rate limit key

**Key Exports:**
- `cache`, `cacheMiddleware`, `cacheStrategies`, `cacheInvalidator`
- `sessionCache`, `userCache`, `tokenBlacklist`, `rateLimitCache`, `serviceCache`

---

### 4. email.service.ts

**DATABASE OPERATIONS:** None

**REDIS OPERATIONS:**
| Key Pattern | Operation | TTL |
|-------------|-----------|-----|
| `redisKeys.emailVerify(token, tenantId)` | SETEX | 86400s (24 hr) |
| `redisKeys.passwordReset(token, tenantId)` | SETEX | 3600s (1 hr) |

**SERVICE DEPENDENCIES:**
- `../config/redis` → `getRedis()`
- `../config/env` → `env`
- `../utils/redisKeys` → `redisKeys`

**EXTERNAL CALLS:**
| Provider | Operation | When |
|----------|-----------|------|
| Resend API | `resend.emails.send()` | Production only |

**CACHING STRATEGY:** N/A (stores verification tokens, not cache)

**ERROR HANDLING:**
- Dev/Test: Logs email instead of sending
- Production: Throws `Error('Failed to send email: {message}')` on Resend API error
- Throws `Error('Failed to send email. Please try again later.')` on general failure

**Email Types:**
- `sendVerificationEmail()` - verification link, 24hr expiry
- `sendPasswordResetEmail()` - reset link, 1hr expiry  
- `sendMFABackupCodesEmail()` - MFA backup codes (no Redis storage)

---

### 5. audit.service.ts

**DATABASE OPERATIONS:**
| Table | Operation | When |
|-------|-----------|------|
| `audit_logs` | INSERT | Every audit event |
| `token_refresh_log` | INSERT | Token refresh events |

**Audit Log Insert Schema:**
```typescript
{
  service: 'auth-service',
  action_type: string,
  resource_type: string,
  user_id: string,
  tenant_id: string,
  action: string,
  resource_id: string,
  ip_address: string,
  user_agent: string,
  metadata: JSON string,
  success: boolean,
  error_message: string,
  created_at: Date
}
```

**REDIS OPERATIONS:** None

**SERVICE DEPENDENCIES:**
- `../config/database` → `db` (Knex)
- `../utils/logger` → `logger`, `getCorrelationId()`

**EXTERNAL CALLS:** None

**AUDIT EVENTS LOGGED:**
| Method | Action | Action Type |
|--------|--------|-------------|
| `logLogin()` | user.login | authentication |
| `logLogout()` | user.logout | authentication |
| `logRegistration()` | user.registration | authentication |
| `logTokenRefresh()` | (separate table) | - |
| `logSessionCreated()` | session.created | session |
| `logSessionRevoked()` | session.revoked | session |
| `logAllSessionsRevoked()` | session.all_revoked | session |
| `logPasswordChange()` | user.password_changed | security |
| `logPasswordReset()` | user.password_reset | security |
| `logMFAEnabled()` | user.mfa_enabled | security |
| `logMFADisabled()` | user.mfa_disabled | security |
| `logMFAVerification()` | user.mfa_verified/failed | security |
| `logFailedLoginAttempt()` | user.login_failed | security |
| `logAccountLockout()` | user.account_locked | security |
| `logRoleGrant()` | role.granted | authorization |
| `logRoleRevoke()` | role.revoked | authorization |
| `logPermissionDenied()` | permission.denied | authorization |
| `logDataExport()` | data.exported | data_access |
| `logDataDeletion()` | data.deleted | data_access |

**ERROR HANDLING:**
- All DB errors logged but swallowed (no throw)

---

### 6. rbac.service.ts

**DATABASE OPERATIONS:**
| Table | Operation | When |
|-------|-----------|------|
| `user_venue_roles` | SELECT | `getUserPermissions()`, `getUserVenueRoles()`, `getVenueRoles()` |
| `user_venue_roles` | INSERT | `grantVenueRole()` |
| `user_venue_roles` | UPDATE | `grantVenueRole()` (update expiry), `revokeVenueRole()`, `revokeVenueRoles()` |

**Query Details:**
```sql
-- getUserPermissions (SELECT)
WHERE user_id = ? AND tenant_id = ? AND venue_id = ? AND is_active = true
  AND (expires_at > NOW() OR expires_at IS NULL)

-- grantVenueRole (INSERT)
INSERT INTO user_venue_roles (user_id, tenant_id, venue_id, role, granted_by, expires_at)

-- revokeVenueRole (UPDATE)
UPDATE user_venue_roles SET is_active = false
WHERE user_id = ? AND tenant_id = ? AND venue_id = ? AND role = ? AND is_active = true
```

**REDIS OPERATIONS:** None

**SERVICE DEPENDENCIES:**
- `../config/database` → `db` (Knex)
- `../errors` → `AuthorizationError`

**RBAC LOGIC:**

**Role Hierarchy:**
| Role | Permissions | Venue-Scoped |
|------|-------------|--------------|
| venue-owner | `*` (all) | Yes |
| venue-manager | events:*, tickets:view/validate, reports:* | Yes |
| box-office | tickets:sell/view/validate, payments:process, reports:daily | Yes |
| door-staff | tickets:validate/view | Yes |
| customer | tickets:purchase/view-own/transfer-own, profile:update-own | No |

**Permission Checking:**
- `checkPermission()` - returns boolean
- `requirePermission()` - throws `AuthorizationError` if missing
- Wildcard `*` grants all permissions

**ERROR HANDLING:**
- Throws `AuthorizationError('Missing required permission: {permission}')`
- Throws `Error('Invalid role: {role}')` for unknown roles

---

### 7. monitoring.service.ts

**DATABASE OPERATIONS:**
| Table | Operation | When |
|-------|-----------|------|
| (none directly) | `SELECT 1` | Health check ping |

**REDIS OPERATIONS:**
| Operation | When |
|-----------|------|
| `PING` | Health check |
| `INFO stats` | Health check details |

**SERVICE DEPENDENCIES:**
- `../config/database` → `db`, `pool`
- `../config/redis` → `getRedis()`
- `../utils/logger` → `logger`
- `../utils/metrics` → `register`

**EXTERNAL CALLS:** None

**HEALTH CHECK ENDPOINTS:**
| Endpoint | Purpose | K8s Probe |
|----------|---------|-----------|
| `/health/live` | Process alive | Liveness |
| `/health/ready` | Can handle traffic (DB+Redis) | Readiness |
| `/health/startup` | Initial startup complete | Startup |
| `/health` | Full health with details | - |
| `/metrics` | Prometheus metrics | - |

**METRICS EXPOSED:**
- `auth_service_uptime_seconds`
- `auth_service_memory_heap_used_bytes`
- `auth_service_memory_rss_bytes`
- `auth_service_db_pool_total`
- `auth_service_db_pool_idle`
- `auth_service_db_pool_waiting`
- `auth_service_startup_complete`

**HEALTH CHECK THRESHOLDS:**
- Timeout: 5000ms per check
- Memory unhealthy: heap > 500MB OR heap usage > 90%

**ERROR HANDLING:**
- Returns 503 status on unhealthy checks
- Timeout errors after 5000ms

---

## Summary for Integration Testing

### External Dependencies to Mock/Stub:
1. **PostgreSQL** - `audit_logs`, `token_refresh_log`, `user_venue_roles` tables
2. **Redis** - Multiple key patterns with different TTLs
3. **Resend API** - Email delivery (production only)

### Critical Integration Points:
1. **Cache Fallback** - Test DB failure scenarios trigger cache reads
2. **RBAC** - Test venue-scoped permission inheritance and expiry
3. **Audit Logging** - Verify all events captured with correct action types
4. **Health Checks** - Test degraded states when DB/Redis partially unavailable

### Key Test Scenarios:
1. Cache fallback activates on connection errors (ECONNREFUSED, ETIMEDOUT, etc.)
2. Permission cache has shorter TTL (60s) than profile cache (300s)
3. Token blacklist uses Redis-only (L2) storage
4. Role grants require `roles:manage` permission check
5. Health endpoint returns 503 when any check fails
