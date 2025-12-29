# API Gateway - 09 Multi-Tenancy (Venue Isolation) Audit

**Service:** api-gateway
**Document:** 09-multi-tenancy.md
**Date:** 2025-12-26
**Auditor:** Cline
**Pass Rate:** 86% (36/42 applicable checks)

## Summary

Gateway has NO database. Multi-tenancy is about extracting, validating, and propagating venue context.

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | Venue ID extracted from request body (should only use JWT/verified sources) |
| HIGH | 1 | RLS context setting is TODO |
| MEDIUM | 2 | Admin bypass without audit logging, cache key missing operation type |
| LOW | 2 | Missing UUID validation, cache TTL could be shorter |

## Tenant Context Extraction (6/9)

- JWT contains tenant_id - PASS
- Tenant from verified JWT only - FAIL (accepts body/header)
- JWT signature verified - PASS
- Middleware sets context - PASS
- Missing tenant returns 401 - PARTIAL
- Tenant format validated - PARTIAL
- URL tenant vs JWT validated - PASS
- Body tenant validated - PASS
- Active tenant header validated - PASS

## Venue Access Validation (6/7)

- Access check function exists - PASS
- Cache used for checks - PASS
- Access denied returns 404 - PASS
- Security violation logged - PASS
- Admin bypass - PARTIAL (no audit)
- Role-based permissions - PASS
- Wildcard permission support - PASS

## Venue Context Propagation (5/6)

- Context attached to request - PASS
- Headers forwarded downstream - PASS
- RLS context setting - TODO
- User ID propagated - PASS
- Role/permissions propagated - PASS
- Pricing tier header set - PASS

## API Key Venue Validation (5/5)

- API key venue binding - PASS
- Cross-venue attempt logged - PASS (critical severity)
- Resource venue extraction - PASS
- API key truncated in logs - PASS
- Key validated before check - PASS

## White-Label Domain Routing (5/5)

- Custom domain detection - PASS
- Venue lookup by domain - PASS
- Branding attached - PASS
- Headers set for downstream - PASS
- Graceful failure - PASS

## Venue Rate Limiting (3/3)

- Rate limit by tier - PASS
- Tier multipliers defined - PASS (premium: 10x, standard: 5x, free: 1x)
- Default fallback - PASS

## Cache Isolation (2/3)

- Cache keys include venue - PASS
- Invalidation scoped - PASS
- Collision prevention - PARTIAL

## Security Logging (4/4)

- Access violations logged - PASS
- Full context included - PASS
- Cross-venue API logged - PASS
- Domain changes logged - PASS

## Critical Evidence

### Venue ID from Untrusted Sources (RISKY)
```typescript
const bodyVenueId = body?.venueId; // ❌ DANGEROUS
const headerVenueId = request.headers['x-venue-id']; // ❌ DANGEROUS
```

### Mitigating Access Validation
```typescript
const hasAccess = await checkUserVenueAccess(server, userId, venueId);
if (!hasAccess) throw new NotFoundError('Venue');
```

### Cross-Venue API Logging
```typescript
await logSecurityEvent('cross_venue_api_attempt', {
  apiKey: apiKey.substring(0, 10) + '...',
  authorizedVenue, attemptedVenue
}, 'critical');
```

## Remediations

### CRITICAL
Restrict venue ID extraction to route params, query, and JWT only:
```typescript
return params?.venueId || query?.venueId || user?.venueId;
// DON'T accept from body or header
```

### HIGH
Add UUID validation and admin audit logging

### MEDIUM
1. Add operation type to cache key
2. Shorter cache TTL (60s vs 300s)

## Key Strengths

- Access validation for all venue operations
- Security logging (high severity)
- Returns 404 not 403 (no venue disclosure)
- Cross-venue API attempts logged as critical
- White-label domain routing
- Tier-based rate limiting (10x/5x/1x)
- Role-based permissions with wildcards

Multi-Tenancy Score: 86/100
