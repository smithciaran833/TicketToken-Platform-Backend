# Contributing to Minting Service

Thank you for your interest in contributing to the minting service! This document provides guidelines and information for contributors.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Code Style](#code-style)
4. [Testing](#testing)
5. [Pull Request Process](#pull-request-process)
6. [Architecture Overview](#architecture-overview)
7. [Glossary](#glossary)

---

## Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- Docker and Docker Compose
- PostgreSQL 14+
- Redis 6+
- Solana CLI tools (optional, for devnet testing)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/tickettoken/platform.git
cd platform/backend/services/minting-service

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start dependencies
docker-compose up -d postgres redis

# Run migrations
npm run migrate

# Start development server
npm run dev
```

---

## Development Setup

### Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `SOLANA_RPC_ENDPOINT` | Solana RPC URL | Yes |
| `MINTING_WALLET_PRIVATE_KEY` | Wallet for transaction fees | Yes (devnet OK for dev) |

### Running Locally

```bash
# Development mode with hot reload
npm run dev

# Build TypeScript
npm run build

# Run compiled code
npm start

# Run with specific config
NODE_ENV=development npm run dev
```

### Docker Development

```bash
# Build image
docker build -t minting-service .

# Run with Docker Compose
docker-compose up minting-service
```

---

## Code Style

### TypeScript Guidelines

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use `const` assertions for literals
- Document public functions with JSDoc

```typescript
// Good
interface MintRequest {
  ticketId: string;
  tenantId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Mint a new compressed NFT for a ticket
 * @param request - The minting request data
 * @returns The minted asset ID and transaction signature
 * @throws {InsufficientBalanceError} If wallet balance is too low
 */
async function mintTicket(request: MintRequest): Promise<MintResult> {
  // implementation
}
```

### File Organization

```
src/
├── config/          # Configuration files
├── errors/          # Custom error classes
├── middleware/      # Express/Fastify middleware
├── models/          # Database models
├── queues/          # Bull queue definitions
├── routes/          # API route handlers
├── services/        # Business logic
├── utils/           # Utility functions
├── workers/         # Background job processors
└── index.ts         # Entry point
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `mint-queue.ts` |
| Classes | PascalCase | `MintingOrchestrator` |
| Functions | camelCase | `processMinJob` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRY_ATTEMPTS` |
| Interfaces | PascalCase with I prefix (optional) | `MintRequest` or `IMintRequest` |

### Logging

Use structured logging:

```typescript
import logger from '../utils/logger';

// Good - structured
logger.info('Mint completed', { 
  ticketId, 
  assetId, 
  durationMs: Date.now() - startTime 
});

// Avoid - unstructured
logger.info(`Mint completed for ${ticketId}`);
```

---

## Testing

### Test Structure

```
tests/
├── unit/           # Unit tests for individual functions
├── integration/    # Tests with real dependencies
├── e2e/            # End-to-end API tests
└── fixtures/       # Test data and mocks
```

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests (requires Docker)
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MintingOrchestrator } from '../src/services/MintingOrchestrator';

describe('MintingOrchestrator', () => {
  let orchestrator: MintingOrchestrator;

  beforeEach(() => {
    orchestrator = new MintingOrchestrator();
  });

  describe('mintCompressedNFT', () => {
    it('should mint successfully with valid data', async () => {
      const result = await orchestrator.mintCompressedNFT({
        ticketId: 'test-123',
        tenantId: 'tenant-456',
        eventId: 'event-789',
      });

      expect(result.assetId).toBeDefined();
      expect(result.signature).toMatch(/^[A-HJ-NP-Za-km-z1-9]+$/);
    });

    it('should throw InsufficientBalanceError when wallet is empty', async () => {
      // ... test implementation
    });
  });
});
```

---

## Pull Request Process

### Before Submitting

1. **Create an issue** for significant changes
2. **Fork the repository** and create a feature branch
3. **Follow code style** guidelines
4. **Add tests** for new functionality
5. **Update documentation** if needed
6. **Run all tests** locally

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Tests pass locally (`npm test`)
- [ ] Lint passes (`npm run lint`)
- [ ] Types check (`npm run typecheck`)
- [ ] Documentation updated
- [ ] CHANGELOG.md updated (if applicable)
- [ ] No secrets or sensitive data committed

### Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
```
feat(queue): add dead letter queue for failed mints
fix(solana): handle blockhash expiry during high load
docs(readme): add deployment instructions
```

### Review Process

1. Submit PR against `main` branch
2. Automated checks run (tests, lint, security scan)
3. Minimum 1 reviewer approval required
4. Reviewer may request changes
5. Once approved, maintainer will merge

---

## Architecture Overview

### C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         TicketToken Platform                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐                │
│  │ Event    │     │ Order    │     │ Ticket   │                │
│  │ Service  │     │ Service  │     │ Service  │                │
│  └────┬─────┘     └────┬─────┘     └────┬─────┘                │
│       │                │                │                       │
│       └────────────────┼────────────────┘                       │
│                        ▼                                        │
│               ┌────────────────┐                                │
│               │   MINTING      │                                │
│               │   SERVICE      │◀───────┐                       │
│               └───────┬────────┘        │                       │
│                       │                 │                       │
│          ┌────────────┼────────────┐    │                       │
│          ▼            ▼            ▼    │                       │
│    ┌──────────┐ ┌──────────┐ ┌──────────┐                      │
│    │PostgreSQL│ │  Redis   │ │ Bull     │                      │
│    │          │ │          │ │ Queue    │                      │
│    └──────────┘ └──────────┘ └──────────┘                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │    External Systems    │
              ├────────────────────────┤
              │  • Solana Blockchain   │
              │  • IPFS (Pinata)       │
              │  • DAS API (Helius)    │
              └────────────────────────┘
```

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Minting Service                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Routes    │───▶│  Services   │───▶│   Queue     │         │
│  │  - /mint    │    │  - Orch     │    │  - Jobs     │         │
│  │  - /health  │    │  - Metadata │    │  - Workers  │         │
│  │  - /admin   │    │  - Balance  │    │  - DLQ      │         │
│  └─────────────┘    └──────┬──────┘    └─────────────┘         │
│                            │                                     │
│                            ▼                                     │
│                    ┌─────────────┐                              │
│                    │   Clients   │                              │
│                    │  - Solana   │                              │
│                    │  - IPFS     │                              │
│                    │  - DAS      │                              │
│                    └─────────────┘                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Glossary

| Term | Definition |
|------|------------|
| **Asset ID** | Unique identifier for a compressed NFT, derived from tree address and leaf index |
| **Bubblegum** | Metaplex program for creating compressed NFTs |
| **cNFT** | Compressed NFT - an NFT stored using state compression for lower costs |
| **Collection** | A group of related NFTs under a single collection address |
| **DAS** | Digital Asset Standard - API for querying compressed NFTs |
| **DLQ** | Dead Letter Queue - stores permanently failed jobs for analysis |
| **Fee Payer** | Wallet that pays transaction fees on Solana |
| **IPFS** | InterPlanetary File System - decentralized storage for metadata |
| **Merkle Tree** | Data structure used to store compressed NFT data on-chain |
| **Metadata** | Off-chain JSON describing NFT attributes and media |
| **Mint** | The process of creating a new NFT on the blockchain |
| **RPC** | Remote Procedure Call - method for interacting with Solana nodes |
| **Tenant** | An organization using the platform (multi-tenant architecture) |
| **Tree Authority** | Account with permission to modify a Merkle tree |

---

## Questions?

- Open an issue on GitHub
- Join our Discord community
- Email: dev@tickettoken.io
