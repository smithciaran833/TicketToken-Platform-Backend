# Time-Sensitive Operations Policy

## Overview

This document defines the timing rules and grace periods for event operations.

## Grace Periods

Grace periods provide flexibility while maintaining operational integrity.

| Operation | Grace Period | Environment Variable |
|-----------|-------------|---------------------|
| Sales Start/End | 5 minutes | `SALES_TIMING_GRACE_MINUTES` |
| Event Start | 15 minutes | `EVENT_START_GRACE_MINUTES` |
| Ticket Transfer | 30 minutes | `TRANSFER_GRACE_MINUTES` |
| Refund Requests | 48 hours | `REFUND_REQUEST_GRACE_HOURS` |
| Cancellation | 2 hours | `CANCELLATION_GRACE_HOURS` |

## Timing Rules

### Event Creation

- Events must be scheduled at least **24 hours** in advance
- Events cannot be scheduled more than **2 years** in advance
- All times must be valid ISO 8601 format

### Sales Windows

- Sales start time must be before sales end time
- Sales must end before or at event start time
- System automatically transitions events:
  - `PUBLISHED` → `ON_SALE` when sales start time is reached
  - `ON_SALE` → `SOLD_OUT` when capacity reaches zero
  - `ON_SALE` → `IN_PROGRESS` when event start time is reached

### Ticket Transfers

- Transfers blocked within `TRANSFER_GRACE_MINUTES` of event start
- Transfers blocked for cancelled events
- Transfers blocked for completed events

### Cancellations

- User cancellations blocked within `CANCELLATION_GRACE_HOURS` of event start
- Admin cancellations allowed at any time with audit trail
- Automatic refund triggers on cancellation

### Modifications

Protected fields after ticket sales begin:
- Event date/time (requires confirmation flow)
- Venue (requires confirmation flow)
- Capacity reduction below sold tickets

## Clock Synchronization

### Server Time

- All servers synchronized via NTP
- Maximum allowed drift: 100ms
- Clock drift monitoring with alerts at 50ms

### API Responses

Time-sensitive responses include server time:
```json
{
  "data": { ... },
  "server_time": "2025-01-04T12:00:00.000Z",
  "server_time_unix_ms": 1735992000000
}
```

### Client Guidelines

1. Use server time for countdown displays
2. Include `X-Client-Time` header for drift detection
3. Handle `408 Request Timeout` for stale requests

## Scheduled Jobs

### Event Transitions Job

- **Frequency**: Every minute
- **Purpose**: Automatic state transitions based on time
- **Idempotent**: Safe to run multiple times
- **Distributed Lock**: Prevents concurrent execution

### Transitions Handled

| Current State | Trigger | New State |
|--------------|---------|-----------|
| PUBLISHED | Sales start time reached | ON_SALE |
| ON_SALE | Capacity = 0 | SOLD_OUT |
| ON_SALE / SOLD_OUT | Event start time reached | IN_PROGRESS |
| IN_PROGRESS | Event end time reached | COMPLETED |

## Error Handling

### Deadline Errors

When an operation violates timing rules:
```json
{
  "type": "https://api.tickettoken.com/errors/deadline-exceeded",
  "title": "Deadline Exceeded",
  "status": 400,
  "detail": "Transfer deadline has passed. Transfers must be completed at least 30 minutes before event start.",
  "code": "DEADLINE_EXCEEDED",
  "deadline": "2025-01-04T11:30:00.000Z",
  "server_time": "2025-01-04T12:00:00.000Z"
}
```

### Grace Period Application

Grace periods are applied server-side:
```
actual_deadline = configured_deadline - grace_period
```

Example:
- Event starts: 12:00
- Transfer cutoff: 30 minutes before
- Grace period: 5 minutes
- Effective deadline: 11:35 (30 - 5 = 25 minutes before)

## Compliance

### Audit Trail

All time-sensitive operations are logged:
- Operation timestamp (server time)
- Deadline at time of operation
- Grace period applied
- User/service performing operation

### Reporting

Monthly reports available:
- Operations within grace periods
- Deadline violations
- Clock drift incidents
