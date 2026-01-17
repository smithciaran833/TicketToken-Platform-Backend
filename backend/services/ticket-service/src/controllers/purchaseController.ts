import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import knex from 'knex';
import { percentOfCents, addCents, formatCents } from '@tickettoken/shared';
import { discountService } from '../services/discountService';
import { PurchaseSaga } from '../sagas/PurchaseSaga';
import { config } from '../config';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'PurchaseController' });

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tickettoken_db'
});

export class PurchaseController {
  async createOrder(request: FastifyRequest, reply: FastifyReply) {
    const idempotencyKey = request.headers['idempotency-key'] as string;

    if (!idempotencyKey) {
      return reply.status(400).send({
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header required'
      });
    }

    const { eventId, items, tenantId, discountCodes } = request.body as any;
    const userId = (request as any).userId;

    if (!eventId || !items || !Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({
        error: 'INVALID_REQUEST',
        message: 'eventId and items array required'
      });
    }

    if (!tenantId) {
      return reply.status(400).send({
        error: 'INVALID_REQUEST',
        message: 'tenantId required'
      });
    }

    // FEATURE FLAG: Use saga pattern with order-service or legacy direct DB write
    if (config.features.useOrderService) {
      log.info('Using NEW saga-based order creation via order-service');
      return this.createOrderViaSaga(request, reply);
    } else {
      log.warn('Using LEGACY direct database order creation');
      return this.createOrderLegacy(request, reply);
    }
  }

