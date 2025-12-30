# ADR-004: Redis for Session and Rate Limiting

## Status
Accepted

## Context
The auth-service needs:
- Fast session/token lookups
- Distributed rate limiting across instances
- Token blacklist for logout/revocation
- Temporary storage for MFA setup

## Decision
Use Redis as the caching and rate limiting store.

## Consequences

### Positive
- Sub-millisecond latency for lookups
- Built-in TTL support for automatic expiration
- Atomic operations for rate limiting counters
- Pub/sub for real-time token revocation
- Cluster support for high availability

### Negative
- Additional infrastructure dependency
- Data loss risk if not configured for persistence
- Memory constraints for large datasets
- Requires connection pooling management

### Neutral
- Well-supported by ioredis library
- Standard choice for this use case
- Can be replaced with Redis-compatible alternatives (KeyDB, Dragonfly)
