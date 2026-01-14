# Changelog

All notable changes to the event-service will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Token scope validation (TM6) for fine-grained S2S authorization
- Token revocation support (TM8) for compromised credentials
- Unicode normalization (SEC8) in input validation
- Check constraint error handling (DB8/23514)
- Grace period configuration for time-sensitive operations
- Server time in API responses

### Changed
- Improved error handler with additional PostgreSQL error codes
- Enhanced input validation with Unicode normalization

### Security
- Added token scope validation to prevent privilege escalation
- Added token revocation list for emergency credential invalidation

## [1.0.0] - 2025-01-04

### Added
- Initial release of event-service
- Event CRUD operations with full validation
- Event state machine with valid transitions
- Multi-tenant support with RLS policies
- S2S authentication with service tokens
- Idempotency middleware for POST/PUT operations
- Circuit breaker for external service calls
- Retry logic with exponential backoff and jitter
- OpenTelemetry distributed tracing
- RFC 7807 error responses
- Health check endpoints (/health/live, /health/ready, /health/startup)
- Graceful shutdown with LB drain delay
- Scheduled jobs for automatic state transitions
- Cancellation workflow with refunds and notifications

### Security
- Row Level Security (RLS) on all tenant tables
- SET LOCAL tenant context in all transactions
- API key middleware for external integrations
- PII redaction in logs
- TLS certificate validation for database connections
- Rate limiting with tenant and user awareness

### Documentation
- OpenAPI specification
- ADR for event state machine
- Runbooks for incident response and rollbacks
- Contributing guidelines
