# SCAN POLICIES FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Scan Policies |

---

## Executive Summary

**WORKING - Configurable scan policies per event**

| Component | Status |
|-----------|--------|
| Policy templates | ✅ Working |
| Get event policies | ✅ Working |
| Apply template to event | ✅ Working |
| Custom policies | ✅ Working |
| Duplicate window | ✅ Working |
| Re-entry rules | ✅ Working |
| Zone enforcement | ✅ Working |
| VIP all-access | ✅ Working |

**Bottom Line:** Flexible scan policy system with templates and per-event customization. Supports duplicate detection windows, re-entry rules with cooldowns, zone enforcement, and VIP privileges.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/policies/templates` | GET | List templates | ✅ Working |
| `/policies/event/:eventId` | GET | Get event policies | ✅ Working |
| `/policies/event/:eventId/apply-template` | POST | Apply template | ✅ Working |
| `/policies/event/:eventId/custom` | PUT | Set custom policies | ✅ Working |

---

## Policy Types

### Duplicate Window

Prevents the same ticket from being scanned within a time window.
```typescript
{
  policy_type: 'DUPLICATE_WINDOW',
  config: {
    window_minutes: 5    // Block re-scan within 5 minutes
  }
}
```

### Re-entry Rules

Controls whether attendees can re-enter after leaving.
```typescript
{
  policy_type: 'REENTRY',
  config: {
    enabled: true,
    cooldown_minutes: 15,   // Wait 15 min before re-entry
    max_reentries: 2        // Maximum 2 re-entries allowed
  }
}
```

### Zone Enforcement

Controls which zones a ticket can access.
```typescript
{
  policy_type: 'ZONE_ENFORCEMENT',
  config: {
    strict: true,           // Only allow assigned zone
    vip_all_access: true    // VIP tickets access all zones
  }
}
```

---

## Implementation Details

### Get Policy Templates
```typescript
fastify.get('/templates', async (request, reply) => {
  const result = await pool.query(`
    SELECT id, name, description, policy_set, is_default
    FROM scan_policy_templates
    ORDER BY is_default DESC, name
  `);

  return reply.send({
    success: true,
    templates: result.rows
  });
});
```

### Apply Template
```typescript
fastify.post('/event/:eventId/apply-template', async (request, reply) => {
  const { eventId } = request.params;
  const { template_id } = request.body;

  await pool.query(
    'SELECT apply_scan_policy_template($1, $2)',
    [eventId, template_id]
  );

  // Return updated policies
  const result = await pool.query(`
    SELECT * FROM scan_policies WHERE event_id = $1
  `, [eventId]);

  return reply.send({
    success: true,
    message: 'Policy template applied successfully',
    policies: result.rows
  });
});
```

### Set Custom Policies
```typescript
fastify.put('/event/:eventId/custom', async (request, reply) => {
  const { eventId } = request.params;
  const {
    duplicate_window_minutes,
    reentry_enabled,
    reentry_cooldown_minutes,
    max_reentries,
    strict_zones,
    vip_all_access
  } = request.body;

  // Upsert duplicate window policy
  if (duplicate_window_minutes !== undefined) {
    await client.query(`
      INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
      VALUES ($1, $2, 'DUPLICATE_WINDOW', $3, 'Custom - Duplicate Window')
      ON CONFLICT (event_id, policy_type)
      DO UPDATE SET config = $3, updated_at = NOW()
    `, [eventId, venueId, JSON.stringify({ window_minutes: duplicate_window_minutes })]);
  }

  // Upsert re-entry policy
  if (reentry_enabled !== undefined) {
    const reentryConfig = {
      enabled: reentry_enabled,
      cooldown_minutes: reentry_cooldown_minutes || 15,
      max_reentries: max_reentries || 2
    };

    await client.query(`
      INSERT INTO scan_policies (...)
      ON CONFLICT (event_id, policy_type)
      DO UPDATE SET config = $3
    `, [eventId, venueId, JSON.stringify(reentryConfig)]);
  }

  // Upsert zone enforcement
  if (strict_zones !== undefined || vip_all_access !== undefined) {
    const zoneConfig = {
      strict: strict_zones !== false,
      vip_all_access: vip_all_access || false
    };

    await client.query(`
      INSERT INTO scan_policies (...)
      ON CONFLICT (event_id, policy_type)
      DO UPDATE SET config = $3
    `, [eventId, venueId, JSON.stringify(zoneConfig)]);
  }

  return reply.send({
    success: true,
    message: 'Custom policies applied successfully',
    policies: result.rows
  });
});
```

---

## Policy Templates

| Template | Description |
|----------|-------------|
| Standard | 5-min duplicate window, no re-entry |
| Festival | 30-min window, unlimited re-entry |
| Concert | 10-min window, 1 re-entry, strict zones |
| Conference | No duplicate window, unlimited re-entry |
| VIP Event | 5-min window, VIP all-access |

---

## Database Schema
```sql
CREATE TABLE scan_policies (
  id SERIAL PRIMARY KEY,
  event_id UUID NOT NULL,
  venue_id UUID,
  policy_type VARCHAR(50) NOT NULL,  -- 'DUPLICATE_WINDOW', 'REENTRY', 'ZONE_ENFORCEMENT'
  name VARCHAR(100),
  config JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(event_id, policy_type)
);

CREATE TABLE scan_policy_templates (
  id UUID PRIMARY KEY,
  name VARCHAR(100),
  description TEXT,
  policy_set JSONB,   -- Array of policies
  is_default BOOLEAN DEFAULT false
);
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `scanning-service/src/routes/policies.ts` | Routes & implementation |

---

## Related Documents

- `TICKET_REDEMPTION_SCANNING_FLOW_AUDIT.md` - Policy enforcement
- `OFFLINE_SCANNING_FLOW_AUDIT.md` - Policies in manifest
- `ACCESS_CONTROL_FLOW_AUDIT.md` - Zone access
