# API Examples

## Authentication
```bash
# Get JWT token (from auth-service)
TOKEN=$(curl -X POST https://auth.tickettoken.com/token \
  -d '{"email": "user@example.com", "password": "..."}' \
  | jq -r '.token')

# Use token in requests
curl -H "Authorization: Bearer $TOKEN" \
  https://api.tickettoken.com/api/v1/tickets
```

## Purchase Flow

### 1. List Available Tickets
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.tickettoken.com/api/v1/events/{eventId}/tickets?status=available"
```

### 2. Create Purchase
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "eventId": "550e8400-e29b-41d4-a716-446655440000",
    "ticketTypeId": "660e8400-e29b-41d4-a716-446655440001",
    "quantity": 2
  }' \
  https://api.tickettoken.com/api/v1/purchase
```

### 3. Confirm Purchase
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"orderId": "order-123", "paymentMethodId": "pm-456"}' \
  https://api.tickettoken.com/api/v1/purchase/confirm
```

## Transfer Ticket
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "ticketId": "ticket-123",
    "recipientEmail": "friend@example.com"
  }' \
  https://api.tickettoken.com/api/v1/transfer
```

## Check Ticket Status
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.tickettoken.com/api/v1/tickets/{ticketId}
```

## Validate QR Code (Scanning)
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"qrData": "encrypted-qr-payload"}' \
  https://api.tickettoken.com/api/v1/validate
```

## Error Handling Example
```javascript
async function purchaseTicket(eventId, ticketTypeId, quantity) {
  try {
    const response = await fetch('/api/v1/purchase', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify({ eventId, ticketTypeId, quantity })
    });

    if (!response.ok) {
      const error = await response.json();
      
      if (error.code === 'RATE_LIMITED') {
        const retryAfter = response.headers.get('Retry-After');
        await sleep(retryAfter * 1000);
        return purchaseTicket(eventId, ticketTypeId, quantity);
      }
      
      throw new Error(error.detail);
    }

    return response.json();
  } catch (err) {
    console.error('Purchase failed:', err);
    throw err;
  }
}
```
