# Changelog

All notable changes to @tickettoken/shared will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-11-15

### Added

- **Comprehensive README.md** with full API documentation and usage examples
- **Peer Dependencies** explicitly defined (express, redis, pg, typescript)
- **Engine Requirements** specified (Node >= 18.0.0, npm >= 9.0.0)
- **Enhanced Exports** - Added all security utilities to main index.ts:
  - `AuditLogger` for audit logging
  - `helmetMiddleware`, `rateLimiters`, security middleware functions
  - `requestIdMiddleware`, `ipMiddleware` for request tracking
  - Express type re-exports for convenience

### Changed

- **TypeScript Strict Mode** enabled with comprehensive type checking:
  - `strict: true`
  - `noImplicitAny: true`
  - `strictNullChecks: true`
  - Additional checks: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- **Enhanced tsconfig.json** with improved compiler options
- **Expanded include paths** in tsconfig to cover middleware and security directories
- **Source maps enabled** for better debugging

### Documentation

- Added comprehensive README with:
  - Installation instructions
  - Requirements and peer dependencies
  - Feature list and capabilities
  - Usage examples for all major features
  - API reference
  - Security best practices
  - Migration guides
  - Contributing guidelines

### Non-Breaking Changes

All changes in v1.1.0 are non-breaking. Services using v1.0.1 can upgrade seamlessly.

---

## [1.0.1] - 2025-11-15

### 🔴 CRITICAL SECURITY FIXES

#### Fixed

- **[CRITICAL]** Removed hardcoded database credentials from `security/audit-logger.ts`
  - Eliminated hardcoded PostgreSQL password that was exposed in source code
  - Made `DATABASE_URL` environment variable mandatory (no fallback)
  - Added connection pool configuration and error handling
  - Service now fails fast if `DATABASE_URL` is not configured
  - **BREAKING**: Services must have `DATABASE_URL` set or will fail to start
  - **ACTION REQUIRED**: Rotate database credentials immediately (see PHASE0_SECURITY_INCIDENT_REPORT.md)

- **[HIGH]** Removed unsafe Redis localhost fallback from `middleware/security.middleware.ts`
  - Eliminated fallback to `redis://localhost:6379` if `REDIS_URL` not set
  - Made `REDIS_URL` environment variable mandatory
  - Added reconnection strategy with max 10 retries
  - Added comprehensive error handling
  - Service now fails fast if Redis is not available
  - **BREAKING**: Services must have `REDIS_URL` set or will fail to start

#### Security

- Added fail-fast behavior for missing critical environment variables
- Implemented proper connection pooling for PostgreSQL
- Added Redis reconnection strategy with exponential backoff
- Improved error handling and logging for connection failures

### Migration Guide

#### From v1.0.0 to v1.0.1

**REQUIRED ACTIONS:**

1. **Rotate Database Credentials** (CRITICAL - within 4 hours)

   ```bash
   # Generate new password
   NEW_DB_PASSWORD=$(openssl rand -base64 32)

   # Update database
   psql -h <db_host> -U postgres -c \
     "ALTER USER tickettoken WITH PASSWORD '$NEW_DB_PASSWORD';"

   # Update all service environment variables
   DATABASE_URL=postgresql://tickettoken:$NEW_DB_PASSWORD@<host>:5432/tickettoken_db
   ```

2. **Verify Environment Variables**

   All services MUST have these environment variables set:

   ```bash
   # Required - no fallback
   DATABASE_URL=postgresql://user:password@host:port/database
   REDIS_URL=redis://host:port
   ```

3. **Update Services**

   ```bash
   npm install @tickettoken/shared@1.0.1
   npm run build
   ```

4. **Test Before Deployment**
   - Verify services start successfully with new environment variables
   - Test database connectivity
   - Test Redis connectivity
   - Verify audit logging works
   - Verify rate limiting works

#### Breaking Changes

- `DATABASE_URL` is now **required** - services will crash at startup if not set
- `REDIS_URL` is now **required** - services will crash at startup if not set
- No more fallback to localhost connections
- Services will exit with error code 1 if connections fail

#### Why These Changes Are Breaking

Previously, services could start without these environment variables by falling back to localhost defaults. This was convenient for development but **catastrophically insecure** for production.

The new behavior is intentionally strict:

- Forces explicit configuration
- Prevents accidental production deployments without proper credentials
- Fails fast rather than running with insecure defaults
- Aligns with security best practices

### Security Advisory

**CVE Tracking**: Internal incident PHASE0-2025-11-15

**Affected Versions**: 1.0.0

**Fixed Versions**: 1.0.1+

**Severity**: CRITICAL (CVSS 9.8)

**Description**: Hardcoded database credentials and unsafe fallback connection strings were present in the shared library, potentially exposing database access to unauthorized parties.

**Remediation**:

1. Update to v1.0.1 immediately
2. Rotate all database credentials
3. Verify REDIS_URL is configured in all environments
4. Review database access logs for suspicious activity

**References**:

- PHASE0_SECURITY_INCIDENT_REPORT.md
- SHARED_LIBRARY_COMPREHENSIVE_AUDIT.md

---

## [1.0.0] - 2025-10-01

### Added

- Initial release of @tickettoken/shared library
- Authentication utilities
- Security middleware (Helmet, rate limiting, XSS protection, SQL injection protection)
- Audit logging
- Queue utilities (Bull, RabbitMQ)
- Database utilities
- Validation helpers
- Error handling utilities
- Logging configuration

### Security

- Implemented comprehensive security middleware
- Added rate limiting with Redis backend
- Implemented SQL injection protection
- Implemented XSS protection
- Added audit logging for compliance

---

## Upcoming

### Planned for v1.1.0

- Add secrets management integration (HashiCorp Vault)
- Implement automatic credential rotation
- Add pre-commit hooks for secret detection
- Enhanced monitoring and alerting
- Additional security middleware options

### Planned for v1.2.0

- Add distributed tracing utilities
- Enhanced metrics collection
- Additional queue providers support
- Improved error tracking integration

---

## Support

For security issues, please report to: security@tickettoken.com (DO NOT file public issues)

For bugs and features, please file issues on the repository.

---

## Versioning

We use [Semantic Versioning](https://semver.org/):

- MAJOR version for incompatible API changes
- MINOR version for backwards-compatible functionality additions
- PATCH version for backwards-compatible bug fixes

Security fixes are released as PATCH versions and should be applied immediately.
