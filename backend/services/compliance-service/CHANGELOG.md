# Changelog

**AUDIT FIX: DOC-H5**

All notable changes to the Compliance Service will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GDPR data export and deletion endpoints
- OFAC/SDN screening integration
- Tax form 1099 generation
- Risk assessment engine
- Webhook endpoints for external integrations

### Changed
- N/A

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A

### Security
- N/A

---

## [1.0.0] - 2026-01-03

### Added

#### Security Fixes (Audit Compliance)
- **SEC-H1**: BOLA protection in GDPR routes with `verifyUserAccess()`
- **SEC-H2**: BFLA protection in risk routes with `requireComplianceOfficer`
- **SEC-H3**: JWT algorithm whitelisting
- **SEC-H5**: Constant-time webhook signature verification

#### Input Validation
- **INP-H1**: Zod validation middleware on all routes
- **INP-H2**: `.strict()` schemas to prevent mass assignment
- **INP-H4**: Query parameter validation

#### Error Handling
- **ERR-H1**: RFC 7807 error responses
- **ERR-H2**: `setNotFoundHandler` with proper format
- **ERR-H3**: Stack traces removed in production

#### Health Checks
- **HEALTH-H1**: `/health/live` Kubernetes liveness probe
- **HEALTH-H2**: `/health/ready` Kubernetes readiness probe
- **HEALTH-H3**: Event loop lag monitoring
- **HEALTH-H4**: Health check timeouts (5s)

#### Graceful Degradation
- **GD-H3**: Load shedding middleware
- Event loop, memory, and concurrent request monitoring
- 503 responses with Retry-After header

#### Logging
- **LOG-H2**: Rate limit event logging
- **LOG-H3**: Auth failure logging and metrics
- **RL-H4**: Detailed rate limit logging
- Request/response logging with redaction

#### Configuration
- Config validation with Zod
- Secrets manager integration
- Environment-based configuration

#### Documentation
- **DOC-H3**: Operational runbooks
- **DOC-H4**: CONTRIBUTING.md
- **DOC-H5**: This CHANGELOG

### Changed
- Database configuration to use environment variables only (no hardcoded fallbacks)
- Webhook verification to use HMAC-SHA256
- Redis keys to include tenant prefix

### Security
- Removed hardcoded database password
- Removed hardcoded webhook secret
- Implemented proper HMAC webhook verification
- Added RLS policies for tenant isolation
- Added rate limiting registration

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-01-03 | Initial release with audit fixes |
| 0.9.0 | 2025-12-28 | Pre-audit baseline |

---

## Migration Guide

### Upgrading to 1.0.0

#### Breaking Changes

1. **Environment Variables Required**
   - `DATABASE_PASSWORD` is now required (no fallback)
   - `WEBHOOK_SECRET` is now required (no fallback)
   - `JWT_SECRET` is now required (no fallback)

2. **API Response Format**
   - All errors now return RFC 7807 format
   - Error responses have different structure

3. **Database Schema**
   - New RLS policies require `app.current_tenant_id` session variable
   - New idempotency_keys table

#### Migration Steps

1. Update environment variables:
```bash
# Required new variables
DATABASE_PASSWORD=<secure-password>
WEBHOOK_SECRET=<secure-secret-32-chars>
JWT_SECRET=<secure-jwt-secret>
```

2. Run database migrations:
```bash
npm run migrate
```

3. Update client error handling for RFC 7807 format

4. Test health endpoints:
```bash
curl http://localhost:3008/health/live
curl http://localhost:3008/health/ready
```

---

## Links

- [Contributing Guidelines](./docs/CONTRIBUTING.md)
- [Runbooks](./docs/RUNBOOKS.md)
- [API Documentation](./docs/API.md)
- [Audit Findings](./docs/AUDIT_FINDINGS.md)
