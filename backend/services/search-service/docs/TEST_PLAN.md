---

## Test Categories

| Category | Count | Priority |
|----------|-------|----------|
| Unit Tests | 721 | High |
| Integration Tests | 111 | High |
| E2E Tests | 56 | Medium |
| **TOTAL** | **888** | |

---

## Critical Issues to Address

Before testing, these critical issues should be resolved:

| Issue | Severity | Impact on Testing | File |
|-------|----------|-------------------|------|
| **NO tenant filtering** in autocomplete | 🔴 Critical | Security vulnerability - users see other tenants' data | `autocomplete.service.ts` |
| **NO tenant filtering** in professional search | 🔴 Critical | Security vulnerability - cross-tenant data leak | `professional-search.service.ts` |
| **NO input sanitization** in professional search | 🔴 Critical | Injection vulnerability | `professional-search.controller.ts` |
| **NO tenant middleware** in professional search routes | 🔴 Critical | Allows cross-tenant access | `professional-search.controller.ts` |
| Background processor uses `setInterval` | 🟠 Medium | No graceful shutdown | `consistency.service.ts` |
| Database env var inconsistency | 🟠 Medium | Config confusion `DB_*` vs `DATABASE_*` | `database.ts` vs `env.validator.ts` |
| Syntax error in server.ts logger | 🟠 Medium | Service won't start | `server.ts` template literal bug |
| RabbitMQ infinite retry | 🟠 Medium | Resource exhaustion | `rabbitmq.ts` |
| AB Testing not production-ready | 🟡 Low | No persistence, random assignment | `ab-testing.service.ts` |
| Cross-service imports | 🟡 Low | Tight coupling | `content-sync.service.ts` |

---

## File-by-File Test Specifications

### 1. Root Configuration Files

#### `knexfile.ts` - Knex Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should parse NUMERIC types as floats` | pg type parser configuration |
| 🧪 Unit | `should have correct dev config structure` | Development config validation |
| 🧪 Unit | `should have correct production config` | Production config validation |
| 🧪 Unit | `should use DATABASE_URL in production` | Connection string mode |
| 🧪 Unit | `should use individual params in dev` | Parameter-based connection |
| 🧪 Unit | `should configure pool min=2 max=10` | Connection pool settings |
| 🧪 Unit | `should set migrations directory` | Migration path configuration |
| 🧪 Unit | `should use .ts extension for migrations` | TypeScript migration support |
| 🔗 Integration | `should connect with dev config` | Database connection test |
| 🔗 Integration | `should connect with production config` | Production connection test |
| 🔗 Integration | `should load migrations correctly` | Migration loading test |

---

### 2. Config Folder

#### `config/database.ts` - Database Connection

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should create Knex client with config` | Client instantiation |
| 🧪 Unit | `should use DB_HOST from environment` | Environment variable usage |
| 🧪 Unit | `should default to postgres host` | Default value handling |
| 🧪 Unit | `should parse DB_PORT as integer` | Port type conversion |
| 🧪 Unit | `should configure pool min=5 max=20` | Pool configuration |
| 🔗 Integration | `connectDatabase should establish connection` | Connection establishment |
| 🔗 Integration | `connectDatabase should execute SELECT 1` | Connection validation query |
| 🔗 Integration | `connectDatabase should throw on failure` | Error handling behavior |
| 🔗 Integration | `should handle pool exhaustion` | Connection pool limits |

#### `config/dependencies.ts` - DI Container

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should create container with PROXY mode` | Container initialization |
| 🧪 Unit | `should register db as value` | Database registration |
| 🧪 Unit | `should register logger as value` | Logger registration |
| 🧪 Unit | `should register Redis client` | Redis registration |
| 🧪 Unit | `should register Elasticsearch client` | Elasticsearch registration |
| 🧪 Unit | `should register MongoDB client` | MongoDB registration |
| 🧪 Unit | `should register all services as singletons` | Service registration pattern |
| 🧪 Unit | `should register RatingService from shared` | Shared service integration |
| 🧪 Unit | `should register enrichment services` | Enrichment service registration |
| 🔗 Integration | `should initialize container with all deps` | Full container setup |
| 🔗 Integration | `should connect to MongoDB successfully` | MongoDB connection |
| 🔗 Integration | `should resolve services correctly` | Dependency resolution |

#### `config/env.validator.ts` - Environment Validation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateEnv should accept valid config` | Valid input acceptance |
| 🧪 Unit | `validateEnv should reject missing required vars` | Required field validation |
| 🧪 Unit | `validateEnv should reject invalid types` | Type validation |
| 🧪 Unit | `validateEnv should validate JWT_SECRET length in prod` | Production JWT validation |
| 🧪 Unit | `checkProductionEnv should verify critical vars` | Production checks |
| 🧪 Unit | `checkProductionEnv should warn on weak JWT` | Security warnings |
| 🧪 Unit | `getConfig should return structured config` | Config structure |
| 🧪 Unit | `should apply default values for optional vars` | Default handling |
| 🧪 Unit | `should validate NODE_ENV enum values` | Environment validation |
| 🧪 Unit | `should validate port range 1-65535` | Port range validation |
| 🧪 Unit | `should validate Elasticsearch URL format` | URL format validation |
| 🧪 Unit | `should validate Redis port as integer` | Type coercion |
| 🧪 Unit | `should validate database pool min/max` | Pool validation |
| 🧪 Unit | `should validate rate limit values` | Rate limit validation |
| 🧪 Unit | `should validate search timeout range` | Timeout validation |

#### `config/fastify.ts` - Fastify Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `configureFastify should register CORS` | CORS middleware |
| 🧪 Unit | `configureFastify should register Helmet` | Security headers |
| 🧪 Unit | `should decorate with db instance` | Database decoration |
| 🧪 Unit | `should add tenant context hook` | Multi-tenancy middleware |
| 🧪 Unit | `should register health check route` | Health endpoint |
| 🧪 Unit | `should register search routes` | Search route mounting |
| 🧪 Unit | `should register professional search routes` | Pro search route mounting |
| 🔗 Integration | `should configure full Fastify server` | Server configuration |
| 🔗 Integration | `should execute tenant context middleware` | Middleware execution |
| 🔗 Integration | `should handle middleware errors gracefully` | Error handling |

#### `config/mongodb.ts` - MongoDB Connection

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should parse MONGODB_URI from environment` | URI parsing |
| 🧪 Unit | `should configure connection pool min=2 max=10` | Pool settings |
| 🧪 Unit | `should set read preference to secondaryPreferred` | Read-only configuration |
| 🧪 Unit | `should configure socket timeout` | Timeout settings |
| 🔗 Integration | `initializeMongoDB should connect successfully` | Connection establishment |
| 🔗 Integration | `initializeMongoDB should return existing connection` | Singleton behavior |
| 🔗 Integration | `getMongoDB should return connection` | Connection getter |
| 🔗 Integration | `getMongoDB should throw when not initialized` | Error handling |
| 🔗 Integration | `should handle connection error events` | Error event handling |
| 🔗 Integration | `should handle disconnection events` | Disconnect handling |
| 🔗 Integration | `closeMongoDB should close connection` | Connection cleanup |
| 🔗 Integration | `checkMongoDBHealth should ping database` | Health check |
| 🔗 Integration | `checkMongoDBHealth should return false on error` | Health check failure |

#### `config/rabbitmq.ts` - RabbitMQ Connection

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should parse RABBITMQ_URL from environment` | URL parsing |
| 🧪 Unit | `should fallback to AMQP_URL` | Fallback URL handling |
| 🔗 Integration | `connectRabbitMQ should create connection` | Connection creation |
| 🔗 Integration | `connectRabbitMQ should create channel` | Channel creation |
| 🔗 Integration | `should assert exchange search.sync` | Exchange assertion |
| 🔗 Integration | `should assert queue search.sync.queue` | Queue assertion |
| 🔗 Integration | `should bind queue to exchange` | Queue binding |
| 🔗 Integration | `should consume messages from queue` | Message consumption |
| 🔗 Integration | `should acknowledge processed messages` | Message acknowledgment |
| 🔗 Integration | `should nack failed messages` | Message rejection |
| 🔗 Integration | `should retry connection on failure` | Connection retry logic |

#### `config/search-config.ts` - Search Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `SEARCH_SYNONYMS should have correct structure` | Synonym mapping |
| 🧪 Unit | `SEARCH_BOOSTS should have correct weights` | Boost configuration |
| 🧪 Unit | `SEARCH_SETTINGS should have correct defaults` | Settings defaults |
| 🧪 Unit | `should map concert synonyms correctly` | Synonym validation |
| 🧪 Unit | `should have name boost of 3.0` | Boost value validation |
| 🧪 Unit | `should have maxResults of 100` | Limit validation |

#### `config/secrets.ts` - Secrets Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `loadSecrets should call secretsManager` | Secrets manager integration |
| 🧪 Unit | `loadSecrets should load common secrets` | Secret loading |
| 🧪 Unit | `loadSecrets should throw on failure` | Error handling |
| 🔗 Integration | `should load from actual secrets manager` | Real secrets loading |

---

### 3. Types & Utilities

#### `types/enriched-documents.ts` - Type Definitions

*No tests needed - type definitions only*

#### `utils/error-handler.ts` - Custom Error Classes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `SearchError should extend Error` | Inheritance check |
| 🧪 Unit | `SearchError should set statusCode` | Status code property |
| 🧪 Unit | `SearchError should set code` | Error code property |
| 🧪 Unit | `ValidationError should have 400 statusCode` | Status code validation |
| 🧪 Unit | `NotFoundError should have 404 statusCode` | Status code validation |
| 🧪 Unit | `RateLimitError should have 429 statusCode` | Status code validation |
| 🧪 Unit | `should preserve error message` | Message property |
| 🧪 Unit | `should preserve stack trace` | Stack trace property |

