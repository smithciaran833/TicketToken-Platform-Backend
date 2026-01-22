# search-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how search-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Basic JWT authentication (no HMAC for internal services)
**Files Examined:**
- `src/middleware/auth.middleware.ts` - JWT authentication
- `src/middleware/tenant.middleware.ts` - Tenant context validation

### System 1: JWT Authentication (API Routes)

**How it works:**
- Standard JWT verification using jsonwebtoken library
- Uses `JWT_SECRET` from environment (required in production)
- Fallback secret only in development mode
- Extracts userId, venueId, tenant_id, role, permissions from token
- **No algorithm whitelist specified** (gap)

**Code Example:**
```typescript
// From middleware/auth.middleware.ts
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return reply.status(401).send({
        error: 'Authentication required'
      });
    }

    // SECURITY: JWT_SECRET must be set in production
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable is required in production');
      }
      console.warn('WARNING: Using default JWT secret in development mode');
    }

    const decoded = jwt.verify(token, jwtSecret || 'dev-secret-key-change-in-production') as any;

    request.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      tenant_id: decoded.tenant_id || decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({ error: 'Token expired' });
    }
    return reply.status(401).send({ error: 'Invalid token' });
  }
}
```

### Role-Based Authorization

```typescript
// From middleware/auth.middleware.ts
export function authorize(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
}
```

### Tenant Context Middleware

```typescript
// From middleware/auth.middleware.ts
export async function requireTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user?.venueId && !request.user?.tenant_id) {
    return reply.status(403).send({
      error: 'Tenant context required'
    });
  }
}
```

**Standardization Gaps:**
1. No JWT algorithm whitelist to prevent algorithm confusion attacks
2. Fallback secret in development (acceptable for dev only)
3. No HMAC authentication for internal service calls

---

## Category 2: Internal Endpoint Patterns

**Implementation:** No dedicated `/internal/` routes
**Files Examined:**
- `src/config/fastify.ts`
- `src/controllers/` directory

**Findings:**
- search-service does **not expose** any `/internal/` routes
- All routes are public API endpoints requiring JWT authentication
- Data sync happens via RabbitMQ message consumption (not HTTP)

**Public API Routes:**

| Route Prefix | Auth | Description |
|--------------|------|-------------|
| `/health` | None | Health check endpoint |
| `/api/v1/search` | JWT + Tenant | Main search endpoint |
| `/api/v1/search/venues` | JWT + Tenant | Venue-specific search |
| `/api/v1/search/events` | JWT + Tenant | Event-specific search |
| `/api/v1/search/suggest` | JWT + Tenant | Autocomplete suggestions |
| `/api/v1/pro/*` | JWT + Tenant | Professional search features |

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** None - direct database access
**Files Examined:**
- `src/services/sync.service.ts`
- `src/services/event-enrichment.service.ts`
- `src/services/venue-enrichment.service.ts`
- `src/services/ticket-enrichment.service.ts`
- `src/services/content-sync.service.ts`

**Findings:**
- search-service does **not make HTTP calls** to other services
- Uses direct database access for data enrichment:
  - PostgreSQL (Knex) for events, venues, tickets, performers
  - MongoDB for content (event_content, venue_content)
  - Elasticsearch for indexing and search

**Data Sources:**

| Database | Tables/Collections | Purpose |
|----------|-------------------|---------|
| PostgreSQL | `events`, `venues`, `tickets`, `performers`, `event_performers` | Primary entity data |
| MongoDB | `event_content`, `venue_content` | Rich content (images, descriptions) |
| Elasticsearch | `events`, `venues`, `tickets` | Search indices |
| Redis | N/A | Cache and rating service |

**Enrichment Services:**

```typescript
// From services/event-enrichment.service.ts
export class EventEnrichmentService {
  private db: Knex;
  private mongodb: MongoClient;
  private ratingService: RatingService;

  async enrich(eventId: string): Promise<EnrichedEvent> {
    // Get PostgreSQL event data
    const event = await this.db('events')
      .where({ id: eventId })
      .first();

    // Get venue data
    const venue = await this.db('venues')
      .where({ id: event.venue_id })
      .first();

    // Get performers
    const eventPerformers = await this.db('event_performers')
      .join('performers', 'event_performers.performer_id', 'performers.id')
      .where({ 'event_performers.event_id': eventId })
      .select(/* ... */);

    // Get MongoDB content
    const mongoDb = this.mongodb.db();
    const eventContent = await mongoDb
      .collection('event_content')
      .findOne({ eventId });

    // Get ratings from RatingService
    const ratings = await this.ratingService.getRatingSummary('event', eventId);

    // Build enriched document
    return { /* ... */ };
  }
}
```

**Shared Libraries Used:**
- `@tickettoken/shared` - RatingService for MongoDB rating aggregation

---

## Category 4: Message Queues

**Implementation:** RabbitMQ (amqplib)
**Files Examined:**
- `src/config/rabbitmq.ts`
- `src/services/sync.service.ts`

