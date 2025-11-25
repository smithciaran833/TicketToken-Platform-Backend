import { FastifyRequest, FastifyReply } from 'fastify';
import { DatabaseService } from '../services/databaseService';
import { formatCents } from '@tickettoken/shared';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'OrdersController' });

export class OrdersController {
  async getOrderById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const pool = DatabaseService.getPool();
    const { orderId } = request.params as any;
    const userId = (request as any).user?.id || (request as any).user?.sub;

    if (!orderId) {
      return reply.status(400).send({ error: 'Order ID is required' });
    }

    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    try {
      const orderQuery = `
        SELECT
          o.id as order_id,
          o.status,
          o.user_id,
          o.total_cents,
          o.created_at,
          o.updated_at,
          o.expires_at,
          o.payment_intent_id
        FROM orders o
        WHERE o.id = $1 AND o.user_id = $2
      `;

      const orderResult = await pool.query(orderQuery, [orderId, userId]);

      if (orderResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      const order = orderResult.rows[0];

      const itemsQuery = `
        SELECT
          oi.id,
          oi.order_id,
          oi.ticket_type_id,
          oi.quantity,
          oi.unit_price_cents,
          oi.total_price_cents
        FROM order_items oi
        WHERE oi.order_id = $1
      `;

      const itemsResult = await pool.query(itemsQuery, [orderId]);

      const ticketsQuery = `
        SELECT
          t.id,
          t.nft_mint_address as mint_address,
          t.status,
          t.user_id
        FROM tickets t
        WHERE t.order_id = $1 AND t.user_id = $2
      `;

      const ticketsResult = await pool.query(ticketsQuery, [orderId, userId]);

      const response = {
        orderId: order.order_id,
        status: order.status,
        totalCents: order.total_cents,
        totalFormatted: formatCents(order.total_cents),
        items: itemsResult.rows.map(item => ({
          id: item.id,
          ticketTypeId: item.ticket_type_id,  // FIXED: was tier_id
          quantity: item.quantity,
          unitPriceCents: item.unit_price_cents,
          totalPriceCents: item.total_price_cents,
          unitPriceFormatted: formatCents(item.unit_price_cents),
          totalPriceFormatted: formatCents(item.total_price_cents)
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

      reply.send(response);
    } catch (error) {
      log.error('Error fetching order', { error, orderId, userId });
      reply.status(500).send({
        error: 'Internal server error',
        requestId: request.headers['x-request-id']
      });
    }
  }

  async getUserOrders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.id || (request as any).user?.sub;
    const pool = DatabaseService.getPool();
    const { status, limit = 10, offset = 0 } = request.query as any;

    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    try {
      let query = `
        SELECT
          o.id as order_id,
          o.status,
          o.total_cents,
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
        totalCents: order.total_cents,
        totalFormatted: formatCents(order.total_cents),
        createdAt: order.created_at,
        updatedAt: order.updated_at
      }));

      reply.send({
        orders,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          total: orders.length
        }
      });
    } catch (error) {
      log.error('Error fetching user orders', { error, userId });
      reply.status(500).send({
        error: 'Internal server error',
        requestId: request.headers['x-request-id']
      });
    }
  }

  async getUserTickets(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.id || (request as any).user?.sub;
    const pool = DatabaseService.getPool();
    const { eventId, status } = request.query as any;

    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    try {
      let query = `
        SELECT
          t.id,
          t.status,
          t.nft_mint_address as mint_address,
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

      reply.send({ tickets });
    } catch (error) {
      log.error('Error fetching user tickets', { error, userId, eventId, status });
      reply.status(500).send({
        error: 'Internal server error',
        requestId: request.headers['x-request-id']
      });
    }
  }
}

export const ordersController = new OrdersController();