#### `utils/logger.ts` - Pino Logger

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should create logger with service name` | Logger creation |
| 🧪 Unit | `should use LOG_LEVEL from environment` | Log level configuration |
| 🧪 Unit | `should default to info level` | Default log level |
| 🧪 Unit | `should use pino-pretty in development` | Development formatting |
| 🧪 Unit | `should use JSON in production` | Production formatting |

#### `utils/metrics.ts` - Prometheus Metrics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `searchCounter should increment` | Counter increment |
| 🧪 Unit | `searchDuration should observe values` | Histogram observation |
| 🧪 Unit | `cacheHitRate should increment` | Counter increment |
| 🧪 Unit | `should register metrics with registry` | Metric registration |
| 🧪 Unit | `should use correct label names` | Label validation |
| 🧪 Unit | `should use correct histogram buckets` | Bucket configuration |

#### `utils/performance-monitor.ts` - Performance Tracking

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `trackOperation should record duration` | Duration tracking |
| 🧪 Unit | `trackOperation should return result` | Result passthrough |
| 🧪 Unit | `trackOperation should handle errors` | Error handling |
| 🧪 Unit | `recordMetric should store metrics` | Metric storage |
| 🧪 Unit | `should enforce retention limit of 10000` | Retention limiting |
| 🧪 Unit | `getStats should calculate min/max/avg` | Statistics calculation |
| 🧪 Unit | `getStats should calculate percentiles` | Percentile calculation |
| 🧪 Unit | `getStats should return null for unknown operation` | Unknown operation handling |
| 🧪 Unit | `percentile should calculate correctly` | Percentile math |
| 🧪 Unit | `getAllStats should return all operations` | Full stats retrieval |
| 🧪 Unit | `resetMetrics should clear specific operation` | Selective reset |
| 🧪 Unit | `resetMetrics should clear all operations` | Full reset |
| 🧪 Unit | `setSlowQueryThreshold should update threshold` | Threshold configuration |
| 🧪 Unit | `isOperationSlow should detect slow operations` | Slow operation detection |
| 🧪 Unit | `getSlowOperationsReport should return sorted list` | Report generation |
| 🧪 Unit | `logSummary should output statistics` | Summary logging |
| 🧪 Unit | `should log slow queries when over threshold` | Slow query logging |
| 🧪 Unit | `should preserve metadata in metrics` | Metadata handling |

#### `utils/sanitizer.ts` - Input Sanitization

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `sanitizeQuery should remove HTML tags` | HTML sanitization |
| 🧪 Unit | `sanitizeQuery should remove JSON brackets` | Bracket removal |
| 🧪 Unit | `sanitizeQuery should remove escape chars` | Escape character removal |
| 🧪 Unit | `sanitizeQuery should remove quotes` | Quote removal |
| 🧪 Unit | `sanitizeQuery should remove command injection chars` | Injection prevention |
| 🧪 Unit | `sanitizeQuery should remove null bytes` | Null byte removal |
| 🧪 Unit | `sanitizeQuery should trim whitespace` | Whitespace trimming |
| 🧪 Unit | `sanitizeQuery should enforce 200 char limit` | Length limiting |
| 🧪 Unit | `sanitizeQuery should handle null input` | Null handling |
| 🧪 Unit | `sanitizeQuery should handle undefined input` | Undefined handling |
| 🧪 Unit | `sanitizeQuery should handle non-string input` | Type handling |
| 🧪 Unit | `sanitizeQueryWithValidation should return isValid` | Validation flag |
| 🧪 Unit | `sanitizeQueryWithValidation should preserve length` | Original length tracking |
| 🧪 Unit | `sanitizeFilters should whitelist allowed fields` | Field whitelisting |
| 🧪 Unit | `sanitizeFilters should sanitize string values` | String sanitization |
| 🧪 Unit | `sanitizeFilters should validate numbers` | Number validation |
| 🧪 Unit | `sanitizeFilters should handle arrays` | Array handling |
| 🧪 Unit | `sanitizeFilters should limit array size to 50` | Array size limiting |
| 🧪 Unit | `sanitizeFilters should remove null from arrays` | Null filtering |
| 🧪 Unit | `sanitizeFilters should handle non-object input` | Type handling |
| 🧪 Unit | `sanitizeNumber should parse valid input` | Number parsing |
| 🧪 Unit | `sanitizeNumber should return default on invalid` | Default fallback |
| 🧪 Unit | `sanitizeNumber should clamp to min` | Minimum clamping |
| 🧪 Unit | `sanitizeNumber should clamp to max` | Maximum clamping |
| 🧪 Unit | `sanitizeCoordinate should validate latitude range` | Latitude validation |
| 🧪 Unit | `sanitizeCoordinate should validate longitude range` | Longitude validation |
| 🧪 Unit | `sanitizeCoordinate should return null for invalid` | Invalid handling |
| 🧪 Unit | `sanitizeCoordinate should return null for NaN` | NaN handling |

#### `utils/tenant-filter.ts` - Tenant Isolation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `addTenantFilter should add venue_id term filter` | Filter addition |
| 🧪 Unit | `addTenantFilter should wrap non-bool queries` | Query wrapping |
| 🧪 Unit | `addTenantFilter should add to existing bool query` | Bool query handling |
| 🧪 Unit | `addTenantFilter should convert single filter to array` | Array conversion |
| 🧪 Unit | `addTenantFilter should skip when allowCrossTenant` | Cross-tenant bypass |
| 🧪 Unit | `addTenantFilter should throw when venueId missing` | Missing venue validation |
| 🧪 Unit | `addTenantFilter should preserve existing filters` | Filter preservation |
| 🧪 Unit | `validateVenueId should accept valid string` | Valid input acceptance |
| 🧪 Unit | `validateVenueId should throw for null` | Null rejection |
| 🧪 Unit | `validateVenueId should throw for undefined` | Undefined rejection |
| 🧪 Unit | `validateVenueId should throw for non-string` | Type validation |
| 🧪 Unit | `validateVenueId should throw for empty string` | Empty string rejection |
| 🧪 Unit | `validateVenueId should throw for too short` | Length validation |
| 🧪 Unit | `validateVenueId should throw for too long` | Length validation |
| 🧪 Unit | `canAccessCrossTenant should return true for admin` | Admin role check |
| 🧪 Unit | `canAccessCrossTenant should return true for super-admin` | Super-admin check |
| 🧪 Unit | `canAccessCrossTenant should return true for system` | System role check |
| 🧪 Unit | `canAccessCrossTenant should return false for user` | User role check |
| 🧪 Unit | `canAccessCrossTenant should be case insensitive` | Case handling |

---

### 4. Validators

#### `validators/search.schemas.ts` - Joi Validation Schemas

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `searchQuerySchema should accept valid input` | Valid input acceptance |
| 🧪 Unit | `searchQuerySchema should reject q over 200 chars` | Query length validation |
| 🧪 Unit | `searchQuerySchema should validate type enum` | Type enum validation |
| 🧪 Unit | `searchQuerySchema should clamp limit 1-100` | Limit range validation |
| 🧪 Unit | `searchQuerySchema should clamp offset 0-10000` | Offset range validation |
| 🧪 Unit | `searchQuerySchema should use default limit 20` | Default limit |
| 🧪 Unit | `searchQuerySchema should use default offset 0` | Default offset |
| 🧪 Unit | `searchQuerySchema should strip unknown fields` | Unknown field removal |
| 🧪 Unit | `venueSearchSchema should accept city filter` | City filter validation |
| 🧪 Unit | `venueSearchSchema should validate capacity min/max` | Capacity validation |
| 🧪 Unit | `eventSearchSchema should accept date_from/date_to` | Date range validation |
| 🧪 Unit | `eventSearchSchema should enforce date_to >= date_from` | Date comparison |
| 🧪 Unit | `eventSearchSchema should validate category/venue_id` | Filter validation |
| 🧪 Unit | `suggestSchema should require q non-empty` | Required field validation |
| 🧪 Unit | `suggestSchema should validate length 1-100` | Length range |
| 🧪 Unit | `suggestSchema should clamp limit 1-20 default 10` | Limit validation |
| 🧪 Unit | `geoSearchSchema should require lat/lon` | Required coordinates |
| 🧪 Unit | `geoSearchSchema should validate lat range -90 to 90` | Latitude range |
| 🧪 Unit | `geoSearchSchema should validate lon range -180 to 180` | Longitude range |
| 🧪 Unit | `geoSearchSchema should validate radius 0.1-100` | Radius validation |
| 🧪 Unit | `filterSchema should validate priceMin/Max` | Price validation |
| 🧪 Unit | `filterSchema should validate dateFrom/To` | Date validation |
| 🧪 Unit | `filterSchema should limit categories array to 10` | Array size limit |
| 🧪 Unit | `filterSchema should limit venues array to 10` | Array size limit |
| 🧪 Unit | `filterSchema should validate status enum` | Status enum validation |
| 🧪 Unit | `validateSearchQuery should return validated object` | Helper function |
| 🧪 Unit | `validateVenueSearch should return validated object` | Helper function |
| 🧪 Unit | `validateEventSearch should return validated object` | Helper function |
| 🧪 Unit | `validateSuggest should return validated object` | Helper function |
| 🧪 Unit | `validateGeoSearch should return validated object` | Helper function |

---

### 5. Middleware

#### `middleware/auth.middleware.ts` - Authentication

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `authenticate should extract Bearer token` | Token extraction |
| 🧪 Unit | `authenticate should return 401 when token missing` | Missing token handling |
| 🧪 Unit | `authenticate should verify JWT with secret` | JWT verification |
| 🧪 Unit | `authenticate should set request.user on success` | User object setting |
| 🧪 Unit | `authenticate should map userId/id correctly` | User ID mapping |
| 🧪 Unit | `authenticate should map venueId correctly` | Venue ID mapping |
| 🧪 Unit | `authenticate should map tenant_id or venueId` | Tenant ID mapping |
| 🧪 Unit | `authenticate should set default role user` | Default role |
| 🧪 Unit | `authenticate should set permissions array` | Permissions mapping |
| 🧪 Unit | `authenticate should return 401 for TokenExpiredError` | Expired token handling |
| 🧪 Unit | `authenticate should return 401 for invalid token` | Invalid token handling |
| 🧪 Unit | `authenticate should throw in production without JWT_SECRET` | Production validation |
| 🧪 Unit | `authenticate should warn in dev with default secret` | Development warning |
| 🧪 Unit | `authorize should return 401 when no user` | Missing user handling |
| 🧪 Unit | `authorize should return 403 when role not allowed` | Role validation |
| 🧪 Unit | `authorize should allow when role matches` | Role authorization |
| 🧪 Unit | `requireTenant should return 403 when no venueId` | Missing tenant handling |
| 🧪 Unit | `requireTenant should allow when venueId present` | Tenant validation |
| 🔗 Integration | `should authenticate with real JWT secret` | Real JWT validation |
| 🔗 Integration | `should work in Fastify request pipeline` | Middleware integration |

#### `middleware/rate-limit.middleware.ts` - Rate Limiting

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `RateLimiter constructor should store config` | Constructor validation |
| 🧪 Unit | `getKey should generate correct format` | Key generation |
| 🧪 Unit | `getKey should include window timestamp` | Timestamp inclusion |
| 🧪 Unit | `checkLimit should increment Redis counter` | Counter increment |
| 🧪 Unit | `checkLimit should set TTL on key` | TTL setting |
| 🧪 Unit | `checkLimit should return allowed true under limit` | Under limit behavior |
| 🧪 Unit | `checkLimit should return allowed false over limit` | Over limit behavior |
| 🧪 Unit | `checkLimit should calculate remaining correctly` | Remaining calculation |
| 🧪 Unit | `checkLimit should calculate resetTime correctly` | Reset time calculation |
| 🧪 Unit | `checkLimit should check tenant limit 10x user` | Tenant limit checking |
| 🧪 Unit | `checkLimit should block when tenant over limit` | Tenant blocking |
| 🧪 Unit | `checkLimit should handle Redis failure gracefully` | Redis failure handling |
| 🧪 Unit | `resetLimit should delete user keys by pattern` | Key deletion |
| 🧪 Unit | `createRateLimitMiddleware should create function` | Middleware factory |
| 🧪 Unit | `middleware should return 401 when no user` | Missing user handling |
| 🧪 Unit | `middleware should set rate limit headers` | Header setting |
| 🧪 Unit | `middleware should return 429 when limit exceeded` | Limit exceeded response |
| 🧪 Unit | `middleware should include retryAfter in 429` | Retry-After header |
| 🧪 Unit | `rateLimitPresets should have correct values` | Preset validation |
| 🧪 Unit | `registerRateLimiting should add global hook` | Global registration |
| 🔗 Integration | `should rate limit with real Redis` | Real Redis integration |
| 🔗 Integration | `should enforce rate limits over multiple requests` | Multi-request testing |
| 🔗 Integration | `should reset after window expires` | Window expiration |
| 🔗 Integration | `should block entire tenant when over limit` | Tenant-level limiting |

#### `middleware/tenant-context.ts` - Tenant Context

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `setTenantContext should use user.tenant_id first` | Priority ordering |
| 🧪 Unit | `setTenantContext should fallback to user.venueId` | Fallback behavior |
| 🧪 Unit | `setTenantContext should fallback to request.tenantId` | Request fallback |
| 🧪 Unit | `setTenantContext should use DEFAULT_TENANT_ID last` | Default tenant |
| 🧪 Unit | `setTenantContext should call db.raw for Knex` | Knex integration |
| 🧪 Unit | `setTenantContext should call db.query for pg` | pg integration |
| 🧪 Unit | `setTenantContext should set request.tenantId` | Tenant ID assignment |
| 🧪 Unit | `setTenantContext should log debug message` | Debug logging |
| 🧪 Unit | `setTenantContext should log error and throw on failure` | Error handling |
| 🔗 Integration | `should set PostgreSQL session variable` | Session variable setting |
| 🔗 Integration | `should enforce RLS after setting context` | RLS enforcement |

#### `middleware/tenant.middleware.ts` - Tenant Middleware

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `requireTenant should return 401 when no user` | Missing user handling |
| 🧪 Unit | `requireTenant should return 403 when no venueId` | Missing venue handling |
| 🧪 Unit | `requireTenant should call validateVenueId` | Validation call |
| 🧪 Unit | `requireTenant should return 400 on validation error` | Validation error handling |
| 🧪 Unit | `requireTenant should allow valid venueId` | Valid input acceptance |
| 🧪 Unit | `optionalTenant should allow missing user` | Optional user handling |
| 🧪 Unit | `optionalTenant should validate venueId if present` | Conditional validation |
| 🧪 Unit | `optionalTenant should allow missing venueId` | Optional venue handling |
| 🔗 Integration | `should work in route handler chain` | Route integration |
| 🔗 Integration | `should enforce tenant isolation in queries` | Query isolation |

#### `middleware/validation.middleware.ts` - Validation Middleware

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createValidator should return middleware function` | Factory pattern |
| 🧪 Unit | `validator should replace request.query with validated` | Query replacement |
| 🧪 Unit | `validator should return 400 on validation error` | Error response |
| 🧪 Unit | `validator should include details array in error` | Error details |
| 🧪 Unit | `validator should include field/message/type` | Detail structure |
| 🧪 Unit | `validateSearch should validate search params` | Search validation |
| 🧪 Unit | `validateVenues should validate venue params` | Venue validation |
| 🧪 Unit | `validateEvents should validate event params` | Event validation |
| 🧪 Unit | `validateSuggestions should validate suggest params` | Suggestion validation |
| 🧪 Unit | `handleValidationError should check error.isJoi` | Joi error detection |
| 🧪 Unit | `handleValidationError should format Joi errors` | Error formatting |
| 🧪 Unit | `handleValidationError should re-throw non-Joi errors` | Error passthrough |
| 🔗 Integration | `should validate in Fastify routes` | Route integration |
| 🔗 Integration | `should replace query in route handlers` | Query replacement integration |

