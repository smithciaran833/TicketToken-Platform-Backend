import { FastifyRequest, FastifyReply } from 'fastify';
import { OrderService } from '../services/order.service';
import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { OrderStatus } from '../types/order.types';

export class InternalController {
  private orderService: OrderService;

  constructor() {
    const pool = getDatabase();
    this.orderService = new OrderService(pool);
  }

  /**
   * POST /internal/v1/orders/:orderId/confirm
   * Confirm order after payment (called by payment-service)
   */
  async confirmOrder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { orderId } = request.params as { orderId: string };
      const tenantId = request.tenant.tenantId;
      const body = request.body as { paymentIntentId: string };
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      const order = await this.orderService.confirmOrder(tenantId, {
        orderId,
        paymentIntentId: body.paymentIntentId,
      });

      reply.send({
        orderId: order.id,
        status: order.status,
        confirmedAt: order.confirmedAt,
      });
    } catch (error) {
      logger.error('Error in internal confirmOrder', { error });
      reply.status(500).send({ error: 'Failed to confirm order' });
    }
  }

  /**
   * POST /internal/v1/orders/:orderId/expire
   * Manually expire reservation (called by scheduler)
   */
  async expireOrder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { orderId } = request.params as { orderId: string };
      const tenantId = request.tenant.tenantId;
      const body = request.body as { reason?: string };
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      await this.orderService.expireReservation(orderId, tenantId, body.reason || 'Reservation expired');

      reply.send({ message: 'Order expired successfully' });
    } catch (error) {
      logger.error('Error in internal expireOrder', { error });
      reply.status(500).send({ error: 'Failed to expire order' });
    }
  }

  /**
   * GET /internal/v1/orders/expiring
   * Get orders expiring soon (called by expiration job)
   */
  async getExpiringOrders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = request.tenant.tenantId;
      const { minutes = 5, limit = 100 } = request.query as { minutes?: number; limit?: number };
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }
      
      const orders = await this.orderService.getExpiringReservations(
        tenantId,
        parseInt(minutes.toString()),
        parseInt(limit.toString())
      );

      reply.send({ orders });
    } catch (error) {
      logger.error('Error in getExpiringOrders', { error });
      reply.status(500).send({ error: 'Failed to fetch expiring orders' });
    }
  }

  /**
   * POST /internal/v1/orders/bulk/cancel
   * Bulk cancel orders (event cancelled - called by event-service)
   */
  async bulkCancelOrders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = request.tenant.tenantId;
      const { eventId, reason } = request.body as { eventId?: string; reason?: string };

      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      if (!eventId || !reason) {
        return reply.status(400).send({ 
          error: 'eventId and reason are required' 
        });
      }

      logger.info('Starting bulk order cancellation', { eventId, reason, tenantId });

      // Find all active orders for this event
      const orders = await this.orderService.findOrdersByEvent(
        eventId,
        tenantId,
        [OrderStatus.PENDING, OrderStatus.RESERVED, OrderStatus.CONFIRMED]
      );

      if (orders.length === 0) {
        return reply.send({
          message: 'No active orders found for event',
          results: {
            total: 0,
            succeeded: 0,
            failed: 0,
            errors: []
          }
        });
      }

      logger.info('Found active orders to cancel', {
        eventId,
        orderCount: orders.length
      });

      const results = {
        total: orders.length,
        succeeded: 0,
        failed: 0,
        errors: [] as Array<{ orderId: string; orderNumber: string; error: string }>
      };

      // Cancel each order individually
      for (const order of orders) {
        try {
          await this.orderService.cancelOrder(tenantId, {
            orderId: order.id,
            userId: 'system',  // System-initiated cancellation
            reason: `Event cancelled: ${reason}`
          });

          results.succeeded++;
          
          logger.debug('Order cancelled successfully', {
            orderId: order.id,
            orderNumber: order.orderNumber
          });
        } catch (error) {
          results.failed++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          results.errors.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            error: errorMessage
          });

          logger.error('Failed to cancel order in bulk operation', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            error: errorMessage
          });
        }
      }

      logger.info('Bulk cancellation completed', {
        eventId,
        ...results
      });

      // Return appropriate status code
      const statusCode = results.failed === 0 ? 200 : 
                        results.succeeded === 0 ? 500 : 207; // 207 = Multi-Status

      reply.status(statusCode).send({
        message: `Bulk cancellation completed: ${results.succeeded} succeeded, ${results.failed} failed`,
        results
      });
    } catch (error) {
      logger.error('Error in bulkCancelOrders', { error });
      reply.status(500).send({ 
        error: 'Failed to bulk cancel orders',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
