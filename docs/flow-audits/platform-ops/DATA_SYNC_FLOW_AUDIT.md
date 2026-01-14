# DATA SYNC FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Data Sync |

---

## Executive Summary

**WORKING - Full sync engine with queue management**

| Component | Status |
|-----------|--------|
| Trigger sync | ✅ Working |
| Stop sync | ✅ Working |
| Get sync status | ✅ Working |
| Sync history | ✅ Working |
| Retry failed | ✅ Working |
| Sync queue | ✅ Working |
| Sync logs | ✅ Working |

**Bottom Line:** Complete data synchronization system with queue-based processing, status tracking, history logging, and retry capabilities for failed syncs.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/:provider/sync` | POST | Trigger sync | ✅ Working |
| `/:provider/sync/stop` | POST | Stop sync | ✅ Working |
| `/:provider/sync/status` | GET | Get status | ✅ Working |
| `/:provider/sync/history` | GET | Get history | ✅ Working |
| `/:provider/sync/retry` | POST | Retry failed | ✅ Working |

---

## Implementation Details

### Trigger Sync
```typescript
async triggerSync(request, reply) {
  const { provider } = request.params;
  const { venueId, syncType, options } = request.body;

  const result = await integrationService.syncNow(
    venueId,
    provider,
    { syncType, ...options }
  );

  return reply.send({ success: true, data: result });
}
```

### Stop Sync
```typescript
async stopSync(request, reply) {
  const { provider } = request.params;
  const { venueId } = request.body;

  await db('sync_queue')
    .where({
      venue_id: venueId,
      integration_type: provider,
      status: 'pending'
    })
    .update({
      status: 'paused',
      updated_at: new Date()
    });

  return reply.send({ success: true, message: 'Sync stopped successfully' });
}
```

### Get Sync Status
```typescript
async getSyncStatus(request, reply) {
  const { provider } = request.params;
  const { venueId } = request.query;

  const status = await db('integration_configs')
    .where({ venue_id: venueId, integration_type: provider })
    .first();

  const queueStatus = await db('sync_queue')
    .where({ venue_id: venueId, integration_type: provider })
    .select('status')
    .count('* as count')
    .groupBy('status');

  return reply.send({
    success: true,
    data: { integration: status, queue: queueStatus }
  });
}
```

### Retry Failed
```typescript
async retryFailed(request, reply) {
  const { provider } = request.params;
  const { venueId, queueItemId } = request.body;

  const query = db('sync_queue')
    .where({
      venue_id: venueId,
      integration_type: provider,
      status: 'failed'
    });

  if (queueItemId) {
    query.where('id', queueItemId);
  }

  await query.update({
    status: 'pending',
    attempts: 0,
    updated_at: new Date()
  });

  return reply.send({ success: true, message: 'Failed items re-queued' });
}
```

---

## Sync Queue Statuses

| Status | Description |
|--------|-------------|
| `pending` | Waiting to be processed |
| `processing` | Currently syncing |
| `completed` | Successfully synced |
| `failed` | Sync failed |
| `paused` | Manually paused |

---

## Database Tables

- `sync_queue` - Queue of pending sync jobs
- `sync_logs` - History of completed syncs
- `integration_configs` - Integration settings per venue

---

## Files Involved

| File | Purpose |
|------|---------|
| `integration-service/src/routes/sync.routes.ts` | Routes |
| `integration-service/src/controllers/sync.controller.ts` | Controller |
| `integration-service/src/services/sync-engine.service.ts` | Sync engine |
| `integration-service/src/services/integration.service.ts` | Integration logic |

---

## Related Documents

- `INTEGRATION_OAUTH_FLOW_AUDIT.md` - Authentication
- `FIELD_MAPPING_FLOW_AUDIT.md` - Data mapping
