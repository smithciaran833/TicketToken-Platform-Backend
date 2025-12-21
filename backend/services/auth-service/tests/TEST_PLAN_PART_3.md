# Auth Service Test Plan - Part 3: Security & Infrastructure Services

> **Target Coverage:** 80-100% code coverage  
> **Files Covered:** 9 security and infrastructure service files  
> **Estimated Tests:** ~140 tests

---

## FILE 13: `src/services/brute-force-protection.service.ts`

### Methods & Coverage Requirements

#### 1. `constructor(redis)` - 1 branch

**Test Cases:**
```
✓ Should initialize with injected Redis client
✓ Should have default maxAttempts=5
✓ Should have default lockoutDuration=15 minutes
✓ Should have default attemptWindow=15 minutes
```

#### 2. `recordFailedAttempt(identifier)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Already locked | `auth_lock:${identifier}` exists |
| 2 | First attempt (attempts === 1) | Fresh identifier |
| 3 | Max attempts reached (attempts >= 5) | 5th failed attempt |
| 4 | Normal increment | 2-4 attempts |

**Test Cases:**
```
✓ Should return locked:true when already locked
✓ Should return lockoutUntil based on TTL when locked
✓ Should increment counter in Redis
✓ Should set expiry on first attempt only
✓ Should NOT set expiry on subsequent attempts
✓ Should lock when attempts >= maxAttempts
✓ Should delete attempts counter when locked
✓ Should set lock key with lockoutDuration
✓ Should return remainingAttempts correctly
```

#### 3. `clearFailedAttempts(identifier)` - 1 branch

**Test Cases:**
```
✓ Should delete `failed_auth:${identifier}` key
```

#### 4. `isLocked(identifier)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Lock key exists | Locked identifier |
| 2 | Lock key doesn't exist | Unlocked identifier |

**Test Cases:**
```
✓ Should return true when lock key exists
✓ Should return false when lock key doesn't exist
```

#### 5. `getLockInfo(identifier)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | TTL > 0 | Locked with remaining time |
| 2 | TTL <= 0 | Not locked or expired |

**Test Cases:**
```
✓ Should return locked:true with remainingTime when locked
✓ Should return locked:false when not locked
```

---

## FILE 14: `src/services/lockout.service.ts`

### Methods & Coverage Requirements

#### 1. `constructor()` - 1 branch

**Test Cases:**
```
✓ Should initialize maxAttempts from env.LOCKOUT_MAX_ATTEMPTS
✓ Should convert lockoutDuration from minutes to seconds
```

#### 2. `recordFailedAttempt(userId, ipAddress)` - 5 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | User first attempt (userAttempts === 1) | Fresh userId |
| 2 | IP first attempt (ipAttempts === 1) | Fresh IP |
| 3 | User max reached | userAttempts >= maxAttempts |
| 4 | IP max reached (2x limit) | ipAttempts >= maxAttempts * 2 |
| 5 | Normal increment | Under both limits |

**Errors:**
- `RateLimitError`: Account locked due to too many failed attempts

**Test Cases:**
```
✓ Should increment both user and IP keys in parallel
✓ Should set expiry on user key when userAttempts === 1
✓ Should set expiry on IP key when ipAttempts === 1
✓ Should throw RateLimitError when user max reached
✓ Should throw RateLimitError when IP max reached (2x limit)
✓ Should include TTL in error message
✓ Should not throw when under limits
```

#### 3. `checkLockout(userId, ipAddress)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | User locked | userAttempts >= maxAttempts |
| 2 | IP locked | ipAttempts >= maxAttempts * 2 |
| 3 | Neither key exists | Fresh user/IP |
| 4 | Under limits | Attempts below thresholds |

**Errors:**
- `RateLimitError`: Account locked or IP blocked

**Test Cases:**
```
✓ Should throw RateLimitError when user is locked
✓ Should throw RateLimitError when IP is locked
✓ Should pass silently when not locked
✓ Should pass when keys don't exist
```

#### 4. `clearFailedAttempts(userId, ipAddress)` - 1 branch

**Test Cases:**
```
✓ Should delete both user and IP keys in parallel
```

---

## FILE 15: `src/services/rate-limit.service.ts`

### Methods & Coverage Requirements

#### 1. `constructor()` - 1 branch

**Test Cases:**
```
✓ Should initialize limits Map with login, register, wallet
✓ Should have correct defaults for each action
```

#### 2. `consume(action, venueId, identifier)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Unknown action | Use action not in limits Map |
| 2 | VenueId provided | Pass non-null venueId |
| 3 | First request (current === 1) | Fresh key |
| 4 | Limit exceeded (current > points) | Exceed the limit |

**Errors:**
- `Error: Rate limit exceeded. Try again in ${ttl} seconds.`

