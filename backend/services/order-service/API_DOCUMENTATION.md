# ORDER SERVICE API DOCUMENTATION
**Version:** 1.0.0  
**Base URL:** `https://api.tickettoken.com/orders/v1` (Production)  
**Base URL:** `http://localhost:3004/api/v1` (Development)

---

## Table of Contents
1. [Quick Start](#quick-start)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Idempotency](#idempotency)
5. [Error Handling](#error-handling)
6. [API Endpoints](#api-endpoints)
7. [Common Workflows](#common-workflows)
8. [Code Examples](#code-examples)
9. [Webhooks](#webhooks)

---

## Quick Start

### 1. Get Your API Key
```bash
# Contact support to get your JWT secret for generating tokens
# Or use the authentication service to obtain a token
```

### 2. Make Your First Request
```bash
curl -X GET \
  https://api.tickettoken.com/orders/v1/orders \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### 3. Create an Order
```bash
curl -X POST \
  https://api.tickettoken.com/orders/v1/orders \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId": "550e8400-e29b-41d4-a716-446655440000",
    "items": [
      {
        "ticketTypeId": "660e8400-e29b-41d4-a716-446655440000",
        "ticketPricingId": "770e8400-e29b-41d4-a716-446655440000",
        "quantity": 2
      }
    ],
    "currency": "USD"
  }'
```

---

## Authentication

All API requests require authentication via JWT Bearer tokens.

### Getting a Token
```javascript
// Obtain token from auth service
const response = await fetch('https://api.tickettoken.com/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password'
  })
});
const { token } = await response.json();
```

### Using the Token
```bash
# Include in Authorization header
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Requirements
- **Format:** JWT (JSON Web Token)
- **Expiration:** 24 hours
- **Claims Required:**
  - `userId`: User UUID
  - `tenantId`: Tenant UUID
  - `email`: User email
  - `roles`: Array of roles (e.g., `['user']`, `['admin']`)

---

## Rate Limiting

Rate limits vary by endpoint to balance security and performance.

### Limits by Endpoint
| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /orders` | 10 req | per minute |
| `POST /orders/:id/reserve` | 5 req | per minute |
| `POST /orders/:id/cancel` | 5 req | per minute |
| `POST /orders/:id/refund` | 3 req | per minute |
| `GET /orders/*` | 100 req | per minute |

### Rate Limit Headers
```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1637612400
```

### Exceeding Limits
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 45 seconds.",
    "retryAfter": 45
  }
}
```

---

## Idempotency

Prevent duplicate operations by using idempotency keys.

### How It Works
```bash
curl -X POST https://api.tickettoken.com/orders/v1/orders \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Idempotency-Key: unique-key-12345' \
  -H 'Content-Type: application/json' \
  -d '{"eventId": "...", "items": [...]}'
```

### Rules
- **Key Format:** Any string up to 255 characters
- **Storage Duration:** 30 minutes
- **Supported Operations:**
  - `POST /orders` (Create order)
  - `POST /orders/:id/reserve`
  - `POST /orders/:id/cancel`
  - `POST /orders/:id/refund`

### Idempotent Response
If you send the same key twice:
```json
{
  "id": "order-123",
  "status": "PENDING",
  "idempotent": true,
  "originalRequestTime": "2025-11-22T23:30:00Z"
}
```

---

## Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid order data",
    "details": [
      {
        "field": "items[0].quantity",
        "message": "Quantity must be between 1 and 10"
      }
    ],
    "requestId": "req_abc123",
    "timestamp": "2025-11-22T23:30:00Z"
  }
}
```

### HTTP Status Codes
| Code | Meaning | Action |
|------|---------|--------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created |
| 400 | Bad Request | Fix request data |
| 401 | Unauthorized | Check authentication |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Check resource ID |
| 409 | Conflict | Resolve conflict |
| 422 | Unprocessable | Fix validation errors |
| 429 | Too Many Requests | Slow down requests |
| 500 | Server Error | Retry or contact support |
| 503 | Service Unavailable | Retry with backoff |

### Common Error Codes
```typescript
// Validation Errors
VALIDATION_ERROR           // Invalid request data
INVALID_QUANTITY          // Quantity out of range
INVALID_CURRENCY          // Unsupported currency
ORDER_VALUE_TOO_HIGH      // Exceeds $100M limit

// Resource Errors
ORDER_NOT_FOUND           // Order doesn't exist
EVENT_NOT_FOUND           // Event doesn't exist
TICKET_NOT_AVAILABLE      // Tickets sold out

// Business Logic Errors
TICKETS_SOLD_OUT          // No tickets available
RESERVATION_EXPIRED       // Reservation timed out
ORDER_ALREADY_CONFIRMED   // Cannot modify confirmed order
CANNOT_CANCEL_ORDER       // Cancellation not allowed

// Authorization Errors
UNAUTHORIZED              // Invalid or missing token
FORBIDDEN                 // Insufficient permissions
TENANT_MISMATCH          // Wrong tenant

// System Errors
RATE_LIMIT_EXCEEDED       // Too many requests
SERVICE_UNAVAILABLE       // Downstream service down
IDEMPOTENCY_CONFLICT      // Key reused with different data
```

---

## API Endpoints

### Public Endpoints

#### 1. Create Order
```http
POST /api/v1/orders
```

**Request:**
```json
{
  "eventId": "uuid",
  "items": [
    {
      "ticketTypeId": "uuid",
      "ticketPricingId": "uuid",
      "quantity": 2
    }
  ],
  "currency": "USD",
  "metadata": {
    "giftMessage": "Happy Birthday!",
    "source": "mobile_app"
  }
}
```

**Response (201):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "orderNumber": "ORD-20251122-ABC123",
  "userId": "user-uuid",
  "eventId": "event-uuid",
  "status": "PENDING",
  "items": [
    {
      "id": "item-uuid",
      "ticketTypeId": "ticket-type-uuid",
      "ticketPricingId": "pricing-uuid",
      "quantity": 2,
      "unitPriceCents": 10000,
      "subtotalCents": 20000
    }
  ],
  "pricing": {
    "subtotalCents": 20000,
    "platformFeeCents": 1000,
    "processingFeeCents": 609,
    "taxCents": 1728,
    "totalCents": 23337
  },
  "currency": "USD",
  "paymentIntentId": "pi_abc123",
  "reservationExpiresAt": "2025-11-22T23:45:00Z",
  "createdAt": "2025-11-22T23:30:00Z",
  "updatedAt": "2025-11-22T23:30:00Z"
}
```

---

#### 2. Get Order
```http
GET /api/v1/orders/:orderId
```

**Response (200):**
```json
{
  "id": "order-uuid",
  "orderNumber": "ORD-20251122-ABC123",
  "userId": "user-uuid",
  "eventId": "event-uuid",
  "status": "CONFIRMED",
  "items": [...],
  "pricing": {...},
  "paymentIntentId": "pi_abc123",
  "confirmedAt": "2025-11-22T23:35:00Z",
  "createdAt": "2025-11-22T23:30:00Z",
  "updatedAt": "2025-11-22T23:35:00Z"
}
```

---

#### 3. List Orders
```http
GET /api/v1/orders?status=CONFIRMED&limit=20&offset=0
```

**Query Parameters:**
- `status` (optional): Filter by status
- `eventId` (optional): Filter by event
- `limit` (optional): Results per page (1-100, default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response (200):**
```json
{
  "orders": [
    {
      "id": "order-1",
      "orderNumber": "ORD-001",
      "status": "CONFIRMED",
      "totalCents": 23337,
      "currency": "USD",
      "createdAt": "2025-11-22T23:30:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

#### 4. Reserve Order
```http
POST /api/v1/orders/:orderId/reserve
```

**Response (200):**
```json
{
  "orderId": "order-uuid",
  "status": "RESERVED",
  "reservationExpiresAt": "2025-11-22T23:45:00Z",
  "reservedAt": "2025-11-22T23:30:00Z"
}
```

---

#### 5. Cancel Order
```http
POST /api/v1/orders/:orderId/cancel
```

**Request:**
```json
{
  "reason": "User changed mind"
}
```

**Response (200):**
```json
{
  "orderId": "order-uuid",
  "status": "CANCELLED",
  "cancelledAt": "2025-11-22T23:40:00Z",
  "refundStatus": "INITIATED",
  "refundAmount": 20609
}
```

---

#### 6. Request Refund
```http
POST /api/v1/orders/:orderId/refund
```

**Request:**
```json
{
  "reason": "Event cancelled",
  "amount": 20000
}
```

**Response (200):**
```json
{
  "refundId": "refund-uuid",
  "orderId": "order-uuid",
  "amount": 20000,
  "status": "PENDING",
  "reason": "Event cancelled",
  "estimatedArrival": "2025-11-29T23:40:00Z",
  "createdAt": "2025-11-22T23:40:00Z"
}
```

---

#### 7. Get Order Events
```http
GET /api/v1/orders/:orderId/events
```

**Response (200):**
```json
{
  "events": [
    {
      "id": "event-uuid",
      "orderId": "order-uuid",
      "eventType": "ORDER_CREATED",
      "userId": "user-uuid",
      "ipAddress": "192.168.1.1",
      "metadata": {
        "source": "web"
      },
      "createdAt": "2025-11-22T23:30:00Z"
    },
    {
      "id": "event-uuid-2",
      "eventType": "ORDER_CONFIRMED",
      "metadata": {
        "paymentIntentId": "pi_abc123"
      },
      "createdAt": "2025-11-22T23:35:00Z"
    }
  ]
}
```

---

## Common Workflows

### 1. Complete Order Flow

```javascript
// Step 1: Create Order
const createResponse = await fetch('https://api.tickettoken.com/orders/v1/orders', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Idempotency-Key': generateUUID()
  },
  body: JSON.stringify({
    eventId: 'event-123',
    items: [
      { ticketTypeId: 'vip-001', ticketPricingId: 'price-001', quantity: 2 }
    ]
  })
});
const order = await createResponse.json();

// Step 2: Process Payment (via payment-service)
const paymentResponse = await fetch('https://api.tickettoken.com/payments/v1/confirm', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    paymentIntentId: order.paymentIntentId,
    paymentMethodId: 'pm_card_visa'
  })
});

// Step 3: Order is automatically confirmed via webhook
// Check order status
const statusResponse = await fetch(
  `https://api.tickettoken.com/orders/v1/orders/${order.id}`,
  {
    headers: { 'Authorization': 'Bearer ' + token }
  }
);
const updatedOrder = await statusResponse.json();
console.log(updatedOrder.status); // 'CONFIRMED'
```

---

### 2. Reservation Flow

```javascript
// Create order (automatically reserves tickets)
const order = await createOrder({
  eventId: 'event-123',
  items: [{ ticketTypeId: 'ga-001', ticketPricingId: 'price-001', quantity: 4 }]
});

// Extend reservation if needed
const extendResponse = await fetch(
  `https://api.tickettoken.com/orders/v1/orders/${order.id}/reserve`,
  {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }
  }
);
const extended = await extendResponse.json();
console.log('New expiration:', extended.reservationExpiresAt);

// If user doesn't complete payment in time,
// reservation automatically expires after 15 minutes
```

---

### 3. Cancellation Flow

```javascript
// Cancel order
const cancelResponse = await fetch(
  `https://api.tickettoken.com/orders/v1/orders/${orderId}/cancel`,
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reason: 'User requested cancellation'
    })
  }
);
const cancelled = await cancelResponse.json();

// Refund is automatically initiated
console.log('Refund status:', cancelled.refundStatus);
console.log('Refund amount:', cancelled.refundAmount / 100); // Convert cents to dollars
```

---

## Code Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios';

class OrderServiceClient {
  private baseUrl = 'https://api.tickettoken.com/orders/v1';
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async createOrder(data: CreateOrderRequest): Promise<Order> {
    const response = await axios.post(`${this.baseUrl}/orders`, data, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': this.generateIdempotencyKey()
      }
    });
    return response.data;
  }

  async getOrder(orderId: string): Promise<Order> {
    const response = await axios.get(`${this.baseUrl}/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return response.data;
  }

  async cancelOrder(orderId: string, reason: string): Promise<CancelResponse> {
    const response = await axios.post(
      `${this.baseUrl}/orders/${orderId}/cancel`,
      { reason },
      {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  }

  private generateIdempotencyKey(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Usage
const client = new OrderServiceClient('your-jwt-token');
const order = await client.createOrder({
  eventId: 'event-123',
  items: [{ ticketTypeId: 'vip-001', ticketPricingId: 'price-001', quantity: 2 }]
});
console.log('Order created:', order.orderNumber);
```

---

### Python

```python
import requests
import uuid
from typing import Dict, List

class OrderServiceClient:
    def __init__(self, token: str, base_url: str = 'https://api.tickettoken.com/orders/v1'):
        self.token = token
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
    
    def create_order(self, event_id: str, items: List[Dict]) -> Dict:
        """Create a new order"""
        headers = {
            **self.headers,
            'Idempotency-Key': str(uuid.uuid4())
        }
        response = requests.post(
            f'{self.base_url}/orders',
            json={
                'eventId': event_id,
                'items': items
            },
            headers=headers
        )
        response.raise_for_status()
        return response.json()
    
    def get_order(self, order_id: str) -> Dict:
        """Get order details"""
        response = requests.get(
            f'{self.base_url}/orders/{order_id}',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def cancel_order(self, order_id: str, reason: str) -> Dict:
        """Cancel an order"""
        response = requests.post(
            f'{self.base_url}/orders/{order_id}/cancel',
            json={'reason': reason},
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

# Usage
client = OrderServiceClient('your-jwt-token')
order = client.create_order(
    event_id='event-123',
    items=[{
        'ticketTypeId': 'vip-001',
        'ticketPricingId': 'price-001',
        'quantity': 2
    }]
)
print(f'Order created: {order["orderNumber"]}')
```

---

### cURL

```bash
# Create Order
curl -X POST https://api.tickettoken.com/orders/v1/orders \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: unique-key-123' \
  -d '{
    "eventId": "550e8400-e29b-41d4-a716-446655440000",
    "items": [
      {
        "ticketTypeId": "660e8400-e29b-41d4-a716-446655440000",
        "ticketPricingId": "770e8400-e29b-41d4-a716-446655440000",
        "quantity": 2
      }
    ]
  }'

# Get Order
curl -X GET https://api.tickettoken.com/orders/v1/orders/ORDER_ID \
  -H 'Authorization: Bearer YOUR_TOKEN'

# Cancel Order
curl -X POST https://api.tickettoken.com/orders/v1/orders/ORDER_ID/cancel \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"reason": "User requested"}'
```

---

## Webhooks

The Order Service emits events that can be consumed via webhook subscriptions.

### Event Types
- `order.created` - New order created
- `order.reserved` - Tickets reserved
- `order.confirmed` - Payment successful, order confirmed
- `order.cancelled` - Order cancelled
- `order.expired` - Reservation expired
- `order.refunded` - Refund processed

### Webhook Payload
```json
{
  "id": "evt_abc123",
  "type": "order.confirmed",
  "created": 1637612400,
  "data": {
    "object": {
      "id": "order-uuid",
      "orderNumber": "ORD-20251122-ABC123",
      "status": "CONFIRMED",
      "totalCents": 23337,
      "userId": "user-uuid",
      "eventId": "event-uuid"
    }
  }
}
```

### Webhook Verification
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## Support

### Documentation
- Service Documentation: `SERVICE_DOCUMENTATION.md`
- OpenAPI Spec: `openapi.yaml`
- Postman Collection: `postman_collection.json`

### Contact
- **Technical Support:** dev@tickettoken.com
- **Status Page:** https://status.tickettoken.com
- **API Changelog:** https://docs.tickettoken.com/changelog

### Rate Limit Issues
If you need higher rate limits, contact support with:
- Your use case
- Expected request volume
- Current rate limit you're hitting
