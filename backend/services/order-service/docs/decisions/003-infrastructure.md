# ADR 003: Infrastructure Decisions

## Status
Accepted

## Date
2024-12-28

## Context
The order-service requires reliable, scalable infrastructure to handle:
- High-volume order processing
- Real-time payment coordination
- Event-driven communication with other services
- Caching for performance
- Data persistence with ACID guarantees

## Decisions

### 1. Container Runtime: Docker
**Choice:** Docker containers orchestrated by Kubernetes

**Rationale:**
- Consistent environments across dev/staging/production
- Easy horizontal scaling
- Resource isolation between services
- Industry standard with broad tooling support

### 2. Container Orchestration: Kubernetes
**Choice:** Kubernetes (EKS/GKE/AKS depending on cloud provider)

**Rationale:**
- Auto-scaling based on load
- Self-healing (automatic container restart)
- Rolling deployments with zero downtime
- Service discovery and load balancing
- Secret management integration

### 3. Message Queue: RabbitMQ
**Choice:** RabbitMQ with topic exchanges

**Rationale:**
- Reliable message delivery with acknowledgments
- Dead letter queues for failed message handling
- Topic-based routing for event-driven architecture
- Battle-tested in high-throughput scenarios
- Supports multiple consumers per queue

**Alternatives Considered:**
- Kafka: More complex, better for event sourcing (not needed here)
- Redis Streams: Less feature-rich for complex routing
- AWS SQS: Vendor lock-in

### 4. Caching: Redis
**Choice:** Redis (cluster mode for production)

**Rationale:**
- Sub-millisecond latency
- Rich data structures (strings, hashes, sets, sorted sets)
- Built-in TTL for cache expiration
- Pub/sub for real-time features
- Idempotency key storage
- Session and rate limit storage

### 5. Database: PostgreSQL
**Choice:** PostgreSQL 15+ (see ADR-001 for details)

**Rationale:**
- ACID compliance for financial transactions
- Row-level security for multi-tenancy
- JSONB for flexible metadata storage
- Excellent performance with proper indexing
- Strong ecosystem and tooling

### 6. Service Communication
**Choice:** REST over HTTPS for synchronous, RabbitMQ for async

**Rationale:**
- REST: Simple, well-understood, good for request/response
- HTTPS: Encryption in transit
- RabbitMQ: Decoupled, reliable async processing
- HMAC signatures: Service-to-service authentication

### 7. Logging: Pino + ELK Stack
**Choice:** Pino logger shipping to Elasticsearch

**Rationale:**
- Pino: Fastest Node.js logger
- Structured JSON logs
- Centralized log aggregation
- Full-text search and analytics
- Kibana dashboards

### 8. Monitoring: Prometheus + Grafana
**Choice:** Prometheus metrics with Grafana dashboards

**Rationale:**
- Industry standard for Kubernetes
- Pull-based model scales well
- Rich query language (PromQL)
- Alerting capabilities
- Pre-built dashboards for Node.js

### 9. Secret Management
**Choice:** Kubernetes Secrets + External Secrets Operator

**Rationale:**
- Native Kubernetes integration
- External Secrets syncs from AWS Secrets Manager/HashiCorp Vault
- Automatic rotation support
- Audit trail

## Consequences

### Positive
- Highly available and scalable architecture
- Clear separation of concerns
- Industry-standard tools with good documentation
- Easy to find engineers familiar with stack

### Negative
- Kubernetes complexity requires expertise
- Multiple systems to monitor and maintain
- Cost of running managed services

### Mitigations
- Use managed Kubernetes (EKS/GKE)
- Implement comprehensive monitoring
- Document runbooks for common operations
- Regular team training on infrastructure

## References
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [RabbitMQ Best Practices](https://www.rabbitmq.com/production-checklist.html)
- [Redis Cluster Specification](https://redis.io/docs/reference/cluster-spec/)
- [PostgreSQL High Availability](https://www.postgresql.org/docs/current/high-availability.html)
