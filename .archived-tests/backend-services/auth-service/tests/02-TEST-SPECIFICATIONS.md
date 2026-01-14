# AUTH SERVICE - DETAILED TEST SPECIFICATIONS

**Last Updated:** October 22, 2025  
**Purpose:** Comprehensive test case specifications for every function  
**Estimated Total Tests:** ~550+

This document provides detailed test specifications for EVERY function in auth-service.

---

## 📋 HOW TO USE THIS DOCUMENT

For each function, you'll find:
1. **Function signature** - What it does
2. **Test cases** - Every scenario to test
3. **Expected results** - What should happen
4. **Test data** - Input examples
5. **Edge cases** - Boundary conditions
6. **Security tests** - Attack vectors

---

## CONTROLLERS

### auth.controller.ts

---

#### Function: register(request, reply)

**Total Test Cases: 10**

##### Test 1: Valid Registration - Happy Path
- **Input:**
  ```json
  {
    "email": "newuser@test.com",
    "password": "SecurePass123!",
    "full_name": "Test User"
  }
  ```
- **Expected:**
  - Status: 201
  - Response: `{ user: {...}, accessToken: "...", refreshToken: "..." }`
  - User in database with hashed password
  - Email verification sent
  - User cached in Redis
- **Assertions:**
  - User ID is UUID
  - Password is hashed (not plain text)
  - email_verified is false
  - Tokens are valid JWTs
  - Cache contains user

##### Test 2: Duplicate Email
- **Input:**
  ```json
  {
    "email": "existing@test.com",  // Already exists
    "password": "SecurePass123!",
    "full_name": "Duplicate User"
  }
  ```
- **Expected:**
  - Status: 409 Conflict
  - Response: `{ error: "Email already registered" }`
  - Original user unchanged
  - No new database entry
- **Assertions:**
  - Error message doesn't reveal email exists (security)
  - Database has only 1 user with that email

##### Test 3: Invalid Email Format
- **Input:**
  ```json
  {
    "email": "notanemail",
    "password": "SecurePass123!",
    "full_name": "Test User"
  }
  ```
- **Expected:**
  - Status: 422 Validation Error
  - Response: `{ errors: [{ field: "email", message: "Invalid email format" }] }`
  - No database entry created
- **Assertions:**
  - Validation happens before database check

##### Test 4: Missing Required Fields
- **Input:**
  ```json
  {
    "email": "test@test.com"
    // Missing password and full_name
  }
  ```
- **Expected:**
  - Status: 422
  - Response: `{ errors: [{ field: "password", ... }, { field: "full_name", ... }] }`
  - All missing fields listed
- **Assertions:**
  - Error includes all missing fields
  - No partial user created

##### Test 5: Weak Password
- **Input:**
  ```json
  {
    "email": "test@test.com",
    "password": "weak",
    "full_name": "Test User"
  }
  ```
- **Expected:**
  - Status: 422
  - Response: `{ errors: [{ field: "password", message: "Password must be at least 8 characters..." }] }`
  - No user created
- **Assertions:**
  - Password requirements clearly stated
  - Requirements: 8+ chars, uppercase, lowercase, number, special char

##### Test 6: SQL Injection Attempt in Email
- **Input:**
  ```json
  {
    "email": "'; DROP TABLE users; --",
    "password": "SecurePass123!",
    "full_name": "Hacker"
  }
  ```
- **Expected:**
  - Status: 422 (validation error)
  - Response: Invalid email format
  - Database unchanged
  - No SQL executed
- **Assertions:**
  - Parameterized queries prevent injection
  - Email validation catches malicious input

##### Test 7: XSS Attempt in Name Field
- **Input:**
  ```json
  {
    "email": "test@test.com",
    "password": "SecurePass123!",
    "full_name": "<script>alert('xss')</script>"
  }
  ```
- **Expected:**
  - Status: 201 (succeeds)
  - full_name is sanitized/escaped in response
  - Stored safely in database
- **Assertions:**
  - Output is HTML-escaped
  - No script execution possible
  - Original malicious input stored but escaped on output

