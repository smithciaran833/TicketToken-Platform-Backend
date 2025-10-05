# COMPLETE DATABASE ANALYSIS: event-service
Generated: Thu Oct  2 15:07:49 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/config/database.ts
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

### FILE: src/index.ts
```typescript
import dotenv from "dotenv";
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authenticate } from './middleware/auth';
import { eventController } from './controllers/eventController';
import { venueController } from './controllers/venueController';
import { ReportController } from './controllers/reportController';
import { customerController } from './controllers/customerController';
import { notificationController } from './controllers/notificationController';
import { DatabaseService } from './services/databaseService';
import { RedisService } from './services/redisService';

const app = express();
const reportController = new ReportController();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Tenant middleware
function requireTenant(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const tenantId = user.tenant_id || '00000000-0000-0000-0000-000000000001';
  (req as any).tenantId = tenantId;

  // Set PostgreSQL session for RLS
  DatabaseService.getPool().query("SELECT set_config('app.tenant_id', $1, false)", [tenantId])
    .catch(err => console.error('Failed to set tenant context:', err));

  next();
}

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'event-service',
    security: 'enabled',
    timestamp: new Date().toISOString()
  });
});

// Event routes
app.get('/api/v1/events',
  authenticate,
  requireTenant,
  eventController.listEvents.bind(eventController)
);

app.post('/api/v1/events',
  authenticate,
  requireTenant,
  eventController.create.bind(eventController)
);

app.get('/api/v1/events/:id',
  authenticate,
  requireTenant,
  eventController.getEvent.bind(eventController)
);

// Update event route
app.put('/api/v1/events/:id',
  authenticate,
  requireTenant,
  async (req: express.Request, res: express.Response): Promise<void> => {
    const { id } = req.params;
    const updates = req.body;

    try {
      const db = DatabaseService.getPool();

      // Check if event exists
      const eventCheck = await db.query('SELECT id, venue_id FROM events WHERE id = $1', [id]);
      if (eventCheck.rows.length === 0) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      // SECURITY FIX: Whitelist allowed update fields
      const allowedFields = [
        'name',
        'description',
        'venue_id',
        'start_date',
        'starts_at',
        'end_date',
        'ends_at',
        'status',
        'total_tickets',
        'available_tickets'
      ];

      // Build update query dynamically but safely
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      // Only process whitelisted fields
      for (const field of allowedFields) {
        if (field === 'start_date' && (updates.start_date || updates.starts_at)) {
          updateFields.push(`start_date = $${paramCount++}`);
          values.push(updates.start_date || updates.starts_at);
        } else if (field === 'end_date' && (updates.end_date || updates.ends_at)) {
          updateFields.push(`end_date = $${paramCount++}`);
          values.push(updates.end_date || updates.ends_at);
        } else if (updates[field] !== undefined && field !== 'starts_at' && field !== 'ends_at') {
          updateFields.push(`${field} = $${paramCount++}`);
          values.push(updates[field]);
        }
      }

      if (updateFields.length === 0) {
        res.status(400).json({ error: 'No valid fields to update' });
        return;
      }

      updateFields.push(`updated_at = $${paramCount++}`);
      values.push(new Date());
      values.push(id);

      // SECURITY NOTE: This is safe because:
      // 1. Field names are from our whitelist only
      // 2. Values are parameterized ($1, $2, etc.)
      // 3. No user input is directly interpolated
      const query = `UPDATE events SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      const result = await db.query(query, values);

      // Clear cache for this event
      await RedisService.del(`event:${id}`);
      await RedisService.del('events:*');

      res.json(result.rows[0]);

    } catch (error) {
      console.error('Error updating event:', error);
      res.status(500).json({ error: 'Failed to update event' });
    }
  }
);

// Event analytics route (NEW)
app.get('/api/v1/events/:id/analytics',
  authenticate,
  requireTenant,
  async (req: express.Request, res: express.Response): Promise<void> => {
    const { id } = req.params;

    try {
      const db = DatabaseService.getPool();

      // Get event details with analytics
      const eventResult = await db.query(
        `SELECT
          e.id,
          e.name,
          e.venue_id,
          e.start_date,
          e.end_date,
          e.status,
          e.total_tickets,
          e.available_tickets,
          v.name as venue_name,
          v.capacity as venue_capacity
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.id
        WHERE e.id = $1`,
        [id]
      );

      if (eventResult.rows.length === 0) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      const event = eventResult.rows[0];

      // Calculate analytics
      const ticketsSold = (event.total_tickets || 0) - (event.available_tickets || 0);
      const capacity = event.total_tickets || event.venue_capacity || 0;
      const utilization = capacity > 0 ? (ticketsSold / capacity) * 100 : 0;

      // Get ticket sales data (placeholder - would query from orders/tickets tables)
      const salesResult = await db.query(
        `SELECT COUNT(*) as sales_count, COALESCE(SUM(total_amount), 0) as total_revenue
         FROM orders
         WHERE event_id = $1 AND status != 'cancelled'`,
        [id]
      );

      const sales = salesResult.rows[0] || { sales_count: 0, total_revenue: 0 };

      const analytics = {
        event: {
          id: event.id,
          name: event.name,
          venue: event.venue_name,
          status: event.status,
          start_date: event.start_date,
          end_date: event.end_date
        },
        tickets: {
          total: event.total_tickets || 0,
          sold: ticketsSold,
          available: event.available_tickets || 0,
          sales_count: parseInt(sales.sales_count) || 0
        },
        revenue: {
          total: parseFloat(sales.total_revenue) || 0,
          currency: 'USD'
        },
        capacity: {
          venue_capacity: event.venue_capacity || 0,
          event_capacity: event.total_tickets || 0,
          utilization_percentage: utilization.toFixed(2)
        }
      };

      res.json(analytics);

    } catch (error) {
      console.error('Error fetching event analytics:', error);
      res.status(500).json({ error: 'Failed to fetch event analytics' });
    }
  }
);

