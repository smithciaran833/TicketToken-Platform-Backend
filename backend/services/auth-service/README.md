# TicketToken Auth Service

Production-ready authentication and authorization service for the TicketToken NFT ticketing platform.

## Features

- **JWT Authentication**: Separate access/refresh tokens with rotation detection
- **Multi-Factor Authentication**: TOTP-based MFA with backup codes
- **Role-Based Access Control**: Venue-scoped permissions
- **Progressive Account Lockout**: Protects against brute force attacks
- **Secure Password Storage**: Argon2id hashing
- **Session Management**: Redis-based session storage
- **Audit Logging**: Comprehensive security event logging

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 14
- Redis >= 6.0
- npm or yarn

## Installation

1. Clone the repository
2. Install dependencies: npm install
3. Copy environment variables: cp .env.example .env
4. Update .env with your configuration
5. Run database migrations: npm run migrate

## Development

- Start development server: npm run dev
- Run tests: npm test
- Run tests in watch mode: npm run test:watch
- Run linter: npm run lint
- Type checking: npm run typecheck

## Production

- Build for production: npm run build
- Start production server: npm start

## License

Proprietary - TicketToken Platform
