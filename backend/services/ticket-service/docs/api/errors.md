# Error Handling Guide

## Overview

All API errors follow RFC 7807 Problem Details format with human-readable descriptions.

## Error Response Structure
```json
{
  "type": "https://api.tickettoken.com/errors/TICKET_NOT_FOUND",
  "title": "Ticket Not Found",
  "status": 404,
  "detail": "The ticket you requested (id: abc123) does not exist or has been deleted.",
  "code": "TICKET_NOT_FOUND",
  "instance": "/api/v1/tickets/abc123",
  "timestamp": "2025-12-31T12:00:00.000Z",
  "traceId": "abc123def456"
}
```

## Field Descriptions

| Field | Description |
|-------|-------------|
| `type` | URI reference identifying error type |
| `title` | Short human-readable summary |
| `status` | HTTP status code |
| `detail` | Human-readable explanation specific to this occurrence |
| `code` | Machine-readable error code for programmatic handling |
| `instance` | URI of the request that caused the error |
| `traceId` | Correlation ID for support requests |

## Common Errors & Solutions

### TICKET_NOT_FOUND
**Message**: The ticket does not exist or has been deleted.
**Solution**: Verify the ticket ID is correct. The ticket may have been refunded or cancelled.

### TICKET_ALREADY_SOLD
**Message**: This ticket is no longer available for purchase.
**Solution**: The ticket was purchased by another user. Try selecting a different ticket.

### RATE_LIMITED
**Message**: Too many requests. Please slow down.
**Solution**: Wait for the time specified in `Retry-After` header before retrying.

### VALIDATION_ERROR
**Message**: Request validation failed.
**Solution**: Check the `errors` array for specific field issues.

### STATE_TRANSITION_INVALID
**Message**: Cannot change ticket from current state to requested state.
**Solution**: Check valid state transitions in documentation.

## Retry Guidance

| Error Code | Retry? | Wait Time |
|------------|--------|-----------|
| 400 | No | - |
| 401 | No | - |
| 403 | No | - |
| 404 | No | - |
| 409 | Maybe | Check state first |
| 429 | Yes | See Retry-After header |
| 500 | Yes | Exponential backoff |
| 503 | Yes | See Retry-After header |

## Support

Include `traceId` when contacting support for faster resolution.
