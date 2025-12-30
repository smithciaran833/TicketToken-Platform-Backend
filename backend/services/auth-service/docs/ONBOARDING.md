# Developer Onboarding

## Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Git
- Access to 1Password/secrets vault

## Quick Start
```bash
# Clone repo
git clone <repo-url>
cd backend/services/auth-service

# Install dependencies
npm install

# Setup local secrets
mkdir -p ~/tickettoken-secrets
openssl genrsa -out ~/tickettoken-secrets/jwt-private.pem 2048
openssl rsa -in ~/tickettoken-secrets/jwt-private.pem -pubout -out ~/tickettoken-secrets/jwt-public.pem

# Start dependencies
docker-compose up -d postgres redis

# Run migrations
npm run migrate

# Start dev server
npm run dev
```

## Environment Setup
Copy `.env.example` to `.env` and configure:
- DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
- REDIS_HOST
- ENCRYPTION_KEY (32+ chars)

## Testing
```bash
npm test              # Run all tests
npm run test:coverage # With coverage
npm run test:watch    # Watch mode
```

## Key Files
- `src/index.ts` - Entry point
- `src/app.ts` - Fastify app setup
- `src/routes/` - Route definitions
- `src/services/` - Business logic
- `src/config/` - Configuration

## Getting Help
- Slack: #auth-service
- Wiki: [internal wiki link]
- Team lead: [name]
