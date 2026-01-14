# Recovery Playbook

## Service Recovery

### Complete Outage

1. **Verify outage**
```bash
   curl https://ticket-service/health
   kubectl get pods -l app=ticket-service
```

2. **Check dependencies**
   - Database: `pg_isready -h $DB_HOST`
   - Redis: `redis-cli ping`
   - RabbitMQ: Management UI or `rabbitmqctl status`

3. **Restart service**
```bash
   kubectl rollout restart deployment/ticket-service
```

4. **Verify recovery**
```bash
   kubectl rollout status deployment/ticket-service
   curl https://ticket-service/health
```

### Database Recovery

1. **Check connection**
```bash
   psql $DATABASE_URL -c "SELECT 1"
```

2. **Check pool exhaustion**
```sql
   SELECT count(*) FROM pg_stat_activity WHERE datname = 'tickets';
```

3. **Kill long queries**
```sql
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE duration > interval '5 minutes';
```

4. **Restart if needed**
```bash
   kubectl rollout restart deployment/ticket-service
```

### Redis Recovery

1. **Check connection**
```bash
   redis-cli -u $REDIS_URL ping
```

2. **Check memory**
```bash
   redis-cli info memory
```

3. **Flush if needed** (caution!)
```bash
   redis-cli flushdb
```

4. **Service operates with in-memory fallback**

### Blockchain Recovery

1. **Check RPC endpoints**
```bash
   curl -X POST $SOLANA_RPC -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

2. **Circuit breaker status**
```bash
   curl https://ticket-service/health/detailed | jq '.circuitBreakers'
```

3. **Force half-open** (allow retry)
```bash
   curl -X POST /internal/admin/circuit-breaker/blockchain/half-open
```

4. **Verify sync status**
```bash
   curl /internal/admin/blockchain/sync-status
```

## Post-Recovery

1. **Verify functionality**
   - Purchase flow
   - Transfer flow
   - QR validation

2. **Check for data inconsistencies**
   - Run reconciliation job
   - Check pending transactions

3. **Review metrics**
   - Error rates returning to normal
   - Latency within SLO

4. **Document incident**
   - Timeline
   - Root cause
   - Actions taken
   - Prevention measures
