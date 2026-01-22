# Venue Service Support Services - Fix Proposals

## Priority Legend
- 🔴 **HIGH**: Security/Production blocker
- 🟡 **MEDIUM**: Stability/Performance issue
- 🟢 **LOW**: Quality of life improvement

---

## FIX 1: branding.service.ts - CSS Injection Vulnerability 🔴 HIGH

### Issue
Custom CSS field allows arbitrary CSS injection without sanitization, enabling XSS and UI manipulation attacks.

### Proposed Fix
**Add CSS sanitization using a whitelist approach:**

1. Create new util: `utils/css-sanitizer.ts`
   - Implement CSS property whitelist (safe properties only)
   - Strip dangerous properties: `@import`, `url()`, `expression()`, etc.
   - Validate values don't contain JavaScript
   - Return sanitized CSS or throw validation error

2. Update `upsertBranding()` method:
   - Call sanitizer before saving `customCss`
   - Throw descriptive error if dangerous CSS detected

### Breaking Changes
- ❌ **NO** - Method signature stays the same
- ✅ May reject previously accepted CSS (behavior change, not signature)

### Migration Needed
- ❌ **NO** - No schema changes needed

### Dependencies
- None - standalone fix

### Implementation Pattern
```typescript
// Similar to venue-content.service.ts input sanitization
private sanitizeCustomCss(css: string): string {
  const sanitizer = new CssSanitizer();
  return sanitizer.sanitize(css);
}
```

### Risk Level
- **LOW** - Adds validation, doesn't change data flow

---

## FIX 2: branding.service.ts - URL Validation 🟡 MEDIUM

### Issue
Logo/favicon URLs not validated - could contain malformed or malicious URLs.

### Proposed Fix
**Add URL validation before saving:**

