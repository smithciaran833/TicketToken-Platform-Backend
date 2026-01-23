import {
  orderServiceClient,
  createRequestContext,
  ServiceClientError,
} from '@tickettoken/shared';
import knex from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { percentOfCents, addCents } from '@tickettoken/shared';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'PurchaseSaga' });

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tickettoken_db'
});

interface PurchaseRequest {
  userId: string;
  eventId: string;
  tenantId: string;
  items: Array<{
    ticketTypeId: string;
    quantity: number;
  }>;
  discountCodes?: string[];
  idempotencyKey: string;
}

interface PurchaseResult {
  orderId: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  tickets: Array<{
    id: string;
    ticketTypeId: string;
  }>;
}

interface SagaState {
  inventoryReserved: boolean;
  orderCreated: boolean;
  ticketsCreated: boolean;
  reservedInventory: Array<{ ticketTypeId: string; quantity: number }>;
  orderId?: string;
  createdTicketIds: string[];
}

/**
 * Purchase Saga - Ensures transactional integrity across services
 * 
 * Steps:
 * 1. Reserve inventory in ticket-service DB
 * 2. Create order via order-service API
 * 3. Create tickets in ticket-service DB
 * 
 * Compensations (rollback):
 * - If step 2 fails: Release inventory
 * - If step 3 fails: Cancel order + release inventory
 */
export class PurchaseSaga {
  private state: SagaState;

  constructor() {
    this.state = {
      inventoryReserved: false,
      orderCreated: false,
      ticketsCreated: false,
      reservedInventory: [],
      createdTicketIds: [],
    };
  }

  /**
   * Execute the purchase saga
   */
  async execute(request: PurchaseRequest): Promise<PurchaseResult> {
    const trx = await db.transaction();
    
    try {
      log.info('Starting purchase saga', {
        userId: request.userId,
        eventId: request.eventId,
        itemCount: request.items.length,
      });

      // STEP 1: Reserve Inventory
      const { items: itemsWithPrices, totalAmountCents } = await this.reserveInventory(
        trx,
        request.items,
        request.tenantId
      );
      this.state.inventoryReserved = true;
      this.state.reservedInventory = request.items;

      log.info('Step 1/3: Inventory reserved', {
        totalAmountCents,
        items: itemsWithPrices.length,
      });

      // STEP 2: Create Order via Order Service
      const orderResponse = await this.createOrder(request, itemsWithPrices, totalAmountCents);
      this.state.orderCreated = true;
      this.state.orderId = orderResponse.orderId;

      log.info('Step 2/3: Order created', {
        orderId: orderResponse.orderId,
        orderNumber: orderResponse.orderNumber,
      });

      // STEP 3: Create Tickets
      const tickets = await this.createTickets(
        trx,
        orderResponse.orderId,
        request.userId,
        request.eventId,
        request.tenantId,
        itemsWithPrices
      );
      this.state.ticketsCreated = true;
      this.state.createdTicketIds = tickets.map(t => t.id);

      log.info('Step 3/3: Tickets created', {
        ticketCount: tickets.length,
      });

      // COMMIT: All steps succeeded
      await trx.commit();

      log.info('Purchase saga completed successfully', {
        orderId: orderResponse.orderId,
        ticketCount: tickets.length,
      });

      return {
        orderId: orderResponse.orderId,
        orderNumber: orderResponse.orderNumber,
        status: orderResponse.status,
        totalCents: orderResponse.totalCents,
        tickets: tickets.map(t => ({
          id: t.id,
          ticketTypeId: t.ticket_type_id,
        })),
      };

    } catch (error) {
      log.error('Purchase saga failed, starting compensation', { error });

      // ROLLBACK: Compensate for any completed steps
      await this.compensate(request.userId, request.tenantId);

      // Rollback DB transaction
      await trx.rollback();

      throw error;
    }
  }

  /**
   * STEP 1: Reserve inventory atomically
   */
  private async reserveInventory(
    trx: any,
    items: Array<{ ticketTypeId: string; quantity: number }>,
    tenantId: string
  ) {
    const itemsWithPrices = [];
    let totalAmountCents = 0;

    for (const item of items) {
      // Atomic update: Only succeed if inventory available
      const updateResult = await trx('ticket_types')
        .where('id', item.ticketTypeId)
        .where('tenant_id', tenantId)
        .where('available_quantity', '>=', item.quantity)
        .update({
          available_quantity: trx.raw('available_quantity - ?', [item.quantity]),
          reserved_quantity: trx.raw('COALESCE(reserved_quantity, 0) + ?', [item.quantity]),
          updated_at: new Date()
        });

      if (updateResult === 0) {
        // Get current availability for error message
        const current = await trx('ticket_types')
          .where({ id: item.ticketTypeId })
          .first();

        throw new Error(
          `INSUFFICIENT_INVENTORY: Only ${current?.available_quantity || 0} tickets available for ${current?.name || 'this ticket type'}`
        );
      }

      // Get ticket type details
      const ticketType = await trx('ticket_types')
        .where({ id: item.ticketTypeId })
        .first();

      const priceInCents = ticketType.price_cents;
      const itemTotalCents = priceInCents * item.quantity;
      totalAmountCents += itemTotalCents;

      itemsWithPrices.push({
        ticketTypeId: item.ticketTypeId,
        quantity: item.quantity,
        unitPriceCents: priceInCents,
        totalPriceCents: itemTotalCents,
      });
    }

    return { items: itemsWithPrices, totalAmountCents };
  }

