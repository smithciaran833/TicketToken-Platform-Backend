# PHASE 1 - CRITICAL AUTH FLOWS 🔥

**Priority:** HIGHEST - Do these first  
**Time Estimate:** 6-8 hours  
**Goal:** Test core auth flows that MUST work

---

## TEST FILES TO CREATE

### 1. `auth-flow.test.ts` ⭐ MOST IMPORTANT
**Core authentication end-to-end**
- User registration (email/password)
- Email validation
- Login with valid credentials
- Login with invalid credentials
- Logout and token invalidation
- Token refresh flow
- Access token expiration
- Refresh token expiration
- Password reset request → email → reset completion

**Files Tested:**
- controllers/auth.controller.ts
- services/auth.service.ts
- services/jwt.service.ts
- services/email.service.ts

---

### 2. `jwt-security.test.ts`
**JWT token security**
- Generate valid JWT tokens
- Verify valid tokens
- Reject expired tokens
- Reject malformed tokens
- Reject tampered tokens (signature mismatch)
- Token payload validation
- Token blacklisting after logout
- Refresh token rotation

**Files Tested:**
- services/jwt.service.ts
- services/enhanced-jwt.service.ts
- middleware/auth.middleware.ts
- middleware/token-validator.ts

---

### 3. `password-security.test.ts`
**Password handling**
- Password hashing (bcrypt)
- Password comparison
- Password strength validation
- Password complexity requirements
- Prevent common passwords
- Password history (no reuse)
- Secure password reset

**Files Tested:**
- services/password-security.service.ts
- validators/auth.validators.ts

---

### 4. `rbac-core.test.ts`
**Role-based access control**
- Admin role can access admin endpoints
- User role cannot access admin endpoints
- Event organizer role permissions
- Venue manager role permissions
- Staff role permissions
- Permission inheritance
- Role assignment and modification

**Files Tested:**
- services/rbac.service.ts
- middleware/auth.middleware.ts

---

### 5. `session-management.test.ts`
**Session lifecycle**
- Create session on login
- Get active sessions for user
- Get session by ID
- Revoke single session
- Revoke all sessions (logout everywhere)
- Session expiration
- Concurrent session limits

**Files Tested:**
- controllers/session.controller.ts
- services/auth.service.ts

---

### 6. `profile-crud.test.ts`
**User profile operations**
- Get user profile
- Update profile (name, email, phone)
- Email change verification flow
- Upload profile picture
- Delete account
- Profile visibility settings

**Files Tested:**
- controllers/profile.controller.ts
- models/user.model.ts

---

## SUCCESS CRITERIA

- ✅ All 6 test files created
- ✅ All tests passing
- ✅ Core auth flows working end-to-end
- ✅ Security features validated
- ✅ RBAC working correctly
- ✅ Sessions managed properly