// Publish event route
app.post('/api/v1/events/:id/publish',
  authenticate,
  requireTenant,
  async (req: express.Request, res: express.Response): Promise<void> => {
    const { id } = req.params;

    try {
      const db = DatabaseService.getPool();

      // Update event status to PUBLISHED
      const result = await db.query(
        `UPDATE events
         SET status = 'PUBLISHED',
             published_at = NOW(),
             event_status = 'PUBLISHED',
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      const event = result.rows[0];

      // Clear cache for this event
      await RedisService.del(`event:${id}`);
      await RedisService.del('events:*');

      res.json({
        id: event.id,
        name: event.name,
        status: 'PUBLISHED',
        message: 'Event published successfully',
        published_at: event.published_at
      });

    } catch (error) {
      console.error('Error publishing event:', error);
      res.status(500).json({ error: 'Failed to publish event' });
    }
  }
);

// Venue routes
app.get('/api/v1/venues/:venueId/dashboard',
  authenticate,
  requireTenant,
  venueController.getVenueDashboard.bind(venueController)
);

app.get('/api/v1/venues/:venueId/analytics',
  authenticate,
  requireTenant,
  venueController.getVenueAnalytics.bind(venueController)
);

// Report routes
app.get('/api/v1/reports/sales',
  authenticate,
  requireTenant,
  reportController.getSalesReport.bind(reportController)
);

app.get('/api/v1/reports/venue-comparison',
  authenticate,
  requireTenant,
  reportController.getVenueComparisonReport.bind(reportController)
);

app.get('/api/v1/reports/customer-insights',
  authenticate,
  requireTenant,
  reportController.getCustomerInsightsReport.bind(reportController)
);

// Customer routes
app.get('/api/v1/customers/:customerId/profile',
  authenticate,
  requireTenant,
  customerController.getCustomerProfile.bind(customerController)
);

// Notification routes
app.post('/api/v1/notifications',
  authenticate,
  requireTenant,
  notificationController.createNotification.bind(notificationController)
);

app.get('/api/v1/users/:userId/notifications',
  authenticate,
  requireTenant,
  notificationController.getUserNotifications.bind(notificationController)
);

app.put('/api/v1/notifications/:notificationId/read',
  authenticate,
  requireTenant,
  notificationController.markAsRead.bind(notificationController)
);

// Catch all unhandled routes - MUST BE LAST
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 3003;

async function start(): Promise<void> {
  try {
    await DatabaseService.initialize();
    console.log('✅ Database connected');

    await RedisService.initialize();
    console.log('✅ Redis connected');

    app.listen(PORT, () => {
      console.log(`🎪 Event Service running on port ${PORT}`);
      console.log(`🔒 Security: ENABLED`);
      console.log(`🛡️  All routes protected with authentication and tenant isolation`);
    });
  } catch (error) {
    console.error('Failed to start event service:', error);
    process.exit(1);
  }
}

start().catch(console.error);
```

### FILE: src/validations/event-security.ts
```typescript
export interface EventSecurityConfig {
  maxAdvanceDays: number;
  minAdvanceHours: number;
  maxTicketsPerOrder: number;
  maxTicketsPerCustomer: number;
}

export class EventSecurityValidator {
  private config: EventSecurityConfig;

  constructor() {
    this.config = {
      maxAdvanceDays: 365,
      minAdvanceHours: 2,
      maxTicketsPerOrder: 10,
      maxTicketsPerCustomer: 50
    };
  }

  async validateTicketPurchase(
    _customerId: string,
    _eventId: string,
    quantity: number,
    existingTicketCount: number
  ): Promise<void> {
    if (quantity > this.config.maxTicketsPerOrder) {
      throw new Error(`Cannot purchase more than ${this.config.maxTicketsPerOrder} tickets per order`);
    }

    if (existingTicketCount + quantity > this.config.maxTicketsPerCustomer) {
      throw new Error(`Cannot purchase more than ${this.config.maxTicketsPerCustomer} tickets per event`);
    }
  }

  async validateEventDate(eventDate: Date): Promise<void> {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + this.config.maxAdvanceDays);
    
    const minDate = new Date();
    minDate.setHours(minDate.getHours() + this.config.minAdvanceHours);

    if (eventDate < minDate) {
      throw new Error(`Event must be scheduled at least ${this.config.minAdvanceHours} hours in advance`);
    }

    if (eventDate > maxDate) {
      throw new Error(`Event cannot be scheduled more than ${this.config.maxAdvanceDays} days in advance`);
    }
  }

  async validateEventModification(eventId: string, data: any): Promise<void> {
    if (!eventId) {
      throw new Error('Event ID is required for modification');
    }
    
    // Add more validation logic as needed
    if (data.date) {
      await this.validateEventDate(new Date(data.date));
    }
  }

  async validateEventDeletion(eventId: string): Promise<void> {
    if (!eventId) {
      throw new Error('Event ID is required for deletion');
    }
    
    // Add logic to check if event can be deleted (e.g., no tickets sold)
  }

  async validateVenueCapacity(requestedCapacity: number, venueCapacity: number): Promise<void> {
    if (requestedCapacity > venueCapacity) {
      throw new Error(`Event capacity (${requestedCapacity}) cannot exceed venue capacity (${venueCapacity})`);
    }
  }
}
```

### FILE: src/controllers/venueController.ts
```typescript
import { Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'VenueController' });

export class VenueController {
  async getVenueDashboard(req: Request, res: Response): Promise<void> {
    const { venueId } = req.params;

    try {
      const db = DatabaseService.getPool();

      // Get venue details with stats
      const venueQuery = await db.query(
        `SELECT
          v.*,
          COUNT(DISTINCT e.id) as total_events,
          COUNT(DISTINCT CASE WHEN e.status = 'PUBLISHED' THEN e.id END) as active_events,
          COUNT(DISTINCT CASE WHEN e.start_date > NOW() THEN e.id END) as upcoming_events,
          COALESCE(SUM(tt.quantity), 0) as total_capacity
        FROM venues v
        LEFT JOIN events e ON e.venue_id = v.id
        LEFT JOIN ticket_types tt ON tt.event_id = e.id
        WHERE v.id = $1
        GROUP BY v.id`,
        [venueId]
      );

      if (venueQuery.rows.length === 0) {
        res.status(404).json({ error: 'Venue not found' });
        return;
      }

      // Get upcoming events
      const upcomingEvents = await db.query(
        `SELECT
          e.id,
          e.name,
          e.start_date,
          e.category,
          COALESCE(SUM(tt.quantity), 0) as total_tickets,
          COALESCE(MIN(tt.price), 0) as min_price,
          COALESCE(MAX(tt.price), 0) as max_price
        FROM events e
        LEFT JOIN ticket_types tt ON tt.event_id = e.id
        WHERE e.venue_id = $1
          AND e.start_date > NOW()
          AND e.status = 'PUBLISHED'
        GROUP BY e.id
        ORDER BY e.start_date ASC
        LIMIT 10`,
        [venueId]
      );

      // Get completed orders for revenue (from our Phase 1 work)
      const revenueData = await db.query(
        `SELECT
          COUNT(*) as total_orders,
          COALESCE(SUM(total_amount), 0) as total_revenue
        FROM orders o
        JOIN events e ON e.id = o.event_id
        WHERE e.venue_id = $1
          AND o.status = 'COMPLETED'`,
        [venueId]
      );

      // Get event categories distribution
      const categoryStats = await db.query(
        `SELECT
          category,
          COUNT(*) as count
        FROM events
        WHERE venue_id = $1
        GROUP BY category
        ORDER BY count DESC`,
        [venueId]
      );

      const dashboard = {
        venue: {
          ...venueQuery.rows[0],
          total_events: parseInt(venueQuery.rows[0].total_events) || 0,
          active_events: parseInt(venueQuery.rows[0].active_events) || 0,
          upcoming_events: parseInt(venueQuery.rows[0].upcoming_events) || 0,
          total_capacity: parseInt(venueQuery.rows[0].total_capacity) || 0
        },
        upcomingEvents: upcomingEvents.rows,
        revenue: revenueData.rows[0],
        categoryDistribution: categoryStats.rows,
        stats: {
          totalEvents: parseInt(venueQuery.rows[0].total_events) || 0,
          activeEvents: parseInt(venueQuery.rows[0].active_events) || 0,
          upcomingEvents: parseInt(venueQuery.rows[0].upcoming_events) || 0,
          totalCapacity: parseInt(venueQuery.rows[0].total_capacity) || 0,
          totalRevenue: parseFloat(revenueData.rows[0]?.total_revenue) || 0
        }
      };

      log.info('Venue dashboard generated', { venueId });
      res.json(dashboard);

    } catch (error) {
      log.error('Failed to get venue dashboard', error);
      res.status(500).json({ error: 'Failed to get venue dashboard' });
    }
  }

  async getVenueAnalytics(req: Request, res: Response): Promise<void> {
    const { venueId } = req.params;
    const { startDate, endDate } = req.query;

    try {
      const db = DatabaseService.getPool();

      // Get analytics by event category
      const analytics = await db.query(
        `SELECT
          e.category,
          COUNT(DISTINCT e.id) as events,
          SUM(tt.quantity) as total_tickets,
          AVG(tt.price) as avg_ticket_price,
          SUM(tt.price * tt.quantity) as potential_revenue
        FROM events e
        LEFT JOIN ticket_types tt ON tt.event_id = e.id
        WHERE e.venue_id = $1
          AND ($2::date IS NULL OR e.start_date >= $2)
          AND ($3::date IS NULL OR e.end_date <= $3)
        GROUP BY e.category
        ORDER BY potential_revenue DESC NULLS LAST`,
        [venueId, startDate || null, endDate || null]
      );

      res.json({
        venueId,
        period: { startDate, endDate },
        analytics: analytics.rows
      });

    } catch (error) {
      log.error('Failed to get venue analytics', error);
      res.status(500).json({ error: 'Failed to get analytics' });
    }
  }
}

export const venueController = new VenueController();
```

### FILE: src/controllers/capacity.controller.ts
```typescript
import { AuthenticatedHandler } from '../types';
import Joi from 'joi';

const updateCapacitySchema = Joi.object({
  capacity: Joi.number().integer().min(1).required()
});

export const getCapacity: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  const { capacityService } = request.container.cradle;

  const capacity = await capacityService.getEventCapacity(id);

  return reply.send({
    success: true,
    data: capacity
  });
};

export const updateCapacity: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  
  const { error, value } = updateCapacitySchema.validate(request.body);
  if (error) {
    return reply.status(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details
    });
  }

  const { eventService, capacityService } = request.container.cradle;
  
  // Verify event exists and user has access
  const event = await eventService.getEvent(id);
  
  // Verify user has access to venue
  const hasAccess = await request.container.cradle.venueServiceClient.validateVenueAccess(
    event.venue_id,
    request.headers.authorization!
  );
  
  if (!hasAccess) {
    return reply.status(403).send({
      success: false,
      error: 'Forbidden',
      code: 'FORBIDDEN'
    });
  }

  await capacityService.updateCapacity(id, value.capacity);

  return reply.send({
    success: true,
    data: { message: 'Capacity updated successfully' }
  });
};
```

### FILE: src/controllers/tickets.controller.ts
```typescript
import { AuthenticatedHandler } from '../types';
import Joi from 'joi';

const createTicketTypeSchema = Joi.object({
  name: Joi.string().min(3).max(255).required(),
  description: Joi.string().optional(),
  base_price: Joi.number().min(0).required(),
  quantity: Joi.number().integer().min(1).required(),
  max_per_order: Joi.number().integer().min(1).max(10).default(6),
  sale_start: Joi.date().iso().optional(),
  sale_end: Joi.date().iso().optional(),
  metadata: Joi.object({
    section: Joi.string().optional(),
    rows: Joi.string().optional()
  }).unknown(true).optional()
});

export const getTicketTypes: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  const { db } = request.container.cradle;

  const ticketTypes = await db('ticket_types')
    .where({ event_id: id })
    .orderBy('base_price', 'asc');

  return reply.send({
    success: true,
    data: ticketTypes
  });
};

export const createTicketType: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  
  const { error, value } = createTicketTypeSchema.validate(request.body);
  if (error) {
    return reply.status(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details
    });
  }

  const { db, eventService } = request.container.cradle;
  
  // Verify event exists and user has access
  await eventService.getEvent(id);

  const [ticketType] = await db('ticket_types')
    .insert({
      event_id: id,
      ...value,
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning('*');

  return reply.status(201).send({
    success: true,
    data: ticketType
  });
};

export const updateTicketType: AuthenticatedHandler = async (request, reply) => {
  const { id, typeId } = request.params as { id: string; typeId: string };
  
  const { error, value } = createTicketTypeSchema.validate(request.body);
  if (error) {
    return reply.status(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details
    });
  }

  const { db, eventService } = request.container.cradle;
  
  // Verify event exists and user has access
  await eventService.getEvent(id);

  // Check if sales have started
  const existingTickets = await db('tickets')
    .where({ ticket_type_id: typeId })
    .count('id as count')
    .first();

  const count = parseInt(existingTickets?.count as string || '0');
  
  if (count > 0) {
    // Only allow certain updates after sales begin
    const allowedUpdates = ['description', 'sale_end', 'metadata'];
    const updates = Object.keys(value).filter(key => !allowedUpdates.includes(key));
    
    if (updates.length > 0) {
      return reply.status(422).send({
        success: false,
        error: 'Cannot modify ticket type after sales begin',
        code: 'VALIDATION_ERROR',
        details: [{ field: updates.join(', '), message: 'Field cannot be modified after sales begin' }]
      });
    }
  }

  const [updated] = await db('ticket_types')
    .where({ id: typeId, event_id: id })
    .update({
      ...value,
      updated_at: new Date()
    })
    .returning('*');

  if (!updated) {
    return reply.status(404).send({
      success: false,
      error: 'Ticket type not found',
      code: 'NOT_FOUND'
    });
  }

  return reply.send({
    success: true,
    data: updated
  });
};
```

### FILE: src/controllers/events.controller.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { v4 as uuidv4 } from 'uuid';
import { createDatabaseConnection } from '../config/database';

import { serviceCache } from '../services/cache-integration';
// WP-8: Import search indexer at the top of the file
// @ts-ignore - JavaScript file in shared root
const { SearchIndexerHelper } = require('../../../../shared/search-indexer-helper');
const searchIndexer = new SearchIndexerHelper('event-service');
searchIndexer.initialize().catch(console.error);
import { EventService } from '../services/event.service';
import { VenueServiceClient } from '../services/venue-service.client';
const db = createDatabaseConnection();

interface CreateEventBody {
  name: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  venue_id: string;
  tiers: Array<{
    name: string;
    price_cents: number;
    currency: string;
    total_qty: number;
  }>;
}

// Helper to get tenant UUID from string or use default
async function getTenantUuid(tenantId: string): Promise<string> {
  // Cache tenant lookups for 30 minutes
  const cacheKey = `tenant:${tenantId}`;

  const cached = await serviceCache.get(cacheKey);
  if (cached) return cached;

  if (tenantId === 'default') {
    const result = await db('tenants').where({ name: 'default' }).first();
    const uuid = result ? result.id : '550e8400-e29b-41d4-a716-446655440099';
    await serviceCache.set(cacheKey, uuid, 1800); // 30 min cache
    return uuid;
  }

  await serviceCache.set(cacheKey, tenantId, 1800);
  return tenantId;
}

// Add this helper function to index events

export async function createEvent(
  request: FastifyRequest<{ Body: CreateEventBody }>,
  reply: FastifyReply
) {
  try {
    const tenantIdHeader = (request.headers['x-tenant-id'] as string) || 'default';
    const { name, description, starts_at, ends_at, venue_id, tiers } = request.body;
    
    // Get auth token from request
    const authToken = request.headers.authorization as string;
    const userId = (request as any).user?.id || 'system';
    
    // Initialize services
    const venueClient = new VenueServiceClient();
    const eventService = new EventService(db, venueClient, null as any);
    
    // Validate venue exists and user has access
    try {
      const hasAccess = await venueClient.validateVenueAccess(venue_id, authToken);
      if (!hasAccess) {
        return reply.status(400).send({ 
          error: 'Invalid venue or no access to venue' 
        });
      }
    } catch (error: any) {
      if (error.message?.includes('does not exist')) {
        return reply.status(404).send({ 
          error: 'Venue does not exist' 
        });
      }
      throw error;
    }
    
    // Create event using the service (which has additional validation)
    const eventData = {
      venue_id,
      name,
      title: name,
      description,
      start_date: new Date(starts_at),
      end_date: new Date(ends_at),
      starts_at: new Date(starts_at),
      ends_at: new Date(ends_at),
      status: 'draft' as any,
      tiers
    };
    
    // Use transaction for event + tiers
    const trx = await db.transaction();
    try {
      const tenantUuid = await getTenantUuid(tenantIdHeader);
      
      // Create event
      const eventId = uuidv4();
      const [event] = await trx('events')
        .insert({
          id: eventId,
          tenant_id: tenantUuid,
          venue_id,
          title: name,
          name: name,
          description,
          start_date: new Date(starts_at),
          end_date: new Date(ends_at),
          starts_at: new Date(starts_at),
          ends_at: new Date(ends_at),
          status: 'draft',
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      
      // Create tiers
      if (tiers && tiers.length > 0) {
        const tierRecords = tiers.map(tier => ({
          id: uuidv4(),
          event_id: eventId,
          tenant_id: tenantUuid,
          name: tier.name,
          price_cents: tier.price_cents,
          currency: tier.currency || 'USD',
          total_qty: tier.total_qty,
          sold_qty: 0,
          reserved_qty: 0,
          created_at: new Date(),
          updated_at: new Date()
        }));
        await trx('event_tiers').insert(tierRecords);
      }
      
      await trx.commit();
      
      // Index for search after creation
      await searchIndexer.indexEvent({
        id: event.id,
        name: event.name,
        venue_id: event.venue_id,
        starts_at: event.starts_at
      });
      
      return reply.status(201).send(event);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  } catch (error: any) {
    console.error('Failed to create event:', error);
    return reply.status(500).send({ 
      error: 'Failed to create event' 
    });
  }
}

export async function getEvent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const eventId = request.params.id;
    const cacheKey = `event:${eventId}`;

    // Try cache first
    let eventData = await serviceCache.get(cacheKey);

    if (eventData) {
      reply.header('X-Cache', 'HIT');
      return reply.send(eventData);
    }

    // Cache miss - get from database
    const event = await db('events').where({ id: eventId }).first();

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    const tiers = await db('event_tiers').where({ event_id: event.id });

    eventData = {
      id: event.id,
      name: event.title || event.name,
      description: event.description,
      starts_at: event.starts_at || event.start_date,
      ends_at: event.ends_at || event.end_date,
      status: event.status,
      venue_id: event.venue_id,
      tiers
    };

    // Cache for 10 minutes
    await serviceCache.set(cacheKey, eventData, 600);

    reply.header('X-Cache', 'MISS');
    return reply.send(eventData);
  } catch (error) {
    console.error('Error fetching event:', error);
    return reply.status(500).send({ error: 'Failed to fetch event' });
  }
}

export async function listEvents(
  request: FastifyRequest<{ Querystring: { status?: string; limit?: number; offset?: number } }>,
  reply: FastifyReply
) {
  try {
    const { status = 'DRAFT', limit = 20, offset = 0 } = request.query;

    // Create cache key based on query params
    const cacheKey = `events:list:${status}:${limit}:${offset}`;

    // Try cache first
    let cachedEvents = await serviceCache.get(cacheKey);

    if (cachedEvents) {
      reply.header('X-Cache', 'HIT');
      return reply.send(cachedEvents);
    }

    // Cache miss - get from database
    let query = db('events');

    if (status) {
      query = query.where({ status: status.toLowerCase() });
    }

    const events = await query.limit(limit).offset(offset).orderBy('created_at', 'desc');

    const response = {
      events: events.map(e => ({
        id: e.id,
        name: e.title || e.name,
        description: e.description,
        starts_at: e.starts_at || e.start_date,
        ends_at: e.ends_at || e.end_date,
        status: e.status,
        venue_id: e.venue_id
      }))
    };

    // Cache for 5 minutes
    await serviceCache.set(cacheKey, response, 300);

    reply.header('X-Cache', 'MISS');
    return reply.send(response);
  } catch (error) {
    console.error('Error listing events:', error);
    return reply.status(500).send({ error: 'Failed to list events' });
  }
}

export async function publishEvent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const trx = await db.transaction();

  try {
    const tenantIdHeader = (request.headers['x-tenant-id'] as string) || 'default';
    const tenantUuid = await getTenantUuid(tenantIdHeader);
    const eventId = request.params.id;

    // Update event status
    const [event] = await trx('events')
      .where({ id: eventId })
      .update({ status: 'published', updated_at: new Date() })
      .returning('*');

    if (!event) {
      await trx.rollback();
      return reply.status(404).send({ error: 'Event not found' });
    }

    // Get tiers for pricing
    const tiers = await trx('event_tiers').where({ event_id: eventId });
    const prices = tiers.map(t => t.price_cents);

    // Upsert into search index
    await trx('search_index_events')
      .insert({
        id: uuidv4(),
        event_id: eventId,
        tenant_id: tenantUuid,
        name: event.title || event.name,
        description: event.description,
        starts_at: event.starts_at || event.start_date,
        ends_at: event.ends_at || event.end_date,
        status: 'PUBLISHED',
        min_price_cents: Math.min(...prices),
        created_at: new Date(),
        updated_at: new Date()
      })
      .onConflict('event_id')
      .merge();

    // WP-8: Re-index after publish
    const publishedEvent = await trx('events').where({ id: eventId }).first();
    try {
      await searchIndexer.indexEvent(publishedEvent);
      console.log(`✅ Event ${eventId} re-indexed after publish`);
    } catch (err) {
      console.error('Failed to re-index event:', err);
    }

    // Insert into outbox
    await trx('outbox').insert({
      id: uuidv4(),
      tenant_id: tenantUuid,
      aggregate_id: eventId,
      event_type: 'event.published',
      payload: JSON.stringify({
        event_id: eventId,
        name: event.title || event.name,
        status: 'PUBLISHED',
        published_at: new Date()
      }),
      processed: false,
      created_at: new Date()
    });

    await trx.commit();

    // Invalidate all caches for this event
    await serviceCache.delete([
      `event:${eventId}`,
      `events:list:*`,
      `venue:${event.venue_id}:events`
    ]);

    // Publish cache invalidation event
    try {
      const amqp = require('amqplib');
      const connection = await amqp.connect(process.env.AMQP_URL || 'amqp://admin:admin@rabbitmq:5672');
      const channel = await connection.createChannel();

      await channel.publish(
        'cache.invalidation',
        'event.published',
        Buffer.from(JSON.stringify({
          type: 'event.published',
          entityId: eventId,
          venueId: event.venue_id,
          timestamp: Date.now()
        }))
      );

      await connection.close();
    } catch (err) {
      console.error('Failed to publish invalidation:', err);
    }

    return reply.send({
      id: event.id,
      name: event.title || event.name,
      status: 'published',
      message: 'Event published successfully'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Error publishing event:', error);
    return reply.status(500).send({ error: 'Failed to publish event', details: (error as Error).message });
  }
}

export async function updateEvent(
  request: FastifyRequest<{ 
    Params: { id: string },
    Body: Partial<CreateEventBody> & { 
      status?: string,
      total_tickets?: number,
      available_tickets?: number 
    }
  }>,
  reply: FastifyReply
) {
  try {
    const eventId = request.params.id;
    const tenantIdHeader = (request.headers['x-tenant-id'] as string) || 'default';
    const updates = request.body;
    
    // Get auth token from request
    const authToken = request.headers.authorization as string;
    const userId = (request as any).user?.id || 'system';
    
    // Initialize services
    const venueClient = new VenueServiceClient();
    const eventService = new EventService(db, venueClient, null as any);
    
    // First check if event exists
    const existingEvent = await db('events')
      .where({ id: eventId })
      .first();
      
    if (!existingEvent) {
      return reply.status(404).send({
        error: 'Event not found'
      });
    }
    
    // If venue_id is being updated, validate the new venue
    if (updates.venue_id) {
      try {
        const hasAccess = await venueClient.validateVenueAccess(updates.venue_id, authToken);
        if (!hasAccess) {
          return reply.status(400).send({
            error: 'Invalid venue or no access to venue'
          });
        }
      } catch (error: any) {
        if (error.message?.includes('does not exist')) {
          return reply.status(404).send({
            error: 'Venue does not exist'
          });
        }
        throw error;
      }
    }
    
    // Build update object
    const updateData: any = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.starts_at) updateData.start_date = new Date(updates.starts_at);
    if (updates.ends_at) updateData.end_date = new Date(updates.ends_at);
    if (updates.venue_id) updateData.venue_id = updates.venue_id;
    if (updates.status) updateData.status = updates.status;
    if (updates.total_tickets !== undefined) updateData.total_tickets = updates.total_tickets;
    if (updates.available_tickets !== undefined) updateData.available_tickets = updates.available_tickets;
    
    updateData.updated_at = new Date();
    
    // Update the event
    await db('events')
      .where({ id: eventId })
      .update(updateData);
    
    // Fetch and return updated event
    const updatedEvent = await db('events')
      .where({ id: eventId })
      .first();
      
    // Clear cache for this event
    await serviceCache.delete(`event:${eventId}`);
    
    // Index updated event for search
    await searchIndexer.indexData('events', {
      id: updatedEvent.id,
      name: updatedEvent.name,
      description: updatedEvent.description,
      venue_id: updatedEvent.venue_id,
      status: updatedEvent.status,
      start_date: updatedEvent.start_date,
      end_date: updatedEvent.end_date
    });
    
    return reply.send({
      ...updatedEvent,
      venue_id: updatedEvent.venue_id
    });
    
  } catch (error) {
    console.error('Error updating event:', error);
    return reply.status(500).send({ 
      error: 'Failed to update event' 
    });
  }
}
```

### FILE: src/controllers/pricing.controller.ts
```typescript
import { AuthenticatedHandler } from '../types';
import Joi from 'joi';

const createPricingRuleSchema = Joi.object({
  ticket_type_id: Joi.string().uuid().required(),
  rule_type: Joi.string().valid('time_based', 'demand_based', 'group').required(),
  conditions: Joi.object().required(),
  adjustment: Joi.object({
    type: Joi.string().valid('percentage', 'fixed').required(),
    value: Joi.number().required()
  }).required(),
  priority: Joi.number().integer().min(0).default(0),
  active: Joi.boolean().default(true)
});

export const getPricingRules: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  const { db, eventService } = request.container.cradle;

  // Verify event exists
  await eventService.getEvent(id);

  const rules = await db('pricing_rules')
    .join('ticket_types', 'pricing_rules.ticket_type_id', 'ticket_types.id')
    .where('ticket_types.event_id', id)
    .select('pricing_rules.*', 'ticket_types.name as ticket_type_name')
    .orderBy('pricing_rules.priority', 'asc');

  return reply.send({
    success: true,
    data: rules
  });
};

export const createPricingRule: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  
  const { error, value } = createPricingRuleSchema.validate(request.body);
  if (error) {
    return reply.status(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details
    });
  }

  const { eventService, pricingService } = request.container.cradle;
  
  // Verify event exists and user has access
  await eventService.getEvent(id);

  const rule = await pricingService.createPricingRule(value);

  return reply.status(201).send({
    success: true,
    data: rule
  });
};

export const calculatePricing: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  const { db, eventService, pricingService } = request.container.cradle;

  // Verify event exists
  await eventService.getEvent(id);

  // Get all ticket types for event
  const ticketTypes = await db('ticket_types')
    .where({ event_id: id });

  // Calculate current price for each ticket type
  const pricing = await Promise.all(
    ticketTypes.map(async (ticketType) => {
      const currentPrice = await pricingService.calculatePrice(ticketType.id);
      return {
        ticket_type_id: ticketType.id,
        ticket_type_name: ticketType.name,
        base_price: ticketType.base_price,
        current_price: currentPrice,
        difference: currentPrice - ticketType.base_price,
        percentage_change: ((currentPrice - ticketType.base_price) / ticketType.base_price) * 100
      };
    })
  );

  return reply.send({
    success: true,
    data: pricing
  });
};
```

### FILE: src/controllers/schedule.controller.ts
```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface ScheduleBody {
  eventId: string;
  scheduleType: 'single' | 'recurring';
  startDate: Date;
  endDate?: Date;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    daysOfWeek?: number[];
    endDate?: Date;
  };
}