  /**
   * NEW: Saga-based order creation via order-service
   */
  private async createOrderViaSaga(request: FastifyRequest, reply: FastifyReply) {
    const idempotencyKey = request.headers['idempotency-key'] as string;
    const { eventId, items, tenantId, discountCodes } = request.body as any;
    const userId = (request as any).userId;

    try {
      // Check idempotency (in our local DB)
      const existingRequest = await db('ticket_idempotency_keys')
        .where({ key: idempotencyKey })
        .first();

      if (existingRequest) {
        try {
          const cachedResponse = typeof existingRequest.response === 'string'
            ? JSON.parse(existingRequest.response)
            : existingRequest.response;

          log.debug('Returning cached idempotent response');
          return reply.status(200).send(cachedResponse);
        } catch (parseError) {
          log.error('Failed to parse cached response', { error: parseError });
        }
      }

      // Execute saga
      const saga = new PurchaseSaga();
      const result = await saga.execute({
        userId,
        eventId,
        tenantId,
        items: items.map((item: any) => ({
          ticketTypeId: item.ticketTypeId || item.tierId,
          quantity: item.quantity,
        })),
        discountCodes,
        idempotencyKey,
      });

      const response = {
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        status: result.status,
        totalCents: result.totalCents,
        totalFormatted: formatCents(result.totalCents),
        tickets: result.tickets,
        message: 'Order created successfully via order-service',
      };

      // Cache the response for idempotency
      await db('ticket_idempotency_keys').insert({
        key: idempotencyKey,
        response: JSON.stringify(response),
        created_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      log.info('Saga completed successfully');
      return reply.status(200).send(response);

    } catch (error: any) {
      log.error('Saga failed', {
        message: error.message,
        name: error.name,
      });

      if (error.message && error.message.includes('INSUFFICIENT_INVENTORY')) {
        return reply.status(409).send({
          error: 'INSUFFICIENT_INVENTORY',
          message: error.message
        });
      }

      if (error.name === 'OrderServiceUnavailableError') {
        return reply.status(503).send({
          error: 'ORDER_SERVICE_UNAVAILABLE',
          message: 'Order service is temporarily unavailable. Please try again.'
        });
      }

      if (error.name === 'OrderValidationError') {
        return reply.status(400).send({
          error: 'ORDER_VALIDATION_ERROR',
          message: error.message
        });
      }

      return reply.status(500).send({
        error: 'ORDER_CREATION_FAILED',
        message: error.message || 'Failed to create order'
      });
    }
  }

  /**
   * LEGACY: Direct database order creation (original implementation)
   * This will be removed after validation period
   */
  private async createOrderLegacy(request: FastifyRequest, reply: FastifyReply) {
    const idempotencyKey = request.headers['idempotency-key'] as string;
    const { eventId, items, tenantId, discountCodes } = request.body as any;
    const userId = (request as any).userId;

    const trx = await db.transaction();

    try {
      // Check idempotency
      const existingRequest = await trx('ticket_idempotency_keys')
        .where({ key: idempotencyKey })
        .first();

      if (existingRequest) {
        await trx.rollback();

        try {
          const cachedResponse = typeof existingRequest.response === 'string'
            ? JSON.parse(existingRequest.response)
            : existingRequest.response;

          log.debug('Returning cached idempotent response', { cachedResponse });
          return reply.status(200).send(cachedResponse);
        } catch (parseError) {
          log.error('Failed to parse cached response', { error: parseError, response: existingRequest.response });
        }
      }

      const orderId = uuidv4();
      const orderNumber = `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      let totalAmountCents = 0;
      let totalQuantity = 0;

      // Validate items and calculate totals
      const itemsToInsert = [];
      for (const item of items) {
        const ticketTypeId = item.ticketTypeId || item.tierId;

        // SECURITY FIX: Validate tenant_id to prevent cross-tenant purchases
        const ticketType = await trx('ticket_types')
          .where({ id: ticketTypeId, tenant_id: tenantId })
          .first();

        if (!ticketType) {
          throw new Error(`Ticket type ${ticketTypeId} not found or does not belong to this tenant`);
        }

        // price is in dollars, convert to cents
        const priceInCents = Math.round(Number(ticketType.price) * 100);
        const itemTotalCents = priceInCents * item.quantity;
        totalAmountCents += itemTotalCents;
        totalQuantity += item.quantity;

        itemsToInsert.push({
          ticketType,
          ticketTypeId,
          quantity: item.quantity,
          priceInCents,
          itemTotalCents
        });
      }

      // Apply discounts BEFORE calculating fees
      let discountCents = 0;
      let discountsApplied: any[] = [];

      if (discountCodes && discountCodes.length > 0) {
        const discountResult = await discountService.applyDiscounts(
          totalAmountCents,
          discountCodes,
          eventId
        );

        discountCents = discountResult.totalDiscountCents;
        discountsApplied = discountResult.discountsApplied;
        totalAmountCents = discountResult.finalAmountCents;
      }

      // Calculate fees on discounted amount
      const platformFeeCents = percentOfCents(totalAmountCents, 750);
      const processingFeeCents = percentOfCents(totalAmountCents, 290);
      const totalWithFeesCents = addCents(totalAmountCents, platformFeeCents, processingFeeCents);

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      // Insert order
      await trx('orders').insert({
        id: orderId,
        tenant_id: tenantId,
        user_id: userId,
        event_id: eventId,
        order_number: orderNumber,
        subtotal_cents: totalAmountCents + discountCents,
        platform_fee_cents: platformFeeCents,
        processing_fee_cents: processingFeeCents,
        total_cents: totalWithFeesCents,
        discount_cents: discountCents,
        ticket_quantity: totalQuantity,
        status: 'PENDING',
        currency: 'USD',
        created_at: new Date(),
        updated_at: new Date(),
        reservation_expires_at: expiresAt
      });

      // Insert order items and update inventory atomically
      for (const item of itemsToInsert) {
        const updateResult = await trx('ticket_types')
          .where('id', item.ticketTypeId)
          .where('tenant_id', tenantId)
          .where('available_quantity', '>=', item.quantity)
          .update({
            available_quantity: trx.raw('available_quantity - ?', [item.quantity]),
            updated_at: new Date()
          });

        if (updateResult === 0) {
          const current = await trx('ticket_types')
            .where({ id: item.ticketTypeId })
            .first();

          throw new Error(`INSUFFICIENT_INVENTORY: Only ${current?.available_quantity || 0} tickets available for ${current?.name || 'this ticket type'}`);
        }

        await trx('order_items').insert({
          id: uuidv4(),
          tenant_id: tenantId,
          order_id: orderId,
          ticket_type_id: item.ticketTypeId,
          quantity: item.quantity,
          unit_price_cents: item.priceInCents,
          total_price_cents: item.itemTotalCents
        });
      }

      // Insert discount records with tenant_id and discount_type
      for (const discount of discountsApplied) {
        await trx('order_discounts').insert({
          id: uuidv4(),
          tenant_id: tenantId,
          order_id: orderId,
          discount_id: discount.discountId,
          discount_code: discount.code,
          discount_type: discount.type,
          amount_cents: discount.amountInCents,
          applied_at: new Date()
        });
      }

      const response = {
        orderId,
        orderNumber,
        status: 'pending',
        totalCents: totalWithFeesCents,
        totalFormatted: formatCents(totalWithFeesCents),
        discountCents,
        expiresAt: expiresAt.toISOString(),
        message: 'Order created successfully'
      };

      await trx('ticket_idempotency_keys').insert({
        key: idempotencyKey,
        response: JSON.stringify(response),
        created_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await trx.commit();
      return reply.status(200).send(response);

    } catch (error: any) {
      await trx.rollback();

      log.error('Order creation error', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });

      if (error.message && error.message.includes('INSUFFICIENT_INVENTORY')) {
        return reply.status(409).send({
          error: 'INSUFFICIENT_INVENTORY',
          message: error.message
        });
      }

      if (error.message && error.message.includes('not found or does not belong to this tenant')) {
        return reply.status(404).send({
          error: 'TICKET_TYPE_NOT_FOUND',
          message: error.message
        });
      }

      return reply.status(500).send({
        error: 'ORDER_CREATION_FAILED',
        message: error.message || 'Failed to create order'
      });
    }
  }
}

export const purchaseController = new PurchaseController();
