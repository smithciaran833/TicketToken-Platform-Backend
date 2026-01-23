/**
 * Internal Routes - For service-to-service communication only
 *
 * These endpoints are protected by HMAC-based internal authentication
 * and are not accessible to end users.
 *
 * Phase B HMAC Standardization - Routes now use shared middleware
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../config/database';
import { internalAuthMiddleware } from '../middleware/internal-auth.middleware';

export async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply internal authentication to all routes using standardized middleware
  fastify.addHook('preHandler', internalAuthMiddleware);

  /**
   * GET /internal/orders/:orderId
   * Get order details by ID
   * Used by: payment-service
   */
  fastify.get('/internal/orders/:orderId', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const tenantId = request.headers['x-tenant-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;

    if (!orderId) {
      return reply.status(400).send({ error: 'Order ID required' });
    }

    try {
      let query = `
        SELECT 
          o.id, o.order_number, o.tenant_id, o.user_id, o.event_id,
          o.status, o.total_cents, o.subtotal_cents, o.fees_cents, o.tax_cents,
          o.discount_cents, o.currency, o.payment_intent_id, o.payment_method,
          o.billing_address, o.shipping_address,
          o.expires_at, o.confirmed_at, o.cancelled_at,
          o.created_at, o.updated_at, o.metadata
        FROM orders o
        WHERE o.id = $1 AND o.deleted_at IS NULL
      `;
      const params: any[] = [orderId];

      if (tenantId) {
        query += ` AND o.tenant_id = $2`;
        params.push(tenantId);
      }

      const pool = getDatabase();
      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      const order = result.rows[0];

      request.log.info({
        orderId,
        status: order.status,
        requestingService: request.headers['x-internal-service'],
        traceId,
      }, 'Internal order lookup');

      return reply.send({
        order: {
          id: order.id,
          orderNumber: order.order_number,
          tenantId: order.tenant_id,
          userId: order.user_id,
          eventId: order.event_id,
          status: order.status,
          totalCents: order.total_cents,
          subtotalCents: order.subtotal_cents,
          feesCents: order.fees_cents,
          taxCents: order.tax_cents,
          discountCents: order.discount_cents,
          currency: order.currency,
          paymentIntentId: order.payment_intent_id,
          paymentMethod: order.payment_method,
          billingAddress: order.billing_address,
          shippingAddress: order.shipping_address,
          expiresAt: order.expires_at,
          confirmedAt: order.confirmed_at,
          cancelledAt: order.cancelled_at,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          metadata: order.metadata,
        },
      });
    } catch (error: any) {
      request.log.error({ error, orderId, traceId }, 'Failed to get order');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /internal/orders/:orderId/items
   * Get order items by order ID
   * Used by: blockchain-service
   */
  fastify.get('/internal/orders/:orderId/items', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const tenantId = request.headers['x-tenant-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;

    if (!orderId) {
      return reply.status(400).send({ error: 'Order ID required' });
    }

    try {
      // First verify the order exists
      let orderQuery = `
        SELECT id, tenant_id FROM orders
        WHERE id = $1 AND deleted_at IS NULL
      `;
      const orderParams: any[] = [orderId];

      if (tenantId) {
        orderQuery += ` AND tenant_id = $2`;
        orderParams.push(tenantId);
      }

      const pool = getDatabase();
      const orderResult = await pool.query(orderQuery, orderParams);

      if (orderResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      // Get order items with ticket information
      const itemsQuery = `
        SELECT 
          oi.id, oi.order_id, oi.ticket_type_id, oi.ticket_id,
          oi.quantity, oi.unit_price_cents, oi.total_price_cents,
          oi.status, oi.created_at,
          tt.name as ticket_type_name, tt.description as ticket_type_description
        FROM order_items oi
        LEFT JOIN ticket_types tt ON oi.ticket_type_id = tt.id
        WHERE oi.order_id = $1 AND oi.deleted_at IS NULL
        ORDER BY oi.created_at
      `;

      const itemsResult = await pool.query(itemsQuery, [orderId]);

      request.log.info({
        orderId,
        itemCount: itemsResult.rows.length,
        requestingService: request.headers['x-internal-service'],
        traceId,
      }, 'Internal order items lookup');

      return reply.send({
        orderId,
        items: itemsResult.rows.map(item => ({
          id: item.id,
          orderId: item.order_id,
          ticketTypeId: item.ticket_type_id,
          ticketId: item.ticket_id,
          quantity: item.quantity,
          unitPriceCents: item.unit_price_cents,
          totalPriceCents: item.total_price_cents,
          status: item.status,
          ticketTypeName: item.ticket_type_name,
          ticketTypeDescription: item.ticket_type_description,
          createdAt: item.created_at,
        })),
        count: itemsResult.rows.length,
      });
    } catch (error: any) {
      request.log.error({ error, orderId, traceId }, 'Failed to get order items');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ============================================================================
  // PHASE 5a NEW ENDPOINTS - Additional internal APIs for bypass refactoring
  // ============================================================================

  /**
   * GET /internal/orders/without-tickets
   * Get orders that have been paid but don't have associated tickets
   * Used by: payment-service (reconciliation-service for orphaned payments)
   */
  fastify.get('/internal/orders/without-tickets', async (request, reply) => {
    const tenantId = request.headers['x-tenant-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;
    const { minutesOld, status, limit } = request.query as { 
      minutesOld?: string; 
      status?: string;
      limit?: string;
    };

    try {
      const pool = getDatabase();
      
      // Default to orders older than 5 minutes to avoid catching in-progress orders
      const ageMinutes = parseInt(minutesOld || '5');
      const cutoffTime = new Date(Date.now() - ageMinutes * 60 * 1000);
      
      // Default to looking for PAID orders without tickets
      const orderStatus = status || 'PAID';
      
      // Limit results to prevent overwhelming responses
      const maxResults = Math.min(parseInt(limit || '100'), 500);

      // Find orders that have the specified status but no tickets
      let query = `
        SELECT 
          o.id, o.order_number, o.tenant_id, o.user_id, o.event_id,
          o.status, o.total_cents, o.subtotal_cents, o.fees_cents,
          o.currency, o.payment_intent_id, o.payment_method,
          o.created_at, o.updated_at, o.confirmed_at,
          (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
        FROM orders o
        LEFT JOIN tickets t ON t.order_id = o.id AND t.deleted_at IS NULL
        WHERE o.status = $1 
          AND o.updated_at < $2
          AND o.deleted_at IS NULL
          AND t.id IS NULL
      `;
      const params: any[] = [orderStatus, cutoffTime.toISOString()];
      let paramIndex = 3;

      if (tenantId) {
        query += ` AND o.tenant_id = $${paramIndex}`;
        params.push(tenantId);
        paramIndex++;
      }

      query += ` ORDER BY o.updated_at ASC LIMIT $${paramIndex}`;
      params.push(maxResults);

      const result = await pool.query(query, params);

      request.log.info({
        found: result.rows.length,
        ageMinutes,
        orderStatus,
        requestingService: request.headers['x-internal-service'],
        traceId,
      }, 'Internal orphaned orders lookup');

      return reply.send({
        orders: result.rows.map(order => ({
          id: order.id,
          orderNumber: order.order_number,
          tenantId: order.tenant_id,
          userId: order.user_id,
          eventId: order.event_id,
          status: order.status,
          totalCents: order.total_cents,
          subtotalCents: order.subtotal_cents,
          feesCents: order.fees_cents,
          currency: order.currency,
          paymentIntentId: order.payment_intent_id,
          paymentMethod: order.payment_method,
          itemCount: parseInt(order.item_count || '0'),
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          confirmedAt: order.confirmed_at,
        })),
        count: result.rows.length,
        searchCriteria: {
          status: orderStatus,
          ageMinutes,
          tenantId: tenantId || 'all',
        },
      });
    } catch (error: any) {
      request.log.error({ error, traceId }, 'Failed to get orders without tickets');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /internal/orders/:orderId/for-payment
   * Get order with locking and payment intent details for payment processing
   * Used by: payment-service (database-transaction.util for payment processing)
   */
  fastify.get('/internal/orders/:orderId/for-payment', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const tenantId = request.headers['x-tenant-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;

    if (!orderId) {
      return reply.status(400).send({ error: 'Order ID required' });
    }

    try {
      const pool = getDatabase();

      // Get order with payment-relevant details
      // Note: We cannot use FOR UPDATE in a read-only internal API,
      // but we provide all data needed for the payment service to handle locking
      let query = `
        SELECT 
          o.id, o.order_number, o.tenant_id, o.user_id, o.event_id,
          o.status, o.total_cents, o.subtotal_cents, o.fees_cents, o.tax_cents,
          o.discount_cents, o.currency, o.payment_intent_id, o.payment_method,
          o.promo_code, o.billing_address, o.shipping_address,
          o.expires_at, o.confirmed_at, o.cancelled_at,
          o.created_at, o.updated_at, o.metadata,
          o.version,
          (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.deleted_at IS NULL) as item_count,
          (SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = o.id AND oi.deleted_at IS NULL) as ticket_count
        FROM orders o
        WHERE o.id = $1 AND o.deleted_at IS NULL
      `;
      const params: any[] = [orderId];

      if (tenantId) {
        query += ` AND o.tenant_id = $2`;
        params.push(tenantId);
      }

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      const order = result.rows[0];

      // Check if order is in a valid state for payment
      const isExpired = order.expires_at && new Date(order.expires_at) < new Date();
      const canProcessPayment = 
        (order.status === 'PENDING' || order.status === 'PAYMENT_PENDING') &&
        !isExpired &&
        !order.cancelled_at;

      // Get order items for payment validation
      const itemsQuery = `
        SELECT 
          oi.id, oi.ticket_type_id, oi.ticket_id, oi.quantity,
          oi.unit_price_cents, oi.total_price_cents, oi.status
        FROM order_items oi
        WHERE oi.order_id = $1 AND oi.deleted_at IS NULL
        ORDER BY oi.created_at
      `;
      const itemsResult = await pool.query(itemsQuery, [orderId]);

      request.log.info({
        orderId,
        status: order.status,
        canProcessPayment,
        itemCount: order.item_count,
        requestingService: request.headers['x-internal-service'],
        traceId,
      }, 'Internal order for payment lookup');

      return reply.send({
        order: {
          id: order.id,
          orderNumber: order.order_number,
          tenantId: order.tenant_id,
          userId: order.user_id,
          eventId: order.event_id,
          status: order.status,
          totalCents: order.total_cents,
          subtotalCents: order.subtotal_cents,
          feesCents: order.fees_cents,
          taxCents: order.tax_cents,
          discountCents: order.discount_cents,
          currency: order.currency,
          paymentIntentId: order.payment_intent_id,
          paymentMethod: order.payment_method,
          promoCode: order.promo_code,
          billingAddress: order.billing_address,
          shippingAddress: order.shipping_address,
          expiresAt: order.expires_at,
          confirmedAt: order.confirmed_at,
          cancelledAt: order.cancelled_at,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          metadata: order.metadata,
          version: order.version, // For optimistic locking
        },
        items: itemsResult.rows.map(item => ({
          id: item.id,
          ticketTypeId: item.ticket_type_id,
          ticketId: item.ticket_id,
          quantity: item.quantity,
          unitPriceCents: item.unit_price_cents,
          totalPriceCents: item.total_price_cents,
          status: item.status,
        })),
        paymentContext: {
          itemCount: parseInt(order.item_count || '0'),
          ticketCount: parseInt(order.ticket_count || '0'),
          canProcessPayment,
          isExpired,
          validationErrors: !canProcessPayment ? getOrderValidationErrors(order, isExpired) : [],
        },
      });
    } catch (error: any) {
      request.log.error({ error, orderId, traceId }, 'Failed to get order for payment');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}

/**
 * Helper function to get order validation errors
 */
function getOrderValidationErrors(order: any, isExpired: boolean): string[] {
  const errors: string[] = [];
  
  if (order.status !== 'PENDING' && order.status !== 'PAYMENT_PENDING') {
    errors.push(`Invalid order status: ${order.status}`);
  }
  if (isExpired) {
    errors.push('Order has expired');
  }
  if (order.cancelled_at) {
    errors.push('Order has been cancelled');
  }
  
  return errors;
}
