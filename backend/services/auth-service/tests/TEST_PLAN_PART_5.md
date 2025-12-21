# Auth Service Test Plan - Part 5: Config, App & Entry Points

> **Target Coverage:** 80-100% code coverage  
> **Files Covered:** 11 configuration, bootstrap, and entry point files  
> **Estimated Tests:** ~115 tests

---

## FILE 30: `src/config/database.ts`

### Exports & Coverage Requirements

#### 1. `pool` - PostgreSQL Pool Instance

**Test Cases:**
```
✓ Should create pool with correct connection parameters
✓ Should use DB_HOST from environment
✓ Should use DB_PORT from environment (default 6432)
✓ Should use DB_NAME from environment
✓ Should use DB_USER from environment
✓ Should use DB_PASSWORD from environment
✓ Should have max 5 connections
✓ Should have 30s idle timeout
✓ Should have 10s connection timeout
✓ Should set search_path to 'public' on connection
```

#### 2. `db` - Knex Instance

**Test Cases:**
```
✓ Should create Knex instance with pg client
✓ Should use pool connection parameters
✓ Should have min 1 connection
✓ Should have max 5 connections
✓ Should be able to execute queries
```

---

## FILE 31: `src/config/dependencies.ts`

### Exports & Coverage Requirements

#### 1. `createDependencyContainer()` - Factory Function

**Test Cases:**
```
✓ Should return configured Awilix container
✓ Should register config dependencies (env, db, redis)
✓ Should register core auth services (jwtService, authService, etc)
✓ Should register alternative auth services (walletService, oauthService, biometricService)
✓ Should register security services (rateLimitService, deviceTrustService)
✓ Should register supporting services (emailService, lockoutService, auditService, monitoringService)
✓ Should use CLASSIC injection mode
✓ Should allow resolving all registered services
```

#### 2. `Container` Type Export

**Test Cases:**
```
✓ Should export Container type from function return
```

#### 3. `Cradle` Type Export

**Test Cases:**
```
✓ Should export Cradle type for container contents
```

---

## FILE 32: `src/config/env.ts`

### Exports & Coverage Requirements

#### 1. `EnvConfig` Interface

**Test Cases:**
```
✓ Should define all required environment variable types
✓ Should include server config (NODE_ENV, PORT, LOG_LEVEL)
✓ Should include database config (DB_HOST, DB_PORT, etc)
✓ Should include Redis config
✓ Should include JWT config
✓ Should include OAuth provider configs (Google, GitHub, Apple)
✓ Should include security config (BCRYPT_ROUNDS, LOCKOUT settings)
✓ Should include MFA config
✓ Should include email config (RESEND_API_KEY)
✓ Should include service URLs
```

#### 2. `env` - Validated Configuration Object

**Test Cases:**
```
✓ Should load and validate environment variables
✓ Should use defaults when optional vars not provided
✓ Should throw on missing required vars in production
✓ Should default NODE_ENV to 'development'
✓ Should default PORT to 3001
✓ Should default LOG_LEVEL to 'info'
✓ Should default DB_PORT to '6432'
✓ Should default BCRYPT_ROUNDS to 12
✓ Should default LOCKOUT_MAX_ATTEMPTS to 5
✓ Should default LOCKOUT_DURATION_MINUTES to 15
✓ Should require RESEND_API_KEY in production
✓ Should require ENCRYPTION_KEY in production
```

---

## FILE 33: `src/config/logger.ts`

### Exports & Coverage Requirements

#### 1. `logger` - Base Pino Logger

**Test Cases:**
```
✓ Should create pino logger instance
✓ Should use ISO timestamp format
✓ Should use pretty printing in development
✓ Should use JSON format in production
✓ Should include service, environment, version in base metadata
```

#### 2. `dbLogger` - Database Component Logger

**Test Cases:**
```
✓ Should be child logger with component='database'
```

#### 3. `redisLogger` - Redis Component Logger

**Test Cases:**
```
✓ Should be child logger with component='redis'
```

#### 4. `authLogger` - Auth Component Logger

**Test Cases:**
```
✓ Should be child logger with component='auth'
```

#### 5. `apiLogger` - API Component Logger

**Test Cases:**
```
✓ Should be child logger with component='api'
```

#### 6. `auditLogger` - Audit Logger (Always Info Level)

**Test Cases:**
```
✓ Should be child logger with component='audit'
✓ Should always log at 'info' level minimum
```

#### 7. `logWithContext(context, message, extra?)` - Helper Function

**Test Cases:**
```
✓ Should log with additional context
✓ Should merge context with extra data
✓ Should work without extra parameter
```

#### 8. `createRequestLogger()` - Middleware Factory

**Test Cases:**
```
✓ Should return Fastify middleware function
✓ Should log incoming requests
✓ Should log outgoing responses
✓ Should include request ID, method, url, status code
```