---

### 6. Services - Core Search

#### `services/search.service.ts` - Main Search Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should set dependencies` | Dependency injection |
| 🧪 Unit | `search should build query with text` | Query building |
| 🧪 Unit | `search should use match_all without query` | Empty query handling |
| 🧪 Unit | `search should query single index when type specified` | Type filtering |
| 🧪 Unit | `search should query multiple indices without type` | Multi-index search |
| 🧪 Unit | `search should apply limit parameter` | Limit application |
| 🧪 Unit | `search should wait for consistency when token provided` | Consistency waiting |
| 🧪 Unit | `search should warn when consistency not achieved` | Consistency warning |
| 🧪 Unit | `search should skip wait when waitForConsistency false` | Wait skipping |
| 🧪 Unit | `search should add tenant filter when venueId provided` | Tenant filtering |
| 🧪 Unit | `search should allow cross-tenant for admin roles` | Admin cross-tenant |
| 🧪 Unit | `search should use preference for session stickiness` | Preference setting |
| 🧪 Unit | `search should format response correctly` | Response formatting |
| 🧪 Unit | `search should handle Elasticsearch errors gracefully` | Error handling |
| 🧪 Unit | `search should track search analytics` | Analytics tracking |
| 🧪 Unit | `searchVenues should call search with venues type` | Venue search delegation |
| 🧪 Unit | `searchEvents should call search with events type` | Event search delegation |
| 🧪 Unit | `searchEventsByDate should use date_from only` | Date filtering |
| 🧪 Unit | `searchEventsByDate should use date_to only` | Date filtering |
| 🧪 Unit | `searchEventsByDate should use both dates` | Date range filtering |
| 🧪 Unit | `searchEventsByDate should use match_all without dates` | Empty date handling |
| 🧪 Unit | `searchEventsByDate should add tenant filter` | Tenant filtering |
| 🧪 Unit | `searchEventsByDate should sort by date ascending` | Sorting |
| 🧪 Unit | `trackSearch should index analytics` | Analytics indexing |
| 🧪 Unit | `trackSearch should handle null userId` | Null user handling |
| 🧪 Unit | `trackSearch should silent fail on error` | Silent failure |
| 🧪 Unit | `getPopularSearches should use aggregations` | Aggregation query |
| 🧪 Unit | `getPopularSearches should use custom limit` | Limit parameter |
| 🧪 Unit | `getPopularSearches should handle errors` | Error handling |
| 🔗 Integration | `should search with real Elasticsearch` | Real ES search |
| 🔗 Integration | `should integrate with consistency service` | Consistency integration |
| 🔗 Integration | `should enforce tenant filtering in queries` | Tenant enforcement |
| 🔗 Integration | `searchEventsByDate should work with real dates` | Date search integration |
| 🔗 Integration | `trackSearch should write to search_analytics` | Analytics integration |
| 🔗 Integration | `getPopularSearches should aggregate real data` | Aggregation integration |

#### `services/autocomplete.service.ts` - Autocomplete Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should set dependencies` | Dependency injection |
| 🧪 Unit | `getSuggestions should return empty for query under 2 chars` | Length validation |
| 🧪 Unit | `getSuggestions should build venue suggest query` | Query building |
| 🧪 Unit | `getSuggestions should build event suggest query` | Query building |
| 🧪 Unit | `getSuggestions should query venues only` | Type filtering |
| 🧪 Unit | `getSuggestions should query events only` | Type filtering |
| 🧪 Unit | `getSuggestions should query both types` | Multi-type query |
| 🧪 Unit | `getSuggestions should use completion suggester` | Suggester usage |
| 🧪 Unit | `getSuggestions should enable fuzzy matching` | Fuzzy configuration |
| 🧪 Unit | `getSuggestions should set fuzziness to AUTO` | Fuzziness setting |
| 🧪 Unit | `getSuggestions should skip duplicates` | Deduplication |
| 🧪 Unit | `getSuggestions should limit to 5 per type` | Result limiting |
| 🧪 Unit | `getSuggestions should handle Elasticsearch errors` | Error handling |
| 🧪 Unit | `getSuggestionsWithContext should accept city context` | Context filtering |
| 🧪 Unit | `getSuggestionsWithContext should accept category context` | Context filtering |
| 🧪 Unit | `getSuggestionsWithContext should accept both contexts` | Multi-context |
| 🧪 Unit | `getSuggestionsWithContext should work without context` | Optional context |
| 🧪 Unit | `formatSuggestions should process venue suggestions` | Formatting |
| 🧪 Unit | `formatSuggestions should process event suggestions` | Formatting |
| 🧪 Unit | `formatSuggestions should sort by score` | Sorting |
| 🧪 Unit | `formatSuggestions should remove duplicates` | Deduplication |
| 🧪 Unit | `formatSuggestions should limit to 10 results` | Result limiting |
| 🔗 Integration | `should use real Elasticsearch completion suggesters` | Real suggester |
| 🔗 Integration | `should work with context-enabled indices` | Context integration |
| 🔗 Integration | `should deduplicate with real data` | Deduplication integration |

