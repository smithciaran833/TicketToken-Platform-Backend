import { FastifyRequest, FastifyReply } from 'fastify';
import { OrderService } from '../services/order.service';
import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { auditService } from '@tickettoken/shared';
import {
  CreateOrderRequest,
  ReserveOrderRequest,
  ConfirmOrderRequest,
  CancelOrderRequest,
  RefundOrderRequest,
} from '../types/order.types';
import { partialRefundService } from '../services/partial-refund.service';
import { PartialRefundRequest } from '../types/refund.types';
import { orderModificationService } from '../services/order-modification.service';
import { ModificationRequest, UpgradeRequest } from '../types/modification.types';

export class OrderController {
  private orderService: OrderService;

  constructor() {
    const pool = getDatabase();
    this.orderService = new OrderService(pool);
  }

  async createOrder(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      const body = request.body as CreateOrderRequest;

      const { order, items } = await this.orderService.createOrder(tenantId, {
        ...body,
        userId,
      });

      // Audit log: Order creation
      await auditService.logAction({
        service: 'order-service',
        action: 'create_order',
        actionType: 'CREATE',
        userId,
        resourceType: 'order',
        resourceId: order.id,
        newValue: {
          orderNumber: order.orderNumber,
          totalCents: order.totalCents,
          itemCount: items.length,
        },
        metadata: {
          eventId: body.eventId,
          items: body.items,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: true,
      });

      reply.status(201).send({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalCents: order.totalCents,
        currency: order.currency,
        items,
        createdAt: order.createdAt,
      });
    } catch (error) {
      logger.error('Error in createOrder controller', { error });
      reply.status(500).send({ error: 'Failed to create order' });
    }
  }

