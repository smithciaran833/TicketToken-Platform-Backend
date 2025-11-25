# DATABASE AUDIT: event-service
Generated: Thu Oct  2 15:05:54 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^3.1.0",
    "nanoid": "^5.1.5",
    "node-fetch": "^3.3.2",
--
    "pg": "^8.16.3",
    "pino": "^8.21.0",
    "pino-pretty": "^10.2.3",
```

## 2. DATABASE CONFIGURATION FILES
### database.ts
```typescript
import knex from 'knex';
import { config } from './index';
import { pino } from 'pino';

const logger = pino({ name: 'database' });

export const createDatabaseConnection = () => {
  const db = knex({
    client: 'postgresql',
    connection: {
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      ssl: config.environment === 'production' ? { rejectUnauthorized: false } : false
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
      propagateCreateError: false
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    }
  });

  // Test connection
  db.raw('SELECT 1')
    .then(() => {
      logger.info('Database connection established');
    })
    .catch((error) => {
      logger.error({ error }, 'Database connection failed');
      process.exit(1);
    });

  return db;
};
```

### databaseService.ts
```typescript
import { Pool } from 'pg';

class DatabaseServiceClass {
  private pool: Pool | null = null;

  async initialize(): Promise<void> {
    // Use DATABASE_URL if provided, otherwise construct from parts
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL
      });
    } else {
      this.pool = new Pool({
        host: process.env.DB_HOST || 'tickettoken-postgres',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'tickettoken_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'localdev123'
      });
    }

    await this.pool.query('SELECT NOW()');
    console.log('Database connected successfully');
  }

  getPool(): Pool {
    if (!this.pool) throw new Error('Database not initialized');
    return this.pool;
  }
}

