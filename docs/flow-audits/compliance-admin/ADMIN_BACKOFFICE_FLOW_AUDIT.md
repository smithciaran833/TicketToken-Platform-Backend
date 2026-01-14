# ADMIN/BACK-OFFICE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Admin & Back-office Operations |

---

## Executive Summary

**Admin functionality is DISTRIBUTED across multiple services** rather than centralized.

| Service | Admin Capabilities |
|---------|-------------------|
| Compliance | Venue verification approval/rejection, dashboard |
| Marketplace | Stats, disputes, user banning |
| Integration | Sync management, queue operations |
| Minting | Batch minting, reconciliation, cache management |
| Auth | Role-based access control (RBAC) |

**What Works:**
- ✅ Role-based access control
- ✅ Venue verification management
- ✅ Dispute resolution
- ✅ User banning/flagging
- ✅ Integration monitoring
- ✅ Minting operations
- ✅ Audit logging

**What's Missing:**
- ❌ Centralized admin dashboard/UI
- ❌ Cross-service admin API gateway
- ⚠️ Some admin routes missing auth (minting service)

---

## Files Verified

| Component | File | Status |
|-----------|------|--------|
| Compliance Admin Routes | compliance-service/routes/admin.routes.ts | ✅ Verified |
| Compliance Admin Controller | compliance-service/controllers/admin.controller.ts | ✅ Verified |
| Compliance Dashboard | compliance-service/controllers/dashboard.controller.ts | ✅ Verified |
| Marketplace Admin Routes | marketplace-service/routes/admin.routes.ts | ✅ Verified |
| Marketplace Admin Controller | marketplace-service/controllers/admin.controller.ts | ✅ Verified |
| Integration Admin Routes | integration-service/routes/admin.routes.ts | ✅ Verified |
| Integration Admin Controller | integration-service/controllers/admin.controller.ts | ✅ Verified |
| Minting Admin Routes | minting-service/routes/admin.ts | ✅ Verified |
| Auth Middleware | auth-service/middleware/auth.middleware.ts | ✅ Verified |

---

## Role-Based Access Control (RBAC)

### Implementation

**File:** `auth-service/middleware/auth.middleware.ts`
```typescript
createAuthMiddleware(jwtService, rbacService) {
  return {
    authenticate: async (request) => {
      // Verify JWT token
      const payload = await jwtService.verifyAccessToken(token);
      
      // Get user permissions
      const permissions = await rbacService.getUserPermissions(payload.sub);
      
      request.user = {
        id: payload.sub,
        tenant_id: payload.tenant_id,
        email: payload.email,
        role: payload.role,
        permissions
      };
    },
    
    requirePermission: (permission) => {
      // Check if user has specific permission
      const hasPermission = await rbacService.checkPermission(
        request.user.id,
        permission,
        venueId
      );
      
      if (!hasPermission) {
        // Audit log failure
        throw new AuthorizationError(`Missing required permission: ${permission}`);
      }
    },
    
    requireVenueAccess: async (request) => {
      // Check if user has access to specific venue
      const venueRoles = await rbacService.getUserVenueRoles(request.user.id);
      const hasAccess = venueRoles.some(role => role.venue_id === venueId);
    }
  };
}
```

### Roles

| Role | Description |
|------|-------------|
| user | Regular user |
| admin | Platform administrator |
| superadmin | Super administrator |
| compliance_officer | Compliance management |
| venue_owner | Venue owner |
| venue_staff | Venue staff |

---

## Compliance Service Admin

### Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/admin/pending` | GET | Get pending reviews | requireAdmin |
| `/admin/approve/:id` | POST | Approve venue verification | requireAdmin |
| `/admin/reject/:id` | POST | Reject venue verification | requireAdmin |
| `/dashboard` | GET | Compliance overview | - |

### Pending Reviews

Returns:
- Pending venue verifications
- Unresolved risk flags
- Total count
```typescript
async getPendingReviews(request, reply) {
  const pendingVerifications = await db.query(`
    SELECT v.*, r.risk_score, r.factors, r.recommendation
    FROM venue_verifications v
    LEFT JOIN risk_assessments r ON v.venue_id = r.venue_id
    WHERE (v.status = 'pending' OR v.manual_review_required = true)
  `);
  
  const pendingFlags = await db.query(`
    SELECT * FROM risk_flags WHERE resolved = false
  `);
  
  return { verifications, flags, totalPending };
}
```

