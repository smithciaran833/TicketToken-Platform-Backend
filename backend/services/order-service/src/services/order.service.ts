import { Pool } from 'pg';
import { OrderModel } from '../models/order.model';
import { OrderItemModel } from '../models/order-item.model';
import { OrderEventModel } from '../models/order-event.model';
import { OrderRefundModel } from '../models/order-refund.model';
import { TicketClient } from './ticket.client';
import { PaymentClient } from './payment.client';
import { EventClient } from './event.client';
import { eventPublisher } from '../events';
import { OrderEventPayload } from '../events/event-types';
import { logger } from '../utils/logger';
import { orderConfig } from '../config';
import { orderMetrics } from '../utils/metrics';
import { withLock, LockKeys } from '@tickettoken/shared';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { retry } from '../utils/retry';
import {
  OrderUpdateData,
  Order,
  OrderItem,
  OrderEvent,
  OrderRefund,
  OrderStatus,
  RefundStatus,
  OrderEventType,
  CreateOrderRequest,
  ReserveOrderRequest,
  ConfirmOrderRequest,
  CancelOrderRequest,
  RefundOrderRequest,
} from '../types/order.types';

export class OrderService {
  private orderModel: OrderModel;
  private orderItemModel: OrderItemModel;
  private orderEventModel: OrderEventModel;
  private orderRefundModel: OrderRefundModel;
  private ticketClient: TicketClient;
  private paymentClient: PaymentClient;
  private eventClient: EventClient;

  // Circuit breakers for external services
  private ticketCircuitBreaker: CircuitBreaker;
  private paymentCircuitBreaker: CircuitBreaker;
  private eventCircuitBreaker: CircuitBreaker;

  constructor(pool: Pool) {
    this.orderModel = new OrderModel(pool);
    this.orderItemModel = new OrderItemModel(pool);
    this.orderEventModel = new OrderEventModel(pool);
    this.orderRefundModel = new OrderRefundModel(pool);
    this.ticketClient = new TicketClient();
    this.paymentClient = new PaymentClient();
    this.eventClient = new EventClient();

    // Initialize circuit breakers
    this.ticketCircuitBreaker = new CircuitBreaker('ticket-service', {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 10000, // 10 seconds
      resetTimeout: 30000, // 30 seconds
    });

    this.paymentCircuitBreaker = new CircuitBreaker('payment-service', {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 15000, // 15 seconds (longer for payment operations)
      resetTimeout: 60000, // 60 seconds (longer cooldown for payment)
    });

    this.eventCircuitBreaker = new CircuitBreaker('event-service', {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 5000, // 5 seconds
      resetTimeout: 30000, // 30 seconds
    });
  }

  private createEventPayload(order: Order, items: OrderItem[]): OrderEventPayload {
    return {
      orderId: order.id,
      userId: order.userId,
      eventId: order.eventId,
      orderNumber: order.orderNumber,
      status: order.status,
      totalCents: order.totalCents,
      currency: order.currency,
      items: items.map(item => ({
        ticketTypeId: item.ticketTypeId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
      })),
      timestamp: new Date(),
    };
  }