---

## FILE 34: `src/config/oauth.ts`

### Exports & Coverage Requirements

#### 1. `oauthConfig` - Provider Configurations

**Test Cases:**
```
✓ Should export google provider config
✓ Should include GOOGLE_CLIENT_ID from env
✓ Should include GOOGLE_CLIENT_SECRET from env
✓ Should include GOOGLE_REDIRECT_URI from env
✓ Should export github provider config
✓ Should include GITHUB_CLIENT_ID from env
✓ Should include GITHUB_CLIENT_SECRET from env
✓ Should include GITHUB_REDIRECT_URI from env
✓ Should export facebook provider config (if configured)
```

#### 2. `oauthProviders` - Array of Provider Names

**Test Cases:**
```
✓ Should include 'google' in providers array
✓ Should include 'github' in providers array
✓ Should include 'facebook' if configured
```

---

## FILE 35: `src/config/redis.ts`

### Exports & Coverage Requirements

#### 1. `redis` - Main Redis Client

**Test Cases:**
```
✓ Should create ioredis client instance
✓ Should use REDIS_HOST from env (default 'redis')
✓ Should use REDIS_PORT from env (default 6379)
✓ Should use REDIS_PASSWORD from env if provided
✓ Should enable ready check
✓ Should enable offline queue
✓ Should have retry strategy (exponential backoff, max 2s)
✓ Should limit to 3 retries per request
✓ Should emit 'connect' event on connection
✓ Should emit 'ready' event when ready
✓ Should emit 'error' event on errors
```

#### 2. `redisPub` - Publisher Client

**Test Cases:**
```
✓ Should be duplicate of main client for publishing
✓ Should be separate connection from main client
```

#### 3. `redisSub` - Subscriber Client

**Test Cases:**
```
✓ Should be duplicate of main client for subscribing
✓ Should be separate connection from main client
```

#### 4. `closeRedisConnections()` - Graceful Shutdown

**Test Cases:**
```
✓ Should disconnect main client
✓ Should disconnect pub client
✓ Should disconnect sub client
✓ Should wait for all disconnects to complete
✓ Should not throw on error
```

---

## FILE 36: `src/config/secrets.ts`

### Exports & Coverage Requirements

#### 1. `loadSecrets()` - Async Secrets Loader

**Test Cases:**
```
✓ Should load secrets from AWS Secrets Manager
✓ Should return POSTGRES_PASSWORD
✓ Should return POSTGRES_USER
✓ Should return POSTGRES_DB
✓ Should return REDIS_PASSWORD
✓ Should use SERVICE_NAME for logging
✓ Should handle secrets manager errors gracefully
```

---

## FILE 37: `src/config/swagger.ts`

### Exports & Coverage Requirements

#### 1. `swaggerOptions` - OpenAPI Configuration

**Test Cases:**
```
✓ Should have openapi spec configuration
✓ Should have title 'TicketToken Auth Service API'
✓ Should have version '1.0.0'
✓ Should include server URL from AUTH_SERVICE_URL env
✓ Should define Bearer JWT security scheme
✓ Should include tags: auth, mfa, roles
✓ Should have description for auth service
```

#### 2. `swaggerUiOptions` - Swagger UI Settings

**Test Cases:**
```
✓ Should set route prefix to '/docs'
✓ Should set doc expansion to 'list'
✓ Should enable deep linking
✓ Should enable syntax highlighting
```

---

## FILE 38: `src/app.ts`

### Exports & Coverage Requirements

#### 1. `buildApp()` - Application Factory Function

**Test Cases:**
```
✓ Should create and return Fastify instance
✓ Should configure pino logger with correct level
✓ Should use pino-pretty in development
✓ Should enable trustProxy
✓ Should set requestIdHeader to 'x-request-id'
✓ Should register @fastify/cors with correct options
✓ Should register @fastify/helmet
✓ Should register @fastify/csrf-protection
✓ Should register @fastify/rate-limit (global disabled)
✓ Should create dependency container
✓ Should register /health endpoint
✓ Should register /metrics endpoint (Prometheus)
✓ Should register auth routes at /auth prefix
✓ Should configure global error handler
✓ Should map CSRF errors to 403
✓ Should map rate limit errors to 429
✓ Should map validation errors to 422
✓ Should map conflict errors to 409
✓ Should map auth errors to 401
✓ Should map Fastify validation errors to 400
✓ Should map unknown errors to 500
```

---

## FILE 39: `src/index.ts`

### Application Bootstrap & Coverage Requirements

#### 1. Startup Sequence

**Test Cases:**
```
✓ Should test database connectivity (SELECT NOW())
✓ Should test Redis connectivity (PING)
✓ Should call buildApp() to create Fastify instance
✓ Should start server on configured PORT (default 3001)
✓ Should bind to host '0.0.0.0'
✓ Should log startup success message
✓ Should log listening address and port
```

