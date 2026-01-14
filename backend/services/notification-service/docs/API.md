# Notification Service API Documentation

**Version:** 1.0.0  
**Base URL:** `/api`

## Overview

The Notification Service handles multi-channel notifications (email, SMS, push) for the TicketToken platform. It integrates with SendGrid, Twilio, and AWS SES for delivery, and uses RabbitMQ for event-driven processing.

## Authentication

All API endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

Internal service-to-service calls use the `x-internal-auth` header with a shared secret.

## Endpoints

### Notifications

#### Send Notification

```http
POST /api/notifications
```

Send a notification to one or more recipients.

**Request Body:**

```json
{
  "type": "email",
  "template": "purchase_confirmation",
  "recipients": [
    {
      "userId": "uuid",
      "email": "user@example.com",
      "phone": "+1234567890"
    }
  ],
  "data": {
    "orderId": "order_123",
    "eventName": "Concert 2024",
    "ticketCount": 2
  },
  "options": {
    "priority": "high",
    "scheduledFor": "2024-01-15T10:00:00Z"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "notificationId": "uuid",
    "status": "queued",
    "scheduledFor": "2024-01-15T10:00:00Z"
  }
}
```

#### Get Notification Status

```http
GET /api/notifications/:id
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "email",
    "status": "delivered",
    "createdAt": "2024-01-15T09:00:00Z",
    "deliveredAt": "2024-01-15T09:00:05Z",
    "recipient": {
      "email": "us***@example.com"
    }
  }
}
```

#### List Notifications

```http
GET /api/notifications
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Items per page (default: 20, max: 100) |
| `status` | string | Filter by status: queued, sent, delivered, failed |
| `type` | string | Filter by type: email, sms, push |
| `userId` | string | Filter by recipient user ID |

**Response:**

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
```

### Preferences

#### Get User Preferences

```http
GET /api/preferences
```

Returns the authenticated user's notification preferences.

**Response:**

```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "email": {
      "enabled": true,
      "marketing": false,
      "transactional": true,
      "frequency": "immediate"
    },
    "sms": {
      "enabled": true,
      "marketing": false,
      "transactional": true
    },
    "push": {
      "enabled": true,
      "marketing": true
    }
  }
}
```

#### Update Preferences

```http
PUT /api/preferences
```

**Request Body:**

```json
{
  "email": {
    "marketing": true,
    "frequency": "daily"
  },
  "sms": {
    "enabled": false
  }
}
```

### Consent

#### Record Consent

```http
POST /api/consent
```

**Request Body:**

```json
{
  "channel": "email",
  "purpose": "marketing",
  "granted": true,
  "source": "web_signup"
}
```

#### Get Consent History

```http
GET /api/consent/history
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "channel": "email",
      "purpose": "marketing",
      "granted": true,
      "source": "web_signup",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Marketing

#### Create Campaign

```http
POST /api/marketing/campaigns
```

**Request Body:**

```json
{
  "name": "Summer Sale 2024",
  "template": "summer_promo",
  "segmentId": "uuid",
  "scheduledFor": "2024-06-01T09:00:00Z",
  "channels": ["email", "push"]
}
```

#### Send Campaign

```http
POST /api/marketing/campaigns/:id/send
```

#### Get Campaign Analytics

```http
GET /api/marketing/campaigns/:id/analytics
```

**Response:**

```json
{
  "success": true,
  "data": {
    "campaignId": "uuid",
    "totalSent": 10000,
    "delivered": 9800,
    "opened": 3500,
    "clicked": 500,
    "unsubscribed": 10,
    "openRate": 0.357,
    "clickRate": 0.051
  }
}
```

### GDPR

#### Export User Data

```http
POST /api/gdpr/export
```

Initiates a data export for the authenticated user.

**Response:**

```json
{
  "success": true,
  "data": {
    "exportId": "uuid",
    "status": "processing",
    "estimatedCompletionTime": "2024-01-15T10:00:00Z"
  }
}
```

#### Delete User Data

```http
POST /api/gdpr/delete
```

Initiates a data deletion request (right to be forgotten).

**Response:**

```json
{
  "success": true,
  "data": {
    "requestId": "uuid",
    "status": "pending",
    "message": "Your data deletion request has been received and will be processed within 30 days."
  }
}
```

### Webhooks

#### SendGrid Webhook

```http
POST /webhooks/sendgrid
```

Handles SendGrid delivery webhooks.

**Headers:**
- `X-Twilio-Email-Event-Webhook-Signature`: Webhook signature

#### Twilio Webhook

```http
POST /webhooks/twilio
```

Handles Twilio SMS status webhooks.

**Headers:**
- `X-Twilio-Signature`: Webhook signature

### Health Checks

#### Liveness Probe

```http
GET /health/live
```

Basic service liveness check.

**Response:**

```json
{
  "status": "ok"
}
```

#### Readiness Probe

```http
GET /health/ready
```

Full dependency check.

**Response:**

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "rabbitmq": "ok",
    "mongodb": "ok"
  }
}
```

#### Startup Probe

```http
GET /health/startup
```

Kubernetes startup probe.

## Error Responses

All errors follow RFC 7807 format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email address format",
    "details": {
      "field": "recipients[0].email",
      "constraint": "email"
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (duplicate) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

## Rate Limiting

API endpoints are rate limited:

- **Authenticated users:** 100 requests/minute
- **Webhook endpoints:** 1000 requests/minute
- **Marketing campaigns:** 10 campaigns/hour per tenant

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

## Pagination

List endpoints support cursor-based pagination:

```
GET /api/notifications?page=2&pageSize=50
```

Response includes meta:

```json
{
  "meta": {
    "page": 2,
    "pageSize": 50,
    "total": 500
  }
}
```

## Webhooks

### Configuring Webhooks

Configure your webhook endpoints in the provider dashboards:

**SendGrid:**
- Event Notification URL: `https://your-domain/webhooks/sendgrid`
- Enable events: delivered, bounced, opened, clicked, spam_report

**Twilio:**
- Status Callback URL: `https://your-domain/webhooks/twilio`
- Events: delivered, failed, undelivered

### Security

All webhook endpoints verify signatures to prevent spoofing:
- SendGrid: ECDSA signature verification
- Twilio: HMAC-SHA1 signature verification

### Idempotency

Webhook events are deduplicated using a 24-hour window. Duplicate events are acknowledged but not reprocessed.