export const DatabaseService = new DatabaseServiceClass();
```


## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/event-service//src/migrations/seed_test_events.sql:2:INSERT INTO venues (id, name, city, state, capacity) VALUES
backend/services/event-service//src/migrations/seed_test_events.sql:9:INSERT INTO events (title, description, category, venue_id, start_date, end_date, status) VALUES
backend/services/event-service//src/migrations/seed_test_events.sql:17:INSERT INTO ticket_types (event_id, name, price, total_quantity, available_quantity)
backend/services/event-service//src/migrations/seed_test_events.sql:18:SELECT id, 'General Admission', 75.00, 1000, 950 FROM events WHERE title = 'Summer Music Festival'
backend/services/event-service//src/migrations/seed_test_events.sql:20:SELECT id, 'VIP', 250.00, 100, 85 FROM events WHERE title = 'Summer Music Festival';
backend/services/event-service//src/index.ts:82:      const eventCheck = await db.query('SELECT id, venue_id FROM events WHERE id = $1', [id]);
backend/services/event-service//src/index.ts:134:      const query = `UPDATE events SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
backend/services/event-service//src/index.ts:173:        FROM events e
backend/services/event-service//src/index.ts:174:        LEFT JOIN venues v ON e.venue_id = v.id
backend/services/event-service//src/index.ts:194:         FROM orders
backend/services/event-service//src/index.ts:248:        `UPDATE events
backend/services/event-service//src/controllers/venueController.ts:22:        FROM venues v
backend/services/event-service//src/controllers/venueController.ts:23:        LEFT JOIN events e ON e.venue_id = v.id
backend/services/event-service//src/controllers/venueController.ts:24:        LEFT JOIN ticket_types tt ON tt.event_id = e.id
backend/services/event-service//src/controllers/venueController.ts:45:        FROM events e
backend/services/event-service//src/controllers/venueController.ts:46:        LEFT JOIN ticket_types tt ON tt.event_id = e.id
backend/services/event-service//src/controllers/venueController.ts:61:        FROM orders o
backend/services/event-service//src/controllers/venueController.ts:62:        JOIN events e ON e.id = o.event_id
backend/services/event-service//src/controllers/venueController.ts:73:        FROM events
backend/services/event-service//src/controllers/venueController.ts:124:        FROM events e
backend/services/event-service//src/controllers/venueController.ts:125:        LEFT JOIN ticket_types tt ON tt.event_id = e.id
backend/services/event-service//src/controllers/customerController.ts:27:        FROM orders o
backend/services/event-service//src/controllers/customerController.ts:28:        LEFT JOIN order_items oi ON oi.order_id = o.id
backend/services/event-service//src/controllers/customerController.ts:29:        JOIN events e ON e.id = o.event_id
backend/services/event-service//src/controllers/customerController.ts:30:        LEFT JOIN venues v ON v.id = e.venue_id
backend/services/event-service//src/controllers/customerController.ts:50:        FROM orders o
backend/services/event-service//src/controllers/customerController.ts:51:        LEFT JOIN order_items oi ON oi.order_id = o.id
backend/services/event-service//src/controllers/customerController.ts:52:        JOIN events e ON e.id = o.event_id
backend/services/event-service//src/controllers/customerController.ts:64:        FROM orders o
backend/services/event-service//src/controllers/customerController.ts:65:        LEFT JOIN order_items oi ON oi.order_id = o.id
backend/services/event-service//src/controllers/customerController.ts:66:        JOIN events e ON e.id = o.event_id
backend/services/event-service//src/controllers/customerController.ts:85:        FROM orders o
backend/services/event-service//src/controllers/customerController.ts:86:        LEFT JOIN order_items oi ON oi.order_id = o.id
backend/services/event-service//src/controllers/customerController.ts:87:        JOIN events e ON e.id = o.event_id
backend/services/event-service//src/controllers/customerController.ts:88:        LEFT JOIN venues v ON v.id = e.venue_id
backend/services/event-service//src/controllers/eventController.ts:72:        INSERT INTO events (
backend/services/event-service//src/controllers/eventController.ts:148:        FROM events e
backend/services/event-service//src/controllers/eventController.ts:149:        LEFT JOIN venues v ON e.venue_id = v.id
backend/services/event-service//src/controllers/eventController.ts:252:        FROM events e
backend/services/event-service//src/controllers/eventController.ts:253:        LEFT JOIN venues v ON e.venue_id = v.id
backend/services/event-service//src/controllers/eventController.ts:254:        LEFT JOIN ticket_types tt ON tt.event_id = e.id
backend/services/event-service//src/controllers/notificationController.ts:15:        `INSERT INTO notifications (user_id, type, title, message, status)
backend/services/event-service//src/controllers/notificationController.ts:36:        SELECT * FROM notifications
backend/services/event-service//src/controllers/notificationController.ts:68:        `UPDATE notifications

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES
### venue-service.client.ts
First 100 lines:
```typescript
import fetch from 'node-fetch';
import CircuitBreaker from 'opossum';
import { logger } from '../utils/logger';
import { config } from '../config';
import { ValidationError } from '../utils/errors';

export class VenueServiceClient {
  private baseUrl: string;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.baseUrl = config.services.venueServiceUrl || process.env.VENUE_SERVICE_URL || 'http://venue-service:3002';
    
    const options = {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    };
    
    this.circuitBreaker = new CircuitBreaker(this.request.bind(this), options);
  }

  private async request(path: string, options: any = {}) {
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Venue service error: ${response.status} - ${errorText}`);
        (error as any).status = response.status;
        throw error;
      }
      
      return response.json();
    } catch (error) {
      logger.error({ error, url }, 'Venue service request failed');
      throw error;
    }
  }

  async validateVenueAccess(venueId: string, authToken: string): Promise<boolean> {
    try {
      // Just try to get the venue - if it exists and user has access, this succeeds
      const venue = await this.circuitBreaker.fire(`/api/v1/venues/${venueId}`, {
        headers: {
          'Authorization': authToken
        }
      });
      logger.info({ venueId, exists: true }, 'Venue exists and accessible');
      return true;
    } catch (error: any) {
      logger.error({ error, venueId }, 'Venue validation failed');
      // Check if it's a 404 (doesn't exist) or 403 (no access)
      if (error.message?.includes('404')) {
        throw new ValidationError('Venue does not exist');
      } else if (error.message?.includes('403')) {
        throw new ValidationError('No access to venue');
      }
      // For other errors, return false
      return false;
    }
  }

  async getVenue(venueId: string, authToken: string): Promise<any> {
    try {
      return await this.circuitBreaker.fire(`/api/v1/venues/${venueId}`, {
        headers: {
          'Authorization': authToken
        }
      });
    } catch (error) {
      logger.error({ error, venueId }, 'Failed to get venue details');
      throw new ValidationError("Failed to retrieve venue details");
    }
  }
}

