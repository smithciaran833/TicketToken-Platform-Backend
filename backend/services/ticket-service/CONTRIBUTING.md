# Contributing to Ticket Service

Thank you for your interest in contributing to the Ticket Service!

## Development Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- RabbitMQ 3.11+

### Getting Started

```bash
# Clone the repository
git clone https://github.com/tickettoken/ticket-service.git
cd ticket-service

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

## Code Style

### TypeScript Guidelines

1. **Strict Mode**: All TypeScript files use strict mode
2. **Type Safety**: Avoid `any` - use proper types or `unknown`
3. **Interfaces**: Prefer interfaces over type aliases for object shapes
4. **Enums**: Use const enums where possible

### Naming Conventions

- **Files**: kebab-case (`ticket-service.ts`)
- **Classes**: PascalCase (`TicketService`)
- **Functions**: camelCase (`purchaseTicket`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_TICKETS`)
- **Interfaces**: PascalCase with 'I' prefix for services (`ITicketService`)

### Code Organization

```
src/
├── config/          # Configuration
├── middleware/      # Express/Fastify middleware
├── routes/          # API route definitions
├── services/        # Business logic
├── schemas/         # Validation schemas (Zod)
├── migrations/      # Database migrations
├── utils/           # Utility functions
└── index.ts         # Entry point
```

## Pull Request Process

### Before Submitting

1. **Run Tests**: `npm test`
2. **Run Linter**: `npm run lint`
3. **Check Types**: `npm run typecheck`
4. **Run Security Audit**: `npm audit`

### PR Requirements

- [ ] Tests pass
- [ ] Code coverage > 80%
- [ ] No linting errors
- [ ] Types checked
- [ ] Documentation updated
- [ ] CHANGELOG.md updated

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add ticket transfer functionality
fix: resolve race condition in purchase flow
docs: update API documentation
test: add integration tests for transfer
refactor: extract validation logic
chore: update dependencies
```

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
How was this tested?

## Checklist
- [ ] Tests added
- [ ] Documentation updated
- [ ] CHANGELOG updated
```

## Testing

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

### Writing Tests

- **Unit Tests**: Test individual functions/methods
- **Integration Tests**: Test API endpoints
- **E2E Tests**: Test complete user flows

Example:

```typescript
describe('TicketService', () => {
  describe('purchaseTicket', () => {
    it('should create ticket for valid purchase', async () => {
      const result = await ticketService.purchaseTicket({
        eventId: 'event-123',
        quantity: 2,
        userId: 'user-456'
      });
      
      expect(result.tickets).toHaveLength(2);
      expect(result.status).toBe('purchased');
    });
    
    it('should throw on insufficient inventory', async () => {
      await expect(
        ticketService.purchaseTicket({
          eventId: 'event-123',
          quantity: 1000,
          userId: 'user-456'
        })
      ).rejects.toThrow('Insufficient inventory');
    });
  });
});
```

## Security

### Reporting Vulnerabilities

See [SECURITY.md](./SECURITY.md)

### Security Guidelines

1. **Never commit secrets**
2. **Validate all inputs**
3. **Use parameterized queries**
4. **Implement rate limiting**
5. **Log security events**

## Documentation

### Code Documentation

Use JSDoc for public APIs:

```typescript
/**
 * Purchase tickets for an event
 * 
 * @param options - Purchase options
 * @param options.eventId - Target event ID
 * @param options.quantity - Number of tickets
 * @param options.userId - Purchasing user ID
 * @returns Created tickets
 * @throws {ValidationError} If inputs invalid
 * @throws {ConflictError} If insufficient inventory
 */
async purchaseTicket(options: PurchaseOptions): Promise<PurchaseResult> {
  // ...
}
```

### API Documentation

Update `docs/openapi.yaml` for API changes.

## Database Migrations

### Creating Migrations

```bash
npm run migrate:make add_new_column
```

### Migration Guidelines

1. **Idempotent**: Migrations should be safe to run multiple times
2. **Backwards Compatible**: Don't break existing queries
3. **Lock Timeout**: Use `SET lock_timeout = '10s'`
4. **Concurrent Indexes**: Use `CREATE INDEX CONCURRENTLY`

### Example Migration

```typescript
export async function up(knex: Knex): Promise<void> {
  await knex.raw('SET lock_timeout = \'10s\'');
  
  await knex.schema.alterTable('tickets', (table) => {
    table.string('new_column', 255);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tickets', (table) => {
    table.dropColumn('new_column');
  });
}
```

## Getting Help

- **Slack**: #ticket-service
- **Documentation**: See `/docs`
- **Issues**: GitHub Issues

## Code of Conduct

Please read our [Code of Conduct](../../../CODE_OF_CONDUCT.md) before contributing.

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.