export async function scheduleController(fastify: FastifyInstance) {
  // Create schedule
  fastify.post('/', async (request: FastifyRequest<{ Body: ScheduleBody }>, reply: FastifyReply) => {
    const { eventId, scheduleType, startDate, recurrence } = request.body;
    
    // TODO: Implement scheduling logic
    return reply.send({
      id: `schedule-${Date.now()}`,
      eventId,
      scheduleType,
      startDate,
      recurrence,
      status: 'active'
    });
  });

  // Get event schedule
  fastify.get('/:eventId', async (request: FastifyRequest<{ Params: { eventId: string } }>, reply: FastifyReply) => {
    const { eventId } = request.params;
    
    // TODO: Fetch actual schedule
    return reply.send({
      eventId,
      schedules: []
    });
  });
}
```

### FILE: src/controllers/customerController.ts
```typescript
import { Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'CustomerController' });

export class CustomerController {
  async getCustomerProfile(req: Request, res: Response) {
    const { customerId } = req.params;

    try {
      const db = DatabaseService.getPool();

      // Get customer purchase history
      const purchases = await db.query(
        `SELECT
          o.id as order_id,
          o.created_at as purchase_date,
          o.status,
          o.total_amount,
          COALESCE(SUM(oi.quantity), 0) as ticket_quantity,
          e.name as event_title,
          e.category,
          e.start_date as event_date,
          v.name as venue_name,
          v.city as venue_city
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        JOIN events e ON e.id = o.event_id
        LEFT JOIN venues v ON v.id = e.venue_id
        WHERE o.user_id = $1
        GROUP BY o.id, o.created_at, o.status, o.total_amount, 
                 e.name, e.category, e.start_date, v.name, v.city
        ORDER BY o.created_at DESC
        LIMIT 50`,
        [customerId]
      );

      // Get customer statistics
      const stats = await db.query(
        `SELECT
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(oi.quantity), 0) as total_tickets,
          SUM(DISTINCT o.total_amount) as total_spent,
          AVG(DISTINCT o.total_amount) as avg_order_value,
          MIN(o.created_at) as first_purchase,
          MAX(o.created_at) as last_purchase,
          COUNT(DISTINCT e.category) as categories_attended,
          COUNT(DISTINCT e.venue_id) as venues_visited
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        JOIN events e ON e.id = o.event_id
        WHERE o.user_id = $1
          AND o.status IN ('PAID', 'COMPLETED')`,
        [customerId]
      );

      // Get favorite categories
      const favoriteCategories = await db.query(
        `SELECT
          e.category,
          COUNT(DISTINCT o.id) as event_count,
          COALESCE(SUM(oi.quantity), 0) as tickets_bought
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        JOIN events e ON e.id = o.event_id
        WHERE o.user_id = $1
          AND o.status IN ('PAID', 'COMPLETED')
        GROUP BY e.category
        ORDER BY tickets_bought DESC
        LIMIT 5`,
        [customerId]
      );

      // Get upcoming events
      const upcomingEvents = await db.query(
        `SELECT
          e.id,
          e.name,
          e.start_date,
          e.category,
          v.name as venue_name,
          COALESCE(SUM(oi.quantity), 0) as ticket_quantity,
          o.total_amount
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        JOIN events e ON e.id = o.event_id
        LEFT JOIN venues v ON v.id = e.venue_id
        WHERE o.user_id = $1
          AND o.status IN ('PAID', 'COMPLETED')
          AND e.start_date > NOW()
        GROUP BY e.id, e.name, e.start_date, e.category, v.name, o.total_amount
        ORDER BY e.start_date ASC`,
        [customerId]
      );

      const profile = {
        customerId,
        statistics: stats.rows[0] || {},
        purchaseHistory: purchases.rows,
        favoriteCategories: favoriteCategories.rows,
        upcomingEvents: upcomingEvents.rows,
        preferences: {
          preferredCategories: favoriteCategories.rows.map(c => c.category),
          avgSpend: stats.rows[0]?.avg_order_value || 0
        }
      };

      log.info('Customer profile generated', { customerId });
      res.json(profile);

    } catch (error) {
      log.error('Failed to get customer profile', error);
      res.status(500).json({ error: 'Failed to get customer profile' });
    }
  }
}

export const customerController = new CustomerController();
```

### FILE: src/controllers/eventController.ts
```typescript
import fetch from 'node-fetch';
import { Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { RedisService } from '../services/redisService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'EventController' });

interface EventFilter {
  category?: string;
  venue_id?: string;
  min_price?: number;
  max_price?: number;
  start_date?: string;
  end_date?: string;
  status?: string;
}

export class EventController {
  async create(req: Request, res: Response): Promise<void> {
    try {
      const db = DatabaseService.getPool();
      const {
        venue_id,
        name,
        description,
        start_date,
        end_date,
        status = "DRAFT",
        total_tickets = 0,
        available_tickets = 0
      } = req.body;

      if (!venue_id || !name || !start_date || !end_date) {
        res.status(400).json({
          error: "Missing required fields: venue_id, name, start_date, end_date"
        });
        return;
      }

      // Validate venue exists (check with venue service)
      try {
        const venueCheckResponse = await fetch(`http://tickettoken-venue:3002/api/v1/venues/${venue_id}`, {
          headers: {
            'Authorization': req.headers.authorization || ''
          }
        });

        if (venueCheckResponse.status === 404) {
          res.status(404).json({ error: "Venue does not exist" });
          return;
        }

        if (venueCheckResponse.status === 403) {
          res.status(403).json({ error: "No access to venue" });
          return;
        }

        if (!venueCheckResponse.ok) {
          throw new Error('Unable to validate venue');
        }
      } catch (error) {
        log.error("Venue validation failed", error);
        res.status(400).json({ error: "Unable to validate venue" });
        return;
      }

      // Generate slug from name
      const event_slug = name.toLowerCase().replace(/\s+/g, '-');

      const query = `
        INSERT INTO events (
          id, venue_id, name, description, start_date, end_date,
          status, total_tickets, available_tickets,
          event_name, event_date, event_status, event_slug,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12,
          NOW(), NOW()
        ) RETURNING *`;

      const result = await db.query(query, [
        venue_id,
        name,
        description,
        start_date,
        end_date,
        status.toUpperCase(),
        total_tickets,
        available_tickets,
        name,  // event_name (parameter 9)
        new Date(start_date),  // event_date (parameter 10)
        status.toUpperCase(),  // event_status (parameter 11)
        event_slug  // event_slug (parameter 12)
      ]);

      await RedisService.del("events:*");

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      log.error("Failed to create event", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  }

  async listEvents(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;

      const filters: EventFilter = {
        category: req.query.category as string,
        venue_id: req.query.venue_id as string,
        min_price: req.query.min_price ? parseFloat(req.query.min_price as string) : undefined,
        max_price: req.query.max_price ? parseFloat(req.query.max_price as string) : undefined,
        start_date: req.query.start_date as string,
        end_date: req.query.end_date as string,
        status: req.query.status as string || 'PUBLISHED'
      };

      const cacheKey = `events:${JSON.stringify({ page, limit, filters })}`;
      const cached = await RedisService.get(cacheKey);

      if (cached) {
        log.debug('Returning cached events');
        res.json(JSON.parse(cached));
        return;
      }

      const db = DatabaseService.getPool();
      let query = `
        SELECT
          e.id,
          e.name as title,
          e.description,
          e.venue_id,
          e.start_date,
          e.end_date,
          e.status,
          e.created_at,
          e.updated_at,
          v.name as venue_name,
          v.city as venue_city,
          e.total_tickets as total_capacity,
          e.available_tickets as tickets_available
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.id
        WHERE 1=1
      `;

      const params: any[] = [];
      let paramCount = 0;

      if (filters.status) {
        params.push(filters.status);
        query += ` AND e.status = $${++paramCount}`;
      }

      if (filters.category) {
        params.push(filters.category);
        query += ` AND e.category = $${++paramCount}`;
      }

      if (filters.venue_id) {
        params.push(filters.venue_id);
        query += ` AND e.venue_id = $${++paramCount}`;
      }

      if (filters.start_date) {
        params.push(filters.start_date);
        query += ` AND e.start_date >= $${++paramCount}`;
      }

      if (filters.end_date) {
        params.push(filters.end_date);
        query += ` AND e.end_date <= $${++paramCount}`;
      }

      if (filters.min_price !== undefined) {
        params.push(filters.min_price);
        query += ` AND tp.min_price >= $${++paramCount}`;
      }

      if (filters.max_price !== undefined) {
        params.push(filters.max_price);
        query += ` AND tp.max_price <= $${++paramCount}`;
      }

      const countQuery = `SELECT COUNT(*) FROM (${query}) as filtered_events`;
      const countResult = await db.query(countQuery, params);
      const totalCount = parseInt(countResult.rows[0].count);

      query += ` ORDER BY e.start_date ASC`;
      params.push(limit);
      query += ` LIMIT $${++paramCount}`;
      params.push(offset);
      query += ` OFFSET $${++paramCount}`;

      const result = await db.query(query, params);

      const response = {
        events: result.rows,
        pagination: {
          page,
          limit,
          total: totalCount,
          total_pages: Math.ceil(totalCount / limit)
        },
        filters
      };

      await RedisService.setex(cacheKey, 300, JSON.stringify(response));

      log.info('Events listed', { count: result.rows.length, page, filters });
      res.json(response);

    } catch (error) {
      log.error('Failed to list events', error);
      res.status(500).json({ error: 'Failed to list events' });
    }
  }

  async getEvent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const cacheKey = `event:${id}`;
      const cached = await RedisService.get(cacheKey);

      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }

      const db = DatabaseService.getPool();
      const result = await db.query(
        `SELECT
          e.*,
          v.name as venue_name,
          v.address as venue_address,
          v.city as venue_city,
          json_agg(
            DISTINCT jsonb_build_object(
              'id', tt.id,
              'name', tt.name,
              'price', tt.price,
              'available', tt.available_quantity
            )
          ) as ticket_types
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.id
        LEFT JOIN ticket_types tt ON tt.event_id = e.id
        WHERE e.id = $1
        GROUP BY e.id, v.id`,
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      const event = result.rows[0];

      await RedisService.setex(cacheKey, 300, JSON.stringify(event));

      res.json(event);

    } catch (error) {
      log.error('Failed to get event', error);
      res.status(500).json({ error: 'Failed to get event' });
    }
  }
}