**Test Cases:**
```
✓ Should use default limit for unknown actions
✓ Should include venueId in key when provided
✓ Should exclude venueId from key when null
✓ Should set expiry on first request only
✓ Should throw when limit exceeded
✓ Should include TTL in error message
✓ Should allow requests up to the limit
✓ Should use correct limits for 'login' (5/60s)
✓ Should use correct limits for 'register' (3/300s)
✓ Should use correct limits for 'wallet' (10/60s)
```

---

## FILE 16: `src/services/device-trust.service.ts`

### Methods & Coverage Requirements

#### 1. `generateFingerprint(request)` - 1 branch

**Test Cases:**
```
✓ Should generate SHA256 hash of request components
✓ Should include user-agent, accept-language, accept-encoding, ip
✓ Should use empty string for missing headers
✓ Should return hex digest
```

#### 2. `calculateTrustScore(userId, fingerprint)` - 6 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Device not found | Unknown fingerprint |
| 2 | Age < 10 days | New device |
| 3 | Age 10-200 days | Various age bonuses |
| 4 | Last seen < 1 day | Recent activity |
| 5 | Last seen 1-7 days | Moderate activity |
| 6 | Last seen 7-30 days | Low activity |

**Test Cases:**
```
✓ Should return 0 for unknown device
✓ Should return base score of 50 for known device
✓ Should add age bonus (up to 20 points)
✓ Should add 30 points for activity < 1 day
✓ Should add 20 points for activity 1-7 days
✓ Should add 10 points for activity 7-30 days
✓ Should cap score at 100
```

#### 3. `recordDeviceActivity(userId, fingerprint, success)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | New device, success=true | Unknown fingerprint, success |
| 2 | New device, success=false | Unknown fingerprint, failure |
| 3 | Existing device, success=true | Known fingerprint, success |
| 4 | Existing device, success=false | Known fingerprint, failure |

**Test Cases:**
```
✓ Should insert new device with trust_score=50 on success
✓ Should insert new device with trust_score=0 on failure
✓ Should increase score by 5 on success (max 100)
✓ Should decrease score by 10 on failure (min 0)
✓ Should update last_seen timestamp
```

#### 4. `requiresAdditionalVerification(userId, fingerprint)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Score < 30 | Low trust device |
| 2 | Score >= 30 | Trusted device |

**Test Cases:**
```
✓ Should return true for score < 30
✓ Should return false for score >= 30
```

---

## FILE 17: `src/services/rbac.service.ts`

### Methods & Coverage Requirements

#### 1. `constructor()` - 1 branch

**Test Cases:**
```
✓ Should initialize roles Map with 5 roles
✓ Should have correct permissions for venue-owner (wildcard)
✓ Should have correct permissions for venue-manager
✓ Should have correct permissions for box-office
✓ Should have correct permissions for door-staff
✓ Should have correct permissions for customer
```

#### 2. `getUserPermissions(userId, venueId?)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | No venueId provided | Omit venueId |
| 2 | VenueId with active roles | User has venue roles |
| 3 | VenueId with expired roles | Role expired |
| 4 | VenueId with inactive roles | is_active=false |

**Test Cases:**
```
✓ Should return customer permissions by default
✓ Should add venue role permissions when venueId provided
✓ Should exclude expired roles
✓ Should exclude inactive roles
✓ Should include roles with null expires_at
✓ Should deduplicate permissions
```

#### 3. `checkPermission(userId, permission, venueId?)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Has wildcard (*) | venue-owner role |
| 2 | Has specific permission | Direct permission match |
| 3 | Missing permission | No matching permission |

**Test Cases:**
```
✓ Should return true for wildcard permission
✓ Should return true for specific permission match
✓ Should return false for missing permission
```

#### 4. `requirePermission(userId, permission, venueId?)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Has permission | Valid permission |
| 2 | Missing permission | No permission |

**Errors:**
- `AuthorizationError: Missing required permission: ${permission}`

**Test Cases:**
```
✓ Should pass silently when has permission
✓ Should throw AuthorizationError when missing permission
```

#### 5. `grantVenueRole(userId, venueId, role, grantedBy, expiresAt?)` - 5 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Invalid role | Role not in Map |
| 2 | Granter lacks permission | No roles:manage |
| 3 | Existing role, with expiresAt | Update expiration |
| 4 | Existing role, no expiresAt | No update needed |
| 5 | New role | Insert new |

**Errors:**
- `Error: Invalid role: ${role}`
- `AuthorizationError`: from requirePermission

**Test Cases:**
```
✓ Should throw for invalid role
✓ Should throw if granter lacks roles:manage permission
✓ Should update expires_at for existing role
✓ Should skip update when existing role and no expiresAt
✓ Should insert new role with all fields
```

