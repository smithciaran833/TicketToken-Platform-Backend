# TicketToken TypeScript SDK

[![npm version](https://img.shields.io/npm/v/@tickettoken/sdk-typescript.svg)](https://www.npmjs.com/package/@tickettoken/sdk-typescript)
[![npm downloads](https://img.shields.io/npm/dm/@tickettoken/sdk-typescript.svg)](https://www.npmjs.com/package/@tickettoken/sdk-typescript)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

Official TypeScript/JavaScript SDK for the TicketToken platform - NFT ticketing and event management.

## ✨ Features

- 🎫 **Complete Ticketing API** - Events, tickets, orders, payments
- 🔐 **Secure Authentication** - JWT, OAuth, wallet connections  
- 🎨 **NFT Operations** - Mint, transfer, marketplace
- 📦 **TypeScript First** - Full type safety
- 🚀 **Production Ready** - Rate limiting, retries, caching
- 🔒 **Security Built-in** - Encryption, signing, HTTPS enforcement
- 📖 **Comprehensive Docs** - API reference, guides, examples

## Installation
```bash
npm install @tickettoken/sdk-typescript
```

## Quick Start
```typescript
import { TicketTokenSDK } from '@tickettoken/sdk-typescript';

// Initialize the SDK
const sdk = new TicketTokenSDK({
  apiKey: 'your-api-key',
  environment: 'production' // or 'staging', 'development'
});

// List events
const events = await sdk.events.list();

// Get a specific event
const event = await sdk.events.get('event-id');

// Purchase tickets
const tickets = await sdk.tickets.purchase({
  eventId: 'event-id',
  ticketType: 'general-admission',
  quantity: 2,
  paymentMethod: 'card'
});
```

## Configuration

### Basic Configuration
```typescript
const sdk = new TicketTokenSDK({
  apiKey: 'your-api-key',
  environment: 'production'
});
```

### Advanced Configuration
```typescript
const sdk = new TicketTokenSDK({
  apiKey: 'your-api-key',
  baseUrl: 'https://custom-api.example.com',  // Custom API URL
  timeout: 30000,                              // Request timeout (ms)
  maxRetries: 3,                               // Max retry attempts
  debug: true,                                 // Enable debug logging
  headers: {                                   // Custom headers
    'X-Custom-Header': 'value'
  }
});
```

## API Reference

### Events
```typescript
// List all events
const events = await sdk.events.list({
  page: 1,
  limit: 10,
  sort: 'startDate',
  order: 'asc'
});

// Get event by ID
const event = await sdk.events.get('event-id');

// Create an event
const newEvent = await sdk.events.create({
  name: 'My Concert',
  description: 'An amazing concert',
  venue: 'Madison Square Garden',
  location: 'New York, NY',
  startDate: '2024-12-31T20:00:00Z',
  endDate: '2024-12-31T23:00:00Z',
  capacity: 1000,
  ticketTypes: [
    {
      name: 'General Admission',
      price: 50,
      currency: 'USD',
      quantity: 500
    }
  ]
});

// Update an event
const updatedEvent = await sdk.events.update('event-id', {
  name: 'Updated Concert Name'
});

// Publish an event
await sdk.events.publish('event-id');

// Cancel an event
await sdk.events.cancel('event-id', 'Reason for cancellation');

// Search events
const searchResults = await sdk.events.search({
  query: 'concert',
  location: 'New York',
  startDate: '2024-01-01',
  endDate: '2024-12-31'
});
```

### Tickets
```typescript
// Purchase tickets
const tickets = await sdk.tickets.purchase({
  eventId: 'event-id',
  ticketType: 'general-admission',
  quantity: 2,
  paymentMethod: 'card',
  metadata: {
    customField: 'value'
  }
});

// Get ticket by ID
const ticket = await sdk.tickets.get('ticket-id');

// Transfer ticket
const transferredTicket = await sdk.tickets.transfer({
  ticketId: 'ticket-id',
  recipientAddress: 'recipient-wallet-address'
});

// Validate ticket
const validation = await sdk.tickets.validate('ticket-id');
if (validation.valid) {
  console.log('Ticket is valid');
}

// Use/redeem ticket
await sdk.tickets.use('ticket-id');

// Get user's tickets
const myTickets = await sdk.tickets.getMyTickets();

// Get tickets for an event
const eventTickets = await sdk.tickets.getByEvent('event-id');
```

### Users
```typescript
// Get current user
const currentUser = await sdk.users.me();

// Update current user
const updatedUser = await sdk.users.update({
  name: 'New Name',
  walletAddress: 'new-wallet-address'
});

// Get user by ID (admin only)
const user = await sdk.users.get('user-id');

// List users (admin only)
const users = await sdk.users.list();
```

## Advanced Features

### Automatic Pagination
```typescript
import { paginate } from '@tickettoken/sdk-typescript';

// Automatically iterate through all pages
for await (const event of paginate(() => sdk.events.list())) {
  console.log(event.name);
}
```

### Automatic Retries
```typescript
import { retryWithBackoff } from '@tickettoken/sdk-typescript';

// Wrap any function with retry logic
const result = await retryWithBackoff(
  () => sdk.events.get('event-id'),
  { maxRetries: 3, initialDelay: 1000 }
);
```

### Caching
```typescript
import { MemoryCache, memoize } from '@tickettoken/sdk-typescript';

// Create cache instance
const cache = new MemoryCache({ ttl: 60000 }); // 1 minute TTL

// Memoize expensive function calls
const getCachedEvent = memoize(
  (id: string) => sdk.events.get(id),
  { cache, ttl: 300000 } // 5 minutes
);
```

### Webhook Verification
```typescript
import { verifyWebhook } from '@tickettoken/sdk-typescript';

// In your webhook handler
app.post('/webhooks/tickettoken', (req, res) => {
  const signature = req.headers['x-tickettoken-signature'];
  const timestamp = req.headers['x-tickettoken-timestamp'];
  
  try {
    const event = verifyWebhook(
      req.body,
      signature,
      { secret: process.env.WEBHOOK_SECRET, tolerance: 300 },
      timestamp
    );
    
    // Handle verified webhook
    console.log('Event:', event.type);
    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(400);
  }
});
```

### Rate Limiting
```typescript
import { RateLimiter } from '@tickettoken/sdk-typescript';

const limiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000 // 100 requests per minute
});

await limiter.checkLimit('user-123');
```

## Error Handling

The SDK provides typed error classes for different scenarios:
```typescript
import {
  TicketTokenSDK,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  RateLimitError
} from '@tickettoken/sdk-typescript';

try {
  const event = await sdk.events.get('non-existent-id');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Event not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Invalid API key');
  } else if (error instanceof RateLimitError) {
    console.log('Rate limit exceeded');
  } else {
    console.log('Unknown error:', error.message);
  }
}
```

Available error types:
- `AuthenticationError` - Invalid API key
- `AuthorizationError` - Insufficient permissions
- `NotFoundError` - Resource not found
- `ValidationError` - Invalid request data
- `RateLimitError` - Rate limit exceeded
- `ServerError` - Server error (5xx)
- `NetworkError` - Network connection failed
- `TimeoutError` - Request timeout
- `ConfigurationError` - Invalid SDK configuration

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:
```typescript
import { Event, Ticket, User } from '@tickettoken/sdk-typescript';

const event: Event = await sdk.events.get('event-id');
const tickets: Ticket[] = await sdk.tickets.purchase({...});
const user: User = await sdk.users.me();
```

## Security

See [SECURITY.md](./SECURITY.md) for our security policy and best practices.

Key security features:
- 🔐 Secure token storage (memory, encrypted localStorage, cookies)
- 🔒 AES-256-GCM encryption
- ✅ HTTPS enforcement in production
- 🔑 Request signing with HMAC-SHA256
- 🛡️ Automatic sensitive data masking
- ⚡ Rate limiting and replay protection

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- iOS Safari: iOS 14+
- Android Chrome: Latest version

## Node.js Support

- Node.js 18.x or higher
- npm 9.x or higher

## Contributing

We welcome contributions! Please see our contributing guidelines.

## Support

- 📧 Email: support@tickettoken.com
- 💬 Discord: [Join our Discord](#)
- 📖 Documentation: https://docs.tickettoken.com
- 🐛 Issues: https://github.com/tickettoken/sdk-typescript/issues

## License

MIT © TicketToken Team

---

Made with ❤️ by the TicketToken team
