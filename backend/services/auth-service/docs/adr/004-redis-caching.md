# ADR 004: Use Redis for Caching and Sessions

## Status

Accepted

## Context

We needed a solution for:
- Session storage
- Rate limiting state
- Token blacklisting
- Temporary data (nonces, verification codes)

Options considered:
- Redis
- Memcached
- In-memory (Node.js)
- Database

## Decision

We chose **Redis** for the following reasons:

1. **Speed**: Sub-millisecond latency
2. **Data Structures**: Lists, sets, sorted sets for various use cases
3. **TTL Support**: Automatic expiration for temporary data
4. **Pub/Sub**: Future use for real-time features
5. **Persistence**: Optional durability
6. **Clustering**: Horizontal scaling when needed

## Consequences

### Positive
- Excellent performance
- Rich data structure support
- Built-in expiration
- Well-understood by team

### Negative
- Additional infrastructure to manage
- Data loss possible without persistence
- Memory-bound (cost consideration)

## Usage Patterns

| Use Case | Key Pattern | TTL |
|----------|-------------|-----|
| Rate limiting | `ratelimit:{ip}:{endpoint}` | 1 min |
| Refresh tokens | `refresh:{token}` | 7 days |
| Blacklisted tokens | `blacklist:{token}` | Token expiry |
| Wallet nonces | `wallet-nonce:{nonce}` | 15 min |
| MFA codes | `mfa:{userId}` | 5 min |

## References

- [Redis Documentation](https://redis.io/documentation)
- [Redis Best Practices](https://redis.io/docs/management/optimization/)
