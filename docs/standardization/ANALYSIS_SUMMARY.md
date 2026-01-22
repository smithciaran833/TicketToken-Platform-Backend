# Service Standardization Analysis Summary
**Date:** January 21, 2026
**Source:** SERVICE_INVENTORY*.md files

---

## AUTHENTICATION PATTERNS SUMMARY

### Group 1: JWT Only (No HMAC for Internal Services)

| Service | Auth Method | Implementation Details |
|---------|-------------|----------------------|
| **analytics-service** | JWT + Internal HMAC available | HS256/RS256, issuer/audience validation, HMAC middleware exists but no internal endpoints |
| **api-gateway** | JWT (HS256) + RBAC | Token blacklisting, user details cached in Redis, enriches downstream requests with HMAC |
| **file-service** | JWT | RS256/HS256, issuer/audience validation, no internal service HMAC |
| **monitoring-service** | JWT + IP/Basic for metrics | No algorithm whitelist (gap), Prometheus scraping via IP whitelist |
| **queue-service** | JWT | No algorithm whitelist (gap), insecure fallback secret |
| **search-service** | JWT | No algorithm whitelist (gap), fallback secret in dev |

### Group 2: JWT + HMAC-SHA256 Internal Auth

| Service | Auth Method | Implementation Details |
|---------|-------------|----------------------|
| **blockchain-service** | HMAC-SHA256 | **60-second replay window** (tighter than others), service allowlist |
| **marketplace-service** | JWT + HMAC + Webhook | HS256/RS256, 60-second replay window, Stripe webhook verification |
| **minting-service** | HMAC + JWT + Webhook | 5-minute replay window, service allowlist, webhook idempotency via Redis |
| **order-service** | Dual HMAC | Nonce-based replay protection, service allowlist, timing-safe comparison |
| **transfer-service** | JWT + HMAC-SHA256 | Comprehensive algorithm whitelist (9 algos), JWKS support, 60-second replay |
| **scanning-service** | JWT + Service Key | Algorithm whitelist, issuer/audience validation, QR HMAC validation |

### Group 3: Multiple Authentication Methods

| Service | Auth Method | Implementation Details |
|---------|-------------|----------------------|
| **auth-service** | JWT (RS256) for S2S | Separate S2S keypair, service allowlist, `/internal/` endpoints with HMAC |
| **event-service** | JWT + Service Token + API Key + HMAC | 4 methods: User JWT, HMAC Service Token, API Key, Internal HMAC |
| **venue-service** | HMAC + Per-service credentials | Dual system with endpoint authorization per service |
| **payment-service** | Dual HMAC systems | Two payload formats: System 1 (extended) for `/internal/*`, System 2 (simple) for API |
| **ticket-service** | HMAC incoming + JWT+HMAC outgoing | Sends BOTH JWT and HMAC on outgoing requests for backwards compatibility |
| **compliance-service** | JWT + Webhook HMAC + Internal Secret | Triple auth: user JWT, webhook signatures, internal shared secret |
| **integration-service** | JWT + Internal HMAC + Webhook | Provider-specific webhook verification (Stripe, Square, Mailchimp, QuickBooks) |
| **notification-service** | JWT + Webhook (Twilio/SendGrid) | Algorithm whitelist (HS256/384/512), provider-specific signature verification |

### Group 4: JWT-Based with Special Features

| Service | Auth Method | Implementation Details |
|---------|-------------|----------------------|
| **blockchain-indexer** | JWT + Service JWT | Algorithm whitelist, issuer/audience validation, per-endpoint auth rules |

---

## HTTP CLIENT SUMMARY

### Using Shared Library (`@tickettoken/shared/clients`)

| Service | Client Type | Key Features |
|---------|-------------|--------------|
| **blockchain-indexer** | `ticketServiceClient` | System context for background operations |
| **blockchain-service** | `InternalServiceClient` + shared clients | Circuit breakers, HTTPS enforcement, TLS verification |
| **compliance-service** | `authServiceClient`, `venueServiceClient` | System context, admin user lookup |
| **minting-service** | `eventServiceClient`, `ticketServiceClient` | Request context with traceId |
| **transfer-service** | `ticketServiceClient`, `authServiceClient` | HMAC-signed outgoing calls, Metaplex SDK for NFTs |

### Custom HTTP Clients (Axios-based)

