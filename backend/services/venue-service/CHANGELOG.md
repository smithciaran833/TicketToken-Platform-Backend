# Changelog

All notable changes to the Venue Service will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive security audit fixes (88+ findings addressed)
- Row-Level Security (RLS) policies for multi-tenant isolation
- Service-to-service authentication with unique credentials per service
- Resource quota management per tenant tier
- Circuit breaker pattern for Stripe API calls
- Bulkhead isolation for external service calls
- Fallback pattern for graceful degradation
- Idempotency support for state-changing operations
- Tenant-aware query builder wrapper
- Atomic database operation helpers
- Webhook event deduplication
- ISO 8601 timestamp logging
- Comprehensive input sanitization

### Changed
- Logger now uses ISO 8601 timestamps
- Rate limit errors include documentation links
- Health endpoints no longer expose version number
- Database pool monitoring enhanced with metrics
- API key lookup now uses hashed keys

### Security
- **SEC-DB1**: Database connections require TLS in production
- **SEC-DB6**: API keys hashed before storage/lookup
- **SEC-IV5**: HTML entities escaped in user inputs
- **SEC-RL2**: Rate limiting with tenant isolation
- **SEC-MT1**: Multi-tenant data isolation via RLS
- **AE6**: JWT issuer and audience validation
- **ST8**: Stripe API version locked to prevent breaking changes
- **PF4**: Idempotency keys for payment operations

### Fixed
- Cross-tenant data leakage vulnerabilities
- SQL injection vectors in dynamic queries
- Missing input validation on route parameters
- Insufficient error handling in external API calls
- Race conditions in read-modify-write operations

## [1.0.0] - 2024-12-01

### Added
- Initial release of Venue Service
- CRUD operations for venues
- Integration management (POS, ticketing systems)
- Stripe Connect onboarding for venue payments
- Multi-tenant architecture
- Health check endpoints
- Prometheus metrics
- Structured logging with Pino
- JWT authentication
- Role-based access control

### API Endpoints
- `POST /api/v1/venues` - Create venue
- `GET /api/v1/venues/:venueId` - Get venue
- `PUT /api/v1/venues/:venueId` - Update venue
- `DELETE /api/v1/venues/:venueId` - Delete venue
- `GET /api/v1/venues/:venueId/settings` - Get venue settings
- `PUT /api/v1/venues/:venueId/settings` - Update venue settings
- `POST /api/v1/venues/:venueId/integrations` - Add integration
- `GET /api/v1/venues/:venueId/integrations` - List integrations
- `DELETE /api/v1/venues/:venueId/integrations/:integrationId` - Remove integration
- `POST /api/v1/venues/:venueId/stripe/connect` - Initiate Stripe onboarding
- `GET /api/v1/venues/:venueId/stripe/status` - Get Stripe status

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2024-12-01 | Initial release |

## Migration Notes

### Upgrading to 1.1.0 (Unreleased)

1. Run new migrations:
   ```bash
   npm run migrate:latest
   ```

2. Update environment variables:
   ```bash
   # New required variables
   JWT_ISSUER=tickettoken-auth-service
   JWT_AUDIENCE=venue-service
   SERVICE_SECRET_AUTH=<generate-unique-secret>
   SERVICE_SECRET_EVENT=<generate-unique-secret>
   SERVICE_SECRET_TICKET=<generate-unique-secret>
   SERVICE_SECRET_PAYMENT=<generate-unique-secret>
   ```

3. Migrate API keys to hashed storage:
   ```bash
   npm run migrate:api-keys
   ```

4. Enable RLS policies (requires PostgreSQL 15+):
   ```sql
   -- Verify RLS is enabled
   SELECT schemaname, tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public';
   ```

---

[Unreleased]: https://github.com/tickettoken/platform/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/tickettoken/platform/releases/tag/v1.0.0
