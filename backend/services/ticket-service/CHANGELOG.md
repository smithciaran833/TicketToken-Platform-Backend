# Changelog

All notable changes to the Ticket Service will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- MEDIUM audit remediation (Batch 18): Documentation, health checks, graceful degradation

## [1.2.0] - 2025-12-31

### Added
- MEDIUM audit remediation (Batch 16 & 17)
- Database TLS configuration with production requirements
- AuthZ failure security logging
- Unicode normalization for input validation
- Dead letter queue (DLQ) with retry tracking
- Credential rotation configuration and warnings
- SKIP LOCKED for concurrent ticket reservations
- Payload fingerprint validation for idempotency
- Concurrent request limiting middleware
- Ban mechanism for repeated rate limit violations
- 503 load shedding for system overload
- Tenant-scoped queue operations
- Recurring tenant-aware job scheduling
- Jest test setup file with global utilities
- Granular test scripts (unit, integration, e2e)

## [1.1.0] - 2025-12-30

### Added
- HIGH severity audit remediation (all 107 findings)
- OpenTelemetry tracing with auto-instrumentation
- Prometheus metrics endpoint at /metrics
- Service-to-service JWT authentication
- Per-endpoint authorization with service allowlists
- Circuit breaker pattern for external services
- Multi-tenancy with RLS and SET LOCAL
- Idempotency middleware with atomic database checks
- Route-specific rate limiting (purchase, transfer)
- Blockchain integration improvements
  - WebSocket listener with reconnection
  - RPC failover and circuit breaker
  - Block reorg handling
  - Pending transaction tracking
- Ticket lifecycle state machine
- Enhanced error handling (RFC 7807)
- Security features (account lockout, spending limits)
- Response schema validation
- Health check endpoints (startup, ready, live)
- Database statement and lock timeouts
- Documentation (README, OpenAPI, runbooks)
- Jest coverage thresholds (80%)

### Changed
- Error handler now returns Problem Details format
- Database pool configuration for production
- Rate limiter moved from in-memory to Redis
- Tenant middleware validates UUID format

### Security
- Fixed tenant isolation bypass (CRITICAL)
- Fixed S2S timing attack vulnerability (CRITICAL)
- Removed hardcoded secrets (CRITICAL)
- Fixed rate limiting bypass (CRITICAL)
- Added duplicate scan detection
- Fixed prototype pollution in schemas

## [1.0.0] - 2025-12-01

### Added
- Initial ticket service implementation
- Ticket creation and management
- QR code generation
- NFT minting integration
- Basic purchase flow
- Basic transfer flow
- Health check endpoint

---

## Migration Notes

### Upgrading to 1.2.0
- Run database migrations: `npm run migrate`
- No schema changes, backwards compatible

### Upgrading to 1.1.0
- Run database migrations: `npm run migrate`
- New migrations:
  - 002_add_ticket_scans.ts
  - 003_add_blockchain_tracking.ts
  - 004_add_rls_role_verification.ts
  - 005_add_idempotency_keys.ts
  - 006_add_ticket_state_machine.ts
  - 007_add_security_tables.ts
- New environment variables required:
  - Per-service secrets (AUTH_SERVICE_SECRET, etc.)
  - Database timeouts (DB_STATEMENT_TIMEOUT, DB_LOCK_TIMEOUT)
  - Tracing config (ENABLE_TRACING, OTEL_EXPORTER_OTLP_ENDPOINT)
- Review service-auth.ts for endpoint permission configuration