export const eventController = new EventController();
```

### FILE: src/controllers/notificationController.ts
```typescript
import { Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'NotificationController' });

export class NotificationController {
  async createNotification(req: Request, res: Response) {
    try {
      const { userId, user_id, type, title, message, status } = req.body;
      const finalUserId = userId || user_id; // Handle both field names
      
      const db = DatabaseService.getPool();
      const result = await db.query(
        `INSERT INTO notifications (user_id, type, title, message, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [finalUserId, type, title, message, status || 'SENT']
      );
      
      log.info('Notification created', { id: result.rows[0].id, type });
      res.json(result.rows[0]);
    } catch (error) {
      log.error('Failed to create notification', error);
      res.status(500).json({ error: 'Failed to create notification' });
    }
  }

  async getUserNotifications(req: Request, res: Response) {
    const { userId } = req.params;
    const { status = 'all', limit = 20 } = req.query;
    
    try {
      const db = DatabaseService.getPool();
      let query = `
        SELECT * FROM notifications
        WHERE user_id = $1
      `;
      const params: any[] = [userId];
      
      if (status !== 'all') {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);
      
      const result = await db.query(query, params);
      
      res.json({
        userId,
        notifications: result.rows,
        unreadCount: result.rows.filter(n => n.status === 'SENT' || n.status === 'pending').length
      });
    } catch (error) {
      log.error('Failed to get notifications', error);
      res.status(500).json({ error: 'Failed to get notifications' });
    }
  }

  async markAsRead(req: Request, res: Response) {
    const { notificationId } = req.params;
    
    try {
      const db = DatabaseService.getPool();
      await db.query(
        `UPDATE notifications
         SET status = 'read', read_at = NOW()
         WHERE id = $1`,
        [notificationId]
      );
      
      res.json({ success: true });
    } catch (error) {
      log.error('Failed to mark notification as read', error);
      res.status(500).json({ error: 'Failed to update notification' });
    }
  }
}

export const notificationController = new NotificationController();
```

### FILE: src/utils/error-response.ts
```typescript
import { FastifyReply } from 'fastify';

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: any;
  requestId?: string;
}

export class ErrorResponseBuilder {
  static send(reply: FastifyReply, statusCode: number, error: string, code: string, details?: any) {
    const response: ErrorResponse = {
      success: false,
      error,
      code,
      details,
      requestId: (reply.request as any).id
    };
    
    return reply.status(statusCode).send(response);
  }

  static validation(reply: FastifyReply, details: any) {
    return this.send(reply, 422, 'Validation failed', 'VALIDATION_ERROR', details);
  }

  static unauthorized(reply: FastifyReply, message: string = 'Unauthorized') {
    return this.send(reply, 401, message, 'UNAUTHORIZED');
  }

  static forbidden(reply: FastifyReply, message: string = 'Forbidden') {
    return this.send(reply, 403, message, 'FORBIDDEN');
  }

  static notFound(reply: FastifyReply, resource: string) {
    return this.send(reply, 404, `${resource} not found`, 'NOT_FOUND');
  }

  static conflict(reply: FastifyReply, message: string) {
    return this.send(reply, 409, message, 'CONFLICT');
  }

  static tooManyRequests(reply: FastifyReply, message: string = 'Too many requests') {
    return this.send(reply, 429, message, 'RATE_LIMIT_EXCEEDED');
  }

  static internal(reply: FastifyReply, message: string = 'Internal server error') {
    return this.send(reply, 500, message, 'INTERNAL_ERROR');
  }
}

// Error codes enum for consistency
export enum ErrorCodes {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}
```

### FILE: src/utils/audit-logger.ts
```typescript
import { Knex } from 'knex';
import { pino } from 'pino';

const logger = pino({ name: 'audit-logger' });

export class EventAuditLogger {
  constructor(private db: Knex) {}

  async logEventAction(
    action: string,
    eventId: string,
    userId: string,
    metadata: any = {}
  ): Promise<void> {
    try {
      // Debug logging
      logger.info({ action, eventId, userId, metadata }, 'Audit log entry details');
      
      const auditEntry = {
        user_id: userId,
        action: `event_${action}`,
        resource_type: 'event',
        resource_id: eventId,
        ip_address: metadata.ip || metadata.ipAddress || null,
        user_agent: metadata.userAgent || null,
        metadata: {
          eventData: metadata.eventData,
          updates: metadata.updates,
          previousData: metadata.previousData,
          requestId: metadata.requestId,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent
        },
        status: 'success'
      };

      // Debug the actual entry being inserted
      logger.info({ auditEntry }, 'Inserting audit entry');

      await this.db('audit_logs').insert(auditEntry);

      logger.info({
        action: `event_${action}`,
        userId,
        eventId,
        metadata,
        timestamp: new Date()
      }, `Event ${action} audit log successfully written`);
    } catch (error) {
      logger.error({ error, userId, eventId, action }, 'Failed to write audit log to database');
      // Don't throw - audit logging failure shouldn't break the operation
    }
  }

  async logEventCreation(
    userId: string,
    eventId: string,
    eventData: any,
    requestInfo?: any
  ): Promise<void> {
    await this.logEventAction('created', eventId, userId, {
      eventData,
      ...requestInfo
    });
  }

  async logEventUpdate(
    userId: string,
    eventId: string,
    changes: any,
    requestInfo?: any
  ): Promise<void> {
    await this.logEventAction('updated', eventId, userId, {
      updates: changes,
      ...requestInfo
    });
  }

  async logEventDeletion(
    userId: string,
    eventId: string,
    requestInfo?: any
  ): Promise<void> {
    await this.logEventAction('deleted', eventId, userId, requestInfo);
  }

  async logEventAccess(
    userId: string,
    eventId: string,
    action: string,
    allowed: boolean,
    requestInfo?: any
  ): Promise<void> {
    try {
      await this.db('audit_logs').insert({
        user_id: userId,
        action: `event_access_${action}`,
        resource_type: 'event',
        resource_id: eventId,
        ip_address: requestInfo?.ip || null,
        user_agent: requestInfo?.userAgent || null,
        metadata: {
          allowed,
          requestId: requestInfo?.requestId
        },
        status: allowed ? 'success' : 'failure'
      });

      logger.info({
        action: `event_access_${action}`,
        userId,
        eventId,
        allowed,
        requestInfo,
        timestamp: new Date()
      }, 'Event access audit log');
    } catch (error) {
      logger.error({ error }, 'Failed to write audit log to database');
    }
  }
}
```

### FILE: src/models/Tier.ts
```typescript
import { Knex } from 'knex';
import { createDatabaseConnection } from '../config/database';

const knex = createDatabaseConnection();

export interface ITier {
  id?: string;
  event_id: string;
  name: string;
  description?: string;
  price: number;
  total_quantity: number;
  available_quantity: number;
  metadata?: any;
  created_at?: Date;
}

export class TierModel {
  private db: Knex;
  private tableName = 'ticket_types';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: ITier): Promise<ITier> {
    const [tier] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return tier;
  }

  async findById(id: string): Promise<ITier | null> {
    const tier = await this.db(this.tableName)
      .where({ id })
      .first();
    return tier || null;
  }

  async findByEventId(eventId: string): Promise<ITier[]> {
    return this.db(this.tableName)
      .where({ event_id: eventId })
      .orderBy('price', 'asc');
  }

  async update(id: string, data: Partial<ITier>): Promise<ITier | null> {
    const [tier] = await this.db(this.tableName)
      .where({ id })
      .update(data)
      .returning('*');
    return tier || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }

  async decrementAvailability(id: string, quantity: number): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .where('available_quantity', '>=', quantity)
      .decrement('available_quantity', quantity);
    return result > 0;
  }
}

export default TierModel;
```

### FILE: src/models/Event.ts
```typescript
import { Knex } from 'knex';
import { createDatabaseConnection } from '../config/database';

const knex = createDatabaseConnection();

export interface IEvent {
  id?: string;
  title: string;
  description?: string;
  category?: string;
  venue_id?: string;
  start_date: Date;
  end_date: Date;
  status?: string;
  image_url?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class EventModel {
  private db: Knex;
  private tableName = 'events';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IEvent): Promise<IEvent> {
    const [event] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return event;
  }

  async findById(id: string): Promise<IEvent | null> {
    const event = await this.db(this.tableName)
      .where({ id })
      .first();
    return event || null;
  }

  async findAll(filters: Partial<IEvent> = {}): Promise<IEvent[]> {
    return this.db(this.tableName)
      .where(filters)
      .orderBy('start_date', 'asc');
  }

  async update(id: string, data: Partial<IEvent>): Promise<IEvent | null> {
    const [event] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return event || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }

  async findByVenue(venueId: string): Promise<IEvent[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId })
      .orderBy('start_date', 'asc');
  }
}

export default EventModel;
```

### FILE: src/models/Performer.ts
```typescript
import { Knex } from 'knex';
import { createDatabaseConnection } from '../config/database';

const knex = createDatabaseConnection();

export interface IPerformer {
  id?: string;
  name: string;
  bio?: string;
  image_url?: string;
  genre?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class PerformerModel {
  private db: Knex;
  private tableName = 'performers';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IPerformer): Promise<IPerformer> {
    const [performer] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return performer;
  }

  async findById(id: string): Promise<IPerformer | null> {
    const performer = await this.db(this.tableName)
      .where({ id })
      .first();
    return performer || null;
  }

  async findAll(filters: Partial<IPerformer> = {}): Promise<IPerformer[]> {
    return this.db(this.tableName)
      .where(filters)
      .orderBy('name', 'asc');
  }

  async update(id: string, data: Partial<IPerformer>): Promise<IPerformer | null> {
    const [performer] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return performer || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default PerformerModel;
```

### FILE: src/models/Venue.ts
```typescript
import { Knex } from 'knex';
import { createDatabaseConnection } from '../config/database';

const knex = createDatabaseConnection();

export interface IVenue {
  id?: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  capacity?: number;
  metadata?: any;
  created_at?: Date;
}

export class VenueModel {
  private db: Knex;
  private tableName = 'venues';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IVenue): Promise<IVenue> {
    const [venue] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return venue;
  }

  async findById(id: string): Promise<IVenue | null> {
    const venue = await this.db(this.tableName)
      .where({ id })
      .first();
    return venue || null;
  }

  async findAll(filters: Partial<IVenue> = {}): Promise<IVenue[]> {
    return this.db(this.tableName)
      .where(filters)
      .orderBy('name', 'asc');
  }

  async update(id: string, data: Partial<IVenue>): Promise<IVenue | null> {
    const [venue] = await this.db(this.tableName)
      .where({ id })
      .update(data)
      .returning('*');
    return venue || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default VenueModel;
```

### FILE: src/services/event.service.ts
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

    // Validate venue access
    const hasAccess = await this.venueServiceClient.validateVenueAccess(event.venue_id, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    // Check if event has already started
    if (new Date(event.event_date) < new Date()) {
      throw new ValidationError([{ field: 'event_date', message: 'Cannot modify past events' }]);
    }

    // Security validations
    await this.securityValidator.validateEventModification(eventId, data);

    if (data.capacity) {
      const venueDetails = await this.venueServiceClient.getVenue(event.venue_id, authToken);
      if (venueDetails) {
        await this.securityValidator.validateVenueCapacity(data.capacity, venueDetails.capacity);
      }
    }

    if (data.name || data.event_date) {
      const duplicateCheck = await this.checkForDuplicateEvent(
        event.venue_id,
        new Date(data.event_date || event.event_date),
        data.name || event.name,
        eventId
      );
      
      if (duplicateCheck) {
        throw new ValidationError([{ 
          field: 'name', 
          message: 'An event with this name already exists at this venue on this date' 
        }]);
      }
    }

    const updated = await this.db.transaction(async (trx) => {
      const [updatedEvent] = await trx('events')
        .where({ id: eventId })
        .update({
          ...data,
          updated_at: new Date(),
          updated_by: userId
        })
        .returning('*');

      // Audit log - using the correct method signature
      await this.auditLogger.logEventUpdate(userId, eventId, data, {
        previousData: event,
        ...requestInfo
      });

      return updatedEvent;
    });

    // Clear caches
    await this.redis.del(`venue:events:${event.venue_id}`);
    await this.redis.del(`event:${eventId}`);

    logger.info({ eventId }, 'Event updated');
    return updated;
  }

  async deleteEvent(eventId: string, authToken: string, userId: string, requestInfo?: any): Promise<void> {
    const event = await this.getEvent(eventId);

    // Validate venue access
    const hasAccess = await this.venueServiceClient.validateVenueAccess(event.venue_id, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    // Validate deletion is allowed
    await this.securityValidator.validateEventDeletion(eventId);
    
    // Check if there are any tickets sold
    const ticketCount = await this.db('tickets')
      .where({ event_id: eventId })
      .count('id as count')
      .first();
    
    if (ticketCount && parseInt(ticketCount.count as string) > 0) {
      throw new ValidationError([{ 
        field: 'event', 
        message: 'Cannot delete event with sold tickets' 
      }]);
    }

    await this.db.transaction(async (trx) => {
      await trx('events')
        .where({ id: eventId })
        .update({
          deleted_at: new Date(),
          deleted_by: userId,
          status: 'cancelled'
        });

      // Audit log
      await this.auditLogger.logEventDeletion(userId, eventId, {
        event,
        ...requestInfo
      });
    });

    // Clear caches
    await this.redis.del(`venue:events:${event.venue_id}`);
    await this.redis.del(`event:${eventId}`);

    logger.info({ eventId }, 'Event deleted');
  }

  async getVenueEvents(venueId: string, authToken: string): Promise<Event[]> {
    // Check cache first
    const cached = await this.redis.get(`venue:events:${venueId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Validate venue access
    const hasAccess = await this.venueServiceClient.validateVenueAccess(venueId, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    const events = await this.db('events')
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .orderBy('event_date', 'asc');

    // Cache for 5 minutes
    await this.redis.setex(`venue:events:${venueId}`, 300, JSON.stringify(events));

    return events;
  }

  // Helper method to check for duplicate events
  private async checkForDuplicateEvent(
    venueId: string, 
    eventDate: Date, 
    eventName: string, 
    excludeEventId?: string
  ): Promise<boolean> {
    const query = this.db('events')
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .where('name', 'ilike', eventName)
      .whereRaw('DATE(event_date) = DATE(?)', [eventDate.toISOString()]);
    
    if (excludeEventId) {
      query.whereNot('id', excludeEventId);
    }
    
    const existing = await query.first();
    return !!existing;
  }
}
```

### FILE: src/services/databaseService.ts
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

### FILE: src/services/capacity.service.ts
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

### FILE: src/services/pricing.service.ts
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
      return currentPrice;
    }

    // Apply adjustment
    if (rule.adjustment.type === 'percentage') {
      const adjustedPrice = currentPrice * (1 + rule.adjustment.value / 100);
      logger.info({
        originalPrice: currentPrice,
        percentage: rule.adjustment.value,
        adjustedPrice
      }, 'Applying percentage adjustment');
      return adjustedPrice;
    } else {
      return currentPrice + rule.adjustment.value;
    }
  }

  private async checkTimeBased(conditions: any, ticketType: any): Promise<boolean> {
    const daysBefore = conditions.days_before;
    if (!daysBefore) return false;

    const event = await this.db('events')
      .where({ id: ticketType.event_id })
      .first();

    if (!event) {
      logger.error({ eventId: ticketType.event_id }, 'Event not found for pricing rule');
      return false;
    }

    const eventDate = new Date(event.event_date);
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysUntilEvent = Math.floor((eventDate.getTime() - now.getTime()) / msPerDay);

    logger.info({
      eventDate: event.event_date,
      now: now.toISOString(),
      daysUntilEvent,
      daysBeforeThreshold: daysBefore,
      shouldApply: daysUntilEvent >= daysBefore
    }, 'Time-based rule check');

    // Apply discount if we're MORE than 'daysBefore' days from the event
    return daysUntilEvent >= daysBefore;
  }

  private async checkDemandBased(conditions: any): Promise<boolean> {
    const percentageSold = conditions.percentage_sold;
    if (!percentageSold) return false;

    // Since we don't have tickets table yet, return false
    logger.info('Demand-based pricing check skipped - tickets table not available');
    return false;
  }

  private async checkGroupDiscount(_conditions: any): Promise<boolean> {
    // This would be checked at purchase time with the actual quantity
    return false; // For now, group discounts are applied at checkout
  }

  private async invalidatePricingCache(ticketTypeId: string): Promise<void> {
    await this.redis.del(`price:${ticketTypeId}`);
  }
}
```

### FILE: src/types/index.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { Knex } from 'knex';
import Redis from 'ioredis';
import { AwilixContainer } from 'awilix';
import { VenueServiceClient } from '../services/venue-service.client';

// Base types
export interface AppConfig {
  port: number;
  host: string;
  environment: string;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  redis: {
    host: string;
    port: number;
  };
  services: {
    venueServiceUrl: string;
    authServiceUrl: string;
  };
}

export interface Dependencies {
  config: AppConfig;
  db: Knex;
  redis: Redis;
  venueServiceClient: VenueServiceClient;
  eventService: any; // Will be defined later
  pricingService: any; // Will be defined later
  capacityService: any; // Will be defined later
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
  };
  container: AwilixContainer<Dependencies>;
}

export type AuthenticatedHandler = (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => Promise<any>;

// Domain types
export interface Event {
  id: string;
  venue_id: string;
  name: string;
  description?: string;
  event_date: Date;
  doors_open?: Date;
  event_type: 'comedy' | 'concert' | 'theater' | 'sports' | 'conference' | 'other';
  status: 'draft' | 'published' | 'soldout' | 'cancelled';
  capacity: number;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  description?: string;
  base_price: number;
  quantity: number;
  max_per_order: number;
  sale_start?: Date;
  sale_end?: Date;
  metadata?: {
    section?: string;
    rows?: string;
    [key: string]: any;
  };
  created_at: Date;
  updated_at: Date;
}

export interface PricingRule {
  id: string;
  ticket_type_id: string;
  rule_type: 'time_based' | 'demand_based' | 'group';
  conditions: Record<string, any>;
  adjustment: {
    type: 'percentage' | 'fixed';
    value: number;
  };
  priority: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Service response types
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: any[];
}

// Error classes
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any[];

  constructor(message: string, statusCode: number, code: string, details?: any[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(details: any[]) {
    super('Validation failed', 422, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/validations/event-security.ts
```typescript
export interface EventSecurityConfig {
  maxAdvanceDays: number;
  minAdvanceHours: number;
  maxTicketsPerOrder: number;
  maxTicketsPerCustomer: number;
}

export class EventSecurityValidator {
  private config: EventSecurityConfig;

  constructor() {
    this.config = {
      maxAdvanceDays: 365,
      minAdvanceHours: 2,
      maxTicketsPerOrder: 10,
      maxTicketsPerCustomer: 50
    };
  }

  async validateTicketPurchase(
    _customerId: string,
    _eventId: string,
    quantity: number,
    existingTicketCount: number
  ): Promise<void> {
    if (quantity > this.config.maxTicketsPerOrder) {
      throw new Error(`Cannot purchase more than ${this.config.maxTicketsPerOrder} tickets per order`);
    }

    if (existingTicketCount + quantity > this.config.maxTicketsPerCustomer) {
      throw new Error(`Cannot purchase more than ${this.config.maxTicketsPerCustomer} tickets per event`);
    }
  }

  async validateEventDate(eventDate: Date): Promise<void> {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + this.config.maxAdvanceDays);
    
    const minDate = new Date();
    minDate.setHours(minDate.getHours() + this.config.minAdvanceHours);

    if (eventDate < minDate) {
      throw new Error(`Event must be scheduled at least ${this.config.minAdvanceHours} hours in advance`);
    }

    if (eventDate > maxDate) {
      throw new Error(`Event cannot be scheduled more than ${this.config.maxAdvanceDays} days in advance`);
    }
  }

  async validateEventModification(eventId: string, data: any): Promise<void> {
    if (!eventId) {
      throw new Error('Event ID is required for modification');
    }
    
    // Add more validation logic as needed
    if (data.date) {
      await this.validateEventDate(new Date(data.date));
    }
  }

  async validateEventDeletion(eventId: string): Promise<void> {
    if (!eventId) {
      throw new Error('Event ID is required for deletion');
    }
    
    // Add logic to check if event can be deleted (e.g., no tickets sold)
  }

  async validateVenueCapacity(requestedCapacity: number, venueCapacity: number): Promise<void> {
    if (requestedCapacity > venueCapacity) {
      throw new Error(`Event capacity (${requestedCapacity}) cannot exceed venue capacity (${venueCapacity})`);
    }
  }
}
```

### FILE: src/controllers/events.controller.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { v4 as uuidv4 } from 'uuid';
import { createDatabaseConnection } from '../config/database';

import { serviceCache } from '../services/cache-integration';
// WP-8: Import search indexer at the top of the file
// @ts-ignore - JavaScript file in shared root
const { SearchIndexerHelper } = require('../../../../shared/search-indexer-helper');
const searchIndexer = new SearchIndexerHelper('event-service');
searchIndexer.initialize().catch(console.error);
import { EventService } from '../services/event.service';
import { VenueServiceClient } from '../services/venue-service.client';
const db = createDatabaseConnection();

interface CreateEventBody {
  name: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  venue_id: string;
  tiers: Array<{
    name: string;
    price_cents: number;
    currency: string;
    total_qty: number;
  }>;
}

// Helper to get tenant UUID from string or use default
async function getTenantUuid(tenantId: string): Promise<string> {
  // Cache tenant lookups for 30 minutes
  const cacheKey = `tenant:${tenantId}`;

  const cached = await serviceCache.get(cacheKey);
  if (cached) return cached;

  if (tenantId === 'default') {
    const result = await db('tenants').where({ name: 'default' }).first();
    const uuid = result ? result.id : '550e8400-e29b-41d4-a716-446655440099';
    await serviceCache.set(cacheKey, uuid, 1800); // 30 min cache
    return uuid;
  }

  await serviceCache.set(cacheKey, tenantId, 1800);
  return tenantId;
}

// Add this helper function to index events

export async function createEvent(
  request: FastifyRequest<{ Body: CreateEventBody }>,
  reply: FastifyReply
) {
  try {
    const tenantIdHeader = (request.headers['x-tenant-id'] as string) || 'default';
    const { name, description, starts_at, ends_at, venue_id, tiers } = request.body;
    
    // Get auth token from request
    const authToken = request.headers.authorization as string;
    const userId = (request as any).user?.id || 'system';
    
    // Initialize services
    const venueClient = new VenueServiceClient();
    const eventService = new EventService(db, venueClient, null as any);
    
    // Validate venue exists and user has access
    try {
      const hasAccess = await venueClient.validateVenueAccess(venue_id, authToken);
      if (!hasAccess) {
        return reply.status(400).send({ 
          error: 'Invalid venue or no access to venue' 
        });
      }
    } catch (error: any) {
      if (error.message?.includes('does not exist')) {
        return reply.status(404).send({ 
          error: 'Venue does not exist' 
        });
      }
      throw error;
    }
    
    // Create event using the service (which has additional validation)
    const eventData = {
      venue_id,
      name,
      title: name,
      description,
      start_date: new Date(starts_at),
      end_date: new Date(ends_at),
      starts_at: new Date(starts_at),
      ends_at: new Date(ends_at),
      status: 'draft' as any,
      tiers
    };
    
    // Use transaction for event + tiers
    const trx = await db.transaction();
    try {
      const tenantUuid = await getTenantUuid(tenantIdHeader);
      
      // Create event
      const eventId = uuidv4();
      const [event] = await trx('events')
        .insert({
          id: eventId,
          tenant_id: tenantUuid,
          venue_id,
          title: name,
          name: name,
          description,
          start_date: new Date(starts_at),
          end_date: new Date(ends_at),
          starts_at: new Date(starts_at),
          ends_at: new Date(ends_at),
          status: 'draft',
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      
      // Create tiers
      if (tiers && tiers.length > 0) {
        const tierRecords = tiers.map(tier => ({
          id: uuidv4(),
          event_id: eventId,
          tenant_id: tenantUuid,
          name: tier.name,
          price_cents: tier.price_cents,
          currency: tier.currency || 'USD',
          total_qty: tier.total_qty,
          sold_qty: 0,
          reserved_qty: 0,
          created_at: new Date(),
          updated_at: new Date()
        }));
        await trx('event_tiers').insert(tierRecords);
      }
      
      await trx.commit();
      
      // Index for search after creation
      await searchIndexer.indexEvent({
        id: event.id,
        name: event.name,
        venue_id: event.venue_id,
        starts_at: event.starts_at
      });
      
      return reply.status(201).send(event);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  } catch (error: any) {
    console.error('Failed to create event:', error);
    return reply.status(500).send({ 
      error: 'Failed to create event' 
    });
  }
}

export async function getEvent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const eventId = request.params.id;
    const cacheKey = `event:${eventId}`;

    // Try cache first
    let eventData = await serviceCache.get(cacheKey);

    if (eventData) {
      reply.header('X-Cache', 'HIT');
      return reply.send(eventData);
    }

    // Cache miss - get from database
    const event = await db('events').where({ id: eventId }).first();

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    const tiers = await db('event_tiers').where({ event_id: event.id });

    eventData = {
      id: event.id,
      name: event.title || event.name,
      description: event.description,
      starts_at: event.starts_at || event.start_date,
      ends_at: event.ends_at || event.end_date,
      status: event.status,
      venue_id: event.venue_id,
      tiers
    };

    // Cache for 10 minutes
    await serviceCache.set(cacheKey, eventData, 600);

    reply.header('X-Cache', 'MISS');
    return reply.send(eventData);
  } catch (error) {
    console.error('Error fetching event:', error);
    return reply.status(500).send({ error: 'Failed to fetch event' });
  }
}

export async function listEvents(
  request: FastifyRequest<{ Querystring: { status?: string; limit?: number; offset?: number } }>,
  reply: FastifyReply
) {
  try {
    const { status = 'DRAFT', limit = 20, offset = 0 } = request.query;

    // Create cache key based on query params
    const cacheKey = `events:list:${status}:${limit}:${offset}`;

    // Try cache first
    let cachedEvents = await serviceCache.get(cacheKey);

    if (cachedEvents) {
      reply.header('X-Cache', 'HIT');
      return reply.send(cachedEvents);
    }

    // Cache miss - get from database
    let query = db('events');

    if (status) {
      query = query.where({ status: status.toLowerCase() });
    }

    const events = await query.limit(limit).offset(offset).orderBy('created_at', 'desc');

    const response = {
      events: events.map(e => ({
        id: e.id,
        name: e.title || e.name,
        description: e.description,
        starts_at: e.starts_at || e.start_date,
        ends_at: e.ends_at || e.end_date,
        status: e.status,
        venue_id: e.venue_id
      }))
    };

    // Cache for 5 minutes
    await serviceCache.set(cacheKey, response, 300);

    reply.header('X-Cache', 'MISS');
    return reply.send(response);
  } catch (error) {
    console.error('Error listing events:', error);
    return reply.status(500).send({ error: 'Failed to list events' });
  }
}

export async function publishEvent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const trx = await db.transaction();

  try {
    const tenantIdHeader = (request.headers['x-tenant-id'] as string) || 'default';
    const tenantUuid = await getTenantUuid(tenantIdHeader);
    const eventId = request.params.id;

    // Update event status
    const [event] = await trx('events')
      .where({ id: eventId })
      .update({ status: 'published', updated_at: new Date() })
      .returning('*');

    if (!event) {
      await trx.rollback();
      return reply.status(404).send({ error: 'Event not found' });
    }

    // Get tiers for pricing
    const tiers = await trx('event_tiers').where({ event_id: eventId });
    const prices = tiers.map(t => t.price_cents);

    // Upsert into search index
    await trx('search_index_events')
      .insert({
        id: uuidv4(),
        event_id: eventId,
        tenant_id: tenantUuid,
        name: event.title || event.name,
        description: event.description,
        starts_at: event.starts_at || event.start_date,
        ends_at: event.ends_at || event.end_date,
        status: 'PUBLISHED',
        min_price_cents: Math.min(...prices),
        created_at: new Date(),
        updated_at: new Date()
      })
      .onConflict('event_id')
      .merge();

    // WP-8: Re-index after publish
    const publishedEvent = await trx('events').where({ id: eventId }).first();
    try {
      await searchIndexer.indexEvent(publishedEvent);
      console.log(`✅ Event ${eventId} re-indexed after publish`);
    } catch (err) {
      console.error('Failed to re-index event:', err);
    }

    // Insert into outbox
    await trx('outbox').insert({
      id: uuidv4(),
      tenant_id: tenantUuid,
      aggregate_id: eventId,
      event_type: 'event.published',
      payload: JSON.stringify({
        event_id: eventId,
        name: event.title || event.name,
        status: 'PUBLISHED',
        published_at: new Date()
      }),
      processed: false,
      created_at: new Date()
    });

    await trx.commit();

    // Invalidate all caches for this event
    await serviceCache.delete([
      `event:${eventId}`,
      `events:list:*`,
      `venue:${event.venue_id}:events`
    ]);

    // Publish cache invalidation event
    try {
      const amqp = require('amqplib');
      const connection = await amqp.connect(process.env.AMQP_URL || 'amqp://admin:admin@rabbitmq:5672');
      const channel = await connection.createChannel();

      await channel.publish(
        'cache.invalidation',
        'event.published',
        Buffer.from(JSON.stringify({
          type: 'event.published',
          entityId: eventId,
          venueId: event.venue_id,
          timestamp: Date.now()
        }))
      );

      await connection.close();
    } catch (err) {
      console.error('Failed to publish invalidation:', err);
    }

    return reply.send({
      id: event.id,
      name: event.title || event.name,
      status: 'published',
      message: 'Event published successfully'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Error publishing event:', error);
    return reply.status(500).send({ error: 'Failed to publish event', details: (error as Error).message });
  }
}

export async function updateEvent(
  request: FastifyRequest<{ 
    Params: { id: string },
    Body: Partial<CreateEventBody> & { 
      status?: string,
      total_tickets?: number,
      available_tickets?: number 
    }
  }>,
  reply: FastifyReply
) {
  try {
    const eventId = request.params.id;
    const tenantIdHeader = (request.headers['x-tenant-id'] as string) || 'default';
    const updates = request.body;
    
    // Get auth token from request
    const authToken = request.headers.authorization as string;
    const userId = (request as any).user?.id || 'system';
    
    // Initialize services
    const venueClient = new VenueServiceClient();
    const eventService = new EventService(db, venueClient, null as any);
    
    // First check if event exists
    const existingEvent = await db('events')
      .where({ id: eventId })
      .first();
      
    if (!existingEvent) {
      return reply.status(404).send({
        error: 'Event not found'
      });
    }
    
    // If venue_id is being updated, validate the new venue
    if (updates.venue_id) {
      try {
        const hasAccess = await venueClient.validateVenueAccess(updates.venue_id, authToken);
        if (!hasAccess) {
          return reply.status(400).send({
            error: 'Invalid venue or no access to venue'
          });
        }
      } catch (error: any) {
        if (error.message?.includes('does not exist')) {
          return reply.status(404).send({
            error: 'Venue does not exist'
          });
        }
        throw error;
      }
    }
    
    // Build update object
    const updateData: any = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.starts_at) updateData.start_date = new Date(updates.starts_at);
    if (updates.ends_at) updateData.end_date = new Date(updates.ends_at);
    if (updates.venue_id) updateData.venue_id = updates.venue_id;
    if (updates.status) updateData.status = updates.status;
    if (updates.total_tickets !== undefined) updateData.total_tickets = updates.total_tickets;
    if (updates.available_tickets !== undefined) updateData.available_tickets = updates.available_tickets;
    
    updateData.updated_at = new Date();
    
    // Update the event
    await db('events')
      .where({ id: eventId })
      .update(updateData);
    
    // Fetch and return updated event
    const updatedEvent = await db('events')
      .where({ id: eventId })
      .first();
      
    // Clear cache for this event
    await serviceCache.delete(`event:${eventId}`);
    
    // Index updated event for search
    await searchIndexer.indexData('events', {
      id: updatedEvent.id,
      name: updatedEvent.name,
      description: updatedEvent.description,
      venue_id: updatedEvent.venue_id,
      status: updatedEvent.status,
      start_date: updatedEvent.start_date,
      end_date: updatedEvent.end_date
    });
    
    return reply.send({
      ...updatedEvent,
      venue_id: updatedEvent.venue_id
    });
    
  } catch (error) {
    console.error('Error updating event:', error);
    return reply.status(500).send({ 
      error: 'Failed to update event' 
    });
  }
}
```

### FILE: src/controllers/schedule.controller.ts
```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface ScheduleBody {
  eventId: string;
  scheduleType: 'single' | 'recurring';
  startDate: Date;
  endDate?: Date;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    daysOfWeek?: number[];
    endDate?: Date;
  };
}

export async function scheduleController(fastify: FastifyInstance) {
  // Create schedule
  fastify.post('/', async (request: FastifyRequest<{ Body: ScheduleBody }>, reply: FastifyReply) => {
    const { eventId, scheduleType, startDate, recurrence } = request.body;
    
    // TODO: Implement scheduling logic
    return reply.send({
      id: `schedule-${Date.now()}`,
      eventId,
      scheduleType,
      startDate,
      recurrence,
      status: 'active'
    });
  });

  // Get event schedule
  fastify.get('/:eventId', async (request: FastifyRequest<{ Params: { eventId: string } }>, reply: FastifyReply) => {
    const { eventId } = request.params;
    
    // TODO: Fetch actual schedule
    return reply.send({
      eventId,
      schedules: []
    });
  });
}
```

### FILE: src/controllers/eventController.ts
```typescript
import fetch from 'node-fetch';
import { Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { RedisService } from '../services/redisService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'EventController' });

interface EventFilter {
  category?: string;
  venue_id?: string;
  min_price?: number;
  max_price?: number;
  start_date?: string;
  end_date?: string;
  status?: string;
}

export class EventController {
  async create(req: Request, res: Response): Promise<void> {
    try {
      const db = DatabaseService.getPool();
      const {
        venue_id,
        name,
        description,
        start_date,
        end_date,
        status = "DRAFT",
        total_tickets = 0,
        available_tickets = 0
      } = req.body;

      if (!venue_id || !name || !start_date || !end_date) {
        res.status(400).json({
          error: "Missing required fields: venue_id, name, start_date, end_date"
        });
        return;
      }

      // Validate venue exists (check with venue service)
      try {
        const venueCheckResponse = await fetch(`http://tickettoken-venue:3002/api/v1/venues/${venue_id}`, {
          headers: {
            'Authorization': req.headers.authorization || ''
          }
        });