  /**
   * STEP 2: Create order via order-service API
   *
   * PHASE 5c REFACTORED: Using shared orderServiceClient with standardized S2S auth
   */
  private async createOrder(
    request: PurchaseRequest,
    items: Array<{ ticketTypeId: string; quantity: number; unitPriceCents: number }>,
    totalAmountCents: number
  ) {
    const ctx = createRequestContext(request.tenantId, request.userId);

    try {
      const orderResponse = await orderServiceClient.createOrder(
        {
          userId: request.userId,
          eventId: request.eventId,
          items: items.map(item => ({
            ticketTypeId: item.ticketTypeId,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
          })),
          currency: 'USD',
          idempotencyKey: request.idempotencyKey,
          metadata: {
            tenantId: request.tenantId,
            discountCodes: request.discountCodes,
          },
        },
        ctx,
        request.idempotencyKey
      );

      return orderResponse;

    } catch (error) {
      if (error instanceof ServiceClientError) {
        log.error('Order service error', { message: error.message, statusCode: error.statusCode });
      }
      throw error;
    }
  }

  /**
   * STEP 3: Create tickets in ticket-service DB
   */
  private async createTickets(
    trx: any,
    orderId: string,
    userId: string,
    eventId: string,
    tenantId: string,
    items: Array<{ ticketTypeId: string; quantity: number; unitPriceCents: number }>
  ) {
    const tickets = [];

    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        const ticketId = uuidv4();
        
        await trx('tickets').insert({
          id: ticketId,
          tenant_id: tenantId,
          event_id: eventId,
          ticket_type_id: item.ticketTypeId,
          order_id: orderId,
          user_id: userId,
          status: 'SOLD',
          price_cents: item.unitPriceCents,
          created_at: new Date(),
          updated_at: new Date(),
        });

        tickets.push({
          id: ticketId,
          ticket_type_id: item.ticketTypeId,
        });
      }
    }

    return tickets;
  }

  /**
   * COMPENSATION: Rollback all completed steps
   */
  private async compensate(userId: string, tenantId?: string) {
    const compensations = [];

    // Compensate Step 3: Delete created tickets
    if (this.state.ticketsCreated && this.state.createdTicketIds.length > 0) {
      compensations.push(
        this.compensateTickets()
      );
    }

    // Compensate Step 2: Cancel order in order-service
    if (this.state.orderCreated && this.state.orderId) {
      compensations.push(
        this.compensateOrder(userId, tenantId)
      );
    }

    // Compensate Step 1: Release inventory
    if (this.state.inventoryReserved && this.state.reservedInventory.length > 0) {
      compensations.push(
        this.compensateInventory()
      );
    }

    // Execute all compensations
    const results = await Promise.allSettled(compensations);

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        log.error(`Compensation ${index + 1} failed`, { reason: result.reason });
      } else {
        log.info(`Compensation ${index + 1} succeeded`);
      }
    });
  }

  private async compensateTickets() {
    log.info('Compensating: Deleting created tickets');
    
    try {
      await db('tickets')
        .whereIn('id', this.state.createdTicketIds)
        .delete();
      
      log.info('Tickets deleted during compensation');
    } catch (error) {
      log.error('Failed to delete tickets during compensation', { error });
      throw error;
    }
  }

  /**
   * PHASE 5c REFACTORED: Using shared orderServiceClient with standardized S2S auth
   */
  private async compensateOrder(userId: string, tenantId?: string) {
    if (!this.state.orderId) return;

    log.info('Compensating: Cancelling order in order-service', { orderId: this.state.orderId });

    try {
      const ctx = createRequestContext(tenantId || 'system', userId);
      await orderServiceClient.cancelOrder(
        this.state.orderId,
        'Saga compensation - ticket creation failed',
        ctx
      );

      log.info('Order cancelled during compensation');
    } catch (error) {
      log.error('Failed to cancel order during compensation', { error });
      // Don't throw - we'll handle this via reconciliation
    }
  }

  private async compensateInventory() {
    log.info('Compensating: Releasing reserved inventory');
    
    try {
      for (const item of this.state.reservedInventory) {
        await db('ticket_types')
          .where('id', item.ticketTypeId)
          .update({
            available_quantity: db.raw('available_quantity + ?', [item.quantity]),
            reserved_quantity: db.raw('GREATEST(COALESCE(reserved_quantity, 0) - ?, 0)', [item.quantity]),
            updated_at: new Date(),
          });
      }
      
      log.info('Inventory released during compensation');
    } catch (error) {
      log.error('Failed to release inventory during compensation', { error });
      throw error;
    }
  }
}
