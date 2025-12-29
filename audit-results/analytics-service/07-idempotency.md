## Idempotency Audit: analytics-service

### Audit Against: `Docs/research/07-idempotency.md`

---

## API Endpoint Idempotency

| Endpoint | Method | Idempotent? | Evidence |
|----------|--------|-------------|----------|
| `POST /metrics` | POST | ❌ FAIL | No idempotency key, creates new record each time |
| `POST /metrics/bulk` | POST | ❌ FAIL | No deduplication, bulk creates without checking |
| `GET /metrics/:venueId` | GET | ✅ PASS | Read-only, naturally idempotent |
| `GET /metrics/:venueId/realtime` | GET | ✅ PASS | Read-only |
| `GET /metrics/:venueId/trends` | GET | ✅ PASS | Read-only |
| `GET /metrics/:venueId/compare` | GET | ✅ PASS | Read-only |
| `GET /metrics/:venueId/aggregate` | GET | ✅ PASS | Read-only |
| `POST /reports/generate` | POST | ❌ FAIL | No idempotency key |
| `POST /dashboards` | POST | ❌ FAIL | No idempotency key |
| `POST /alerts` | POST | ❌ FAIL | No idempotency key |

---

## Idempotency Key Handling

| Check | Status | Evidence |
|-------|--------|----------|
| Idempotency-Key header accepted | ❌ FAIL | **Not implemented** |
| Key stored in database/Redis | ❌ FAIL | No idempotency storage |
| Response cached for duplicate requests | ❌ FAIL | No response caching for POST |
| Key expiration configured | ❌ FAIL | N/A |
| Key format validated | ❌ FAIL | N/A |

**Missing Implementation (metrics.routes.ts):**
```typescript
// ❌ CURRENT - No idempotency
app.post('/', {
  preHandler: [authorize(['analytics.write'])],
  schema: recordMetricSchema,
  handler: metricsController.recordMetric
});

// ✅ SHOULD BE
app.post('/', {
  preHandler: [
    authorize(['analytics.write']),
    validateIdempotencyKey  // Missing
  ],
  schema: recordMetricSchema,
  handler: metricsController.recordMetric
});
```

---

## Database-Level Idempotency

| Check | Status | Evidence |
|-------|--------|----------|
| Unique constraints for natural keys | ⚠️ PARTIAL | Some tables have unique constraints |
| Upsert pattern used (ON CONFLICT) | ✅ PASS | `upsertAggregation` in aggregation service |
| Deduplication on message processing | ❌ FAIL | No message deduplication |

**Aggregation Upsert (from migration):**
```typescript
// analytics_aggregations has unique constraint
table.unique([
  'tenant_id', 'aggregation_type', 'metric_type', 
  'entity_type', 'entity_id', 'time_period', 'period_start'
]);
// ✅ This enables idempotent aggregation updates
```

**Missing Unique Constraint (analytics_metrics):**
```typescript
// ❌ No unique constraint - same metric can be recorded multiple times
await knex.schema.createTable('analytics_metrics', (table) => {
  table.uuid('id').primary();
  // No unique constraint on (tenant_id, metric_type, entity_id, timestamp)
});
```

---

## Message Queue Idempotency

| Check | Status | Evidence |
|-------|--------|----------|
| Message deduplication enabled | ❌ FAIL | No deduplication in RabbitMQ consumer |
| Message ID stored for processed messages | ❌ FAIL | Not implemented |
| Duplicate message detection | ❌ FAIL | Not implemented |
| At-least-once delivery handled | ❌ FAIL | No handler |

**RabbitMQ Consumer (no deduplication):**
```typescript
// rabbitmq.ts - No message deduplication
channel.bindQueue(queue.queue, config.rabbitmq.exchange, '#');
// Messages consumed without checking if already processed
```

---

## Bulk Operations

| Check | Status | Evidence |
|-------|--------|----------|
| Bulk operations check for duplicates | ❌ FAIL | `bulkRecordMetrics` creates without check |
| Partial success handled | ❌ FAIL | All-or-nothing approach |
| Retry logic for partial failures | ❌ FAIL | Not implemented |

**Bulk Record (metrics.controller.ts:79-96):**
```typescript
bulkRecordMetrics = async (request, reply) => {
  const { metrics } = request.body;
  
  // ❌ No deduplication check
  // ❌ No idempotency key per metric
  const formattedMetrics = metrics.map(m => ({...}));
  
  await this.metricsService.bulkRecordMetrics(formattedMetrics);
  
  return this.success(reply, {
    message: 'Metrics recorded',
    recorded: metrics.length
  });
};
```

---

## Aggregation Service Analysis

**Good Pattern Found (aggregation.service.ts):**
```typescript
// ✅ Uses upsert for aggregations - IDEMPOTENT
await AggregationModel.upsertAggregation(venueId, aggregation);
```

The aggregation service properly uses upsert, making re-running aggregations idempotent.

**However, raw metric recording is NOT idempotent:**
```typescript
// metrics.service.ts (assumed pattern) - NOT IDEMPOTENT
await MetricModel.insert({
  id: uuid(),  // New ID each time
  venueId,
  metricType,
  value,
  timestamp
});
// Same metric can be recorded multiple times
```

---

## Summary

### Critical Issues (Must Fix Before Production)
| Issue | Location | Risk |
|-------|----------|------|
| No idempotency key support | All POST endpoints | Duplicate data on retries |
| No message deduplication | RabbitMQ consumer | Duplicate processing |
| No unique constraint on raw metrics | `analytics_metrics` table | Data duplication |
| Bulk operations not idempotent | `/metrics/bulk` | Mass duplication |

### Compliance Score: 25% (5/20 checks passed)

- ✅ PASS: 5 (GET endpoints, upsert for aggregations)
- ⚠️ PARTIAL: 1
- ❌ FAIL: 14

### Priority Fixes

1. **Add idempotency key middleware:**
```typescript
async function validateIdempotencyKey(request, reply) {
  const key = request.headers['idempotency-key'];
  if (!key) return; // Optional for analytics
  
  const cached = await redis.get(`idempotency:${key}`);
  if (cached) {
    return reply.code(200).send(JSON.parse(cached));
  }
  
  request.idempotencyKey = key;
}
```

2. **Add unique constraint for metrics:**
```typescript
table.unique(['tenant_id', 'metric_type', 'entity_id', 'timestamp']);
```

3. **Add message deduplication for RabbitMQ:**
```typescript
const messageId = message.properties.messageId;
if (await redis.exists(`msg:${messageId}`)) {
  channel.ack(message);
  return;
}
await redis.setex(`msg:${messageId}`, 86400, '1');
```

4. **Store response for idempotency key:**
```typescript
if (request.idempotencyKey) {
  await redis.setex(
    `idempotency:${request.idempotencyKey}`,
    86400,
    JSON.stringify(response)
  );
}
```
