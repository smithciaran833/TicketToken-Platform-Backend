# API Error Codes

All errors follow RFC 7807 Problem Details format.

## Error Response Format
```json
{
  "type": "https://api.tickettoken.com/errors/TICKET_NOT_FOUND",
  "title": "Ticket Not Found",
  "status": 404,
  "detail": "Ticket with ID abc123 does not exist",
  "instance": "/api/v1/tickets/abc123",
  "code": "TICKET_NOT_FOUND",
  "timestamp": "2025-12-31T12:00:00.000Z",
  "traceId": "abc123def456"
}
```

## Authentication Errors (401)

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Missing or invalid authentication |
| `TOKEN_EXPIRED` | JWT token has expired |
| `TOKEN_INVALID` | JWT token is malformed |
| `TENANT_MISMATCH` | Token tenant doesn't match request |

## Authorization Errors (403)

| Code | Description |
|------|-------------|
| `FORBIDDEN` | User lacks permission |
| `INSUFFICIENT_ROLE` | Role cannot perform action |
| `TENANT_ACCESS_DENIED` | Cannot access this tenant's data |
| `ADMIN_REQUIRED` | Admin role required |

## Not Found Errors (404)

| Code | Description |
|------|-------------|
| `TICKET_NOT_FOUND` | Ticket does not exist |
| `EVENT_NOT_FOUND` | Event does not exist |
| `ORDER_NOT_FOUND` | Order does not exist |
| `TRANSFER_NOT_FOUND` | Transfer does not exist |
| `USER_NOT_FOUND` | User does not exist |

## Validation Errors (400)

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request body validation failed |
| `INVALID_UUID` | Invalid UUID format |
| `INVALID_DATE` | Invalid ISO 8601 date |
| `MISSING_FIELD` | Required field missing |
| `INVALID_FIELD` | Field value invalid |

## Conflict Errors (409)

| Code | Description |
|------|-------------|
| `TICKET_ALREADY_SOLD` | Ticket is no longer available |
| `TICKET_ALREADY_SCANNED` | Ticket was already scanned |
| `DUPLICATE_TRANSFER` | Transfer already in progress |
| `IDEMPOTENCY_CONFLICT` | Different payload for same key |
| `STATE_TRANSITION_INVALID` | Cannot transition to requested state |

## Rate Limit Errors (429)

| Code | Description |
|------|-------------|
| `RATE_LIMITED` | Too many requests |
| `BANNED` | Account temporarily banned |

## Server Errors (500/503)

| Code | Description |
|------|-------------|
| `INTERNAL_ERROR` | Unexpected server error |
| `DATABASE_ERROR` | Database operation failed |
| `SERVICE_UNAVAILABLE` | Service temporarily unavailable |
| `CIRCUIT_OPEN` | Upstream service unavailable |
| `BLOCKCHAIN_ERROR` | Blockchain operation failed |

## Business Logic Errors (422)

| Code | Description |
|------|-------------|
| `TICKET_EXPIRED` | Ticket has expired |
| `EVENT_ENDED` | Event has already ended |
| `TRANSFER_LIMIT_EXCEEDED` | Max transfers reached |
| `SPENDING_LIMIT_EXCEEDED` | Purchase exceeds spending limit |
| `CHECK_IN_TOO_EARLY` | Check-in window not open |
| `CHECK_IN_TOO_LATE` | Check-in window closed |