### RabbitMQ Configuration

**Library:** amqplib
**Exchange:** `search.sync` (topic)
**Queue:** `search.sync.queue`

**Code Example:**
```typescript
// From config/rabbitmq.ts
import * as amqp from 'amqplib';

export async function connectRabbitMQ() {
  try {
    connection = await amqp.connect(
      process.env.RABBITMQ_URL || process.env.AMQP_URL || 'amqp://admin:admin@rabbitmq:5672'
    );
    channel = await connection.createChannel();

    // Declare exchange and queue
    await channel.assertExchange('search.sync', 'topic', { durable: true });
    await channel.assertQueue('search.sync.queue', { durable: true });
    await channel.bindQueue('search.sync.queue', 'search.sync', '#');

    // Consume messages
    await channel.consume('search.sync.queue', async (msg) => {
      if (msg) {
        try {
          console.log('Processing message:', msg.content.toString());
          channel.ack(msg);
        } catch (error) {
          console.error('Error processing message:', error);
          channel.nack(msg, false, false);
        }
      }
    });

    console.log('RabbitMQ connected');
  } catch (error) {
    console.error('RabbitMQ connection failed:', error);
    setTimeout(connectRabbitMQ, 5000); // Retry after 5 seconds
  }
}
```

### Message Processing (SyncService)

**Routing Keys Processed:**
| Routing Key Pattern | Action | Description |
|---------------------|--------|-------------|
| `venue.created` | Enrich + Index | New venue created |
| `venue.updated` | Enrich + Update | Venue modified |
| `venue.deleted` | Delete | Venue removed |
| `event.created` | Enrich + Index | New event created |
| `event.updated` | Enrich + Update | Event modified |
| `event.deleted` | Delete | Event removed |
| `ticket.created` | Enrich + Index | New ticket created |
| `ticket.updated` | Enrich + Update | Ticket modified (also re-indexes parent event) |
| `ticket.deleted` | Delete | Ticket removed |

**Code Example:**
```typescript
// From services/sync.service.ts
async processMessage(routingKey: string, content: any, clientId?: string) {
  const [entity, action] = routingKey.split('.');

  switch (entity) {
    case 'venue':
      return await this.syncVenue(action, content, clientId);
    case 'event':
      return await this.syncEvent(action, content, clientId);
    case 'ticket':
      return await this.syncTicket(action, content, clientId);
  }
}

private async syncEvent(action: string, event: any, clientId?: string) {
  let payload = {};

  // For non-delete actions, enrich the event with full data
  if (action !== 'deleted') {
    const enrichedEvent = await this.eventEnrichmentService.enrich(event.id);
    payload = enrichedEvent;
  }

  const operation = {
    entityType: 'event',
    entityId: event.id,
    operation: action === 'deleted' ? 'DELETE' : 'UPDATE',
    payload,
    priority: 9 // High priority for immediate consistency
  };

  const token = await this.consistencyService.indexWithConsistency(operation, clientId);
  return token;
}
```

### Consistency Service

The ConsistencyService provides consistency tokens for search operations:

```typescript
// Consistency tokens allow clients to wait for their changes to be indexed
const token = await consistencyService.indexWithConsistency(operation, clientId);
// Token can be returned to client for read-your-writes consistency
```

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT only | **Gap**: No algorithm whitelist |
| Internal Endpoints | **None** | Data sync via RabbitMQ |
| HTTP Client (Outgoing) | **None** | Direct database access |
| Message Queues | RabbitMQ (amqplib) | Topic exchange for entity sync |

**Key Characteristics:**
- search-service is the **search and indexing hub** for the platform
- Uses Elasticsearch as the primary search engine
- Enriches data from PostgreSQL and MongoDB before indexing
- Receives sync messages via RabbitMQ from other services
- Provides consistency tokens for read-your-writes semantics
- Multi-tenant search with tenant isolation

**Data Flow:**
1. Other services publish entity changes to RabbitMQ (`venue.created`, `event.updated`, etc.)
2. search-service consumes messages from `search.sync.queue`
3. SyncService routes messages to appropriate handler
4. Enrichment services pull full data from PostgreSQL + MongoDB
5. ConsistencyService indexes enriched documents to Elasticsearch
6. Consistency token returned for client-side consistency checks

**Dependencies:**
| Dependency | Purpose |
|------------|---------|
| PostgreSQL | Primary entity data (events, venues, tickets) |
| MongoDB | Rich content (descriptions, images) |
| Elasticsearch | Search indexing and querying |
| Redis | Caching and rating service |
| RabbitMQ | Event-driven data synchronization |

**Standardization Notes:**
- No HTTP client needed - data sync happens via message queue
- Direct database access is acceptable for search indexing scenarios
- JWT authentication should add algorithm whitelist
- No internal endpoints needed - other services publish to RabbitMQ

**Security Features:**
- JWT authentication required for all search endpoints
- Tenant context required for all search operations
- Input sanitization via SearchSanitizer utility
- RLS (Row-Level Security) context set for database queries