#### 2. Error Handling During Startup

**Test Cases:**
```
✓ Should handle database connection errors
✓ Should handle Redis connection errors
✓ Should handle port already in use errors
✓ Should exit process with code 1 on startup failure
```

#### 3. Graceful Shutdown

**Test Cases:**
```
✓ Should register SIGTERM handler
✓ Should register SIGINT handler
✓ Should call app.close() on shutdown signal
✓ Should call pool.end() to close database connections
✓ Should call closeRedisConnections()
✓ Should exit process with code 0 after cleanup
✓ Should log shutdown messages
```

---

## FILE 40: `src/index-with-secrets.ts`

### Alternative Entry Point with AWS Secrets

#### 1. Startup Sequence with Secrets

**Test Cases:**
```
✓ Should load .env from project root (../../../../.env)
✓ Should call loadSecrets() before app initialization
✓ Should log loaded secrets (redacted)
✓ Should log 'Service started with secrets loaded' message
✓ Should handle secrets loading errors
```

---

## PART 5 SUMMARY: TEST COUNT ESTIMATE

| File | Estimated Tests | Priority |
|------|-----------------|----------|
| config/database.ts | 15 tests | P1 - High |
| config/dependencies.ts | 11 tests | P1 - High |
| config/env.ts | 23 tests | P0 - Critical |
| config/logger.ts | 12 tests | P2 - Medium |
| config/oauth.ts | 9 tests | P2 - Medium |
| config/redis.ts | 15 tests | P1 - High |
| config/secrets.ts | 7 tests | P2 - Medium |
| config/swagger.ts | 8 tests | P2 - Medium |
| app.ts | 22 tests | P0 - Critical |
| index.ts | 13 tests | P0 - Critical |
| index-with-secrets.ts | 5 tests | P2 - Medium |
| **Part 5 TOTAL** | **~140 tests** | |

---

## Testing Strategy for Config & Bootstrap

### Configuration Testing Pattern
```typescript
// Example: Testing env.ts
describe('Environment Configuration', () => {
  it('should use default values when env vars not set', () => {
    delete process.env.PORT;
    const config = loadEnvConfig();
    expect(config.PORT).toBe(3001);
  });

  it('should throw when required var missing in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RESEND_API_KEY;
    expect(() => loadEnvConfig()).toThrow();
  });
});
```

### Dependency Injection Testing Pattern
```typescript
// Example: Testing dependencies.ts
describe('Dependency Container', () => {
  it('should resolve all registered services', () => {
    const container = createDependencyContainer();
    
    expect(container.resolve('authService')).toBeDefined();
    expect(container.resolve('jwtService')).toBeDefined();
    expect(container.resolve('mfaService')).toBeDefined();
  });

  it('should inject dependencies via constructor', () => {
    const container = createDependencyContainer();
    const authService = container.resolve('authService');
    
    expect(authService.jwtService).toBeDefined();
    expect(authService.emailService).toBeDefined();
  });
});
```

### Application Bootstrap Testing Pattern
```typescript
// Example: Testing app.ts
describe('Application Bootstrap', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should register health endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toHaveProperty('status', 'healthy');
  });

  it('should register auth routes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@test.com', password: 'password' }
    });
    // Should reach validation, not 404
    expect(response.statusCode).not.toBe(404);
  });
});
```

### Entry Point Testing Pattern
```typescript
// Example: Testing index.ts startup
describe('Service Entry Point', () => {
  it('should test database connectivity on startup', async () => {
    const pool = require('../config/database').pool;
    const querySpy = jest.spyOn(pool, 'query');
    
    // Mock successful startup
    querySpy.mockResolvedValue({ rows: [{ now: new Date() }] });
    
    await startServer();
    
    expect(querySpy).toHaveBeenCalledWith('SELECT NOW()');
  });

  it('should exit on database connection failure', async () => {
    const pool = require('../config/database').pool;
    jest.spyOn(pool, 'query').mockRejectedValue(new Error('Connection failed'));
    jest.spyOn(process, 'exit').mockImplementation();
    
    await startServer();
    
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
```

---

## Integration Testing Approach

### Full Stack Integration Tests

**Test Scenarios:**
```
✓ Should start server and accept HTTP requests
✓ Should connect to test database successfully
✓ Should connect to test Redis successfully
✓ Should register all routes
✓ Should apply middleware stack correctly
✓ Should handle CORS preflight requests
✓ Should apply CSRF protection on state-changing methods
✓ Should apply rate limiting on protected routes
✓ Should validate request bodies with Joi schemas
✓ Should authenticate requests with JWT
✓ Should apply RBAC permissions
✓ Should enforce tenant isolation
✓ Should handle errors gracefully with correct status codes
✓ Should log requests and responses
✓ Should emit Prometheus metrics
✓ Should respond to health checks
✓ Should gracefully shutdown on SIGTERM
```

