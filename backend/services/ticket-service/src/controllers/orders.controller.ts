import { Request, Response } from 'express';
import { Pool } from 'pg';
import { formatCents } from '@tickettoken/shared';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export class OrdersController {
  async getOrderById(req: Request, res: Response): Promise<void> {
    const { orderId } = req.params;
    const userId = (req as any).user?.id || (req as any).user?.sub;

    if (!orderId) {
      res.status(400).json({ error: 'Order ID is required' });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const orderQuery = `
        SELECT
          o.id as order_id,
          o.status,
          o.user_id,
          o.total_amount_cents,
          o.created_at,
          o.updated_at,
          o.expires_at,
          o.payment_intent_id
        FROM orders o
        WHERE o.id = $1 AND o.user_id = $2
      `;

      const orderResult = await pool.query(orderQuery, [orderId, userId]);

      if (orderResult.rows.length === 0) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      const order = orderResult.rows[0];

      const itemsQuery = `
        SELECT
          oi.id,
          oi.order_id,
          oi.tier_id,
          oi.quantity,
          oi.unit_price_cents
        FROM order_items oi
        WHERE oi.order_id = $1
      `;

      const itemsResult = await pool.query(itemsQuery, [orderId]);

      const ticketsQuery = `
        SELECT
          t.id,
          t.mint_address,
          t.status,
          t.user_id
        FROM tickets t
        JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1 AND t.user_id = $2
      `;

      const ticketsResult = await pool.query(ticketsQuery, [orderId, userId]);

      const response = {
        orderId: order.order_id,
        status: order.status,
        totalCents: order.total_amount_cents,
        totalFormatted: formatCents(order.total_amount_cents),
        items: itemsResult.rows.map(item => ({
          id: item.id,
          tier_id: item.tier_id,
          quantity: item.quantity,
          unitPriceCents: item.unit_price_cents,
          totalPriceCents: item.unit_price_cents * item.quantity,
          unitPriceFormatted: formatCents(item.unit_price_cents),
          totalPriceFormatted: formatCents(item.unit_price_cents * item.quantity)
        })),
        payment_intent_id: order.payment_intent_id,
        tickets: ticketsResult.rows.length > 0 ? ticketsResult.rows.map(ticket => ({
          id: ticket.id,
          mint_address: ticket.mint_address,
          status: ticket.status
        })) : undefined,
        created_at: order.created_at,
        updated_at: order.updated_at,
        expires_at: order.expires_at
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({
        error: 'Internal server error',
        requestId: req.headers['x-request-id']
      });
    }
  }

  async getUserOrders(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    const { status, limit = 10, offset = 0 } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      let query = `
        SELECT
          o.id as order_id,
          o.status,
          o.total_amount_cents,
          o.created_at,
          o.updated_at,
          e.name as event_name,
          e.id as event_id
        FROM orders o
        LEFT JOIN events e ON o.event_id = e.id
        WHERE o.user_id = $1
      `;

      const queryParams: any[] = [userId];

      if (status) {
        query += ` AND o.status = $2`;
        queryParams.push(status);
      }

      query += ` ORDER BY o.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
      queryParams.push(limit, offset);

      const ordersResult = await pool.query(query, queryParams);

      const orders = ordersResult.rows.map(order => ({
        orderId: order.order_id,
        status: order.status,
        eventName: order.event_name,
        eventId: order.event_id,
        totalCents: order.total_amount_cents,
        totalFormatted: formatCents(order.total_amount_cents),
        createdAt: order.created_at,
        updatedAt: order.updated_at
      }));

      res.json({
        orders,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          total: orders.length
        }
      });
    } catch (error) {
      console.error('Error fetching user orders:', error);
      res.status(500).json({
        error: 'Internal server error',
        requestId: req.headers['x-request-id']
      });
    }
  }

  async getUserTickets(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    const { eventId, status } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      let query = `
        SELECT
          t.id,
          t.ticket_number,
          t.status,
          t.mint_address,
          t.created_at,
          e.name as event_name,
          e.id as event_id,
          e.start_date,
          tt.name as ticket_type,
          tt.price_cents
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN events e ON t.event_id = e.id
        WHERE t.user_id = $1
      `;

      const queryParams: any[] = [userId];

      if (eventId) {
        query += ` AND t.event_id = $2`;
        queryParams.push(eventId);
      }

      if (status) {
        query += ` AND t.status = $${queryParams.length + 1}`;
        queryParams.push(status);
      }

      query += ` ORDER BY e.start_date DESC, t.created_at DESC`;

      const ticketsResult = await pool.query(query, queryParams);

      const tickets = ticketsResult.rows.map(ticket => ({
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        status: ticket.status,
        mintAddress: ticket.mint_address,
        eventName: ticket.event_name,
        eventId: ticket.event_id,
        eventDate: ticket.start_date,
        ticketType: ticket.ticket_type,
        priceCents: ticket.price_cents,
        priceFormatted: formatCents(ticket.price_cents),
        createdAt: ticket.created_at
      }));

      res.json({ tickets });
    } catch (error) {
      console.error('Error fetching user tickets:', error);
      res.status(500).json({
        error: 'Internal server error',
        requestId: req.headers['x-request-id']
      });
    }
  }
}

export const ordersController = new OrdersController();