  async createOrder(tenantId: string, request: CreateOrderRequest): Promise<{ order: Order; items: OrderItem[] }> {
    const endTimer = orderMetrics.orderCreationDuration.startTimer();
    
    try {
      // 1. Validate event exists (with circuit breaker + retry)
      const event = await retry(
        () => this.eventCircuitBreaker.execute(() => this.eventClient.getEvent(request.eventId)),
        { maxAttempts: 3, delayMs: 100, maxDelayMs: 1000 }
      );
      if (!event) {
        throw new Error('Event not found');
      }

      // 2. Check ticket availability (with circuit breaker + retry)
      const ticketTypeIds = request.items.map(item => item.ticketTypeId);
      const availability = await retry(
        () => this.ticketCircuitBreaker.execute(() => this.ticketClient.checkAvailability(ticketTypeIds)),
        { maxAttempts: 3, delayMs: 100, maxDelayMs: 1000 }
      );

      for (const item of request.items) {
        const available = availability[item.ticketTypeId];
        if (!available || available < item.quantity) {
          throw new Error(`Insufficient tickets for ticket type ${item.ticketTypeId}`);
        }
      }

      // 3. Validate prices against ticket service (CRITICAL SECURITY - with circuit breaker + retry)
      const actualPrices = await retry(
        () => this.ticketCircuitBreaker.execute(() => this.ticketClient.getPrices(ticketTypeIds)),
        { maxAttempts: 3, delayMs: 100, maxDelayMs: 1000 }
      );
      
      for (const item of request.items) {
        const actualPrice = actualPrices[item.ticketTypeId];
        if (!actualPrice) {
          throw new Error(`Price not found for ticket type ${item.ticketTypeId}`);
        }
        
        if (item.unitPriceCents !== actualPrice) {
          logger.warn('Price manipulation attempt detected', {
            ticketTypeId: item.ticketTypeId,
            providedPrice: item.unitPriceCents,
            actualPrice,
            userId: request.userId,
          });
          throw new Error(`Invalid price for ticket type ${item.ticketTypeId}. Expected ${actualPrice} cents but received ${item.unitPriceCents} cents`);
        }
      }

      // 4. Calculate pricing (use config instead of hardcoded values)
      const subtotalCents = request.items.reduce((sum, item) =>
        sum + (item.unitPriceCents * item.quantity), 0
      );
      const platformFeeCents = Math.floor(subtotalCents * (orderConfig.fees.platformFeePercentage / 100));
      const processingFeeCents = Math.floor(subtotalCents * (orderConfig.fees.processingFeePercentage / 100)) + orderConfig.fees.processingFeeFixedCents;
      const taxCents = Math.floor((subtotalCents + platformFeeCents + processingFeeCents) * (orderConfig.fees.defaultTaxRate / 100));
      const totalCents = subtotalCents + platformFeeCents + processingFeeCents + taxCents;

      // 5. Create order
      const orderData = {
        tenantId,
        userId: request.userId,
        eventId: request.eventId,
        orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        status: OrderStatus.PENDING,
        subtotalCents,
        platformFeeCents,
        processingFeeCents,
        taxCents,
        discountCents: 0,
        totalCents,
        currency: request.currency || 'USD',
        idempotencyKey: request.idempotencyKey,
        metadata: request.metadata,
      };

      const order = await this.orderModel.create(orderData);

      // 6. Create order items
      const itemsData = request.items.map(item => ({
        ticketTypeId: item.ticketTypeId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalPriceCents: item.unitPriceCents * item.quantity,
      }));

      const items = await this.orderItemModel.createBulk(order.id, tenantId, itemsData);

      // 7. Create order event
      await this.orderEventModel.create({
        orderId: order.id,
        tenantId,
        eventType: OrderEventType.ORDER_CREATED,
        userId: request.userId,
        metadata: { items: request.items },
      });

      logger.info('Order created', { orderId: order.id, orderNumber: order.orderNumber });

      // 8. Publish event to RabbitMQ
      await eventPublisher.publishOrderCreated(this.createEventPayload(order, items));

      // 9. Collect metrics
      orderMetrics.ordersCreated.inc({ status: order.status });
      orderMetrics.orderAmount.observe({ currency: order.currency }, order.totalCents);
      endTimer();

      return { order, items };
    } catch (error) {
      endTimer();
      logger.error('Error creating order', { error, request });
      throw error;
    }
  }