#### 6. `revokeVenueRole(userId, venueId, role, revokedBy)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Revoker lacks permission | No roles:manage |
| 2 | Success | Has permission |

**Errors:**
- `AuthorizationError`: from requirePermission

**Test Cases:**
```
✓ Should throw if revoker lacks permission
✓ Should set is_active=false for role
```

#### 7. `getUserVenueRoles(userId)` - 1 branch

**Test Cases:**
```
✓ Should return active roles for user
✓ Should exclude expired roles
✓ Should include roles with null expires_at
✓ Should return venue_id, role, granted_at, expires_at
```

---

## FILE 18: `src/services/audit.service.ts`

### Methods & Coverage Requirements

#### 1. `log(event)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Success | Normal logging |
| 2 | Error in try block | DB insert fails |

**Test Cases:**
```
✓ Should insert audit log to database
✓ Should stringify metadata to JSON
✓ Should use null for undefined metadata
✓ Should log to auditLogger
✓ Should not throw on error (silent fail)
✓ Should log error to auditLogger on failure
```

#### 2. `logLogin(userId, ipAddress, userAgent, success, errorMessage?)` - 1 branch

**Test Cases:**
```
✓ Should call log with action='user.login'
✓ Should call log with actionType='authentication'
✓ Should set status based on success param
✓ Should include errorMessage when provided
```

#### 3. `logRegistration(userId, email, ipAddress)` - 1 branch

**Test Cases:**
```
✓ Should call log with action='user.registration'
✓ Should include email in metadata
```

#### 4. `logPasswordChange(userId, ipAddress)` - 1 branch

**Test Cases:**
```
✓ Should call log with action='user.password_changed'
✓ Should set actionType='security'
```

#### 5. `logMFAEnabled(userId)` - 1 branch

**Test Cases:**
```
✓ Should call log with action='user.mfa_enabled'
```

#### 6. `logTokenRefresh(userId, ipAddress)` - 1 branch

**Test Cases:**
```
✓ Should call log with action='token.refreshed'
```

#### 7. `logRoleGrant(grantedBy, userId, venueId, role)` - 1 branch

**Test Cases:**
```
✓ Should call log with action='role.granted'
✓ Should include targetUserId and role in metadata
```

---

## FILE 19: `src/services/cache.service.ts`

### Methods & Coverage Requirements

#### 1. `getInstance()` - 2 branches (Singleton)

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | First call | No instance exists |
| 2 | Subsequent calls | Instance already exists |

**Test Cases:**
```
✓ Should create new instance on first call
✓ Should return same instance on subsequent calls
```

#### 2. `get(key)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Key not found | Unknown key |
| 2 | Key expired | Item past expires timestamp |
| 3 | Valid key | Key exists and not expired |

**Test Cases:**
```
✓ Should return null for unknown key
✓ Should return null and delete for expired key
✓ Should return value for valid key
```

#### 3. `set(key, value, ttl)` - 1 branch

**Test Cases:**
```
✓ Should store value with calculated expires timestamp
✓ Should convert TTL from seconds to milliseconds
```

#### 4. `checkLimit(key, limit, window)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Under limit (count < limit) | Few requests |
| 2 | At or over limit (count >= limit) | Many requests |

**Test Cases:**
```
✓ Should return true and increment when under limit
✓ Should return false when at limit
✓ Should use window as TTL
✓ Should handle missing keys (treat as 0)
```

---

## FILE 20: `src/services/cache-integration.ts`

### Exports & Coverage Requirements

#### `sessionCache` Object

**Methods:**
- `getSession(sessionId)` - 1 branch
- `setSession(sessionId, data)` - 1 branch
- `deleteSession(sessionId)` - 1 branch
- `deleteUserSessions(userId)` - 1 branch

**Test Cases:**
```
✓ getSession: Should get with correct key and TTL
✓ setSession: Should set with userId tag
✓ deleteSession: Should delete session key
✓ deleteUserSessions: Should delete by user tag
```

#### `userCache` Object

**Methods:**
- `getUser(userId)` - 1 branch
- `setUser(userId, userData)` - 1 branch
- `deleteUser(userId)` - 1 branch
- `getUserWithFetch(userId, fetcher)` - 1 branch

**Test Cases:**
```
✓ getUser: Should get with correct key
✓ setUser: Should set with 5 min TTL
✓ deleteUser: Should delete user and tags
✓ getUserWithFetch: Should use fetcher when cache miss
```

#### `tokenBlacklist` Object

**Methods:**
- `add(token, expiresIn)` - 1 branch
- `check(token)` - 2 branches

**Test Cases:**
```
✓ add: Should set in L2 (Redis only)
✓ check: Should return true when blacklisted
✓ check: Should return false when not blacklisted
```

#### `rateLimitCache` Object

**Methods:**
- `checkLimit(key, limit, window)` - 2 branches
- `reset(key)` - 1 branch

