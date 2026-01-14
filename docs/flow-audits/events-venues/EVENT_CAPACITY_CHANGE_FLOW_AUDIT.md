# EVENT CAPACITY CHANGE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Event Capacity Change |

---

## Executive Summary

**WORKING - Via event update with security validation**

| Component | Status |
|-----------|--------|
| Change capacity via PUT /events/:id | ✅ Working |
| total_capacity in critical fields | ✅ Protected |
| Cannot reduce below sold count | ✅ Validated |
| Venue capacity validation | ✅ Working |
| Admin override | ✅ Working |

**Bottom Line:** Capacity changes work through regular event update. The `EventSecurityValidator` treats `total_capacity` as a critical field after sales. You cannot reduce capacity below the number of tickets already sold.

---

## How It Works

### Regular Event Update

**Endpoint:** `PUT /api/v1/events/:eventId`
```json
{
  "total_capacity": 5000
}
```

### Security Validation

**File:** `backend/services/event-service/src/validations/event-security.ts`
```typescript
// total_capacity is a critical field
const CRITICAL_FIELDS_AFTER_SALES = [
  'venue_id',
  'starts_at',
  'ends_at',
  'event_date',
  'total_capacity',  // ← Protected
  'timezone'
];
```

### Cannot Reduce Below Sold
```typescript
if (criticalFieldsChanging.includes('total_capacity')) {
  const newCapacity = data.total_capacity;
  if (newCapacity < soldTicketCount) {
    warnings.push(`Cannot reduce capacity below ${soldTicketCount} (tickets already sold).`);
  }
}
```

### Venue Capacity Validation
```typescript
async validateVenueCapacity(requestedCapacity: number, venueCapacity: number): Promise<void> {
  if (requestedCapacity > venueCapacity) {
    throw new Error(
      `Event capacity (${requestedCapacity}) cannot exceed venue capacity (${venueCapacity})`
    );
  }
}
```

---

## What Works ✅

| Feature | Status |
|---------|--------|
| Increase capacity before sales | ✅ Unrestricted |
| Decrease capacity before sales | ✅ Unrestricted |
| Change capacity after sales | ✅ Blocked by default |
| Admin override | ✅ Available |
| Cannot exceed venue capacity | ✅ Validated |
| Cannot go below sold tickets | ✅ Validated |

---

## Files Involved

| File | Purpose |
|------|---------|
| `event-service/src/routes/events.routes.ts` | Update endpoint |
| `event-service/src/validations/event-security.ts` | Capacity validation |

---

## Related Documents

- `EVENT_EDIT_UPDATE_FLOW_AUDIT.md` - General event updates
- `EVENT_VENUE_CHANGE_FLOW_AUDIT.md` - Venue constraints
