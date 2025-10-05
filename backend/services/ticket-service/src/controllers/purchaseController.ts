import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import knex from 'knex';
import { percentOfCents, addCents, formatCents } from '@tickettoken/shared';

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tickettoken_db'
});

export class PurchaseController {
  async createOrder(req: Request, res: Response) {
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header required'
      });
    }

    const { eventId, items, tenantId } = req.body;
    const userId = (req as any).user?.id;

    if (!eventId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'eventId and items array required'
      });
    }

    if (!tenantId) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'tenantId required'
      });
    }

    const trx = await db.transaction();

    try {
      // Check idempotency
      const existingRequest = await trx('idempotency_keys')
        .where({ key: idempotencyKey })
        .first();

      if (existingRequest) {
        await trx.rollback();
        return res.status(200).json(JSON.parse(existingRequest.response));
      }

      const orderId = uuidv4();
      const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;
      let totalAmountCents = 0;
      let totalQuantity = 0;

      // Validate items and calculate totals
      const itemsToInsert = [];
      for (const item of items) {
        const ticketTypeId = item.ticketTypeId || item.tierId;

        const ticketType = await trx('ticket_types')
          .where({ id: ticketTypeId })
          .first();

        if (!ticketType) {
          throw new Error(`Ticket type ${ticketTypeId} not found`);
        }

        // Use price_cents column
        const priceInCents = ticketType.price_cents;
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

      // Calculate fees - 7.5% platform, 2.9% processing
      const platformFeeCents = percentOfCents(totalAmountCents, 750);
      const processingFeeCents = percentOfCents(totalAmountCents, 290);
      const totalWithFeesCents = addCents(totalAmountCents, platformFeeCents, processingFeeCents);

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      // Insert order - populate both old and new columns during transition
      await trx('orders').insert({
        id: orderId,
        tenant_id: tenantId,
        user_id: userId,
        event_id: eventId,
        order_number: orderNumber,
        total_amount: (totalWithFeesCents / 100).toFixed(2), // Old column (for now)
        total_amount_cents: totalWithFeesCents, // New column
        ticket_quantity: totalQuantity,
        status: 'pending',
        idempotency_key: idempotencyKey,
        created_at: new Date(),
        updated_at: new Date(),
        expires_at: expiresAt
      });

      // Insert order items and update inventory atomically
      for (const item of itemsToInsert) {
        const updateResult = await trx('ticket_types')
          .where('id', item.ticketTypeId)
          .where('available_quantity', '>=', item.quantity)
          .update({
            available_quantity: trx.raw('available_quantity - ?', [item.quantity]),
            updated_at: new Date()
          });

        if (updateResult === 0) {
          const current = await trx('ticket_types')
            .where({ id: item.ticketTypeId })
            .first();

          throw new Error(`INSUFFICIENT_INVENTORY: Only ${current.available_quantity} tickets available for ${current.name}`);
        }

        // Insert order item (use tier_id, not ticket_type_id)
        await trx('order_items').insert({
          id: uuidv4(),
          order_id: orderId,
          tier_id: item.ticketTypeId,
          quantity: item.quantity,
          unit_price_cents: item.priceInCents
        });
      }

      const response = {
        orderId,
        orderNumber,
        status: 'pending',
        totalCents: totalWithFeesCents,
        totalFormatted: formatCents(totalWithFeesCents),
        expiresAt: expiresAt.toISOString(),
        message: 'Order created successfully'
      };

      await trx('idempotency_keys').insert({
        key: idempotencyKey,
        response: JSON.stringify(response),
        created_at: new Date()
      });

      await trx.commit();
      return res.status(200).json(response);

    } catch (error: any) {
      await trx.rollback();
      console.error('Order creation error:', error);

      if (error.message.includes('INSUFFICIENT_INVENTORY')) {
        return res.status(409).json({
          error: 'INSUFFICIENT_INVENTORY',
          message: error.message
        });
      }

      return res.status(500).json({
        error: 'ORDER_CREATION_FAILED',
        message: error.message || 'Failed to create order'
      });
    }
  }
}

export const purchaseController = new PurchaseController();
