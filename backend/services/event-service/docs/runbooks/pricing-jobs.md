# Pricing Jobs Runbook

> **Version:** 1.0.0
> **Last Updated:** 2026-01-24
> **Service:** event-service

## Overview

Event-service requires scheduled jobs to automatically apply time-based pricing tiers. These jobs ensure that early bird discounts and last-minute pricing adjustments are applied at the correct times without manual intervention.

**Related TODOs:** #20 (Early Bird Pricing Scheduler), #21 (Last Minute Pricing Scheduler)

---

## Early Bird Pricing

### Purpose

Early bird pricing offers discounted tickets to customers who purchase before a specified cutoff date. This job automatically applies the early bird price to eligible pricing tiers.

### Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| **Schedule** | Every hour at minute 0 | `0 * * * *` (cron) |
| **Function** | `applyEarlyBirdPricing()` | `src/services/pricing.service.ts:479` |
| **Conditions** | `early_bird_price IS NOT NULL` | Pricing tier must have early bird price set |
| | `early_bird_ends_at > NOW()` | Early bird period not yet expired |

### What It Does

1. Queries `event_pricing` table for tiers with:
   - `early_bird_price` is not null
   - `early_bird_ends_at` is in the future
2. Updates `current_price = early_bird_price` for matching tiers
3. Logs all changes for audit trail

### Database Query

```sql
SELECT * FROM event_pricing
WHERE early_bird_price IS NOT NULL
  AND early_bird_ends_at IS NOT NULL
  AND early_bird_ends_at > NOW()
  AND tenant_id = :tenantId
  AND event_id = :eventId;
```

### Kubernetes CronJob Example

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: event-service-early-bird-pricing
  namespace: tickettoken
spec:
  schedule: "0 * * * *"  # Every hour at minute 0
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: pricing-job
            image: event-service:latest
            command:
            - node
            - -e
            - |
              const { PricingService } = require('./dist/services/pricing.service');
              const { getDb } = require('./dist/config/database');

              async function run() {
                const db = getDb();
                const service = new PricingService(db);

                // Get all active events
                const events = await db('events')
                  .where('status', 'ON_SALE')
                  .select('id', 'tenant_id');

                for (const event of events) {
                  await service.applyEarlyBirdPricing(event.id, event.tenant_id);
                }

                process.exit(0);
              }

              run().catch(err => {
                console.error(err);
                process.exit(1);
              });
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: event-service-secrets
                  key: database-url
            - name: NODE_ENV
              value: production
          restartPolicy: OnFailure
          serviceAccountName: event-service
```

---

## Last Minute Pricing

### Purpose

Last minute pricing adjusts ticket prices (typically higher or lower) when an event is approaching. This job automatically applies the last minute price when the configured start time is reached.

### Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| **Schedule** | Every 30 minutes | `*/30 * * * *` (cron) |
| **Function** | `applyLastMinutePricing()` | `src/services/pricing.service.ts:509` |
| **Conditions** | `last_minute_price IS NOT NULL` | Pricing tier must have last minute price set |
| | `last_minute_starts_at <= NOW()` | Last minute period has started |

### What It Does

1. Queries `event_pricing` table for tiers with:
   - `last_minute_price` is not null
   - `last_minute_starts_at` has passed
2. Updates `current_price = last_minute_price` for matching tiers
3. Logs all changes for audit trail

### Database Query

```sql
SELECT * FROM event_pricing
WHERE last_minute_price IS NOT NULL
  AND last_minute_starts_at IS NOT NULL
  AND last_minute_starts_at <= NOW()
  AND tenant_id = :tenantId
  AND event_id = :eventId;
```

### Kubernetes CronJob Example

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: event-service-last-minute-pricing
  namespace: tickettoken
spec:
  schedule: "*/30 * * * *"  # Every 30 minutes
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: pricing-job
            image: event-service:latest
            command:
            - node
            - -e
            - |
              const { PricingService } = require('./dist/services/pricing.service');
              const { getDb } = require('./dist/config/database');

              async function run() {
                const db = getDb();
                const service = new PricingService(db);

                // Get all events approaching (within 7 days)
                const events = await db('events')
                  .where('status', 'ON_SALE')
                  .where('starts_at', '<=', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
                  .where('starts_at', '>', new Date())
                  .select('id', 'tenant_id');

                for (const event of events) {
                  await service.applyLastMinutePricing(event.id, event.tenant_id);
                }

                process.exit(0);
              }

              run().catch(err => {
                console.error(err);
                process.exit(1);
              });
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: event-service-secrets
                  key: database-url
            - name: NODE_ENV
              value: production
          restartPolicy: OnFailure
          serviceAccountName: event-service
```