        if (venueCheckResponse.status === 404) {
          res.status(404).json({ error: "Venue does not exist" });
          return;
        }

        if (venueCheckResponse.status === 403) {
          res.status(403).json({ error: "No access to venue" });
          return;
        }

        if (!venueCheckResponse.ok) {
          throw new Error('Unable to validate venue');
        }
      } catch (error) {
        log.error("Venue validation failed", error);
        res.status(400).json({ error: "Unable to validate venue" });
        return;
      }

      // Generate slug from name
      const event_slug = name.toLowerCase().replace(/\s+/g, '-');

      const query = `
        INSERT INTO events (
          id, venue_id, name, description, start_date, end_date,
          status, total_tickets, available_tickets,
          event_name, event_date, event_status, event_slug,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12,
          NOW(), NOW()
        ) RETURNING *`;

      const result = await db.query(query, [
        venue_id,
        name,
        description,
        start_date,
        end_date,
        status.toUpperCase(),
        total_tickets,
        available_tickets,
        name,  // event_name (parameter 9)
        new Date(start_date),  // event_date (parameter 10)
        status.toUpperCase(),  // event_status (parameter 11)
        event_slug  // event_slug (parameter 12)
      ]);

      await RedisService.del("events:*");

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      log.error("Failed to create event", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  }

  async listEvents(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;

      const filters: EventFilter = {
        category: req.query.category as string,
        venue_id: req.query.venue_id as string,
        min_price: req.query.min_price ? parseFloat(req.query.min_price as string) : undefined,
        max_price: req.query.max_price ? parseFloat(req.query.max_price as string) : undefined,
        start_date: req.query.start_date as string,
        end_date: req.query.end_date as string,
        status: req.query.status as string || 'PUBLISHED'
      };

      const cacheKey = `events:${JSON.stringify({ page, limit, filters })}`;
      const cached = await RedisService.get(cacheKey);

      if (cached) {
        log.debug('Returning cached events');
        res.json(JSON.parse(cached));
        return;
      }

      const db = DatabaseService.getPool();
      let query = `
        SELECT
          e.id,
          e.name as title,
          e.description,
          e.venue_id,
          e.start_date,
          e.end_date,
          e.status,
          e.created_at,
          e.updated_at,
          v.name as venue_name,
          v.city as venue_city,
          e.total_tickets as total_capacity,
          e.available_tickets as tickets_available
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.id
        WHERE 1=1
      `;

      const params: any[] = [];
      let paramCount = 0;

      if (filters.status) {
        params.push(filters.status);
        query += ` AND e.status = $${++paramCount}`;
      }

      if (filters.category) {
        params.push(filters.category);
        query += ` AND e.category = $${++paramCount}`;
      }

      if (filters.venue_id) {
        params.push(filters.venue_id);
        query += ` AND e.venue_id = $${++paramCount}`;
      }

      if (filters.start_date) {
        params.push(filters.start_date);
        query += ` AND e.start_date >= $${++paramCount}`;
      }

      if (filters.end_date) {
        params.push(filters.end_date);
        query += ` AND e.end_date <= $${++paramCount}`;
      }

      if (filters.min_price !== undefined) {
        params.push(filters.min_price);
        query += ` AND tp.min_price >= $${++paramCount}`;
      }

      if (filters.max_price !== undefined) {
        params.push(filters.max_price);
        query += ` AND tp.max_price <= $${++paramCount}`;
      }

      const countQuery = `SELECT COUNT(*) FROM (${query}) as filtered_events`;
      const countResult = await db.query(countQuery, params);
      const totalCount = parseInt(countResult.rows[0].count);

      query += ` ORDER BY e.start_date ASC`;
      params.push(limit);
      query += ` LIMIT $${++paramCount}`;
      params.push(offset);
      query += ` OFFSET $${++paramCount}`;

      const result = await db.query(query, params);

      const response = {
        events: result.rows,
        pagination: {
          page,
          limit,
          total: totalCount,
          total_pages: Math.ceil(totalCount / limit)
        },
        filters
      };

      await RedisService.setex(cacheKey, 300, JSON.stringify(response));

      log.info('Events listed', { count: result.rows.length, page, filters });
      res.json(response);

    } catch (error) {
      log.error('Failed to list events', error);
      res.status(500).json({ error: 'Failed to list events' });
    }
  }

  async getEvent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const cacheKey = `event:${id}`;
      const cached = await RedisService.get(cacheKey);

      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }

      const db = DatabaseService.getPool();
      const result = await db.query(
        `SELECT
          e.*,
          v.name as venue_name,
          v.address as venue_address,
          v.city as venue_city,
          json_agg(
            DISTINCT jsonb_build_object(
              'id', tt.id,
              'name', tt.name,
              'price', tt.price,
              'available', tt.available_quantity
            )
          ) as ticket_types
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.id
        LEFT JOIN ticket_types tt ON tt.event_id = e.id
        WHERE e.id = $1
        GROUP BY e.id, v.id`,
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      const event = result.rows[0];

      await RedisService.setex(cacheKey, 300, JSON.stringify(event));

      res.json(event);

    } catch (error) {
      log.error('Failed to get event', error);
      res.status(500).json({ error: 'Failed to get event' });
    }
  }
}

