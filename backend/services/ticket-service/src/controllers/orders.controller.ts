/**
 * Orders Controller - ticket-service
 *
 * PHASE 5c REFACTORED: Service Boundary Fix
 *
 * This controller now uses proper service clients instead of direct database queries:
 * - Orders data: OrderServiceClient (from @tickettoken/shared)
 * - Events data: EventServiceClient (from @tickettoken/shared)
 * - Tickets data: Local database (this is our domain)
 *
 * CRITICAL: Direct database queries to other services' tables have been removed.
 * This prevents tight coupling and allows independent service deployment.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { DatabaseService } from '../services/databaseService';
import { formatCents } from '@tickettoken/shared';
import { logger } from '../utils/logger';
import { createRequestContext } from '../clients';
import { ExtendedOrderServiceClient } from '../clients/extended-clients';

const log = logger.child({ component: 'OrdersController' });

// Initialize service clients (using extended client with getUserOrders method)
const orderServiceClient = new ExtendedOrderServiceClient();

/**
 * Helper to create request context for service calls
 */
function getRequestContext(request: FastifyRequest) {
  const tenantId = (request as any).tenantId || (request as any).user?.tenant_id || 'default';
  const userId = (request as any).user?.id;
  const traceId = request.headers['x-trace-id'] as string || request.headers['x-request-id'] as string;

  return createRequestContext(tenantId, userId, traceId);
}

export class OrdersController {
  /**
   * Get order by ID
   *
   * SERVICE BOUNDARY: Calls order-service for order data
   */
  async getOrderById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { orderId } = request.params as any;
    const userId = (request as any).user?.id || (request as any).user?.sub;

    if (!orderId) {
      return reply.status(400).send({ error: 'Order ID is required' });
    }

    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    try {
      const ctx = getRequestContext(request);

      // SERVICE BOUNDARY FIX: Call order-service instead of direct DB query
      const order = await orderServiceClient.getOrder(orderId, ctx);

      // Verify the order belongs to the requesting user
      if (order.userId !== userId) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      // Get order items from order-service
      const items = await orderServiceClient.getOrderItems(orderId, ctx);

      // SECURITY: payment_intent_id is not returned by the service client
      const response = {
        orderId: order.id,
        status: order.status,
        totalCents: order.totalCents,
        totalFormatted: formatCents(order.totalCents),
        items: items.map((item) => ({
          id: item.id,
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalPriceCents: item.totalPriceCents,
          unitPriceFormatted: formatCents(item.unitPriceCents),
          totalPriceFormatted: formatCents(item.totalPriceCents)
        })),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        expiresAt: order.expiresAt
      };

      reply.send(response);
    } catch (error: any) {
      // Handle service client errors
      if (error.statusCode === 404) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      log.error('Error fetching order from order-service', {
        error: error.message,
        orderId,
        userId,
        statusCode: error.statusCode
      });

      reply.status(500).send({
        error: 'Internal server error',
        requestId: request.headers['x-request-id']
      });
    }
  }

  /**
   * Get user's orders
   *
   * SERVICE BOUNDARY: Calls order-service for order data
   */
  async getUserOrders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.id || (request as any).user?.sub;
    const { status, limit = 10, offset = 0 } = request.query as any;

    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    try {
      const ctx = getRequestContext(request);

      // SERVICE BOUNDARY FIX: Call order-service instead of direct DB query
      const ordersResponse = await orderServiceClient.getUserOrders(userId, {
        status,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      }, ctx);

      const formattedOrders = ordersResponse.orders.map((order: { id: string; status: string; eventName?: string; eventId: string; totalCents: number; createdAt: string; updatedAt: string }) => ({
        orderId: order.id,
        status: order.status,
        eventName: order.eventName,
        eventId: order.eventId,
        totalCents: order.totalCents,
        totalFormatted: formatCents(order.totalCents),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }));

      reply.send({
        orders: formattedOrders,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          total: ordersResponse.total || formattedOrders.length
        }
      });
    } catch (error: any) {
      log.error('Error fetching user orders from order-service', {
        error: error.message,
        userId,
        statusCode: error.statusCode
      });

      reply.status(500).send({
        error: 'Internal server error',
        requestId: request.headers['x-request-id']
      });
    }
  }

  /**
   * Get user's tickets
   *
   * SERVICE BOUNDARY:
   * - Tickets: Local database (our domain)
   * - Events: Uses event_id stored on ticket (no JOIN to events table)
   */
  async getUserTickets(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.id || (request as any).user?.sub;
    const tenantId = (request as any).tenantId || (request as any).user?.tenant_id;
    const { eventId, status } = request.query as any;

    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    try {
      // Query local tickets table only - no cross-service JOINs
      const tickets = await DatabaseService.transaction(async (client) => {
        if (tenantId) {
          await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
        }

        // SERVICE BOUNDARY FIX: Only query local tables (tickets, ticket_types)
        // Event name will be fetched separately or stored denormalized on ticket
        let query = `
          SELECT
            t.id,
            t.status,
            t.is_nft,
            t.event_id,
            t.created_at as ticket_created_at,
            tt.name as ticket_type,
            tt.price
          FROM tickets t
          JOIN ticket_types tt ON t.ticket_type_id = tt.id
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

        query += ` ORDER BY t.created_at DESC`;

        const result = await client.query(query, queryParams);
        return result.rows;
      });

      const formattedTickets = tickets.map((ticket: any) => ({
        id: ticket.id,
        status: ticket.status,
        mintAddress: ticket.is_nft,
        eventId: ticket.event_id,
        // NOTE: eventName removed - would require cross-service call
        // Client can fetch event details separately if needed
        ticketType: ticket.ticket_type,
        priceCents: Math.round(Number(ticket.price) * 100),
        priceFormatted: formatCents(Math.round(Number(ticket.price) * 100)),
        createdAt: ticket.ticket_created_at
      }));

      reply.send({ tickets: formattedTickets });
    } catch (error: any) {
      log.error('Error fetching user tickets', { error: error.message, userId, eventId, status });
      reply.status(500).send({
        error: 'Internal server error',
        requestId: request.headers['x-request-id']
      });
    }
  }
}

export const ordersController = new OrdersController();
