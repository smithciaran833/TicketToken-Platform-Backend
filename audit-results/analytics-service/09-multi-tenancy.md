## Multi-Tenancy Audit: analytics-service

### Audit Against: `Docs/research/09-multi-tenancy.md`

---

## Row Level Security (Database Layer)

| Check | Status | Evidence |
|-------|--------|----------|
| RLS enabled on tenant tables | ✅ PASS | Migration enables RLS on 11 tables |
| Tenant isolation policy created | ✅ PASS | `tenant_isolation_policy` on all RLS tables |
| Policy uses `current_setting` | ✅ PASS | `current_setting('app.current_tenant')::uuid` |
| Tenant context set before queries | ⚠️ PARTIAL | Global context, race condition risk |

**Tables WITH RLS (Migration):**
```typescript
const tables = [
  'analytics_metrics', 'analytics_aggregations', 'analytics_alerts',
  'analytics_dashboards', 'analytics_widgets', 'analytics_exports',
  'customer_rfm_scores', 'customer_segments', 'customer_lifetime_value',
  'realtime_metrics', 'venue_alerts'
];

for (const tableName of tables) {
  await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON ${tableName}
    USING (tenant_id = current_setting('app.current_tenant')::uuid)
  `);
}
```

**Tables WITHOUT RLS:**
- ❌ `price_history` - No tenant_id column
- ❌ `pending_price_changes` - No tenant_id column

---

## Application Layer Tenant Filtering

| Check | Status | Evidence |
|-------|--------|----------|
| Service methods filter by tenant_id | ❌ FAIL | **Most queries don't filter by tenant_id** |
| Controllers extract tenant from request | ⚠️ PARTIAL | Auth extracts user but tenant not used |
| Models include tenant_id in queries | ⚠️ PARTIAL | Relies on RLS only |
| Cache keys include tenant_id | ❌ FAIL | **No tenant_id in cache keys** |

**Critical: No Tenant Filtering in Queries (customer-insights.service.ts):**
```typescript
// ❌ NO tenant_id filtering - relies entirely on RLS
async getCustomerProfile(userId: string) {
  const cacheKey = `customer_profile:${userId}`;  // ❌ No tenant_id in cache key
  
  const profileResult = await db.raw(`
    SELECT ... FROM users u
    LEFT JOIN orders o ON u.id = o.user_id
    WHERE u.id = ?  // ❌ No tenant_id filter
  `, [userId]);
}

async segmentCustomers(venueId: string) {
  const cacheKey = `customer_segments:${venueId}`;  // ❌ No tenant_id
  
  const result = await db.raw(`
    SELECT ... FROM customer_segments
    WHERE venue_id = ?  // ❌ No tenant_id filter
  `, [venueId]);
}
```

---

## Cache Layer Tenant Isolation

| Check | Status | Evidence |
|-------|--------|----------|
| Redis keys include tenant_id | ❌ FAIL | Keys use only entity IDs |
| Cache isolation enforced | ❌ FAIL | Cross-tenant data exposure possible |
| Cache invalidation per tenant | ❌ FAIL | Clears by entity, not tenant |

**Vulnerable Cache Keys (customer-insights.service.ts):**
```typescript
// ❌ ALL cache keys missing tenant_id
const cacheKey = `customer_profile:${userId}`;
const cacheKey = `customer_segments:${venueId}`;
const cacheKey = `event_preferences:${userId}`;
const cacheKey = `customer_clv:${customerId}`;