#### `services/sync.service.ts` - Data Sync Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should set dependencies` | Dependency injection |
| 🧪 Unit | `processMessage should route to syncVenue` | Routing logic |
| 🧪 Unit | `processMessage should route to syncEvent` | Routing logic |
| 🧪 Unit | `processMessage should route to syncTicket` | Routing logic |
| 🧪 Unit | `processMessage should parse routing key correctly` | Key parsing |
| 🧪 Unit | `processMessage should handle errors` | Error handling |
| 🧪 Unit | `syncVenue should enrich for non-delete actions` | Enrichment logic |
| 🧪 Unit | `syncVenue should skip enrichment for deleted` | Delete handling |
| 🧪 Unit | `syncVenue should fallback on enrichment failure` | Fallback logic |
| 🧪 Unit | `syncVenue should call indexWithConsistency` | Consistency call |
| 🧪 Unit | `syncVenue should set priority 9` | Priority setting |
| 🧪 Unit | `syncVenue should return consistency token` | Token return |
| 🧪 Unit | `syncEvent should enrich for non-delete actions` | Enrichment logic |
| 🧪 Unit | `syncEvent should skip enrichment for deleted` | Delete handling |
| 🧪 Unit | `syncEvent should fallback on enrichment failure` | Fallback logic |
| 🧪 Unit | `syncEvent should call indexWithConsistency` | Consistency call |
| 🧪 Unit | `syncEvent should set priority 9` | Priority setting |
| 🧪 Unit | `syncEvent should return consistency token` | Token return |
| 🧪 Unit | `syncTicket should enrich for non-delete actions` | Enrichment logic |
| 🧪 Unit | `syncTicket should skip enrichment for deleted` | Delete handling |
| 🧪 Unit | `syncTicket should fallback on enrichment failure` | Fallback logic |
| 🧪 Unit | `syncTicket should call indexWithConsistency` | Consistency call |
| 🧪 Unit | `syncTicket should trigger event re-index` | Event refresh |
| 🧪 Unit | `syncTicket should not trigger re-index for deleted` | Delete handling |
| 🧪 Unit | `syncTicket should handle event re-index failure` | Error handling |
| 🧪 Unit | `syncTicket should return consistency token` | Token return |
| 🔗 Integration | `should process with real enrichment services` | Enrichment integration |
| 🔗 Integration | `syncVenue should work end-to-end with Elasticsearch` | End-to-end venue |
| 🔗 Integration | `syncEvent should work end-to-end with Elasticsearch` | End-to-end event |
| 🔗 Integration | `syncTicket should trigger event re-indexing` | Re-indexing integration |
| 🔗 Integration | `should fallback when enrichment fails` | Fallback integration |
| 🔗 Integration | `should generate consistency tokens` | Token generation |

#### `services/professional-search.service.ts` - Advanced Search

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should set dependencies` | Dependency injection |
| 🧪 Unit | `search should check Redis cache first` | Cache checking |
| 🧪 Unit | `search should return cached result on hit` | Cache hit handling |
| 🧪 Unit | `search should build multi-index query without type` | Multi-index query |
| 🧪 Unit | `search should query single index with type` | Type filtering |
| 🧪 Unit | `search should build multi_match query` | Query building |
| 🧪 Unit | `search should use match_all without query` | Empty query handling |
| 🧪 Unit | `search should add geo_distance filter` | Geo filtering |
| 🧪 Unit | `search should add price range filter` | Price filtering |
| 🧪 Unit | `search should add date range filter` | Date filtering |
| 🧪 Unit | `search should add category terms filter` | Category filtering |
| 🧪 Unit | `search should add capacity range filter` | Capacity filtering |
| 🧪 Unit | `search should add performer nested query` | Nested query |
| 🧪 Unit | `search should add genre nested query` | Nested query |
| 🧪 Unit | `search should add amenities filter` | Amenities filtering |
| 🧪 Unit | `search should add accessibility filter` | Accessibility filtering |
| 🧪 Unit | `search should add minimum rating filter` | Rating filtering |
| 🧪 Unit | `search should calculate pagination correctly` | Pagination logic |
| 🧪 Unit | `search should build sort options` | Sort building |
| 🧪 Unit | `search should include aggregations` | Aggregation inclusion |
| 🧪 Unit | `search should include highlighting` | Highlight configuration |
| 🧪 Unit | `search should include phrase suggestions` | Suggestion inclusion |
| 🧪 Unit | `search should format results correctly` | Response formatting |
| 🧪 Unit | `search should cache results for 5 minutes` | Cache writing |
| 🧪 Unit | `search should track search analytics` | Analytics tracking |
| 🧪 Unit | `search should personalize results with userId` | Personalization |
| 🧪 Unit | `search should handle Elasticsearch errors` | Error handling |
| 🧪 Unit | `searchNearMe should call search with location` | Location search |
| 🧪 Unit | `getTrending should return cached results` | Cache retrieval |
| 🧪 Unit | `getTrending should query last 7 days` | Time range query |
| 🧪 Unit | `getTrending should use terms aggregation` | Aggregation usage |
| 🧪 Unit | `getTrending should cache for 1 hour` | Cache TTL |
| 🧪 Unit | `getTrending should handle errors` | Error handling |
| 🧪 Unit | `findSimilar should use more_like_this query` | MLT query |
| 🧪 Unit | `findSimilar should include correct fields` | Field configuration |
| 🧪 Unit | `findSimilar should handle errors` | Error handling |
| 🧪 Unit | `buildSort should handle distance sort` | Sort building |
| 🧪 Unit | `buildSort should handle date_asc sort` | Sort building |
| 🧪 Unit | `buildSort should handle date_desc sort` | Sort building |
| 🧪 Unit | `buildSort should handle price_asc sort` | Sort building |
| 🧪 Unit | `buildSort should handle price_desc sort` | Sort building |
| 🧪 Unit | `buildSort should handle popularity sort` | Sort building |
| 🧪 Unit | `buildSort should default to _score` | Default sort |
| 🧪 Unit | `buildSort should add created_at tiebreaker` | Tiebreaker |
| 🧪 Unit | `buildAggregations should include all aggregations` | Aggregation structure |
| 🧪 Unit | `formatFacets should format categories` | Facet formatting |
| 🧪 Unit | `formatFacets should format price ranges` | Facet formatting |
| 🧪 Unit | `formatFacets should format venues` | Facet formatting |
| 🧪 Unit | `formatFacets should format dates` | Facet formatting |
| 🧪 Unit | `formatFacets should format performers nested` | Nested facets |
| 🧪 Unit | `formatFacets should format genres nested` | Nested facets |
| 🧪 Unit | `formatFacets should format amenities` | Facet formatting |
| 🧪 Unit | `formatFacets should format accessibility` | Facet formatting |
| 🧪 Unit | `formatFacets should format ratings histogram` | Histogram formatting |
| 🧪 Unit | `formatFacets should calculate averages` | Average calculation |
| 🧪 Unit | `formatFacets should handle missing aggregations` | Missing data handling |
| 🧪 Unit | `trackSearch should silent fail on error` | Silent failure |
| 🧪 Unit | `personalizeResults should return unchanged` | Placeholder behavior |
| 🔗 Integration | `should search with real Elasticsearch and Redis` | Full integration |
| 🔗 Integration | `should cache over multiple requests` | Caching behavior |
| 🔗 Integration | `should filter with real data` | Filter integration |
| 🔗 Integration | `should aggregate with real data` | Aggregation integration |
| 🔗 Integration | `should query nested performers` | Nested query integration |
| 🔗 Integration | `should query nested genres` | Nested query integration |
| 🔗 Integration | `should perform geo-distance queries` | Geo integration |
| 🔗 Integration | `getTrending should work with real analytics` | Trending integration |
| 🔗 Integration | `findSimilar should work with real documents` | Similarity integration |

---

### 7. Services - Supporting

#### `services/consistency.service.ts` - Consistency Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should set dependencies` | Dependency injection |
| 🧪 Unit | `indexWithConsistency should avoid concurrent indexing` | Concurrency prevention |
| 🧪 Unit | `indexWithConsistency should generate consistency token` | Token generation |
| 🧪 Unit | `doIndex should generate idempotency key` | Key generation |
| 🧪 Unit | `doIndex should check for existing operation` | Duplicate check |
| 🧪 Unit | `doIndex should skip duplicate operations` | Idempotency |
| 🧪 Unit | `doIndex should increment version number` | Version increment |
| 🧪 Unit | `doIndex should create version on first index` | Initial version |
| 🧪 Unit | `doIndex should queue operation` | Queue insertion |
| 🧪 Unit | `doIndex should process high priority immediately` | Priority handling |
| 🧪 Unit | `doIndex should commit transaction on success` | Transaction commit |
| 🧪 Unit | `doIndex should rollback transaction on error` | Transaction rollback |
| 🧪 Unit | `processIndexOperation should DELETE with elasticsearch.delete` | Delete operation |
| 🧪 Unit | `processIndexOperation should CREATE with elasticsearch.index` | Create operation |
| 🧪 Unit | `processIndexOperation should UPDATE with elasticsearch.index` | Update operation |
| 🧪 Unit | `processIndexOperation should add _version to payload` | Version inclusion |
| 🧪 Unit | `processIndexOperation should add _indexed_at timestamp` | Timestamp inclusion |
| 🧪 Unit | `processIndexOperation should use refresh wait_for` | Refresh mode |
| 🧪 Unit | `processIndexOperation should update status to INDEXED` | Status update |
| 🧪 Unit | `processIndexOperation should reset retry_count on success` | Retry reset |
| 🧪 Unit | `processIndexOperation should increment retry_count on error` | Retry increment |
| 🧪 Unit | `processIndexOperation should log last_error` | Error logging |
| 🧪 Unit | `generateConsistencyToken should create random token` | Token randomness |
| 🧪 Unit | `generateConsistencyToken should set 60s expiry` | Token TTL |
| 🧪 Unit | `generateConsistencyToken should store in database` | Database storage |
| 🧪 Unit | `generateConsistencyToken should include version map` | Version inclusion |
| 🧪 Unit | `waitForConsistency should return true for missing token` | Missing token handling |
| 🧪 Unit | `waitForConsistency should return true for expired token` | Expired token handling |
| 🧪 Unit | `waitForConsistency should poll until indexed` | Polling behavior |
| 🧪 Unit | `waitForConsistency should respect maxWaitMs timeout` | Timeout enforcement |
| 🧪 Unit | `waitForConsistency should poll every 100ms` | Poll interval |
| 🧪 Unit | `waitForConsistency should return true on error` | Graceful degradation |
| 🧪 Unit | `checkVersionsIndexed should validate all versions` | Version validation |
| 🧪 Unit | `checkVersionsIndexed should return false for missing entity` | Missing entity handling |
| 🧪 Unit | `checkVersionsIndexed should return false for lower version` | Version comparison |
| 🧪 Unit | `checkVersionsIndexed should return false for PENDING status` | Status check |
| 🧪 Unit | `checkVersionsIndexed should strip s from entity type` | Type normalization |
| 🧪 Unit | `checkVersionsIndexed should handle JSON string input` | JSON parsing |
| 🧪 Unit | `generateIdempotencyKey should create SHA256 hash` | Hash generation |
| 🧪 Unit | `generateIdempotencyKey should be deterministic` | Determinism |
| 🧪 Unit | `generateIdempotencyKey should include all fields` | Field inclusion |
| 🧪 Unit | `startBackgroundProcessor should start interval` | Interval start |
| 🧪 Unit | `processQueuedOperations should fetch unprocessed` | Queue fetching |
| 🧪 Unit | `processQueuedOperations should order by priority desc` | Priority ordering |
| 🧪 Unit | `processQueuedOperations should order by created_at asc` | Time ordering |
| 🧪 Unit | `processQueuedOperations should limit to 10` | Batch limiting |
| 🧪 Unit | `processQueuedOperations should mark as processed` | Status update |
| 🧪 Unit | `processQueuedOperations should parse JSON payload` | JSON parsing |
| 🧪 Unit | `processQueuedOperations should handle errors gracefully` | Error handling |
| 🧪 Unit | `forceRefresh should refresh specific indices` | Index refresh |
| 🧪 Unit | `forceRefresh should default to events and venues` | Default indices |
| 🧪 Unit | `forceRefresh should handle errors` | Error handling |
| 🔗 Integration | `should work end-to-end with Postgres and Elasticsearch` | Full integration |
| 🔗 Integration | `should increment versions across operations` | Version tracking |
| 🔗 Integration | `idempotency should prevent duplicate indexing` | Idempotency test |
| 🔗 Integration | `high priority should index immediately` | Priority test |
| 🔗 Integration | `low priority should queue for background` | Queue test |
| 🔗 Integration | `background processor should process queue` | Background processing |
| 🔗 Integration | `waitForConsistency should work with real tokens` | Consistency test |
| 🔗 Integration | `consistency tokens should expire` | Expiration test |
| 🔗 Integration | `should prevent concurrent indexing` | Concurrency test |
| 🔗 Integration | `should retry on failures` | Retry test |
| 🔗 Integration | `should rollback transaction on errors` | Rollback test |
| 🔗 Integration | `forceRefresh should work with real Elasticsearch` | Refresh test |

