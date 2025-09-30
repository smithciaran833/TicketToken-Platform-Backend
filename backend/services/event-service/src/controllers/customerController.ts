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
