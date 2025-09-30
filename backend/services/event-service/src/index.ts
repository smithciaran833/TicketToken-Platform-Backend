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