#### `services/ab-testing.service.ts` - A/B Testing

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should initialize tests map` | Test initialization |
| 🧪 Unit | `getVariant should return control for unknown test` | Unknown test handling |
| 🧪 Unit | `getVariant should use random assignment` | Randomization |
| 🧪 Unit | `getVariant should respect variant weights` | Weight distribution |
| 🧪 Unit | `getVariant should return string variant name` | Return type |
| 🧪 Unit | `trackConversion should log to console` | Logging behavior |
| 🧪 Unit | `search_algorithm test should have 50/50 split` | Weight validation |
| 🔗 Integration | `should distribute variants over many samples` | Distribution test |

#### `services/cache-integration.ts` - Cache Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should initialize with config` | Configuration |
| 🧪 Unit | `serviceCache.get should call cache.get` | Method delegation |
| 🧪 Unit | `serviceCache.get should use fetcher` | Fetcher function |
| 🧪 Unit | `serviceCache.get should use custom TTL` | TTL configuration |
| 🧪 Unit | `serviceCache.set should call cache.set` | Method delegation |
| 🧪 Unit | `serviceCache.delete should call cache.delete` | Method delegation |
| 🧪 Unit | `serviceCache.flush should call cache.flush` | Method delegation |
| 🧪 Unit | `getCacheStats should return stats` | Stats retrieval |
| 🧪 Unit | `should configure TTL values` | TTL validation |
| 🔗 Integration | `should cache with real Redis` | Real caching |
| 🔗 Integration | `should expire after TTL` | Expiration test |
| 🔗 Integration | `should invalidate on delete` | Invalidation test |

#### `services/content-sync.service.ts` - Content Synchronization

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should set dependencies` | Dependency injection |
| 🧪 Unit | `syncVenueContent should fetch from MongoDB` | MongoDB query |
| 🧪 Unit | `syncVenueContent should filter by status published` | Status filtering |
| 🧪 Unit | `syncVenueContent should extract amenities` | Amenities extraction |
| 🧪 Unit | `syncVenueContent should extract accessibility` | Accessibility extraction |
| 🧪 Unit | `syncVenueContent should extract images` | Image extraction |
| 🧪 Unit | `syncVenueContent should fetch ratings` | Rating fetching |
| 🧪 Unit | `syncVenueContent should update Elasticsearch` | ES update |
| 🧪 Unit | `syncVenueContent should add content_updated_at` | Timestamp addition |
| 🧪 Unit | `syncVenueContent should handle errors` | Error handling |
| 🧪 Unit | `syncEventContent should fetch from MongoDB` | MongoDB query |
| 🧪 Unit | `syncEventContent should extract images` | Image extraction |
| 🧪 Unit | `syncEventContent should extract performers` | Performer extraction |
| 🧪 Unit | `syncEventContent should extract lineup` | Lineup extraction |
| 🧪 Unit | `syncEventContent should update Elasticsearch` | ES update |
| 🧪 Unit | `syncRatings should update venue index` | Venue rating sync |
| 🧪 Unit | `syncRatings should update event index` | Event rating sync |
| 🧪 Unit | `bulkSyncVenues should fetch all venue IDs` | ID fetching |
| 🧪 Unit | `bulkSyncVenues should return synced/failed counts` | Count tracking |
| 🧪 Unit | `bulkSyncVenues should handle individual failures` | Error resilience |
| 🧪 Unit | `bulkSyncEvents should fetch all event IDs` | ID fetching |
| 🧪 Unit | `bulkSyncEvents should return synced/failed counts` | Count tracking |
| 🧪 Unit | `extractAmenities should parse AMENITIES content` | Content parsing |
| 🧪 Unit | `extractAmenities should return unique set` | Deduplication |
| 🧪 Unit | `extractAccessibility should parse ACCESSIBILITY content` | Content parsing |
| 🧪 Unit | `extractAccessibility should return default structure` | Default handling |
| 🧪 Unit | `extractImages should parse GALLERY content` | Content parsing |
| 🧪 Unit | `extractImages should prioritize COVER_IMAGE first` | Priority ordering |
| 🧪 Unit | `extractPerformers should parse PERFORMER_BIO content` | Content parsing |
| 🧪 Unit | `extractLineup should parse LINEUP content` | Content parsing |
| 🧪 Unit | `extractLineup should return default structure` | Default handling |
| 🧪 Unit | `getRatingSummary should call ratingService` | Service delegation |
| 🧪 Unit | `getRatingSummary should return default on error` | Error handling |
| 🔗 Integration | `syncVenueContent should work with real MongoDB and ES` | Full sync test |
| 🔗 Integration | `syncEventContent should work with real MongoDB and ES` | Full sync test |
| 🔗 Integration | `syncRatings should work with real RatingService` | Rating integration |
| 🔗 Integration | `bulkSyncVenues should process multiple venues` | Bulk processing |
| 🔗 Integration | `bulkSyncEvents should process multiple events` | Bulk processing |

---

### 8. Services - Enrichment

#### `services/event-enrichment.service.ts` - Event Enrichment

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should set dependencies` | Dependency injection |
| 🧪 Unit | `enrich should fetch event from database` | Database query |
| 🧪 Unit | `enrich should throw when event not found` | Not found handling |
| 🧪 Unit | `enrich should fetch venue data` | Venue fetching |
| 🧪 Unit | `enrich should fetch performers with billing order` | Performer fetching |
| 🧪 Unit | `enrich should calculate pricing stats` | Stats calculation |
| 🧪 Unit | `enrich should count sold tickets` | Ticket counting |
| 🧪 Unit | `enrich should fetch MongoDB content` | MongoDB query |
| 🧪 Unit | `enrich should fetch ratings via RatingService` | Rating fetching |
| 🧪 Unit | `enrich should map performers correctly` | Performer mapping |
| 🧪 Unit | `enrich should handle missing venue` | Missing data handling |
| 🧪 Unit | `enrich should handle missing content` | Missing data handling |
| 🧪 Unit | `enrich should handle missing ratings` | Missing data handling |
| 🧪 Unit | `enrich should format location lat/lon` | Location formatting |
| 🧪 Unit | `enrich should use fallback currency USD` | Currency default |
| 🧪 Unit | `bulkEnrich should process multiple events` | Bulk processing |
| 🧪 Unit | `bulkEnrich should continue on individual errors` | Error resilience |
| 🧪 Unit | `getRatings should call RatingService` | Service delegation |
| 🧪 Unit | `getRatings should return empty object on error` | Error handling |
| 🧪 Unit | `calculateSearchBoost should boost featured events` | Boost calculation |
| 🧪 Unit | `calculateSearchBoost should boost high ratings` | Rating boost |
| 🧪 Unit | `calculateSearchBoost should boost review count` | Review boost |
| 🧪 Unit | `calculateSearchBoost should boost sell-through rate` | Sales boost |
| 🧪 Unit | `calculateSearchBoost should boost this week events` | Timing boost |
| 🧪 Unit | `calculateSearchBoost should boost this month events` | Timing boost |
| 🧪 Unit | `calculateSearchBoost should ignore past events` | Past event handling |
| 🔗 Integration | `should enrich with real Postgres MongoDB RatingService` | Full enrichment |
| 🔗 Integration | `should join performers correctly` | Join test |
| 🔗 Integration | `should calculate pricing from real tickets` | Pricing calculation |
| 🔗 Integration | `bulkEnrich should process multiple events` | Bulk test |