| Service | Client Type | Key Features |
|---------|-------------|--------------|
| **auth-service** | Custom axios + retry + circuit breaker | Exponential backoff, correlation ID tracking |
| **ticket-service** | `InterServiceClient` | Circuit breaker, JWT+HMAC dual auth on outgoing |
| **payment-service** | `SecureHttpClient` (native Node.js) | HMAC signing, HTTPS enforcement, custom agents |
| **api-gateway** | Axios + Opossum circuit breakers | HMAC signature generation, header filtering, fail-secure |
| **venue-service** | Axios + Opossum | TLS 1.2/1.3 minimum, optional HMAC signing |
| **order-service** | Secure Axios factory | Fail-closed for security operations, context propagation |
| **analytics-service** | Header generator available | Not actively used, reads from shared DBs |
| **marketplace-service** | axios + fetch + Solana SDK | **Gap**: Not using shared HMAC client |
| **notification-service** | axios + fetch | **Gap**: Simple tokens instead of HMAC |
| **queue-service** | axios + SDKs | **Gap**: Simple service key instead of HMAC |

### Custom HTTP Clients (Fetch-based)

| Service | Client Type | Key Features |
|---------|-------------|--------------|
| **event-service** | `VenueServiceClient` (node-fetch) | Opossum circuit breaker, S2S headers, cache fallback |

### Simple HTTP Clients (No HMAC)

| Service | Client Type | Key Features |
|---------|-------------|--------------|
| **file-service** | Simple axios | 2-second timeout, graceful degradation, **Gap**: Should use shared client |
| **monitoring-service** | Simple axios | Health checks to public `/health` endpoints (by design) |

### No HTTP Client (Direct Database or None)

| Service | Client Type | Reason |
|---------|-------------|--------|
| **scanning-service** | None | Direct database access for <500ms latency (documented exception) |
| **search-service** | None | Direct database access, data sync via RabbitMQ |
| **integration-service** | Provider SDKs | Uses Stripe, Square, Mailchimp, QuickBooks SDKs |

---

## QUEUE SYSTEMS SUMMARY

### RabbitMQ (amqplib) - Inter-service Messaging

| Service | Queue Usage | Features |
|---------|-------------|----------|
| **ticket-service** | Publish + Consume | DLQ support, 3 retries, 24h TTL, TLS in production |
| **payment-service** | Publish only (Outbox Pattern) | PostgreSQL outbox table, webhook delivery |
| **venue-service** | Publish + Cron jobs | Topic exchange `venue-events`, node-cron for scheduled tasks |
| **order-service** | Publish + Consume | DLQ via `tickettoken_events_dlx`, Redis idempotency |
| **analytics-service** | Consume all (`#`) | Wildcard binding, processes all platform events |
| **notification-service** | Consume only | Binding to 10 routing keys from various services |
| **search-service** | Consume only | Topic exchange `search.sync`, entity sync messages |
| **marketplace-service** | Configured (simulated) | **Gap**: Stubbed implementation, needs real amqplib |

### Bull (Redis-backed) - Internal Job Processing

| Service | Queue Usage | Features |
|---------|-------------|----------|
| **event-service** | Internal jobs only | 3 queues: transitions, notifications, cleanup; cron support |
| **blockchain-service** | 3 queues | `nft-minting`, `nft-transfer`, `nft-burn`; distributed locking |
| **minting-service** | 3 queues + DLQ | `ticket-minting`, retry, DLQ; stale job detection; Prometheus metrics |
| **integration-service** | 4 priority queues | Critical/High/Normal/Low priority; webhook processing |
| **analytics-service** | 5 queues | `ticket-purchase`, `ticket-scan`, `page-view`, etc. |

### BullMQ (Redis-backed) - Internal Job Processing

| Service | Queue Usage | Features |
|---------|-------------|----------|
| **notification-service** | 5 queues | Notifications, batch, webhooks, retry, dead letter |

### pg-boss (PostgreSQL-backed) - ACID Job Processing

| Service | Queue Usage | Features |
|---------|-------------|----------|
| **queue-service** | 3 tiers | TIER_1 (PostgreSQL+Redis), TIER_2 (Redis), TIER_3 (Memory) |

### Native setTimeout/setInterval Scheduling

| Service | Usage | Features |
|---------|-------|----------|
| **venue-service** | node-cron | Daily/hourly jobs: webhook cleanup, cache warming, SSL renewal |
| **compliance-service** | setTimeout | Daily OFAC update, compliance checks, weekly reports |
| **monitoring-service** | setInterval | Health checks (30s), metric collection (60s), alert evaluation (60s) |

### No Queue System

| Service | Reason |
|---------|--------|
| **auth-service** | Synchronous operations only |
| **api-gateway** | Synchronous proxy by design |
| **blockchain-indexer** | Polling-based indexer, Redis for deduplication |
| **file-service** | Stub workers, on-demand cleanup |
| **scanning-service** | Real-time requirement (<500ms) |
| **transfer-service** | Redis-backed idempotency instead |

