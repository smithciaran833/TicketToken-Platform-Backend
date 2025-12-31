# ADR 001: Use Fastify as Web Framework

## Status

Accepted

## Context

We needed to choose a Node.js web framework for the auth service. Options considered:
- Express.js
- Fastify
- Koa
- Hapi

## Decision

We chose **Fastify** for the following reasons:

1. **Performance**: Fastify is one of the fastest Node.js frameworks
2. **Schema Validation**: Built-in JSON Schema validation
3. **TypeScript Support**: First-class TypeScript support
4. **Plugin System**: Clean plugin architecture for extensibility
5. **Logging**: Built-in Pino logger integration
6. **Active Maintenance**: Well-maintained with regular updates

## Consequences

### Positive
- High performance with low overhead
- Schema-based validation catches errors early
- Excellent developer experience
- Good ecosystem of plugins

### Negative
- Smaller community than Express
- Some Express middleware needs adaptation
- Learning curve for team members familiar with Express

## References

- [Fastify Documentation](https://www.fastify.io/)
- [Fastify Benchmarks](https://www.fastify.io/benchmarks/)