**Test Cases:**
```
✓ checkLimit: Should return true and increment under limit
✓ checkLimit: Should return false at limit
✓ reset: Should delete rate limit key
```

#### `getCacheStats()` - 1 branch

**Test Cases:**
```
✓ Should return cache statistics
```

---

## FILE 21: `src/services/monitoring.service.ts`

### Methods & Coverage Requirements

#### 1. `performHealthCheck()` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | All healthy | All checks return 'ok' |
| 2 | Some unhealthy | At least one check returns 'error' |
| 3 | Degraded | Mix of ok/warning (if implemented) |

**Test Cases:**
```
✓ Should return 'healthy' when all checks pass
✓ Should return 'unhealthy' when any check fails
✓ Should include timestamp and version
✓ Should include uptime
```

#### 2. `checkDatabase()` (private) - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Success | DB responds to SELECT 1 |
| 2 | Error | DB connection fails |

**Test Cases:**
```
✓ Should return status:'ok' with latency on success
✓ Should include pool connection stats
✓ Should return status:'error' with message on failure
```

#### 3. `checkRedis()` (private) - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Success | Redis responds to PING |
| 2 | Error | Redis connection fails |

**Test Cases:**
```
✓ Should return status:'ok' with latency on success
✓ Should parse connected_clients from INFO
✓ Should return status:'error' with message on failure
```

#### 4. `checkMemory()` (private) - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | High memory (heapUsedMB > 500) | Mock memory usage |
| 2 | Normal memory | Mock low memory |

**Test Cases:**
```
✓ Should return status:'error' when heap > 500MB
✓ Should return status:'ok' when heap <= 500MB
✓ Should include heap stats in details
```

#### 5. `getMetrics()` - 1 branch

**Test Cases:**
```
✓ Should return Prometheus-formatted metrics
✓ Should include uptime metric
✓ Should include memory metrics
✓ Should include DB pool metrics
```

#### 6. `setupMonitoring(fastify, monitoringService)` - Routes

**/health** - 3 branches
| Branch | Condition | HTTP Status |
|--------|-----------|-------------|
| 1 | Healthy | 200 |
| 2 | Degraded | 200 |
| 3 | Unhealthy | 503 |

**/metrics** - 1 branch

**/live** - 1 branch

**/ready** - 2 branches
| Branch | Condition | HTTP Status |
|--------|-----------|-------------|
| 1 | DB and Redis ok | 200 with ready:true |
| 2 | DB or Redis fails | 503 with ready:false |

**Test Cases:**
```
✓ /health: Should return 200 for healthy
✓ /health: Should return 503 for unhealthy
✓ /metrics: Should return text/plain with metrics
✓ /live: Should always return {status:'alive'}
✓ /ready: Should return 200 when dependencies ok
✓ /ready: Should return 503 when dependency fails
```

---

## PART 3 SUMMARY: TEST COUNT ESTIMATE

| File | Estimated Tests | Priority |
|------|-----------------|----------|
| brute-force-protection.service.ts | 15 tests | P0 - Critical |
| lockout.service.ts | 12 tests | P0 - Critical |
| rate-limit.service.ts | 12 tests | P0 - Critical |
| device-trust.service.ts | 15 tests | P1 - High |
| rbac.service.ts | 25 tests | P0 - Critical |
| audit.service.ts | 15 tests | P1 - High |
| cache.service.ts | 10 tests | P1 - High |
| cache-integration.ts | 18 tests | P1 - High |
| monitoring.service.ts | 18 tests | P1 - High |
| **Part 3 TOTAL** | **~140 tests** | |

---

## Testing Strategy

### Unit Tests
- Mock all external dependencies (database, Redis)
- Test each function in isolation
- Focus on branch coverage

### Integration Tests
- Use real database (test instance)
- Use real Redis (test instance)  
- Test complete flows end-to-end

### Mocking Requirements

| Dependency | Mock Method |
|------------|-------------|
| `pool` / `db` | jest.mock('../config/database') |
| `redis` | jest.mock('../config/redis') |

### Test File Structure
```
tests/
├── unit/
│   └── services/
│       ├── brute-force-protection.service.test.ts
│       ├── lockout.service.test.ts
│       ├── rate-limit.service.test.ts
│       ├── device-trust.service.test.ts
│       ├── rbac.service.test.ts
│       ├── audit.service.test.ts
│       ├── cache.service.test.ts
│       ├── cache-integration.test.ts
│       └── monitoring.service.test.ts
└── integration/
    └── security-flows.integration.test.ts
```

---

## Coverage Targets

| Metric | Target |
|--------|--------|
| Line Coverage | ≥ 80% |
| Branch Coverage | ≥ 80% |
| Function Coverage | 100% |
| Statement Coverage | ≥ 80% |
