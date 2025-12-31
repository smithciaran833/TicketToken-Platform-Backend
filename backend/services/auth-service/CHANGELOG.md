# Changelog

All notable changes to the auth-service will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Response schemas for all API endpoints (RD5)
- Session creation audit logging (SE7)
- Full HTTP metrics with Prometheus (M2)
- CI/CD pipeline with GitHub Actions
- Rollback documentation
- S2S authentication middleware with service allowlist

### Changed
- Upgraded error handling to RFC 7807 format
- Improved rate limiting with proper headers

### Fixed
- Process-level error handlers for unhandledRejection/uncaughtException
- Circuit breaker implementation for external services
- RLS context setting for multi-tenant queries

### Security
- Added HSTS headers
- Implemented OpenTelemetry distributed tracing
- Added 404 handler to prevent information leakage

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