export const venueServiceClient = new VenueServiceClient();
```

### event.service.ts
First 100 lines:
```typescript
import { Knex } from 'knex';
import { Event, NotFoundError, ValidationError } from '../types';
import { VenueServiceClient } from './venue-service.client';
import { EventSecurityValidator } from '../validations/event-security';
import { EventAuditLogger } from '../utils/audit-logger';
import { pino } from 'pino';
import Redis from 'ioredis';

const logger = pino({ name: 'event-service' });

export class EventService {
  private securityValidator: EventSecurityValidator;
  private auditLogger: EventAuditLogger;

  constructor(
    private db: Knex,
    private venueServiceClient: VenueServiceClient,
    private redis: Redis
  ) {
    this.securityValidator = new EventSecurityValidator();
    this.auditLogger = new EventAuditLogger(db);
  }

  async createEvent(data: Partial<Event>, authToken: string, userId: string, requestInfo?: any): Promise<Event> {
    // Validate venue access
    const hasAccess = await this.venueServiceClient.validateVenueAccess(data.venue_id!, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'Invalid venue or no access' }]);
    }

    // Get venue details to validate capacity
    const venueDetails = await this.venueServiceClient.getVenue(data.venue_id!, authToken);
    
    // Security validations
    if (data.capacity && venueDetails) {
      await this.securityValidator.validateVenueCapacity(data.capacity, venueDetails.capacity);
    }
    
    // Validate event date
    if (data.event_date) {
      await this.securityValidator.validateEventDate(new Date(data.event_date));
    }

    // Check for duplicate events
    const duplicateCheck = await this.checkForDuplicateEvent(
      data.venue_id!,
      new Date(data.event_date!),
      data.name!
    );
    
    if (duplicateCheck) {
      throw new ValidationError([{ 
        field: 'name', 
        message: 'An event with this name already exists at this venue on this date' 
      }]);
    }

    // Use transaction for consistency
    const event = await this.db.transaction(async (trx) => {
      const [newEvent] = await trx('events')
        .insert({
          ...data,
          status: data.status || 'draft',
          created_by: userId,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      // Audit log
      await this.auditLogger.logEventAction('create', newEvent.id, userId, {
        eventData: data,
        ...requestInfo
      });

      return newEvent;
    });

    // Clear venue events cache
    await this.redis.del(`venue:events:${data.venue_id}`);

    logger.info({ eventId: event.id, venueId: event.venue_id }, 'Event created');
    return event;
  }

  async getEvent(eventId: string): Promise<Event> {
    const event = await this.db('events')
      .where({ id: eventId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      throw new NotFoundError('Event');
    }

    return event;
  }

  async updateEvent(eventId: string, data: Partial<Event>, authToken: string, userId: string, requestInfo?: any): Promise<Event> {
    const event = await this.getEvent(eventId);
```

### capacity.service.ts
First 100 lines:
```typescript
import { Knex } from 'knex';
import Redis from 'ioredis';
import { pino } from 'pino';

const logger = pino({ name: 'capacity-service' });

interface CapacityInfo {
  total: number;
  sold: number;
  available: number;
  reserved: number;
}

export class CapacityService {
  constructor(
    private db: Knex,
    private redis: Redis
  ) {}

  async getEventCapacity(eventId: string): Promise<CapacityInfo> {
    // Check cache first
    const cached = await this.redis.get(`capacity:${eventId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get event capacity
    const event = await this.db('events')
      .where({ id: eventId })
      .first();

    if (!event) {
      throw new Error('Event not found');
    }

    // Count tickets by status
    const ticketCounts = await this.db('tickets')
      .select('status')
      .count('* as count')
      .where({ event_id: eventId })
      .groupBy('status');

    const counts = ticketCounts.reduce((acc: any, row: any) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, { sold: 0, reserved: 0 });

    const capacity: CapacityInfo = {
      total: event.capacity,
      sold: counts.sold || 0,
      reserved: counts.reserved || 0,
      available: event.capacity - (counts.sold || 0) - (counts.reserved || 0)
    };

    // Cache for 1 minute
    await this.redis.setex(`capacity:${eventId}`, 60, JSON.stringify(capacity));
    
    return capacity;
  }

  async updateCapacity(eventId: string, newCapacity: number): Promise<void> {
    const currentCapacity = await this.getEventCapacity(eventId);
    
    if (newCapacity < currentCapacity.sold + currentCapacity.reserved) {
      throw new Error('Cannot reduce capacity below sold/reserved tickets');
    }

    await this.db('events')
      .where({ id: eventId })
      .update({ 
        capacity: newCapacity,
        updated_at: new Date()
      });

    await this.redis.del(`capacity:${eventId}`);
    logger.info({ eventId, newCapacity }, 'Event capacity updated');
  }

  async checkAvailability(eventId: string, quantity: number): Promise<boolean> {
    const capacity = await this.getEventCapacity(eventId);
    return capacity.available >= quantity;
  }
}
```

### pricing.service.ts
First 100 lines:
```typescript
import { Knex } from 'knex';
import Redis from 'ioredis';
import { PricingRule } from '../types';
import { pino } from 'pino';

const logger = pino({ name: 'pricing-service' });

export class PricingService {
  constructor(
    private db: Knex,
    private redis: Redis
  ) {}

  async createPricingRule(data: Partial<PricingRule>): Promise<PricingRule> {
    const [rule] = await this.db('pricing_rules')
      .insert({
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');

    await this.invalidatePricingCache(data.ticket_type_id!);
    logger.info({ ruleId: rule.id }, 'Pricing rule created');
    return rule;
  }

  async calculatePrice(ticketTypeId: string): Promise<number> {
    // Check cache first
    const cached = await this.redis.get(`price:${ticketTypeId}`);
    if (cached) {
      return parseFloat(cached);
    }

    // Get ticket type
    const ticketType = await this.db('ticket_types')
      .where({ id: ticketTypeId })
      .first();

    if (!ticketType) {
      throw new Error('Ticket type not found');
    }

    // Get active pricing rules
    const rules = await this.db('pricing_rules')
      .where({ ticket_type_id: ticketTypeId, active: true })
      .orderBy('priority', 'asc');

    let price = parseFloat(ticketType.base_price);

    logger.info({
      ticketTypeId,
      basePrice: price,
      rulesCount: rules.length
    }, 'Calculating price');

    // Apply rules in priority order
    for (const rule of rules) {
      const oldPrice = price;
      price = await this.applyRule(price, rule, ticketType);

      if (price !== oldPrice) {
        logger.info({
          rule: rule.rule_type,
          oldPrice,
          newPrice: price,
          adjustment: rule.adjustment
        }, 'Price adjusted by rule');
      }
    }

    // Cache for 5 minutes
    await this.redis.setex(`price:${ticketTypeId}`, 300, price.toString());

    logger.info({ ticketTypeId, finalPrice: price }, 'Price calculation complete');
    return price;
  }

  private async applyRule(currentPrice: number, rule: PricingRule, ticketType: any): Promise<number> {
    let shouldApply = false;

    switch (rule.rule_type) {
      case 'time_based':
        shouldApply = await this.checkTimeBased(rule.conditions, ticketType);
        break;
      case 'demand_based':
        shouldApply = await this.checkDemandBased(rule.conditions);
        break;
      case 'group':
        shouldApply = await this.checkGroupDiscount(rule.conditions);
        break;
    }

    logger.info({
      ruleType: rule.rule_type,
      shouldApply,
      conditions: rule.conditions
    }, 'Rule evaluation');

    if (!shouldApply) {
```


## 6. ENVIRONMENT VARIABLES
```
# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}
```

---