---

## INTERNAL ENDPOINTS SUMMARY

### Services WITH `/internal/` Routes

| Service | # Endpoints | Description |
|---------|-------------|-------------|
| **auth-service** | 7 | validate-permissions, validate-users, user-tenant, health, users by ID/email/admins |
| **ticket-service** | 13 | Status, cancel-batch, calculate-price, full ticket, by-event, by-token, transfer, count, record-scan, update-nft, batch-by-token, for-validation, for-refund |
| **event-service** | 3 | Event details with blockchain fields, PDA data, scan stats |
| **payment-service** | 2 | payment-complete, calculate-tax |
| **venue-service** | 4 | validate-ticket, venue details, bank-info, chargeback-rate |
| **order-service** | 4 | Order details, order items, orders-without-tickets, for-payment |
| **blockchain-service** | 1 | mint-tickets |
| **minting-service** | 3 | mint, mint/batch, mint/status/:ticketId |

### Services WITHOUT `/internal/` Routes

| Service | Communication Pattern |
|---------|----------------------|
| **api-gateway** | Entry point - calls others, doesn't expose internal APIs |
| **analytics-service** | Data consumer via RabbitMQ, no internal provider APIs |
| **blockchain-indexer** | Read-only query service, pushes to ticket-service |
| **compliance-service** | Data owner, other services call it via standard API |
| **file-service** | Standalone file storage |
| **integration-service** | Third-party hub, internal calls use standard API |
| **marketplace-service** | Uses webhook endpoints with HMAC auth |
| **monitoring-service** | Observer role - monitors others |
| **notification-service** | Receives events via RabbitMQ |
| **queue-service** | Job processing hub, no internal APIs |
| **scanning-service** | Direct database access for performance |
| **search-service** | Data sync via RabbitMQ |
| **transfer-service** | All routes are public API |

---

## STANDARDIZATION GAPS IDENTIFIED

### Critical Gaps

| Service | Gap | Recommendation |
|---------|-----|----------------|
| **marketplace-service** | RabbitMQ stubbed/simulated | Implement real amqplib connection |
| **marketplace-service** | Ticket/notification calls lack HMAC | Use `@tickettoken/shared/clients` |
| **notification-service** | Venue/auth calls use simple tokens | Use `@tickettoken/shared/clients` |
| **file-service** | Venue service calls lack HMAC | Use `@tickettoken/shared/clients` |
| **queue-service** | No HMAC validation for callers | Add HMAC middleware |

### Medium Gaps

| Service | Gap | Recommendation |
|---------|-----|----------------|
| **monitoring-service** | JWT no algorithm whitelist | Add `algorithms: ['HS256', 'RS256']` |
| **queue-service** | JWT no algorithm whitelist, insecure fallback | Add algorithm whitelist, remove fallback |
| **search-service** | JWT no algorithm whitelist | Add algorithm whitelist |
| **minting-service** | Admin JWT no algorithm whitelist | Add algorithm whitelist to admin-auth |

### By Design (Not Gaps)

| Service | Pattern | Justification |
|---------|---------|---------------|
| **scanning-service** | Direct database access | <500ms latency requirement |
| **search-service** | Direct database access | Data enrichment for indexing |
| **monitoring-service** | No HMAC on health checks | Health endpoints are public by design |

---

## SECURITY FEATURES COMPARISON

| Feature | Services with Implementation |
|---------|------------------------------|
| **Timing-safe comparison** | All HMAC services (crypto.timingSafeEqual) |
| **Algorithm whitelist** | transfer, scanning, notification, analytics, file, blockchain-indexer, compliance |
| **Issuer/Audience validation** | transfer, scanning, analytics, blockchain-indexer, compliance, file |
| **60-second replay window** | blockchain-service, marketplace-service, transfer-service |
| **5-minute replay window** | Most other HMAC services |
| **Service allowlist** | All services with internal auth |
| **Circuit breakers** | api-gateway, venue, event, order, blockchain, ticket, payment |
| **TLS enforcement** | blockchain-service, payment-service, venue-service |
| **Redis-based idempotency** | minting, notification, order, transfer |
| **PostgreSQL-based idempotency** | queue-service |

---

## SUMMARY STATISTICS

| Metric | Count |
|--------|-------|
| **Total services analyzed** | 18 |
| **Services with internal endpoints** | 8 |
| **Services using RabbitMQ** | 8 |
| **Services using Bull/BullMQ** | 6 |
| **Services using pg-boss** | 1 |
| **Services with no queues** | 6 |
| **Services using shared HTTP client** | 5 |
| **Services with standardization gaps** | 5 |