### Approve/Reject Verification
```typescript
async approveVerification(request, reply) {
  // Update status
  await db.query(`
    UPDATE venue_verifications
    SET status = 'verified', manual_review_required = false
    WHERE venue_id = $1
  `);
  
  // Audit log
  await db.query(`
    INSERT INTO compliance_audit_log
    (action, entity_type, entity_id, user_id, metadata, tenant_id)
    VALUES ('verification_approved', 'venue', $1, $2, $3, $4)
  `);
  
  // Notify venue
  await notificationService.notifyVerificationStatus(venueId, 'approved');
}
```

### Compliance Dashboard

Returns:
- Verification stats (total, verified, pending, rejected)
- Tax reporting stats
- OFAC screening stats
- Recent activity

---

## Marketplace Service Admin

### Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/stats` | GET | Marketplace statistics | authMiddleware + requireAdmin |
| `/disputes` | GET | List open disputes | authMiddleware + requireAdmin |
| `/disputes/:id/resolve` | PUT | Resolve dispute | authMiddleware + requireAdmin |
| `/flagged-users` | GET | List flagged users | authMiddleware + requireAdmin |
| `/ban-user` | POST | Ban a user | authMiddleware + requireAdmin |

### Statistics
```typescript
async getStats(request, reply) {
  const stats = await db('marketplace_listings')
    .select(
      db.raw('COUNT(*) as total_listings'),
      db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as active_listings', ['active']),
      db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as sold_listings', ['sold']),
      db.raw('AVG(price) as average_price')
    )
    .first();
}
```

### Dispute Resolution
```typescript
async resolveDispute(request, reply) {
  await db('marketplace_disputes')
    .where('id', disputeId)
    .update({
      status: 'resolved',
      resolution,
      resolved_by: request.user?.id,
      resolved_at: new Date()
    });
}
```

### User Banning
```typescript
async banUser(request, reply) {
  await db('marketplace_blacklist').insert({
    user_id: userId,
    reason,
    banned_by: request.user?.id,
    banned_at: new Date(),
    expires_at: duration ? new Date(Date.now() + duration * 86400000) : null,
    is_active: true
  });
}
```

---

## Integration Service Admin

### Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/all-venues` | GET | List all venue integrations | authenticate + authorize('admin') |
| `/health-summary` | GET | Integration health overview | authenticate + authorize('admin') |
| `/costs` | GET | Cost analysis | authenticate + authorize('admin') |
| `/force-sync` | POST | Force sync for venue | authenticate + authorize('admin') |
| `/clear-queue` | POST | Clear sync queue | authenticate + authorize('admin') |
| `/process-dead-letter` | POST | Process dead letter queue | authenticate + authorize('admin') |
| `/recover-stale` | POST | Recover stale operations | authenticate + authorize('admin') |
| `/queue-metrics` | GET | Queue metrics | authenticate + authorize('admin') |

### Operations
```typescript
// Force sync
async forceSync(request, reply) {
  const result = await integrationService.syncNow(venueId, integrationType, { force: true });
}

// Clear queue
async clearQueue(request, reply) {
  const deleted = await db('sync_queue')
    .where(filters)
    .delete();
}

// Recover stale
async recoverStale(request, reply) {
  await recoveryService.recoverStaleOperations();
}
```

---

## Minting Service Admin

### Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/admin/dashboard` | GET | Minting dashboard stats | ⚠️ None |
| `/admin/batch-mint` | POST | Batch mint tickets | ⚠️ None |
| `/admin/batch-mint/estimate` | GET | Estimate batch cost | ⚠️ None |
| `/admin/reconcile/:venueId` | POST | Reconcile venue NFTs | ⚠️ None |
| `/admin/reconcile/:venueId/fix` | POST | Fix discrepancies | ⚠️ None |
| `/admin/reconcile/:venueId/history` | GET | Reconciliation history | ⚠️ None |
| `/admin/cache/stats` | GET | Cache statistics | ⚠️ None |
| `/admin/cache/:ticketId` | DELETE | Invalidate cache | ⚠️ None |
| `/admin/cache/clear` | DELETE | Clear all cache | ⚠️ None |
| `/admin/mints` | GET | List recent mints | ⚠️ None |
| `/admin/mints/:ticketId` | GET | Get mint details | ⚠️ None |
| `/admin/system/status` | GET | System health status | ⚠️ None |
| `/admin/stats/:venueId` | GET | Venue minting stats | ⚠️ None |

