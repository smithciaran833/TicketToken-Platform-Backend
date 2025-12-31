# Network Diagram - Venue Service

## Network Topology

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   PUBLIC INTERNET                                       │
│                                                                                         │
│    ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐                 │
│    │  Fans    │      │ Venues   │      │ Artists  │      │ Admins   │                 │
│    │ (Users)  │      │ (Owners) │      │          │      │          │                 │
│    └────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘                 │
│         │                 │                 │                 │                        │
│         └─────────────────┴─────────────────┴─────────────────┘                        │
│                                     │                                                   │
│                                     │ HTTPS (443)                                       │
│                                     ▼                                                   │
└─────────────────────────────────────┬───────────────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────────────────────┐
│                               DMZ / EDGE NETWORK                                        │
│                                                                                         │
│                          ┌────────────────────────┐                                    │
│                          │   Load Balancer (ALB)  │                                    │
│                          │   - SSL Termination    │                                    │
│                          │   - WAF Rules          │                                    │
│                          │   - DDoS Protection    │                                    │
│                          └───────────┬────────────┘                                    │
│                                      │                                                  │
│                                      │ HTTP (80) / HTTPS (443)                         │
│                                      ▼                                                  │
│                          ┌────────────────────────┐                                    │
│                          │   API Gateway (Kong)   │                                    │
│                          │   - Rate Limiting      │                                    │
│                          │   - JWT Validation     │                                    │
│                          │   - Request Routing    │                                    │
│                          │   - API Versioning     │                                    │
│                          └───────────┬────────────┘                                    │
│                                      │                                                  │
└──────────────────────────────────────┼──────────────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────┼──────────────────────────────────────────────────┐
│                           SERVICES NETWORK (Private)                                    │
│                                      │                                                  │
│          ┌───────────────────────────┼───────────────────────────┐                     │
│          │                           │                           │                     │
│          ▼                           ▼                           ▼                     │
│  ┌───────────────┐          ┌───────────────┐          ┌───────────────┐               │
│  │ Auth Service  │          │ VENUE SERVICE │          │ Event Service │               │
│  │   :3001       │◄────────►│    :3004      │◄────────►│    :3002      │               │
│  │               │  mTLS    │               │  mTLS    │               │               │
│  └───────────────┘          └───────┬───────┘          └───────────────┘               │
│                                     │                                                   │
│          ┌──────────────────────────┼──────────────────────────┐                       │
│          │                          │                          │                       │
│          ▼                          ▼                          ▼                       │
│  ┌───────────────┐          ┌───────────────┐          ┌───────────────┐               │
│  │Ticket Service │          │Payment Service│          │Transfer Service│              │
│  │    :3003      │          │    :3005      │          │    :3006       │              │
│  └───────────────┘          └───────────────┘          └───────────────┘               │
│                                                                                         │
│  Service Mesh: Istio / Linkerd (mTLS between all services)                             │
│                                                                                         │
└────────────────────────────────┬────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────────────────┐
│                        DATA NETWORK (Isolated)                                          │
│                                │                                                        │
│      ┌─────────────────────────┼─────────────────────────┐                             │
│      │                         │                         │                             │
│      ▼                         ▼                         ▼                             │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐                       │
│  │   PostgreSQL    │   │     Redis       │   │    MongoDB      │                       │
│  │   (Primary)     │   │    (Cluster)    │   │   (Replica Set) │                       │
│  │   :5432         │   │    :6379        │   │    :27017       │                       │
│  │                 │   │                 │   │                 │                       │
│  │  - TLS enabled  │   │  - TLS enabled  │   │  - TLS enabled  │                       │
│  │  - VPC only     │   │  - VPC only     │   │  - VPC only     │                       │
│  └────────┬────────┘   └─────────────────┘   └─────────────────┘                       │
│           │                                                                             │
│           ▼                                                                             │
│  ┌─────────────────┐                                                                   │
│  │   PostgreSQL    │                                                                   │
│  │   (Replica)     │                                                                   │
│  │   Read-only     │                                                                   │
│  └─────────────────┘                                                                   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         MESSAGING NETWORK                                               │
│                                                                                         │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐                       │
│  │   RabbitMQ      │   │   RabbitMQ      │   │   RabbitMQ      │                       │
│  │   Node 1        │◄─►│   Node 2        │◄─►│   Node 3        │                       │
│  │   :5672         │   │   :5672         │   │   :5672         │                       │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘                       │
│          Cluster (Mirrored Queues)                                                      │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL INTEGRATIONS                                           │
│                                                                                         │
│  ┌───────────────────────────────────────────────────────────────┐                     │
│  │                     Stripe Connect                             │                     │
│  │                                                                │                     │
│  │    Outbound: HTTPS to api.stripe.com                          │                     │
│  │    Inbound:  Webhooks from Stripe IPs                         │                     │
│  │              (verify signature)                                │                     │
│  │                                                                │                     │
│  │    IP Allowlist:                                              │                     │
│  │    - 3.18.12.63                                               │                     │
│  │    - 3.130.192.231                                            │                     │
│  │    - (see Stripe webhook IP list)                             │                     │
│  └───────────────────────────────────────────────────────────────┘                     │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Port Assignments