// ✅ SHOULD BE
const cacheKey = `customer_profile:${tenantId}:${userId}`;
const cacheKey = `customer_segments:${tenantId}:${venueId}`;
```

---

## Auth Middleware Tenant Handling

| Check | Status | Evidence |
|-------|--------|----------|
| Tenant ID extracted from JWT | ⚠️ PARTIAL | User extracted, tenant unclear |
| Tenant context attached to request | ⚠️ PARTIAL | User context only |
| Tenant context set for database | ⚠️ PARTIAL | Global context with race condition risk |

**Auth Middleware (auth.middleware.ts - from previous audit):**
```typescript
const decoded = jwt.verify(token, config.jwt.secret) as any;
request.user = {
  id: decoded.userId,
  email: decoded.email,
  permissions: decoded.permissions || [],
  // ❌ No tenantId extraction visible
};
```

**Database Tenant Context (database.ts - from previous audit):**
```typescript
// ⚠️ Uses global variable - RACE CONDITION RISK
if ((global as any).currentTenant) {
  await db.raw(`SET app.current_tenant = ?`, [escapedTenantId]);
}
```

---

## Query Analysis

### Queries WITHOUT Tenant Filtering

| Service | Method | Risk |
|---------|--------|------|
| CustomerInsightsService | `getCustomerProfile()` | Cross-tenant data access |
| CustomerInsightsService | `segmentCustomers()` | Cross-tenant segments |
| CustomerInsightsService | `getRFMScores()` | Cross-tenant RFM data |
| CustomerInsightsService | `getEventPreferences()` | Cross-tenant preferences |
| CustomerInsightsService | `getVenueCustomers()` | Cross-tenant customer lists |
| CustomerInsightsService | `getCohortAnalysis()` | Cross-tenant cohort data |
| CustomerInsightsService | `getAtRiskCustomers()` | Cross-tenant at-risk lists |

**Example Vulnerable Query:**
```sql
-- getVenueCustomers() - NO tenant_id filter
SELECT ... FROM customer_rfm_scores rfm
JOIN users u ON rfm.customer_id = u.id
WHERE rfm.venue_id = ?  -- Only filters by venueId
ORDER BY rfm.total_score DESC
```

---

## Defense in Depth

| Layer | Implemented? | Status |
|-------|--------------|--------|
| Database RLS | Yes | ⚠️ Incomplete (2 tables missing) |
| Application filter | No | ❌ FAIL |
| Cache isolation | No | ❌ FAIL |
| API tenant validation | Partial | ⚠️ User only |
| Audit logging per tenant | Unknown | ❓ |

---

## Summary

### Critical Issues (Must Fix Before Production)
| Issue | Location | Risk |
|-------|----------|------|
| No tenant_id in cache keys | `customer-insights.service.ts` | **Cross-tenant data leakage via cache** |
| No application-level tenant filtering | All service queries | RLS bypass if misconfigured |
| Global tenant context | `database.ts` | Race condition causing data leakage |
| Price tables missing RLS | Migration | Complete bypass for pricing data |
| Queries join unprotected tables | Multiple queries | May bypass RLS |

### High Issues
| Issue | Location | Risk |
|-------|----------|------|
| Queries join `users` table | Service queries | `users` table may not have RLS |
| Queries join `orders` table | Service queries | `orders` table may not have RLS |
| No tenant_id in JWT validation | Auth middleware | Cannot verify tenant ownership |

### Compliance Score: 30% (4/13 checks passed)

- ✅ PASS: 3 (RLS enabled, policies created, policy uses current_setting)
- ⚠️ PARTIAL: 5
- ❌ FAIL: 6
- ❓ UNKNOWN: 1

### Priority Fixes

1. **Add tenant_id to all cache keys:**
```typescript
const tenantId = request.user.tenantId;
const cacheKey = `customer_profile:${tenantId}:${userId}`;
```

2. **Add tenant filtering in application layer:**
```typescript
async getVenueCustomers(tenantId: string, venueId: string) {
  const result = await db.raw(`
    SELECT ... FROM customer_rfm_scores rfm
    WHERE rfm.venue_id = ? AND rfm.tenant_id = ?
  `, [venueId, tenantId]);
}
```

3. **Use request-scoped tenant context:**
```typescript
// In middleware
db.raw(`SET app.current_tenant = ?`, [request.user.tenantId]);
// Use within transaction or per-request connection
```

4. **Add RLS to price tables:**
```typescript
await knex.schema.table('price_history', (table) => {
  table.uuid('tenant_id').notNullable();
});
await knex.raw(`ALTER TABLE price_history ENABLE ROW LEVEL SECURITY`);
```

5. **Extract and validate tenantId in JWT:**
```typescript
request.user = {
  id: decoded.userId,
  tenantId: decoded.tenantId,  // Add this
  // ...
};
```
