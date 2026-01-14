# OFFLINE SCANNING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Offline Scanning |

---

## Executive Summary

**WORKING - Full offline capability with reconciliation**

| Component | Status |
|-----------|--------|
| Generate offline manifest | ✅ Working |
| Store manifest on device | ✅ Working |
| Reconcile offline scans | ✅ Working |
| Duplicate detection | ✅ Working |
| Ticket status updates | ✅ Working |
| Transaction support | ✅ Working |

**Bottom Line:** Full offline scanning support. Devices can download a manifest of valid tickets before the event, scan offline during the event, and reconcile scans when connectivity is restored.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/offline/manifest/:eventId` | GET | Download manifest | ✅ Working |
| `/offline/reconcile` | POST | Sync offline scans | ✅ Working |

---

## Offline Flow
```
BEFORE EVENT (Online)
├── Device downloads manifest
│   GET /offline/manifest/:eventId?device_id=xxx
│   → List of all valid ticket IDs for event
│
DURING EVENT (Offline)
├── Device scans tickets locally
├── Validates against manifest
├── Stores scan results locally
│
AFTER EVENT (Online)
├── Device reconciles scans
│   POST /offline/reconcile
│   → Syncs all offline scans to server
```

---

## Implementation Details

### Generate Manifest
```typescript
fastify.get('/manifest/:eventId', async (request, reply) => {
  const { eventId } = request.params;
  const { device_id } = request.query;

  if (!device_id) {
    return reply.status(400).send({
      success: false,
      error: 'MISSING_DEVICE_ID'
    });
  }

  const manifest = await qrGenerator.generateOfflineManifest(eventId, device_id);

  return reply.send({
    success: true,
    manifest
  });
});
```

### Reconcile Scans
```typescript
fastify.post('/reconcile', async (request, reply) => {
  const { device_id, scans } = request.body;
  
  await client.query('BEGIN');
  const results = [];

  for (const scan of scans) {
    // Check for duplicate
    const existing = await client.query(`
      SELECT id FROM scans
      WHERE ticket_id = $1 AND scanned_at = $2
    `, [scan.ticket_id, scan.scanned_at]);

    if (existing.rows.length > 0) {
      results.push({ ticket_id: scan.ticket_id, status: 'DUPLICATE' });
      continue;
    }

    // Insert scan record
    await client.query(`
      INSERT INTO scans (ticket_id, device_id, result, reason, scanned_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [scan.ticket_id, deviceId, scan.result, scan.reason, scan.scanned_at]);

    // Update ticket if ALLOW
    if (scan.result === 'ALLOW') {
      await client.query(`
        UPDATE tickets SET
          scan_count = GREATEST(COALESCE(scan_count, 0), $1),
          last_scanned_at = GREATEST(COALESCE(last_scanned_at, $2), $2),
          first_scanned_at = LEAST(COALESCE(first_scanned_at, $2), $2)
        WHERE id = $3
      `, [scan.scan_count, scan.scanned_at, scan.ticket_id]);
    }

    results.push({ ticket_id: scan.ticket_id, status: 'SUCCESS' });
  }

  await client.query('COMMIT');

  return reply.send({
    success: true,
    reconciled: results.filter(r => r.status === 'SUCCESS').length,
    failed: results.filter(r => r.status !== 'SUCCESS').length,
    results
  });
});
```

---

## Manifest Structure
```typescript
interface OfflineManifest {
  eventId: string;
  generatedAt: Date;
  expiresAt: Date;
  tickets: Array<{
    ticketId: string;
    ticketCode: string;       // QR code data
    tier: string;
    zone: string;
    maxScans: number;
    currentScans: number;
    status: 'valid' | 'used' | 'cancelled';
  }>;
  policies: ScanPolicies;     // Duplicate window, re-entry rules
}
```

---

## Reconciliation Request
```typescript
interface ReconcileRequest {
  device_id: string;
  scans: Array<{
    ticket_id: string;
    scanned_at: string;       // ISO timestamp
    result: 'ALLOW' | 'DENY';
    reason?: string;
    scan_count?: number;
  }>;
}
```

---

## Reconciliation Response
```json
{
  "success": true,
  "reconciled": 150,
  "failed": 3,
  "results": [
    { "ticket_id": "t1", "status": "SUCCESS", "message": "Scan reconciled" },
    { "ticket_id": "t2", "status": "DUPLICATE", "message": "Already processed" },
    { "ticket_id": "t3", "status": "ERROR", "message": "Device not found" }
  ]
}
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `scanning-service/src/routes/offline.ts` | Routes & implementation |
| `scanning-service/src/services/QRGenerator.ts` | Manifest generation |

---

## Related Documents

- `TICKET_REDEMPTION_SCANNING_FLOW_AUDIT.md` - Online scanning
- `SCANNING_DEVICE_MANAGEMENT_FLOW_AUDIT.md` - Device registration
- `SCAN_POLICIES_FLOW_AUDIT.md` - Policy enforcement
