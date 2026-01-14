# AUTH SERVICE - TESTING DOCUMENTATION

**Service:** auth-service  
**Test Framework:** Jest  
**Coverage Goal:** 100% function coverage  
**Total Tests:** ~550+

---

## 📋 OVERVIEW

This directory contains comprehensive tests for the auth-service, covering:
- User authentication (email/password, OAuth, wallet, biometric)
- Authorization (RBAC, permissions)
- Multi-factor authentication (TOTP, backup codes)
- Session management
- Token generation and validation
- Security features (rate limiting, brute force protection)

---

## 📂 DIRECTORY STRUCTURE

```
tests/
├── 00-MASTER-COVERAGE.md       # Track testing progress
├── 01-FUNCTION-INVENTORY.md    # Complete function list
├── 02-TEST-SPECIFICATIONS.md   # Detailed test cases
├── README.md                    # This file
│
├── fixtures/                    # Test data and helpers
│   ├── test-data.ts            # Test users, tokens, mock data
│   ├── mock-services.ts        # Mocked service dependencies
│   ├── test-helpers.ts         # Utility functions for tests
│   └── database-seeds.ts       # Database seeding for tests
│
├── unit/                        # Unit tests (isolated functions)
│   ├── controllers/
│   │   ├── auth.controller.test.ts
│   │   ├── auth-extended.controller.test.ts
│   │   ├── profile.controller.test.ts
│   │   └── session.controller.test.ts
│   ├── services/
│   │   ├── auth.service.test.ts
│   │   ├── jwt.service.test.ts
│   │   ├── password-security.service.test.ts
│   │   ├── rbac.service.test.ts
│   │   ├── mfa.service.test.ts
│   │   └── ... (all service files)
│   ├── middleware/
│   │   ├── auth.middleware.test.ts
│   │   ├── validation.middleware.test.ts
│   │   └── ... (all middleware files)
│   └── utils/
│       ├── logger.test.ts
│       ├── metrics.test.ts
│       └── rateLimiter.test.ts
│
├── integration/                 # Integration tests (multi-component)
│   ├── auth-flows/
│   │   ├── registration.test.ts
│   │   ├── login.test.ts
│   │   ├── password-reset.test.ts
│   │   └── token-refresh.test.ts
│   ├── mfa-flows/
│   │   ├── mfa-setup.test.ts
│   │   ├── mfa-login.test.ts
│   │   └── backup-codes.test.ts
│   └── oauth-flows/
│       ├── google-oauth.test.ts
│       ├── apple-oauth.test.ts
│       └── wallet-auth.test.ts
│
└── e2e/                        # End-to-end tests (full API)
    ├── user-journey.test.ts    # Complete user flow
    ├── session-management.test.ts
    └── security.test.ts        # Security scenarios
```

---

## 🚀 GETTING STARTED

### Prerequisites
```bash
# Ensure dependencies installed
npm install

# Ensure test database exists
createdb tickettoken_auth_test

# Run migrations on test database
npm run migrate:test
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test auth.controller.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="register"

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm test unit/

# Run only integration tests
npm test integration/

# Run only e2e tests
npm test e2e/
```

### Test Database

Tests use a separate test database: `tickettoken_auth_test`

**Setup:**
```bash
# Create test database
createdb tickettoken_auth_test

# Run migrations
DB_NAME=tickettoken_auth_test npm run migrate
```

**Cleanup between tests:**
- Database is cleared after each test
- Redis cache is flushed
- Test isolation ensured

---

## 📝 WRITING TESTS

### Unit Test Example

```typescript
import { AuthService } from '../src/services/auth.service';
import { MockPasswordService } from '../fixtures/mock-services';

describe('AuthService', () => {
  let authService: AuthService;
  let mockPasswordService: MockPasswordService;

  beforeEach(() => {
    mockPasswordService = new MockPasswordService();
    authService = new AuthService(mockPasswordService);
  });

  describe('register', () => {
    it('should create a new user with hashed password', async () => {
      const userData = {
        email: 'test@test.com',
        password: 'SecurePass123!',
        full_name: 'Test User'
      };

      const user = await authService.register(userData);

      expect(user.id).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.password).not.toBe(userData.password); // Hashed
      expect(mockPasswordService.hashPassword).toHaveBeenCalledWith(userData.password);
    });

    it('should throw error for duplicate email', async () => {
      // Setup: Create user first
      await authService.register({
        email: 'test@test.com',
        password: 'Pass123!',
        full_name: 'User 1'
      });

      // Test: Try to create duplicate
      await expect(
        authService.register({
          email: 'test@test.com',
          password: 'Pass456!',
          full_name: 'User 2'
        })
      ).rejects.toThrow('Email already exists');
    });
  });
});
```

### Integration Test Example