1. Create validation function in `upsertBranding()`:
   - Check URL protocol (https:// or http://)
   - Validate URL format using Node's URL API
   - Optional: Whitelist allowed domains or file extensions
   - Throw error if invalid

### Breaking Changes
- ❌ **NO** - Method signature stays the same
- ✅ May reject previously accepted URLs (behavior change)

### Migration Needed
- ❌ **NO** - No schema changes

### Dependencies
- None - standalone fix

### Implementation Pattern
```typescript
// Similar to domain-management.service.ts domain validation
private validateUrl(url: string, fieldName: string): void {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`${fieldName} must use HTTP or HTTPS protocol`);
    }
  } catch (error) {
    throw new Error(`Invalid ${fieldName}: ${url}`);
  }
}
```

### Risk Level
- **LOW** - Adds validation, doesn't change data flow

---
Si
## FIX 3: domain-management.service.ts - DNS Timeout 🔴 HIGH

### Issue
DNS verification has no timeout - could hang indefinitely and block the service.

### Proposed Fix
**Wrap DNS lookup with timeout using Promise.race:**

1. Create timeout wrapper utility or use existing pattern
2. Update `verifyDomain()` method:
   - Wrap `dns.resolveTxt()` with 5-10 second timeout
   - Catch timeout errors specifically
   - Update domain record with timeout error message

### Breaking Changes
- ❌ **NO** - Method signature stays the same
- ✅ May timeout long DNS queries (intentional improvement)

### Migration Needed
- ❌ **NO** - No schema changes

### Dependencies
- None - standalone fix

### Implementation Pattern
```typescript
// Create utility function
async function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number, 
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

// In verifyDomain():
const records = await withTimeout(
  dns.resolveTxt(txtRecordName),
  10000, // 10 seconds
  'DNS lookup timeout'
);
```

### Risk Level
- **VERY LOW** - Pure improvement, no breaking changes

---

## FIX 4: analytics.service.ts - Circuit Breaker Pattern 🟡 MEDIUM

### Issue
No circuit breaker for external Analytics Service - cascading failures possible.

### Proposed Fix
**Add circuit breaker pattern following venue-stripe-onboarding.service.ts:**

1. Create simple CircuitBreaker class in analytics.service.ts (or shared util)
2. Wrap HTTP calls with circuit breaker
3. Add fallback behavior:
   - Return empty analytics data structure
   - Log warning but don't throw

### Breaking Changes
- ❌ **NO** - Method signature stays the same
- ✅ Returns empty data on failure instead of throwing (degraded service)

### Migration Needed
- ❌ **NO** - No schema changes

### Dependencies
- None - standalone fix

### Implementation Pattern
```typescript
// Follow venue-stripe-onboarding.service.ts pattern
class AnalyticsCircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private isOpen = false;
  private readonly threshold = 5;
  private readonly resetTimeout = 30000;

  async execute<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    // ... circuit breaker logic
  }
}

// In service:
async getVenueAnalytics(venueId: string, options: any = {}) {
  return this.circuitBreaker.execute(
    () => this.httpClient.get(`/venues/${venueId}/analytics`, { params: options }),
    { data: { metrics: [], timeRange: options.timeRange } } // fallback
  );
}
```

### Risk Level
- **LOW** - Adds resilience, graceful degradation

---

## FIX 5: analytics.service.ts - Fire-and-Forget Event Tracking 🟡 MEDIUM

### Issue
`trackEvent()` throws errors - should be fire-and-forget since analytics aren't critical.

### Proposed Fix
**Change error handling to log-only:**

1. Update `trackEvent()` method:
   - Wrap in try-catch
   - Log errors but return success
   - Optional: Return boolean indicating success/failure

### Breaking Changes
- ⚠️ **MAYBE** - Changes return behavior
  - Option A: Keep `Promise<any>`, swallow errors internally (NO breaking change)
  - Option B: Change to `Promise<boolean>` (BREAKING - but better)

### Migration Needed
- ❌ **NO** - No schema changes

### Dependencies
- None - standalone fix

### Implementation Pattern
```typescript
// Option A: No breaking change
async trackEvent(eventData: any): Promise<any> {
  try {
    const response: any = await this.httpClient.post('/events', eventData);
    return response.data;
  } catch (error) {
    this.logger.warn({ error, eventData }, 'Failed to track event (non-critical)');
    return { success: false, tracked: false }; // Dummy response
  }
}

// Option B: Better but breaking
async trackEvent(eventData: any): Promise<boolean> {
  try {
    await this.httpClient.post('/events', eventData);
    return true;
  } catch (error) {
    this.logger.warn({ error, eventData }, 'Failed to track event (non-critical)');
    return false;
  }
}
```

### Risk Level
- **LOW** (Option A) / **MEDIUM** (Option B - requires caller updates)

### Recommendation
- Use **Option A** for backward compatibility

---

## FIX 6: compliance.service.ts - Tenant Isolation 🔴 HIGH

### Issue
No tenant validation - could access/modify compliance settings across tenants.

### Proposed Fix
**Add tenant validation following verification.service.ts pattern:**

1. Add optional `tenantId` parameter to public methods:
   - `generateComplianceReport(venueId, tenantId?)`
   - `updateComplianceSettings(venueId, settings, tenantId?)`
   - `changeTier(venueId, newTier, changedBy, reason?, tenantId?)`

2. Create validation methods:
   - `validateTenantContext(tenantId)`
   - `verifyVenueOwnership(venueId, tenantId)`

3. Call validation at start of each method

### Breaking Changes
- ⚠️ **OPTIONAL BREAKING** - Depends on implementation
  - If `tenantId` is optional parameter: ❌ NO breaking change
  - If `tenantId` is required parameter: ✅ YES breaking change

### Migration Needed
- ❌ **NO** - No schema changes (venues table already has tenant_id)

### Dependencies
- Controllers must pass tenantId (from request context)

### Implementation Pattern
```typescript
// Follow verification.service.ts pattern EXACTLY
private validateTenantContext(tenantId?: string): void {
  if (!tenantId) {
    throw new Error('Tenant context required for this operation');
  }
}

private async verifyVenueOwnership(venueId: string, tenantId: string): Promise<void> {
  const venue = await db('venues')
    .where({ id: venueId, tenant_id: tenantId })
    .first();
  
  if (!venue) {
    throw new Error('Venue not found or access denied');
  }
}

// In public methods:
async generateComplianceReport(venueId: string, tenantId?: string): Promise<ComplianceReport> {
  if (tenantId) {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);
  }
  // ... rest of method
}
```

### Risk Level
- **LOW** - Optional parameter approach maintains backward compatibility

### Recommendation
- Use **optional parameter** approach initially
- Add warning logs when tenantId not provided
- Plan migration to required parameter in next major version

---

## FIX 7: compliance.service.ts - Transaction Wrapping 🟡 MEDIUM

### Issue
`changeTier()` performs multiple DB operations without transaction - partial failures possible.

### Proposed Fix
**Wrap tier change operations in Knex transaction:**

1. Update `changeTier()` method:
   - Use `db.transaction()` wrapper
   - Execute all updates within transaction
   - Auto-rollback on any failure

### Breaking Changes
- ❌ **NO** - Method signature stays the same
- ✅ Behavior change: now atomic (improvement)

### Migration Needed
- ❌ **NO** - No schema changes

### Dependencies
- None - standalone fix

### Implementation Pattern
```typescript
async changeTier(
  venueId: string, 
  newTier: string, 
  changedBy: string, 
  reason?: string,
  tenantId?: string
): Promise<void> {
  await db.transaction(async (trx) => {
    // Validate tier exists
    const tierConfig = await trx('white_label_pricing')
      .where('tier_name', newTier)
      .first();
    
    if (!tierConfig) {
      throw new Error('Invalid pricing tier');
    }

    // Get current tier
    const venue = await trx('venues').where('id', venueId).first();
    if (!venue) {
      throw new Error('Venue not found');
    }

    const oldTier = venue.pricing_tier;

    // Update venue tier
    await trx('venues')
      .where('id', venueId)
      .update({
        pricing_tier: newTier,
        hide_platform_branding: tierConfig.hide_platform_branding,
        updated_at: new Date()
      });

    // Record in history
    await trx('venue_tier_history').insert({
      venue_id: venueId,
      from_tier: oldTier,
      to_tier: newTier,
      reason,
      changed_by: changedBy
    });

    // Handle downgrade
    if (oldTier !== 'standard' && newTier === 'standard') {
      await trx('venues')
        .where('id', venueId)
        .update({ custom_domain: null });

      await trx('custom_domains')
        .where('venue_id', venueId)
        .update({ status: 'suspended' });
    }
  });

  logger.info('Venue tier changed', { venueId, newTier, changedBy });
}
```

### Risk Level
- **VERY LOW** - Pure improvement, no breaking changes

---

## FIX 8: healthCheck.service.ts - Migration Status 🟢 LOW

### Issue
Pending migrations return "warning" but service reports as "healthy" - should be "degraded".

### Proposed Fix
**Change overall status logic when migrations pending:**

1. Update `getFullHealth()` method:
   - Check if migrations check returned 'warning'
   - If pending migrations exist, set overall status to 'degraded'
   - Keep existing logic for other checks

### Breaking Changes
- ❌ **NO** - Method signature stays the same
- ⚠️ Health check response changes (status field)
  - Could affect monitoring/alerting if hardcoded to expect "healthy"

### Migration Needed
- ❌ **NO** - No schema changes

### Dependencies
- May need to update monitoring rules if they check for specific status values

### Implementation Pattern
```typescript
async getFullHealth(): Promise<HealthCheckResult> {
  const readiness = await this.getReadiness();
  
  // ... add business checks ...

  // Determine overall status considering migrations
  let overallStatus = readiness.status;
  
  if (businessChecks.migrations?.status === 'warning') {
    // Pending migrations should degrade service status
    if (overallStatus === 'healthy') {
      overallStatus = 'degraded';
    }
  }

  return {
    ...readiness,
    status: overallStatus,
    checks: {
      ...readiness.checks,
      ...businessChecks
    }
  };
}
```

### Risk Level
- **LOW** - Improves monitoring accuracy

### Recommendation
- Document status change in release notes
- Update monitoring dashboards/alerts

---

## IMPLEMENTATION PRIORITY

### Phase 1: High-Priority Security Fixes (Do First)
1. ✅ **FIX 1**: CSS Injection (branding.service.ts)
2. ✅ **FIX 3**: DNS Timeout (domain-management.service.ts)
3. ✅ **FIX 6**: Tenant Isolation (compliance.service.ts)

**Rationale**: Security vulnerabilities, production stability

### Phase 2: Resilience Improvements (Do Second)
4. ✅ **FIX 4**: Circuit Breaker (analytics.service.ts)
5. ✅ **FIX 7**: Transaction Wrapping (compliance.service.ts)

**Rationale**: Prevent cascading failures, data consistency

### Phase 3: Quality Improvements (Do Third)
6. ✅ **FIX 2**: URL Validation (branding.service.ts)
7. ✅ **FIX 5**: Fire-and-Forget Events (analytics.service.ts)
8. ✅ **FIX 8**: Migration Status (healthCheck.service.ts)

**Rationale**: Nice to have, lower risk

---

## SUMMARY TABLE

| Fix | Service | Breaking? | Migration? | Dependencies | Risk | Priority |
|-----|---------|-----------|------------|--------------|------|----------|
| 1. CSS Injection | branding | ❌ No | ❌ No | None | LOW | 🔴 HIGH |
| 2. URL Validation | branding | ❌ No | ❌ No | None | LOW | 🟢 LOW |
| 3. DNS Timeout | domain-mgmt | ❌ No | ❌ No | None | VERY LOW | 🔴 HIGH |
| 4. Circuit Breaker | analytics | ❌ No | ❌ No | None | LOW | 🟡 MEDIUM |
| 5. Fire-and-Forget | analytics | ⚠️ Maybe | ❌ No | None | LOW/MED | 🟢 LOW |
| 6. Tenant Isolation | compliance | ⚠️ Maybe | ❌ No | Controller updates | LOW | 🔴 HIGH |
| 7. Transactions | compliance | ❌ No | ❌ No | None | VERY LOW | 🟡 MEDIUM |
| 8. Migration Status | healthCheck | ❌ No | ❌ No | Monitor updates | LOW | 🟢 LOW |

**Total Breaking Changes**: 0-2 (depending on optional vs required parameters)
**Total Migrations Needed**: 0
**Overall Risk**: LOW - All fixes are additive or improve existing behavior

---

## TESTING STRATEGY

### Unit Tests Needed
- CSS Sanitizer utility tests
- URL validation tests
- DNS timeout wrapper tests
- Circuit breaker logic tests
- Transaction rollback tests
- Tenant validation tests

### Integration Tests Needed
- End-to-end branding with malicious CSS
- DNS verification with slow/failing DNS servers
- Analytics service failure scenarios
- Tier change rollback scenarios
- Health check status transitions

### Manual Testing
- Verify monitoring alerts still work after health check changes
- Test branding UI with various CSS inputs
- Verify tenant isolation doesn't break existing flows

---

## NOTES

- All fixes follow existing patterns in the codebase
- No database migrations required
- Minimal breaking changes (only if we choose required parameters)
- Can be implemented incrementally
- Each fix is independent (no complex dependencies)
