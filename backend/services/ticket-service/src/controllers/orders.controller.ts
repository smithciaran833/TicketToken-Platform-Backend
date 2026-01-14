import { FastifyRequest, FastifyReply } from 'fastify';
import { DatabaseService } from '../services/databaseService';
import { formatCents } from '@tickettoken/shared';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'OrdersController' });

export class OrdersController {
  async getOrderById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { orderId } = request.params as any;
    const userId = (request as any).user?.id || (request as any).user?.sub;
    const tenantId = (request as any).tenantId || (request as any).user?.tenant_id;

    if (!orderId) {
      return reply.status(400).send({ error: 'Order ID is required' });
    }

    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    try {
      const result = await DatabaseService.transaction(async (client) => {
        if (tenantId) {
          await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
        }

        const orderQuery = `
          SELECT
            o.id as order_id,
            o.status,
            o.user_id,
            o.total_cents,
            o.created_at,
            o.updated_at,
            o.reservation_expires_at,
            o.payment_intent_id
          FROM orders o
          WHERE o.id = $1 AND o.user_id = $2
        `;

        const orderResult = await client.query(orderQuery, [orderId, userId]);

        if (orderResult.rows.length === 0) {
          return null;
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

        const itemsResult = await client.query(itemsQuery, [orderId]);

        return { order, items: itemsResult.rows };
      });

      if (!result) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      const { order, items } = result;

      const response = {
        orderId: order.order_id,
        status: order.status,
        totalCents: Number(order.total_cents),
        totalFormatted: formatCents(Number(order.total_cents)),
        items: items.map((item: any) => ({
          id: item.id,
          ticketTypeId: item.ticket_type_id,
          quantity: item.quantity,
          unitPriceCents: Number(item.unit_price_cents),
          totalPriceCents: Number(item.total_price_cents),
          unitPriceFormatted: formatCents(Number(item.unit_price_cents)),
          totalPriceFormatted: formatCents(Number(item.total_price_cents))
        })),
        payment_intent_id: order.payment_intent_id,
        created_at: order.created_at,
        updated_at: order.updated_at,
        expires_at: order.reservation_expires_at
      };

      reply.send(response);
    } catch (error) {
      console.error('ORDERS CONTROLLER ERROR:', error);
      log.error('Error fetching order', { error, orderId, userId });
      reply.status(500).send({
        error: 'Internal server error',
        requestId: request.headers['x-request-id']
      });
    }
  }

  async getUserOrders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.id || (request as any).user?.sub;
    const tenantId = (request as any).tenantId || (request as any).user?.tenant_id;
    const { status, limit = 10, offset = 0 } = request.query as any;

    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    try {
      const orders = await DatabaseService.transaction(async (client) => {
        if (tenantId) {
          await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
        }

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

        const result = await client.query(query, queryParams);
        return result.rows;
      });

      const formattedOrders = orders.map((order: any) => ({
        orderId: order.order_id,
        status: order.status,
        eventName: order.event_name,
        eventId: order.event_id,
        totalCents: Number(order.total_cents),
        totalFormatted: formatCents(Number(order.total_cents)),
        createdAt: order.created_at,
        updatedAt: order.updated_at
      }));

      reply.send({
        orders: formattedOrders,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          total: orders.length
        }
      });
    } catch (error) {
      console.error('ORDERS CONTROLLER ERROR:', error);
      log.error('Error fetching user orders', { error, userId });
      reply.status(500).send({
        error: 'Internal server error',
        requestId: request.headers['x-request-id']
      });
    }
  }

  async getUserTickets(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.id || (request as any).user?.sub;
    const tenantId = (request as any).tenantId || (request as any).user?.tenant_id;
    const { eventId, status } = request.query as any;

    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    try {
      const tickets = await DatabaseService.transaction(async (client) => {
        if (tenantId) {
          await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
        }

        let query = `
          SELECT
            t.id,
            t.status,
            t.is_nft,
            t.created_at as ticket_created_at,
            e.name as event_name,
            e.id as event_id,
            e.created_at as event_date,
            tt.name as ticket_type,
            tt.price
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

        query += ` ORDER BY e.created_at DESC, t.created_at DESC`;

        const result = await client.query(query, queryParams);
        return result.rows;
      });

      const formattedTickets = tickets.map((ticket: any) => ({
        id: ticket.id,
        status: ticket.status,
        mintAddress: ticket.is_nft,
        eventName: ticket.event_name,
        eventId: ticket.event_id,
        eventDate: ticket.event_date,
        ticketType: ticket.ticket_type,
        priceCents: Math.round(Number(ticket.price) * 100),
        priceFormatted: formatCents(Math.round(Number(ticket.price) * 100)),
        createdAt: ticket.ticket_created_at
      }));

      reply.send({ tickets: formattedTickets });
    } catch (error) {
      console.error('ORDERS CONTROLLER ERROR:', error);
      log.error('Error fetching user tickets', { error, userId, eventId, status });
      reply.status(500).send({
        error: 'Internal server error',
        requestId: request.headers['x-request-id']
      });
    }
  }
}

export const ordersController = new OrdersController();
