# SCANNING DEVICE MANAGEMENT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Scanning Device Management |

---

## Executive Summary

**WORKING - Device registration and management**

| Component | Status |
|-----------|--------|
| List devices | ✅ Working |
| Register device | ✅ Working |
| Device zones | ✅ Working |
| Upsert on conflict | ✅ Working |
| Active device filtering | ✅ Working |

**Bottom Line:** Simple but functional device management for scanning hardware. Supports registering devices with zone assignments and listing active devices.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/devices` | GET | List all active devices | ✅ Working |
| `/devices/register` | POST | Register new device | ✅ Working |

---

## Implementation Details

### List Devices
```typescript
fastify.get('/', async (request, reply) => {
  const result = await pool.query(
    'SELECT * FROM devices WHERE is_active = true ORDER BY name'
  );

  return reply.send({
    success: true,
    devices: result.rows
  });
});
```

### Register Device
```typescript
fastify.post('/register', async (request, reply) => {
  const { device_id, name, zone = 'GA' } = request.body;

  const result = await pool.query(`
    INSERT INTO devices (device_id, name, zone, is_active)
    VALUES ($1, $2, $3, true)
    ON CONFLICT (device_id) DO UPDATE
    SET name = EXCLUDED.name, zone = EXCLUDED.zone, updated_at = NOW()
    RETURNING *
  `, [device_id, name, zone]);

  return reply.send({
    success: true,
    device: result.rows[0]
  });
});
```

---

## Device Model
```typescript
interface Device {
  id: number;
  device_id: string;        // Unique hardware identifier
  name: string;             // Human-readable name
  zone: string;             // 'GA', 'VIP', 'BACKSTAGE', etc.
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
```

---

## Use Cases

1. **Event Setup** - Register all scanning devices before event
2. **Zone Assignment** - Assign devices to specific entry points
3. **Device Inventory** - Track all active scanning hardware
4. **Replacement** - Re-register device with same ID updates info

---

## Files Involved

| File | Purpose |
|------|---------|
| `scanning-service/src/routes/devices.ts` | Routes & implementation |

---

## Related Documents

- `TICKET_REDEMPTION_SCANNING_FLOW_AUDIT.md` - Scanning tickets
- `OFFLINE_SCANNING_FLOW_AUDIT.md` - Offline mode
- `SCAN_POLICIES_FLOW_AUDIT.md` - Scan policies