export const eventController = new EventController();
```

### FILE: src/utils/error-response.ts
```typescript
import { FastifyReply } from 'fastify';

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: any;
  requestId?: string;
}

export class ErrorResponseBuilder {
  static send(reply: FastifyReply, statusCode: number, error: string, code: string, details?: any) {
    const response: ErrorResponse = {
      success: false,
      error,
      code,
      details,
      requestId: (reply.request as any).id
    };
    
    return reply.status(statusCode).send(response);
  }

  static validation(reply: FastifyReply, details: any) {
    return this.send(reply, 422, 'Validation failed', 'VALIDATION_ERROR', details);
  }

  static unauthorized(reply: FastifyReply, message: string = 'Unauthorized') {
    return this.send(reply, 401, message, 'UNAUTHORIZED');
  }

  static forbidden(reply: FastifyReply, message: string = 'Forbidden') {
    return this.send(reply, 403, message, 'FORBIDDEN');
  }

  static notFound(reply: FastifyReply, resource: string) {
    return this.send(reply, 404, `${resource} not found`, 'NOT_FOUND');
  }

  static conflict(reply: FastifyReply, message: string) {
    return this.send(reply, 409, message, 'CONFLICT');
  }

  static tooManyRequests(reply: FastifyReply, message: string = 'Too many requests') {
    return this.send(reply, 429, message, 'RATE_LIMIT_EXCEEDED');
  }

  static internal(reply: FastifyReply, message: string = 'Internal server error') {
    return this.send(reply, 500, message, 'INTERNAL_ERROR');
  }
}

// Error codes enum for consistency
export enum ErrorCodes {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}
```

### FILE: src/models/Tier.ts
```typescript
import { Knex } from 'knex';
import { createDatabaseConnection } from '../config/database';

const knex = createDatabaseConnection();

export interface ITier {
  id?: string;
  event_id: string;
  name: string;
  description?: string;
  price: number;
  total_quantity: number;
  available_quantity: number;
  metadata?: any;
  created_at?: Date;
}

export class TierModel {
  private db: Knex;
  private tableName = 'ticket_types';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: ITier): Promise<ITier> {
    const [tier] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return tier;
  }

  async findById(id: string): Promise<ITier | null> {
    const tier = await this.db(this.tableName)
      .where({ id })
      .first();
    return tier || null;
  }

  async findByEventId(eventId: string): Promise<ITier[]> {
    return this.db(this.tableName)
      .where({ event_id: eventId })
      .orderBy('price', 'asc');
  }

  async update(id: string, data: Partial<ITier>): Promise<ITier | null> {
    const [tier] = await this.db(this.tableName)
      .where({ id })
      .update(data)
      .returning('*');
    return tier || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }

  async decrementAvailability(id: string, quantity: number): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .where('available_quantity', '>=', quantity)
      .decrement('available_quantity', quantity);
    return result > 0;
  }
}

export default TierModel;
```

### FILE: src/models/Event.ts
```typescript
import { Knex } from 'knex';
import { createDatabaseConnection } from '../config/database';

const knex = createDatabaseConnection();

export interface IEvent {
  id?: string;
  title: string;
  description?: string;
  category?: string;
  venue_id?: string;
  start_date: Date;
  end_date: Date;
  status?: string;
  image_url?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class EventModel {
  private db: Knex;
  private tableName = 'events';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IEvent): Promise<IEvent> {
    const [event] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return event;
  }

  async findById(id: string): Promise<IEvent | null> {
    const event = await this.db(this.tableName)
      .where({ id })
      .first();
    return event || null;
  }

  async findAll(filters: Partial<IEvent> = {}): Promise<IEvent[]> {
    return this.db(this.tableName)
      .where(filters)
      .orderBy('start_date', 'asc');
  }

  async update(id: string, data: Partial<IEvent>): Promise<IEvent | null> {
    const [event] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return event || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }

  async findByVenue(venueId: string): Promise<IEvent[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId })
      .orderBy('start_date', 'asc');
  }
}

export default EventModel;
```

### FILE: src/models/Performer.ts
```typescript
import { Knex } from 'knex';
import { createDatabaseConnection } from '../config/database';

const knex = createDatabaseConnection();

