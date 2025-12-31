# API Error Codes Documentation (AP6)

This document lists all error codes returned by the Venue Service API, their meanings, and suggested resolution steps.

## Error Response Format

All errors follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {},
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (successful deletion) |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid/missing authentication |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation error |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

## Error Codes Reference

### Authentication Errors (AUTH_*)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `AUTH_TOKEN_MISSING` | 401 | No Authorization header provided | Include `Authorization: Bearer <token>` header |
| `AUTH_TOKEN_INVALID` | 401 | JWT token is malformed or invalid | Check token format, obtain new token |
| `AUTH_TOKEN_EXPIRED` | 401 | JWT token has expired | Refresh the token |
| `AUTH_SIGNATURE_INVALID` | 401 | JWT signature verification failed | Token may be tampered; obtain new token |
| `AUTH_INSUFFICIENT_SCOPE` | 403 | Token lacks required permissions | Request token with correct scopes |

### Tenant Errors (TENANT_*)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `TENANT_ID_MISSING` | 400 | X-Tenant-ID header not provided | Include `X-Tenant-ID: <uuid>` header |
| `TENANT_ID_INVALID` | 400 | Tenant ID is not a valid UUID | Provide valid UUID format |
| `TENANT_NOT_FOUND` | 404 | Tenant does not exist | Verify tenant ID |
| `TENANT_SUSPENDED` | 403 | Tenant account is suspended | Contact support |

### Venue Errors (VENUE_*)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `VENUE_NOT_FOUND` | 404 | Venue does not exist or no access | Verify venue ID and tenant access |
| `VENUE_ALREADY_EXISTS` | 409 | Venue with this slug already exists | Use different slug |
| `VENUE_SLUG_CONFLICT` | 409 | Slug is already taken | Use different slug |
| `VENUE_CAPACITY_INVALID` | 400 | Capacity must be positive integer | Provide valid capacity value |
| `VENUE_TYPE_INVALID` | 400 | Invalid venue type | Use: arena, stadium, theater, club, outdoor, other |
| `VENUE_STATUS_INVALID` | 400 | Invalid venue status | Use: active, inactive, pending, archived |
| `VENUE_UPDATE_CONFLICT` | 409 | Optimistic locking conflict | Refresh data and retry with current version |
| `VENUE_DELETE_DENIED` | 403 | Cannot delete venue with active events | Archive events first |

### Settings Errors (SETTINGS_*)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `SETTINGS_NOT_FOUND` | 404 | Venue settings not found | Verify venue ID |
| `SETTINGS_INVALID_CURRENCY` | 400 | Invalid currency code | Use ISO 4217 currency code (USD, EUR, etc.) |
| `SETTINGS_MULTIPLIER_INVALID` | 400 | Invalid price multiplier | Must be between 1.0 and 10.0 |
| `SETTINGS_MAX_TRANSFERS_INVALID` | 400 | Invalid max transfers value | Must be positive integer |

### Stripe Connect Errors (STRIPE_*)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `STRIPE_ACCOUNT_NOT_FOUND` | 404 | Venue has no Stripe account | Initiate onboarding first |
| `STRIPE_ONBOARDING_INCOMPLETE` | 400 | Stripe onboarding not completed | Complete Stripe onboarding |
| `STRIPE_CHARGES_DISABLED` | 400 | Stripe charges are disabled | Resolve issues in Stripe dashboard |
| `STRIPE_API_ERROR` | 502 | Stripe API error | Retry later; check Stripe status |
| `STRIPE_WEBHOOK_INVALID` | 400 | Invalid webhook signature | Verify webhook secret configuration |
| `STRIPE_WEBHOOK_DUPLICATE` | 200 | Duplicate webhook event | No action needed (idempotent) |

### Resale Errors (RESALE_*)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `RESALE_NOT_ALLOWED` | 403 | Resale is disabled for this venue | Contact venue admin |
| `RESALE_PRICE_TOO_HIGH` | 400 | Price exceeds maximum allowed | Reduce price below cap |
| `RESALE_TRANSFER_LIMIT` | 400 | Maximum transfers reached | Ticket cannot be transferred again |
| `RESALE_CUTOFF_PASSED` | 400 | Resale cutoff time has passed | Cannot resale close to event |
| `RESALE_JURISDICTION_BLOCKED` | 403 | Jurisdiction doesn't allow resale | Cannot complete in this region |
| `RESALE_SELLER_UNVERIFIED` | 403 | Seller verification required | Complete seller verification |