---

## Environment-Specific Testing

### Development Environment
```typescript
process.env.NODE_ENV = 'development';
// Should use pino-pretty
// Should not require RESEND_API_KEY
// Should allow missing ENCRYPTION_KEY
```

### Test Environment
```typescript
process.env.NODE_ENV = 'test';
// Should use test database
// Should use test Redis
// Should not send real emails
// Should not require production secrets
```

### Production Environment
```typescript
process.env.NODE_ENV = 'production';
// Should require RESEND_API_KEY
// Should require ENCRYPTION_KEY
// Should use JSON logging
// Should validate all required env vars
```

---

## Mocking Requirements for Config Tests

| Config File | What to Mock |
|-------------|--------------|
| `database.ts` | process.env.DB_* variables |
| `env.ts` | process.env object |
| `redis.ts` | ioredis constructor |
| `secrets.ts` | AWS Secrets Manager SDK |
| `logger.ts` | pino constructor |
| `app.ts` | Fastify instance, plugins |

---

## Test File Structure
```
tests/
├── unit/
│   └── config/
│       ├── database.test.ts
│       ├── dependencies.test.ts
│       ├── env.test.ts
│       ├── logger.test.ts
│       ├── oauth.test.ts
│       ├── redis.test.ts
│       ├── secrets.test.ts
│       └── swagger.test.ts
├── integration/
│   ├── app.integration.test.ts
│   ├── startup.integration.test.ts
│   └── shutdown.integration.test.ts
└── e2e/
    └── full-stack.e2e.test.ts
```

---

## Coverage Targets

| Metric | Target |
|--------|--------|
| Line Coverage | ≥ 80% |
| Branch Coverage | ≥ 80% |
| Function Coverage | 100% |
| Statement Coverage | ≥ 80% |

---

## Special Considerations

### 1. Environment Variable Testing
- Must test with and without optional vars
- Must test defaults
- Must test production validation
- Must isolate tests (reset process.env)

### 2. Connection Testing
- Database connections should use test instances
- Redis connections should use test instances
- Should test connection failures
- Should test reconnection logic

### 3. Graceful Shutdown Testing
- Must test SIGTERM handling
- Must test SIGINT handling
- Must verify connections close properly
- Must verify process exits cleanly

### 4. Error Handler Testing
- Test all error types (auth, validation, conflict, etc.)
- Test unknown error handling
- Test error logging
- Test error response format

---

## FINAL COMPREHENSIVE SUMMARY

### All Parts Combined

| Part | Files | Estimated Tests | Status |
|------|-------|-----------------|--------|
| Part 1: Critical Auth Flows | 6 files | ~155 tests | ✓ In TEST_PLAN.md |
| Part 2: Alternative Auth Methods | 6 files | ~160 tests | ✓ In TEST_PLAN.md |
| Part 3: Security & Infrastructure | 9 files | ~140 tests | ✓ TEST_PLAN_PART_3.md |
| Part 4: Middleware, Errors & Utils | 8 files | ~127 tests | ✓ TEST_PLAN_PART_4.md |
| Part 5: Config, App & Entry | 11 files | ~140 tests | ✓ TEST_PLAN_PART_5.md |
| **GRAND TOTAL** | **40 files** | **~722 tests** | **COMPLETE** |

---

### Priority Breakdown

| Priority | Files | Description |
|----------|-------|-------------|
| **P0 - Critical** | 20 files | Core auth, security, middleware, app bootstrap |
| **P1 - High** | 12 files | Supporting services, config, infrastructure |
| **P2 - Medium** | 8 files | Utilities, logging, metrics, docs |

---

### Test Types Distribution

| Test Type | Estimated Count |
|-----------|-----------------|
| **Unit Tests** | ~580 tests |
| **Integration Tests** | ~100 tests |
| **E2E Tests** | ~40 tests |
| **TOTAL** | **~720 tests** |

---

## Next Steps for Implementation

1. **Setup Test Infrastructure**
   - Configure Jest with TypeScript
   - Setup test database and Redis
   - Create test fixtures and factories
   - Setup mock helpers

2. **Implement Unit Tests (Priority Order)**
   - P0 files first (critical auth, security)
   - P1 files second (supporting services)
   - P2 files last (utilities, config)

3. **Implement Integration Tests**
   - Database operations
   - Redis operations
   - Full authentication flows
   - Permission and RBAC flows

4. **Implement E2E Tests**
   - Complete user journeys
   - Multi-step flows (registration → verification → login)
   - Error recovery scenarios

5. **Measure and Report Coverage**
   - Run `jest --coverage`
   - Generate HTML coverage reports
   - Identify gaps
   - Fill gaps to reach 80-100% target

---

**END OF TEST PLAN - ALL PARTS COMPLETE**