##### Test 8: User Cached After Creation
- **Input:** Valid registration data
- **Expected:**
  - User in database
  - User in Redis cache with key `user:{userId}`
  - Cache TTL set (e.g., 5 minutes)
- **Assertions:**
  - Redis has the user
  - Cache contains correct user data
  - TTL is set correctly

##### Test 9: Email Verification Sent
- **Input:** Valid registration data
- **Expected:**
  - Email sent to user's address
  - Email contains verification link
  - Verification token stored in database
- **Assertions:**
  - Email service called with correct params
  - Token is unique and secure
  - Token expires in 24 hours

##### Test 10: Audit Log Created
- **Input:** Valid registration data
- **Expected:**
  - Audit log entry created
  - Log contains: action='user.register', userId, timestamp, IP
- **Assertions:**
  - Audit table has new entry
  - Contains all required fields

---

#### Function: login(request, reply)

**Total Test Cases: 15**

##### Test 1: Valid Login - No MFA
- **Input:**
  ```json
  {
    "email": "user@test.com",
    "password": "CorrectPassword123!"
  }
  ```
- **Expected:**
  - Status: 200
  - Response: `{ user: {...}, accessToken: "...", refreshToken: "..." }`
  - Session created in database
  - User and session cached
- **Assertions:**
  - Tokens are valid
  - Session ID in database
  - Login attempt logged

##### Test 2: Invalid Password
- **Input:**
  ```json
  {
    "email": "user@test.com",
    "password": "WrongPassword123!"
  }
  ```
- **Expected:**
  - Status: 401 Unauthorized
  - Response: `{ error: "Invalid credentials" }`
  - Login attempt recorded
  - Brute force counter incremented
