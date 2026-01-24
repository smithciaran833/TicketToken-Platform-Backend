# Changelog

All notable changes to the auth-service will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- **CRITICAL**: Fixed SQL injection vulnerability in `oauth.service.ts:72`
  - Changed from string interpolation to parameterized query using `set_config()`
  - Before: `SET LOCAL app.current_tenant_id = '${tenantId}'`
  - After: `SELECT set_config($1, $2, true)` with bound parameters
- Added HSTS headers
- Implemented OpenTelemetry distributed tracing
- Added 404 handler to prevent information leakage

### Added
- Response schemas for all API endpoints (RD5)
- Session creation audit logging (SE7)
- Full HTTP metrics with Prometheus (M2)
- CI/CD pipeline with GitHub Actions
- Rollback documentation
- S2S authentication middleware with service allowlist
- OpenAPI 3.0 specification at `docs/api/openapi.json`
- Export script for OpenAPI spec: `npm run openapi:export`
- Database migration for composite indexes (`002_composite_indexes.ts`)
  - `idx_users_tenant_email` - Login optimization
  - `idx_users_tenant_status` - Active user listing
  - `idx_users_tenant_role` - Role-based listing
  - `idx_user_sessions_tenant_user_active` - Active sessions (partial index)
  - `idx_user_venue_roles_tenant_user` - Role lookup
  - `idx_audit_logs_tenant_user_created` - Audit history
  - `idx_oauth_connections_tenant_user` - OAuth provider lookup
  - `idx_invalidated_tokens_tenant_expires` - Token cleanup
- E2E test plan documentation at `docs/testing/e2e-test-plan.md`
- Documentation for S2S key fallback behavior in `s2s.middleware.ts`

### Changed
- Upgraded error handling to RFC 7807 format
- Improved rate limiting with proper headers
- Replaced all `console.log`/`console.error` with structured Winston logger
  - `mfa.service.ts`, `oauth.service.ts`, `auth-extended.service.ts`
- Updated `tsconfig.json` with stricter compiler options
  - Added `noImplicitReturns: true`
  - Added `noFallthroughCasesInSwitch: true`

### Fixed
- Process-level error handlers for unhandledRejection/uncaughtException
- Circuit breaker implementation for external services
- RLS context setting for multi-tenant queries

### Removed
- Debug breadcrumb logging from `src/index.ts` (25+ console.log statements)
- Unused `react` and `react-dom` dependencies from `package.json`

## [1.0.0] - 2024-XX-XX

### Added
- Initial release
- User registration and login
- JWT authentication with RS256
- MFA with TOTP
- OAuth integration (Google, GitHub)
- Wallet authentication (Solana, Ethereum)
- Session management
- Role-based access control
- Multi-tenant support
- GDPR compliance endpoints
