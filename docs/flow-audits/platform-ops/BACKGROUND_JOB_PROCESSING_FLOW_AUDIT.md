# BACKGROUND JOB PROCESSING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Background Job Processing |

---

## Executive Summary

**WORKING - Comprehensive queue-based job processing**

| Component | Status |
|-----------|--------|
| queue-service | ✅ Full service |
| PgBoss (PostgreSQL-based) | ✅ Working |
| Job routes API | ✅ Working |
| Queue routes API | ✅ Working |
| Money queue (payment/refund/NFT) | ✅ Working |
| Communication queue (email) | ✅ Working |
| Background queue (analytics) | ✅ Working |
| Job retry with backoff | ✅ Working |
| Dead letter queue | ✅ Working |
| Job metrics | ✅ Working |
| Alerts | ✅ Working |
| Rate limiting | ✅ Working |

**Bottom Line:** Full-featured background job processing service using PgBoss (PostgreSQL-backed). Supports multiple queue types (money, communication, background), job retry with exponential backoff, dead letter queues, metrics, monitoring, and API for job management.

---

## API Endpoints

### Job Management

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/jobs` | POST | Add new job | Required |
| `/jobs/:id` | GET | Get job details | Required |
| `/jobs/:id/retry` | POST | Retry failed job | Admin |
| `/jobs/:id` | DELETE | Cancel job | Admin |
| `/jobs/batch` | POST | Add batch jobs | Admin |

### Queue Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/queues` | GET | List all queues |
| `/queues/:name/stats` | GET | Queue statistics |
| `/queues/:name/pause` | POST | Pause queue |
| `/queues/:name/resume` | POST | Resume queue |

### Monitoring

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health/*` | GET | Health checks |
| `/metrics/*` | GET | Job metrics |
| `/alerts/*` | GET/POST | Alert management |
| `/rate-limits/*` | GET/POST | Rate limit config |

---

## Queue Types

### Money Queue

**File:** `backend/services/queue-service/src/queues/definitions/money.queue.ts`

Processors:
- `PaymentProcessor` - Process payments
- `RefundProcessor` - Process refunds
- `NFTMintProcessor` - Mint NFTs
```typescript
this.boss.work(JOB_TYPES.PAYMENT_PROCESS, async (job) => {
  return await this.paymentProcessor.process({ data: job.data });
});

this.boss.work(JOB_TYPES.REFUND_PROCESS, async (job) => {
  return await this.refundProcessor.process({ data: job.data });
});

this.boss.work(JOB_TYPES.NFT_MINT, async (job) => {
  return await this.nftMintProcessor.process({ data: job.data });
});
```

### Communication Queue

**File:** `backend/services/queue-service/src/queues/definitions/communication.queue.ts`

Processors:
- `EmailProcessor` - Send emails

### Background Queue

**File:** `backend/services/queue-service/src/queues/definitions/background.queue.ts`

Processors:
- `AnalyticsProcessor` - Analytics aggregation

---

## Job Configuration

### Queue Config
```typescript
// From QUEUE_CONFIGS
MONEY_QUEUE: {
  retryLimit: 3,
  retryDelay: 5000,       // 5 seconds
  retryBackoff: true,     // Exponential backoff
  expireInSeconds: 3600,  // 1 hour
}
```

### Adding Jobs
```typescript
async addJob(jobType: string, data: any, options: any = {}) {
  const jobId = await this.boss.send(
    jobType,
    data,
    {
      retryLimit: this.config.retryLimit,
      retryDelay: this.config.retryDelay,
      retryBackoff: this.config.retryBackoff,
      expireInSeconds: this.config.expireInSeconds,
      ...options
    }
  );
  return jobId;
}
```

---

## Supporting Services

| Service | Purpose |
|---------|---------|
| `persistence.service.ts` | Job persistence |
| `recovery.service.ts` | Failed job recovery |
| `dead-letter-queue.service.ts` | DLQ management |
| `queue-registry.service.ts` | Queue registry |
| `idempotency.service.ts` | Prevent duplicates |
| `metrics.service.ts` | Job metrics |
| `monitoring.service.ts` | Queue monitoring |

---

## Worker Structure
```
workers/
├── base.worker.ts           # Base worker class
├── money/
│   ├── payment.processor.ts
│   ├── refund.processor.ts
│   └── nft-mint.processor.ts
├── communication/
│   └── email.processor.ts
└── background/
    └── analytics.processor.ts
```

---

## Job Types

**File:** `backend/services/queue-service/src/config/constants.ts`
```typescript
export const JOB_TYPES = {
  // Money
  PAYMENT_PROCESS: 'payment:process',
  REFUND_PROCESS: 'refund:process',
  NFT_MINT: 'nft:mint',
  
  // Communication
  EMAIL_SEND: 'email:send',
  
  // Background
  ANALYTICS_AGGREGATE: 'analytics:aggregate',
};
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `queue-service/src/queues/definitions/*.ts` | Queue definitions |
| `queue-service/src/workers/**/*.ts` | Job processors |
| `queue-service/src/routes/*.ts` | API routes |
| `queue-service/src/controllers/*.ts` | Controllers |
| `queue-service/src/services/*.ts` | Supporting services |

---

## Related Documents

- `SERVICE_HEALTH_MONITORING_FLOW_AUDIT.md` - Queue health
- `NFT_MINTING_LIFECYCLE_FLOW_AUDIT.md` - NFT mint jobs
- `EMAIL_NOTIFICATION_FLOW_AUDIT.md` - Email jobs
