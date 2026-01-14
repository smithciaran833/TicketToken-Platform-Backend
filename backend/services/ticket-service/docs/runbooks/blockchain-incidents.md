# Blockchain Incident Runbook

**Service:** ticket-service  
**Last Updated:** 2025-12-31  
**On-Call Contact:** Platform Engineering Team

## Quick Reference

| Alert | Severity | Response Time |
|-------|----------|---------------|
| RPC Connection Failed | HIGH | 5 minutes |
| Transaction Stuck > 2min | MEDIUM | 15 minutes |
| Ownership Mismatch | CRITICAL | Immediate |
| WebSocket Disconnected | MEDIUM | 10 minutes |
| Reconciliation Failure | HIGH | 10 minutes |

## Common Scenarios

### Scenario 1: RPC Endpoint Down

**Symptoms:**
- `solana_rpc_errors_total` counter increasing
- Circuit breaker OPEN status
- Transaction submissions failing

**Investigation Steps:**
1. Check Solana network status: https://status.solana.com/
2. Verify RPC endpoint health:
   ```bash
   curl -X POST -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
     $SOLANA_RPC_URL
   ```
3. Check circuit breaker status in metrics

**Resolution:**
1. If primary RPC down, failover should be automatic
2. To manually switch:
   ```bash
   # Update environment
   export SOLANA_RPC_URL=https://api.backup-rpc.solana.com
   # Restart service
   kubectl rollout restart deployment/ticket-service
   ```
3. Monitor for recovery

---

### Scenario 2: Transaction Stuck in Pending

**Symptoms:**
- Alert: `pending_transactions older than 2 minutes`
- Ticket shows "pending" status in UI

**Investigation Steps:**
1. Get transaction details:
   ```sql
   SELECT * FROM pending_transactions 
   WHERE status = 'pending' 
   AND submitted_at < NOW() - INTERVAL '2 minutes';
   ```

2. Check transaction on Solana:
   ```bash
   solana confirm <tx_signature> --url $SOLANA_RPC_URL
   ```

3. Check if blockhash expired:
   ```bash
   solana block-height --url $SOLANA_RPC_URL
   # Compare with last_valid_block_height in pending_transactions
   ```

**Resolution:**

**If transaction confirmed on-chain but not in DB:**
```sql
-- Update status manually
SELECT confirm_transaction(
  '<tx_signature>',
  <slot_number>,
  NOW()
);
```

**If blockhash expired:**
```sql
-- Mark as expired
UPDATE pending_transactions 
SET status = 'expired', 
    error_code = 'BLOCKHASH_EXPIRED',
    updated_at = NOW()
WHERE tx_signature = '<tx_signature>';
```

**If transaction still valid, wait and monitor.**

---

### Scenario 3: Ownership Mismatch (CRITICAL)

**Symptoms:**
- Alert: `blockchain_sync_log with event_type = 'ownership_mismatch'`
- Customer reports wrong owner showing

**Investigation Steps:**
1. Get mismatch details:
   ```sql
   SELECT * FROM blockchain_sync_log 
   WHERE event_type = 'ownership_mismatch'
   ORDER BY created_at DESC LIMIT 10;
   ```

2. Verify on-chain ownership:
   ```bash
   spl-token display <token_mint> --url $SOLANA_RPC_URL
   ```

3. Compare with database:
   ```sql
   SELECT t.id, t.user_id, t.token_mint, u.wallet_address
   FROM tickets t
   JOIN users u ON t.user_id = u.id
   WHERE t.token_mint = '<token_mint>';
   ```

**Resolution:**

**ALWAYS trust blockchain. Update database to match:**
```sql
-- Update ticket owner to match blockchain
UPDATE tickets 
SET user_id = (SELECT id FROM users WHERE wallet_address = '<on_chain_owner>'),
    updated_at = NOW()
WHERE token_mint = '<token_mint>';

-- Log the correction
INSERT INTO blockchain_sync_log (
  tenant_id, event_type, ticket_id, 
  db_state, blockchain_state, action_taken, resolution
) VALUES (
  '<tenant_id>', 'reconciliation_resolved', '<ticket_id>',
  '{"user_id": "<old_user_id>"}',
  '{"owner": "<on_chain_owner>"}',
  'manual_correction',
  'DB updated to match blockchain ownership'
);
```

