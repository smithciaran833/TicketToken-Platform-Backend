# Changelog

All notable changes to auth-service will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GDPR compliance endpoints (export, delete, consent)
- S2S authentication middleware
- Idempotency key support
- CAPTCHA integration after failed logins
- OTP rate limiting
- Bulkhead pattern for resilience
- Circuit breaker for external services
- OpenTelemetry distributed tracing
- Comprehensive runbooks

### Changed
- Global rate limiting enabled (1000/min)
- Unicode normalization for email/username
- Enhanced password validation (new != current)
- Redis keys now tenant-prefixed

### Fixed
- Partial unique index for soft-deleted users
- RLS context setting for multi-tenancy
- Rate limit headers on 429 responses

### Security
- HTTPS redirect in production
- Transaction and statement timeouts
- Pre-commit hooks for secret detection

## [1.0.0] - 2024-XX-XX

### Added
- Initial release
- User registration and authentication
- JWT token management with rotation
- MFA (TOTP) support
- OAuth integration (Google, Apple)
- Wallet-based authentication
- Session management
- Audit logging
- Multi-tenant support with RLS
