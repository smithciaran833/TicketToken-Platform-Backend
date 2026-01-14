# FIELD MAPPING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Field Mapping |

---

## Executive Summary

**WORKING - Flexible field mapping for integrations**

| Component | Status |
|-----------|--------|
| Get available fields | ✅ Working |
| Get current mappings | ✅ Working |
| Update mappings | ✅ Working |
| Test mappings | ✅ Working |
| Apply template | ✅ Working |
| Reset mappings | ✅ Working |
| Heal mappings | ✅ Working |

**Bottom Line:** Complete field mapping system allowing venues to customize how external data maps to internal schema. Includes templates, testing, and self-healing capabilities.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/:provider/fields` | GET | Available fields | ✅ Working |
| `/:provider/mappings` | GET | Current mappings | ✅ Working |
| `/:provider/mappings` | PUT | Update mappings | ✅ Working |
| `/:provider/mappings/test` | POST | Test mappings | ✅ Working |
| `/:provider/mappings/apply-template` | POST | Apply template | ✅ Working |
| `/:provider/mappings/reset` | POST | Reset to default | ✅ Working |
| `/:provider/mappings/heal` | POST | Fix broken mappings | ✅ Working |

---

## Implementation Details

### Get Available Fields
```typescript
async getAvailableFields(request, reply) {
  const { provider } = request.params;
  const fields = await mappingService.getAvailableFields(provider);
  return reply.send({ success: true, data: fields });
}

// Returns fields from external provider that can be mapped
// Example: { externalEventName, externalDate, externalPrice, ... }
```

### Test Mappings
```typescript
async testMappings(request, reply) {
  const { mappings, sampleData } = request.body;

  // Apply mappings to sample data
  const mapped = Object.entries(mappings).reduce((acc, [source, target]) => {
    const value = source.split('.').reduce((obj, key) => obj?.[key], sampleData);
    acc[target] = value;
    return acc;
  }, {});

  return reply.send({
    success: true,
    data: {
      original: sampleData,
      mapped
    }
  });
}
```

### Heal Mappings
```typescript
async healMappings(request, reply) {
  const { provider } = request.params;
  const { venueId } = request.body;

  // Automatically fix broken field mappings
  await mappingService.healMapping(venueId, provider);

  return reply.send({ success: true, message: 'Mappings healed successfully' });
}
```

---

## Mapping Structure
```typescript
// Example mapping: external field → internal field
{
  "external.event.name": "name",
  "external.event.description": "description",
  "external.event.start_time": "startDate",
  "external.event.end_time": "endDate",
  "external.event.price": "ticketPrice",
  "external.venue.name": "venueName"
}
```

---

## Mapping Templates

Pre-configured mappings for common integrations:
- Default template (auto-applied)
- Custom templates per provider
- Venue-specific overrides

---

## Files Involved

| File | Purpose |
|------|---------|
| `integration-service/src/routes/mapping.routes.ts` | Routes |
| `integration-service/src/controllers/mapping.controller.ts` | Controller |
| `integration-service/src/services/mapping.service.ts` | Mapping logic |
| `integration-service/src/services/field-mapping.service.ts` | Field mapping |

---

## Related Documents

- `DATA_SYNC_FLOW_AUDIT.md` - Using mappings during sync
- `EXTERNAL_INTEGRATIONS_FLOW_AUDIT.md` - Integration overview