---

### Scenario 4: WebSocket Disconnected

**Symptoms:**
- `solana_websocket_status` metric = 0
- No real-time transaction confirmations
- Falling back to polling

**Investigation Steps:**
1. Check service logs for WebSocket errors:
   ```bash
   kubectl logs -l app=ticket-service --since=10m | grep -i websocket
   ```

2. Verify WebSocket endpoint:
   ```bash
   wscat -c wss://api.mainnet-beta.solana.com
   ```

**Resolution:**
- WebSocket should auto-reconnect with exponential backoff
- If stuck, restart the service:
  ```bash
  kubectl rollout restart deployment/ticket-service
  ```

---

### Scenario 5: Mass Reconciliation Needed

**Trigger:** Major incident, RPC down for extended period

**Procedure:**
1. Pause incoming transactions:
   ```bash
   kubectl scale deployment/ticket-service --replicas=0
   ```

2. Run full reconciliation:
   ```bash
   npm run job:reconcile-all -- --dry-run  # Test first
   npm run job:reconcile-all               # Execute
   ```

3. Review results:
   ```sql
   SELECT event_type, COUNT(*), MAX(created_at)
   FROM blockchain_sync_log
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY event_type;
   ```

4. Resume service:
   ```bash
   kubectl scale deployment/ticket-service --replicas=3
   ```

---

## Manual Procedures

### Retry Failed Transaction

```sql
-- 1. Find failed transactions
SELECT * FROM pending_transactions WHERE status = 'failed';

-- 2. Reset for retry (if retriable)
UPDATE pending_transactions 
SET status = 'pending',
    retry_count = retry_count + 1,
    last_retry_at = NOW(),
    error_code = NULL,
    error_message = NULL,
    updated_at = NOW()
WHERE tx_signature = '<tx_signature>'
  AND retry_count < max_retries;
```

### Force Confirm Transaction

**Use only when transaction is confirmed on-chain but DB not updated:**

```sql
SELECT confirm_transaction(
  '<tx_signature>',
  <slot_number>,
  '<block_time>'::timestamptz
);
```

### Check Circuit Breaker Status

```bash
curl http://localhost:3004/health/ready | jq '.blockchain'
```

### Switch RPC Endpoint

```bash
# 1. Update config
kubectl set env deployment/ticket-service \
  SOLANA_RPC_URL=https://new-rpc-endpoint.com \
  SOLANA_RPC_WS_URL=wss://new-rpc-endpoint.com

# 2. Verify
kubectl rollout status deployment/ticket-service
```

---

## Metrics to Monitor

| Metric | Alert Threshold | Description |
|--------|-----------------|-------------|
| `solana_rpc_latency_ms` | p99 > 5000 | RPC response time |
| `solana_rpc_errors_total` | > 10/min | Failed RPC calls |
| `pending_transactions_count` | > 100 | Transactions awaiting confirmation |
| `pending_transactions_age_seconds` | max > 300 | Oldest pending transaction |
| `blockchain_ownership_mismatches_total` | > 0 | Critical: DB/chain mismatch |
| `circuit_breaker_state` | OPEN | RPC circuit breaker tripped |

---

## Escalation Path

1. **L1 (On-Call Engineer):** Initial triage, run standard procedures
2. **L2 (Platform Team):** Complex issues, manual interventions
3. **L3 (Blockchain Lead):** Smart contract issues, network problems
4. **External:** Solana Foundation support for network-wide issues

---

## Post-Incident Checklist

- [ ] All pending transactions resolved
- [ ] Ownership reconciliation completed
- [ ] Customer communications sent (if needed)
- [ ] Incident timeline documented
- [ ] Root cause identified
- [ ] Prevention measures planned
- [ ] Runbook updated with learnings
