# API Changelog

All notable changes to the API are documented here.

## [Unreleased]

### Added
- Bulk transfer endpoint (up to 50 tickets)
- Spending limits enforcement
- Multi-sig approval for high-value operations

### Changed
- Rate limit headers now use standard `RateLimit-*` format

### Deprecated
- None

## [1.2.0] - 2025-12-31

### Added
- OpenTelemetry distributed tracing
- Prometheus metrics endpoint (`/metrics`)
- Account lockout after failed attempts
- Circuit breaker for external services
- RFC 7807 Problem Details error format

### Changed
- Rate limiting now uses Redis (distributed)
- Idempotency keys now tenant-scoped
- State machine validates all transitions

### Fixed
- Timing attack vulnerability in S2S auth
- Tenant isolation bypass via header spoofing

## [1.1.0] - 2025-12-15

### Added
- Ticket state machine with terminal states
- Duplicate scan detection
- Blockchain transaction tracking
- Dead letter queue for failed messages

### Changed
- All secrets required in production
- Database TLS required in production

## [1.0.0] - 2025-12-01

### Added
- Initial release
- Ticket purchase flow
- Ticket transfer flow
- QR code validation
- Event management endpoints