### Validation Errors (VALIDATION_*)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `VALIDATION_ERROR` | 400 | Request validation failed | Check `details` for specific fields |
| `VALIDATION_REQUIRED_FIELD` | 400 | Required field missing | Provide all required fields |
| `VALIDATION_TYPE_ERROR` | 400 | Field type mismatch | Check field types |
| `VALIDATION_FORMAT_ERROR` | 400 | Invalid field format | Check format requirements |
| `VALIDATION_RANGE_ERROR` | 400 | Value out of allowed range | Adjust value to valid range |
| `VALIDATION_ENUM_ERROR` | 400 | Value not in allowed enum | Use allowed enum value |

### Rate Limiting Errors (RATE_*)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait before retrying; check headers |
| `RATE_LIMIT_API_KEY` | 429 | API key rate limit exceeded | Upgrade plan or optimize requests |
| `RATE_LIMIT_IP` | 429 | IP address rate limited | Wait before retrying |

### Database Errors (DB_*)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `DB_CONNECTION_ERROR` | 503 | Database unavailable | Retry later |
| `DB_QUERY_ERROR` | 500 | Database query failed | Contact support |
| `DB_CONSTRAINT_VIOLATION` | 409 | Database constraint violated | Check data for conflicts |
| `DB_TRANSACTION_ERROR` | 500 | Transaction failed | Retry operation |

### Integration Errors (INTEGRATION_*)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `INTEGRATION_NOT_FOUND` | 404 | Integration not found | Verify integration ID |
| `INTEGRATION_ALREADY_EXISTS` | 409 | Integration already exists | Use existing integration |
| `INTEGRATION_KEY_INVALID` | 400 | Invalid API key format | Check API key format |
| `INTEGRATION_DISABLED` | 403 | Integration is disabled | Enable integration |

### Webhook Errors (WEBHOOK_*)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `WEBHOOK_SIGNATURE_INVALID` | 400 | Webhook signature verification failed | Check webhook secret |
| `WEBHOOK_PAYLOAD_INVALID` | 400 | Invalid webhook payload | Check payload format |
| `WEBHOOK_EVENT_UNKNOWN` | 400 | Unknown webhook event type | Verify event type |
| `WEBHOOK_PROCESSING_FAILED` | 500 | Failed to process webhook | Will be retried |

### Operation Errors (OPERATION_*)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `OPERATION_IN_PROGRESS` | 409 | Another operation is running | Wait for current operation |
| `OPERATION_NOT_FOUND` | 404 | Operation not found | Verify operation ID |
| `OPERATION_CANNOT_RESUME` | 400 | Operation cannot be resumed | Start new operation |
| `OPERATION_FAILED` | 500 | Operation failed | Check operation details |

---

## Error Details

For validation errors, the `details` field contains specific field errors:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "capacity",
        "message": "must be a positive integer",
        "value": -100
      },
      {
        "field": "venue_type",
        "message": "must be one of: arena, stadium, theater, club, outdoor, other",
        "value": "invalid"
      }
    ]
  }
}
```

---

## Retry Behavior

| Error Code Pattern | Retry? | Strategy |
|--------------------|--------|----------|
| `AUTH_*` | No | Fix authentication first |
| `VALIDATION_*` | No | Fix request data |
| `*_NOT_FOUND` | No | Resource doesn't exist |
| `RATE_*` | Yes | Exponential backoff |
| `DB_CONNECTION_*` | Yes | Retry with backoff |
| `STRIPE_API_*` | Yes | Retry with backoff |
| `WEBHOOK_*` | Automatic | System handles retries |

---

## Client SDK Error Handling

```typescript
import { VenueClient, VenueError, ErrorCode } from '@tickettoken/venue-sdk';

try {
  const venue = await client.venues.get('invalid-id');
} catch (error) {
  if (error instanceof VenueError) {
    switch (error.code) {
      case ErrorCode.VENUE_NOT_FOUND:
        console.log('Venue does not exist');
        break;
      case ErrorCode.AUTH_TOKEN_EXPIRED:
        await refreshToken();
        // Retry request
        break;
      case ErrorCode.RATE_LIMIT_EXCEEDED:
        const retryAfter = error.headers['retry-after'];
        await sleep(retryAfter * 1000);
        // Retry request
        break;
      default:
        console.error('Unknown error:', error.message);
    }
  }
}
```
