# Ticket Service - 07 Idempotency Audit

**Service:** ticket-service
**Document:** 07-idempotency.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 60% (18/30 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 3 | Race condition in idempotency check, No tenant_id, No idempotency on reservation |
| MEDIUM | 3 | No payload fingerprint, No X-Idempotent-Replayed header, Sync webhook processing |
| LOW | 2 | No key format validation, No 409 for in-progress |

---

## Payment Flow (4/6 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| Idempotency key before processing | PASS | Required in header |
| Key stored with order | PASS | idempotency_keys table |
| Key format includes tenant_id | PARTIAL | Client key, tenant validated separately |
| Failed requests allow retry | PASS | Errors not cached |
| Replay responses handled | PASS | Returns cached response |

---

## Webhook Handler (6/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Signature verification first | PASS | HMAC before processing |
| Event ID checked for duplicates | PASS | Nonce in processed_webhooks |
| Processing status tracked | PARTIAL | Only processed, not pending |
| Returns 200 immediately | FAIL | Synchronous processing |
| Duplicate returns 200 | PASS | Returns success on dup |
| Payload stored | PASS | Stored in DB |
| Failed events logged | PASS | Error logging |

---

## Ticket Purchase Flow (5/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Accepts Idempotency-Key header | PASS | Required header |
| Key validated (format) | FAIL | Any string accepted |
| Duplicate returns original | PASS | Cached response returned |
| Inventory reservation atomic | PASS | Atomic WHERE + UPDATE |
| Idempotency includes tenant_id | FAIL | No tenant_id in table |
| Concurrent returns 409 | FAIL | No locking, race window |
| Different payload returns 422 | FAIL | No fingerprint check |
| Key TTL appropriate | PASS | 24-hour expiry |

---

## Ticket Reservation (1/3)

| Check | Status | Evidence |
|-------|--------|----------|
| Uses idempotency | FAIL | No idempotency key |
| Atomic inventory check | PASS | FOR UPDATE locking |
| Duplicates prevented | PARTIAL | Locking, no idempotency |

---

## State-Changing Operations (4/10)

| Check | Status | Evidence |
|-------|--------|----------|
| All POST support idempotency | PARTIAL | Purchase yes, reservation no |
| Storage is persistent | PASS | PostgreSQL table |
| Checks are atomic | FAIL | SELECT before INSERT |
| Replay indicator header | FAIL | No X-Idempotent-Replayed |
| Keys scoped to tenant | FAIL | No tenant_id |
| Error responses not cached | PASS | Only success cached |
| 5xx allows same-key retry | PASS | Not cached |
| 4xx requires new key | PASS | Before cache |

---

## Strengths

- Required Idempotency-Key header on purchase
- PostgreSQL persistent storage
- 24-hour TTL on records
- Cached response returned for duplicates
- Error responses not cached (allows retry)
- Atomic inventory updates (WHERE clause)
- Webhook nonce tracking (replay prevention)
- Saga pattern for multi-step flows
- Response stored with key

---

## Remediation Priority

### HIGH (This Week)
1. **Add atomic idempotency check:**
```typescript
try {
  await db('idempotency_keys').insert({
    key: idempotencyKey,
    tenant_id: tenantId,
    status: 'processing'
  });
} catch (error) {
  if (error.code === '23505') { // Unique violation
    const existing = await db('idempotency_keys').where({ key }).first();
    if (existing.status === 'processing') {
      return reply.status(409).send({ error: 'Request in progress' });
    }
    return reply.status(200).send(JSON.parse(existing.response));
  }
  throw error;
}
```

2. **Add tenant_id to idempotency_keys:**
```sql
ALTER TABLE idempotency_keys ADD COLUMN tenant_id UUID REFERENCES tenants(id);
CREATE UNIQUE INDEX idx_idempotency_tenant_key ON idempotency_keys(tenant_id, key);
```

3. **Add idempotency to reservation endpoint**

### MEDIUM (This Month)
1. Add X-Idempotent-Replayed header on cached responses
2. Add payload fingerprint comparison (422 on mismatch)
3. Process webhooks async via queue

### LOW (Backlog)
1. Validate idempotency key format (UUID v4)
2. Add cleanup job for expired records