  async getOrder(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { orderId } = request.params as { orderId: string };
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      const isAdmin = request.user?.role === 'admin';

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      const result = await this.orderService.getOrder(orderId, tenantId);
      if (!result) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      const { order, items } = result;

      if (order.userId !== userId && !isAdmin) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      reply.send({
        ...order,
        items,
      });
    } catch (error) {
      logger.error('Error in getOrder controller', { error });
      reply.status(500).send({ error: 'Failed to get order' });
    }
  }

  async listOrders(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };

      const orders = await this.orderService.getUserOrders(userId, tenantId, limit, offset);

      reply.send({
        orders,
        pagination: {
          limit,
          offset,
          total: orders.length,
        },
      });
    } catch (error) {
      logger.error('Error in listOrders controller', { error });
      reply.status(500).send({ error: 'Failed to list orders' });
    }
  }

  async reserveOrder(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { orderId } = request.params as { orderId: string };
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      const result = await this.orderService.reserveOrder(tenantId, {
        orderId,
        userId,
      });

      reply.send({
        orderId: result.order.id,
        status: result.order.status,
        expiresAt: result.order.expiresAt,
        clientSecret: result.paymentIntent.clientSecret,
        paymentIntentId: result.order.paymentIntentId,
      });
    } catch (error) {
      logger.error('Error in reserveOrder controller', { error });
      reply.status(500).send({ error: 'Failed to reserve order' });
    }
  }

  async cancelOrder(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { orderId } = request.params as { orderId: string };
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      const { reason } = request.body as { reason: string };

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      // Get order before cancellation for audit log
      const beforeResult = await this.orderService.getOrder(orderId, tenantId);
      const beforeStatus = beforeResult?.order.status;

      const result = await this.orderService.cancelOrder(tenantId, {
        orderId,
        userId,
        reason: reason || 'User cancelled',
      });

      // Audit log: Order cancellation
      await auditService.logAction({
        service: 'order-service',
        action: 'cancel_order',
        actionType: 'UPDATE',
        userId,
        resourceType: 'order',
        resourceId: orderId,
        previousValue: { status: beforeStatus },
        newValue: {
          status: result.order.status,
          cancelledAt: result.order.cancelledAt,
          reason,
        },
        metadata: {
          refundAmount: result.refund?.refundAmountCents,
          refundId: result.refund?.id,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: true,
      });

      reply.send({
        orderId: result.order.id,
        status: result.order.status,
        cancelledAt: result.order.cancelledAt,
        refund: result.refund,
      });
    } catch (error) {
      logger.error('Error in cancelOrder controller', { error });

      // Audit log: Failed cancellation
      await auditService.logAction({
        service: 'order-service',
        action: 'cancel_order',
        actionType: 'UPDATE',
        userId: request.user?.id || 'unknown',
        resourceType: 'order',
        resourceId: (request.params as any).orderId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.status(500).send({ error: 'Failed to cancel order' });
    }
  }

  async refundOrder(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { orderId } = request.params as { orderId: string };
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      const userRole = request.user?.role;
      const body = request.body as Omit<RefundOrderRequest, 'orderId' | 'userId'>;

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      // Get order before refund for audit log
      const beforeResult = await this.orderService.getOrder(orderId, tenantId);
      const beforeStatus = beforeResult?.order.status;
      const orderTotal = beforeResult?.order.totalCents;

      const { order, refund } = await this.orderService.refundOrder(tenantId, {
        orderId,
        ...body,
        userId,
      });

      // Audit log: Refund (CRITICAL - money movement)
      await auditService.logAction({
        service: 'order-service',
        action: 'refund_order',
        actionType: 'UPDATE',
        userId,
        userRole,
        resourceType: 'order',
        resourceId: orderId,
        previousValue: {
          status: beforeStatus,
          refundStatus: 'none',
        },
        newValue: {
          status: order.status,
          refundAmount: refund.refundAmountCents,
          refundReason: body.reason,
          refundId: refund.id,
        },
        metadata: {
          orderTotal,
          refundAmount: refund.refundAmountCents,
          refundPercentage: orderTotal ? (refund.refundAmountCents / orderTotal) * 100 : 0,
          reason: body.reason,
          partialRefund: body.amountCents ? true : false,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: true,
      });

      reply.send({
        orderId: order.id,
        status: order.status,
        refund,
      });
    } catch (error) {
      logger.error('Error in refundOrder controller', { error });

      // Audit log: Failed refund attempt (CRITICAL)
      await auditService.logAction({
        service: 'order-service',
        action: 'refund_order',
        actionType: 'UPDATE',
        userId: request.user?.id || 'unknown',
        userRole: request.user?.role,
        resourceType: 'order',
        resourceId: (request.params as any).orderId,
        metadata: {
          attemptedAmount: (request.body as any)?.amountCents,
          reason: (request.body as any)?.reason,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.status(500).send({ error: 'Failed to refund order' });
    }
  }

  async getOrderEvents(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { orderId } = request.params as { orderId: string };
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      const isAdmin = request.user?.role === 'admin';

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      const result = await this.orderService.getOrder(orderId, tenantId);
      if (!result) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      const { order } = result;

      if (order.userId !== userId && !isAdmin) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const events = await this.orderService.getOrderEvents(orderId, tenantId);

      reply.send({ events });
    } catch (error) {
      logger.error('Error in getOrderEvents controller', { error });
      reply.status(500).send({ error: 'Failed to get order events' });
    }
  }

  async partialRefundOrder(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { orderId } = request.params as { orderId: string };
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      const userRole = request.user?.role;
      const body = request.body as Omit<PartialRefundRequest, 'orderId'>;

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      // Process partial refund
      const refund = await partialRefundService.processPartialRefund({
        orderId,
        ...body,
      });

      // Update order totals
      await partialRefundService.updateOrderTotals(orderId);

      // Audit log
      await auditService.logAction({
        service: 'order-service',
        action: 'partial_refund_order',
        actionType: 'UPDATE',
        userId,
        userRole,
        resourceType: 'order',
        resourceId: orderId,
        newValue: {
          refundId: refund.id,
          refundAmount: refund.amountCents,
          refundedItems: refund.refundedItems,
        },
        metadata: {
          itemCount: body.items.length,
          reason: body.reason,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: true,
      });

      reply.send({ refund });
    } catch (error) {
      logger.error('Error in partialRefundOrder controller', { error });
      reply.status(500).send({ error: 'Failed to process partial refund' });
    }
  }

  async getRefundHistory(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { orderId } = request.params as { orderId: string };
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      const isAdmin = request.user?.role === 'admin';

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      // Verify user owns order or is admin
      const result = await this.orderService.getOrder(orderId, tenantId);
      if (!result) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      if (result.order.userId !== userId && !isAdmin) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const refunds = await partialRefundService.getRefundHistory(orderId);

      reply.send({ refunds });
    } catch (error) {
      logger.error('Error in getRefundHistory controller', { error });
      reply.status(500).send({ error: 'Failed to get refund history' });
    }
  }

  async getRefund(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { orderId, refundId } = request.params as { orderId: string; refundId: string };
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      const isAdmin = request.user?.role === 'admin';

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      // Verify user owns order or is admin
      const result = await this.orderService.getOrder(orderId, tenantId);
      if (!result) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      if (result.order.userId !== userId && !isAdmin) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const refunds = await partialRefundService.getRefundHistory(orderId);
      const refund = refunds.find(r => r.id === refundId);

      if (!refund) {
        return reply.status(404).send({ error: 'Refund not found' });
      }

      reply.send({ refund });
    } catch (error) {
      logger.error('Error in getRefund controller', { error });
      reply.status(500).send({ error: 'Failed to get refund' });
    }
  }

  async requestModification(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { orderId } = request.params as { orderId: string };
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      const body = request.body as Omit<ModificationRequest, 'orderId'>;

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      const modification = await orderModificationService.requestModification(
        tenantId,
        userId,
        { orderId, ...body }
      );

      reply.send({ modification });
    } catch (error) {
      logger.error('Error in requestModification controller', { error });
      reply.status(500).send({ error: 'Failed to request modification' });
    }
  }

  async upgradeOrderItem(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { orderId } = request.params as { orderId: string };
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      const body = request.body as Omit<UpgradeRequest, 'orderId'>;

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      const modification = await orderModificationService.upgradeItem(
        tenantId,
        userId,
        { orderId, ...body }
      );

      reply.send({ modification });
    } catch (error) {
      logger.error('Error in upgradeOrderItem controller', { error });
      reply.status(500).send({ error: 'Failed to upgrade order item' });
    }
  }

  async getOrderModifications(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { orderId } = request.params as { orderId: string };
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      const isAdmin = request.user?.role === 'admin';

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      // Verify user owns order or is admin
      const result = await this.orderService.getOrder(orderId, tenantId);
      if (!result) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      if (result.order.userId !== userId && !isAdmin) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const modifications = await orderModificationService.getOrderModifications(orderId);

      reply.send({ modifications });
    } catch (error) {
      logger.error('Error in getOrderModifications controller', { error });
      reply.status(500).send({ error: 'Failed to get modifications' });
    }
  }

  async getModification(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { orderId, modificationId } = request.params as { orderId: string; modificationId: string };
      const userId = request.user?.id;
      const tenantId = request.tenant.tenantId;
      const isAdmin = request.user?.role === 'admin';

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      // Verify user owns order or is admin
      const result = await this.orderService.getOrder(orderId, tenantId);
      if (!result) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      if (result.order.userId !== userId && !isAdmin) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const modification = await orderModificationService.getModification(modificationId);

      if (!modification) {
        return reply.status(404).send({ error: 'Modification not found' });
      }

      reply.send({ modification });
    } catch (error) {
      logger.error('Error in getModification controller', { error });
      reply.status(500).send({ error: 'Failed to get modification' });
    }
  }
}