- **Assertions:**
  - Generic error (don't reveal which is wrong)
  - Failed attempt logged
  - No session created

##### Test 3: Non-Existent User
- **Input:**
  ```json
  {
    "email": "nonexistent@test.com",
    "password": "Password123!"
  }
  ```
- **Expected:**
  - Status: 401
  - Response: `{ error: "Invalid credentials" }`
  - Same error as wrong password (security)
- **Assertions:**
  - No timing attack vulnerability
  - Same response time as wrong password

##### Test 4: Account Locked (Too Many Failed Attempts)
- **Input:** Valid credentials for locked account
- **Expected:**
  - Status: 423 Locked
  - Response: `{ error: "Account locked due to too many failed attempts", unlockAt: "..." }`
  - Login attempt refused even with correct password
- **Assertions:**
  - Locked until specific time
  - Can't login even with correct password
  - Unlock time provided

##### Test 5: MFA Required - No Token Provided
- **Input:**
  ```json
  {
    "email": "mfauser@test.com",
    "password": "CorrectPassword123!"
  }
  ```
  (User has MFA enabled)
- **Expected:**
  - Status: 200
  - Response: `{ requiresMFA: true }`
  - No tokens provided
  - Temporary session created
- **Assertions:**
  - Password validated but login incomplete
  - requiresMFA flag set
  - No access token yet

##### Test 6: MFA - Valid TOTP Token
- **Input:**
  ```json
  {
    "email": "mfauser@test.com",
    "password": "CorrectPassword123!",
    "mfaToken": "123456"
  }
  ```
  (Valid TOTP token)
- **Expected:**
  - Status: 200
  - Response: `{ user, accessToken, refreshToken }`
  - Full login complete
- **Assertions:**
  - TOTP verified
  - Session created
  - Tokens issued

##### Test 7: MFA - Invalid TOTP Token
- **Input:**
  ```json
  {
    "email": "mfauser@test.com",
    "password": "CorrectPassword123!",
    "mfaToken": "000000"
  }
  ```
- **Expected:**
  - Status: 401
  - Response: `{ error: "Invalid MFA token" }`
  - No session created
  - Failed attempt logged
- **Assertions:**
  - Login denied
  - Counter incremented
  - Temp session cleared

##### Test 8: MFA - Valid Backup Code
- **Input:**
  ```json
  {
    "email": "mfauser@test.com",
    "password": "CorrectPassword123!",
    "backupCode": "abc123xyz789"
  }
  ```
- **Expected:**
  - Status: 200
  - Response: `{ user, accessToken, refreshToken }`
  - Backup code marked as used
  - Warning about remaining codes
- **Assertions:**
  - Backup code consumed
  - Can't be reused
  - User notified of remaining codes

##### Test 9: MFA - Expired Backup Code
- **Input:** Already-used backup code
- **Expected:**
  - Status: 401
  - Response: `{ error: "Invalid backup code" }`
- **Assertions:**
  - Code marked as used in DB
  - Login denied

##### Test 10: Unverified Email
- **Input:** Valid credentials but email not verified
- **Expected:**
  - Status: 403 Forbidden
  - Response: `{ error: "Please verify your email first" }`
  - No session created
- **Assertions:**
  - Email verification required
  - Link to resend verification

##### Test 11: Deleted/Deactivated Account
- **Input:** Valid credentials for soft-deleted user
- **Expected:**
  - Status: 401 or 403
  - Response: `{ error: "Account not found" }`
  - No session created
- **Assertions:**
  - Soft-deleted users can't login
  - Generic error message

##### Test 12: Rate Limiting
- **Input:** 10 login attempts in 1 minute (over limit)
- **Expected:**
  - Status: 429 Too Many Requests
  - Response: `{ error: "Too many login attempts", retryAfter: 60 }`
  - Login blocked even with correct credentials
- **Assertions:**
  - Rate limit enforced
  - Retry time provided
  - Headers: X-RateLimit-*

##### Test 13: Session Created and Cached
- **Input:** Valid login
- **Expected:**
  - Session record in database
  - Session cached in Redis
  - Cache key: `session:{sessionId}`
- **Assertions:**
  - Database and cache consistent
  - TTL matches token expiry

##### Test 14: Device Fingerprinting
- **Input:** Valid login with device info
- **Expected:**
  - Session includes device info (user agent, IP)
  - Device trust evaluated
  - New device warning email sent (if applicable)
- **Assertions:**
  - Device info captured
  - Trust score calculated
  - Email sent for new devices

##### Test 15: Concurrent Sessions
- **Input:** Multiple logins from different devices
- **Expected:**
  - Multiple active sessions allowed
  - Each session independent
  - Can list all sessions
- **Assertions:**
  - All sessions valid
  - Each has unique session ID
  - Can revoke individually

---

#### Function: refreshTokens(request, reply)

**Total Test Cases: 8**

##### Test 1: Valid Refresh Token
- **Input:**
  ```json
  {
    "refreshToken": "valid.refresh.token"
  }
  ```
- **Expected:**
  - Status: 200
  - Response: `{ accessToken: "new...", refreshToken: "new..." }`
  - Old refresh token blacklisted
  - New tokens issued
- **Assertions:**
  - New tokens are valid
  - Old refresh token no longer works
  - Token rotation occurred

##### Test 2: Expired Refresh Token
- **Input:** Expired refresh token
- **Expected:**
  - Status: 401
  - Response: `{ error: "Refresh token expired" }`
  - User must login again
- **Assertions:**
  - Token expiry checked
  - No new tokens issued

##### Test 3: Invalid Refresh Token
- **Input:**
  ```json
  {
    "refreshToken": "invalid.token.signature"
  }
  ```
- **Expected:**
  - Status: 401
  - Response: `{ error: "Invalid refresh token" }`
- **Assertions:**
  - Signature verification fails
  - No tokens issued

##### Test 4: Blacklisted Refresh Token
- **Input:** Previously revoked/used refresh token
- **Expected:**
  - Status: 401
  - Response: `{ error: "Token has been revoked" }`
- **Assertions:**
  - Blacklist checked
  - Token can't be reused

##### Test 5: Missing Refresh Token
- **Input:**
  ```json
  {}
  ```
- **Expected:**
  - Status: 422
  - Response: `{ error: "Refresh token required" }`
- **Assertions:**
  - Validation error
  - Field required

##### Test 6: Refresh Token for Deleted User
- **Input:** Valid token for deleted user
- **Expected:**
  - Status: 401
  - Response: `{ error: "User not found" }`
- **Assertions:**
  - User existence checked
  - Deleted users can't refresh

##### Test 7: Session Revoked
- **Input:** Valid token but session revoked
- **Expected:**
  - Status: 401
  - Response: `{ error: "Session has been revoked" }`
- **Assertions:**
  - Session status checked
  - Revoked sessions can't refresh

##### Test 8: Token Rotation Security
- **Input:** Attempt to reuse old refresh token after successful refresh
- **Expected:**
  - Status: 401
  - Response: `{ error: "Token already used" }`
  - Potential compromise detected
  - All user sessions revoked (security measure)
- **Assertions:**
  - Token reuse detected
  - Security protocol triggered
  - All sessions invalidated

---

#### Function: logout(request, reply)

**Total Test Cases: 6**

##### Test 1: Successful Logout
- **Input:** Authenticated request
- **Expected:**
  - Status: 204 No Content
  - Session revoked in database
  - User cache cleared
  - Session cache cleared
  - Tokens blacklisted
- **Assertions:**
  - Session marked as revoked
  - Redis cache empty
  - Tokens on blacklist

##### Test 2: Logout Without Authentication
- **Input:** No auth token
- **Expected:**
  - Status: 401
  - Response: `{ error: "Authentication required" }`
- **Assertions:**
  - Middleware blocks request
  - No logout performed

##### Test 3: Logout With Invalid Token
- **Input:** Invalid/expired token
- **Expected:**
  - Status: 401
  - Response: `{ error: "Invalid token" }`
- **Assertions:**
  - Auth middleware rejects
  - No logout performed

##### Test 4: Already Logged Out
- **Input:** Valid token but session already revoked
- **Expected:**
  - Status: 204 (idempotent - succeeds anyway)
  - No error
- **Assertions:**
  - Logout is idempotent
  - No errors thrown

##### Test 5: Cache Cleared Successfully
- **Input:** Authenticated logout
- **Expected:**
  - User cache deleted
  - Session cache deleted
  - Redis keys removed
- **Assertions:**
  - `user:{userId}` key gone
  - `session:{sessionId}` key gone
  - Cache is empty

##### Test 6: Audit Log Created
- **Input:** Successful logout
- **Expected:**
  - Audit log entry with action='user.logout'
  - Contains userId, sessionId, timestamp, IP
- **Assertions:**
  - Audit table has entry
  - All fields populated

---

#### Function: getMe(request, reply)

**Total Test Cases: 5**

##### Test 1: Cache Hit
- **Input:** Authenticated request, user in cache
- **Expected:**
  - Status: 200
  - Response: User object from cache
  - Database NOT queried
- **Assertions:**
  - Redis cache hit
  - Fast response time
  - Correct user data

##### Test 2: Cache Miss - Database Query
- **Input:** Authenticated request, user NOT in cache
- **Expected:**
  - Status: 200
  - Response: User object from database
  - User added to cache
- **Assertions:**
  - Database queried
  - Cache populated after query
  - Subsequent requests hit cache

##### Test 3: User Not Found
- **Input:** Valid token but user deleted
- **Expected:**
  - Status: 404
  - Response: `{ error: "User not found" }`
- **Assertions:**
  - Token valid but user gone
  - Appropriate error

##### Test 4: Unauthenticated Request
- **Input:** No auth token
- **Expected:**
  - Status: 401
  - Response: `{ error: "Authentication required" }`
- **Assertions:**
  - Middleware blocks
  - No user lookup

##### Test 5: Cache Expiry
- **Input:** Cache expired, user still exists
- **Expected:**
  - Database queried
  - Cache repopulated with new TTL
  - User returned
- **Assertions:**
  - TTL respected
  - Cache refreshed

---

*Continued for all 21 controller functions...*

---

## SERVICES

### auth.service.ts

---

#### Function: register(userData)

**Total Test Cases: 12**

##### Test 1: Successful User Creation
- **Input:**
  ```javascript
  {
    email: 'newuser@test.com',
    password: 'SecurePass123!',
    full_name: 'Test User',
    tenant_id: 'tenant-001'
  }
  ```
- **Expected:**
  - User inserted in database
  - Password hashed
  - Email verification email sent
  - Returns user object
- **Assertions:**
  - User has UUID
  - Password !== plain password
  - email_verified = false
  - created_at timestamp set

##### Test 2: Password Hashing
- **Input:** Plain password
- **Expected:**
  - Password hashed with bcrypt/argon2
  - Hash stored in database
  - Plain password never stored
- **Assertions:**
  - Password starts with $2b$ (bcrypt) or $argon2 (argon2)
  - Hash is 60+ characters
  - Can verify with comparePassword()

##### Test 3: Duplicate Email Prevention
- **Input:** Email that already exists
- **Expected:**
  - Database constraint violation
  - Error thrown: "Email already exists"
  - No user created
- **Assertions:**
  - UNIQUE constraint enforced
  - Error caught and rethrown

##### Test 4: Transaction Rollback on Email Failure
- **Input:** Valid user data but email service fails
- **Expected:**
  - User creation rolled back
  - No user in database
  - Error propagated
- **Assertions:**
  - Transaction atomic
  - Database clean on failure

##### Test 5: Default Values
- **Input:** Minimal user data
- **Expected:**
  - Default values applied:
    - role = 'user'
    - email_verified = false
    - mfa_enabled = false
    - is_active = true
- **Assertions:**
  - All defaults set correctly

##### Test 6: Tenant Isolation
- **Input:** User with tenant_id
- **Expected:**
  - User associated with tenant
  - tenant_id stored in database
- **Assertions:**
  - tenant_id field populated
  - Can filter by tenant

##### Test 7: Email Verification Token
- **Input:** New user
- **Expected:**
  - Verification token generated
  - Token stored with user
  - Token expires in 24 hours
- **Assertions:**
  - Token is secure random string
  - Expiry timestamp set
  - Token unique

##### Test 8: Audit Trail
- **Input:** User registration
- **Expected:**
  - Audit log entry created
  - Action: 'user.register'
  - Contains user_id, timestamp, IP
- **Assertions:**
  - Audit table has entry

##### Test 9: Rate Limiting Check
- **Input:** Registration attempt
- **Expected:**
  - Rate limit checked before creation
  - Throws if limit exceeded
- **Assertions:**
  - Rate limiter called
  - Limit enforced

##### Test 10: Email Format Validation
- **Input:** Invalid email format
- **Expected:**
  - Validation error before DB insert
  - No database query
- **Assertions:**
  - Email regex validated
  - Early rejection

##### Test 11: SQL Injection Prevention
- **Input:** Malicious SQL in email
- **Expected:**
  - Parameterized query prevents injection
  - Input treated as data, not code
- **Assertions:**
  - No SQL execution
  - Database unchanged

##### Test 12: Concurrent Registration Handling
- **Input:** Two simultaneous registrations with same email
- **Expected:**
  - One succeeds, one fails
  - Database constraint prevents duplicates
- **Assertions:**
  - Race condition handled
  - Only one user created

---

#### Function: login(credentials)

**Total Test Cases: 15**

##### Test 1: Successful Login
- **Input:**
  ```javascript
  {
    email: 'user@test.com',
    password: 'CorrectPassword123!'
  }
  ```
- **Expected:**
  - User retrieved from database
  - Password comparison succeeds
  - Session created
  - Tokens generated
  - Returns { user, tokens }
- **Assertions:**
  - All steps completed
  - Valid output

##### Test 2: Password Comparison
- **Input:** Correct password
- **Expected:**
  - bcrypt.compare() returns true
  - Login proceeds
- **Assertions:**
  - Password hash verified

##### Test 3: Wrong Password
- **Input:** Incorrect password
- **Expected:**
  - bcrypt.compare() returns false
  - Error thrown: "Invalid credentials"
  - Failed attempt logged
- **Assertions:**
  - Login denied
  - Attempt recorded

##### Test 4: Non-Existent User
- **Input:** Email not in database
- **Expected:**
  - User lookup returns null
  - Same error as wrong password
  - No timing difference
- **Assertions:**
  - Generic error
  - Consistent timing

##### Test 5: Account Locked
- **Input:** Credentials for locked account
- **Expected:**
  - Lock status checked
  - Error thrown: "Account locked"
  - Login refused
- **Assertions:**
  - Lock enforced
  - Unlock time provided

##### Test 6: Brute Force Protection
- **Input:** 5+ failed attempts
- **Expected:**
  - Account auto-locked
  - Lockout duration set
- **Assertions:**
  - Threshold enforced
  - Temporary lock

##### Test 7: MFA Flow - No Token
- **Input:** User with MFA enabled, no token provided
- **Expected:**
  - Password validated
  - Returns { requiresMFA: true }
  - No tokens yet
- **Assertions:**
  - Partial login
  - MFA required

##### Test 8: MFA Flow - Valid TOTP
- **Input:** MFA user with valid TOTP token
- **Expected:**
  - Password validated
  - TOTP verified
  - Full login completes
- **Assertions:**
  - TOTP service called
  - Tokens issued

##### Test 9: MFA Flow - Invalid TOTP
- **Input:** MFA user with wrong TOTP
- **Expected:**
  - TOTP verification fails
  - Login denied
  - Attempt logged
- **Assertions:**
  - MFA enforced
  - Failed attempt recorded

##### Test 10: MFA Flow - Backup Code
- **Input:** MFA user with valid backup code
- **Expected:**
  - Backup code verified
  - Code marked as used
  - Login succeeds
- **Assertions:**
  - Backup code consumed
  - Can't reuse

##### Test 11: Email Verification Check
- **Input:** Unverified email
- **Expected:**
  - email_verified checked
  - Login denied if false
- **Assertions:**
  - Verification enforced

##### Test 12: Session Creation
- **Input:** Successful login
- **Expected:**
  - Session record in database
  - Session includes device info
  - Session ID in tokens
- **Assertions:**
  - Session persisted
  - Metadata captured

##### Test 13: Token Generation
- **Input:** Successful login
- **Expected:**
  - Access token generated
  - Refresh token generated
  - Tokens returned
- **Assertions:**
  - Both tokens valid JWTs
  - Correct payload

##### Test 14: Soft-Deleted User
- **Input:** Credentials for deleted user
- **Expected:**
  - User lookup returns null
  - Login denied
- **Assertions:**
  - Soft delete respected

##### Test 15: Audit Logging
- **Input:** Login attempt
- **Expected:**
  - Audit log with action='user.login'
  - Success/failure logged
  - IP and device captured
- **Assertions:**
  - Audit trail complete

---

*Specifications continue for all ~150 service functions...*

---

## MIDDLEWARE

### auth.middleware.ts

---

#### Function: authenticate(request, reply)

**Total Test Cases: 12**

##### Test 1: Valid JWT Token
- **Input:** Bearer token in Authorization header
- **Expected:**
  - Token verified
  - User set on request
  - Middleware passes
- **Assertions:**
  - request.user populated
  - Next middleware called

##### Test 2: Invalid JWT Token
- **Input:** Malformed token
- **Expected:**
  - Status: 401
  - Error: "Invalid token"
  - Middleware blocks
- **Assertions:**
  - Request stopped
  - Error response sent

##### Test 3: Expired JWT Token
- **Input:** Expired token
- **Expected:**
  - Status: 401
  - Error: "Token expired"
- **Assertions:**
  - Expiry checked
  - Request denied

##### Test 4: Missing Authorization Header
- **Input:** No Authorization header
- **Expected:**
  - Status: 401
  - Error: "No token provided"
- **Assertions:**
  - Header required
  - Request blocked

##### Test 5: Blacklisted Token
- **Input:** Token on blacklist
- **Expected:**
  - Status: 401
  - Error: "Token has been revoked"
- **Assertions:**
  - Blacklist checked
  - Token rejected

##### Test 6: Valid API Key
- **Input:** x-api-key header
- **Expected:**
  - API key verified
  - User set on request
  - Middleware passes
- **Assertions:**
  - API key authentication works
  - request.user populated

##### Test 7: Invalid API Key
- **Input:** Invalid x-api-key
- **Expected:**
  - Status: 401
  - Error: "Invalid API key"
- **Assertions:**
  - API key rejected

##### Test 8: Expired API Key
- **Input:** Expired API key
- **Expected:**
  - Status: 401
  - Error: "API key expired"
- **Assertions:**
  - Expiry checked

##### Test 9: API Key Priority
- **Input:** Both API key and JWT token
- **Expected:**
  - API key used first
  - JWT ignored
- **Assertions:**
  - Priority order respected

##### Test 10: Cached API Key
- **Input:** API key in Redis cache
- **Expected:**
  - Cache hit
  - Database NOT queried
  - Fast verification
- **Assertions:**
  - Redis queried
  - No DB query

##### Test 11: User Not Found for Token
- **Input:** Valid token but user deleted
- **Expected:**
  - Status: 401
  - Error: "User not found"
- **Assertions:**
  - User existence checked

##### Test 12: Permission Extraction
- **Input:** Valid token
- **Expected:**
  - User permissions extracted
  - Available on request.user.permissions
- **Assertions:**
  - Permissions array populated

---

*Specifications continue for all middleware functions...*

---

## UTILS

### logger.ts

---

#### Function: sanitizeLog(data)

**Total Test Cases: 6**

##### Test 1: Remove Password Fields
- **Input:**
  ```javascript
  {
    email: 'user@test.com',
    password: 'SecretPass123!',
    name: 'Test User'
  }
  ```
- **Expected:**
  ```javascript
  {
    email: 'user@test.com',
    password: '[REDACTED]',
    name: 'Test User'
  }
  ```
- **Assertions:**
  - Password replaced
  - Other fields unchanged

##### Test 2: Remove JWT Tokens
- **Input:** Object with token fields
- **Expected:** Tokens replaced with [REDACTED]
- **Assertions:**
  - All token fields sanitized

##### Test 3: Remove Credit Card Numbers
- **Input:** Credit card in data
- **Expected:** Last 4 digits shown, rest masked
- **Assertions:**
  - PII protected

##### Test 4: Remove SSN
- **Input:** SSN in data
- **Expected:** Completely redacted
- **Assertions:**
  - Sensitive data removed

##### Test 5: Nested Object Sanitization
- **Input:** Nested object with passwords
- **Expected:** All nested passwords removed
- **Assertions:**
  - Recursive sanitization

##### Test 6: Array Handling
- **Input:** Array of objects with sensitive data
- **Expected:** Each object sanitized
- **Assertions:**
  - Arrays handled correctly

---

*Specifications continue for all utility functions...*

---

## 📝 TEST DATA REFERENCE

### Test Users
```javascript
const TEST_USERS = {
  VALID_USER: {
    email: 'testuser@test.com',
    password: 'TestPass123!',
    full_name: 'Test User'
  },
  MFA_USER: {
    email: 'mfauser@test.com',
    password: 'MFAPass123!',
    full_name: 'MFA User',
    mfa_enabled: true
  },
  ADMIN_USER: {
    email: 'admin@test.com',
    password: 'AdminPass123!',
    full_name: 'Admin User',
    role: 'admin'
  }
};
```

### Test Tokens
```javascript
const TEST_TOKENS = {
  VALID_ACCESS: 'eyJhbGc...',
  EXPIRED_ACCESS: 'eyJhbGc...',
  INVALID_SIGNATURE: 'eyJhbGc...',
  VALID_REFRESH: 'eyJhbGc...'
};
```

---

## 📊 SUMMARY

- **Total Functions:** 200+
- **Total Test Cases:** ~550+
- **Test Coverage Goal:** 100%
- **Test Types:** Unit, Integration, E2E

**For tracking progress:** See `00-MASTER-COVERAGE.md`  
**For function details:** See `01-FUNCTION-INVENTORY.md`