```typescript
import axios from 'axios';
import { setupTestApp, cleanDatabase } from '../fixtures/test-helpers';

describe('Registration Flow Integration', () => {
  let app;
  let baseURL;

  beforeAll(async () => {
    app = await setupTestApp();
    baseURL = `http://localhost:${app.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await cleanDatabase();
  });

  it('should complete full registration flow', async () => {
    // Step 1: Register
    const registerRes = await axios.post(`${baseURL}/auth/register`, {
      email: 'newuser@test.com',
      password: 'SecurePass123!',
      full_name: 'New User'
    });

    expect(registerRes.status).toBe(201);
    expect(registerRes.data.accessToken).toBeDefined();

    // Step 2: Verify email (get token from email service mock)
    const verifyRes = await axios.get(
      `${baseURL}/auth/verify-email?token=${mockEmailToken}`
    );

    expect(verifyRes.status).toBe(200);

    // Step 3: Login with verified account
    const loginRes = await axios.post(`${baseURL}/auth/login`, {
      email: 'newuser@test.com',
      password: 'SecurePass123!'
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.data.user.email_verified).toBe(true);
  });
});
```

### E2E Test Example

```typescript
describe('Complete User Journey', () => {
  it('should handle registration → verification → login → profile update → logout', async () => {
    // 1. Register
    const { data: registerData } = await api.post('/auth/register', {
      email: 'journey@test.com',
      password: 'JourneyPass123!',
      full_name: 'Journey User'
    });

    const token = registerData.accessToken;

    // 2. Get profile
    const { data: profile } = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(profile.email).toBe('journey@test.com');

    // 3. Update profile
    await api.put('/profile', {
      first_name: 'Updated',
      last_name: 'Name'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // 4. Logout
    await api.post('/auth/logout', {}, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // 5. Verify token no longer works
    await expect(
      api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
    ).rejects.toThrow();
  });
});
```

---

## 🎯 TESTING BEST PRACTICES

### 1. Test Isolation
- Each test should be independent
- Clean database after each test
- Reset mocks in beforeEach
- Don't rely on test execution order

### 2. Descriptive Test Names
```typescript
// ❌ Bad
it('should work', () => { ... });

// ✅ Good
it('should create user with hashed password when given valid credentials', () => { ... });
```

### 3. Arrange-Act-Assert Pattern
```typescript
it('should reject invalid email format', async () => {
  // Arrange
  const invalidEmail = 'notanemail';
  
  // Act
  const result = authService.register({ email: invalidEmail, ... });
  
  // Assert
  await expect(result).rejects.toThrow('Invalid email format');
});
```

### 4. Test Data
- Use fixtures for consistent test data
- Don't hardcode IDs or timestamps
- Use factories for complex objects

```typescript
import { createTestUser, createTestToken } from '../fixtures/test-data';

const user = createTestUser({ email: 'custom@test.com' });
const token = createTestToken(user);
```

### 5. Mock External Services
- Mock email service
- Mock OAuth providers
- Mock payment gateways
- Use `mock-services.ts`

### 6. Security Testing
- Test authentication failures
- Test authorization boundaries
- Test SQL injection prevention
- Test XSS prevention
- Test rate limiting

### 7. Error Handling
- Test happy path AND error paths
- Test all error types
- Test error messages
- Test error status codes

---

## 🔧 DEBUGGING TESTS

### View Test Output
```bash
# Verbose output
npm test -- --verbose

# Show console.logs
npm test -- --silent=false
```

### Debug Single Test
```typescript
// Add .only to run single test
it.only('should debug this test', () => {
  debugger; // Add breakpoint
  // ...
});
```

### Check Coverage
```bash
# Generate coverage report
npm run test:coverage

# Open HTML report
open coverage/lcov-report/index.html
```

---

## 📊 COVERAGE GOALS

| Category | Goal | Current |
|----------|------|---------|
| **Overall** | 90%+ | TBD |
| **Critical Paths** | 100% | TBD |
| **Controllers** | 95%+ | TBD |
| **Services** | 95%+ | TBD |
| **Middleware** | 90%+ | TBD |
| **Utils** | 85%+ | TBD |

---

## 🐛 COMMON ISSUES

### Issue: Tests timing out
**Solution:** Increase timeout
```typescript
jest.setTimeout(10000); // 10 seconds
```

### Issue: Database connection errors
**Solution:** Check test database exists
```bash
createdb tickettoken_auth_test
```

### Issue: Redis connection errors
**Solution:** Start Redis
```bash
redis-server
```

### Issue: Port already in use
**Solution:** Kill process on port
```bash
lsof -ti:3001 | xargs kill -9
```

### Issue: Tests passing locally but failing in CI
**Solution:** Check environment variables and service dependencies

---

## 📚 DOCUMENTATION REFERENCE

- **00-MASTER-COVERAGE.md** - Track which functions have tests
- **01-FUNCTION-INVENTORY.md** - See all functions to test
- **02-TEST-SPECIFICATIONS.md** - Detailed test case specs

---

## 🎯 TESTING CHECKLIST

When writing tests for a new function:

- [ ] Read function specification in `01-FUNCTION-INVENTORY.md`
- [ ] Review test cases in `02-TEST-SPECIFICATIONS.md`
- [ ] Write unit tests for the function
- [ ] Write integration tests if needed
- [ ] Test happy path
- [ ] Test all error cases
- [ ] Test edge cases
- [ ] Test security scenarios
- [ ] Update `00-MASTER-COVERAGE.md` status
- [ ] Run tests and verify they pass
- [ ] Check coverage report

---

## 💪 CONTRIBUTING

1. **Before writing tests:**
   - Check `00-MASTER-COVERAGE.md` for what needs testing
   - Read the function specifications
   - Review existing tests for patterns

2. **While writing tests:**
   - Follow the testing best practices above
   - Use existing fixtures and helpers
   - Write descriptive test names
   - Test both success and failure cases

3. **After writing tests:**
   - Update `00-MASTER-COVERAGE.md` with status
   - Ensure all tests pass
   - Check coverage hasn't decreased
   - Document any new test utilities

---

## 🚀 GOAL

**Test every function in auth-service to ensure:**
- Authentication works correctly
- Security features function properly
- Users can't bypass authorization
- Tokens are handled securely
- Rate limiting prevents abuse
- MFA works as expected
- OAuth integrations work
- All error cases are handled

**When complete:**
- 100% function coverage
- 90%+ code coverage
- All critical paths tested
- All security scenarios validated
- Complete test documentation

---

**Questions?** Check the specification docs or ask the team!

**Let's build bulletproof authentication! 💪🔐**
