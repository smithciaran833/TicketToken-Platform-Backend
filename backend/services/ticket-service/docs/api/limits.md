# API Limits

## Bulk Operations

| Operation | Limit | Notes |
|-----------|-------|-------|
| Bulk transfer | 50 tickets | Per request |
| Bulk purchase | 10 tickets | Per transaction |
| Batch scan | 100 tickets | Per request |

## Transfer Limits

| Limit Type | Default | Description |
|------------|---------|-------------|
| Per ticket | 5 | Max transfers per ticket lifetime |
| Per user/day | 20 | Max outgoing transfers per day |
| Per event | 100 | Max transfers per event per user |

## Purchase Limits

| Limit Type | Default | Description |
|------------|---------|-------------|
| Per transaction | 10 | Max tickets per purchase |
| Per event/user | 20 | Max tickets per event per user |
| Per day/user | 50 | Max tickets per day per user |

## Spending Limits

| Limit Type | Default | Description |
|------------|---------|-------------|
| Per transaction | $500 | Max single purchase |
| Daily | $1,000 | Max per 24 hours |
| Weekly | $5,000 | Max per 7 days |
| Monthly | $20,000 | Max per 30 days |

## Request Size Limits

| Limit | Value |
|-------|-------|
| Request body | 1 MB |
| Array items | 100 |
| String length | 10,000 chars |
| URL length | 2,048 chars |

## Pagination Limits

| Parameter | Default | Max |
|-----------|---------|-----|
| `limit` | 20 | 100 |
| `offset` | 0 | 10,000 |

## Exceeding Limits

When limits are exceeded:
```json
{
  "type": "https://api.tickettoken.com/errors/LIMIT_EXCEEDED",
  "title": "Limit Exceeded",
  "status": 422,
  "detail": "Bulk transfer limit is 50 tickets per request",
  "code": "BULK_TRANSFER_LIMIT_EXCEEDED",
  "limit": 50,
  "requested": 75
}
```
