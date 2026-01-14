# Tenant Operations

## Onboarding

### Checklist

1. **Create tenant record**
```sql
   INSERT INTO tenants (id, name, status) VALUES (uuid, 'Tenant Name', 'active');
```

2. **Configure RLS**
   - Tenant ID propagated via JWT
   - All queries filtered by tenant

3. **Set resource quotas**
   - Rate limits
   - Storage limits
   - API access levels

4. **Generate credentials**
   - API keys
   - Webhook secrets

5. **Configure integrations**
   - Payment processor
   - Notification channels

### Verification
```bash
# Test tenant isolation
curl -H "Authorization: Bearer <tenant-token>" /api/v1/tickets
```

## Offboarding

### Checklist

1. **Disable tenant**
```sql
   UPDATE tenants SET status = 'disabled' WHERE id = '<tenant-id>';
```

2. **Revoke credentials**
   - Invalidate API keys
   - Revoke JWT tokens

3. **Data retention**
   - Export data if requested
   - Schedule deletion per policy

4. **Cleanup resources**
   - Remove from cache
   - Clear queue messages
   - Archive logs

### Data Deletion

Per retention policy, data is deleted:
- Immediately: Cache, sessions
- 30 days: Logs, metrics
- 90 days: Transaction records
- On request: All PII

## Resource Quotas

| Resource | Default | Enterprise |
|----------|---------|------------|
| API requests/min | 100 | 1000 |
| Tickets/event | 10,000 | 100,000 |
| Events/month | 50 | Unlimited |
| Storage | 1 GB | 100 GB |
| Webhooks | 5 | 50 |

## Monitoring

Per-tenant metrics available:
- `http_requests_total{tenant_id="..."}`
- `ticket_purchases_total{tenant_id="..."}`
- `database_queries_total{tenant_id="..."}`
