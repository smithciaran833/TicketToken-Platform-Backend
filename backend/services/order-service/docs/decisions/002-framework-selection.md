# ADR 002: Framework Selection

## Status
Accepted

## Context
The order-service requires a web framework that can handle high-throughput order processing with low latency. Key requirements:
- High performance for API requests
- Strong TypeScript support
- Built-in validation capabilities
- Plugin architecture for extensibility
- Active community and long-term support

## Decision
We chose **Fastify** as the web framework for the order-service.

### Reasons:
1. **Performance**: Fastify is one of the fastest Node.js web frameworks
2. **TypeScript Support**: First-class TypeScript support with excellent type definitions
3. **Schema Validation**: Built-in JSON Schema validation with AJV
4. **Plugin System**: Encapsulated plugin architecture for modular code
5. **Logging**: Integrated with Pino for high-performance logging
6. **Ecosystem**: Rich ecosystem of official and community plugins

## Alternatives Considered

### Express.js
- Pros: Most popular, huge ecosystem, familiar to developers
- Cons: Slower performance, callback-based, weaker TypeScript support

### NestJS
- Pros: Full-featured framework, decorators, dependency injection
- Cons: Heavier runtime overhead, steeper learning curve, more opinionated

### Koa.js
- Pros: Modern async/await, lightweight, middleware-based
- Cons: Smaller ecosystem, less built-in functionality

### Hono
- Pros: Extremely fast, multi-runtime support
- Cons: Newer framework, smaller ecosystem

## Consequences

### Positive
- Excellent performance for high-throughput scenarios
- Type-safe request/response handling
- Built-in request validation reduces boilerplate
- Modular architecture with plugins
- Fast startup times

### Negative
- Smaller community compared to Express
- Some middleware needs adaptation from Express patterns
- Plugin registration order matters

## Implementation Notes
- Use `@fastify/jwt` for JWT authentication
- Use `@fastify/helmet` for security headers
- Use `@fastify/rate-limit` for rate limiting
- Use `@fastify/cors` for CORS handling
- Register plugins in correct order (security before routes)

## References
- [Fastify Documentation](https://www.fastify.io/docs/latest/)
- [Fastify TypeScript Guide](https://www.fastify.io/docs/latest/Reference/TypeScript/)
- [Fastify Benchmarks](https://www.fastify.io/benchmarks/)
