# TicketToken SDK Monorepo

[![CI/CD](https://github.com/tickettoken/sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/tickettoken/sdk/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/tickettoken/sdk/branch/main/graph/badge.svg)](https://codecov.io/gh/tickettoken/sdk)
[![npm version](https://badge.fury.io/js/%40tickettoken%2Fsdk.svg)](https://www.npmjs.com/package/@tickettoken/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Official SDK packages for the TicketToken platform. Build powerful ticketing applications with blockchain integration, NFT minting, and real-time analytics.

## 📦 Packages

| Package | Version | Description |
|---------|---------|-------------|
| [@tickettoken/sdk](./sdk-typescript) | ![npm](https://img.shields.io/npm/v/@tickettoken/sdk) | TypeScript/JavaScript SDK |
| [@tickettoken/sdk-javascript](./sdk-javascript) | ![npm](https://img.shields.io/npm/v/@tickettoken/sdk-javascript) | Vanilla JavaScript SDK |
| [@tickettoken/sdk-react](./sdk-react) | ![npm](https://img.shields.io/npm/v/@tickettoken/sdk-react) | React hooks & components |
| [@tickettoken/sdk-test-utils](./sdk-test-utils) | ![npm](https://img.shields.io/npm/v/@tickettoken/sdk-test-utils) | Testing utilities |

## 🚀 Quick Start

### Installation

```bash
# TypeScript/JavaScript
npm install @tickettoken/sdk

# React
npm install @tickettoken/sdk-react

# Vanilla JavaScript (CDN)
<script src="https://cdn.jsdelivr.net/npm/@tickettoken/sdk-javascript/dist/index.min.js"></script>
```

### Usage

**TypeScript/JavaScript**
```typescript
import { TicketTokenSDK } from '@tickettoken/sdk';

const sdk = new TicketTokenSDK({
  apiKey: 'your-api-key',
  environment: 'production'
});

// Fetch events
const events = await sdk.events.list();

// Purchase ticket
const ticket = await sdk.tickets.purchase({
  eventId: 'event-123',
  quantity: 2
});
```

**React**
```tsx
import { SDKProvider, useAuth, useEvents } from '@tickettoken/sdk-react';

function App() {
  return (
    <SDKProvider apiKey="your-api-key">
      <EventList />
    </SDKProvider>
  );
}

function EventList() {
  const { data: events, isLoading } = useEvents();
  const { user, login } = useAuth();
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <div>
      {events.map(event => (
        <div key={event.id}>{event.name}</div>
      ))}
    </div>
  );
}
```

## 📖 Documentation

- **[Getting Started Guide](https://docs.tickettoken.bot/sdks/getting-started)**
- **[API Reference](https://docs.tickettoken.bot/sdks/api)**
- **[Examples](./examples)**
- **[Migration Guides](https://docs.tickettoken.bot/sdks/migrations)**

## 🛠️ Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Setup

```bash
# Clone the repository
git clone https://github.com/tickettoken/sdk.git
cd sdk/packages

# Install dependencies
npm ci

# Build all packages
npm run build

# Run tests
npm test

# Run linter
npm run lint
```

### Project Structure

```
packages/
├── sdk-typescript/       # TypeScript SDK (main package)
├── sdk-javascript/       # Vanilla JavaScript SDK
├── sdk-react/           # React hooks & components
├── sdk-test-utils/      # Testing utilities
├── shared/              # Shared utilities
└── docs/                # Documentation site
```

### Contributing

We welcome contributions! Please read our [Contributing Guide](./CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm test -- --watch
```

## 🔐 Security

- All API calls use HTTPS
- Automatic token refresh
- Secure token storage
- XSS & CSRF protection built-in

Report security vulnerabilities to security@tickettoken.bot

## 📝 License

MIT © TicketToken

## 🤝 Support

- **Documentation**: https://docs.tickettoken.bot
- **Discord**: https://discord.gg/tickettoken
- **Email**: support@tickettoken.bot
- **Issues**: https://github.com/tickettoken/sdk/issues

## 🗺️ Roadmap

- [x] TypeScript SDK with type safety
- [x] React hooks and components
- [x] Vanilla JavaScript SDK
- [ ] Vue.js SDK
- [ ] React Native SDK
- [ ] Angular SDK
- [ ] GraphQL support
- [ ] WebSocket real-time updates

## 📊 Status

- **Build**: ![CI](https://github.com/tickettoken/sdk/workflows/CI/badge.svg)
- **Coverage**: ![codecov](https://codecov.io/gh/tickettoken/sdk/branch/main/graph/badge.svg)
- **Bundle Size**: ![size](https://img.shields.io/bundlephobia/minzip/@tickettoken/sdk)