export interface IPerformer {
  id?: string;
  name: string;
  bio?: string;
  image_url?: string;
  genre?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class PerformerModel {
  private db: Knex;
  private tableName = 'performers';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IPerformer): Promise<IPerformer> {
    const [performer] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return performer;
  }

  async findById(id: string): Promise<IPerformer | null> {
    const performer = await this.db(this.tableName)
      .where({ id })
      .first();
    return performer || null;
  }

  async findAll(filters: Partial<IPerformer> = {}): Promise<IPerformer[]> {
    return this.db(this.tableName)
      .where(filters)
      .orderBy('name', 'asc');
  }

  async update(id: string, data: Partial<IPerformer>): Promise<IPerformer | null> {
    const [performer] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return performer || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default PerformerModel;
```

### FILE: src/models/Venue.ts
```typescript
import { Knex } from 'knex';
import { createDatabaseConnection } from '../config/database';

const knex = createDatabaseConnection();

export interface IVenue {
  id?: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  capacity?: number;
  metadata?: any;
  created_at?: Date;
}

export class VenueModel {
  private db: Knex;
  private tableName = 'venues';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IVenue): Promise<IVenue> {
    const [venue] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return venue;
  }

  async findById(id: string): Promise<IVenue | null> {
    const venue = await this.db(this.tableName)
      .where({ id })
      .first();
    return venue || null;
  }

  async findAll(filters: Partial<IVenue> = {}): Promise<IVenue[]> {
    return this.db(this.tableName)
      .where(filters)
      .orderBy('name', 'asc');
  }

  async update(id: string, data: Partial<IVenue>): Promise<IVenue | null> {
    const [venue] = await this.db(this.tableName)
      .where({ id })
      .update(data)
      .returning('*');
    return venue || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default VenueModel;
```

### FILE: src/services/capacity.service.ts
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

### FILE: src/types/index.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { Knex } from 'knex';
import Redis from 'ioredis';
import { AwilixContainer } from 'awilix';
import { VenueServiceClient } from '../services/venue-service.client';

// Base types
export interface AppConfig {
  port: number;
  host: string;
  environment: string;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  redis: {
    host: string;
    port: number;
  };
  services: {
    venueServiceUrl: string;
    authServiceUrl: string;
  };
}

export interface Dependencies {
  config: AppConfig;
  db: Knex;
  redis: Redis;
  venueServiceClient: VenueServiceClient;
  eventService: any; // Will be defined later
  pricingService: any; // Will be defined later
  capacityService: any; // Will be defined later
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
  };
  container: AwilixContainer<Dependencies>;
}

export type AuthenticatedHandler = (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => Promise<any>;

// Domain types
export interface Event {
  id: string;
  venue_id: string;
  name: string;
  description?: string;
  event_date: Date;
  doors_open?: Date;
  event_type: 'comedy' | 'concert' | 'theater' | 'sports' | 'conference' | 'other';
  status: 'draft' | 'published' | 'soldout' | 'cancelled';
  capacity: number;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  description?: string;
  base_price: number;
  quantity: number;
  max_per_order: number;
  sale_start?: Date;
  sale_end?: Date;
  metadata?: {
    section?: string;
    rows?: string;
    [key: string]: any;
  };
  created_at: Date;
  updated_at: Date;
}

export interface PricingRule {
  id: string;
  ticket_type_id: string;
  rule_type: 'time_based' | 'demand_based' | 'group';
  conditions: Record<string, any>;
  adjustment: {
    type: 'percentage' | 'fixed';
    value: number;
  };
  priority: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Service response types
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: any[];
}

// Error classes
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any[];

  constructor(message: string, statusCode: number, code: string, details?: any[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(details: any[]) {
    super('Validation failed', 422, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/event-service//src/routes/events.routes.ts:40:  // Update event (NEW ENDPOINT)
backend/services/event-service//src/routes/events.routes.ts:58:  }, eventsController.updateEvent as any);
backend/services/event-service//src/config/database.ts:32:  db.raw('SELECT 1')
backend/services/event-service//src/migrations/create_events_tables.sql:14:    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
backend/services/event-service//src/migrations/seed_test_events.sql:2:INSERT INTO venues (id, name, city, state, capacity) VALUES
backend/services/event-service//src/migrations/seed_test_events.sql:9:INSERT INTO events (title, description, category, venue_id, start_date, end_date, status) VALUES
backend/services/event-service//src/migrations/seed_test_events.sql:17:INSERT INTO ticket_types (event_id, name, price, total_quantity, available_quantity)
backend/services/event-service//src/migrations/seed_test_events.sql:18:SELECT id, 'General Admission', 75.00, 1000, 950 FROM events WHERE title = 'Summer Music Festival'
backend/services/event-service//src/migrations/seed_test_events.sql:20:SELECT id, 'VIP', 250.00, 100, 85 FROM events WHERE title = 'Summer Music Festival';
backend/services/event-service//src/index.ts:35:  DatabaseService.getPool().query("SELECT set_config('app.tenant_id', $1, false)", [tenantId])
backend/services/event-service//src/index.ts:70:// Update event route
backend/services/event-service//src/index.ts:76:    const updates = req.body;
backend/services/event-service//src/index.ts:82:      const eventCheck = await db.query('SELECT id, venue_id FROM events WHERE id = $1', [id]);
backend/services/event-service//src/index.ts:88:      // SECURITY FIX: Whitelist allowed update fields
backend/services/event-service//src/index.ts:102:      // Build update query dynamically but safely
backend/services/event-service//src/index.ts:103:      const updateFields = [];
backend/services/event-service//src/index.ts:109:        if (field === 'start_date' && (updates.start_date || updates.starts_at)) {
backend/services/event-service//src/index.ts:110:          updateFields.push(`start_date = $${paramCount++}`);
backend/services/event-service//src/index.ts:111:          values.push(updates.start_date || updates.starts_at);
backend/services/event-service//src/index.ts:112:        } else if (field === 'end_date' && (updates.end_date || updates.ends_at)) {
backend/services/event-service//src/index.ts:113:          updateFields.push(`end_date = $${paramCount++}`);
backend/services/event-service//src/index.ts:114:          values.push(updates.end_date || updates.ends_at);
backend/services/event-service//src/index.ts:115:        } else if (updates[field] !== undefined && field !== 'starts_at' && field !== 'ends_at') {
backend/services/event-service//src/index.ts:116:          updateFields.push(`${field} = $${paramCount++}`);
backend/services/event-service//src/index.ts:117:          values.push(updates[field]);
backend/services/event-service//src/index.ts:121:      if (updateFields.length === 0) {
backend/services/event-service//src/index.ts:122:        res.status(400).json({ error: 'No valid fields to update' });
backend/services/event-service//src/index.ts:126:      updateFields.push(`updated_at = $${paramCount++}`);
backend/services/event-service//src/index.ts:134:      const query = `UPDATE events SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
backend/services/event-service//src/index.ts:145:      res.status(500).json({ error: 'Failed to update event' });
backend/services/event-service//src/index.ts:162:        `SELECT
backend/services/event-service//src/index.ts:193:        `SELECT COUNT(*) as sales_count, COALESCE(SUM(total_amount), 0) as total_revenue
backend/services/event-service//src/index.ts:246:      // Update event status to PUBLISHED
backend/services/event-service//src/index.ts:248:        `UPDATE events
backend/services/event-service//src/index.ts:252:             updated_at = NOW()
backend/services/event-service//src/controllers/venueController.ts:16:        `SELECT
backend/services/event-service//src/controllers/venueController.ts:37:        `SELECT
backend/services/event-service//src/controllers/venueController.ts:58:        `SELECT
backend/services/event-service//src/controllers/venueController.ts:70:        `SELECT
backend/services/event-service//src/controllers/venueController.ts:118:        `SELECT
backend/services/event-service//src/controllers/capacity.controller.ts:4:const updateCapacitySchema = Joi.object({
backend/services/event-service//src/controllers/capacity.controller.ts:20:export const updateCapacity: AuthenticatedHandler = async (request, reply) => {
backend/services/event-service//src/controllers/capacity.controller.ts:23:  const { error, value } = updateCapacitySchema.validate(request.body);
backend/services/event-service//src/controllers/capacity.controller.ts:52:  await capacityService.updateCapacity(id, value.capacity);
backend/services/event-service//src/controllers/capacity.controller.ts:56:    data: { message: 'Capacity updated successfully' }
backend/services/event-service//src/controllers/tickets.controller.ts:55:      updated_at: new Date()
backend/services/event-service//src/controllers/tickets.controller.ts:65:export const updateTicketType: AuthenticatedHandler = async (request, reply) => {
backend/services/event-service//src/controllers/tickets.controller.ts:92:    // Only allow certain updates after sales begin
backend/services/event-service//src/controllers/tickets.controller.ts:93:    const allowedUpdates = ['description', 'sale_end', 'metadata'];
backend/services/event-service//src/controllers/tickets.controller.ts:94:    const updates = Object.keys(value).filter(key => !allowedUpdates.includes(key));
backend/services/event-service//src/controllers/tickets.controller.ts:96:    if (updates.length > 0) {
backend/services/event-service//src/controllers/tickets.controller.ts:101:        details: [{ field: updates.join(', '), message: 'Field cannot be modified after sales begin' }]
backend/services/event-service//src/controllers/tickets.controller.ts:106:  const [updated] = await db('ticket_types')
backend/services/event-service//src/controllers/tickets.controller.ts:108:    .update({
backend/services/event-service//src/controllers/tickets.controller.ts:110:      updated_at: new Date()
backend/services/event-service//src/controllers/tickets.controller.ts:114:  if (!updated) {
backend/services/event-service//src/controllers/tickets.controller.ts:124:    data: updated
backend/services/event-service//src/controllers/events.controller.ts:119:          updated_at: new Date()
backend/services/event-service//src/controllers/events.controller.ts:136:          updated_at: new Date()
backend/services/event-service//src/controllers/events.controller.ts:272:    // Update event status
backend/services/event-service//src/controllers/events.controller.ts:275:      .update({ status: 'published', updated_at: new Date() })
backend/services/event-service//src/controllers/events.controller.ts:300:        updated_at: new Date()
backend/services/event-service//src/controllers/events.controller.ts:314:    // Insert into outbox
backend/services/event-service//src/controllers/events.controller.ts:374:export async function updateEvent(
backend/services/event-service//src/controllers/events.controller.ts:388:    const updates = request.body;
backend/services/event-service//src/controllers/events.controller.ts:409:    // If venue_id is being updated, validate the new venue
backend/services/event-service//src/controllers/events.controller.ts:410:    if (updates.venue_id) {
backend/services/event-service//src/controllers/events.controller.ts:412:        const hasAccess = await venueClient.validateVenueAccess(updates.venue_id, authToken);
backend/services/event-service//src/controllers/events.controller.ts:428:    // Build update object
backend/services/event-service//src/controllers/events.controller.ts:429:    const updateData: any = {};
backend/services/event-service//src/controllers/events.controller.ts:430:    if (updates.name) updateData.name = updates.name;
backend/services/event-service//src/controllers/events.controller.ts:431:    if (updates.description !== undefined) updateData.description = updates.description;
backend/services/event-service//src/controllers/events.controller.ts:432:    if (updates.starts_at) updateData.start_date = new Date(updates.starts_at);
backend/services/event-service//src/controllers/events.controller.ts:433:    if (updates.ends_at) updateData.end_date = new Date(updates.ends_at);
backend/services/event-service//src/controllers/events.controller.ts:434:    if (updates.venue_id) updateData.venue_id = updates.venue_id;
backend/services/event-service//src/controllers/events.controller.ts:435:    if (updates.status) updateData.status = updates.status;
backend/services/event-service//src/controllers/events.controller.ts:436:    if (updates.total_tickets !== undefined) updateData.total_tickets = updates.total_tickets;
backend/services/event-service//src/controllers/events.controller.ts:437:    if (updates.available_tickets !== undefined) updateData.available_tickets = updates.available_tickets;
backend/services/event-service//src/controllers/events.controller.ts:439:    updateData.updated_at = new Date();
backend/services/event-service//src/controllers/events.controller.ts:441:    // Update the event
backend/services/event-service//src/controllers/events.controller.ts:444:      .update(updateData);
backend/services/event-service//src/controllers/events.controller.ts:446:    // Fetch and return updated event
backend/services/event-service//src/controllers/events.controller.ts:447:    const updatedEvent = await db('events')
backend/services/event-service//src/controllers/events.controller.ts:454:    // Index updated event for search
backend/services/event-service//src/controllers/events.controller.ts:456:      id: updatedEvent.id,
backend/services/event-service//src/controllers/events.controller.ts:457:      name: updatedEvent.name,
backend/services/event-service//src/controllers/events.controller.ts:458:      description: updatedEvent.description,
backend/services/event-service//src/controllers/events.controller.ts:459:      venue_id: updatedEvent.venue_id,
backend/services/event-service//src/controllers/events.controller.ts:460:      status: updatedEvent.status,
backend/services/event-service//src/controllers/events.controller.ts:461:      start_date: updatedEvent.start_date,
backend/services/event-service//src/controllers/events.controller.ts:462:      end_date: updatedEvent.end_date
backend/services/event-service//src/controllers/events.controller.ts:466:      ...updatedEvent,
backend/services/event-service//src/controllers/events.controller.ts:467:      venue_id: updatedEvent.venue_id
backend/services/event-service//src/controllers/events.controller.ts:473:      error: 'Failed to update event' 
backend/services/event-service//src/controllers/pricing.controller.ts:26:    .select('pricing_rules.*', 'ticket_types.name as ticket_type_name')
backend/services/event-service//src/controllers/customerController.ts:16:        `SELECT
backend/services/event-service//src/controllers/customerController.ts:41:        `SELECT
backend/services/event-service//src/controllers/customerController.ts:60:        `SELECT
backend/services/event-service//src/controllers/customerController.ts:77:        `SELECT
backend/services/event-service//src/controllers/eventController.ts:72:        INSERT INTO events (
backend/services/event-service//src/controllers/eventController.ts:76:          created_at, updated_at
backend/services/event-service//src/controllers/eventController.ts:134:        SELECT
backend/services/event-service//src/controllers/eventController.ts:143:          e.updated_at,
backend/services/event-service//src/controllers/eventController.ts:191:      const countQuery = `SELECT COUNT(*) FROM (${query}) as filtered_events`;
backend/services/event-service//src/controllers/eventController.ts:239:        `SELECT
backend/services/event-service//src/controllers/notificationController.ts:15:        `INSERT INTO notifications (user_id, type, title, message, status)
backend/services/event-service//src/controllers/notificationController.ts:36:        SELECT * FROM notifications
backend/services/event-service//src/controllers/notificationController.ts:68:        `UPDATE notifications
backend/services/event-service//src/controllers/notificationController.ts:77:      res.status(500).json({ error: 'Failed to update notification' });
backend/services/event-service//src/utils/audit-logger.ts:28:          updates: metadata.updates,
backend/services/event-service//src/utils/audit-logger.ts:67:  async logEventUpdate(
backend/services/event-service//src/utils/audit-logger.ts:73:    await this.logEventAction('updated', eventId, userId, {
backend/services/event-service//src/utils/audit-logger.ts:74:      updates: changes,
backend/services/event-service//src/models/Tier.ts:46:  async update(id: string, data: Partial<ITier>): Promise<ITier | null> {
backend/services/event-service//src/models/Tier.ts:49:      .update(data)
backend/services/event-service//src/models/Event.ts:18:  updated_at?: Date;
backend/services/event-service//src/models/Event.ts:49:  async update(id: string, data: Partial<IEvent>): Promise<IEvent | null> {
backend/services/event-service//src/models/Event.ts:52:      .update({ ...data, updated_at: new Date() })
backend/services/event-service//src/models/Performer.ts:14:  updated_at?: Date;
backend/services/event-service//src/models/Performer.ts:45:  async update(id: string, data: Partial<IPerformer>): Promise<IPerformer | null> {
backend/services/event-service//src/models/Performer.ts:48:      .update({ ...data, updated_at: new Date() })
backend/services/event-service//src/models/Venue.ts:47:  async update(id: string, data: Partial<IVenue>): Promise<IVenue | null> {
backend/services/event-service//src/models/Venue.ts:50:      .update(data)
backend/services/event-service//src/services/event.service.ts:66:          updated_at: new Date()
backend/services/event-service//src/services/event.service.ts:99:  async updateEvent(eventId: string, data: Partial<Event>, authToken: string, userId: string, requestInfo?: any): Promise<Event> {
backend/services/event-service//src/services/event.service.ts:139:    const updated = await this.db.transaction(async (trx) => {
backend/services/event-service//src/services/event.service.ts:140:      const [updatedEvent] = await trx('events')
backend/services/event-service//src/services/event.service.ts:142:        .update({
backend/services/event-service//src/services/event.service.ts:144:          updated_at: new Date(),
backend/services/event-service//src/services/event.service.ts:145:          updated_by: userId
backend/services/event-service//src/services/event.service.ts:150:      await this.auditLogger.logEventUpdate(userId, eventId, data, {
backend/services/event-service//src/services/event.service.ts:155:      return updatedEvent;
backend/services/event-service//src/services/event.service.ts:162:    logger.info({ eventId }, 'Event updated');
backend/services/event-service//src/services/event.service.ts:163:    return updated;
backend/services/event-service//src/services/event.service.ts:194:        .update({
backend/services/event-service//src/services/databaseService.ts:22:    await this.pool.query('SELECT NOW()');
backend/services/event-service//src/services/capacity.service.ts:38:      .select('status')
backend/services/event-service//src/services/capacity.service.ts:61:  async updateCapacity(eventId: string, newCapacity: number): Promise<void> {
backend/services/event-service//src/services/capacity.service.ts:70:      .update({ 
backend/services/event-service//src/services/capacity.service.ts:72:        updated_at: new Date()
backend/services/event-service//src/services/capacity.service.ts:76:    logger.info({ eventId, newCapacity }, 'Event capacity updated');
backend/services/event-service//src/services/pricing.service.ts:19:        updated_at: new Date()
backend/services/event-service//src/types/index.ts:66:  updated_at: Date;
backend/services/event-service//src/types/index.ts:86:  updated_at: Date;
backend/services/event-service//src/types/index.ts:101:  updated_at: Date;

### All JOIN operations:
backend/services/event-service//src/index.ts:134:      const query = `UPDATE events SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
backend/services/event-service//src/index.ts:174:        LEFT JOIN venues v ON e.venue_id = v.id
backend/services/event-service//src/controllers/venueController.ts:23:        LEFT JOIN events e ON e.venue_id = v.id
backend/services/event-service//src/controllers/venueController.ts:24:        LEFT JOIN ticket_types tt ON tt.event_id = e.id
backend/services/event-service//src/controllers/venueController.ts:46:        LEFT JOIN ticket_types tt ON tt.event_id = e.id
backend/services/event-service//src/controllers/venueController.ts:62:        JOIN events e ON e.id = o.event_id
backend/services/event-service//src/controllers/venueController.ts:125:        LEFT JOIN ticket_types tt ON tt.event_id = e.id
backend/services/event-service//src/controllers/tickets.controller.ts:101:        details: [{ field: updates.join(', '), message: 'Field cannot be modified after sales begin' }]
backend/services/event-service//src/controllers/pricing.controller.ts:24:    .join('ticket_types', 'pricing_rules.ticket_type_id', 'ticket_types.id')
backend/services/event-service//src/controllers/customerController.ts:28:        LEFT JOIN order_items oi ON oi.order_id = o.id
backend/services/event-service//src/controllers/customerController.ts:29:        JOIN events e ON e.id = o.event_id
backend/services/event-service//src/controllers/customerController.ts:30:        LEFT JOIN venues v ON v.id = e.venue_id
backend/services/event-service//src/controllers/customerController.ts:51:        LEFT JOIN order_items oi ON oi.order_id = o.id
backend/services/event-service//src/controllers/customerController.ts:52:        JOIN events e ON e.id = o.event_id
backend/services/event-service//src/controllers/customerController.ts:65:        LEFT JOIN order_items oi ON oi.order_id = o.id
backend/services/event-service//src/controllers/customerController.ts:66:        JOIN events e ON e.id = o.event_id
backend/services/event-service//src/controllers/customerController.ts:86:        LEFT JOIN order_items oi ON oi.order_id = o.id
backend/services/event-service//src/controllers/customerController.ts:87:        JOIN events e ON e.id = o.event_id
backend/services/event-service//src/controllers/customerController.ts:88:        LEFT JOIN venues v ON v.id = e.venue_id
backend/services/event-service//src/controllers/eventController.ts:149:        LEFT JOIN venues v ON e.venue_id = v.id
backend/services/event-service//src/controllers/eventController.ts:253:        LEFT JOIN venues v ON e.venue_id = v.id
backend/services/event-service//src/controllers/eventController.ts:254:        LEFT JOIN ticket_types tt ON tt.event_id = e.id

### All WHERE clauses:
backend/services/event-service//src/migrations/seed_test_events.sql:18:SELECT id, 'General Admission', 75.00, 1000, 950 FROM events WHERE title = 'Summer Music Festival'
backend/services/event-service//src/migrations/seed_test_events.sql:20:SELECT id, 'VIP', 250.00, 100, 85 FROM events WHERE title = 'Summer Music Festival';
backend/services/event-service//src/index.ts:82:      const eventCheck = await db.query('SELECT id, venue_id FROM events WHERE id = $1', [id]);
backend/services/event-service//src/index.ts:134:      const query = `UPDATE events SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
backend/services/event-service//src/index.ts:175:        WHERE e.id = $1`,
backend/services/event-service//src/index.ts:195:         WHERE event_id = $1 AND status != 'cancelled'`,
backend/services/event-service//src/index.ts:253:         WHERE id = $1
backend/services/event-service//src/controllers/venueController.ts:25:        WHERE v.id = $1
backend/services/event-service//src/controllers/venueController.ts:47:        WHERE e.venue_id = $1
backend/services/event-service//src/controllers/venueController.ts:63:        WHERE e.venue_id = $1
backend/services/event-service//src/controllers/venueController.ts:74:        WHERE venue_id = $1
backend/services/event-service//src/controllers/venueController.ts:126:        WHERE e.venue_id = $1
backend/services/event-service//src/controllers/customerController.ts:31:        WHERE o.user_id = $1
backend/services/event-service//src/controllers/customerController.ts:53:        WHERE o.user_id = $1
backend/services/event-service//src/controllers/customerController.ts:67:        WHERE o.user_id = $1
backend/services/event-service//src/controllers/customerController.ts:89:        WHERE o.user_id = $1
backend/services/event-service//src/controllers/eventController.ts:150:        WHERE 1=1
backend/services/event-service//src/controllers/eventController.ts:255:        WHERE e.id = $1
backend/services/event-service//src/controllers/notificationController.ts:37:        WHERE user_id = $1
backend/services/event-service//src/controllers/notificationController.ts:70:         WHERE id = $1`,

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

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
### .env.example
```
# ================================================
# EVENT-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: event-service
# Port: 3003
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=event-service           # Service identifier

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

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/services/venue-service.client.ts
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

### FILE: src/services/event.service.ts
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

    // Validate venue access
    const hasAccess = await this.venueServiceClient.validateVenueAccess(event.venue_id, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    // Check if event has already started
    if (new Date(event.event_date) < new Date()) {
      throw new ValidationError([{ field: 'event_date', message: 'Cannot modify past events' }]);
    }

    // Security validations
    await this.securityValidator.validateEventModification(eventId, data);

    if (data.capacity) {
      const venueDetails = await this.venueServiceClient.getVenue(event.venue_id, authToken);
      if (venueDetails) {
        await this.securityValidator.validateVenueCapacity(data.capacity, venueDetails.capacity);
      }
    }

    if (data.name || data.event_date) {
      const duplicateCheck = await this.checkForDuplicateEvent(
        event.venue_id,
        new Date(data.event_date || event.event_date),
        data.name || event.name,
        eventId
      );
      
      if (duplicateCheck) {
        throw new ValidationError([{ 
          field: 'name', 
          message: 'An event with this name already exists at this venue on this date' 
        }]);
      }
    }

    const updated = await this.db.transaction(async (trx) => {
      const [updatedEvent] = await trx('events')
        .where({ id: eventId })
        .update({
          ...data,
          updated_at: new Date(),
          updated_by: userId
        })
        .returning('*');

      // Audit log - using the correct method signature
      await this.auditLogger.logEventUpdate(userId, eventId, data, {
        previousData: event,
        ...requestInfo
      });

      return updatedEvent;
    });

    // Clear caches
    await this.redis.del(`venue:events:${event.venue_id}`);
    await this.redis.del(`event:${eventId}`);

    logger.info({ eventId }, 'Event updated');
    return updated;
  }

  async deleteEvent(eventId: string, authToken: string, userId: string, requestInfo?: any): Promise<void> {
    const event = await this.getEvent(eventId);

    // Validate venue access
    const hasAccess = await this.venueServiceClient.validateVenueAccess(event.venue_id, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    // Validate deletion is allowed
    await this.securityValidator.validateEventDeletion(eventId);
    
    // Check if there are any tickets sold
    const ticketCount = await this.db('tickets')
      .where({ event_id: eventId })
      .count('id as count')
      .first();
    
    if (ticketCount && parseInt(ticketCount.count as string) > 0) {
      throw new ValidationError([{ 
        field: 'event', 
        message: 'Cannot delete event with sold tickets' 
      }]);
    }

    await this.db.transaction(async (trx) => {
      await trx('events')
        .where({ id: eventId })
        .update({
          deleted_at: new Date(),
          deleted_by: userId,
          status: 'cancelled'
        });

      // Audit log
      await this.auditLogger.logEventDeletion(userId, eventId, {
        event,
        ...requestInfo
      });
    });

    // Clear caches
    await this.redis.del(`venue:events:${event.venue_id}`);
    await this.redis.del(`event:${eventId}`);

    logger.info({ eventId }, 'Event deleted');
  }

  async getVenueEvents(venueId: string, authToken: string): Promise<Event[]> {
    // Check cache first
    const cached = await this.redis.get(`venue:events:${venueId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Validate venue access
    const hasAccess = await this.venueServiceClient.validateVenueAccess(venueId, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    const events = await this.db('events')
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .orderBy('event_date', 'asc');

    // Cache for 5 minutes
    await this.redis.setex(`venue:events:${venueId}`, 300, JSON.stringify(events));

    return events;
  }

  // Helper method to check for duplicate events
  private async checkForDuplicateEvent(
    venueId: string, 
    eventDate: Date, 
    eventName: string, 
    excludeEventId?: string
  ): Promise<boolean> {
    const query = this.db('events')
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .where('name', 'ilike', eventName)
      .whereRaw('DATE(event_date) = DATE(?)', [eventDate.toISOString()]);
    
    if (excludeEventId) {
      query.whereNot('id', excludeEventId);
    }
    
    const existing = await query.first();
    return !!existing;
  }
}
```

### FILE: src/services/databaseService.ts
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

### FILE: src/services/redisService.ts
```typescript
import Redis from 'ioredis';
class RedisServiceClass {
  private client: Redis | null = null;
  async initialize(): Promise<void> {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'tickettoken-redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });
    await this.client.ping();
    console.log('Redis connected successfully');
  }
  async get(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client.get(key);
  }
  async setex(key: string, ttl: number, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');
    await this.client.setex(key, ttl, value);
  }
  async del(pattern: string): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');
    if (pattern.endsWith('*')) {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } else {
      await this.client.del(pattern);
    }
  }
  getClient(): Redis {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client;
  }
}
export const RedisService = new RedisServiceClass();
```

### FILE: src/services/capacity.service.ts
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

### FILE: src/services/pricing.service.ts
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
      return currentPrice;
    }

    // Apply adjustment
    if (rule.adjustment.type === 'percentage') {
      const adjustedPrice = currentPrice * (1 + rule.adjustment.value / 100);
      logger.info({
        originalPrice: currentPrice,
        percentage: rule.adjustment.value,
        adjustedPrice
      }, 'Applying percentage adjustment');
      return adjustedPrice;
    } else {
      return currentPrice + rule.adjustment.value;
    }
  }

  private async checkTimeBased(conditions: any, ticketType: any): Promise<boolean> {
    const daysBefore = conditions.days_before;
    if (!daysBefore) return false;

    const event = await this.db('events')
      .where({ id: ticketType.event_id })
      .first();

    if (!event) {
      logger.error({ eventId: ticketType.event_id }, 'Event not found for pricing rule');
      return false;
    }

    const eventDate = new Date(event.event_date);
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysUntilEvent = Math.floor((eventDate.getTime() - now.getTime()) / msPerDay);

    logger.info({
      eventDate: event.event_date,
      now: now.toISOString(),
      daysUntilEvent,
      daysBeforeThreshold: daysBefore,
      shouldApply: daysUntilEvent >= daysBefore
    }, 'Time-based rule check');

    // Apply discount if we're MORE than 'daysBefore' days from the event
    return daysUntilEvent >= daysBefore;
  }

  private async checkDemandBased(conditions: any): Promise<boolean> {
    const percentageSold = conditions.percentage_sold;
    if (!percentageSold) return false;

    // Since we don't have tickets table yet, return false
    logger.info('Demand-based pricing check skipped - tickets table not available');
    return false;
  }

  private async checkGroupDiscount(_conditions: any): Promise<boolean> {
    // This would be checked at purchase time with the actual quantity
    return false; // For now, group discounts are applied at checkout
  }

  private async invalidatePricingCache(ticketTypeId: string): Promise<void> {
    await this.redis.del(`price:${ticketTypeId}`);
  }
}
```