| Service | Internal Port | External Port | Protocol |
|---------|--------------|---------------|----------|
| API Gateway | 8000 | 443 (via ALB) | HTTPS |
| Venue Service | 3004 | N/A (internal) | HTTP/gRPC |
| Auth Service | 3001 | N/A (internal) | HTTP/gRPC |
| Event Service | 3002 | N/A (internal) | HTTP/gRPC |
| PostgreSQL | 5432 | N/A (VPC only) | TLS |
| Redis | 6379 | N/A (VPC only) | TLS |
| MongoDB | 27017 | N/A (VPC only) | TLS |
| RabbitMQ | 5672/15672 | N/A (VPC only) | AMQPS |
| Prometheus | 9090 | N/A (internal) | HTTP |

## Security Groups

### venue-service-sg
```
Inbound:
- TCP 3004 from api-gateway-sg
- TCP 3004 from service-mesh-sg

Outbound:
- TCP 5432 to database-sg (PostgreSQL)
- TCP 6379 to redis-sg
- TCP 27017 to mongodb-sg
- TCP 5672 to rabbitmq-sg
- TCP 443 to 0.0.0.0/0 (Stripe API)
```

### database-sg
```
Inbound:
- TCP 5432 from venue-service-sg
- TCP 5432 from auth-service-sg
- TCP 5432 from event-service-sg

Outbound:
- None (stateful response only)
```

### redis-sg
```
Inbound:
- TCP 6379 from venue-service-sg
- TCP 6379 from rate-limit-service-sg

Outbound:
- TCP 6379 to redis-sentinel-sg (HA)
```

## Network Policies (Kubernetes)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: venue-service-network-policy
  namespace: tickettoken
spec:
  podSelector:
    matchLabels:
      app: venue-service
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api-gateway
      ports:
        - protocol: TCP
          port: 3004
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgresql
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
    - to:
        - podSelector:
            matchLabels:
              app: mongodb
      ports:
        - protocol: TCP
          port: 27017
    # Stripe API
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - protocol: TCP
          port: 443
```

## TLS/mTLS Configuration

### Internal Services (mTLS)
- All service-to-service communication uses mutual TLS
- Certificates issued by internal PKI (Vault or cert-manager)
- Certificate rotation: Every 24 hours
- Protocol: TLS 1.3 preferred, TLS 1.2 minimum

### Database Connections
- PostgreSQL: `sslmode=verify-full`
- Redis: TLS enabled via `REDIS_TLS_ENABLED=true`
- MongoDB: TLS with certificate validation

### External APIs
- Stripe: HTTPS with system CA bundle
- Webhook verification: Stripe signature validation

## DNS Configuration

```
# Internal DNS (CoreDNS/Route53 Private)
venue-service.tickettoken.svc.cluster.local → 10.0.1.x
postgresql.tickettoken.svc.cluster.local → 10.0.2.x
redis.tickettoken.svc.cluster.local → 10.0.2.x
mongodb.tickettoken.svc.cluster.local → 10.0.2.x

# External DNS
api.tickettoken.com → ALB (public)
```

## Firewall Rules Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRAFFIC FLOW RULES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Internet → ALB           : HTTPS 443 (WAF filtered)            │
│  ALB → API Gateway        : HTTP 8000 (internal)                │
│  API Gateway → Services   : HTTP 3000-3999 (mTLS)               │
│  Services → PostgreSQL    : TCP 5432 (TLS)                      │
│  Services → Redis         : TCP 6379 (TLS)                      │
│  Services → MongoDB       : TCP 27017 (TLS)                     │
│  Services → RabbitMQ      : TCP 5672 (TLS)                      │
│  Services → Stripe        : HTTPS 443 (outbound only)           │
│                                                                  │
│  Stripe → Services        : HTTPS (webhook IPs only)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
