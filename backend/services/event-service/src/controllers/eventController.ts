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
