# CUSTOM DOMAINS FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Custom Domains |

---

## Executive Summary

**WORKING - Full custom domain management**

| Component | Status |
|-----------|--------|
| Add custom domain | ✅ Working |
| Verify domain (DNS) | ✅ Working |
| Get domain status | ✅ Working |
| List venue domains | ✅ Working |
| Remove domain | ✅ Working |

**Bottom Line:** Full custom domain management allowing venues on white-label tier to use their own domains. Includes DNS verification workflow.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/domains/:venueId/add` | POST | Add domain | ✅ Working |
| `/domains/:domainId/verify` | POST | Verify DNS | ✅ Working |
| `/domains/:domainId/status` | GET | Get status | ✅ Working |
| `/domains/venue/:venueId` | GET | List domains | ✅ Working |
| `/domains/:domainId` | DELETE | Remove domain | ✅ Working |

---

## Domain Verification Flow
```
1. Venue adds custom domain
   POST /domains/:venueId/add { domain: "tickets.venue.com" }
   → Returns verification TXT record

2. Venue adds TXT record to DNS
   _tickettoken.tickets.venue.com TXT "verify=abc123"

3. Venue requests verification
   POST /domains/:domainId/verify
   → System checks DNS for TXT record

4. If verified:
   → Status changes to 'verified'
   → Domain becomes active

5. If not verified:
   → Status remains 'pending'
   → Can retry later
```

---

## Domain Statuses

| Status | Description |
|--------|-------------|
| `pending` | Awaiting DNS verification |
| `verified` | DNS verified, domain active |
| `failed` | Verification failed |
| `suspended` | Tier downgrade, domain disabled |

---

## Implementation Details

### Add Domain
```typescript
async addCustomDomain(venueId: string, domain: string) {
  // Validate venue has white-label tier
  // Generate verification token
  // Create domain record with 'pending' status
  // Return verification instructions
}
```

### Verify Domain
```typescript
async verifyDomain(domainId: string) {
  // Look up domain record
  // Perform DNS TXT lookup
  // Check for verification token
  // Update status to 'verified' or keep 'pending'
  return verified;
}
```

---

## Domain Model
```typescript
interface CustomDomain {
  id: string;
  venueId: string;
  domain: string;
  status: 'pending' | 'verified' | 'failed' | 'suspended';
  verificationToken: string;
  verifiedAt?: Date;
  sslCertificateId?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `venue-service/src/routes/domain.routes.ts` | Routes |
| `venue-service/src/services/domain-management.service.ts` | Implementation |

---

## Related Documents

- `VENUE_BRANDING_FLOW_AUDIT.md` - Branding by domain
- `VENUE_SETTINGS_FLOW_AUDIT.md` - Venue config