#### `services/venue-enrichment.service.ts` - Venue Enrichment

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should set dependencies` | Dependency injection |
| 🧪 Unit | `enrich should fetch venue from database` | Database query |
| 🧪 Unit | `enrich should throw when venue not found` | Not found handling |
| 🧪 Unit | `enrich should fetch venue sections` | Section fetching |
| 🧪 Unit | `enrich should fetch MongoDB content` | MongoDB query |
| 🧪 Unit | `enrich should fetch ratings via RatingService` | Rating fetching |
| 🧪 Unit | `enrich should map sections with pricing` | Section mapping |
| 🧪 Unit | `enrich should build full address string` | Address building |
| 🧪 Unit | `enrich should format location lat/lon` | Location formatting |
| 🧪 Unit | `enrich should use fallback values` | Default handling |
| 🧪 Unit | `enrich should map amenities from content` | Amenities mapping |
| 🧪 Unit | `enrich should map accessibility features` | Accessibility mapping |
| 🧪 Unit | `enrich should map images with primary flag` | Image mapping |
| 🧪 Unit | `enrich should include rating categories` | Category mapping |
| 🧪 Unit | `enrich should map contact info` | Contact mapping |
| 🧪 Unit | `enrich should map parking info` | Parking mapping |
| 🧪 Unit | `enrich should map policies` | Policy mapping |
| 🧪 Unit | `enrich should set status based on is_active` | Status mapping |
| 🧪 Unit | `bulkEnrich should process multiple venues` | Bulk processing |
| 🧪 Unit | `bulkEnrich should continue on individual errors` | Error resilience |
| 🧪 Unit | `getRatings should return category averages` | Category retrieval |
| 🧪 Unit | `getRatings should map foodAndDrink to concessions` | Mapping logic |
| 🧪 Unit | `getRatings should return undefined on error` | Error handling |
| 🧪 Unit | `calculateSearchBoost should boost featured venues` | Boost calculation |
| 🧪 Unit | `calculateSearchBoost should boost high ratings` | Rating boost |
| 🧪 Unit | `calculateSearchBoost should boost review count` | Review boost |
| 🧪 Unit | `calculateSearchBoost should boost large capacity` | Capacity boost |
| 🔗 Integration | `should enrich with real Postgres MongoDB RatingService` | Full enrichment |
| 🔗 Integration | `should fetch sections correctly` | Section integration |
| 🔗 Integration | `bulkEnrich should process multiple venues` | Bulk test |

#### `services/ticket-enrichment.service.ts` - Ticket Enrichment

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should set dependencies` | Dependency injection |
| 🧪 Unit | `enrich should fetch ticket from database` | Database query |
| 🧪 Unit | `enrich should throw when ticket not found` | Not found handling |
| 🧪 Unit | `enrich should fetch transfer history` | Transfer fetching |
| 🧪 Unit | `enrich should handle missing ticket_validations table` | Missing table handling |
| 🧪 Unit | `enrich should handle missing ticket_price_history table` | Missing table handling |
| 🧪 Unit | `enrich should fetch NFT data when nft_id present` | NFT fetching |
| 🧪 Unit | `enrich should skip NFT data when nft_id null` | NFT skipping |
| 🧪 Unit | `enrich should fetch active marketplace listing` | Listing fetching |
| 🧪 Unit | `enrich should handle missing marketplace_listings table` | Missing table handling |
| 🧪 Unit | `enrich should map transfer history correctly` | Transfer mapping |
| 🧪 Unit | `enrich should map validation history with location` | Validation mapping |
| 🧪 Unit | `enrich should map price history` | Price mapping |
| 🧪 Unit | `enrich should map marketplace listing data` | Listing mapping |
| 🧪 Unit | `enrich should set marketplace.isListed false when not listed` | Listing flag |
| 🧪 Unit | `enrich should map blockchain data from NFT` | Blockchain mapping |
| 🧪 Unit | `enrich should use fallback values for properties` | Default handling |
| 🧪 Unit | `enrich should use default currency USD` | Currency default |
| 🧪 Unit | `enrich should use nullable coalescing for boolean flags` | Boolean handling |
| 🧪 Unit | `bulkEnrich should process multiple tickets` | Bulk processing |
| 🧪 Unit | `bulkEnrich should continue on individual errors` | Error resilience |
| 🧪 Unit | `calculateSearchScore should boost verified tickets` | Verification boost |
| 🧪 Unit | `calculateSearchScore should boost NFT tickets` | NFT boost |
| 🧪 Unit | `calculateSearchScore should penalize many transfers` | Transfer penalty |
| 🧪 Unit | `calculateSearchScore should boost validated tickets` | Validation boost |
| 🧪 Unit | `calculateSearchScore should boost transferable/resellable` | Flag boost |
| 🧪 Unit | `calculateSearchScore should enforce minimum 0.1` | Minimum score |
| 🔗 Integration | `should enrich with real Postgres database` | Full enrichment |
| 🔗 Integration | `should fetch transfer history` | Transfer integration |
| 🔗 Integration | `should fetch validation history` | Validation integration |
| 🔗 Integration | `should fetch NFT data` | NFT integration |
| 🔗 Integration | `should fetch marketplace listing` | Listing integration |
| 🔗 Integration | `bulkEnrich should process multiple tickets` | Bulk test |

