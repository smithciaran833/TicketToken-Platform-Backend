# Changelog

All notable changes to the minting-service will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- IPFS failover between Pinata and NFT.Storage (#11)
- Queue size limits and load shedding (#13)
- Bull Board dashboard at `/admin/queues` (#18)
- Worker error categorization and metrics (#16)
- Load shedding middleware with priority-based request handling (#12)
- Bulkhead pattern for workload isolation (#14)
- Standardized health status values (#8)
- Event loop monitoring (#32)
- Migration best practices with CONCURRENTLY indexes (#25)
- Environment-specific configuration files (#19)
- Redis TLS support (#21)
- Blockchain architecture documentation (#27, #28, #29, #30)
- CONTRIBUTING.md with C4 diagrams and glossary (#4, #5, #6)

### Changed
- Health endpoints no longer expose uptime (security fix) (#9)
- Dockerfile: pinned base image to digest, added cache cleanup, removed SUID binaries (#22, #23, #50)

### Security
- Added lock_timeout to migrations (#54)
- Verified pgcrypto extension (#55)

## [1.2.0] - 2026-01-01

### Added
- Custom error classes for better error handling
- Request logging middleware with timing
- Tenant cache for multi-tenant queries
- Stale job detection for stuck queue jobs
- RPC failover between primary and fallback endpoints
- CID verification for IPFS uploads
- Soft delete for mint records
- Row Level Security (RLS) policies

### Changed
- Improved log sanitization to redact secrets
- Enhanced circuit breaker for Solana and IPFS

## [1.1.0] - 2025-12-15

### Added
- Dead Letter Queue (DLQ) for permanently failed jobs
- Exponential backoff with jitter for retries
- Prometheus metrics for queue monitoring
- Balance monitoring and alerts

### Changed
- Increased default job timeout to 5 minutes
- Improved error messages for debugging

### Fixed
- Race condition in concurrent minting
- Memory leak in long-running workers

## [1.0.0] - 2025-12-01

### Added
- Initial release of minting service
- Compressed NFT (cNFT) minting via Bubblegum
- Multi-tenant support
- Bull queue for async job processing
- Health check endpoints
- Basic Prometheus metrics
- IPFS metadata upload via Pinata

### Security
- JWT authentication for API endpoints
- Service-to-service authentication
- Wallet key encryption

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 1.2.0 | 2026-01-01 | Error handling, logging, tenant cache, RPC failover |
| 1.1.0 | 2025-12-15 | DLQ, retry improvements, metrics |
| 1.0.0 | 2025-12-01 | Initial release |

## Upgrade Notes

### Upgrading to 1.2.0

1. Run new migrations: `npm run migrate`
2. Add new environment variables:
   - `SOLANA_RPC_FALLBACK` (optional)
   - `STALE_JOB_CHECK_INTERVAL_MS` (default: 60000)
3. Restart all workers

### Upgrading from 1.0.x to 1.1.0

1. Update Bull queue configuration for DLQ support
2. New Redis keys will be created for DLQ
3. Monitor DLQ with new `/admin/dlq` endpoint