**⚠️ WARNING:** Minting admin routes have NO AUTHENTICATION!
```typescript
// Comment in code says:
// "Authentication should be added in production"
```

### Dashboard Stats
```typescript
async getDashboardStats() {
  return {
    totalMints,
    pendingMints,
    failedMints,
    recentMints
  };
}
```

### Batch Minting
```typescript
fastify.post('/admin/batch-mint', async (request, reply) => {
  const { venueId, tickets } = request.body;
  const service = new BatchMintingService();
  const result = await service.batchMint({ venueId, tickets });
});
```

### Reconciliation
```typescript
fastify.post('/admin/reconcile/:venueId', async (request, reply) => {
  const service = new ReconciliationService();
  const result = await service.reconcileAll(venueId);
});
```

---

## What Works ✅

| Component | Status |
|-----------|--------|
| RBAC middleware | ✅ Works |
| Permission checking | ✅ Works |
| Venue access control | ✅ Works |
| Compliance admin | ✅ Works |
| Marketplace admin | ✅ Works |
| Integration admin | ✅ Works |
| Minting admin | ⚠️ No auth |
| Audit logging | ✅ Works |
| Multi-tenant | ✅ Works |

---

## Issues Found

### 1. Minting Service Admin - NO AUTHENTICATION

**Severity:** CRITICAL

**Location:** `minting-service/routes/admin.ts`

All admin routes are unprotected:
- Anyone can trigger batch minting
- Anyone can clear caches
- Anyone can view system status

**Fix Required:**
```typescript
// Add authentication hook
fastify.addHook('onRequest', authenticate);
fastify.addHook('onRequest', requireAdmin);
```

### 2. No Centralized Admin Dashboard

Admin functionality is scattered across services. No single admin UI or API gateway.

**Current State:**
- Compliance: `/compliance/admin/*`
- Marketplace: `/marketplace/admin/*`
- Integration: `/integration/admin/*`
- Minting: `/minting/admin/*`

**Recommendation:** Create admin API gateway or unified admin service.

### 3. Inconsistent Auth Patterns

| Service | Pattern |
|---------|---------|
| Compliance | `requireAdmin` middleware |
| Marketplace | `authMiddleware + requireAdmin` preHandler |
| Integration | `authenticate + authorize('admin')` hooks |
| Minting | None |

---

## Admin Capabilities Summary

| Capability | Service | Endpoint |
|------------|---------|----------|
| View pending verifications | Compliance | `GET /admin/pending` |
| Approve venue | Compliance | `POST /admin/approve/:id` |
| Reject venue | Compliance | `POST /admin/reject/:id` |
| Compliance dashboard | Compliance | `GET /dashboard` |
| Marketplace stats | Marketplace | `GET /stats` |
| View disputes | Marketplace | `GET /disputes` |
| Resolve dispute | Marketplace | `PUT /disputes/:id/resolve` |
| View flagged users | Marketplace | `GET /flagged-users` |
| Ban user | Marketplace | `POST /ban-user` |
| View integrations | Integration | `GET /all-venues` |
| Force sync | Integration | `POST /force-sync` |
| Clear queue | Integration | `POST /clear-queue` |
| View minting stats | Minting | `GET /admin/dashboard` |
| Batch mint | Minting | `POST /admin/batch-mint` |
| Reconcile NFTs | Minting | `POST /admin/reconcile/:venueId` |
| Cache management | Minting | `DELETE /admin/cache/*` |

---

## Summary

| Aspect | Status |
|--------|--------|
| RBAC system | ✅ Complete |
| Compliance admin | ✅ Complete |
| Marketplace admin | ✅ Complete |
| Integration admin | ✅ Complete |
| Minting admin | ⚠️ No auth |
| Audit logging | ✅ Complete |
| Centralized dashboard | ❌ Missing |

**Bottom Line:** Admin functionality exists but is distributed and minting service lacks authentication.

---

## Related Documents

- `KYC_COMPLIANCE_FLOW_AUDIT.md` - Compliance details
- `USER_REGISTRATION_AUTH_FLOW_AUDIT.md` - Auth system