  async reserveOrder(tenantId: string, request: ReserveOrderRequest): Promise<{ order: Order; paymentIntent: any }> {
    try {
      const order = await this.orderModel.findById(request.orderId, tenantId);
      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new Error(`Cannot reserve order in ${order.status} status`);
      }

      // 1. Reserve tickets (with circuit breaker + retry)
      const items = await this.orderItemModel.findByOrderId(order.id, tenantId);
      await retry(
        () => this.ticketCircuitBreaker.execute(() =>
          this.ticketClient.reserveTickets(
            order.id,
            items.map(item => ({
              ticketTypeId: item.ticketTypeId,
              quantity: item.quantity,
            }))
          )
        ),
        { maxAttempts: 3, delayMs: 200, maxDelayMs: 2000 }
      );

      // 2. Create payment intent (with circuit breaker + retry)
      const paymentIntent = await retry(
        () => this.paymentCircuitBreaker.execute(() =>
          this.paymentClient.createPaymentIntent({
            orderId: order.id,
            amountCents: order.totalCents,
            currency: order.currency,
            userId: order.userId,
          })
        ),
        { maxAttempts: 3, delayMs: 200, maxDelayMs: 2000 }
      );

      // 3. Update order to RESERVED
      const expiresAt = new Date(Date.now() + orderConfig.reservation.durationMinutes * 60 * 1000);
      const updatedOrder = await this.orderModel.update(order.id, {
        status: OrderStatus.RESERVED,
        paymentIntentId: paymentIntent.paymentIntentId,
        expiresAt,
      } as OrderUpdateData);

      // 4. Create order event
      await this.orderEventModel.create({
        orderId: order.id,
        tenantId,
        eventType: OrderEventType.TICKETS_RESERVED,
        metadata: {
          paymentIntentId: paymentIntent.paymentIntentId,
          expiresAt,
        },
      });

      logger.info('Order reserved', {
        orderId: updatedOrder.id,
        expiresAt,
        paymentIntentId: paymentIntent.paymentIntentId
      });

      // 5. Publish event
      await eventPublisher.publishOrderReserved({
        ...this.createEventPayload(updatedOrder, items),
        expiresAt,
      });

      // 6. Collect metrics
      orderMetrics.orderStateTransitions.inc({ from_state: OrderStatus.PENDING, to_state: OrderStatus.RESERVED });
      orderMetrics.activeReservations.inc();

      return { order: updatedOrder, paymentIntent };
    } catch (error) {
      logger.error('Error reserving order', { error, request });
      throw error;
    }
  }

  async confirmOrder(tenantId: string, request: ConfirmOrderRequest): Promise<Order> {
    // Use distributed lock to prevent race conditions on order confirmation
    return withLock(
      LockKeys.orderConfirmation(request.orderId),
      30000, // 30 second lock
      async () => {
        try {
          const order = await this.orderModel.findById(request.orderId, tenantId);
      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status !== OrderStatus.RESERVED) {
        throw new Error(`Cannot confirm order in ${order.status} status`);
      }

      // 1. Confirm payment (with circuit breaker + retry)
      await retry(
        () => this.paymentCircuitBreaker.execute(() =>
          this.paymentClient.confirmPayment(request.paymentIntentId)
        ),
        { maxAttempts: 3, delayMs: 200, maxDelayMs: 2000 }
      );

      // 2. Confirm ticket allocation (with circuit breaker + retry)
      await retry(
        () => this.ticketCircuitBreaker.execute(() =>
          this.ticketClient.confirmAllocation(order.id)
        ),
        { maxAttempts: 3, delayMs: 200, maxDelayMs: 2000 }
      );

      // 3. Update order to CONFIRMED
      const updatedOrder = await this.orderModel.update(order.id, {
        status: OrderStatus.CONFIRMED,
        confirmedAt: new Date(),
        expiresAt: null,
      } as OrderUpdateData);

      // 4. Create order event
      await this.orderEventModel.create({
        orderId: order.id,
        tenantId,
        eventType: OrderEventType.PAYMENT_CONFIRMED,
        metadata: {
          paymentIntentId: request.paymentIntentId,
        },
      });

      logger.info('Order confirmed', {
        orderId: updatedOrder.id,
        paymentIntentId: request.paymentIntentId
      });

      // 5. Publish event
      const items = await this.orderItemModel.findByOrderId(order.id, tenantId);
      await eventPublisher.publishOrderConfirmed({
        ...this.createEventPayload(updatedOrder, items),
        paymentIntentId: request.paymentIntentId,
      });

      // 6. Collect metrics
      orderMetrics.orderStateTransitions.inc({ from_state: OrderStatus.RESERVED, to_state: OrderStatus.CONFIRMED });
      orderMetrics.activeReservations.dec();

          return updatedOrder;
        } catch (error) {
          logger.error('Error confirming order', { error, request });
          throw error;
        }
      },
      { service: 'order-service', lockType: 'order-confirmation' }
    );
  }

  async cancelOrder(tenantId: string, request: CancelOrderRequest): Promise<{ order: Order; refund?: OrderRefund }> {
    // Use distributed lock to prevent race conditions on order cancellation
    return withLock(
      LockKeys.orderCancellation(request.orderId),
      30000, // 30 second lock
      async () => {
        try {
          const order = await this.orderModel.findById(request.orderId, tenantId);
      if (!order) {
        throw new Error('Order not found');
      }

      if (![OrderStatus.PENDING, OrderStatus.RESERVED, OrderStatus.CONFIRMED].includes(order.status as any)) {
        throw new Error(`Cannot cancel order in ${order.status} status`);
      }

      let refund: OrderRefund | undefined;
      let refundAmountCents = 0;

      // 1. Release tickets (with circuit breaker + retry)
      await retry(
        () => this.ticketCircuitBreaker.execute(() =>
          this.ticketClient.releaseTickets(order.id)
        ),
        { maxAttempts: 3, delayMs: 100, maxDelayMs: 1000 }
      );

      // 2. Handle payment refund if payment was made
      if (order.status === OrderStatus.CONFIRMED && order.paymentIntentId) {
        refundAmountCents = order.totalCents;

        const refundResult = await retry(
          () => this.paymentCircuitBreaker.execute(() =>
            this.paymentClient.initiateRefund({
              orderId: order.id,
              paymentIntentId: order.paymentIntentId,
              amountCents: refundAmountCents,
              reason: request.reason,
            })
          ),
          { maxAttempts: 3, delayMs: 200, maxDelayMs: 2000 }
        );

        refund = await this.orderRefundModel.create({
          orderId: order.id,
          tenantId,
          refundAmountCents,
          refundReason: request.reason,
          refundStatus: RefundStatus.PENDING,
          stripeRefundId: refundResult.refundId,
          initiatedBy: request.userId,
        });
      } else if (order.status === OrderStatus.RESERVED && order.paymentIntentId) {
        await retry(
          () => this.paymentCircuitBreaker.execute(() =>
            this.paymentClient.cancelPaymentIntent(order.paymentIntentId)
          ),
          { maxAttempts: 3, delayMs: 100, maxDelayMs: 1000 }
        );
      }

      // 3. Update order to CANCELLED
      const updatedOrder = await this.orderModel.update(order.id, {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        expiresAt: null,
      } as OrderUpdateData);

      // 4. Create order event
      await this.orderEventModel.create({
        orderId: order.id,
        tenantId,
        eventType: OrderEventType.ORDER_CANCELLED,
        userId: request.userId,
        metadata: {
          reason: request.reason,
          refundAmountCents,
        },
      });

      logger.info('Order cancelled', {
        orderId: updatedOrder.id,
        reason: request.reason,
        refundAmount: refundAmountCents
      });

      // 5. Publish event
      const items = await this.orderItemModel.findByOrderId(order.id, tenantId);
      await eventPublisher.publishOrderCancelled({
        ...this.createEventPayload(updatedOrder, items),
        reason: request.reason,
        refundAmountCents,
      });

      // 6. Collect metrics
      orderMetrics.ordersCancelled.inc({ reason: request.reason });
      orderMetrics.orderStateTransitions.inc({ from_state: order.status, to_state: OrderStatus.CANCELLED });
      if (order.status === OrderStatus.RESERVED) {
        orderMetrics.activeReservations.dec();
      }

          return { order: updatedOrder, refund };
        } catch (error) {
          logger.error('Error cancelling order', { error, request });
          throw error;
        }
      },
      { service: 'order-service', lockType: 'order-cancellation' }
    );
  }

  async expireReservation(orderId: string, tenantId: string, reason: string): Promise<Order> {
    try {
      const order = await this.orderModel.findById(orderId, tenantId);

      if (!order) {
        logger.warn('Order not found for expiration', { orderId });
        throw new Error('Order not found');
      }

      if (order.status !== OrderStatus.RESERVED) {
        logger.warn('Order not in RESERVED status', { orderId, status: order.status });
        throw new Error('Order not in RESERVED status');
      }

      // 1. Release tickets (with circuit breaker + retry, but don't fail expiration if this fails)
      try {
        await retry(
          () => this.ticketCircuitBreaker.execute(() =>
            this.ticketClient.releaseTickets(order.id)
          ),
          { maxAttempts: 2, delayMs: 100, maxDelayMs: 500 }
        );
      } catch (error) {
        logger.error('Failed to release tickets during expiration', { orderId, error });
      }

      // 2. Cancel payment intent if exists (with circuit breaker + retry, but don't fail expiration if this fails)
      if (order.paymentIntentId) {
        try {
          await retry(
            () => this.paymentCircuitBreaker.execute(() =>
              this.paymentClient.cancelPaymentIntent(order.paymentIntentId)
            ),
            { maxAttempts: 2, delayMs: 100, maxDelayMs: 500 }
          );
        } catch (error) {
          logger.error('Failed to cancel payment intent during expiration', { orderId, error });
        }
      }

      // 3. Update order to EXPIRED
      const updatedOrder = await this.orderModel.update(order.id, {
        status: OrderStatus.EXPIRED,
        expiresAt: null,
      } as OrderUpdateData);

      // 4. Create order event
      await this.orderEventModel.create({
        orderId: order.id,
        tenantId,
        eventType: OrderEventType.RESERVATION_EXPIRED,
        metadata: { reason },
      });

      logger.info('Order reservation expired', { orderId, reason });

      // 5. Publish event
      const items = await this.orderItemModel.findByOrderId(order.id, tenantId);
      await eventPublisher.publishOrderExpired({
        ...this.createEventPayload(updatedOrder, items),
        reason,
      });

      // 6. Collect metrics
      orderMetrics.activeReservations.dec();
      orderMetrics.orderStateTransitions.inc({ from_state: OrderStatus.RESERVED, to_state: OrderStatus.EXPIRED });

      return updatedOrder;
    } catch (error) {
      logger.error('Error expiring reservation', { error, orderId });
      throw error;
    }
  }

  async refundOrder(tenantId: string, request: RefundOrderRequest): Promise<{ order: Order; refund: OrderRefund }> {
    // Use distributed lock to prevent race conditions on order refund
    return withLock(
      LockKeys.order(request.orderId),
      30000, // 30 second lock
      async () => {
        try {
          const order = await this.orderModel.findById(request.orderId, tenantId);
      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status !== OrderStatus.CONFIRMED) {
        throw new Error(`Cannot refund order in ${order.status} status`);
      }

      if (!order.paymentIntentId) {
        throw new Error('No payment intent found for order');
      }

      // 1. Initiate refund with payment service (with circuit breaker + retry)
      const refundResult = await retry(
        () => this.paymentCircuitBreaker.execute(() =>
          this.paymentClient.initiateRefund({
            orderId: order.id,
            paymentIntentId: order.paymentIntentId,
            amountCents: request.amountCents,
            reason: request.reason,
          })
        ),
        { maxAttempts: 3, delayMs: 200, maxDelayMs: 2000 }
      );

      // 2. Create refund record
      const refund = await this.orderRefundModel.create({
        orderId: order.id,
        tenantId,
        refundAmountCents: request.amountCents,
        refundReason: request.reason,
        refundStatus: RefundStatus.PENDING,
        stripeRefundId: refundResult.refundId,
        initiatedBy: request.userId,
        metadata: request.metadata,
      });

      // 3. Update order status
      const updatedOrder = await this.orderModel.update(order.id, {
        status: OrderStatus.REFUNDED,
        refundedAt: new Date(),
      } as OrderUpdateData);

      // 4. Create order event
      await this.orderEventModel.create({
        orderId: order.id,
        tenantId,
        eventType: OrderEventType.REFUND_ISSUED,
        userId: request.userId,
        metadata: {
          refundAmountCents: request.amountCents,
          reason: request.reason,
          refundId: refund.refundId,
        },
      });

      logger.info('Order refunded', {
        orderId: order.id,
        refundAmount: request.amountCents,
        refundId: refund.refundId
      });

      // 5. Publish event
      const items = await this.orderItemModel.findByOrderId(order.id, tenantId);
      await eventPublisher.publishOrderRefunded({
        ...this.createEventPayload(updatedOrder, items),
        refundAmountCents: request.amountCents,
        reason: request.reason,
      });

      // 6. Collect metrics
      orderMetrics.ordersRefunded.inc();
      orderMetrics.orderStateTransitions.inc({ from_state: OrderStatus.CONFIRMED, to_state: OrderStatus.REFUNDED });

          return { order: updatedOrder, refund };
        } catch (error) {
          logger.error('Error refunding order', { error, request });
          throw error;
        }
      },
      { service: 'order-service', lockType: 'order-refund' }
    );
  }

  async getOrder(orderId: string, tenantId: string): Promise<{ order: Order; items: OrderItem[] } | null> {
    const order = await this.orderModel.findById(orderId, tenantId);
    if (!order) {
      return null;
    }

    const items = await this.orderItemModel.findByOrderId(orderId, tenantId);
    return { order, items };
  }

  async getUserOrders(userId: string, tenantId: string, limit: number = 50, offset: number = 0): Promise<Order[]> {
    return this.orderModel.findByUserId(userId, tenantId, limit, offset);
  }

  async getExpiredReservations(tenantId: string, limit: number = 100): Promise<Order[]> {
    return this.orderModel.findExpiredReservations(tenantId, limit);
  }

  async getExpiringReservations(tenantId: string, minutesFromNow: number, limit: number = 100): Promise<Order[]> {
    return this.orderModel.findExpiringReservations(tenantId, minutesFromNow, limit);
  }

  async getOrderEvents(orderId: string, tenantId: string): Promise<OrderEvent[]> {
    return this.orderEventModel.findByOrderId(orderId, tenantId);
  }

  async findOrdersByEvent(eventId: string, tenantId: string, statuses?: OrderStatus[]): Promise<Order[]> {
    return this.orderModel.findByEvent(eventId, tenantId, statuses);
  }
}