#### `services/marketplace-enrichment.service.ts` - Marketplace Enrichment

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should set dependencies` | Dependency injection |
| 🧪 Unit | `enrich should fetch listing from database` | Database query |
| 🧪 Unit | `enrich should throw when listing not found` | Not found handling |
| 🧪 Unit | `enrich should fetch ticket data` | Ticket fetching |
| 🧪 Unit | `enrich should fetch event data` | Event fetching |
| 🧪 Unit | `enrich should fetch venue data` | Venue fetching |
| 🧪 Unit | `enrich should fetch seller data` | Seller fetching |
| 🧪 Unit | `enrich should calculate seller stats` | Stats calculation |
| 🧪 Unit | `enrich should fetch buyer data when sold` | Buyer fetching |
| 🧪 Unit | `enrich should handle missing buyer` | Missing data handling |
| 🧪 Unit | `enrich should fetch offers` | Offer fetching |
| 🧪 Unit | `enrich should handle missing marketplace_offers table` | Missing table handling |
| 🧪 Unit | `enrich should fetch NFT data for tokenized tickets` | NFT fetching |
| 🧪 Unit | `enrich should calculate daysUntilEvent` | Date calculation |
| 🧪 Unit | `enrich should map event data` | Event mapping |
| 🧪 Unit | `enrich should map ticket data` | Ticket mapping |
| 🧪 Unit | `enrich should map venue with location` | Venue mapping |
| 🧪 Unit | `enrich should map seller with stats` | Seller mapping |
| 🧪 Unit | `enrich should map buyer protection` | Buyer mapping |
| 🧪 Unit | `enrich should map pricing with discount` | Pricing mapping |
| 🧪 Unit | `enrich should map offers` | Offer mapping |
| 🧪 Unit | `enrich should map blockchain data` | Blockchain mapping |
| 🧪 Unit | `enrich should map analytics` | Analytics mapping |
| 🧪 Unit | `enrich should map compliance data` | Compliance mapping |
| 🧪 Unit | `enrich should map shipping when required` | Shipping mapping |
| 🧪 Unit | `enrich should calculate recommendations` | Recommendation calculation |
| 🧪 Unit | `bulkEnrich should process multiple listings` | Bulk processing |
| 🧪 Unit | `bulkEnrich should continue on individual errors` | Error resilience |
| 🧪 Unit | `calculateRecommendationScore should start at 50` | Base score |
| 🧪 Unit | `calculateRecommendationScore should add seller reputation` | Reputation boost |
| 🧪 Unit | `calculateRecommendationScore should add price competitiveness` | Price boost |
| 🧪 Unit | `calculateRecommendationScore should add time urgency` | Urgency boost |
| 🧪 Unit | `calculateRecommendationScore should add verified ticket` | Verification boost |
| 🧪 Unit | `calculateRecommendationScore should clamp to 0-100` | Score clamping |
| 🧪 Unit | `getRecommendationReasons should identify power_seller` | Reason identification |
| 🧪 Unit | `getRecommendationReasons should identify highly_rated_seller` | Reason identification |
| 🧪 Unit | `getRecommendationReasons should identify great_price` | Reason identification |
| 🧪 Unit | `getRecommendationReasons should identify happening_soon` | Reason identification |
| 🧪 Unit | `getRecommendationReasons should identify verified_ticket` | Reason identification |
| 🧪 Unit | `getRecommendationReasons should identify popular_listing` | Reason identification |
| 🧪 Unit | `calculateUrgency should return critical for 1 day` | Urgency calculation |
| 🧪 Unit | `calculateUrgency should return high for 3 days` | Urgency calculation |
| 🧪 Unit | `calculateUrgency should return medium for 7 days` | Urgency calculation |
| 🧪 Unit | `calculateUrgency should return low for 30 days` | Urgency calculation |
| 🧪 Unit | `calculateUrgency should return none for over 30 days` | Urgency calculation |
| 🧪 Unit | `calculateQualityScore should evaluate listing completeness` | Quality scoring |
| 🧪 Unit | `calculateQualityScore should evaluate seller quality` | Quality scoring |
| 🧪 Unit | `calculateQualityScore should evaluate ticket quality` | Quality scoring |
| 🧪 Unit | `calculateQualityScore should clamp to 100` | Score clamping |
| 🧪 Unit | `calculateSearchBoost should boost featured/promoted` | Boost calculation |
| 🧪 Unit | `calculateSearchBoost should boost seller reputation` | Reputation boost |
| 🧪 Unit | `calculateSearchBoost should boost price competitiveness` | Price boost |
| 🧪 Unit | `calculateSearchBoost should boost time urgency` | Urgency boost |
| 🧪 Unit | `calculateSearchBoost should boost engagement` | Engagement boost |
| 🔗 Integration | `should enrich with real Postgres database` | Full enrichment |
| 🔗 Integration | `should join ticket/event/venue/seller/buyer` | Multi-join test |
| 🔗 Integration | `should calculate seller stats from real data` | Stats calculation |
| 🔗 Integration | `should fetch offers` | Offer integration |
| 🔗 Integration | `should fetch NFT data` | NFT integration |
| 🔗 Integration | `bulkEnrich should process multiple listings` | Bulk test |

---

### 9. Controllers & Routes

#### `controllers/search.controller.ts` - Main Search Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `GET / should sanitize query parameter` | Input sanitization |
| 🧪 Unit | `GET / should sanitize type parameter` | Input sanitization |
| 🧪 Unit | `GET / should sanitize limit parameter` | Input sanitization |
| 🧪 Unit | `GET / should use default limit 20` | Default value |
| 🧪 Unit | `GET / should pass userId/venueId/userRole to service` | Context passing |
| 🧪 Unit | `GET / should require authentication` | Auth enforcement |
| 🧪 Unit | `GET / should require tenant` | Tenant enforcement |
| 🧪 Unit | `GET /venues should sanitize query` | Input sanitization |
| 🧪 Unit | `GET /venues should pass user context to service` | Context passing |
| 🧪 Unit | `GET /venues should require auth and tenant` | Middleware enforcement |
| 🧪 Unit | `GET /events should sanitize query` | Input sanitization |
| 🧪 Unit | `GET /events should call searchEventsByDate with dates` | Date routing |
| 🧪 Unit | `GET /events should call searchEvents without dates` | Query routing |
| 🧪 Unit | `GET /events should sanitize date parameters` | Input sanitization |
| 🧪 Unit | `GET /events should require auth and tenant` | Middleware enforcement |
| 🧪 Unit | `GET /suggest should sanitize query` | Input sanitization |
| 🧪 Unit | `GET /suggest should return suggestions object` | Response formatting |
| 🧪 Unit | `GET /suggest should require auth and tenant` | Middleware enforcement |
| 🔗 Integration | `GET / should work end-to-end with auth token` | Full request test |
| 🔗 Integration | `GET / should return 401 without auth` | Auth test |
| 🔗 Integration | `GET / should return 403 without tenant` | Tenant test |
| 🔗 Integration | `GET / should return results with query` | Search test |
| 🔗 Integration | `GET /venues should work end-to-end` | Full request test |
| 🔗 Integration | `GET /events should work end-to-end` | Full request test |
| 🔗 Integration | `GET /events should work with date range` | Date filter test |
| 🔗 Integration | `GET /suggest should work end-to-end` | Autocomplete test |
| 🔗 Integration | `should enforce tenant isolation in queries` | Isolation test |

#### `controllers/professional-search.controller.ts` - Professional Search Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `POST /advanced should pass body to service` | Body passing |
| 🧪 Unit | `POST /advanced should require authentication` | Auth enforcement |
| 🧪 Unit | `POST /advanced should not require tenant` | Tenant bypass |
| 🧪 Unit | `GET /near-me should require lat and lon` | Required params |
| 🧪 Unit | `GET /near-me should return 400 when lat missing` | Validation error |
| 🧪 Unit | `GET /near-me should return 400 when lon missing` | Validation error |
| 🧪 Unit | `GET /near-me should parse lat/lon as floats` | Type parsing |
| 🧪 Unit | `GET /near-me should pass distance parameter` | Param passing |
| 🧪 Unit | `GET /near-me should pass type parameter` | Param passing |
| 🧪 Unit | `GET /near-me should require authentication` | Auth enforcement |
| 🧪 Unit | `GET /trending should return trending array` | Response formatting |
| 🧪 Unit | `GET /trending should require authentication` | Auth enforcement |
| 🧪 Unit | `GET /:index/:id/similar should extract params` | Param extraction |
| 🧪 Unit | `GET /:index/:id/similar should return similar array` | Response formatting |
| 🧪 Unit | `GET /:index/:id/similar should require authentication` | Auth enforcement |
| 🔗 Integration | `POST /advanced should work end-to-end` | Full request test |
| 🔗 Integration | `POST /advanced should return 401 without auth` | Auth test |
| 🔗 Integration | `GET /near-me should work with coordinates` | Geo search test |
| 🔗 Integration | `GET /near-me should return 400 without coordinates` | Validation test |
| 🔗 Integration | `GET /trending should work end-to-end` | Trending test |
| 🔗 Integration | `GET /:index/:id/similar should work end-to-end` | Similarity test |

#### `routes/health.routes.ts` - Health Check Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `GET /health should return status ok` | Status response |
| 🧪 Unit | `GET /health should include service name` | Name inclusion |
| 🧪 Unit | `GET /health/db should return ok when connected` | Connected status |
| 🧪 Unit | `GET /health/db should return 503 when disconnected` | Error status |
| 🧪 Unit | `GET /health/db should include error message on failure` | Error message |
| 🔗 Integration | `GET /health should work in running app` | App integration |
| 🔗 Integration | `GET /health/db should work with connected database` | DB integration |
| 🔗 Integration | `GET /health/db should work with disconnected database` | DB failure test |

---

### 10. Migrations

#### `migrations/001_search_consistency_tables.ts` - Search Service Migration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `up should create index_versions table` | Table creation |
| 🧪 Unit | `up should create index_queue table` | Table creation |
| 🧪 Unit | `up should create read_consistency_tokens table` | Table creation |
| 🧪 Unit | `up should add tenant_id to all tables` | Tenant column |
| 🧪 Unit | `up should create foreign keys to tenants table` | Foreign key |
| 🧪 Unit | `up should create unique constraint on entity_type/entity_id` | Unique constraint |
| 🧪 Unit | `up should create unique constraint on idempotency_key` | Unique constraint |
| 🧪 Unit | `up should create all indexes` | Index creation |
| 🧪 Unit | `up should enable RLS on all tables` | RLS enable |
| 🧪 Unit | `up should create RLS policies` | Policy creation |
| 🧪 Unit | `down should drop RLS policies` | Policy removal |
| 🧪 Unit | `down should disable RLS` | RLS disable |
| 🧪 Unit | `down should drop all tables` | Table removal |
| 🔗 Integration | `up should run migration successfully` | Migration run |
| 🔗 Integration | `should create tables with correct schema` | Schema validation |
| 🔗 Integration | `should enable RLS` | RLS validation |
| 🔗 Integration | `RLS policies should enforce tenant isolation` | Isolation test |
| 🔗 Integration | `down should run migration successfully` | Rollback test |
| 🔗 Integration | `should drop tables` | Cleanup validation |

---

### 11. Scripts

#### `scripts/create-indices.ts` - Index Creation Script

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `loadMapping should read file correctly` | File reading |
| 🧪 Unit | `loadMapping should parse JSON` | JSON parsing |
| 🧪 Unit | `loadMapping should throw on invalid JSON` | Error handling |
| 🧪 Unit | `createIndices should create venues index` | Index creation |
| 🧪 Unit | `createIndices should create events index` | Index creation |
| 🧪 Unit | `createIndices should create tickets index` | Index creation |
| 🧪 Unit | `createIndices should create marketplace index` | Index creation |
| 🧪 Unit | `createIndices should handle already-exists error` | Error handling |
| 🧪 Unit | `createIndices should exit with 0 on success` | Exit code |
| 🧪 Unit | `createIndices should exit with 1 on error` | Exit code |
| 🔗 Integration | `should create indices in real Elasticsearch` | Real creation |
| 🔗 Integration | `indices should have correct mappings` | Mapping validation |
| 🔗 Integration | `script should be idempotent` | Idempotency test |

#### `scripts/sync-data.ts` - Data Sync Script

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `syncData should fetch venues from database` | Database query |
| 🧪 Unit | `syncData should index venues to Elasticsearch` | Indexing |
| 🧪 Unit | `syncData should fetch events from database` | Database query |
| 🧪 Unit | `syncData should index events with venue data` | Joined indexing |
| 🧪 Unit | `syncData should refresh indices` | Index refresh |
| 🧪 Unit | `syncData should exit with 0 on success` | Exit code |
| 🧪 Unit | `syncData should exit with 1 on error` | Exit code |
| 🧪 Unit | `syncData should handle empty venue list` | Empty data |
| 🧪 Unit | `syncData should handle missing venue for event` | Missing data |
| 🔗 Integration | `should sync data from Postgres to Elasticsearch` | Full sync |
| 🔗 Integration | `data should be searchable after sync` | Search validation |
| 🔗 Integration | `script should handle large datasets` | Scale test |

#### `scripts/optimize-indices.ts` - Index Optimization Script

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `optimizeIndices should force merge all indices` | Force merge |
| 🧪 Unit | `optimizeIndices should update refresh_interval` | Setting update |
| 🧪 Unit | `optimizeIndices should update number_of_replicas` | Setting update |
| 🧪 Unit | `optimizeIndices should clear cache` | Cache clearing |
| 🧪 Unit | `optimizeIndices should exit with 0 on success` | Exit code |
| 🧪 Unit | `optimizeIndices should exit with 1 on error` | Exit code |
| 🔗 Integration | `should optimize real indices` | Real optimization |
| 🔗 Integration | `settings should be updated correctly` | Settings validation |

#### `scripts/sync-content.ts` - Content Sync Script

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `syncContent should initialize MongoDB` | MongoDB init |
| 🧪 Unit | `syncContent should initialize Elasticsearch` | ES init |
| 🧪 Unit | `syncContent should initialize Redis` | Redis init |
| 🧪 Unit | `syncContent should create ContentSyncService` | Service creation |
| 🧪 Unit | `syncContent should sync venues` | Venue sync |
| 🧪 Unit | `syncContent should sync events` | Event sync |
| 🧪 Unit | `syncContent should log summary` | Summary logging |
| 🧪 Unit | `syncContent should exit with 0 on success` | Exit code |
| 🧪 Unit | `syncContent should exit with 1 on error` | Exit code |
| 🧪 Unit | `syncContent should clean up Redis in finally` | Redis cleanup |
| 🧪 Unit | `syncContent should close MongoDB in finally` | MongoDB cleanup |
| 🔗 Integration | `should sync content from MongoDB to Elasticsearch` | Full sync |
| 🔗 Integration | `cleanup should happen on success` | Cleanup test |
| 🔗 Integration | `cleanup should happen on error` | Error cleanup |

---

## E2E Test Scenarios

### Category 1: Data Sync & Search Flows

| Test Name | Description |
|-----------|-------------|
| `Venue creation flow` | Venue-service creates → RabbitMQ → Search indexes with enrichment → User searches → Finds venue |
| `Event creation flow` | Event-service creates → Message → Search indexes with performers/pricing → User searches → Finds event |
| `Ticket creation flow` | Ticket created → Search indexes → Marketplace search finds ticket |
| `Marketplace listing flow` | Listing created → Search indexes with seller reputation → User searches → Finds listing |
| `Venue update flow` | Venue updated in venue-service → Message → Search re-indexes → Returns updated data |
| `Event update flow` | Event updated → Search re-indexes → Users see updated info immediately |
| `Delete flow` | Venue deleted → Message → Search removes from index → No longer returned |

---

### Category 2: Consistency & Real-Time Search

| Test Name | Description |
|-----------|-------------|
| `Read-after-write consistency` | User creates event → Gets consistency token → Searches with token → Sees event immediately |
| `Eventual consistency without token` | User creates event → Searches without token → May or may not see it → Eventually consistent |
| `High-priority indexing` | Critical update priority 9 → Indexes immediately → Available in search within seconds |
| `Background queue processing` | Low-priority update → Queued → Background processor picks up → Eventually indexed |

---

### Category 3: Multi-Tenant Isolation

| Test Name | Description |
|-----------|-------------|
| `Tenant isolation venue search` | Tenant A creates venue → Tenant B searches → Cannot see Tenant A's venue |
| `Tenant isolation event search` | Tenant A creates event → Tenant B searches → Cannot see Tenant A's event |
| `Cross-tenant admin search` | Admin with cross-tenant role → Searches → Can see all tenants' data |
| `Tenant context enforcement` | User without tenant_id → Tries to search → Gets 403 error |

---

### Category 4: Search Features

| Test Name | Description |
|-----------|-------------|
| `Basic text search` | User searches "Madison Square Garden" → Finds venue with fuzzy matching |
| `Autocomplete flow` | User types "Mad" → Gets suggestions → Selects → Searches → Gets results |
| `Date range search` | User searches events "next week" → Returns only events in date range |
| `Geo-location search` | User searches "events near me" with coordinates → Returns within radius |
| `Price filter search` | User searches tickets under $100 → Returns filtered results |
| `Category filter search` | User searches "concerts" category → Returns only concert events |
| `Multi-filter search` | User combines date + price + category → Returns correctly filtered results |
| `Sort by distance` | User searches with location → Results sorted by proximity |
| `Sort by date` | User searches events → Results sorted by event date |
| `Sort by price` | User searches marketplace → Results sorted by price |
| `Pagination` | User searches → Gets page 1 → Requests page 2 → Gets next results |

---

### Category 5: Advanced Search (Professional)

| Test Name | Description |
|-----------|-------------|
| `Performer search` | User searches for "Taylor Swift" → Returns events with that performer |
| `Venue amenities filter` | User searches venues with "wheelchair accessible" → Returns filtered venues |
| `Similar items search` | User views event → Requests similar events → Gets recommendations |
| `Trending searches` | User requests trending → Gets popular searches from last 7 days |
| `Search with facets` | User searches → Gets results + facets (categories, price ranges, venues) |
| `Search analytics` | User searches → Search tracked → Shows up in popular searches |

---

### Category 6: Enrichment & Content Sync

| Test Name | Description |
|-----------|-------------|
| `Venue enrichment` | Venue created → Enrichment pulls MongoDB content → Search includes amenities/images/ratings |
| `Event enrichment` | Event created → Enrichment pulls performers/pricing/ratings → Search includes full data |
| `Rating sync` | User rates venue → Rating synced to search → Results show updated rating |
| `Content update` | Venue updates images in CMS → Content synced → Search returns updated images |
| `Bulk content sync` | Admin runs bulk sync → All venues/events updated → Search reflects changes |

---

### Category 7: Error Handling & Resilience

| Test Name | Description |
|-----------|-------------|
| `Elasticsearch down` | Elasticsearch unavailable → Search returns graceful error → Service doesn't crash |
| `Database down` | PostgreSQL down → Consistency check fails gracefully → Returns error |
| `Redis down` | Redis cache unavailable → Rate limiting fails open → Search still works |
| `MongoDB down` | MongoDB unavailable → Enrichment falls back to basic data → Search still works |
| `RabbitMQ message failure` | Bad message format → Logged and rejected → Service continues processing |
| `Partial enrichment failure` | Enrichment service fails → Falls back to basic data → Still indexes entity |

---

### Category 8: Performance & Caching

| Test Name | Description |
|-----------|-------------|
| `Cache hit` | User searches → Results cached → Second search returns from cache instantly |
| `Cache expiration` | Cached result expires → Next search fetches fresh data → Updates cache |
| `High-load search` | 100 concurrent searches → All return results → No timeouts |
| `Large result sets` | Search returns 10,000+ results → Pagination works → Performance acceptable |

---

### Category 9: Security & Authentication

| Test Name | Description |
|-----------|-------------|
| `Unauthenticated search` | User without token → Searches → Gets 401 error |
| `Invalid token` | User with expired token → Searches → Gets 401 error |
| `Rate limiting` | User exceeds rate limit → Gets 429 error → Can retry after cooldown |
| `SQL injection attempt` | User tries SQL injection in search → Sanitized → No database access |
| `XSS attempt` | User tries XSS in search query → Sanitized → No script execution |

---

### Category 10: Complete User Journeys

| Test Name | Description |
|-----------|-------------|
| `Event discovery journey` | User browses, searches concerts, filters by date, sorts by price, views details, finds tickets |
| `Marketplace journey` | User searches tickets, filters by section, sorts by price, views seller reputation, makes offer |
| `Mobile location journey` | User opens app, gets location, searches events near me, finds nearby events |
| `Booking flow` | User searches event, selects tickets, views availability, completes purchase, tickets updated in search |

---

## Test Infrastructure Requirements

### Required Test Dependencies
```json
{
  "devDependencies": {
    "@types/jest": "^29.5.5",
    "@types/supertest": "^2.0.12",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "supertest": "^6.3.3",
    "testcontainers": "^10.0.0"
  }
}
```

### Test Containers Setup
```typescript
// tests/setup.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { ElasticsearchContainer } from '@testcontainers/elasticsearch';
import { GenericContainer } from 'testcontainers';