---

## Deployment Notes

### Prerequisites

1. **Database Access**: Jobs need read/write access to `event_pricing` table
2. **Service Account**: Use the same service account as event-service
3. **Secrets**: DATABASE_URL must be available

### Monitoring

Set up alerts for:

```yaml
# Prometheus alert for job failures
- alert: PricingJobFailed
  expr: kube_job_status_failed{job=~"event-service-(early-bird|last-minute)-pricing.*"} > 0
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Pricing job failed"
    description: "{{ $labels.job_name }} has failed"

# Alert for job not running
- alert: PricingJobMissed
  expr: time() - kube_cronjob_status_last_successful_time{cronjob=~"event-service-(early-bird|last-minute)-pricing"} > 7200
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Pricing job hasn't run in 2 hours"
```

### Logging

Jobs log to stdout in structured JSON format:

```json
{
  "level": "info",
  "eventId": "uuid",
  "count": 5,
  "tenantId": "uuid",
  "msg": "Applied early bird pricing"
}
```

Search logs with:

```bash
kubectl logs -l job-name=event-service-early-bird-pricing -n tickettoken
```

### Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Database connection failed | Network/auth issue | Check DATABASE_URL secret, network policies |
| No events found | Normal if no eligible events | No action needed |
| Transaction deadlock | Concurrent updates | Job will retry automatically |

### Manual Execution

To run the job manually (for testing or emergency):

```bash
# Create a one-off job
kubectl create job --from=cronjob/event-service-early-bird-pricing manual-early-bird-$(date +%s) -n tickettoken

# Or run directly in a pod
kubectl exec -it deployment/event-service -n tickettoken -- node -e "
  const { PricingService } = require('./dist/services/pricing.service');
  const { getDb } = require('./dist/config/database');

  (async () => {
    const service = new PricingService(getDb());
    await service.applyEarlyBirdPricing('EVENT_ID', 'TENANT_ID');
    console.log('Done');
  })();
"
```

---

## Alternative: Bull Queue Implementation

Instead of Kubernetes CronJobs, these jobs can be implemented using Bull queues (already configured in event-service):

### Setup

```typescript
// src/jobs/pricing-scheduler.job.ts
import { Queue } from 'bull';
import { getRedis } from '../config/redis';

export const pricingSchedulerQueue = new Queue('pricing-scheduler', {
  redis: getRedis(),
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
  }
});

// Schedule recurring jobs
pricingSchedulerQueue.add('early-bird', {}, {
  repeat: { cron: '0 * * * *' }  // Every hour
});

pricingSchedulerQueue.add('last-minute', {}, {
  repeat: { cron: '*/30 * * * *' }  // Every 30 minutes
});
```

### Processor

```typescript
pricingSchedulerQueue.process('early-bird', async (job) => {
  const events = await db('events').where('status', 'ON_SALE');
  for (const event of events) {
    await pricingService.applyEarlyBirdPricing(event.id, event.tenant_id);
  }
});

pricingSchedulerQueue.process('last-minute', async (job) => {
  const events = await db('events')
    .where('status', 'ON_SALE')
    .where('starts_at', '<=', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  for (const event of events) {
    await pricingService.applyLastMinutePricing(event.id, event.tenant_id);
  }
});
```

---

## Related Documentation

- [Pricing Service API](../api/pricing.md)
- [Event Lifecycle](../architecture/event-lifecycle.md)
- [Key Rotation Runbook](./key-rotation.md)
- [Incident Response](./incident-response.md)

---

## Contacts

| Role | Contact |
|------|---------|
| Event Service Team | @event-team |
| Platform Team | @platform-team |
| On-Call | PagerDuty escalation |
