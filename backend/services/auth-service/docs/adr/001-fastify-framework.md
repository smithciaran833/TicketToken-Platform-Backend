# ADR-001: Use Fastify as HTTP Framework

## Status
Accepted

## Context
We needed to choose an HTTP framework for the auth-service that provides:
- High performance for authentication operations
- Strong TypeScript support
- Plugin ecosystem for security, rate limiting, and validation
- Schema validation for requests/responses

## Decision
Use Fastify as the HTTP framework instead of Express.

## Consequences

### Positive
- ~2-3x faster than Express in benchmarks
- First-class TypeScript support
- Built-in schema validation with JSON Schema
- Excellent plugin ecosystem (@fastify/rate-limit, @fastify/helmet, etc.)
- Request/reply hooks for middleware patterns
- Automatic OpenAPI/Swagger generation

### Negative
- Smaller community than Express
- Some team members may need to learn Fastify patterns
- Fewer third-party middleware options

### Neutral
- Similar middleware pattern to Express (plugins vs middleware)
- Migration from Express is straightforward