let postgresContainer: PostgreSqlContainer;
let elasticsearchContainer: ElasticsearchContainer;
let redisContainer: GenericContainer;
let mongoContainer: GenericContainer;

beforeAll(async () => {
  postgresContainer = await new PostgreSqlContainer().start();
  elasticsearchContainer = await new ElasticsearchContainer().start();
  redisContainer = await new GenericContainer('redis:7').start();
  mongoContainer = await new GenericContainer('mongo:7').start();
});

afterAll(async () => {
  await postgresContainer.stop();
  await elasticsearchContainer.stop();
  await redisContainer.stop();
  await mongoContainer.stop();
});
```

### Mock Data Fixtures

Create test fixtures for:
- Sample venues with full enrichment data
- Sample events with performers and pricing
- Sample tickets with transfer history
- Sample marketplace listings with offers
- Sample users with different roles and tenants

---

## Priority Matrix

### High Priority (Must Have)

| Category | Tests | Reason |
|----------|-------|--------|
| Security tests (tenant isolation, sanitization) | ~50 | Critical security vulnerabilities |
| Consistency service tests | ~50 | Core functionality for data integrity |
| Search service tests | ~30 | Primary service functionality |
| Integration tests for enrichment | ~12 | Data quality depends on enrichment |

### Medium Priority (Should Have)

| Category | Tests | Reason |
|----------|-------|--------|
| Professional search tests | ~60 | Advanced features users expect |
| E2E workflows | 56 | Validates complete user journeys |
| Middleware tests | ~80 | Request pipeline integrity |
| Controller tests | ~30 | API contract validation |

### Low Priority (Nice to Have)

| Category | Tests | Reason |
|----------|-------|--------|
| Script tests | ~40 | Admin/maintenance tooling |
| Performance monitor tests | ~18 | Monitoring and observability |
| AB testing tests | ~7 | Experimental features |

---

**END OF TEST PLAN**

**Total Tests: 888**
- Unit: 721
- Integration: 111  
- E2E: 56