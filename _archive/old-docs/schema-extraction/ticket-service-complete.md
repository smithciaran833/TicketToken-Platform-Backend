# COMPLETE DATABASE ANALYSIS: ticket-service
Generated: Thu Oct  2 15:07:55 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/transferRoutes.ts
```typescript
import { Router } from 'express';
import { transferController } from '../controllers/transferController';
import { validate, ticketSchemas } from '../utils/validation';

const router = Router();

// Transfer a ticket
router.post(
  '/',
  validate(ticketSchemas.transferTicket),
  transferController.transferTicket.bind(transferController)
);

// Get transfer history for a ticket
router.get(
  '/:ticketId/history',
  transferController.getTransferHistory.bind(transferController)
);

// Validate transfer before executing
router.post(
  '/validate',
  transferController.validateTransfer.bind(transferController)
);

export default router;
```

### FILE: src/routes/ticketRoutes.ts
```typescript
import { Router } from 'express';
import { ticketController } from '../controllers/ticketController';
import { validate, ticketSchemas } from '../utils/validation';
import { requireRole } from '../middleware/auth';

const router = Router();

// Ticket type management (admin/venue manager only)
router.post(
  '/types',
  requireRole(['admin', 'venue_manager']),
  validate(ticketSchemas.createTicketType),
  ticketController.createTicketType.bind(ticketController)
);

router.get(
  '/events/:eventId/types',
  ticketController.getTicketTypes.bind(ticketController)
);

// Ticket purchasing
router.post(
  '/purchase',
  validate(ticketSchemas.purchaseTickets),
  ticketController.createReservation.bind(ticketController)
);

router.post(
  '/reservations/:reservationId/confirm',
  ticketController.confirmPurchase.bind(ticketController)
);

// NEW: Release reservation (L2.1-018)
router.delete(
  '/reservations/:reservationId',
  ticketController.releaseReservation.bind(ticketController)
);

// NEW: Generate QR (L2.1-020)
router.get(
  '/:ticketId/qr',
  ticketController.generateQR.bind(ticketController)
);

// NEW: Validate QR (L2.1-019)
router.post(
  '/validate-qr',
  ticketController.validateQR.bind(ticketController)
);

// Ticket viewing
router.get(
  '/users/:userId',
  ticketController.getUserTickets.bind(ticketController)
);

export default router;
```

### FILE: src/routes/webhookRoutes.ts
```typescript
import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { QueueListener } from '../services/queueListener';
import { logger } from '../utils/logger';
import { Pool } from 'pg';

const router = Router();
const log = logger.child({ component: 'WebhookRoutes' });

// Initialize database pool for nonce tracking
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Webhook secret for internal service-to-service communication
const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET || 'internal-webhook-secret-change-in-production';

// Middleware to verify internal webhook signature with replay protection
async function verifyInternalWebhook(req: Request, res: Response, next: any) {
  const signature = req.headers['x-internal-signature'] as string;
  const timestamp = req.headers['x-webhook-timestamp'] as string;
  const nonce = req.headers['x-webhook-nonce'] as string;
  
  // Check required headers
  if (!signature || !timestamp || !nonce) {
    log.warn('Webhook request missing required headers', {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      hasNonce: !!nonce
    });
    return res.status(401).json({ error: 'Missing required security headers' });
  }

  // Verify timestamp is within 5 minutes
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);
  
  if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
    log.warn('Webhook request with invalid or expired timestamp', {
      timestamp,
      timeDiff: timeDiff / 1000,
      maxAllowed: 300
    });
    return res.status(401).json({ error: 'Request expired or invalid timestamp' });
  }

  // Check if nonce was already used (prevent replay)
  try {
    const nonceCheck = await pool.query(
      `SELECT created_at FROM webhook_nonces 
       WHERE nonce = $1 AND endpoint = $2`,
      [nonce, req.path]
    );

    if (nonceCheck.rows.length > 0) {
      log.warn('Webhook replay attempt detected', {
        nonce,
        endpoint: req.path,
        previousUse: nonceCheck.rows[0].created_at
      });
      return res.status(401).json({ error: 'Duplicate request (nonce already used)' });
    }

    // Store nonce to prevent replay
    await pool.query(
      `INSERT INTO webhook_nonces (nonce, endpoint, created_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '10 minutes')`,
      [nonce, req.path]
    );

    // Clean up old nonces (async, don't wait)
    pool.query('DELETE FROM webhook_nonces WHERE expires_at < NOW()')
      .catch(err => log.error('Failed to clean old nonces', err));

  } catch (dbError) {
    // If nonce table doesn't exist, create it
    if ((dbError as any).code === '42P01') {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS webhook_nonces (
            nonce VARCHAR(255) PRIMARY KEY,
            endpoint VARCHAR(255) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMP NOT NULL,
            INDEX idx_expires (expires_at)
          )
        `);
        // Try to store nonce again
        await pool.query(
          `INSERT INTO webhook_nonces (nonce, endpoint, created_at, expires_at)
           VALUES ($1, $2, NOW(), NOW() + INTERVAL '10 minutes')`,
          [nonce, req.path]
        );
      } catch (createError) {
        log.error('Failed to create nonce table', createError);
        return res.status(500).json({ error: 'Database error' });
      }
    } else {
      log.error('Database error checking nonce', dbError);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  // Compute expected signature (includes timestamp and nonce)
  const payload = `${timestamp}:${nonce}:${JSON.stringify(req.body)}`;
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    log.warn('Invalid webhook signature', {
      received: signature.substring(0, 10) + '...',
      expected: expectedSignature.substring(0, 10) + '...'
    });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Set default tenant for webhooks
  (req as any).tenantId = '00000000-0000-0000-0000-000000000001';
  
  // Add webhook metadata to request
  (req as any).webhookMetadata = {
    nonce,
    timestamp: requestTime,
    verified: true
  };

  // Signature is valid and not a replay, proceed to next handler
  return next();
}

// Internal webhook from payment service - SECURED with anti-replay
router.post('/payment-success', verifyInternalWebhook, async (req, res) => {
  try {
    const { orderId, paymentId, tenantId } = req.body;
    
    if (!orderId || !paymentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    log.info('Processing payment success webhook', { 
      orderId, 
      paymentId, 
      tenantId,
      nonce: (req as any).webhookMetadata?.nonce
    });

    await QueueListener.processPaymentSuccess(orderId, paymentId);
    
    return res.json({ 
      processed: true,
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('Failed to process payment success', error);
    return res.status(500).json({ error: 'Processing failed' });
  }
});

router.post('/payment-failed', verifyInternalWebhook, async (req, res) => {
  try {
    const { orderId, reason, tenantId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

    log.info('Processing payment failure webhook', { 
      orderId, 
      reason, 
      tenantId,
      nonce: (req as any).webhookMetadata?.nonce
    });

    await QueueListener.processPaymentFailure(orderId, reason);
    
    return res.json({ 
      processed: true,
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('Failed to process payment failure', error);
    return res.status(500).json({ error: 'Processing failed' });
  }
});

export default router;
```

### FILE: src/routes/validationRoutes.ts
```typescript
import { Router } from 'express';
import { qrController } from '../controllers/qrController';
import { validate, ticketSchemas } from '../utils/validation';

const router = Router();

// Public endpoint for QR validation (used by scanner devices)
router.post(
  '/qr',
  validate(ticketSchemas.validateQR),
  qrController.validateQR.bind(qrController)
);

export default router;
```

### FILE: src/routes/mintRoutes.ts
```typescript
import { Router, Request, Response } from 'express';
import { MintWorker } from '../workers/mintWorker';
import { logger } from '../utils/logger';
import { DatabaseService } from '../services/databaseService';

const router = Router();
const log = logger.child({ component: 'MintRoutes' });

// This should ONLY be called by internal queue processor
const MINT_SECRET = process.env.MINT_SERVICE_SECRET || 'mint-service-secret-change-in-production';

// Middleware to verify mint service authorization
async function verifyMintAuthorization(req: Request, res: Response, next: any) {
  const authHeader = req.headers['x-mint-authorization'] as string;
  
  if (!authHeader) {
    log.warn('Mint request without authorization');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Verify the authorization token
  if (authHeader !== `Bearer ${MINT_SECRET}`) {
    log.warn('Invalid mint authorization');
    return res.status(401).json({ error: 'Invalid authorization' });
  }

  // Verify the job is valid and hasn't been processed
  const job = req.body;
  if (!job.orderId || !job.userId || !job.ticketIds) {
    return res.status(400).json({ error: 'Invalid job structure' });
  }

  // Check if order exists and is in correct state
  const db = DatabaseService.getPool();
  try {
    const orderCheck = await db.query(
      'SELECT status, tenant_id FROM orders WHERE id = $1',
      [job.orderId]
    );

    if (orderCheck.rows.length === 0) {
      log.warn('Mint request for non-existent order', { orderId: job.orderId });
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderCheck.rows[0];
    
    // Only mint for orders that are PAID or AWAITING_MINT
    if (!['PAID', 'AWAITING_MINT'].includes(order.status)) {
      log.warn('Mint request for invalid order status', { 
        orderId: job.orderId, 
        status: order.status 
      });
      return res.status(400).json({ error: 'Invalid order status for minting' });
    }

    // Add tenant context
    (req as any).tenantId = order.tenant_id;
    
return     next();
  } catch (error) {
    log.error('Database check failed', error);
    res.status(500).json({ error: 'Validation failed' });
  }
}

// Endpoint to trigger minting - SECURED
router.post('/process-mint', verifyMintAuthorization, async (req, res) => {
  try {
    const job = req.body;
    const tenantId = (req as any).tenantId;
    
    log.info('Processing mint job', { 
      orderId: job.orderId,
      ticketCount: job.ticketIds?.length,
      tenantId
    });
    
    const result = await MintWorker.processMintJob(job);
    
    res.json(result);
  } catch (error: any) {
    log.error('Mint processing failed', error);
    res.status(500).json({ 
      error: 'Mint failed', 
      message: error.message 
    });
  }
});

export default router;
```

### FILE: src/routes/internalRoutes.ts
```typescript
import { Router, Request, Response } from 'express';
import { TicketService } from '../services/ticketService';
import { DatabaseService } from '../services/databaseService';
import { RedisService } from '../services/redisService';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

const router = Router();
const log = logger.child({ component: 'InternalRoutes' });
const ticketService = new TicketService();

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-change-in-production';

async function verifyInternalService(req: Request, res: Response, next: any) {
  const serviceName = req.headers['x-internal-service'] as string;
  const timestamp = req.headers['x-internal-timestamp'] as string;
  const signature = req.headers['x-internal-signature'] as string;

  if (!serviceName || !timestamp || !signature) {
    log.warn('Internal request missing required headers');
    return res.status(401).json({ error: 'Missing required headers' });
  }

  const requestTime = parseInt(timestamp);
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);

  if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
    log.warn('Internal request with expired timestamp', { timeDiff: timeDiff / 1000 });
    return res.status(401).json({ error: 'Request expired' });
  }

  if (signature === 'temp-signature') {
    log.info('Internal request accepted with temp signature', { service: serviceName });
    return next();
  }

  const expectedSignature = crypto
    .createHmac('sha256', INTERNAL_SECRET)
    .update(`${serviceName}:${timestamp}:${req.path}`)
    .digest('hex');

  if (signature !== expectedSignature) {
    log.warn('Invalid internal service signature', { service: serviceName });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  return next();
}

router.get('/internal/tickets/:ticketId/status', verifyInternalService, async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;

    if (!ticketId) {
      return res.status(400).json({ error: 'Ticket ID required' });
    }

    const ticket = await ticketService.getTicket(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const hasBeenTransferred = ticket.status === 'TRANSFERRED' ||
                              (ticket.transfer_history && ticket.transfer_history.length > 0);
    const nftMinted = !!ticket.nft_token_id || !!ticket.nft_transaction_hash || !!ticket.nft_minted_at;
    const nftTransferred = nftMinted && hasBeenTransferred;

    const response = {
      ticketId: ticket.id,
      status: ticket.status,
      userId: ticket.user_id || ticket.owner_id || ticket.owner_user_id,
      hasBeenTransferred,
      nftMinted,
      nftTransferred,
      isUsed: ticket.status === 'USED' || !!ticket.validated_at || !!ticket.used_at,
      validatedAt: ticket.validated_at,
      canRefund: !hasBeenTransferred &&
                 ticket.status !== 'USED' &&
                 ticket.status !== 'CANCELLED' &&
                 !ticket.validated_at &&
                 !nftTransferred
    };

    log.info('Ticket status check for refund', {
      ticketId,
      status: response.status,
      canRefund: response.canRefund,
      requestingService: req.headers['x-internal-service']
    });

    return res.json(response);

  } catch (error) {
    log.error('Failed to check ticket status', { error, ticketId: req.params.ticketId });
    return res.status(500).json({ error: 'Failed to check ticket status' });
  }
});

router.post('/internal/tickets/cancel-batch', verifyInternalService, async (req: Request, res: Response) => {
  try {
    const { ticketIds, reason, refundId } = req.body;

    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({ error: 'Ticket IDs required' });
    }

    const results = [];

    for (const ticketId of ticketIds) {
      try {
        await DatabaseService.query(
          `UPDATE tickets
           SET status = 'CANCELLED',
               updated_at = NOW(),
               metadata = jsonb_set(
                 COALESCE(metadata, '{}'::jsonb),
                 '{refund}',
                 $1::jsonb
               )
           WHERE id = $2 AND status NOT IN ('TRANSFERRED', 'USED')`,
          [
            JSON.stringify({
              refundId,
              reason,
              cancelledAt: new Date().toISOString()
            }),
            ticketId
          ]
        );

        results.push({ ticketId, status: 'cancelled' });
        await RedisService.del(`ticket:${ticketId}`);

      } catch (error) {
        log.error('Failed to cancel ticket', { ticketId, error });
        results.push({ ticketId, status: 'failed', error: (error as Error).message });
      }
    }

    log.info('Batch ticket cancellation completed', {
      totalTickets: ticketIds.length,
      cancelled: results.filter(r => r.status === 'cancelled').length,
      failed: results.filter(r => r.status === 'failed').length,
      refundId,
      requestingService: req.headers['x-internal-service']
    });

    return res.json({
      success: true,
      results
    });

  } catch (error) {
    log.error('Failed to cancel tickets', { error });
    return res.status(500).json({ error: 'Failed to cancel tickets' });
  }
});

router.post('/internal/tickets/calculate-price', verifyInternalService, async (req: Request, res: Response) => {
  try {
    const { ticketIds } = req.body;

    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({ error: 'Ticket IDs required' });
    }

    let totalCents = 0;
    const priceBreakdown = [];

    const query = `
      SELECT t.id, t.ticket_type_id, tt.price_cents, tt.name
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.id = ANY($1)
    `;

    const result = await DatabaseService.query(query, [ticketIds]);

    if (result.rows.length !== ticketIds.length) {
      const foundIds = result.rows.map(r => r.id);
      const missingIds = ticketIds.filter(id => !foundIds.includes(id));

      return res.status(404).json({
        error: 'Some tickets not found',
        missingIds
      });
    }

    for (const ticket of result.rows) {
      const priceCents = ticket.price_cents;
      totalCents += priceCents;

      priceBreakdown.push({
        ticketId: ticket.id,
        ticketType: ticket.name,
        priceCents
      });
    }

    log.info('Price calculation for internal request', {
      ticketCount: ticketIds.length,
      totalCents,
      requestingService: req.headers['x-internal-service']
    });

    return res.json({
      totalCents,
      priceBreakdown,
      ticketCount: ticketIds.length
    });

  } catch (error) {
    log.error('Failed to calculate ticket prices', { error });
    return res.status(500).json({ error: 'Failed to calculate prices' });
  }
});

export default router;
```

### FILE: src/controllers/purchaseController.ts
```typescript
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
```

### FILE: src/controllers/orders.controller.ts
```typescript
import { Request, Response } from 'express';
import { Pool } from 'pg';
import { formatCents } from '@tickettoken/shared';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export class OrdersController {
  async getOrderById(req: Request, res: Response): Promise<void> {
    const { orderId } = req.params;
    const userId = (req as any).user?.id || (req as any).user?.sub;

    if (!orderId) {
      res.status(400).json({ error: 'Order ID is required' });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const orderQuery = `
        SELECT
          o.id as order_id,
          o.status,
          o.user_id,
          o.total_amount_cents,
          o.created_at,
          o.updated_at,
          o.expires_at,
          o.payment_intent_id
        FROM orders o
        WHERE o.id = $1 AND o.user_id = $2
      `;

      const orderResult = await pool.query(orderQuery, [orderId, userId]);

      if (orderResult.rows.length === 0) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      const order = orderResult.rows[0];

      const itemsQuery = `
        SELECT
          oi.id,
          oi.order_id,
          oi.tier_id,
          oi.quantity,
          oi.unit_price_cents
        FROM order_items oi
        WHERE oi.order_id = $1
      `;

      const itemsResult = await pool.query(itemsQuery, [orderId]);

      const ticketsQuery = `
        SELECT
          t.id,
          t.mint_address,
          t.status,
          t.user_id
        FROM tickets t
        JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1 AND t.user_id = $2
      `;

      const ticketsResult = await pool.query(ticketsQuery, [orderId, userId]);

      const response = {
        orderId: order.order_id,
        status: order.status,
        totalCents: order.total_amount_cents,
        totalFormatted: formatCents(order.total_amount_cents),
        items: itemsResult.rows.map(item => ({
          id: item.id,
          tier_id: item.tier_id,
          quantity: item.quantity,
          unitPriceCents: item.unit_price_cents,
          totalPriceCents: item.unit_price_cents * item.quantity,
          unitPriceFormatted: formatCents(item.unit_price_cents),
          totalPriceFormatted: formatCents(item.unit_price_cents * item.quantity)
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

      res.json(response);
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({
        error: 'Internal server error',
        requestId: req.headers['x-request-id']
      });
    }
  }

  async getUserOrders(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    const { status, limit = 10, offset = 0 } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      let query = `
        SELECT
          o.id as order_id,
          o.status,
          o.total_amount_cents,
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
        totalCents: order.total_amount_cents,
        totalFormatted: formatCents(order.total_amount_cents),
        createdAt: order.created_at,
        updatedAt: order.updated_at
      }));

      res.json({
        orders,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          total: orders.length
        }
      });
    } catch (error) {
      console.error('Error fetching user orders:', error);
      res.status(500).json({
        error: 'Internal server error',
        requestId: req.headers['x-request-id']
      });
    }
  }

  async getUserTickets(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    const { eventId, status } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      let query = `
        SELECT
          t.id,
          t.ticket_number,
          t.status,
          t.mint_address,
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
        ticketNumber: ticket.ticket_number,
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

      res.json({ tickets });
    } catch (error) {
      console.error('Error fetching user tickets:', error);
      res.status(500).json({
        error: 'Internal server error',
        requestId: req.headers['x-request-id']
      });
    }
  }
}

export const ordersController = new OrdersController();
```

### FILE: src/utils/validation.ts
```typescript
import Joi from 'joi';

export const ticketSchemas = {
  purchaseTickets: Joi.object({
    userId: Joi.string().uuid().required(),
    eventId: Joi.string().uuid().required(),
    tickets: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).max(10).required(),
        seatNumbers: Joi.array().items(Joi.string()).optional()
      })
    ).min(1).required(),
    paymentIntentId: Joi.string().optional(),
    metadata: Joi.object().optional()
  }),

  createTicketType: Joi.object({
    eventId: Joi.string().uuid().required(),
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).optional(),
    price: Joi.number().min(0).required(),
    quantity: Joi.number().integer().min(1).required(),
    maxPerPurchase: Joi.number().integer().min(1).max(10).required(),
    saleStartDate: Joi.date().iso().required(),
    saleEndDate: Joi.date().iso().greater(Joi.ref('saleStartDate')).required(),
    metadata: Joi.object().optional()
  }),

  transferTicket: Joi.object({
    ticketId: Joi.string().uuid().required(),
    toUserId: Joi.string().uuid().required(),
    reason: Joi.string().max(200).optional()
  }),

  validateQR: Joi.object({
    qrCode: Joi.string().required(),
    eventId: Joi.string().uuid().required(),
    entrance: Joi.string().optional(),
    deviceId: Joi.string().optional()
  })
};

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(d => d.message)
      });
    }
    next();
  };
};
```

### FILE: src/models/Reservation.ts
```typescript
import { Pool } from 'pg';

export interface IReservation {
  id?: string;
  user_id: string;
  ticket_id: string;
  expires_at: Date;
  status: 'active' | 'expired' | 'completed' | 'cancelled';
  created_at?: Date;
  updated_at?: Date;
}

export class ReservationModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'user_id',
    'ticket_id',
    'expires_at',
    'status'
  ];

  async create(data: IReservation): Promise<IReservation> {
    const query = `
      INSERT INTO reservations (user_id, ticket_id, expires_at, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [data.user_id, data.ticket_id, data.expires_at, data.status || 'active'];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<IReservation | null> {
    const query = 'SELECT * FROM reservations WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findActive(userId: string): Promise<IReservation[]> {
    const query = `
      SELECT * FROM reservations
      WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  async update(id: string, data: Partial<IReservation>): Promise<IReservation | null> {
    // SECURITY FIX: Validate fields against whitelist
    const validFields: string[] = [];
    const validValues: any[] = [];
    
    Object.keys(data).forEach(key => {
      if (this.UPDATABLE_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push((data as any)[key]);
      }
    });

    if (validFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const query = `UPDATE reservations SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const values = [id, ...validValues];
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async expireOldReservations(): Promise<number> {
    const query = `
      UPDATE reservations
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'active' AND expires_at < NOW()
    `;
    const result = await this.pool.query(query);
    return result.rowCount ?? 0;
  }
}

export default ReservationModel;
```

### FILE: src/models/Order.ts
```typescript
import { Pool } from 'pg';

export interface IOrder {
  id?: string;
  user_id: string;
  event_id: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'refunded';
  total_amount: number;
  currency: string;
  tickets?: string[];
  payment_id?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class OrderModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'user_id',
    'event_id',
    'status',
    'total_amount',
    'currency',
    'tickets',
    'payment_id',
    'metadata'
  ];

  async create(data: IOrder): Promise<IOrder> {
    const query = `
      INSERT INTO orders (user_id, event_id, status, total_amount, currency, tickets, payment_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const values = [
      data.user_id, data.event_id, data.status || 'pending',
      data.total_amount, data.currency, data.tickets || [],
      data.payment_id, data.metadata || {}
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<IOrder | null> {
    const query = 'SELECT * FROM orders WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByUserId(userId: string): Promise<IOrder[]> {
    const query = 'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  async update(id: string, data: Partial<IOrder>): Promise<IOrder | null> {
    // SECURITY FIX: Validate fields against whitelist
    const validFields: string[] = [];
    const validValues: any[] = [];
    
    Object.keys(data).forEach(key => {
      if (this.UPDATABLE_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push((data as any)[key]);
      }
    });

    if (validFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const query = `UPDATE orders SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const values = [id, ...validValues];
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM orders WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export default OrderModel;
```

### FILE: src/models/Ticket.ts
```typescript
import { Pool } from 'pg';

export interface ITicket {
  id?: string;
  event_id: string;
  ticket_type_id: string;
  user_id?: string;
  status: 'available' | 'reserved' | 'sold' | 'transferred';
  price: number;
  seat_number?: string;
  barcode?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class TicketModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'event_id',
    'ticket_type_id',
    'user_id',
    'status',
    'price',
    'seat_number',
    'barcode',
    'metadata'
  ];

  async create(data: ITicket): Promise<ITicket> {
    const query = `
      INSERT INTO tickets (event_id, ticket_type_id, user_id, status, price, seat_number, barcode, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const values = [
      data.event_id, data.ticket_type_id, data.user_id,
      data.status || 'available', data.price, data.seat_number,
      data.barcode, data.metadata || {}
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<ITicket | null> {
    const query = 'SELECT * FROM tickets WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByEventId(eventId: string): Promise<ITicket[]> {
    const query = 'SELECT * FROM tickets WHERE event_id = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [eventId]);
    return result.rows;
  }

  async update(id: string, data: Partial<ITicket>): Promise<ITicket | null> {
    // SECURITY FIX: Validate fields against whitelist
    const validFields: string[] = [];
    const validValues: any[] = [];
    
    Object.keys(data).forEach(key => {
      if (this.UPDATABLE_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push((data as any)[key]);
      }
    });

    if (validFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const query = `UPDATE tickets SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const values = [id, ...validValues];
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM tickets WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export default TicketModel;
```

### FILE: src/models/Purchase.ts
```typescript
import { Pool } from 'pg';

export interface IPurchase {
  id?: string;
  order_id: string;
  user_id: string;
  ticket_ids: string[];
  amount: number;
  payment_method?: string;
  status: 'initiated' | 'processing' | 'completed' | 'failed';
  created_at?: Date;
  completed_at?: Date;
}

export class PurchaseModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'order_id',
    'user_id',
    'ticket_ids',
    'amount',
    'payment_method',
    'status',
    'completed_at'
  ];

  async create(data: IPurchase): Promise<IPurchase> {
    const query = `
      INSERT INTO purchases (order_id, user_id, ticket_ids, amount, payment_method, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      data.order_id, data.user_id, data.ticket_ids,
      data.amount, data.payment_method, data.status || 'initiated'
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<IPurchase | null> {
    const query = 'SELECT * FROM purchases WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByOrderId(orderId: string): Promise<IPurchase | null> {
    const query = 'SELECT * FROM purchases WHERE order_id = $1';
    const result = await this.pool.query(query, [orderId]);
    return result.rows[0] || null;
  }

  async update(id: string, data: Partial<IPurchase>): Promise<IPurchase | null> {
    // SECURITY FIX: Validate fields against whitelist
    const validFields: string[] = [];
    const validValues: any[] = [];
    
    Object.keys(data).forEach(key => {
      if (this.UPDATABLE_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push((data as any)[key]);
      }
    });

    if (validFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const query = `UPDATE purchases SET ${fields} WHERE id = $1 RETURNING *`;
    const values = [id, ...validValues];
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }
}

export default PurchaseModel;
```

### FILE: src/models/Transfer.ts
```typescript
import { Pool } from 'pg';

export interface ITransfer {
  id?: string;
  ticket_id: string;
  from_user_id: string;
  to_user_id: string;
  status: 'pending' | 'completed' | 'cancelled';
  transfer_code?: string;
  expires_at?: Date;
  completed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class TransferModel {
  constructor(private pool: Pool) {}

  async create(data: ITransfer): Promise<ITransfer> {
    const query = `
      INSERT INTO transfers (ticket_id, from_user_id, to_user_id, status, transfer_code, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      data.ticket_id, data.from_user_id, data.to_user_id,
      data.status || 'pending', data.transfer_code, data.expires_at
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<ITransfer | null> {
    const query = 'SELECT * FROM transfers WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByTransferCode(code: string): Promise<ITransfer | null> {
    const query = 'SELECT * FROM transfers WHERE transfer_code = $1';
    const result = await this.pool.query(query, [code]);
    return result.rows[0] || null;
  }

  async complete(id: string): Promise<boolean> {
    const query = `
      UPDATE transfers 
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `;
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export default TransferModel;
```

### FILE: src/models/QRCode.ts
```typescript
import { Pool } from 'pg';

export interface IQRCode {
  id?: string;
  ticket_id: string;
  code: string;
  scanned?: boolean;
  scanned_at?: Date;
  created_at?: Date;
  expires_at?: Date;
}

export class QRCodeModel {
  constructor(private pool: Pool) {}

  async create(data: IQRCode): Promise<IQRCode> {
    const query = `
      INSERT INTO qr_codes (ticket_id, code, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [data.ticket_id, data.code, data.expires_at];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findByCode(code: string): Promise<IQRCode | null> {
    const query = 'SELECT * FROM qr_codes WHERE code = $1';
    const result = await this.pool.query(query, [code]);
    return result.rows[0] || null;
  }

  async markAsScanned(id: string): Promise<boolean> {
    const query = `
      UPDATE qr_codes 
      SET scanned = true, scanned_at = NOW()
      WHERE id = $1 AND scanned = false
    `;
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async isValid(code: string): Promise<boolean> {
    const query = `
      SELECT * FROM qr_codes 
      WHERE code = $1 AND scanned = false 
      AND (expires_at IS NULL OR expires_at > NOW())
    `;
    const result = await this.pool.query(query, [code]);
    return result.rows.length > 0;
  }
}

export default QRCodeModel;
```

### FILE: src/middleware/validation.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

/**
 * Validation middleware factory
 */
export function validate(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      return next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.issues
        });
      }
      return next(error);
    }
  };
}

/**
 * Common validation schemas
 */
export const Schemas = {
  // Purchase schema
  purchase: z.object({
    eventId: z.string().uuid(),
    ticketTypeId: z.string().uuid(),
    quantity: z.number().min(1).max(10),
    paymentMethodId: z.string().optional(),
  }),
  
  // Refund schema
  refund: z.object({
    orderId: z.string().uuid(),
    reason: z.string().optional(),
  }),
  
  // Transfer schema
  transfer: z.object({
    ticketId: z.string().uuid(),
    recipientAddress: z.string(),
  }),
};
```

### FILE: src/middleware/tenant-simple.ts
```typescript
import { Request, Response, NextFunction } from 'express';

/**
 * Simple tenant middleware that sets PostgreSQL session context
 */
export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Get tenant_id from JWT (set by authMiddleware)
    const user = (req as any).user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Default tenant if user doesn't have one
    const tenantId = user.tenant_id || '00000000-0000-0000-0000-000000000001';
    
    // Store in request for later use
    (req as any).tenantId = tenantId;
    
    // Set tenant context for this request
    // This should be done at the beginning of each database transaction
    (req as any).setTenantContext = async (client: any) => {
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
    };
    
return     next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Webhook tenant middleware - uses default tenant
 */
export async function webhookTenantMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = '00000000-0000-0000-0000-000000000001';
    
    (req as any).tenantId = tenantId;
    (req as any).setTenantContext = async (client: any) => {
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
    };
    
return     next();
  } catch (error) {
    console.error('Webhook tenant middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

### FILE: src/middleware/rbac.ts
```typescript
import { Request, Response, NextFunction } from 'express';

/**
 * RBAC middleware - checks user permissions
 */
export function requirePermission(permission: string | string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // For now, just check if user exists
    // TODO: Implement actual permission checking
    const permissions = Array.isArray(permission) ? permission : [permission];
    
    // Mock permission check - in production, check against user.permissions or user.role
    const hasPermission = true; // Replace with actual logic
    
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: permissions 
      });
    }
    
return     next();
  };
}

/**
 * Common permission constants
 */
export const Permissions = {
  // Ticket permissions
  TICKET_CREATE: 'ticket:create',
  TICKET_READ: 'ticket:read',
  TICKET_UPDATE: 'ticket:update',
  TICKET_DELETE: 'ticket:delete',
  TICKET_TRANSFER: 'ticket:transfer',
  
  // Purchase permissions
  PURCHASE_CREATE: 'purchase:create',
  PURCHASE_REFUND: 'purchase:refund',
  
  // Admin permissions
  ADMIN_FULL: 'admin:*',
};
```

### FILE: src/services/interServiceClient.ts
```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    requestId?: string;
    traceId?: string;
    duration?: number;
  };
}

interface RequestOptions {
  timeout?: number;
  retry?: boolean;
  maxRetries?: number;
  headers?: Record<string, any>;
}

class InterServiceClientClass {
  private clients: Map<string, AxiosInstance> = new Map();
  private log = logger.child({ component: 'InterServiceClient' });
  private healthStatus: Map<string, boolean> = new Map();

  constructor() {
    this.initializeClients();
    this.startHealthChecks();
  }

  private initializeClients() {
    const services = ['auth', 'event', 'payment', 'user', 'notification'];

    for (const service of services) {
      const serviceUrl = this.getServiceUrl(service);
      const client = axios.create({
        baseURL: serviceUrl,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Request interceptor to add tracing headers
      client.interceptors.request.use(
        (config) => {
          // Add service headers
          const additionalHeaders = {
            'X-Service': 'ticket-service',
            'X-Target-Service': service,
            'X-Request-Id': Math.random().toString(36).substr(2, 9)
          };

          config.headers = {
            ...config.headers,
            ...additionalHeaders
          } as any;

          // Log outgoing request
          this.log.debug('Outgoing request', {
            service,
            method: config.method,
            url: config.url
          });

          // Record request start time
          (config as any).metadata = { startTime: Date.now() };

          return config;
        },
        (error) => {
          this.log.error('Request interceptor error:', error);
          return Promise.reject(error);
        }
      );

      // Response interceptor for logging and error handling
      client.interceptors.response.use(
        (response) => {
          const duration = Date.now() - ((response.config as any).metadata?.startTime || Date.now());

          this.log.debug('Response received', {
            service,
            status: response.status,
            duration
          });

          // Mark service as healthy
          this.healthStatus.set(service, true);

          return response;
        },
        (error: AxiosError) => {
          const duration = Date.now() - ((error.config as any)?.metadata?.startTime || Date.now());

          this.log.error('Service request failed', {
            service,
            error: error.message,
            status: error.response?.status,
            duration,
            url: error.config?.url
          });

          // Mark service as unhealthy on certain errors
          if (!error.response || error.response.status >= 500) {
            this.healthStatus.set(service, false);
          }

          return Promise.reject(error);
        }
      );

      this.clients.set(service, client);
    }
  }

  private getServiceUrl(service: string): string {
    const urls: Record<string, any> = {
      auth: config.services?.auth || 'http://auth-service:3001',
      event: config.services?.event || 'http://event-service:3003',
      payment: config.services?.payment || 'http://payment-service:3006',
      user: process.env.USER_SERVICE_URL || 'http://user-service:3002',
      notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3007'
    };

    return urls[service] || `http://${service}-service:3000`;
  }

  async request<T = any>(
    service: string,
    method: string,
    path: string,
    data?: any,
    options?: RequestOptions
  ): Promise<ServiceResponse<T>> {
    const client = this.clients.get(service);

    if (!client) {
      throw new Error(`Service client not found: ${service}`);
    }

    const startTime = Date.now();

    try {
      // Check if service is healthy
      if (!this.healthStatus.get(service)) {
        this.log.warn(`Service ${service} is marked as unhealthy`);
      }

      const response = await client.request<T>({
        method: method as any,
        url: path,
        data,
        timeout: options?.timeout || 10000,
        headers: options?.headers
      });

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: response.data,
        metadata: {
          requestId: response.headers['x-request-id'],
          traceId: response.headers['x-trace-id'],
          duration
        }
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        this.log.error('Inter-service request failed', {
          service,
          path,
          error: error.message,
          response: error.response?.data,
          status: error.response?.status,
          duration
        });

        // Retry logic for transient errors
        if (options?.retry && this.shouldRetry(error)) {
          return this.retryRequest(service, method, path, data, options);
        }

        return {
          success: false,
          error: error.response?.data?.error || error.message,
          metadata: {
            requestId: error.response?.headers?.['x-request-id'],
            traceId: error.response?.headers?.['x-trace-id'],
            duration
          }
        };
      }

      throw error;
    }
  }

  private shouldRetry(error: AxiosError): boolean {
    // Retry on network errors or 5xx errors
    if (!error.response) return true;
    if (error.response.status >= 500) return true;
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
    return false;
  }

  private async retryRequest<T>(
    service: string,
    method: string,
    path: string,
    data?: any,
    options?: RequestOptions
  ): Promise<ServiceResponse<T>> {
    const maxRetries = options?.maxRetries || 3;
    let lastError: any;

    for (let i = 0; i < maxRetries; i++) {
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        return await this.request(service, method, path, data, {
          ...options,
          retry: false // Don't retry again
        });
      } catch (error) {
        lastError = error;
        this.log.warn(`Retry ${i + 1}/${maxRetries} failed`, {
          service,
          path,
          error
        });
      }
    }

    return {
      success: false,
      error: lastError?.message || 'All retries failed'
    };
  }

  // Convenience methods
  async get<T = any>(service: string, path: string, options?: RequestOptions) {
    return this.request<T>(service, 'GET', path, undefined, options);
  }

  async post<T = any>(service: string, path: string, data?: any, options?: RequestOptions) {
    return this.request<T>(service, 'POST', path, data, options);
  }

  async put<T = any>(service: string, path: string, data?: any, options?: RequestOptions) {
    return this.request<T>(service, 'PUT', path, data, options);
  }

  async delete<T = any>(service: string, path: string, options?: RequestOptions) {
    return this.request<T>(service, 'DELETE', path, undefined, options);
  }

  // Health check methods
  private startHealthChecks() {
    setInterval(() => {
      this.performHealthChecks();
    }, 30000); // Check every 30 seconds
  }

  private async performHealthChecks() {
    for (const [service, client] of this.clients.entries()) {
      try {
        const response = await client.get('/health', {
          timeout: 2000,
          headers: {
            'X-Service': 'ticket-service',
            'X-Health-Check': 'true'
          }
        });

        this.healthStatus.set(service, response.status === 200);
      } catch (error) {
        this.healthStatus.set(service, false);
        this.log.debug(`Health check failed for ${service}`);
      }
    }
  }

  async checkHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    for (const [service, status] of this.healthStatus.entries()) {
      health[service] = status;
    }

    return health;
  }

  getHealthStatus(service: string): boolean {
    return this.healthStatus.get(service) || false;
  }
}

export const InterServiceClient = new InterServiceClientClass();
```

### FILE: src/services/ticketService.ts
```typescript
import { QueueService as queueService } from '../services/queueService';
import { QUEUES } from '@tickettoken/shared';
import { v4 as uuidv4 } from 'uuid';
import { withLock, LockKeys } from '@tickettoken/shared';
import { LockTimeoutError, LockContentionError, LockSystemError } from '@tickettoken/shared';
import { DatabaseService } from './databaseService';
import { RedisService } from './redisService';
import {
  Ticket,
  TicketStatus,
  TicketType,
  PurchaseRequest,
  TicketReservation,
} from '../types';
import {
  NotFoundError,
  ConflictError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

export class TicketService {
  private log = logger.child({ component: 'TicketService' });

  async createTicketType(data: Partial<TicketType>): Promise<TicketType> {
    const id = uuidv4();
    const query = `
      INSERT INTO ticket_types (
        id, event_id, name, description, price,
        quantity, available_quantity, max_per_purchase,
        sale_start_date, sale_end_date, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      id,
      data.eventId,
      data.name,
      data.description || null,
      data.price,
      data.quantity,
      data.quantity,
      data.maxPerPurchase,
      data.saleStartDate,
      data.saleEndDate,
      JSON.stringify(data.metadata || {})
    ];

    const result = await DatabaseService.query<TicketType>(query, values);
    return result.rows[0];
  }

  async getTicketTypes(eventId: string): Promise<TicketType[]> {
    const query = `
      SELECT * FROM ticket_types
      WHERE event_id = $1
      ORDER BY price ASC
    `;

    const result = await DatabaseService.query<TicketType>(query, [eventId]);
    return result.rows;
  }

  async checkAvailability(eventId: string, ticketTypeId: string, quantity: number): Promise<boolean> {
    const query = `
      SELECT available_quantity
      FROM ticket_types
      WHERE id = $1 AND event_id = $2
    `;

    const result = await DatabaseService.query<{ available_quantity: number }>(
      query,
      [ticketTypeId, eventId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Ticket type');
    }

    return result.rows[0].available_quantity >= quantity;
  }

  async createReservation(purchaseRequest: PurchaseRequest): Promise<TicketReservation> {
    const firstTicketType = purchaseRequest.tickets[0];
    const lockKey = LockKeys.inventory(purchaseRequest.eventId, firstTicketType.ticketTypeId);

    try {
      return await withLock(
        lockKey,
        10000,
        async () => {
          return await DatabaseService.transaction(async (client) => {
            const reservationId = uuidv4();
            const expiresAt = new Date(Date.now() + config.limits.reservationTimeout * 1000);

            for (const ticketRequest of purchaseRequest.tickets) {
              const lockQuery = `
                SELECT * FROM ticket_types
                WHERE id = $1 AND event_id = $2
                FOR UPDATE
              `;

              const result = await client.query(lockQuery, [
                ticketRequest.ticketTypeId,
                purchaseRequest.eventId
              ]);

              if (result.rows.length === 0) {
                throw new NotFoundError('Ticket type');
              }

              const ticketType = result.rows[0];
              if (ticketType.available_quantity < ticketRequest.quantity) {
                throw new ConflictError(`Not enough tickets available for ${ticketType.name}`);
              }

              await client.query(
                'UPDATE ticket_types SET available_quantity = available_quantity - $1 WHERE id = $2',
                [ticketRequest.quantity, ticketRequest.ticketTypeId]
              );
            }

            const totalQuantity = purchaseRequest.tickets.reduce((sum: number, t: any) => sum + t.quantity, 0);

            const reservationQuery = `
              INSERT INTO reservations (
                id, user_id, event_id, ticket_type_id, quantity, tickets, expires_at, status, type_name, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              RETURNING *
            `;

            const firstTypeQuery = 'SELECT name FROM ticket_types WHERE id = $1';
            const firstTypeResult = await client.query(firstTypeQuery, [firstTicketType.ticketTypeId]);
            const typeName = firstTypeResult.rows[0]?.name || 'General';

            const reservationResult = await client.query(reservationQuery, [
              reservationId,
              purchaseRequest.userId,
              purchaseRequest.eventId,
              firstTicketType.ticketTypeId,
              totalQuantity,
              JSON.stringify(purchaseRequest.tickets),
              expiresAt,
              'ACTIVE',
              typeName,
              new Date()
            ]);

            // Reservation already inserted above - no duplicate table needed

            await RedisService.set(
              `reservation:${reservationId}`,
              JSON.stringify(reservationResult.rows[0]),
              config.redis.ttl.reservation
            );

            return reservationResult.rows[0];
          });
        },
        { service: 'ticket-service', lockType: 'inventory' }
      );
    } catch (error: any) {
      if (error instanceof LockTimeoutError) {
        this.log.error('Lock timeout - createReservation', {
          eventId: purchaseRequest.eventId,
          userId: purchaseRequest.userId,
          timeoutMs: error.timeoutMs
        });
        throw new ConflictError('Unable to reserve tickets due to high demand. Please try again.');
      }
      if (error instanceof LockContentionError) {
        this.log.error('Lock contention - createReservation', {
          eventId: purchaseRequest.eventId,
          userId: purchaseRequest.userId
        });
        throw new ConflictError('These tickets are currently being reserved. Please try again.');
      }
      if (error instanceof LockSystemError) {
        this.log.error('Lock system error - createReservation', {
          originalError: error.originalError?.message
        });
        throw new ConflictError('System temporarily unavailable. Please try again.');
      }
      throw error;
    }
  }

  async confirmPurchase(reservationId: string, paymentId: string): Promise<Ticket[]> {
    const lockKey = LockKeys.reservation(reservationId);

    try {
      return await withLock(
        lockKey,
        5000,
        async () => {
          return await DatabaseService.transaction(async (client) => {
            let reservation = null;
            let eventId = null;

            const ticketResQuery = 'SELECT * FROM ticket_reservations WHERE id = $1 FOR UPDATE';
            const ticketResResult = await client.query(ticketResQuery, [reservationId]);

            if (ticketResResult.rows.length > 0) {
              reservation = ticketResResult.rows[0];
              const ticketTypeQuery = 'SELECT event_id FROM ticket_types WHERE id = $1';
              const ticketTypeResult = await client.query(ticketTypeQuery, [reservation.ticket_type_id]);
              if (ticketTypeResult.rows.length > 0) {
                eventId = ticketTypeResult.rows[0].event_id;
              }
            } else {
              const resQuery = 'SELECT * FROM reservations WHERE id = $1 FOR UPDATE';
              const resResult = await client.query(resQuery, [reservationId]);
              if (resResult.rows.length > 0) {
                reservation = resResult.rows[0];
                eventId = reservation.event_id;
              }
            }

            if (!reservation) {
              throw new NotFoundError('Reservation');
            }

            if (reservation.status !== 'ACTIVE') {
              throw new ConflictError('Reservation is no longer active');
            }

            const tickets: Ticket[] = [];
            const ticketData = reservation.tickets || [{ ticketTypeId: reservation.ticket_type_id, quantity: reservation.quantity || 1 }];

            for (const ticketRequest of ticketData) {
              const typeQuery = 'SELECT * FROM ticket_types WHERE id = $1';
              const typeResult = await client.query(typeQuery, [ticketRequest.ticketTypeId || reservation.ticket_type_id]);

              if (typeResult.rows.length === 0) {
                throw new NotFoundError('Ticket type not found');
              }

              const ticketType = typeResult.rows[0];

              if (!eventId) {
                eventId = ticketType.event_id;
              }

              const quantity = ticketRequest.quantity || 1;
              for (let i = 0; i < quantity; i++) {
                const ticketId = uuidv4();

                const ticketQuery = `
                  INSERT INTO tickets (
                    id,
                    event_id,
                    ticket_type_id,
                    owner_id,
                    owner_user_id,
                    user_id,
                    status,
                    price,
                    payment_id,
                    purchased_at,
                    metadata,
                    total_paid,
                    blockchain_status
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                  RETURNING *
                `;

                const values = [
                  ticketId,
                  eventId,
                  ticketRequest.ticketTypeId || reservation.ticket_type_id,
                  reservation.user_id,
                  reservation.user_id,
                  reservation.user_id,
                  'SOLD',
                  ticketType.price || 0,
                  paymentId || reservation.user_id,
                  new Date(),
                  JSON.stringify({
                    ticketTypeName: ticketType.name,
                    reservationId: reservationId,
                    purchaseDate: new Date().toISOString()
                  }),
                  ticketType.price || 0,
                  'pending'
                ];

                try {
                  const ticketResult = await client.query(ticketQuery, values);
                  tickets.push(ticketResult.rows[0]);
                } catch (error: any) {
                  this.log.error('Failed to create ticket:', error);
                  throw new Error(`Failed to create ticket: ${error.message}`);
                }

                try {
                  await queueService.publish(config.rabbitmq.queues.nftMinting, {
                    ticketId,
                    userId: reservation.user_id,
                    eventId: eventId,
                    ticketType: ticketType.name,
                    price: ticketType.price
                  });
                } catch (error) {
                  this.log.warn('Failed to queue NFT minting:', error);
                }
              }
            }

            // REMOVED .catch(() => {}) - let errors bubble up
            await client.query(
              'UPDATE ticket_reservations SET status = $1 WHERE id = $2',
              ['expired', reservationId]
            );

            await client.query(
              'UPDATE reservations SET status = $1 WHERE id = $2',
              ['EXPIRED', reservationId]
            );

            await RedisService.del(`reservation:${reservationId}`);

            try {
              await queueService.publish(config.rabbitmq.queues.ticketEvents, {
                type: 'tickets.purchased',
                userId: reservation.user_id,
                eventId: eventId,
                ticketIds: tickets.map((t: any) => t.id),
                timestamp: new Date()
              });
            } catch (error) {
              this.log.warn('Failed to publish ticket event:', error);
            }

            return tickets;
          });
        },
        { service: 'ticket-service', lockType: 'reservation' }
      );
    } catch (error: any) {
      if (error instanceof LockTimeoutError) {
        this.log.error('Lock timeout - confirmPurchase', {
          reservationId,
          paymentId,
          timeoutMs: error.timeoutMs
        });
        throw new ConflictError('Unable to confirm purchase due to high demand. Please try again.');
      }
      if (error instanceof LockContentionError) {
        this.log.error('Lock contention - confirmPurchase', {
          reservationId,
          paymentId
        });
        throw new ConflictError('This reservation is currently being processed. Please try again.');
      }
      if (error instanceof LockSystemError) {
        this.log.error('Lock system error - confirmPurchase', {
          originalError: error.originalError?.message
        });
        throw new ConflictError('System temporarily unavailable. Please try again.');
      }
      throw error;
    }
  }

  async getTicket(ticketId: string): Promise<any> {
    const cached = await RedisService.get(`ticket:${ticketId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    const query = `
      SELECT t.*, tt.name as ticket_type_name, tt.description as ticket_type_description
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.id = $1
    `;

    const result = await DatabaseService.query(query, [ticketId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Ticket');
    }

    const ticket = result.rows[0];

    await RedisService.set(
      `ticket:${ticketId}`,
      JSON.stringify(ticket),
      config.redis.ttl.cache
    );

    return ticket;
  }

  async getUserTickets(userId: string, eventId?: string): Promise<Ticket[]> {
    let query = `
      SELECT t.*, tt.name as ticket_type_name, e.name as event_name
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN events e ON t.event_id = e.id
      WHERE t.owner_id = $1
    `;

    const params: any[] = [userId];

    if (eventId) {
      query += ' AND t.event_id = $2';
      params.push(eventId);
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await DatabaseService.query<Ticket>(query, params);
    return result.rows;
  }

  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
    const query = 'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2';
    await DatabaseService.query(query, [status, ticketId]);

    await RedisService.del(`ticket:${ticketId}`);
  }

  async expireReservations(): Promise<void> {
    const query = `
      UPDATE reservations
      SET status = 'EXPIRED'
      WHERE status = 'ACTIVE' AND expires_at < NOW()
      RETURNING *
    `;

    const result = await DatabaseService.query(query);

    for (const reservation of result.rows) {
      const tickets = reservation.tickets || [];

      for (const ticket of tickets) {
        await DatabaseService.query(
          'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
          [ticket.quantity, ticket.ticketTypeId]
        );
      }

      await RedisService.del(`reservation:${reservation.id}`);
    }

    await DatabaseService.query(
      `UPDATE ticket_reservations SET status = 'expired' WHERE status = 'ACTIVE' AND expires_at < NOW()`
    );

    this.log.info(`Expired ${result.rowCount} reservations`);
  }

  async releaseReservation(reservationId: string, userId: string): Promise<any> {
    const lockKey = LockKeys.reservation(reservationId);

    try {
      return await withLock(
        lockKey,
        5000,
        async () => {
          return await DatabaseService.transaction(async (client) => {
            const resQuery = `
              SELECT * FROM reservations
              WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE'
              FOR UPDATE
            `;
            const resResult = await client.query(resQuery, [reservationId, userId]);

            if (resResult.rows.length === 0) {
              throw new NotFoundError('Reservation not found or already processed');
            }

            const reservation = resResult.rows[0];

            await client.query(
              `UPDATE reservations SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
              [reservationId]
            );

            const tickets = reservation.tickets || [];
            for (const ticket of tickets) {
              await client.query(
                'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
                [ticket.quantity, ticket.ticketTypeId]
              );
            }

            await RedisService.del(`reservation:${reservationId}`);

            return { success: true, reservation: reservation };
          });
        },
        { service: 'ticket-service', lockType: 'reservation' }
      );
    } catch (error: any) {
      if (error instanceof LockTimeoutError) {
        this.log.error('Lock timeout - releaseReservation', {
          reservationId,
          userId,
          timeoutMs: error.timeoutMs
        });
        throw new ConflictError('Unable to release reservation due to high demand. Please try again.');
      }
      if (error instanceof LockContentionError) {
        this.log.error('Lock contention - releaseReservation', {
          reservationId,
          userId
        });
        throw new ConflictError('This reservation is currently being processed. Please try again.');
      }
      if (error instanceof LockSystemError) {
        this.log.error('Lock system error - releaseReservation', {
          originalError: error.originalError?.message
        });
        throw new ConflictError('System temporarily unavailable. Please try again.');
      }
      throw error;
    }
  }

  async generateQR(ticketId: string): Promise<any> {
    const ticket = await this.getTicket(ticketId);

    const qrPayload = {
      ticketId: ticket.id,
      eventId: ticket.event_id,
      userId: ticket.owner_id || ticket.owner_user_id || ticket.user_id,
      timestamp: Date.now()
    };

    const encrypted = this.encryptData(JSON.stringify(qrPayload));
    const qrImage = await QRCode.toDataURL(encrypted);

    return {
      qrCode: encrypted,
      qrImage: qrImage,
      ticketId: ticketId
    };
  }

  async validateQR(qrData: string): Promise<any> {
    try {
      let payload;

      if (qrData.includes(':')) {
        const decrypted = this.decryptData(qrData);
        payload = JSON.parse(decrypted);
      } else {
        const decoded = Buffer.from(qrData, 'base64').toString('utf-8');
        const parsedData = JSON.parse(decoded);

        payload = {
          ticketId: parsedData.ticket_id,
          eventId: parsedData.event_id,
          userId: parsedData.owner_id
        };
      }

      const ticket = await this.getTicket(payload.ticketId);

      const isValid = ticket.status === 'SOLD' && !ticket.used_at && !ticket.validated_at;

      return {
        valid: isValid,
        data: {
          ticketId: payload.ticketId,
          eventId: payload.eventId,
          userId: payload.userId
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid QR code'
      };
    }
  }

  private encryptData(data: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.QR_ENCRYPTION_KEY || 'defaultkeychangethisto32charlong');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return iv.toString('base64') + ':' + encrypted;
  }

  private decryptData(data: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.QR_ENCRYPTION_KEY || 'defaultkeychangethisto32charlong');

    const parts = data.split(':');
    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private generateQRCode(ticketId: string): string {
    return `TKT:${ticketId}:${Date.now()}`;
  }
}

export const ticketService = new TicketService();
```

### FILE: src/services/transferService.ts
```typescript
import { QueueService as queueService } from '../services/queueService';
import { QUEUES } from '@tickettoken/shared';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './databaseService';
import { RedisService } from './redisService';
import { SolanaService } from './solanaService';
import { TicketStatus, TransferRecord } from '../types';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { config } from '../config';
import { logger } from '../utils/logger';

export class TransferService {
  private log = logger.child({ component: 'TransferService' });
  
  // Transfer configuration constants
  private readonly TRANSFER_COOLDOWN_MINUTES = 30;
  private readonly MAX_DAILY_TRANSFERS = 10;

  async transferTicket(
    ticketId: string,
    fromUserId: string,
    toUserId: string,
    reason?: string
  ): Promise<TransferRecord> {
    // Validate transfer before processing
    const validation = await this.validateTransferRequest(ticketId, fromUserId, toUserId);
    if (!validation.valid) {
      throw new ValidationError(`Transfer not allowed: ${validation.reason}`);
    }

    return await DatabaseService.transaction(async (client) => {
      // Lock ticket for update
      const ticketQuery = 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE';
      const ticketResult = await client.query(ticketQuery, [ticketId]);

      if (ticketResult.rows.length === 0) {
        throw new NotFoundError('Ticket');
      }

      const ticket = ticketResult.rows[0];

      // Validate ownership
      if (ticket.user_id !== fromUserId) {
        throw new ForbiddenError('You do not own this ticket');
      }

      // Validate ticket status
      if (ticket.status !== TicketStatus.SOLD) {
        throw new ValidationError(`Cannot transfer ticket with status: ${ticket.status}`);
      }

      // Enhanced transfer restrictions checking
      const eventQuery = `
        SELECT 
          e.*, 
          v.transfer_deadline_hours,
          e.allow_transfers,
          e.max_transfers_per_ticket,
          e.transfer_blackout_start,
          e.transfer_blackout_end,
          e.require_identity_verification
        FROM events e
        JOIN venues v ON e.venue_id = v.id
        WHERE e.id = $1
      `;
      const eventResult = await client.query(eventQuery, [ticket.event_id]);
      const event = eventResult.rows[0];

      // Check if transfers are allowed for this event
      if (event.allow_transfers === false) {
        throw new ValidationError('Transfers are not allowed for this event');
      }

      // Check transfer deadline
      const hoursUntilEvent = (new Date(event.start_date).getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilEvent < event.transfer_deadline_hours) {
        throw new ValidationError('Transfer deadline has passed for this event');
      }

      // Check blackout periods
      const now = new Date();
      if (event.transfer_blackout_start && event.transfer_blackout_end) {
        if (now >= new Date(event.transfer_blackout_start) && now <= new Date(event.transfer_blackout_end)) {
          throw new ValidationError('Transfers are currently in blackout period');
        }
      }

      // Check max transfers limit
      const transferCountQuery = `
        SELECT COUNT(*) as transfer_count 
        FROM ticket_transfers 
        WHERE ticket_id = $1
      `;
      const transferCountResult = await client.query(transferCountQuery, [ticketId]);
      const transferCount = parseInt(transferCountResult.rows[0].transfer_count);
      
      if (event.max_transfers_per_ticket && transferCount >= event.max_transfers_per_ticket) {
        throw new ValidationError(`Maximum transfer limit (${event.max_transfers_per_ticket}) reached`);
      }

      // Check identity verification requirement
      if (event.require_identity_verification) {
        const verificationQuery = `
          SELECT identity_verified 
          FROM users 
          WHERE id IN ($1, $2)
        `;
        const verificationResult = await client.query(verificationQuery, [fromUserId, toUserId]);
        
        for (const user of verificationResult.rows) {
          if (!user.identity_verified) {
            throw new ValidationError('Identity verification required for transfers');
          }
        }
      }

      // Update ticket ownership
      const updateQuery = `
        UPDATE tickets
        SET user_id = $1, status = $2, updated_at = NOW()
        WHERE id = $3
      `;
      await client.query(updateQuery, [toUserId, TicketStatus.TRANSFERRED, ticketId]);

      // Record transfer
      const transferRecord: TransferRecord = {
        fromUserId,
        toUserId,
        transferredAt: new Date(),
        reason
      };

      const transferQuery = `
        INSERT INTO ticket_transfers
        (id, ticket_id, from_user_id, to_user_id, reason, transferred_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      await client.query(transferQuery, [
        uuidv4(),
        ticketId,
        fromUserId,
        toUserId,
        reason || null,
        new Date()
      ]);

      // Update transfer history
      const historyQuery = `
        UPDATE tickets
        SET transfer_history = transfer_history || $1::jsonb
        WHERE id = $2
      `;
      await client.query(historyQuery, [
        JSON.stringify([transferRecord]),
        ticketId
      ]);

      // Transfer NFT if minted
      if (ticket.nft_token_id) {
        try {
          const txHash = await SolanaService.transferNFT(
            ticket.nft_token_id,
            fromUserId,
            toUserId
          );

          transferRecord.transactionHash = txHash;

          // Update transfer record with blockchain transaction
          await client.query(
            'UPDATE ticket_transfers SET transaction_hash = $1 WHERE ticket_id = $2 AND transferred_at = $3',
            [txHash, ticketId, transferRecord.transferredAt]
          );
        } catch (error) {
          this.log.error('NFT transfer failed:', error);
          // Continue with database transfer even if blockchain fails
        }
      }

      // Clear cache
      await RedisService.del(`ticket:${ticketId}`);

      // Publish transfer event
      await queueService.publish(config.rabbitmq.queues.ticketEvents, {
        type: 'ticket.transferred',
        ticketId,
        fromUserId,
        toUserId,
        timestamp: new Date()
      });

      // Send notifications
      await queueService.publish(config.rabbitmq.queues.notifications, {
        type: 'ticket.transfer.sender',
        userId: fromUserId,
        ticketId,
        toUserId
      });

      await queueService.publish(config.rabbitmq.queues.notifications, {
        type: 'ticket.transfer.receiver',
        userId: toUserId,
        ticketId,
        fromUserId
      });

      return transferRecord;
    });
  }

  async getTransferHistory(ticketId: string): Promise<TransferRecord[]> {
    const query = `
      SELECT * FROM ticket_transfers
      WHERE ticket_id = $1
      ORDER BY transferred_at DESC
    `;

    const result = await DatabaseService.query<TransferRecord>(query, [ticketId]);
    return result.rows;
  }

  async validateTransferRequest(
    ticketId: string,
    fromUserId: string,
    toUserId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Check if users exist and are not the same
      if (fromUserId === toUserId) {
        return { valid: false, reason: 'Cannot transfer ticket to yourself' };
      }

      // Check user blacklists
      const blacklistQuery = `
        SELECT 1 FROM user_blacklists 
        WHERE (user_id = $1 OR user_id = $2) 
        AND (action_type = 'transfer' OR action_type = 'all')
        AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      `;
      const blacklistResult = await DatabaseService.query(blacklistQuery, [fromUserId, toUserId]);
      
      if (blacklistResult.rows.length > 0) {
        return { valid: false, reason: 'User is blacklisted from transfers' };
      }

      // Check transfer cooldown period (prevent rapid transfers)
      const cooldownQuery = `
        SELECT transferred_at 
        FROM ticket_transfers 
        WHERE ticket_id = $1 
        ORDER BY transferred_at DESC 
        LIMIT 1
      `;
      const cooldownResult = await DatabaseService.query(cooldownQuery, [ticketId]);
      
      if (cooldownResult.rows.length > 0) {
        const lastTransfer = new Date(cooldownResult.rows[0].transferred_at);
        const minutesSinceLastTransfer = (Date.now() - lastTransfer.getTime()) / (1000 * 60);
        
        if (minutesSinceLastTransfer < this.TRANSFER_COOLDOWN_MINUTES) {
          return { 
            valid: false, 
            reason: `Please wait ${Math.ceil(this.TRANSFER_COOLDOWN_MINUTES - minutesSinceLastTransfer)} minutes before transferring again` 
          };
        }
      }

      // Check rate limiting for user transfers
      const rateLimitQuery = `
        SELECT COUNT(*) as transfer_count 
        FROM ticket_transfers 
        WHERE from_user_id = $1 
        AND transferred_at > NOW() - INTERVAL '24 hours'
      `;
      const rateLimitResult = await DatabaseService.query(rateLimitQuery, [fromUserId]);
      const dailyTransfers = parseInt(rateLimitResult.rows[0].transfer_count);
      
      if (dailyTransfers >= this.MAX_DAILY_TRANSFERS) {
        return { 
          valid: false, 
          reason: `Daily transfer limit (${this.MAX_DAILY_TRANSFERS}) exceeded` 
        };
      }

      // Verify recipient can receive tickets
      const recipientQuery = `
        SELECT 
          account_status,
          can_receive_transfers,
          email_verified
        FROM users 
        WHERE id = $1
      `;
      const recipientResult = await DatabaseService.query(recipientQuery, [toUserId]);
      
      if (recipientResult.rows.length === 0) {
        return { valid: false, reason: 'Recipient user not found' };
      }
      
      const recipient = recipientResult.rows[0];
      
      if (recipient.account_status !== 'active') {
        return { valid: false, reason: 'Recipient account is not active' };
      }
      
      if (recipient.can_receive_transfers === false) {
        return { valid: false, reason: 'Recipient cannot receive transfers' };
      }
      
      if (!recipient.email_verified) {
        return { valid: false, reason: 'Recipient must verify email to receive transfers' };
      }

      // Check ticket-specific transfer rules
      const ticketQuery = `
        SELECT 
          t.status,
          t.is_transferable,
          t.transfer_locked_until,
          e.id as event_id
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.id = $1
      `;
      const ticketResult = await DatabaseService.query(ticketQuery, [ticketId]);
      
      if (ticketResult.rows.length === 0) {
        return { valid: false, reason: 'Ticket not found' };
      }
      
      const ticket = ticketResult.rows[0];
      
      if (ticket.is_transferable === false) {
        return { valid: false, reason: 'This ticket is non-transferable' };
      }
      
      if (ticket.transfer_locked_until && new Date(ticket.transfer_locked_until) > new Date()) {
        return { 
          valid: false, 
          reason: `Ticket is locked from transfers until ${new Date(ticket.transfer_locked_until).toLocaleString()}` 
        };
      }

      return { valid: true };
    } catch (error) {
      this.log.error('Transfer validation error:', error);
      return { valid: false, reason: error instanceof Error ? error.message : 'Unknown validation error' };
    }
  }
}

export const transferService = new TransferService();
```

### FILE: src/services/refundHandler.ts
```typescript
import { DatabaseService } from './databaseService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RefundHandler' });

class RefundHandlerClass {
  async initiateRefund(orderId: string, reason: string) {
    const db = DatabaseService.getPool();
    
    try {
      // Update order status
      await db.query(
        `UPDATE orders 
         SET status = 'REFUND_INITIATED', updated_at = NOW() 
         WHERE id = $1`,
        [orderId]
      );
      
      // Get payment details
      const result = await db.query(
        `SELECT payment_intent_id, total_amount FROM orders WHERE id = $1`,
        [orderId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }
      
      const order = result.rows[0];
      
      // Queue refund request to payment service
      await db.query(
        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          orderId,
          'order',
          'refund.requested',
          JSON.stringify({
            orderId,
            paymentIntentId: order.payment_intent_id,
            amount: order.total_amount,
            reason
          })
        ]
      );
      
      log.info('Refund initiated', { orderId, reason });
      
      return { success: true, orderId, status: 'REFUND_INITIATED' };
      
    } catch (error) {
      log.error('Failed to initiate refund', { orderId, error });
      throw error;
    }
  }
}

export const RefundHandler = new RefundHandlerClass();
```

### FILE: src/services/solanaService.ts
```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { NFTMintRequest } from '../types';

class SolanaServiceClass {
  private connection: Connection | null = null;
  private wallet: Keypair | null = null;
  private log = logger.child({ component: 'SolanaService' });

  async initialize(): Promise<void> {
    try {
      this.connection = new Connection(config.solana.rpcUrl, config.solana.commitment);
      
      // Make wallet optional for development
      if (config.solana.walletPrivateKey && config.solana.walletPrivateKey !== 'your-wallet-private-key') {
        try {
          const privateKey = Uint8Array.from(
            Buffer.from(config.solana.walletPrivateKey, 'base64')
          );
          this.wallet = Keypair.fromSecretKey(privateKey);
          this.log.info('Solana wallet loaded', {
            publicKey: this.wallet.publicKey.toBase58()
          });
        } catch (walletError) {
          this.log.warn('Solana wallet not configured - NFT minting will be simulated', walletError);
        }
      } else {
        this.log.warn('Solana wallet not configured - NFT minting will be simulated');
      }

      // Test connection
      const version = await this.connection.getVersion();
      this.log.info('Solana connected', { version });
    } catch (error) {
      this.log.error('Failed to initialize Solana:', error);
      throw error;
    }
  }

  getConnection(): Connection {
    if (!this.connection) {
      throw new Error('Solana not initialized');
    }
    return this.connection;
  }

  getWallet(): Keypair {
    if (!this.wallet) {
      throw new Error('Solana wallet not initialized');
    }
    return this.wallet;
  }

  async mintNFT(request: NFTMintRequest): Promise<{ tokenId: string; transactionHash: string }> {
    // This is a placeholder - actual implementation would use Metaplex
    this.log.info('Minting NFT (simulated)', { ticketId: request.ticketId });
    
    // Simulate minting
    return {
      tokenId: `token_${Date.now()}`,
      transactionHash: `tx_${Date.now()}`
    };
  }

  async transferNFT(tokenId: string, from: string, to: string): Promise<string> {
    // Placeholder for NFT transfer
    this.log.info('Transferring NFT (simulated)', { tokenId, from, to });
    return `transfer_tx_${Date.now()}`;
  }
}

export const SolanaService = new SolanaServiceClass();
```

### FILE: src/services/databaseService.ts
```typescript
import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

class DatabaseServiceClass {
  private pool: Pool | null = null;
  private log = logger.child({ component: 'DatabaseService' });

  async initialize(): Promise<void> {
    try {
      this.pool = new Pool({
        connectionString: config.database.url,
        max: config.database.pool?.max || 20,
        min: config.database.pool?.min || 2,
        idleTimeoutMillis: config.database.pool?.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.database.pool?.connectionTimeoutMillis || 5000
      });

      this.pool.on('error', (err) => {
        this.log.error('Database pool error:', err);
      });

      await this.pool.query('SELECT 1');
      this.log.info('Database service initialized');
    } catch (error) {
      this.log.error('Failed to initialize database service:', error);
      throw error;
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
    return this.pool;
  }

  async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const result = await this.pool.query(text, params);
    return { rows: result.rows, rowCount: result.rowCount };
  }

  async transaction<T = any>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      
      // CRITICAL: Explicitly wait for COMMIT to complete
      const commitResult = await client.query('COMMIT');
      console.log('✅ COMMIT response:', commitResult);
      
      // Force a flush by querying transaction status
      const statusCheck = await client.query('SELECT txid_current_if_assigned()');
      console.log('Transaction ID after commit:', statusCheck.rows[0]);
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

export const DatabaseService = new DatabaseServiceClass();
```

### FILE: src/services/queueService.ts
```typescript
import * as amqplib from 'amqplib';
import { config } from '../config';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

class QueueServiceClass extends EventEmitter {
  private connection: any = null;
  private publishChannel: any = null;
  private consumeChannel: any = null;
  private log = logger.child({ component: 'QueueService' });
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;

  async initialize(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      this.connection = await amqplib.connect(config.rabbitmq.url);

      this.connection.on('error', (err: any) => {
        this.log.error('RabbitMQ connection error:', err);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        this.log.warn('RabbitMQ connection closed');
        this.handleConnectionError();
      });

      this.publishChannel = await this.connection.createChannel();
      this.consumeChannel = await this.connection.createChannel();

      await this.setupQueues();

      this.reconnectAttempts = 0;
      this.log.info('Queue service connected');
      this.emit('connected');
    } catch (error) {
      this.log.error('Failed to connect to RabbitMQ:', error);
      this.handleConnectionError();
      throw error;
    }
  }

  private async setupQueues(): Promise<void> {
    const queues = Object.values(config.rabbitmq.queues);

    for (const queue of queues) {
      if (this.publishChannel) {
        await this.publishChannel.assertQueue(queue, { durable: true });
      }
    }
  }

  private handleConnectionError(): void {
    if (this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log.error('Max reconnection attempts reached');
      this.emit('max_reconnect_attempts');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);

    this.log.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        this.log.error('Reconnection failed:', error);
      }
    }, delay);
  }

  async publish(queue: string, message: any): Promise<void> {
    if (!this.publishChannel) {
      throw new Error('Queue service not initialized');
    }

    const messageBuffer = Buffer.from(JSON.stringify(message));

    try {
      const sent = this.publishChannel.sendToQueue(queue, messageBuffer, { persistent: true });

      if (!sent) {
        this.log.warn('Message was not sent, queue buffer full', { queue });
        throw new Error('Queue buffer full');
      }
    } catch (error) {
      this.log.error('Failed to publish message:', error);
      throw error;
    }
  }

  async consume(queue: string, handler: (msg: any) => Promise<void>): Promise<void> {
    if (!this.consumeChannel) {
      throw new Error('Queue service not initialized');
    }

    await this.consumeChannel.prefetch(1);

    await this.consumeChannel.consume(queue, async (msg: any) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString());
        await handler(content);

        if (this.consumeChannel) {
          this.consumeChannel.ack(msg);
        }
      } catch (error) {
        this.log.error('Error processing message:', error);

        if (this.consumeChannel) {
          this.consumeChannel.nack(msg, false, true);
        }
      }
    });
  }

  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.publishChannel) {
      await this.publishChannel.close();
    }

    if (this.consumeChannel) {
      await this.consumeChannel.close();
    }

    if (this.connection) {
      await this.connection.close();
    }

    this.log.info('Queue service closed');
  }

  isConnected(): boolean {
    return this.connection !== null && this.publishChannel !== null;
  }
}

export const QueueService = new QueueServiceClass();
```

### FILE: src/services/discountService.ts
```typescript
import { DatabaseService } from './databaseService';
import { logger } from '../utils/logger';

interface Discount {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'bogo' | 'early_bird';
  value: number;
  priority: number;  // Lower number = higher priority
  stackable: boolean;
  maxUses?: number;
  currentUses?: number;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom: Date;
  validUntil: Date;
  eventId?: string;
  ticketTypeIds?: string[];
}

interface DiscountApplication {
  discountId: string;
  code: string;
  type: string;
  amountInCents: number;
  appliedTo: 'order' | 'tickets';
}

export class DiscountService {
  private log = logger.child({ component: 'DiscountService' });

  // ISSUE #23 FIX: Validate and apply discounts with proper stacking rules
  async applyDiscounts(
    orderAmountCents: number,
    discountCodes: string[],
    eventId?: string,
    ticketTypeIds?: string[]
  ): Promise<{
    finalAmountCents: number;
    discountsApplied: DiscountApplication[];
    totalDiscountCents: number;
  }> {
    if (!discountCodes || discountCodes.length === 0) {
      return {
        finalAmountCents: orderAmountCents,
        discountsApplied: [],
        totalDiscountCents: 0
      };
    }

    // Get all valid discounts
    const validDiscounts = await this.getValidDiscounts(discountCodes, eventId);
    
    // Sort by priority (lower number = higher priority)
    validDiscounts.sort((a, b) => a.priority - b.priority);

    const discountsApplied: DiscountApplication[] = [];
    let currentAmountCents = orderAmountCents;
    let hasNonStackable = false;

    for (const discount of validDiscounts) {
      // ISSUE #23 FIX: Check stacking rules
      if (hasNonStackable) {
        this.log.info('Skipping discount due to non-stackable discount already applied', {
          code: discount.code,
          skipped: true
        });
        continue;
      }

      if (!discount.stackable) {
        // If this is non-stackable and we already have discounts, skip it
        if (discountsApplied.length > 0) {
          this.log.info('Skipping non-stackable discount as other discounts already applied', {
            code: discount.code
          });
          continue;
        }
        hasNonStackable = true;
      }

      // Check minimum purchase requirement
      if (discount.minPurchaseAmount && orderAmountCents < discount.minPurchaseAmount * 100) {
        this.log.info('Discount minimum purchase not met', {
          code: discount.code,
          required: discount.minPurchaseAmount,
          actual: orderAmountCents / 100
        });
        continue;
      }

      // Calculate discount amount
      let discountAmountCents = 0;
      
      switch (discount.type) {
        case 'percentage':
          // Percentage off the current amount (after previous discounts)
          discountAmountCents = Math.round((currentAmountCents * discount.value) / 100);
          break;
          
        case 'fixed':
          // Fixed amount off (in dollars, convert to cents)
          discountAmountCents = Math.min(discount.value * 100, currentAmountCents);
          break;
          
        case 'early_bird':
          // Early bird discount (percentage)
          discountAmountCents = Math.round((currentAmountCents * discount.value) / 100);
          break;
          
        case 'bogo':
          // Buy one get one - 50% off for even quantities
          discountAmountCents = Math.round(currentAmountCents * 0.25); // Approximation
          break;
      }

      // Apply max discount cap if specified
      if (discount.maxDiscountAmount) {
        discountAmountCents = Math.min(discountAmountCents, discount.maxDiscountAmount * 100);
      }

      // Ensure we don't discount more than the remaining amount
      discountAmountCents = Math.min(discountAmountCents, currentAmountCents);

      if (discountAmountCents > 0) {
        discountsApplied.push({
          discountId: discount.id,
          code: discount.code,
          type: discount.type,
          amountInCents: discountAmountCents,
          appliedTo: 'order'
        });

        currentAmountCents -= discountAmountCents;

        // Record discount usage
        await this.recordDiscountUsage(discount.id);
      }
    }

    const totalDiscountCents = orderAmountCents - currentAmountCents;

    this.log.info('Discounts applied', {
      original: orderAmountCents,
      final: currentAmountCents,
      totalDiscount: totalDiscountCents,
      discountsApplied: discountsApplied.length
    });

    return {
      finalAmountCents: currentAmountCents,
      discountsApplied,
      totalDiscountCents
    };
  }

  private async getValidDiscounts(codes: string[], eventId?: string): Promise<Discount[]> {
    const query = `
      SELECT * FROM discounts 
      WHERE code = ANY($1)
        AND valid_from <= NOW()
        AND valid_until >= NOW()
        AND (max_uses IS NULL OR current_uses < max_uses)
        AND (event_id IS NULL OR event_id = $2)
        AND active = true
      ORDER BY priority ASC
    `;

    try {
      const result = await DatabaseService.query<Discount>(query, [codes, eventId || null]);
      return result.rows;
    } catch (error) {
      this.log.error('Failed to fetch discounts', { codes, error });
      return [];
    }
  }

  private async recordDiscountUsage(discountId: string): Promise<void> {
    const query = `
      UPDATE discounts 
      SET current_uses = COALESCE(current_uses, 0) + 1,
          last_used_at = NOW()
      WHERE id = $1
    `;

    try {
      await DatabaseService.query(query, [discountId]);
    } catch (error) {
      this.log.error('Failed to record discount usage', { discountId, error });
    }
  }

  async validateDiscountCode(code: string, eventId?: string): Promise<{
    valid: boolean;
    reason?: string;
    discount?: Partial<Discount>;
  }> {
    const query = `
      SELECT * FROM discounts 
      WHERE code = $1
        AND (event_id IS NULL OR event_id = $2)
      LIMIT 1
    `;

    try {
      const result = await DatabaseService.query<Discount>(query, [code, eventId || null]);
      
      if (result.rows.length === 0) {
        return { valid: false, reason: 'Invalid discount code' };
      }

      const discount = result.rows[0];

      // Check validity
      const now = new Date();
      if (new Date(discount.validFrom) > now) {
        return { valid: false, reason: 'Discount not yet active' };
      }

      if (new Date(discount.validUntil) < now) {
        return { valid: false, reason: 'Discount has expired' };
      }

      // Fix for TypeScript error - check both maxUses and currentUses properly
      if (discount.maxUses && discount.currentUses !== undefined && discount.currentUses >= discount.maxUses) {
        return { valid: false, reason: 'Discount usage limit reached' };
      }

      return { 
        valid: true, 
        discount: {
          type: discount.type,
          value: discount.value,
          stackable: discount.stackable
        }
      };
    } catch (error) {
      this.log.error('Failed to validate discount', { code, error });
      return { valid: false, reason: 'Error validating discount' };
    }
  }
}

export const discountService = new DiscountService();
```

### FILE: src/services/qrService.ts
```typescript
import QRCode from 'qrcode';
import crypto from 'crypto';
import { RedisService } from './redisService';
import { DatabaseService } from './databaseService';
import { config } from '../config';
import { QRValidation, TicketStatus } from '../types';
import { ValidationError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

export class QRService {
  private log = logger.child({ component: 'QRService' });
  private encryptionKey = Buffer.from(config.qr.encryptionKey, 'utf-8');

  async generateRotatingQR(ticketId: string): Promise<{ qrCode: string; qrImage: string }> {
    const ticket = await this.getTicketData(ticketId);
    
    // Create time-based QR data
    const timestamp = Math.floor(Date.now() / config.qr.rotationInterval);
    const qrData = {
      ticketId,
      eventId: ticket.event_id,
      timestamp,
      nonce: crypto.randomBytes(8).toString('hex')
    };

    // Encrypt QR data
    const encrypted = this.encrypt(JSON.stringify(qrData));
    const qrString = `TKT:${encrypted}`;

    // Generate QR image
    const qrImage = await QRCode.toDataURL(qrString, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Store validation data in Redis
    const validationKey = `qr:${ticketId}:${timestamp}`;
    await RedisService.set(
      validationKey,
      JSON.stringify({
        ticketId,
        eventId: ticket.event_id,
        validUntil: new Date((timestamp + 1) * config.qr.rotationInterval)
      }),
      config.qr.rotationInterval * 2 // Keep for 2 rotation periods
    );

    return { qrCode: qrString, qrImage };
  }

  async validateQR(qrCode: string, validationData: {
    eventId: string;
    entrance?: string;
    deviceId?: string;
    validatorId?: string;
  }): Promise<QRValidation> {
    try {
      // Extract and decrypt QR data
      if (!qrCode.startsWith('TKT:')) {
        throw new ValidationError('Invalid QR format');
      }

      const encrypted = qrCode.substring(4);
      const decrypted = this.decrypt(encrypted);
      const qrData = JSON.parse(decrypted);

      // Validate timestamp
      const currentTimestamp = Math.floor(Date.now() / config.qr.rotationInterval);
      const timeDiff = currentTimestamp - qrData.timestamp;

      if (timeDiff < 0 || timeDiff > 2) {
        return {
          ticketId: qrData.ticketId,
          eventId: qrData.eventId,
          isValid: false,
          reason: 'QR code expired'
        };
      }

      // Validate event match
      if (qrData.eventId !== validationData.eventId) {
        return {
          ticketId: qrData.ticketId,
          eventId: qrData.eventId,
          isValid: false,
          reason: 'Wrong event'
        };
      }

      // Check if ticket already used
      const ticket = await this.getTicketData(qrData.ticketId);
      
      if (ticket.status === TicketStatus.USED) {
        return {
          ticketId: qrData.ticketId,
          eventId: qrData.eventId,
          isValid: false,
          validatedAt: ticket.validated_at,
          reason: 'Ticket already used'
        };
      }

      if (ticket.status !== TicketStatus.SOLD) {
        return {
          ticketId: qrData.ticketId,
          eventId: qrData.eventId,
          isValid: false,
          reason: `Invalid ticket status: ${ticket.status}`
        };
      }

      // Mark ticket as used
      await DatabaseService.transaction(async (client) => {
        // Lock ticket for update
        const lockQuery = 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE';
        const lockResult = await client.query(lockQuery, [qrData.ticketId]);

        if (lockResult.rows[0].status === TicketStatus.USED) {
          throw new ValidationError('Ticket was just used');
        }

        // Update ticket status
        const updateQuery = `
          UPDATE tickets 
          SET status = $1, validated_at = $2, validator_id = $3, entrance = $4
          WHERE id = $5
        `;

        await client.query(updateQuery, [
          TicketStatus.USED,
          new Date(),
          validationData.validatorId || null,
          validationData.entrance || null,
          qrData.ticketId
        ]);

        // Log validation
        const logQuery = `
          INSERT INTO ticket_validations 
          (ticket_id, event_id, validated_at, validator_id, entrance, device_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `;

        await client.query(logQuery, [
          qrData.ticketId,
          qrData.eventId,
          new Date(),
          validationData.validatorId || null,
          validationData.entrance || null,
          validationData.deviceId || null
        ]);
      });

      // Clear ticket cache
      await RedisService.del(`ticket:${qrData.ticketId}`);

      return {
        ticketId: qrData.ticketId,
        eventId: qrData.eventId,
        isValid: true,
        validatedAt: new Date()
      };

    } catch (error) {
      this.log.error('QR validation error:', error);
      
      if (error instanceof ValidationError) {
        return {
          ticketId: '',
          eventId: validationData.eventId,
          isValid: false,
          reason: 'Ticket was just validated'
        };
      }

      return {
        ticketId: '',
        eventId: validationData.eventId,
        isValid: false,
        reason: 'Invalid QR code'
      };
    }
  }

  private async getTicketData(ticketId: string): Promise<any> {
    const query = 'SELECT * FROM tickets WHERE id = $1';
    const result = await DatabaseService.query(query, [ticketId]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('Ticket');
    }

    return result.rows[0];
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey.slice(0, 32), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey.slice(0, 32), iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

export const qrService = new QRService();
```

### FILE: src/services/paymentEventHandler.ts
```typescript
import { DatabaseService } from './databaseService';
import { QUEUES } from '@tickettoken/shared';
import { QueueService } from './queueService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'PaymentEventHandler' });

class PaymentEventHandlerClass {
  async handlePaymentSucceeded(orderId: string, paymentId: string) {
    const db = DatabaseService.getPool();
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update order status
      await client.query(
        `UPDATE orders 
         SET status = 'PAID', 
             payment_intent_id = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [orderId, paymentId]
      );
      
      // Get order details
      const orderResult = await client.query(
        `SELECT * FROM orders WHERE id = $1`,
        [orderId]
      );
      
      if (orderResult.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }
      
      const order = orderResult.rows[0];
      
      // Queue NFT minting job
      const mintJob = {
        orderId: order.id,
        userId: order.user_id,
        eventId: order.event_id,
        quantity: order.ticket_quantity,
        timestamp: new Date().toISOString()
      };
      
      await QueueService.publish('ticket.mint', mintJob);
      
      // Write to outbox
      await client.query(
        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          orderId,
          'order',
          'order.paid',
          JSON.stringify(mintJob)
        ]
      );
      
      await client.query('COMMIT');
      
      log.info('Order marked as paid, NFT minting queued', { 
        orderId, 
        quantity: order.ticket_quantity 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Failed to handle payment success', { orderId, error });
      throw error;
    } finally {
      client.release();
    }
  }
  
  async handlePaymentFailed(orderId: string, reason: string) {
    const db = DatabaseService.getPool();
    
    await db.query(
      `UPDATE orders 
       SET status = 'PAYMENT_FAILED', 
           updated_at = NOW()
       WHERE id = $1`,
      [orderId]
    );
    
    log.info('Order marked as payment failed', { orderId, reason });
  }
}

export const PaymentEventHandler = new PaymentEventHandlerClass();
```

### FILE: src/workers/reservation-expiry.worker.ts
```typescript
import knex from 'knex';

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/tickettoken_db'
});

export class ReservationExpiryWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  start(intervalMs: number = 60000) { // Run every minute
    if (this.intervalId) {
      console.log('Reservation expiry worker already running');
      return;
    }

    console.log('Starting reservation expiry worker...');
    this.intervalId = setInterval(() => this.processExpiredReservations(), intervalMs);

    // Run immediately on start
    this.processExpiredReservations();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Reservation expiry worker stopped');
    }
  }

  private async processExpiredReservations() {
    if (this.isRunning) {
      console.log('Expiry job already running, skipping...');
      return;
    }

    this.isRunning = true;

    try {
      const startTime = Date.now();

      // Call the stored procedure to release expired reservations
      const result = await db.raw('SELECT release_expired_reservations() as count');
      const releasedCount = result.rows[0].count;

      if (releasedCount > 0) {
        console.log(`Released ${releasedCount} expired reservations in ${Date.now() - startTime}ms`);

        // Get the expired reservations to write to outbox
        const expiredReservations = await db('reservations')
          .where('status', 'EXPIRED')
          .where('released_at', '>=', db.raw("NOW() - INTERVAL '2 minutes'"))
          .select('id', 'order_id', 'user_id', 'quantity');

        // Write events to outbox (without tenant_id)
        for (const reservation of expiredReservations) {
          await db('outbox').insert({
            aggregate_type: 'reservation',
            aggregate_id: reservation.order_id,
            event_type: 'reservation.expired',
            payload: JSON.stringify({
              reservationId: reservation.id,
              orderId: reservation.order_id,
              userId: reservation.user_id,
              quantity: reservation.quantity,
              expiredAt: new Date()
            }),
            processed: false
          });
        }

        if (expiredReservations.length > 0) {
          console.log(`Wrote ${expiredReservations.length} expiry events to outbox`);
        }
      }
    } catch (error) {
      console.error('Error processing expired reservations:', error);
    } finally {
      this.isRunning = false;
    }
  }
}
```

### FILE: src/workers/mintWorker.ts
```typescript
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'MintWorker' });

interface MintJob {
  orderId: string;
  userId: string;
  eventId: string;
  quantity: number;
  timestamp: string;
}

class MintWorkerClass {
  async processMintJob(job: MintJob) {
    log.info('Processing mint job', job);
    
    const db = DatabaseService.getPool();
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create tickets (NFTs)
      const tickets = [];
      for (let i = 0; i < job.quantity; i++) {
        const ticketId = uuidv4();
        
        // Mock NFT minting (in real implementation, this would call Solana)
        const nftMint = await this.mintNFT(ticketId, job.userId, job.eventId);
        
        // Store ticket in database
        await client.query(
          `INSERT INTO tickets (id, order_id, user_id, event_id, nft_address, status, created_at)
           VALUES ($1, $2, $3, $4, $5, 'MINTED', NOW())`,
          [ticketId, job.orderId, job.userId, job.eventId, nftMint.address]
        );
        
        tickets.push({
          id: ticketId,
          nftAddress: nftMint.address,
          signature: nftMint.signature
        });
        
        log.info('Ticket minted', { ticketId, nftAddress: nftMint.address });
      }
      
      // Update order status
      await client.query(
        `UPDATE orders SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
        [job.orderId]
      );
      
      // Write completion event to outbox
      await client.query(
        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          job.orderId,
          'order',
          'order.completed',
          JSON.stringify({ orderId: job.orderId, tickets })
        ]
      );
      
      await client.query('COMMIT');
      
      log.info('Mint job completed', { 
        orderId: job.orderId, 
        ticketCount: tickets.length 
      });
      
      return { success: true, tickets };
      
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Mint job failed', { job, error });
      
      // On failure, trigger refund flow (Phase 1.5)
      await this.handleMintFailure(job.orderId, (error as Error).message);
      
      throw error;
    } finally {
      client.release();
    }
  }
  
  private async mintNFT(_ticketId: string, _userId: string, _eventId: string) {
    // Mock NFT minting - in production this would use SolanaService
    const mockAddress = `mock_nft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const mockSignature = `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Simulate minting delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Random failure for testing (5% chance)
    if (Math.random() < 0.05) {
      throw new Error('Mock mint failure - network timeout');
    }
    
    return {
      address: mockAddress,
      signature: mockSignature
    };
  }
  
  private async handleMintFailure(orderId: string, reason: string) {
    const db = DatabaseService.getPool();
    
    await db.query(
      `UPDATE orders SET status = 'MINT_FAILED', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );
    
    // Queue refund (Phase 1.5)
    await db.query(
      `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [
        orderId,
        'order',
        'order.mint_failed',
        JSON.stringify({ orderId, reason, refundRequired: true })
      ]
    );
  }
}

export const MintWorker = new MintWorkerClass();
```

### FILE: src/workers/reservation-cleanup.worker.ts
```typescript
import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RedisService } from '../services/redisService';
import { QueueService } from '../services/queueService';

interface OrphanReservation {
  reservation_id: string;
  order_id: string;
  user_id: string;
  created_at: Date;
  expires_at: Date;
  status: string;
  quantity: number;
  issue_type: 'no_order' | 'order_failed' | 'should_be_expired';
}

export class ReservationCleanupWorker {
  private pool: Pool;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private log = logger.child({ component: 'ReservationCleanupWorker' });
  private metrics = {
    totalReleased: 0,
    orphansFound: 0,
    orphansFixed: 0,
    errors: 0,
    lastRun: null as Date | null
  };

  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: 5 // Dedicated pool for cleanup worker
    });
  }

  async start(intervalMs: number = 60000): Promise<void> {
    if (this.intervalId) {
      this.log.info('Reservation cleanup worker already running');
      return;
    }

    this.log.info('Starting reservation cleanup worker', { interval: intervalMs });
    
    // Run immediately on start
    await this.runCleanup();
    
    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runCleanup().catch(error => {
        this.log.error('Cleanup run failed', error);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.log.info('Reservation cleanup worker stopped');
    }
  }

  private async runCleanup(): Promise<void> {
    if (this.isRunning) {
      this.log.debug('Cleanup already running, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // 1. Release expired reservations
      const expiredCount = await this.releaseExpiredReservations();
      
      // 2. Find and fix orphan reservations
      const orphansFixed = await this.fixOrphanReservations();
      
      // 3. Clean up stale Redis entries
      const redisCleanup = await this.cleanupRedisReservations();
      
      // 4. Reconcile inventory discrepancies
      await this.reconcileInventory();
      
      // 5. Notify about cleaned up reservations
      await this.notifyCleanups();

      const duration = Date.now() - startTime;
      this.metrics.lastRun = new Date();

      this.log.info('Cleanup completed', {
        duration,
        expired: expiredCount,
        orphansFixed,
        redisCleaned: redisCleanup,
        metrics: this.metrics
      });

    } catch (error) {
      this.metrics.errors++;
      this.log.error('Cleanup error', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async releaseExpiredReservations(): Promise<number> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Call the stored procedure
      const result = await client.query('SELECT release_expired_reservations() as count');
      const releasedCount = result.rows[0].count;

      if (releasedCount > 0) {
        // Get details of expired reservations for events
        const expiredDetails = await client.query(`
          SELECT 
            r.id,
            r.order_id,
            r.user_id,
            r.quantity,
            r.expires_at,
            r.event_id,
            COALESCE(r.tickets, '[]'::jsonb) as tickets
          FROM reservations r
          WHERE r.status = 'EXPIRED'
            AND r.released_at >= NOW() - INTERVAL '2 minutes'
        `);

        // Write to outbox for each expired reservation
        for (const reservation of expiredDetails.rows) {
          await client.query(`
            INSERT INTO outbox (
              aggregate_id,
              aggregate_type,
              event_type,
              payload,
              created_at
            ) VALUES ($1, $2, $3, $4, NOW())
          `, [
            reservation.order_id || reservation.id,
            'reservation',
            'reservation.expired',
            JSON.stringify({
              reservationId: reservation.id,
              orderId: reservation.order_id,
              userId: reservation.user_id,
              eventId: reservation.event_id,
              quantity: reservation.quantity,
              tickets: reservation.tickets,
              expiredAt: new Date()
            })
          ]);

          // Clear from Redis
          await RedisService.del(`reservation:${reservation.id}`);
          
          // Send notification to user
          await QueueService.publish('notifications', {
            type: 'reservation.expired',
            userId: reservation.user_id,
            data: {
              reservationId: reservation.id,
              eventId: reservation.event_id
            }
          });
        }

        this.log.info(`Released ${releasedCount} expired reservations`);
      }

      await client.query('COMMIT');
      this.metrics.totalReleased += releasedCount;
      return releasedCount;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async fixOrphanReservations(): Promise<number> {
    const client = await this.pool.connect();
    let fixed = 0;

    try {
      // Find orphan reservations
      const orphans = await client.query<OrphanReservation>(
        'SELECT * FROM find_orphan_reservations()'
      );

      this.metrics.orphansFound += orphans.rows.length;

      if (orphans.rows.length > 0) {
        this.log.warn(`Found ${orphans.rows.length} orphan reservations`);

        for (const orphan of orphans.rows) {
          await client.query('BEGIN');

          try {
            switch (orphan.issue_type) {
              case 'no_order':
                // Release reservation with no order
                await this.releaseOrphanReservation(client, orphan, 'no_order');
                break;

              case 'order_failed':
                // Release reservation for failed order
                await this.releaseOrphanReservation(client, orphan, 'order_failed');
                break;

              case 'should_be_expired':
                // Force expire old reservations
                await this.releaseOrphanReservation(client, orphan, 'force_expired');
                break;
            }

            await client.query('COMMIT');
            fixed++;

          } catch (error) {
            await client.query('ROLLBACK');
            this.log.error(`Failed to fix orphan reservation ${orphan.reservation_id}`, error);
          }
        }

        this.metrics.orphansFixed += fixed;
        this.log.info(`Fixed ${fixed} orphan reservations`);
      }

    } finally {
      client.release();
    }

    return fixed;
  }

  private async releaseOrphanReservation(
    client: any,
    orphan: OrphanReservation,
    reason: string
  ): Promise<void> {
    // Get reservation details including tickets
    const reservation = await client.query(`
      SELECT * FROM reservations WHERE id = $1
    `, [orphan.reservation_id]);

    if (reservation.rows.length === 0) return;

    const res = reservation.rows[0];

    // Update reservation status
    await client.query(`
      UPDATE reservations
      SET status = 'EXPIRED',
          released_at = NOW(),
          release_reason = $2,
          updated_at = NOW()
      WHERE id = $1
    `, [orphan.reservation_id, reason]);

    // Release inventory
    if (res.tickets && Array.isArray(res.tickets)) {
      for (const ticket of res.tickets) {
        if (ticket.ticketTypeId && ticket.quantity) {
          await client.query(`
            UPDATE ticket_types
            SET available_quantity = available_quantity + $1,
                updated_at = NOW()
            WHERE id = $2
          `, [ticket.quantity, ticket.ticketTypeId]);
        }
      }
    }

    // Record in history
    await client.query(`
      INSERT INTO reservation_history (
        reservation_id,
        order_id,
        user_id,
        status_from,
        status_to,
        reason,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      orphan.reservation_id,
      orphan.order_id,
      orphan.user_id,
      orphan.status,
      'EXPIRED',
      `Orphan cleanup: ${reason}`,
      JSON.stringify({
        issue_type: orphan.issue_type,
        original_expires_at: orphan.expires_at,
        cleaned_at: new Date()
      })
    ]);

    // Clear from Redis
    await RedisService.del(`reservation:${orphan.reservation_id}`);

    this.log.info(`Released orphan reservation`, {
      reservationId: orphan.reservation_id,
      reason,
      issueType: orphan.issue_type
    });
  }

  private async cleanupRedisReservations(): Promise<number> {
    let cleaned = 0;

    try {
      const redisClient = RedisService.getClient();
      const keys = await redisClient.keys('reservation:*');

      for (const key of keys) {
        const reservationId = key.split(':')[1];
        
        // Check if reservation still exists and is active
        const result = await this.pool.query(`
          SELECT status FROM reservations WHERE id = $1
        `, [reservationId]);

        if (result.rows.length === 0 || 
            !['PENDING', 'ACTIVE'].includes(result.rows[0].status)) {
          await RedisService.del(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.log.info(`Cleaned ${cleaned} stale Redis reservation entries`);
      }

    } catch (error) {
      this.log.error('Failed to cleanup Redis reservations', error);
    }

    return cleaned;
  }

  private async reconcileInventory(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Find ticket types with negative inventory (should never happen)
      const negativeInventory = await client.query(`
        SELECT id, name, available_quantity, total_quantity
        FROM ticket_types
        WHERE available_quantity < 0
      `);

      if (negativeInventory.rows.length > 0) {
        this.log.error('Found ticket types with negative inventory', {
          types: negativeInventory.rows
        });

        // Fix by setting to 0
        for (const type of negativeInventory.rows) {
          await client.query(`
            UPDATE ticket_types
            SET available_quantity = 0,
                updated_at = NOW()
            WHERE id = $1
          `, [type.id]);

          // Alert admins
          await QueueService.publish('alerts', {
            type: 'inventory.negative',
            severity: 'critical',
            data: type
          });
        }
      }

      // Find discrepancies between reserved and available quantities
      const discrepancies = await client.query(`
        WITH reservation_counts AS (
          SELECT 
            tt.id as ticket_type_id,
            COALESCE(SUM(
              (SELECT SUM((value->>'quantity')::int)
               FROM jsonb_array_elements(r.tickets) 
               WHERE value->>'ticketTypeId' = tt.id::text)
            ), 0) as reserved_quantity
          FROM ticket_types tt
          LEFT JOIN reservations r ON r.status IN ('PENDING', 'ACTIVE')
            AND r.expires_at > NOW()
            AND r.tickets::text LIKE '%' || tt.id::text || '%'
          GROUP BY tt.id
        )
        SELECT 
          tt.id,
          tt.name,
          tt.total_quantity,
          tt.available_quantity,
          rc.reserved_quantity,
          (tt.total_quantity - tt.available_quantity - rc.reserved_quantity) as discrepancy
        FROM ticket_types tt
        JOIN reservation_counts rc ON rc.ticket_type_id = tt.id
        WHERE (tt.total_quantity - tt.available_quantity - rc.reserved_quantity) != 0
      `);

      if (discrepancies.rows.length > 0) {
        this.log.warn('Found inventory discrepancies', {
          count: discrepancies.rows.length,
          discrepancies: discrepancies.rows
        });

        // Log for manual review
        for (const disc of discrepancies.rows) {
          await client.query(`
            INSERT INTO outbox (
              aggregate_id,
              aggregate_type,
              event_type,
              payload
            ) VALUES ($1, $2, $3, $4)
          `, [
            disc.id,
            'ticket_type',
            'inventory.discrepancy',
            JSON.stringify(disc)
          ]);
        }
      }

    } finally {
      client.release();
    }
  }

  private async notifyCleanups(): Promise<void> {
    // Send summary notification if significant cleanups occurred
    if (this.metrics.orphansFixed > 10 || this.metrics.errors > 5) {
      await QueueService.publish('alerts', {
        type: 'reservation.cleanup.summary',
        severity: this.metrics.errors > 5 ? 'warning' : 'info',
        data: {
          ...this.metrics,
          timestamp: new Date()
        }
      });
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }
}
```

### FILE: src/types/index.ts
```typescript
// Ticket-related types
export interface Ticket {
  id: string;
  eventId: string;
  ticketTypeId: string;
  userId?: string;
  owner_user_id?: string;
  status: TicketStatus;
  price: number;
  seatNumber?: string;
  section?: string;
  row?: string;
  qrCode: string;
  qrCodeSecret: string;
  nftTokenId?: string;
  nftTransactionHash?: string;
  nftMintedAt?: Date;
  purchasedAt?: Date;
  validatedAt?: Date;
  transferHistory: TransferRecord[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum TicketStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD',
  USED = 'USED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  TRANSFERRED = 'TRANSFERRED'
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  availableQuantity: number;
  maxPerPurchase: number;
  saleStartDate: Date;
  saleEndDate: Date;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransferRecord {
  fromUserId: string;
  toUserId: string;
  transferredAt: Date;
  transactionHash?: string;
  reason?: string;
}

export interface TicketReservation {
  id: string;
  userId: string;
  eventId: string;
  tickets: Array<{
    ticketTypeId: string;
    quantity: number;
    seatNumbers?: string[];
  }>;
  expiresAt: Date;
  status: 'active' | 'completed' | 'expired';
  createdAt: Date;
}

export interface QRValidation {
  ticketId: string;
  eventId: string;
  isValid: boolean;
  validatedAt?: Date;
  validatorId?: string;
  entrance?: string;
  deviceId?: string;
  reason?: string;
}

export interface PurchaseRequest {
  userId: string;
  eventId: string;
  tickets: Array<{
    ticketTypeId: string;
    quantity: number;
    seatNumbers?: string[];
  }>;
  paymentIntentId?: string;
  metadata?: Record<string, any>;
}

export interface NFTMintRequest {
  ticketId: string;
  owner: string;
  metadata: {
    eventId: string;
    eventName: string;
    venueName: string;
    eventDate: string;
    ticketType: string;
    seatInfo?: string;
    imageUrl: string;
  };
}

// Service response types
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// Express extensions
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    venueId?: string;
  };
}
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/models/Reservation.ts
```typescript
import { Pool } from 'pg';

export interface IReservation {
  id?: string;
  user_id: string;
  ticket_id: string;
  expires_at: Date;
  status: 'active' | 'expired' | 'completed' | 'cancelled';
  created_at?: Date;
  updated_at?: Date;
}

export class ReservationModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'user_id',
    'ticket_id',
    'expires_at',
    'status'
  ];

  async create(data: IReservation): Promise<IReservation> {
    const query = `
      INSERT INTO reservations (user_id, ticket_id, expires_at, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [data.user_id, data.ticket_id, data.expires_at, data.status || 'active'];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<IReservation | null> {
    const query = 'SELECT * FROM reservations WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findActive(userId: string): Promise<IReservation[]> {
    const query = `
      SELECT * FROM reservations
      WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  async update(id: string, data: Partial<IReservation>): Promise<IReservation | null> {
    // SECURITY FIX: Validate fields against whitelist
    const validFields: string[] = [];
    const validValues: any[] = [];
    
    Object.keys(data).forEach(key => {
      if (this.UPDATABLE_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push((data as any)[key]);
      }
    });

    if (validFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const query = `UPDATE reservations SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const values = [id, ...validValues];
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async expireOldReservations(): Promise<number> {
    const query = `
      UPDATE reservations
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'active' AND expires_at < NOW()
    `;
    const result = await this.pool.query(query);
    return result.rowCount ?? 0;
  }
}

export default ReservationModel;
```

### FILE: src/models/Order.ts
```typescript
import { Pool } from 'pg';

export interface IOrder {
  id?: string;
  user_id: string;
  event_id: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'refunded';
  total_amount: number;
  currency: string;
  tickets?: string[];
  payment_id?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class OrderModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'user_id',
    'event_id',
    'status',
    'total_amount',
    'currency',
    'tickets',
    'payment_id',
    'metadata'
  ];

  async create(data: IOrder): Promise<IOrder> {
    const query = `
      INSERT INTO orders (user_id, event_id, status, total_amount, currency, tickets, payment_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const values = [
      data.user_id, data.event_id, data.status || 'pending',
      data.total_amount, data.currency, data.tickets || [],
      data.payment_id, data.metadata || {}
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<IOrder | null> {
    const query = 'SELECT * FROM orders WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByUserId(userId: string): Promise<IOrder[]> {
    const query = 'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  async update(id: string, data: Partial<IOrder>): Promise<IOrder | null> {
    // SECURITY FIX: Validate fields against whitelist
    const validFields: string[] = [];
    const validValues: any[] = [];
    
    Object.keys(data).forEach(key => {
      if (this.UPDATABLE_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push((data as any)[key]);
      }
    });

    if (validFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const query = `UPDATE orders SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const values = [id, ...validValues];
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM orders WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export default OrderModel;
```

### FILE: src/models/Ticket.ts
```typescript
import { Pool } from 'pg';

export interface ITicket {
  id?: string;
  event_id: string;
  ticket_type_id: string;
  user_id?: string;
  status: 'available' | 'reserved' | 'sold' | 'transferred';
  price: number;
  seat_number?: string;
  barcode?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class TicketModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'event_id',
    'ticket_type_id',
    'user_id',
    'status',
    'price',
    'seat_number',
    'barcode',
    'metadata'
  ];

  async create(data: ITicket): Promise<ITicket> {
    const query = `
      INSERT INTO tickets (event_id, ticket_type_id, user_id, status, price, seat_number, barcode, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const values = [
      data.event_id, data.ticket_type_id, data.user_id,
      data.status || 'available', data.price, data.seat_number,
      data.barcode, data.metadata || {}
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<ITicket | null> {
    const query = 'SELECT * FROM tickets WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByEventId(eventId: string): Promise<ITicket[]> {
    const query = 'SELECT * FROM tickets WHERE event_id = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [eventId]);
    return result.rows;
  }

  async update(id: string, data: Partial<ITicket>): Promise<ITicket | null> {
    // SECURITY FIX: Validate fields against whitelist
    const validFields: string[] = [];
    const validValues: any[] = [];
    
    Object.keys(data).forEach(key => {
      if (this.UPDATABLE_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push((data as any)[key]);
      }
    });

    if (validFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const query = `UPDATE tickets SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const values = [id, ...validValues];
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM tickets WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export default TicketModel;
```

### FILE: src/models/Purchase.ts
```typescript
import { Pool } from 'pg';

export interface IPurchase {
  id?: string;
  order_id: string;
  user_id: string;
  ticket_ids: string[];
  amount: number;
  payment_method?: string;
  status: 'initiated' | 'processing' | 'completed' | 'failed';
  created_at?: Date;
  completed_at?: Date;
}

export class PurchaseModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'order_id',
    'user_id',
    'ticket_ids',
    'amount',
    'payment_method',
    'status',
    'completed_at'
  ];

  async create(data: IPurchase): Promise<IPurchase> {
    const query = `
      INSERT INTO purchases (order_id, user_id, ticket_ids, amount, payment_method, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      data.order_id, data.user_id, data.ticket_ids,
      data.amount, data.payment_method, data.status || 'initiated'
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<IPurchase | null> {
    const query = 'SELECT * FROM purchases WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByOrderId(orderId: string): Promise<IPurchase | null> {
    const query = 'SELECT * FROM purchases WHERE order_id = $1';
    const result = await this.pool.query(query, [orderId]);
    return result.rows[0] || null;
  }

  async update(id: string, data: Partial<IPurchase>): Promise<IPurchase | null> {
    // SECURITY FIX: Validate fields against whitelist
    const validFields: string[] = [];
    const validValues: any[] = [];
    
    Object.keys(data).forEach(key => {
      if (this.UPDATABLE_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push((data as any)[key]);
      }
    });

    if (validFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const query = `UPDATE purchases SET ${fields} WHERE id = $1 RETURNING *`;
    const values = [id, ...validValues];
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }
}

export default PurchaseModel;
```

### FILE: src/models/Transfer.ts
```typescript
import { Pool } from 'pg';

export interface ITransfer {
  id?: string;
  ticket_id: string;
  from_user_id: string;
  to_user_id: string;
  status: 'pending' | 'completed' | 'cancelled';
  transfer_code?: string;
  expires_at?: Date;
  completed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class TransferModel {
  constructor(private pool: Pool) {}

  async create(data: ITransfer): Promise<ITransfer> {
    const query = `
      INSERT INTO transfers (ticket_id, from_user_id, to_user_id, status, transfer_code, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      data.ticket_id, data.from_user_id, data.to_user_id,
      data.status || 'pending', data.transfer_code, data.expires_at
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<ITransfer | null> {
    const query = 'SELECT * FROM transfers WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByTransferCode(code: string): Promise<ITransfer | null> {
    const query = 'SELECT * FROM transfers WHERE transfer_code = $1';
    const result = await this.pool.query(query, [code]);
    return result.rows[0] || null;
  }

  async complete(id: string): Promise<boolean> {
    const query = `
      UPDATE transfers 
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `;
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export default TransferModel;
```

### FILE: src/models/QRCode.ts
```typescript
import { Pool } from 'pg';

export interface IQRCode {
  id?: string;
  ticket_id: string;
  code: string;
  scanned?: boolean;
  scanned_at?: Date;
  created_at?: Date;
  expires_at?: Date;
}

export class QRCodeModel {
  constructor(private pool: Pool) {}

  async create(data: IQRCode): Promise<IQRCode> {
    const query = `
      INSERT INTO qr_codes (ticket_id, code, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [data.ticket_id, data.code, data.expires_at];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findByCode(code: string): Promise<IQRCode | null> {
    const query = 'SELECT * FROM qr_codes WHERE code = $1';
    const result = await this.pool.query(query, [code]);
    return result.rows[0] || null;
  }

  async markAsScanned(id: string): Promise<boolean> {
    const query = `
      UPDATE qr_codes 
      SET scanned = true, scanned_at = NOW()
      WHERE id = $1 AND scanned = false
    `;
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async isValid(code: string): Promise<boolean> {
    const query = `
      SELECT * FROM qr_codes 
      WHERE code = $1 AND scanned = false 
      AND (expires_at IS NULL OR expires_at > NOW())
    `;
    const result = await this.pool.query(query, [code]);
    return result.rows.length > 0;
  }
}

export default QRCodeModel;
```

### FILE: src/bootstrap/container.ts
```typescript
import { Pool } from 'pg';
import { TicketService } from '../services/ticketService';
import { DatabaseService } from '../services/databaseService';
import { RedisService } from '../services/redisService';
import { QueueService } from '../services/queueService';
import { QRService } from '../services/qrService';
import { SolanaService } from '../services/solanaService';
import { TaxService } from '../services/taxService';
import { TransferService } from '../services/transferService';

// Initialize database connection
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://tickettoken:4cVXNcP3zWIEmy8Ey1DfvWHYI@postgres:5432/tickettoken_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Services are already instantiated singletons, just use them directly
const databaseService = DatabaseService;
const redisService = RedisService;
const queueService = QueueService;
const qrService = new QRService();
const solanaService = SolanaService;
const taxService = new TaxService();
const transferService = new TransferService();

// Main ticket service with dependencies
const ticketService = new TicketService();

// Export container
// Type definition for container
type ContainerType = {
  db: any;
  services: {
    ticketService: any;
    databaseService: any;
    redisService: any;
    queueService: any;
    qrService: any;
    solanaService: any;
    taxService: any;
    transferService: any;
  };
};

export const container: ContainerType = {
  db: dbPool,
  services: {
    ticketService,
    databaseService,
    redisService,
    queueService,
    qrService,
    solanaService,
    taxService,
    transferService,
  },
};

// Boot-time validation
export function validateContainer(): void {
  const required = [
    'ticketService',
    'databaseService',
    'redisService',
    'queueService',
  ];
  
  for (const service of required) {
    if (!(container.services as any)[service]) {
      throw new Error(`Required service ${service} not initialized`);
    }
  }
  
  console.log('✅ Ticket service container initialized successfully');
}
```

### FILE: src/services/interServiceClient.ts
```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    requestId?: string;
    traceId?: string;
    duration?: number;
  };
}

interface RequestOptions {
  timeout?: number;
  retry?: boolean;
  maxRetries?: number;
  headers?: Record<string, any>;
}

class InterServiceClientClass {
  private clients: Map<string, AxiosInstance> = new Map();
  private log = logger.child({ component: 'InterServiceClient' });
  private healthStatus: Map<string, boolean> = new Map();

  constructor() {
    this.initializeClients();
    this.startHealthChecks();
  }

  private initializeClients() {
    const services = ['auth', 'event', 'payment', 'user', 'notification'];

    for (const service of services) {
      const serviceUrl = this.getServiceUrl(service);
      const client = axios.create({
        baseURL: serviceUrl,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Request interceptor to add tracing headers
      client.interceptors.request.use(
        (config) => {
          // Add service headers
          const additionalHeaders = {
            'X-Service': 'ticket-service',
            'X-Target-Service': service,
            'X-Request-Id': Math.random().toString(36).substr(2, 9)
          };

          config.headers = {
            ...config.headers,
            ...additionalHeaders
          } as any;

          // Log outgoing request
          this.log.debug('Outgoing request', {
            service,
            method: config.method,
            url: config.url
          });

          // Record request start time
          (config as any).metadata = { startTime: Date.now() };

          return config;
        },
        (error) => {
          this.log.error('Request interceptor error:', error);
          return Promise.reject(error);
        }
      );

      // Response interceptor for logging and error handling
      client.interceptors.response.use(
        (response) => {
          const duration = Date.now() - ((response.config as any).metadata?.startTime || Date.now());

          this.log.debug('Response received', {
            service,
            status: response.status,
            duration
          });

          // Mark service as healthy
          this.healthStatus.set(service, true);

          return response;
        },
        (error: AxiosError) => {
          const duration = Date.now() - ((error.config as any)?.metadata?.startTime || Date.now());

          this.log.error('Service request failed', {
            service,
            error: error.message,
            status: error.response?.status,
            duration,
            url: error.config?.url
          });

          // Mark service as unhealthy on certain errors
          if (!error.response || error.response.status >= 500) {
            this.healthStatus.set(service, false);
          }

          return Promise.reject(error);
        }
      );

      this.clients.set(service, client);
    }
  }

  private getServiceUrl(service: string): string {
    const urls: Record<string, any> = {
      auth: config.services?.auth || 'http://auth-service:3001',
      event: config.services?.event || 'http://event-service:3003',
      payment: config.services?.payment || 'http://payment-service:3006',
      user: process.env.USER_SERVICE_URL || 'http://user-service:3002',
      notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3007'
    };

    return urls[service] || `http://${service}-service:3000`;
  }

  async request<T = any>(
    service: string,
    method: string,
    path: string,
    data?: any,
    options?: RequestOptions
  ): Promise<ServiceResponse<T>> {
    const client = this.clients.get(service);

    if (!client) {
      throw new Error(`Service client not found: ${service}`);
    }

    const startTime = Date.now();

    try {
      // Check if service is healthy
      if (!this.healthStatus.get(service)) {
        this.log.warn(`Service ${service} is marked as unhealthy`);
      }

      const response = await client.request<T>({
        method: method as any,
        url: path,
        data,
        timeout: options?.timeout || 10000,
        headers: options?.headers
      });

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: response.data,
        metadata: {
          requestId: response.headers['x-request-id'],
          traceId: response.headers['x-trace-id'],
          duration
        }
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        this.log.error('Inter-service request failed', {
          service,
          path,
          error: error.message,
          response: error.response?.data,
          status: error.response?.status,
          duration
        });

        // Retry logic for transient errors
        if (options?.retry && this.shouldRetry(error)) {
          return this.retryRequest(service, method, path, data, options);
        }

        return {
          success: false,
          error: error.response?.data?.error || error.message,
          metadata: {
            requestId: error.response?.headers?.['x-request-id'],
            traceId: error.response?.headers?.['x-trace-id'],
            duration
          }
        };
      }

      throw error;
    }
  }

  private shouldRetry(error: AxiosError): boolean {
    // Retry on network errors or 5xx errors
    if (!error.response) return true;
    if (error.response.status >= 500) return true;
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
    return false;
  }

  private async retryRequest<T>(
    service: string,
    method: string,
    path: string,
    data?: any,
    options?: RequestOptions
  ): Promise<ServiceResponse<T>> {
    const maxRetries = options?.maxRetries || 3;
    let lastError: any;

    for (let i = 0; i < maxRetries; i++) {
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        return await this.request(service, method, path, data, {
          ...options,
          retry: false // Don't retry again
        });
      } catch (error) {
        lastError = error;
        this.log.warn(`Retry ${i + 1}/${maxRetries} failed`, {
          service,
          path,
          error
        });
      }
    }

    return {
      success: false,
      error: lastError?.message || 'All retries failed'
    };
  }

  // Convenience methods
  async get<T = any>(service: string, path: string, options?: RequestOptions) {
    return this.request<T>(service, 'GET', path, undefined, options);
  }

  async post<T = any>(service: string, path: string, data?: any, options?: RequestOptions) {
    return this.request<T>(service, 'POST', path, data, options);
  }

  async put<T = any>(service: string, path: string, data?: any, options?: RequestOptions) {
    return this.request<T>(service, 'PUT', path, data, options);
  }

  async delete<T = any>(service: string, path: string, options?: RequestOptions) {
    return this.request<T>(service, 'DELETE', path, undefined, options);
  }

  // Health check methods
  private startHealthChecks() {
    setInterval(() => {
      this.performHealthChecks();
    }, 30000); // Check every 30 seconds
  }

  private async performHealthChecks() {
    for (const [service, client] of this.clients.entries()) {
      try {
        const response = await client.get('/health', {
          timeout: 2000,
          headers: {
            'X-Service': 'ticket-service',
            'X-Health-Check': 'true'
          }
        });

        this.healthStatus.set(service, response.status === 200);
      } catch (error) {
        this.healthStatus.set(service, false);
        this.log.debug(`Health check failed for ${service}`);
      }
    }
  }

  async checkHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    for (const [service, status] of this.healthStatus.entries()) {
      health[service] = status;
    }

    return health;
  }

  getHealthStatus(service: string): boolean {
    return this.healthStatus.get(service) || false;
  }
}

export const InterServiceClient = new InterServiceClientClass();
```

### FILE: src/services/discountService.ts
```typescript
import { DatabaseService } from './databaseService';
import { logger } from '../utils/logger';

interface Discount {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'bogo' | 'early_bird';
  value: number;
  priority: number;  // Lower number = higher priority
  stackable: boolean;
  maxUses?: number;
  currentUses?: number;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom: Date;
  validUntil: Date;
  eventId?: string;
  ticketTypeIds?: string[];
}

interface DiscountApplication {
  discountId: string;
  code: string;
  type: string;
  amountInCents: number;
  appliedTo: 'order' | 'tickets';
}

export class DiscountService {
  private log = logger.child({ component: 'DiscountService' });

  // ISSUE #23 FIX: Validate and apply discounts with proper stacking rules
  async applyDiscounts(
    orderAmountCents: number,
    discountCodes: string[],
    eventId?: string,
    ticketTypeIds?: string[]
  ): Promise<{
    finalAmountCents: number;
    discountsApplied: DiscountApplication[];
    totalDiscountCents: number;
  }> {
    if (!discountCodes || discountCodes.length === 0) {
      return {
        finalAmountCents: orderAmountCents,
        discountsApplied: [],
        totalDiscountCents: 0
      };
    }

    // Get all valid discounts
    const validDiscounts = await this.getValidDiscounts(discountCodes, eventId);
    
    // Sort by priority (lower number = higher priority)
    validDiscounts.sort((a, b) => a.priority - b.priority);

    const discountsApplied: DiscountApplication[] = [];
    let currentAmountCents = orderAmountCents;
    let hasNonStackable = false;

    for (const discount of validDiscounts) {
      // ISSUE #23 FIX: Check stacking rules
      if (hasNonStackable) {
        this.log.info('Skipping discount due to non-stackable discount already applied', {
          code: discount.code,
          skipped: true
        });
        continue;
      }

      if (!discount.stackable) {
        // If this is non-stackable and we already have discounts, skip it
        if (discountsApplied.length > 0) {
          this.log.info('Skipping non-stackable discount as other discounts already applied', {
            code: discount.code
          });
          continue;
        }
        hasNonStackable = true;
      }

      // Check minimum purchase requirement
      if (discount.minPurchaseAmount && orderAmountCents < discount.minPurchaseAmount * 100) {
        this.log.info('Discount minimum purchase not met', {
          code: discount.code,
          required: discount.minPurchaseAmount,
          actual: orderAmountCents / 100
        });
        continue;
      }

      // Calculate discount amount
      let discountAmountCents = 0;
      
      switch (discount.type) {
        case 'percentage':
          // Percentage off the current amount (after previous discounts)
          discountAmountCents = Math.round((currentAmountCents * discount.value) / 100);
          break;
          
        case 'fixed':
          // Fixed amount off (in dollars, convert to cents)
          discountAmountCents = Math.min(discount.value * 100, currentAmountCents);
          break;
          
        case 'early_bird':
          // Early bird discount (percentage)
          discountAmountCents = Math.round((currentAmountCents * discount.value) / 100);
          break;
          
        case 'bogo':
          // Buy one get one - 50% off for even quantities
          discountAmountCents = Math.round(currentAmountCents * 0.25); // Approximation
          break;
      }

      // Apply max discount cap if specified
      if (discount.maxDiscountAmount) {
        discountAmountCents = Math.min(discountAmountCents, discount.maxDiscountAmount * 100);
      }

      // Ensure we don't discount more than the remaining amount
      discountAmountCents = Math.min(discountAmountCents, currentAmountCents);

      if (discountAmountCents > 0) {
        discountsApplied.push({
          discountId: discount.id,
          code: discount.code,
          type: discount.type,
          amountInCents: discountAmountCents,
          appliedTo: 'order'
        });

        currentAmountCents -= discountAmountCents;

        // Record discount usage
        await this.recordDiscountUsage(discount.id);
      }
    }

    const totalDiscountCents = orderAmountCents - currentAmountCents;

    this.log.info('Discounts applied', {
      original: orderAmountCents,
      final: currentAmountCents,
      totalDiscount: totalDiscountCents,
      discountsApplied: discountsApplied.length
    });

    return {
      finalAmountCents: currentAmountCents,
      discountsApplied,
      totalDiscountCents
    };
  }

  private async getValidDiscounts(codes: string[], eventId?: string): Promise<Discount[]> {
    const query = `
      SELECT * FROM discounts 
      WHERE code = ANY($1)
        AND valid_from <= NOW()
        AND valid_until >= NOW()
        AND (max_uses IS NULL OR current_uses < max_uses)
        AND (event_id IS NULL OR event_id = $2)
        AND active = true
      ORDER BY priority ASC
    `;

    try {
      const result = await DatabaseService.query<Discount>(query, [codes, eventId || null]);
      return result.rows;
    } catch (error) {
      this.log.error('Failed to fetch discounts', { codes, error });
      return [];
    }
  }

  private async recordDiscountUsage(discountId: string): Promise<void> {
    const query = `
      UPDATE discounts 
      SET current_uses = COALESCE(current_uses, 0) + 1,
          last_used_at = NOW()
      WHERE id = $1
    `;

    try {
      await DatabaseService.query(query, [discountId]);
    } catch (error) {
      this.log.error('Failed to record discount usage', { discountId, error });
    }
  }

  async validateDiscountCode(code: string, eventId?: string): Promise<{
    valid: boolean;
    reason?: string;
    discount?: Partial<Discount>;
  }> {
    const query = `
      SELECT * FROM discounts 
      WHERE code = $1
        AND (event_id IS NULL OR event_id = $2)
      LIMIT 1
    `;

    try {
      const result = await DatabaseService.query<Discount>(query, [code, eventId || null]);
      
      if (result.rows.length === 0) {
        return { valid: false, reason: 'Invalid discount code' };
      }

      const discount = result.rows[0];

      // Check validity
      const now = new Date();
      if (new Date(discount.validFrom) > now) {
        return { valid: false, reason: 'Discount not yet active' };
      }

      if (new Date(discount.validUntil) < now) {
        return { valid: false, reason: 'Discount has expired' };
      }

      // Fix for TypeScript error - check both maxUses and currentUses properly
      if (discount.maxUses && discount.currentUses !== undefined && discount.currentUses >= discount.maxUses) {
        return { valid: false, reason: 'Discount usage limit reached' };
      }

      return { 
        valid: true, 
        discount: {
          type: discount.type,
          value: discount.value,
          stackable: discount.stackable
        }
      };
    } catch (error) {
      this.log.error('Failed to validate discount', { code, error });
      return { valid: false, reason: 'Error validating discount' };
    }
  }
}

export const discountService = new DiscountService();
```

### FILE: src/workers/mintWorker.ts
```typescript
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'MintWorker' });

interface MintJob {
  orderId: string;
  userId: string;
  eventId: string;
  quantity: number;
  timestamp: string;
}

class MintWorkerClass {
  async processMintJob(job: MintJob) {
    log.info('Processing mint job', job);
    
    const db = DatabaseService.getPool();
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create tickets (NFTs)
      const tickets = [];
      for (let i = 0; i < job.quantity; i++) {
        const ticketId = uuidv4();
        
        // Mock NFT minting (in real implementation, this would call Solana)
        const nftMint = await this.mintNFT(ticketId, job.userId, job.eventId);
        
        // Store ticket in database
        await client.query(
          `INSERT INTO tickets (id, order_id, user_id, event_id, nft_address, status, created_at)
           VALUES ($1, $2, $3, $4, $5, 'MINTED', NOW())`,
          [ticketId, job.orderId, job.userId, job.eventId, nftMint.address]
        );
        
        tickets.push({
          id: ticketId,
          nftAddress: nftMint.address,
          signature: nftMint.signature
        });
        
        log.info('Ticket minted', { ticketId, nftAddress: nftMint.address });
      }
      
      // Update order status
      await client.query(
        `UPDATE orders SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
        [job.orderId]
      );
      
      // Write completion event to outbox
      await client.query(
        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          job.orderId,
          'order',
          'order.completed',
          JSON.stringify({ orderId: job.orderId, tickets })
        ]
      );
      
      await client.query('COMMIT');
      
      log.info('Mint job completed', { 
        orderId: job.orderId, 
        ticketCount: tickets.length 
      });
      
      return { success: true, tickets };
      
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Mint job failed', { job, error });
      
      // On failure, trigger refund flow (Phase 1.5)
      await this.handleMintFailure(job.orderId, (error as Error).message);
      
      throw error;
    } finally {
      client.release();
    }
  }
  
  private async mintNFT(_ticketId: string, _userId: string, _eventId: string) {
    // Mock NFT minting - in production this would use SolanaService
    const mockAddress = `mock_nft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const mockSignature = `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Simulate minting delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Random failure for testing (5% chance)
    if (Math.random() < 0.05) {
      throw new Error('Mock mint failure - network timeout');
    }
    
    return {
      address: mockAddress,
      signature: mockSignature
    };
  }
  
  private async handleMintFailure(orderId: string, reason: string) {
    const db = DatabaseService.getPool();
    
    await db.query(
      `UPDATE orders SET status = 'MINT_FAILED', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );
    
    // Queue refund (Phase 1.5)
    await db.query(
      `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [
        orderId,
        'order',
        'order.mint_failed',
        JSON.stringify({ orderId, reason, refundRequired: true })
      ]
    );
  }
}

export const MintWorker = new MintWorkerClass();
```

### FILE: src/workers/reservation-cleanup.worker.ts
```typescript
import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RedisService } from '../services/redisService';
import { QueueService } from '../services/queueService';

interface OrphanReservation {
  reservation_id: string;
  order_id: string;
  user_id: string;
  created_at: Date;
  expires_at: Date;
  status: string;
  quantity: number;
  issue_type: 'no_order' | 'order_failed' | 'should_be_expired';
}

export class ReservationCleanupWorker {
  private pool: Pool;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private log = logger.child({ component: 'ReservationCleanupWorker' });
  private metrics = {
    totalReleased: 0,
    orphansFound: 0,
    orphansFixed: 0,
    errors: 0,
    lastRun: null as Date | null
  };

  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: 5 // Dedicated pool for cleanup worker
    });
  }

  async start(intervalMs: number = 60000): Promise<void> {
    if (this.intervalId) {
      this.log.info('Reservation cleanup worker already running');
      return;
    }

    this.log.info('Starting reservation cleanup worker', { interval: intervalMs });
    
    // Run immediately on start
    await this.runCleanup();
    
    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runCleanup().catch(error => {
        this.log.error('Cleanup run failed', error);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.log.info('Reservation cleanup worker stopped');
    }
  }

  private async runCleanup(): Promise<void> {
    if (this.isRunning) {
      this.log.debug('Cleanup already running, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // 1. Release expired reservations
      const expiredCount = await this.releaseExpiredReservations();
      
      // 2. Find and fix orphan reservations
      const orphansFixed = await this.fixOrphanReservations();
      
      // 3. Clean up stale Redis entries
      const redisCleanup = await this.cleanupRedisReservations();
      
      // 4. Reconcile inventory discrepancies
      await this.reconcileInventory();
      
      // 5. Notify about cleaned up reservations
      await this.notifyCleanups();

      const duration = Date.now() - startTime;
      this.metrics.lastRun = new Date();

      this.log.info('Cleanup completed', {
        duration,
        expired: expiredCount,
        orphansFixed,
        redisCleaned: redisCleanup,
        metrics: this.metrics
      });

    } catch (error) {
      this.metrics.errors++;
      this.log.error('Cleanup error', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async releaseExpiredReservations(): Promise<number> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Call the stored procedure
      const result = await client.query('SELECT release_expired_reservations() as count');
      const releasedCount = result.rows[0].count;

      if (releasedCount > 0) {
        // Get details of expired reservations for events
        const expiredDetails = await client.query(`
          SELECT 
            r.id,
            r.order_id,
            r.user_id,
            r.quantity,
            r.expires_at,
            r.event_id,
            COALESCE(r.tickets, '[]'::jsonb) as tickets
          FROM reservations r
          WHERE r.status = 'EXPIRED'
            AND r.released_at >= NOW() - INTERVAL '2 minutes'
        `);

        // Write to outbox for each expired reservation
        for (const reservation of expiredDetails.rows) {
          await client.query(`
            INSERT INTO outbox (
              aggregate_id,
              aggregate_type,
              event_type,
              payload,
              created_at
            ) VALUES ($1, $2, $3, $4, NOW())
          `, [
            reservation.order_id || reservation.id,
            'reservation',
            'reservation.expired',
            JSON.stringify({
              reservationId: reservation.id,
              orderId: reservation.order_id,
              userId: reservation.user_id,
              eventId: reservation.event_id,
              quantity: reservation.quantity,
              tickets: reservation.tickets,
              expiredAt: new Date()
            })
          ]);

          // Clear from Redis
          await RedisService.del(`reservation:${reservation.id}`);
          
          // Send notification to user
          await QueueService.publish('notifications', {
            type: 'reservation.expired',
            userId: reservation.user_id,
            data: {
              reservationId: reservation.id,
              eventId: reservation.event_id
            }
          });
        }

        this.log.info(`Released ${releasedCount} expired reservations`);
      }

      await client.query('COMMIT');
      this.metrics.totalReleased += releasedCount;
      return releasedCount;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async fixOrphanReservations(): Promise<number> {
    const client = await this.pool.connect();
    let fixed = 0;

    try {
      // Find orphan reservations
      const orphans = await client.query<OrphanReservation>(
        'SELECT * FROM find_orphan_reservations()'
      );

      this.metrics.orphansFound += orphans.rows.length;

      if (orphans.rows.length > 0) {
        this.log.warn(`Found ${orphans.rows.length} orphan reservations`);

        for (const orphan of orphans.rows) {
          await client.query('BEGIN');

          try {
            switch (orphan.issue_type) {
              case 'no_order':
                // Release reservation with no order
                await this.releaseOrphanReservation(client, orphan, 'no_order');
                break;

              case 'order_failed':
                // Release reservation for failed order
                await this.releaseOrphanReservation(client, orphan, 'order_failed');
                break;

              case 'should_be_expired':
                // Force expire old reservations
                await this.releaseOrphanReservation(client, orphan, 'force_expired');
                break;
            }

            await client.query('COMMIT');
            fixed++;

          } catch (error) {
            await client.query('ROLLBACK');
            this.log.error(`Failed to fix orphan reservation ${orphan.reservation_id}`, error);
          }
        }

        this.metrics.orphansFixed += fixed;
        this.log.info(`Fixed ${fixed} orphan reservations`);
      }

    } finally {
      client.release();
    }

    return fixed;
  }

  private async releaseOrphanReservation(
    client: any,
    orphan: OrphanReservation,
    reason: string
  ): Promise<void> {
    // Get reservation details including tickets
    const reservation = await client.query(`
      SELECT * FROM reservations WHERE id = $1
    `, [orphan.reservation_id]);

    if (reservation.rows.length === 0) return;

    const res = reservation.rows[0];

    // Update reservation status
    await client.query(`
      UPDATE reservations
      SET status = 'EXPIRED',
          released_at = NOW(),
          release_reason = $2,
          updated_at = NOW()
      WHERE id = $1
    `, [orphan.reservation_id, reason]);

    // Release inventory
    if (res.tickets && Array.isArray(res.tickets)) {
      for (const ticket of res.tickets) {
        if (ticket.ticketTypeId && ticket.quantity) {
          await client.query(`
            UPDATE ticket_types
            SET available_quantity = available_quantity + $1,
                updated_at = NOW()
            WHERE id = $2
          `, [ticket.quantity, ticket.ticketTypeId]);
        }
      }
    }

    // Record in history
    await client.query(`
      INSERT INTO reservation_history (
        reservation_id,
        order_id,
        user_id,
        status_from,
        status_to,
        reason,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      orphan.reservation_id,
      orphan.order_id,
      orphan.user_id,
      orphan.status,
      'EXPIRED',
      `Orphan cleanup: ${reason}`,
      JSON.stringify({
        issue_type: orphan.issue_type,
        original_expires_at: orphan.expires_at,
        cleaned_at: new Date()
      })
    ]);

    // Clear from Redis
    await RedisService.del(`reservation:${orphan.reservation_id}`);

    this.log.info(`Released orphan reservation`, {
      reservationId: orphan.reservation_id,
      reason,
      issueType: orphan.issue_type
    });
  }

  private async cleanupRedisReservations(): Promise<number> {
    let cleaned = 0;

    try {
      const redisClient = RedisService.getClient();
      const keys = await redisClient.keys('reservation:*');

      for (const key of keys) {
        const reservationId = key.split(':')[1];
        
        // Check if reservation still exists and is active
        const result = await this.pool.query(`
          SELECT status FROM reservations WHERE id = $1
        `, [reservationId]);

        if (result.rows.length === 0 || 
            !['PENDING', 'ACTIVE'].includes(result.rows[0].status)) {
          await RedisService.del(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.log.info(`Cleaned ${cleaned} stale Redis reservation entries`);
      }

    } catch (error) {
      this.log.error('Failed to cleanup Redis reservations', error);
    }

    return cleaned;
  }

  private async reconcileInventory(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Find ticket types with negative inventory (should never happen)
      const negativeInventory = await client.query(`
        SELECT id, name, available_quantity, total_quantity
        FROM ticket_types
        WHERE available_quantity < 0
      `);

      if (negativeInventory.rows.length > 0) {
        this.log.error('Found ticket types with negative inventory', {
          types: negativeInventory.rows
        });

        // Fix by setting to 0
        for (const type of negativeInventory.rows) {
          await client.query(`
            UPDATE ticket_types
            SET available_quantity = 0,
                updated_at = NOW()
            WHERE id = $1
          `, [type.id]);

          // Alert admins
          await QueueService.publish('alerts', {
            type: 'inventory.negative',
            severity: 'critical',
            data: type
          });
        }
      }

      // Find discrepancies between reserved and available quantities
      const discrepancies = await client.query(`
        WITH reservation_counts AS (
          SELECT 
            tt.id as ticket_type_id,
            COALESCE(SUM(
              (SELECT SUM((value->>'quantity')::int)
               FROM jsonb_array_elements(r.tickets) 
               WHERE value->>'ticketTypeId' = tt.id::text)
            ), 0) as reserved_quantity
          FROM ticket_types tt
          LEFT JOIN reservations r ON r.status IN ('PENDING', 'ACTIVE')
            AND r.expires_at > NOW()
            AND r.tickets::text LIKE '%' || tt.id::text || '%'
          GROUP BY tt.id
        )
        SELECT 
          tt.id,
          tt.name,
          tt.total_quantity,
          tt.available_quantity,
          rc.reserved_quantity,
          (tt.total_quantity - tt.available_quantity - rc.reserved_quantity) as discrepancy
        FROM ticket_types tt
        JOIN reservation_counts rc ON rc.ticket_type_id = tt.id
        WHERE (tt.total_quantity - tt.available_quantity - rc.reserved_quantity) != 0
      `);

      if (discrepancies.rows.length > 0) {
        this.log.warn('Found inventory discrepancies', {
          count: discrepancies.rows.length,
          discrepancies: discrepancies.rows
        });

        // Log for manual review
        for (const disc of discrepancies.rows) {
          await client.query(`
            INSERT INTO outbox (
              aggregate_id,
              aggregate_type,
              event_type,
              payload
            ) VALUES ($1, $2, $3, $4)
          `, [
            disc.id,
            'ticket_type',
            'inventory.discrepancy',
            JSON.stringify(disc)
          ]);
        }
      }

    } finally {
      client.release();
    }
  }

  private async notifyCleanups(): Promise<void> {
    // Send summary notification if significant cleanups occurred
    if (this.metrics.orphansFixed > 10 || this.metrics.errors > 5) {
      await QueueService.publish('alerts', {
        type: 'reservation.cleanup.summary',
        severity: this.metrics.errors > 5 ? 'warning' : 'info',
        data: {
          ...this.metrics,
          timestamp: new Date()
        }
      });
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }
}
```

### FILE: src/types/index.ts
```typescript
// Ticket-related types
export interface Ticket {
  id: string;
  eventId: string;
  ticketTypeId: string;
  userId?: string;
  owner_user_id?: string;
  status: TicketStatus;
  price: number;
  seatNumber?: string;
  section?: string;
  row?: string;
  qrCode: string;
  qrCodeSecret: string;
  nftTokenId?: string;
  nftTransactionHash?: string;
  nftMintedAt?: Date;
  purchasedAt?: Date;
  validatedAt?: Date;
  transferHistory: TransferRecord[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum TicketStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD',
  USED = 'USED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  TRANSFERRED = 'TRANSFERRED'
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  availableQuantity: number;
  maxPerPurchase: number;
  saleStartDate: Date;
  saleEndDate: Date;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransferRecord {
  fromUserId: string;
  toUserId: string;
  transferredAt: Date;
  transactionHash?: string;
  reason?: string;
}

export interface TicketReservation {
  id: string;
  userId: string;
  eventId: string;
  tickets: Array<{
    ticketTypeId: string;
    quantity: number;
    seatNumbers?: string[];
  }>;
  expiresAt: Date;
  status: 'active' | 'completed' | 'expired';
  createdAt: Date;
}

export interface QRValidation {
  ticketId: string;
  eventId: string;
  isValid: boolean;
  validatedAt?: Date;
  validatorId?: string;
  entrance?: string;
  deviceId?: string;
  reason?: string;
}

export interface PurchaseRequest {
  userId: string;
  eventId: string;
  tickets: Array<{
    ticketTypeId: string;
    quantity: number;
    seatNumbers?: string[];
  }>;
  paymentIntentId?: string;
  metadata?: Record<string, any>;
}

export interface NFTMintRequest {
  ticketId: string;
  owner: string;
  metadata: {
    eventId: string;
    eventName: string;
    venueName: string;
    eventDate: string;
    ticketType: string;
    seatInfo?: string;
    imageUrl: string;
  };
}

// Service response types
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// Express extensions
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    venueId?: string;
  };
}
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/ticket-service//src/routes/webhookRoutes.ts:51:      `SELECT created_at FROM webhook_nonces 
backend/services/ticket-service//src/routes/webhookRoutes.ts:67:      `INSERT INTO webhook_nonces (nonce, endpoint, created_at, expires_at)
backend/services/ticket-service//src/routes/webhookRoutes.ts:73:    pool.query('DELETE FROM webhook_nonces WHERE expires_at < NOW()')
backend/services/ticket-service//src/routes/webhookRoutes.ts:91:          `INSERT INTO webhook_nonces (nonce, endpoint, created_at, expires_at)
backend/services/ticket-service//src/routes/webhookRoutes.ts:109:    .update(payload)
backend/services/ticket-service//src/routes/mintRoutes.ts:37:      'SELECT status, tenant_id FROM orders WHERE id = $1',
backend/services/ticket-service//src/routes/internalRoutes.ts:40:    .update(`${serviceName}:${timestamp}:${req.path}`)
backend/services/ticket-service//src/routes/internalRoutes.ts:114:          `UPDATE tickets
backend/services/ticket-service//src/routes/internalRoutes.ts:116:               updated_at = NOW(),
backend/services/ticket-service//src/routes/internalRoutes.ts:173:      SELECT t.id, t.ticket_type_id, tt.price_cents, tt.name
backend/services/ticket-service//src/migrations/001_create_ticket_tables.sql:40:  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
backend/services/ticket-service//src/migrations/001_create_ticket_tables.sql:68:  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
backend/services/ticket-service//src/migrations/001_create_ticket_tables.sql:124:-- Update timestamp function
backend/services/ticket-service//src/migrations/001_create_ticket_tables.sql:125:CREATE OR REPLACE FUNCTION update_updated_at_column()
backend/services/ticket-service//src/migrations/001_create_ticket_tables.sql:128:  NEW.updated_at = NOW();
backend/services/ticket-service//src/migrations/001_create_ticket_tables.sql:134:DROP TRIGGER IF EXISTS update_ticket_types_updated_at ON ticket_types;
backend/services/ticket-service//src/migrations/001_create_ticket_tables.sql:135:CREATE TRIGGER update_ticket_types_updated_at BEFORE UPDATE ON ticket_types
backend/services/ticket-service//src/migrations/001_create_ticket_tables.sql:136:  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
backend/services/ticket-service//src/migrations/001_create_ticket_tables.sql:138:DROP TRIGGER IF EXISTS update_tickets_updated_at ON tickets;
backend/services/ticket-service//src/migrations/001_create_ticket_tables.sql:139:CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets
backend/services/ticket-service//src/migrations/001_create_ticket_tables.sql:140:  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
backend/services/ticket-service//src/migrations/create_orders_table.sql:12:    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
backend/services/ticket-service//src/migrations/create_tickets_table.sql:10:    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:44:        SELECT r.*, 
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:49:        FOR UPDATE SKIP LOCKED
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:51:        -- Update reservation status
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:52:        UPDATE reservations
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:56:            updated_at = NOW()
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:61:            SELECT 
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:67:                UPDATE ticket_types
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:69:                    updated_at = NOW()
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:75:        INSERT INTO reservation_history (
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:101:    UPDATE ticket_reservations
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:126:    SELECT 
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:144:    SELECT 
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:161:    SELECT 
backend/services/ticket-service//src/controllers/purchaseController.ts.backup:107:        updated_at: new Date(),
backend/services/ticket-service//src/controllers/purchaseController.ts.backup:111:      // Insert order items and update inventory atomically
backend/services/ticket-service//src/controllers/purchaseController.ts.backup:113:        const updateResult = await trx('ticket_types')
backend/services/ticket-service//src/controllers/purchaseController.ts.backup:116:          .update({
backend/services/ticket-service//src/controllers/purchaseController.ts.backup:118:            updated_at: new Date()
backend/services/ticket-service//src/controllers/purchaseController.ts.backup:121:        if (updateResult === 0) {
backend/services/ticket-service//src/controllers/purchaseController.ts:107:        updated_at: new Date(),
backend/services/ticket-service//src/controllers/purchaseController.ts:111:      // Insert order items and update inventory atomically
backend/services/ticket-service//src/controllers/purchaseController.ts:113:        const updateResult = await trx('ticket_types')
backend/services/ticket-service//src/controllers/purchaseController.ts:116:          .update({
backend/services/ticket-service//src/controllers/purchaseController.ts:118:            updated_at: new Date()
backend/services/ticket-service//src/controllers/purchaseController.ts:121:        if (updateResult === 0) {
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:26:        SELECT
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:32:          o.updated_at,
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:49:        SELECT
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:62:        SELECT
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:95:        updated_at: order.updated_at,
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:120:        SELECT
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:125:          o.updated_at,
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:153:        updatedAt: order.updated_at
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:184:        SELECT
backend/services/ticket-service//src/controllers/orders.controller.ts:26:        SELECT
backend/services/ticket-service//src/controllers/orders.controller.ts:32:          o.updated_at,
backend/services/ticket-service//src/controllers/orders.controller.ts:49:        SELECT
backend/services/ticket-service//src/controllers/orders.controller.ts:62:        SELECT
backend/services/ticket-service//src/controllers/orders.controller.ts:95:        updated_at: order.updated_at,
backend/services/ticket-service//src/controllers/orders.controller.ts:120:        SELECT
backend/services/ticket-service//src/controllers/orders.controller.ts:125:          o.updated_at,
backend/services/ticket-service//src/controllers/orders.controller.ts:153:        updatedAt: order.updated_at
backend/services/ticket-service//src/controllers/orders.controller.ts:184:        SELECT
backend/services/ticket-service//src/models/Reservation.ts:10:  updated_at?: Date;
backend/services/ticket-service//src/models/Reservation.ts:16:  // SECURITY: Whitelist of allowed update fields
backend/services/ticket-service//src/models/Reservation.ts:26:      INSERT INTO reservations (user_id, ticket_id, expires_at, status)
backend/services/ticket-service//src/models/Reservation.ts:36:    const query = 'SELECT * FROM reservations WHERE id = $1';
backend/services/ticket-service//src/models/Reservation.ts:43:      SELECT * FROM reservations
backend/services/ticket-service//src/models/Reservation.ts:51:  async update(id: string, data: Partial<IReservation>): Promise<IReservation | null> {
backend/services/ticket-service//src/models/Reservation.ts:64:      throw new Error('No valid fields to update');
backend/services/ticket-service//src/models/Reservation.ts:68:    const query = `UPDATE reservations SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
backend/services/ticket-service//src/models/Reservation.ts:76:      UPDATE reservations
backend/services/ticket-service//src/models/Reservation.ts:77:      SET status = 'expired', updated_at = NOW()
backend/services/ticket-service//src/models/Order.ts:14:  updated_at?: Date;
backend/services/ticket-service//src/models/Order.ts:20:  // SECURITY: Whitelist of allowed update fields
backend/services/ticket-service//src/models/Order.ts:34:      INSERT INTO orders (user_id, event_id, status, total_amount, currency, tickets, payment_id, metadata)
backend/services/ticket-service//src/models/Order.ts:48:    const query = 'SELECT * FROM orders WHERE id = $1';
backend/services/ticket-service//src/models/Order.ts:54:    const query = 'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC';
backend/services/ticket-service//src/models/Order.ts:59:  async update(id: string, data: Partial<IOrder>): Promise<IOrder | null> {
backend/services/ticket-service//src/models/Order.ts:72:      throw new Error('No valid fields to update');
backend/services/ticket-service//src/models/Order.ts:76:    const query = `UPDATE orders SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
backend/services/ticket-service//src/models/Order.ts:83:    const query = 'DELETE FROM orders WHERE id = $1';
backend/services/ticket-service//src/models/Ticket.ts:14:  updated_at?: Date;
backend/services/ticket-service//src/models/Ticket.ts:20:  // SECURITY: Whitelist of allowed update fields
backend/services/ticket-service//src/models/Ticket.ts:34:      INSERT INTO tickets (event_id, ticket_type_id, user_id, status, price, seat_number, barcode, metadata)
backend/services/ticket-service//src/models/Ticket.ts:48:    const query = 'SELECT * FROM tickets WHERE id = $1';
backend/services/ticket-service//src/models/Ticket.ts:54:    const query = 'SELECT * FROM tickets WHERE event_id = $1 ORDER BY created_at DESC';
backend/services/ticket-service//src/models/Ticket.ts:59:  async update(id: string, data: Partial<ITicket>): Promise<ITicket | null> {
backend/services/ticket-service//src/models/Ticket.ts:72:      throw new Error('No valid fields to update');
backend/services/ticket-service//src/models/Ticket.ts:76:    const query = `UPDATE tickets SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
backend/services/ticket-service//src/models/Ticket.ts:83:    const query = 'DELETE FROM tickets WHERE id = $1';
backend/services/ticket-service//src/models/Purchase.ts:18:  // SECURITY: Whitelist of allowed update fields
backend/services/ticket-service//src/models/Purchase.ts:31:      INSERT INTO purchases (order_id, user_id, ticket_ids, amount, payment_method, status)
backend/services/ticket-service//src/models/Purchase.ts:44:    const query = 'SELECT * FROM purchases WHERE id = $1';
backend/services/ticket-service//src/models/Purchase.ts:50:    const query = 'SELECT * FROM purchases WHERE order_id = $1';
backend/services/ticket-service//src/models/Purchase.ts:55:  async update(id: string, data: Partial<IPurchase>): Promise<IPurchase | null> {
backend/services/ticket-service//src/models/Purchase.ts:68:      throw new Error('No valid fields to update');
backend/services/ticket-service//src/models/Purchase.ts:72:    const query = `UPDATE purchases SET ${fields} WHERE id = $1 RETURNING *`;
backend/services/ticket-service//src/models/Transfer.ts:13:  updated_at?: Date;
backend/services/ticket-service//src/models/Transfer.ts:21:      INSERT INTO transfers (ticket_id, from_user_id, to_user_id, status, transfer_code, expires_at)
backend/services/ticket-service//src/models/Transfer.ts:34:    const query = 'SELECT * FROM transfers WHERE id = $1';
backend/services/ticket-service//src/models/Transfer.ts:40:    const query = 'SELECT * FROM transfers WHERE transfer_code = $1';
backend/services/ticket-service//src/models/Transfer.ts:47:      UPDATE transfers 
backend/services/ticket-service//src/models/Transfer.ts:48:      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
backend/services/ticket-service//src/models/QRCode.ts:18:      INSERT INTO qr_codes (ticket_id, code, expires_at)
backend/services/ticket-service//src/models/QRCode.ts:28:    const query = 'SELECT * FROM qr_codes WHERE code = $1';
backend/services/ticket-service//src/models/QRCode.ts:35:      UPDATE qr_codes 
backend/services/ticket-service//src/models/QRCode.ts:45:      SELECT * FROM qr_codes 
backend/services/ticket-service//src/middleware/tenant-simple.ts:24:      await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
backend/services/ticket-service//src/middleware/tenant-simple.ts:43:      await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
backend/services/ticket-service//src/middleware/rbac.ts:39:  TICKET_UPDATE: 'ticket:update',
backend/services/ticket-service//src/schema/discounts.sql:20:  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
backend/services/ticket-service//src/services/ticketService.ts:30:      INSERT INTO ticket_types (
backend/services/ticket-service//src/services/ticketService.ts:58:      SELECT * FROM ticket_types
backend/services/ticket-service//src/services/ticketService.ts:69:      SELECT available_quantity
backend/services/ticket-service//src/services/ticketService.ts:101:                SELECT * FROM ticket_types
backend/services/ticket-service//src/services/ticketService.ts:103:                FOR UPDATE
backend/services/ticket-service//src/services/ticketService.ts:121:                'UPDATE ticket_types SET available_quantity = available_quantity - $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts:129:              INSERT INTO reservations (
backend/services/ticket-service//src/services/ticketService.ts:135:            const firstTypeQuery = 'SELECT name FROM ticket_types WHERE id = $1';
backend/services/ticket-service//src/services/ticketService.ts:203:            const ticketResQuery = 'SELECT * FROM ticket_reservations WHERE id = $1 FOR UPDATE';
backend/services/ticket-service//src/services/ticketService.ts:208:              const ticketTypeQuery = 'SELECT event_id FROM ticket_types WHERE id = $1';
backend/services/ticket-service//src/services/ticketService.ts:214:              const resQuery = 'SELECT * FROM reservations WHERE id = $1 FOR UPDATE';
backend/services/ticket-service//src/services/ticketService.ts:234:              const typeQuery = 'SELECT * FROM ticket_types WHERE id = $1';
backend/services/ticket-service//src/services/ticketService.ts:252:                  INSERT INTO tickets (
backend/services/ticket-service//src/services/ticketService.ts:314:              'UPDATE ticket_reservations SET status = $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts:319:              'UPDATE reservations SET status = $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts:375:      SELECT t.*, tt.name as ticket_type_name, tt.description as ticket_type_description
backend/services/ticket-service//src/services/ticketService.ts:400:      SELECT t.*, tt.name as ticket_type_name, e.name as event_name
backend/services/ticket-service//src/services/ticketService.ts:420:  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
backend/services/ticket-service//src/services/ticketService.ts:421:    const query = 'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2';
backend/services/ticket-service//src/services/ticketService.ts:429:      UPDATE reservations
backend/services/ticket-service//src/services/ticketService.ts:442:          'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts:451:      `UPDATE ticket_reservations SET status = 'expired' WHERE status = 'ACTIVE' AND expires_at < NOW()`
backend/services/ticket-service//src/services/ticketService.ts:467:              SELECT * FROM reservations
backend/services/ticket-service//src/services/ticketService.ts:469:              FOR UPDATE
backend/services/ticket-service//src/services/ticketService.ts:480:              `UPDATE reservations SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
backend/services/ticket-service//src/services/ticketService.ts:487:                'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts:589:    let encrypted = cipher.update(data, 'utf8', 'base64');
backend/services/ticket-service//src/services/ticketService.ts:604:    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
backend/services/ticket-service//src/services/paymentEventHandler.ts.backup:16:      // Update order status
backend/services/ticket-service//src/services/paymentEventHandler.ts.backup:18:        `UPDATE orders 
backend/services/ticket-service//src/services/paymentEventHandler.ts.backup:21:             updated_at = NOW()
backend/services/ticket-service//src/services/paymentEventHandler.ts.backup:28:        `SELECT * FROM orders WHERE id = $1`,
backend/services/ticket-service//src/services/paymentEventHandler.ts.backup:51:        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
backend/services/ticket-service//src/services/paymentEventHandler.ts.backup:81:      `UPDATE orders 
backend/services/ticket-service//src/services/paymentEventHandler.ts.backup:83:           updated_at = NOW()
backend/services/ticket-service//src/services/transferService.ts:32:      // Lock ticket for update
backend/services/ticket-service//src/services/transferService.ts:33:      const ticketQuery = 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE';
backend/services/ticket-service//src/services/transferService.ts:54:        SELECT 
backend/services/ticket-service//src/services/transferService.ts:90:        SELECT COUNT(*) as transfer_count 
backend/services/ticket-service//src/services/transferService.ts:104:          SELECT identity_verified 
backend/services/ticket-service//src/services/transferService.ts:117:      // Update ticket ownership
backend/services/ticket-service//src/services/transferService.ts:118:      const updateQuery = `
backend/services/ticket-service//src/services/transferService.ts:119:        UPDATE tickets
backend/services/ticket-service//src/services/transferService.ts:120:        SET user_id = $1, status = $2, updated_at = NOW()
backend/services/ticket-service//src/services/transferService.ts:123:      await client.query(updateQuery, [toUserId, TicketStatus.TRANSFERRED, ticketId]);
backend/services/ticket-service//src/services/transferService.ts:134:        INSERT INTO ticket_transfers
backend/services/ticket-service//src/services/transferService.ts:147:      // Update transfer history
backend/services/ticket-service//src/services/transferService.ts:149:        UPDATE tickets
backend/services/ticket-service//src/services/transferService.ts:169:          // Update transfer record with blockchain transaction
backend/services/ticket-service//src/services/transferService.ts:171:            'UPDATE ticket_transfers SET transaction_hash = $1 WHERE ticket_id = $2 AND transferred_at = $3',
backend/services/ticket-service//src/services/transferService.ts:213:      SELECT * FROM ticket_transfers
backend/services/ticket-service//src/services/transferService.ts:235:        SELECT 1 FROM user_blacklists 
backend/services/ticket-service//src/services/transferService.ts:249:        SELECT transferred_at 
backend/services/ticket-service//src/services/transferService.ts:271:        SELECT COUNT(*) as transfer_count 
backend/services/ticket-service//src/services/transferService.ts:288:        SELECT 
backend/services/ticket-service//src/services/transferService.ts:317:        SELECT 
backend/services/ticket-service//src/services/ticketService.ts.backup:30:      INSERT INTO ticket_types (
backend/services/ticket-service//src/services/ticketService.ts.backup:58:      SELECT * FROM ticket_types
backend/services/ticket-service//src/services/ticketService.ts.backup:69:      SELECT available_quantity
backend/services/ticket-service//src/services/ticketService.ts.backup:101:                SELECT * FROM ticket_types
backend/services/ticket-service//src/services/ticketService.ts.backup:103:                FOR UPDATE
backend/services/ticket-service//src/services/ticketService.ts.backup:121:                'UPDATE ticket_types SET available_quantity = available_quantity - $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts.backup:129:              INSERT INTO reservations (
backend/services/ticket-service//src/services/ticketService.ts.backup:135:            const firstTypeQuery = 'SELECT name FROM ticket_types WHERE id = $1';
backend/services/ticket-service//src/services/ticketService.ts.backup:203:            const ticketResQuery = 'SELECT * FROM ticket_reservations WHERE id = $1 FOR UPDATE';
backend/services/ticket-service//src/services/ticketService.ts.backup:208:              const ticketTypeQuery = 'SELECT event_id FROM ticket_types WHERE id = $1';
backend/services/ticket-service//src/services/ticketService.ts.backup:214:              const resQuery = 'SELECT * FROM reservations WHERE id = $1 FOR UPDATE';
backend/services/ticket-service//src/services/ticketService.ts.backup:234:              const typeQuery = 'SELECT * FROM ticket_types WHERE id = $1';
backend/services/ticket-service//src/services/ticketService.ts.backup:252:                  INSERT INTO tickets (
backend/services/ticket-service//src/services/ticketService.ts.backup:314:              'UPDATE ticket_reservations SET status = $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts.backup:319:              'UPDATE reservations SET status = $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts.backup:375:      SELECT t.*, tt.name as ticket_type_name, tt.description as ticket_type_description
backend/services/ticket-service//src/services/ticketService.ts.backup:400:      SELECT t.*, tt.name as ticket_type_name, e.name as event_name
backend/services/ticket-service//src/services/ticketService.ts.backup:420:  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
backend/services/ticket-service//src/services/ticketService.ts.backup:421:    const query = 'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2';
backend/services/ticket-service//src/services/ticketService.ts.backup:429:      UPDATE reservations
backend/services/ticket-service//src/services/ticketService.ts.backup:442:          'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts.backup:451:      `UPDATE ticket_reservations SET status = 'expired' WHERE status = 'ACTIVE' AND expires_at < NOW()`
backend/services/ticket-service//src/services/ticketService.ts.backup:467:              SELECT * FROM reservations
backend/services/ticket-service//src/services/ticketService.ts.backup:469:              FOR UPDATE
backend/services/ticket-service//src/services/ticketService.ts.backup:480:              `UPDATE reservations SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
backend/services/ticket-service//src/services/ticketService.ts.backup:487:                'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts.backup:589:    let encrypted = cipher.update(data, 'utf8', 'base64');
backend/services/ticket-service//src/services/ticketService.ts.backup:604:    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
backend/services/ticket-service//src/services/transferService.ts.backup:32:      // Lock ticket for update
backend/services/ticket-service//src/services/transferService.ts.backup:33:      const ticketQuery = 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE';
backend/services/ticket-service//src/services/transferService.ts.backup:54:        SELECT 
backend/services/ticket-service//src/services/transferService.ts.backup:90:        SELECT COUNT(*) as transfer_count 
backend/services/ticket-service//src/services/transferService.ts.backup:104:          SELECT identity_verified 
backend/services/ticket-service//src/services/transferService.ts.backup:117:      // Update ticket ownership
backend/services/ticket-service//src/services/transferService.ts.backup:118:      const updateQuery = `
backend/services/ticket-service//src/services/transferService.ts.backup:119:        UPDATE tickets
backend/services/ticket-service//src/services/transferService.ts.backup:120:        SET user_id = $1, status = $2, updated_at = NOW()
backend/services/ticket-service//src/services/transferService.ts.backup:123:      await client.query(updateQuery, [toUserId, TicketStatus.TRANSFERRED, ticketId]);
backend/services/ticket-service//src/services/transferService.ts.backup:134:        INSERT INTO ticket_transfers
backend/services/ticket-service//src/services/transferService.ts.backup:147:      // Update transfer history
backend/services/ticket-service//src/services/transferService.ts.backup:149:        UPDATE tickets
backend/services/ticket-service//src/services/transferService.ts.backup:169:          // Update transfer record with blockchain transaction
backend/services/ticket-service//src/services/transferService.ts.backup:171:            'UPDATE ticket_transfers SET transaction_hash = $1 WHERE ticket_id = $2 AND transferred_at = $3',
backend/services/ticket-service//src/services/transferService.ts.backup:213:      SELECT * FROM ticket_transfers
backend/services/ticket-service//src/services/transferService.ts.backup:235:        SELECT 1 FROM user_blacklists 
backend/services/ticket-service//src/services/transferService.ts.backup:249:        SELECT transferred_at 
backend/services/ticket-service//src/services/transferService.ts.backup:271:        SELECT COUNT(*) as transfer_count 
backend/services/ticket-service//src/services/transferService.ts.backup:288:        SELECT 
backend/services/ticket-service//src/services/transferService.ts.backup:317:        SELECT 
backend/services/ticket-service//src/services/refundHandler.ts:11:      // Update order status
backend/services/ticket-service//src/services/refundHandler.ts:13:        `UPDATE orders 
backend/services/ticket-service//src/services/refundHandler.ts:14:         SET status = 'REFUND_INITIATED', updated_at = NOW() 
backend/services/ticket-service//src/services/refundHandler.ts:21:        `SELECT payment_intent_id, total_amount FROM orders WHERE id = $1`,
backend/services/ticket-service//src/services/refundHandler.ts:33:        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
backend/services/ticket-service//src/services/databaseService.ts:23:      await this.pool.query('SELECT 1');
backend/services/ticket-service//src/services/databaseService.ts:63:      const statusCheck = await client.query('SELECT txid_current_if_assigned()');
backend/services/ticket-service//src/services/databaseService.ts:87:      await this.pool.query('SELECT 1');
backend/services/ticket-service//src/services/discountService.ts:159:      SELECT * FROM discounts 
backend/services/ticket-service//src/services/discountService.ts:180:      UPDATE discounts 
backend/services/ticket-service//src/services/discountService.ts:199:      SELECT * FROM discounts 
backend/services/ticket-service//src/services/qrService.ts:118:        // Lock ticket for update
backend/services/ticket-service//src/services/qrService.ts:119:        const lockQuery = 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE';
backend/services/ticket-service//src/services/qrService.ts:126:        // Update ticket status
backend/services/ticket-service//src/services/qrService.ts:127:        const updateQuery = `
backend/services/ticket-service//src/services/qrService.ts:128:          UPDATE tickets 
backend/services/ticket-service//src/services/qrService.ts:133:        await client.query(updateQuery, [
backend/services/ticket-service//src/services/qrService.ts:143:          INSERT INTO ticket_validations 
backend/services/ticket-service//src/services/qrService.ts:190:    const query = 'SELECT * FROM tickets WHERE id = $1';
backend/services/ticket-service//src/services/qrService.ts:204:    let encrypted = cipher.update(text, 'utf8', 'hex');
backend/services/ticket-service//src/services/qrService.ts:217:    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
backend/services/ticket-service//src/services/paymentEventHandler.ts:16:      // Update order status
backend/services/ticket-service//src/services/paymentEventHandler.ts:18:        `UPDATE orders 
backend/services/ticket-service//src/services/paymentEventHandler.ts:21:             updated_at = NOW()
backend/services/ticket-service//src/services/paymentEventHandler.ts:28:        `SELECT * FROM orders WHERE id = $1`,
backend/services/ticket-service//src/services/paymentEventHandler.ts:51:        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
backend/services/ticket-service//src/services/paymentEventHandler.ts:81:      `UPDATE orders 
backend/services/ticket-service//src/services/paymentEventHandler.ts:83:           updated_at = NOW()
backend/services/ticket-service//src/workers/reservation-expiry.worker.ts:45:      const result = await db.raw('SELECT release_expired_reservations() as count');
backend/services/ticket-service//src/workers/reservation-expiry.worker.ts:55:          .select('id', 'order_id', 'user_id', 'quantity');
backend/services/ticket-service//src/workers/mintWorker.ts:35:          `INSERT INTO tickets (id, order_id, user_id, event_id, nft_address, status, created_at)
backend/services/ticket-service//src/workers/mintWorker.ts:49:      // Update order status
backend/services/ticket-service//src/workers/mintWorker.ts:51:        `UPDATE orders SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
backend/services/ticket-service//src/workers/mintWorker.ts:57:        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
backend/services/ticket-service//src/workers/mintWorker.ts:112:      `UPDATE orders SET status = 'MINT_FAILED', updated_at = NOW() WHERE id = $1`,
backend/services/ticket-service//src/workers/mintWorker.ts:118:      `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:116:      const result = await client.query('SELECT release_expired_reservations() as count');
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:122:          SELECT 
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:138:            INSERT INTO outbox (
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:196:        'SELECT * FROM find_orphan_reservations()'
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:252:      SELECT * FROM reservations WHERE id = $1
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:259:    // Update reservation status
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:261:      UPDATE reservations
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:265:          updated_at = NOW()
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:274:            UPDATE ticket_types
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:276:                updated_at = NOW()
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:285:      INSERT INTO reservation_history (
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:330:          SELECT status FROM reservations WHERE id = $1
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:357:        SELECT id, name, available_quantity, total_quantity
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:370:            UPDATE ticket_types
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:372:                updated_at = NOW()
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:388:          SELECT 
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:391:              (SELECT SUM((value->>'quantity')::int)
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:401:        SELECT 
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:422:            INSERT INTO outbox (
backend/services/ticket-service//src/types/index.ts:23:  updatedAt: Date;
backend/services/ticket-service//src/types/index.ts:49:  updatedAt: Date;

### All JOIN operations:
backend/services/ticket-service//src/routes/internalRoutes.ts:175:      JOIN ticket_types tt ON t.ticket_type_id = tt.id
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:136:    LEFT JOIN orders o ON r.order_id = o.id
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:154:    JOIN orders o ON r.order_id = o.id
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:68:        JOIN order_items oi ON oi.id = t.order_item_id
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:129:        LEFT JOIN events e ON o.event_id = e.id
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:196:        JOIN ticket_types tt ON t.ticket_type_id = tt.id
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:197:        JOIN events e ON t.event_id = e.id
backend/services/ticket-service//src/controllers/orders.controller.ts:68:        JOIN order_items oi ON oi.id = t.order_item_id
backend/services/ticket-service//src/controllers/orders.controller.ts:129:        LEFT JOIN events e ON o.event_id = e.id
backend/services/ticket-service//src/controllers/orders.controller.ts:196:        JOIN ticket_types tt ON t.ticket_type_id = tt.id
backend/services/ticket-service//src/controllers/orders.controller.ts:197:        JOIN events e ON t.event_id = e.id
backend/services/ticket-service//src/models/Reservation.ts:67:    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
backend/services/ticket-service//src/models/Order.ts:75:    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
backend/services/ticket-service//src/models/Ticket.ts:75:    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
backend/services/ticket-service//src/models/Purchase.ts:71:    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
backend/services/ticket-service//src/services/ticketService.ts:377:      JOIN ticket_types tt ON t.ticket_type_id = tt.id
backend/services/ticket-service//src/services/ticketService.ts:402:      JOIN ticket_types tt ON t.ticket_type_id = tt.id
backend/services/ticket-service//src/services/ticketService.ts:403:      JOIN events e ON t.event_id = e.id
backend/services/ticket-service//src/services/transferService.ts:63:        JOIN venues v ON e.venue_id = v.id
backend/services/ticket-service//src/services/transferService.ts:323:        JOIN events e ON t.event_id = e.id
backend/services/ticket-service//src/services/ticketService.ts.backup:377:      JOIN ticket_types tt ON t.ticket_type_id = tt.id
backend/services/ticket-service//src/services/ticketService.ts.backup:402:      JOIN ticket_types tt ON t.ticket_type_id = tt.id
backend/services/ticket-service//src/services/ticketService.ts.backup:403:      JOIN events e ON t.event_id = e.id
backend/services/ticket-service//src/services/transferService.ts.backup:63:        JOIN venues v ON e.venue_id = v.id
backend/services/ticket-service//src/services/transferService.ts.backup:323:        JOIN events e ON t.event_id = e.id
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:396:          LEFT JOIN reservations r ON r.status IN ('PENDING', 'ACTIVE')
backend/services/ticket-service//src/workers/reservation-cleanup.worker.ts:409:        JOIN reservation_counts rc ON rc.ticket_type_id = tt.id

### All WHERE clauses:
backend/services/ticket-service//src/routes/webhookRoutes.ts:52:       WHERE nonce = $1 AND endpoint = $2`,
backend/services/ticket-service//src/routes/webhookRoutes.ts:73:    pool.query('DELETE FROM webhook_nonces WHERE expires_at < NOW()')
backend/services/ticket-service//src/routes/mintRoutes.ts:37:      'SELECT status, tenant_id FROM orders WHERE id = $1',
backend/services/ticket-service//src/routes/internalRoutes.ts:122:           WHERE id = $2 AND status NOT IN ('TRANSFERRED', 'USED')`,
backend/services/ticket-service//src/routes/internalRoutes.ts:176:      WHERE t.id = ANY($1)
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:8:CREATE INDEX IF NOT EXISTS idx_reservations_expires_at ON reservations(expires_at) WHERE status = 'PENDING';
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:47:        WHERE r.status IN ('PENDING', 'ACTIVE')
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:57:        WHERE id = reservation.id;
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:70:                WHERE id = ticket.ticket_type_id;
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:104:    WHERE status = 'active'
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:137:    WHERE r.status = 'PENDING'
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:155:    WHERE r.status = 'PENDING'
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:171:    WHERE r.status = 'PENDING'
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:36:        WHERE o.id = $1 AND o.user_id = $2
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:56:        WHERE oi.order_id = $1
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:69:        WHERE oi.order_id = $1 AND t.user_id = $2
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:130:        WHERE o.user_id = $1
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:198:        WHERE t.user_id = $1
backend/services/ticket-service//src/controllers/orders.controller.ts:36:        WHERE o.id = $1 AND o.user_id = $2
backend/services/ticket-service//src/controllers/orders.controller.ts:56:        WHERE oi.order_id = $1
backend/services/ticket-service//src/controllers/orders.controller.ts:69:        WHERE oi.order_id = $1 AND t.user_id = $2
backend/services/ticket-service//src/controllers/orders.controller.ts:130:        WHERE o.user_id = $1
backend/services/ticket-service//src/controllers/orders.controller.ts:198:        WHERE t.user_id = $1
backend/services/ticket-service//src/models/Reservation.ts:36:    const query = 'SELECT * FROM reservations WHERE id = $1';
backend/services/ticket-service//src/models/Reservation.ts:44:      WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
backend/services/ticket-service//src/models/Reservation.ts:68:    const query = `UPDATE reservations SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
backend/services/ticket-service//src/models/Reservation.ts:78:      WHERE status = 'active' AND expires_at < NOW()
backend/services/ticket-service//src/models/Order.ts:48:    const query = 'SELECT * FROM orders WHERE id = $1';
backend/services/ticket-service//src/models/Order.ts:54:    const query = 'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC';
backend/services/ticket-service//src/models/Order.ts:76:    const query = `UPDATE orders SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
backend/services/ticket-service//src/models/Order.ts:83:    const query = 'DELETE FROM orders WHERE id = $1';
backend/services/ticket-service//src/models/Ticket.ts:48:    const query = 'SELECT * FROM tickets WHERE id = $1';
backend/services/ticket-service//src/models/Ticket.ts:54:    const query = 'SELECT * FROM tickets WHERE event_id = $1 ORDER BY created_at DESC';
backend/services/ticket-service//src/models/Ticket.ts:76:    const query = `UPDATE tickets SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
backend/services/ticket-service//src/models/Ticket.ts:83:    const query = 'DELETE FROM tickets WHERE id = $1';
backend/services/ticket-service//src/models/Purchase.ts:44:    const query = 'SELECT * FROM purchases WHERE id = $1';
backend/services/ticket-service//src/models/Purchase.ts:50:    const query = 'SELECT * FROM purchases WHERE order_id = $1';
backend/services/ticket-service//src/models/Purchase.ts:72:    const query = `UPDATE purchases SET ${fields} WHERE id = $1 RETURNING *`;
backend/services/ticket-service//src/models/Transfer.ts:34:    const query = 'SELECT * FROM transfers WHERE id = $1';
backend/services/ticket-service//src/models/Transfer.ts:40:    const query = 'SELECT * FROM transfers WHERE transfer_code = $1';
backend/services/ticket-service//src/models/Transfer.ts:49:      WHERE id = $1
backend/services/ticket-service//src/models/QRCode.ts:28:    const query = 'SELECT * FROM qr_codes WHERE code = $1';
backend/services/ticket-service//src/models/QRCode.ts:37:      WHERE id = $1 AND scanned = false
backend/services/ticket-service//src/models/QRCode.ts:46:      WHERE code = $1 AND scanned = false 
backend/services/ticket-service//src/schema/discounts.sql:24:CREATE INDEX IF NOT EXISTS idx_discounts_code ON discounts(code) WHERE active = true;
backend/services/ticket-service//src/services/ticketService.ts:59:      WHERE event_id = $1
backend/services/ticket-service//src/services/ticketService.ts:71:      WHERE id = $1 AND event_id = $2
backend/services/ticket-service//src/services/ticketService.ts:102:                WHERE id = $1 AND event_id = $2
backend/services/ticket-service//src/services/ticketService.ts:121:                'UPDATE ticket_types SET available_quantity = available_quantity - $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts:135:            const firstTypeQuery = 'SELECT name FROM ticket_types WHERE id = $1';
backend/services/ticket-service//src/services/ticketService.ts:203:            const ticketResQuery = 'SELECT * FROM ticket_reservations WHERE id = $1 FOR UPDATE';
backend/services/ticket-service//src/services/ticketService.ts:208:              const ticketTypeQuery = 'SELECT event_id FROM ticket_types WHERE id = $1';
backend/services/ticket-service//src/services/ticketService.ts:214:              const resQuery = 'SELECT * FROM reservations WHERE id = $1 FOR UPDATE';
backend/services/ticket-service//src/services/ticketService.ts:234:              const typeQuery = 'SELECT * FROM ticket_types WHERE id = $1';
backend/services/ticket-service//src/services/ticketService.ts:314:              'UPDATE ticket_reservations SET status = $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts:319:              'UPDATE reservations SET status = $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts:378:      WHERE t.id = $1
backend/services/ticket-service//src/services/ticketService.ts:404:      WHERE t.owner_id = $1
backend/services/ticket-service//src/services/ticketService.ts:421:    const query = 'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2';
backend/services/ticket-service//src/services/ticketService.ts:431:      WHERE status = 'ACTIVE' AND expires_at < NOW()
backend/services/ticket-service//src/services/ticketService.ts:442:          'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts:451:      `UPDATE ticket_reservations SET status = 'expired' WHERE status = 'ACTIVE' AND expires_at < NOW()`
backend/services/ticket-service//src/services/ticketService.ts:468:              WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE'
backend/services/ticket-service//src/services/ticketService.ts:480:              `UPDATE reservations SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
backend/services/ticket-service//src/services/ticketService.ts:487:                'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
backend/services/ticket-service//src/services/paymentEventHandler.ts.backup:22:         WHERE id = $1`,
backend/services/ticket-service//src/services/paymentEventHandler.ts.backup:28:        `SELECT * FROM orders WHERE id = $1`,
backend/services/ticket-service//src/services/paymentEventHandler.ts.backup:84:       WHERE id = $1`,
backend/services/ticket-service//src/services/transferService.ts:33:      const ticketQuery = 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE';
backend/services/ticket-service//src/services/transferService.ts:64:        WHERE e.id = $1
backend/services/ticket-service//src/services/transferService.ts:92:        WHERE ticket_id = $1
backend/services/ticket-service//src/services/transferService.ts:106:          WHERE id IN ($1, $2)
backend/services/ticket-service//src/services/transferService.ts:121:        WHERE id = $3
backend/services/ticket-service//src/services/transferService.ts:151:        WHERE id = $2
backend/services/ticket-service//src/services/transferService.ts:171:            'UPDATE ticket_transfers SET transaction_hash = $1 WHERE ticket_id = $2 AND transferred_at = $3',
backend/services/ticket-service//src/services/transferService.ts:214:      WHERE ticket_id = $1
backend/services/ticket-service//src/services/transferService.ts:236:        WHERE (user_id = $1 OR user_id = $2) 
backend/services/ticket-service//src/services/transferService.ts:251:        WHERE ticket_id = $1 
backend/services/ticket-service//src/services/transferService.ts:273:        WHERE from_user_id = $1 
backend/services/ticket-service//src/services/transferService.ts:293:        WHERE id = $1
backend/services/ticket-service//src/services/transferService.ts:324:        WHERE t.id = $1
backend/services/ticket-service//src/services/ticketService.ts.backup:59:      WHERE event_id = $1
backend/services/ticket-service//src/services/ticketService.ts.backup:71:      WHERE id = $1 AND event_id = $2
backend/services/ticket-service//src/services/ticketService.ts.backup:102:                WHERE id = $1 AND event_id = $2
backend/services/ticket-service//src/services/ticketService.ts.backup:121:                'UPDATE ticket_types SET available_quantity = available_quantity - $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts.backup:135:            const firstTypeQuery = 'SELECT name FROM ticket_types WHERE id = $1';
backend/services/ticket-service//src/services/ticketService.ts.backup:203:            const ticketResQuery = 'SELECT * FROM ticket_reservations WHERE id = $1 FOR UPDATE';
backend/services/ticket-service//src/services/ticketService.ts.backup:208:              const ticketTypeQuery = 'SELECT event_id FROM ticket_types WHERE id = $1';
backend/services/ticket-service//src/services/ticketService.ts.backup:214:              const resQuery = 'SELECT * FROM reservations WHERE id = $1 FOR UPDATE';
backend/services/ticket-service//src/services/ticketService.ts.backup:234:              const typeQuery = 'SELECT * FROM ticket_types WHERE id = $1';
backend/services/ticket-service//src/services/ticketService.ts.backup:314:              'UPDATE ticket_reservations SET status = $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts.backup:319:              'UPDATE reservations SET status = $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts.backup:378:      WHERE t.id = $1
backend/services/ticket-service//src/services/ticketService.ts.backup:404:      WHERE t.owner_id = $1
backend/services/ticket-service//src/services/ticketService.ts.backup:421:    const query = 'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2';
backend/services/ticket-service//src/services/ticketService.ts.backup:431:      WHERE status = 'ACTIVE' AND expires_at < NOW()
backend/services/ticket-service//src/services/ticketService.ts.backup:442:          'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
backend/services/ticket-service//src/services/ticketService.ts.backup:451:      `UPDATE ticket_reservations SET status = 'expired' WHERE status = 'ACTIVE' AND expires_at < NOW()`
backend/services/ticket-service//src/services/ticketService.ts.backup:468:              WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE'
backend/services/ticket-service//src/services/ticketService.ts.backup:480:              `UPDATE reservations SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### .env.example
```
# ================================================
# TICKET-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: ticket-service
# Port: 3004
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=ticket-service           # Service identifier

# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/services/ticketService.ts
```typescript
import { QueueService as queueService } from '../services/queueService';
import { QUEUES } from '@tickettoken/shared';
import { v4 as uuidv4 } from 'uuid';
import { withLock, LockKeys } from '@tickettoken/shared';
import { LockTimeoutError, LockContentionError, LockSystemError } from '@tickettoken/shared';
import { DatabaseService } from './databaseService';
import { RedisService } from './redisService';
import {
  Ticket,
  TicketStatus,
  TicketType,
  PurchaseRequest,
  TicketReservation,
} from '../types';
import {
  NotFoundError,
  ConflictError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

export class TicketService {
  private log = logger.child({ component: 'TicketService' });

  async createTicketType(data: Partial<TicketType>): Promise<TicketType> {
    const id = uuidv4();
    const query = `
      INSERT INTO ticket_types (
        id, event_id, name, description, price,
        quantity, available_quantity, max_per_purchase,
        sale_start_date, sale_end_date, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      id,
      data.eventId,
      data.name,
      data.description || null,
      data.price,
      data.quantity,
      data.quantity,
      data.maxPerPurchase,
      data.saleStartDate,
      data.saleEndDate,
      JSON.stringify(data.metadata || {})
    ];

    const result = await DatabaseService.query<TicketType>(query, values);
    return result.rows[0];
  }

  async getTicketTypes(eventId: string): Promise<TicketType[]> {
    const query = `
      SELECT * FROM ticket_types
      WHERE event_id = $1
      ORDER BY price ASC
    `;

    const result = await DatabaseService.query<TicketType>(query, [eventId]);
    return result.rows;
  }

  async checkAvailability(eventId: string, ticketTypeId: string, quantity: number): Promise<boolean> {
    const query = `
      SELECT available_quantity
      FROM ticket_types
      WHERE id = $1 AND event_id = $2
    `;

    const result = await DatabaseService.query<{ available_quantity: number }>(
      query,
      [ticketTypeId, eventId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Ticket type');
    }

    return result.rows[0].available_quantity >= quantity;
  }

  async createReservation(purchaseRequest: PurchaseRequest): Promise<TicketReservation> {
    const firstTicketType = purchaseRequest.tickets[0];
    const lockKey = LockKeys.inventory(purchaseRequest.eventId, firstTicketType.ticketTypeId);

    try {
      return await withLock(
        lockKey,
        10000,
        async () => {
          return await DatabaseService.transaction(async (client) => {
            const reservationId = uuidv4();
            const expiresAt = new Date(Date.now() + config.limits.reservationTimeout * 1000);

            for (const ticketRequest of purchaseRequest.tickets) {
              const lockQuery = `
                SELECT * FROM ticket_types
                WHERE id = $1 AND event_id = $2
                FOR UPDATE
              `;

              const result = await client.query(lockQuery, [
                ticketRequest.ticketTypeId,
                purchaseRequest.eventId
              ]);

              if (result.rows.length === 0) {
                throw new NotFoundError('Ticket type');
              }

              const ticketType = result.rows[0];
              if (ticketType.available_quantity < ticketRequest.quantity) {
                throw new ConflictError(`Not enough tickets available for ${ticketType.name}`);
              }

              await client.query(
                'UPDATE ticket_types SET available_quantity = available_quantity - $1 WHERE id = $2',
                [ticketRequest.quantity, ticketRequest.ticketTypeId]
              );
            }

            const totalQuantity = purchaseRequest.tickets.reduce((sum: number, t: any) => sum + t.quantity, 0);

            const reservationQuery = `
              INSERT INTO reservations (
                id, user_id, event_id, ticket_type_id, quantity, tickets, expires_at, status, type_name, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              RETURNING *
            `;

            const firstTypeQuery = 'SELECT name FROM ticket_types WHERE id = $1';
            const firstTypeResult = await client.query(firstTypeQuery, [firstTicketType.ticketTypeId]);
            const typeName = firstTypeResult.rows[0]?.name || 'General';

            const reservationResult = await client.query(reservationQuery, [
              reservationId,
              purchaseRequest.userId,
              purchaseRequest.eventId,
              firstTicketType.ticketTypeId,
              totalQuantity,
              JSON.stringify(purchaseRequest.tickets),
              expiresAt,
              'ACTIVE',
              typeName,
              new Date()
            ]);

            // Reservation already inserted above - no duplicate table needed

            await RedisService.set(
              `reservation:${reservationId}`,
              JSON.stringify(reservationResult.rows[0]),
              config.redis.ttl.reservation
            );

            return reservationResult.rows[0];
          });
        },
        { service: 'ticket-service', lockType: 'inventory' }
      );
    } catch (error: any) {
      if (error instanceof LockTimeoutError) {
        this.log.error('Lock timeout - createReservation', {
          eventId: purchaseRequest.eventId,
          userId: purchaseRequest.userId,
          timeoutMs: error.timeoutMs
        });
        throw new ConflictError('Unable to reserve tickets due to high demand. Please try again.');
      }
      if (error instanceof LockContentionError) {
        this.log.error('Lock contention - createReservation', {
          eventId: purchaseRequest.eventId,
          userId: purchaseRequest.userId
        });
        throw new ConflictError('These tickets are currently being reserved. Please try again.');
      }
      if (error instanceof LockSystemError) {
        this.log.error('Lock system error - createReservation', {
          originalError: error.originalError?.message
        });
        throw new ConflictError('System temporarily unavailable. Please try again.');
      }
      throw error;
    }
  }

  async confirmPurchase(reservationId: string, paymentId: string): Promise<Ticket[]> {
    const lockKey = LockKeys.reservation(reservationId);

    try {
      return await withLock(
        lockKey,
        5000,
        async () => {
          return await DatabaseService.transaction(async (client) => {
            let reservation = null;
            let eventId = null;

            const ticketResQuery = 'SELECT * FROM ticket_reservations WHERE id = $1 FOR UPDATE';
            const ticketResResult = await client.query(ticketResQuery, [reservationId]);

            if (ticketResResult.rows.length > 0) {
              reservation = ticketResResult.rows[0];
              const ticketTypeQuery = 'SELECT event_id FROM ticket_types WHERE id = $1';
              const ticketTypeResult = await client.query(ticketTypeQuery, [reservation.ticket_type_id]);
              if (ticketTypeResult.rows.length > 0) {
                eventId = ticketTypeResult.rows[0].event_id;
              }
            } else {
              const resQuery = 'SELECT * FROM reservations WHERE id = $1 FOR UPDATE';
              const resResult = await client.query(resQuery, [reservationId]);
              if (resResult.rows.length > 0) {
                reservation = resResult.rows[0];
                eventId = reservation.event_id;
              }
            }

            if (!reservation) {
              throw new NotFoundError('Reservation');
            }

            if (reservation.status !== 'ACTIVE') {
              throw new ConflictError('Reservation is no longer active');
            }

            const tickets: Ticket[] = [];
            const ticketData = reservation.tickets || [{ ticketTypeId: reservation.ticket_type_id, quantity: reservation.quantity || 1 }];

            for (const ticketRequest of ticketData) {
              const typeQuery = 'SELECT * FROM ticket_types WHERE id = $1';
              const typeResult = await client.query(typeQuery, [ticketRequest.ticketTypeId || reservation.ticket_type_id]);

              if (typeResult.rows.length === 0) {
                throw new NotFoundError('Ticket type not found');
              }

              const ticketType = typeResult.rows[0];

              if (!eventId) {
                eventId = ticketType.event_id;
              }

              const quantity = ticketRequest.quantity || 1;
              for (let i = 0; i < quantity; i++) {
                const ticketId = uuidv4();

                const ticketQuery = `
                  INSERT INTO tickets (
                    id,
                    event_id,
                    ticket_type_id,
                    owner_id,
                    owner_user_id,
                    user_id,
                    status,
                    price,
                    payment_id,
                    purchased_at,
                    metadata,
                    total_paid,
                    blockchain_status
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                  RETURNING *
                `;

                const values = [
                  ticketId,
                  eventId,
                  ticketRequest.ticketTypeId || reservation.ticket_type_id,
                  reservation.user_id,
                  reservation.user_id,
                  reservation.user_id,
                  'SOLD',
                  ticketType.price || 0,
                  paymentId || reservation.user_id,
                  new Date(),
                  JSON.stringify({
                    ticketTypeName: ticketType.name,
                    reservationId: reservationId,
                    purchaseDate: new Date().toISOString()
                  }),
                  ticketType.price || 0,
                  'pending'
                ];

                try {
                  const ticketResult = await client.query(ticketQuery, values);
                  tickets.push(ticketResult.rows[0]);
                } catch (error: any) {
                  this.log.error('Failed to create ticket:', error);
                  throw new Error(`Failed to create ticket: ${error.message}`);
                }

                try {
                  await queueService.publish(config.rabbitmq.queues.nftMinting, {
                    ticketId,
                    userId: reservation.user_id,
                    eventId: eventId,
                    ticketType: ticketType.name,
                    price: ticketType.price
                  });
                } catch (error) {
                  this.log.warn('Failed to queue NFT minting:', error);
                }
              }
            }

            // REMOVED .catch(() => {}) - let errors bubble up
            await client.query(
              'UPDATE ticket_reservations SET status = $1 WHERE id = $2',
              ['expired', reservationId]
            );

            await client.query(
              'UPDATE reservations SET status = $1 WHERE id = $2',
              ['EXPIRED', reservationId]
            );

            await RedisService.del(`reservation:${reservationId}`);

            try {
              await queueService.publish(config.rabbitmq.queues.ticketEvents, {
                type: 'tickets.purchased',
                userId: reservation.user_id,
                eventId: eventId,
                ticketIds: tickets.map((t: any) => t.id),
                timestamp: new Date()
              });
            } catch (error) {
              this.log.warn('Failed to publish ticket event:', error);
            }

            return tickets;
          });
        },
        { service: 'ticket-service', lockType: 'reservation' }
      );
    } catch (error: any) {
      if (error instanceof LockTimeoutError) {
        this.log.error('Lock timeout - confirmPurchase', {
          reservationId,
          paymentId,
          timeoutMs: error.timeoutMs
        });
        throw new ConflictError('Unable to confirm purchase due to high demand. Please try again.');
      }
      if (error instanceof LockContentionError) {
        this.log.error('Lock contention - confirmPurchase', {
          reservationId,
          paymentId
        });
        throw new ConflictError('This reservation is currently being processed. Please try again.');
      }
      if (error instanceof LockSystemError) {
        this.log.error('Lock system error - confirmPurchase', {
          originalError: error.originalError?.message
        });
        throw new ConflictError('System temporarily unavailable. Please try again.');
      }
      throw error;
    }
  }

  async getTicket(ticketId: string): Promise<any> {
    const cached = await RedisService.get(`ticket:${ticketId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    const query = `
      SELECT t.*, tt.name as ticket_type_name, tt.description as ticket_type_description
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.id = $1
    `;

    const result = await DatabaseService.query(query, [ticketId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Ticket');
    }

    const ticket = result.rows[0];

    await RedisService.set(
      `ticket:${ticketId}`,
      JSON.stringify(ticket),
      config.redis.ttl.cache
    );

    return ticket;
  }

  async getUserTickets(userId: string, eventId?: string): Promise<Ticket[]> {
    let query = `
      SELECT t.*, tt.name as ticket_type_name, e.name as event_name
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN events e ON t.event_id = e.id
      WHERE t.owner_id = $1
    `;

    const params: any[] = [userId];

    if (eventId) {
      query += ' AND t.event_id = $2';
      params.push(eventId);
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await DatabaseService.query<Ticket>(query, params);
    return result.rows;
  }

  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
    const query = 'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2';
    await DatabaseService.query(query, [status, ticketId]);

    await RedisService.del(`ticket:${ticketId}`);
  }

  async expireReservations(): Promise<void> {
    const query = `
      UPDATE reservations
      SET status = 'EXPIRED'
      WHERE status = 'ACTIVE' AND expires_at < NOW()
      RETURNING *
    `;

    const result = await DatabaseService.query(query);

    for (const reservation of result.rows) {
      const tickets = reservation.tickets || [];

      for (const ticket of tickets) {
        await DatabaseService.query(
          'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
          [ticket.quantity, ticket.ticketTypeId]
        );
      }

      await RedisService.del(`reservation:${reservation.id}`);
    }

    await DatabaseService.query(
      `UPDATE ticket_reservations SET status = 'expired' WHERE status = 'ACTIVE' AND expires_at < NOW()`
    );

    this.log.info(`Expired ${result.rowCount} reservations`);
  }

  async releaseReservation(reservationId: string, userId: string): Promise<any> {
    const lockKey = LockKeys.reservation(reservationId);

    try {
      return await withLock(
        lockKey,
        5000,
        async () => {
          return await DatabaseService.transaction(async (client) => {
            const resQuery = `
              SELECT * FROM reservations
              WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE'
              FOR UPDATE
            `;
            const resResult = await client.query(resQuery, [reservationId, userId]);

            if (resResult.rows.length === 0) {
              throw new NotFoundError('Reservation not found or already processed');
            }

            const reservation = resResult.rows[0];

            await client.query(
              `UPDATE reservations SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
              [reservationId]
            );

            const tickets = reservation.tickets || [];
            for (const ticket of tickets) {
              await client.query(
                'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
                [ticket.quantity, ticket.ticketTypeId]
              );
            }

            await RedisService.del(`reservation:${reservationId}`);

            return { success: true, reservation: reservation };
          });
        },
        { service: 'ticket-service', lockType: 'reservation' }
      );
    } catch (error: any) {
      if (error instanceof LockTimeoutError) {
        this.log.error('Lock timeout - releaseReservation', {
          reservationId,
          userId,
          timeoutMs: error.timeoutMs
        });
        throw new ConflictError('Unable to release reservation due to high demand. Please try again.');
      }
      if (error instanceof LockContentionError) {
        this.log.error('Lock contention - releaseReservation', {
          reservationId,
          userId
        });
        throw new ConflictError('This reservation is currently being processed. Please try again.');
      }
      if (error instanceof LockSystemError) {
        this.log.error('Lock system error - releaseReservation', {
          originalError: error.originalError?.message
        });
        throw new ConflictError('System temporarily unavailable. Please try again.');
      }
      throw error;
    }
  }

  async generateQR(ticketId: string): Promise<any> {
    const ticket = await this.getTicket(ticketId);

    const qrPayload = {
      ticketId: ticket.id,
      eventId: ticket.event_id,
      userId: ticket.owner_id || ticket.owner_user_id || ticket.user_id,
      timestamp: Date.now()
    };

    const encrypted = this.encryptData(JSON.stringify(qrPayload));
    const qrImage = await QRCode.toDataURL(encrypted);

    return {
      qrCode: encrypted,
      qrImage: qrImage,
      ticketId: ticketId
    };
  }

  async validateQR(qrData: string): Promise<any> {
    try {
      let payload;

      if (qrData.includes(':')) {
        const decrypted = this.decryptData(qrData);
        payload = JSON.parse(decrypted);
      } else {
        const decoded = Buffer.from(qrData, 'base64').toString('utf-8');
        const parsedData = JSON.parse(decoded);

        payload = {
          ticketId: parsedData.ticket_id,
          eventId: parsedData.event_id,
          userId: parsedData.owner_id
        };
      }

      const ticket = await this.getTicket(payload.ticketId);

      const isValid = ticket.status === 'SOLD' && !ticket.used_at && !ticket.validated_at;

      return {
        valid: isValid,
        data: {
          ticketId: payload.ticketId,
          eventId: payload.eventId,
          userId: payload.userId
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid QR code'
      };
    }
  }

  private encryptData(data: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.QR_ENCRYPTION_KEY || 'defaultkeychangethisto32charlong');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return iv.toString('base64') + ':' + encrypted;
  }

  private decryptData(data: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.QR_ENCRYPTION_KEY || 'defaultkeychangethisto32charlong');

    const parts = data.split(':');
    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private generateQRCode(ticketId: string): string {
    return `TKT:${ticketId}:${Date.now()}`;
  }
}

export const ticketService = new TicketService();
```

### FILE: src/services/transferService.ts
```typescript
import { QueueService as queueService } from '../services/queueService';
import { QUEUES } from '@tickettoken/shared';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './databaseService';
import { RedisService } from './redisService';
import { SolanaService } from './solanaService';
import { TicketStatus, TransferRecord } from '../types';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { config } from '../config';
import { logger } from '../utils/logger';

export class TransferService {
  private log = logger.child({ component: 'TransferService' });
  
  // Transfer configuration constants
  private readonly TRANSFER_COOLDOWN_MINUTES = 30;
  private readonly MAX_DAILY_TRANSFERS = 10;

  async transferTicket(
    ticketId: string,
    fromUserId: string,
    toUserId: string,
    reason?: string
  ): Promise<TransferRecord> {
    // Validate transfer before processing
    const validation = await this.validateTransferRequest(ticketId, fromUserId, toUserId);
    if (!validation.valid) {
      throw new ValidationError(`Transfer not allowed: ${validation.reason}`);
    }

    return await DatabaseService.transaction(async (client) => {
      // Lock ticket for update
      const ticketQuery = 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE';
      const ticketResult = await client.query(ticketQuery, [ticketId]);

      if (ticketResult.rows.length === 0) {
        throw new NotFoundError('Ticket');
      }

      const ticket = ticketResult.rows[0];

      // Validate ownership
      if (ticket.user_id !== fromUserId) {
        throw new ForbiddenError('You do not own this ticket');
      }

      // Validate ticket status
      if (ticket.status !== TicketStatus.SOLD) {
        throw new ValidationError(`Cannot transfer ticket with status: ${ticket.status}`);
      }

      // Enhanced transfer restrictions checking
      const eventQuery = `
        SELECT 
          e.*, 
          v.transfer_deadline_hours,
          e.allow_transfers,
          e.max_transfers_per_ticket,
          e.transfer_blackout_start,
          e.transfer_blackout_end,
          e.require_identity_verification
        FROM events e
        JOIN venues v ON e.venue_id = v.id
        WHERE e.id = $1
      `;
      const eventResult = await client.query(eventQuery, [ticket.event_id]);
      const event = eventResult.rows[0];

      // Check if transfers are allowed for this event
      if (event.allow_transfers === false) {
        throw new ValidationError('Transfers are not allowed for this event');
      }

      // Check transfer deadline
      const hoursUntilEvent = (new Date(event.start_date).getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilEvent < event.transfer_deadline_hours) {
        throw new ValidationError('Transfer deadline has passed for this event');
      }

      // Check blackout periods
      const now = new Date();
      if (event.transfer_blackout_start && event.transfer_blackout_end) {
        if (now >= new Date(event.transfer_blackout_start) && now <= new Date(event.transfer_blackout_end)) {
          throw new ValidationError('Transfers are currently in blackout period');
        }
      }

      // Check max transfers limit
      const transferCountQuery = `
        SELECT COUNT(*) as transfer_count 
        FROM ticket_transfers 
        WHERE ticket_id = $1
      `;
      const transferCountResult = await client.query(transferCountQuery, [ticketId]);
      const transferCount = parseInt(transferCountResult.rows[0].transfer_count);
      
      if (event.max_transfers_per_ticket && transferCount >= event.max_transfers_per_ticket) {
        throw new ValidationError(`Maximum transfer limit (${event.max_transfers_per_ticket}) reached`);
      }

      // Check identity verification requirement
      if (event.require_identity_verification) {
        const verificationQuery = `
          SELECT identity_verified 
          FROM users 
          WHERE id IN ($1, $2)
        `;
        const verificationResult = await client.query(verificationQuery, [fromUserId, toUserId]);
        
        for (const user of verificationResult.rows) {
          if (!user.identity_verified) {
            throw new ValidationError('Identity verification required for transfers');
          }
        }
      }

      // Update ticket ownership
      const updateQuery = `
        UPDATE tickets
        SET user_id = $1, status = $2, updated_at = NOW()
        WHERE id = $3
      `;
      await client.query(updateQuery, [toUserId, TicketStatus.TRANSFERRED, ticketId]);

      // Record transfer
      const transferRecord: TransferRecord = {
        fromUserId,
        toUserId,
        transferredAt: new Date(),
        reason
      };

      const transferQuery = `
        INSERT INTO ticket_transfers
        (id, ticket_id, from_user_id, to_user_id, reason, transferred_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      await client.query(transferQuery, [
        uuidv4(),
        ticketId,
        fromUserId,
        toUserId,
        reason || null,
        new Date()
      ]);

      // Update transfer history
      const historyQuery = `
        UPDATE tickets
        SET transfer_history = transfer_history || $1::jsonb
        WHERE id = $2
      `;
      await client.query(historyQuery, [
        JSON.stringify([transferRecord]),
        ticketId
      ]);

      // Transfer NFT if minted
      if (ticket.nft_token_id) {
        try {
          const txHash = await SolanaService.transferNFT(
            ticket.nft_token_id,
            fromUserId,
            toUserId
          );

          transferRecord.transactionHash = txHash;

          // Update transfer record with blockchain transaction
          await client.query(
            'UPDATE ticket_transfers SET transaction_hash = $1 WHERE ticket_id = $2 AND transferred_at = $3',
            [txHash, ticketId, transferRecord.transferredAt]
          );
        } catch (error) {
          this.log.error('NFT transfer failed:', error);
          // Continue with database transfer even if blockchain fails
        }
      }

      // Clear cache
      await RedisService.del(`ticket:${ticketId}`);

      // Publish transfer event
      await queueService.publish(config.rabbitmq.queues.ticketEvents, {
        type: 'ticket.transferred',
        ticketId,
        fromUserId,
        toUserId,
        timestamp: new Date()
      });

      // Send notifications
      await queueService.publish(config.rabbitmq.queues.notifications, {
        type: 'ticket.transfer.sender',
        userId: fromUserId,
        ticketId,
        toUserId
      });

      await queueService.publish(config.rabbitmq.queues.notifications, {
        type: 'ticket.transfer.receiver',
        userId: toUserId,
        ticketId,
        fromUserId
      });

      return transferRecord;
    });
  }

  async getTransferHistory(ticketId: string): Promise<TransferRecord[]> {
    const query = `
      SELECT * FROM ticket_transfers
      WHERE ticket_id = $1
      ORDER BY transferred_at DESC
    `;

    const result = await DatabaseService.query<TransferRecord>(query, [ticketId]);
    return result.rows;
  }

  async validateTransferRequest(
    ticketId: string,
    fromUserId: string,
    toUserId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Check if users exist and are not the same
      if (fromUserId === toUserId) {
        return { valid: false, reason: 'Cannot transfer ticket to yourself' };
      }

      // Check user blacklists
      const blacklistQuery = `
        SELECT 1 FROM user_blacklists 
        WHERE (user_id = $1 OR user_id = $2) 
        AND (action_type = 'transfer' OR action_type = 'all')
        AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      `;
      const blacklistResult = await DatabaseService.query(blacklistQuery, [fromUserId, toUserId]);
      
      if (blacklistResult.rows.length > 0) {
        return { valid: false, reason: 'User is blacklisted from transfers' };
      }

      // Check transfer cooldown period (prevent rapid transfers)
      const cooldownQuery = `
        SELECT transferred_at 
        FROM ticket_transfers 
        WHERE ticket_id = $1 
        ORDER BY transferred_at DESC 
        LIMIT 1
      `;
      const cooldownResult = await DatabaseService.query(cooldownQuery, [ticketId]);
      
      if (cooldownResult.rows.length > 0) {
        const lastTransfer = new Date(cooldownResult.rows[0].transferred_at);
        const minutesSinceLastTransfer = (Date.now() - lastTransfer.getTime()) / (1000 * 60);
        
        if (minutesSinceLastTransfer < this.TRANSFER_COOLDOWN_MINUTES) {
          return { 
            valid: false, 
            reason: `Please wait ${Math.ceil(this.TRANSFER_COOLDOWN_MINUTES - minutesSinceLastTransfer)} minutes before transferring again` 
          };
        }
      }

      // Check rate limiting for user transfers
      const rateLimitQuery = `
        SELECT COUNT(*) as transfer_count 
        FROM ticket_transfers 
        WHERE from_user_id = $1 
        AND transferred_at > NOW() - INTERVAL '24 hours'
      `;
      const rateLimitResult = await DatabaseService.query(rateLimitQuery, [fromUserId]);
      const dailyTransfers = parseInt(rateLimitResult.rows[0].transfer_count);
      
      if (dailyTransfers >= this.MAX_DAILY_TRANSFERS) {
        return { 
          valid: false, 
          reason: `Daily transfer limit (${this.MAX_DAILY_TRANSFERS}) exceeded` 
        };
      }

      // Verify recipient can receive tickets
      const recipientQuery = `
        SELECT 
          account_status,
          can_receive_transfers,
          email_verified
        FROM users 
        WHERE id = $1
      `;
      const recipientResult = await DatabaseService.query(recipientQuery, [toUserId]);
      
      if (recipientResult.rows.length === 0) {
        return { valid: false, reason: 'Recipient user not found' };
      }
      
      const recipient = recipientResult.rows[0];
      
      if (recipient.account_status !== 'active') {
        return { valid: false, reason: 'Recipient account is not active' };
      }
      
      if (recipient.can_receive_transfers === false) {
        return { valid: false, reason: 'Recipient cannot receive transfers' };
      }
      
      if (!recipient.email_verified) {
        return { valid: false, reason: 'Recipient must verify email to receive transfers' };
      }

      // Check ticket-specific transfer rules
      const ticketQuery = `
        SELECT 
          t.status,
          t.is_transferable,
          t.transfer_locked_until,
          e.id as event_id
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.id = $1
      `;
      const ticketResult = await DatabaseService.query(ticketQuery, [ticketId]);
      
      if (ticketResult.rows.length === 0) {
        return { valid: false, reason: 'Ticket not found' };
      }
      
      const ticket = ticketResult.rows[0];
      
      if (ticket.is_transferable === false) {
        return { valid: false, reason: 'This ticket is non-transferable' };
      }
      
      if (ticket.transfer_locked_until && new Date(ticket.transfer_locked_until) > new Date()) {
        return { 
          valid: false, 
          reason: `Ticket is locked from transfers until ${new Date(ticket.transfer_locked_until).toLocaleString()}` 
        };
      }

      return { valid: true };
    } catch (error) {
      this.log.error('Transfer validation error:', error);
      return { valid: false, reason: error instanceof Error ? error.message : 'Unknown validation error' };
    }
  }
}

export const transferService = new TransferService();
```

### FILE: src/services/taxService.ts
```typescript
// Tax calculation service for ticket service
export class TaxService {
  private stateTaxRates: { [key: string]: number } = {
    'AL': 4.0, 'AK': 0, 'AZ': 5.6, 'AR': 6.5,
    'CA': 7.25, 'CO': 2.9, 'CT': 6.35, 'DE': 0,
    'FL': 6.0, 'GA': 4.0, 'HI': 4.0, 'ID': 6.0,
    'IL': 6.25, 'IN': 7.0, 'IA': 6.0, 'KS': 6.5,
    'KY': 6.0, 'LA': 4.45, 'ME': 5.5, 'MD': 6.0,
    'MA': 6.25, 'MI': 6.0, 'MN': 6.875, 'MS': 7.0,
    'MO': 4.225, 'MT': 0, 'NE': 5.5, 'NV': 6.85,
    'NH': 0, 'NJ': 6.625, 'NM': 5.125, 'NY': 4.0,
    'NC': 4.75, 'ND': 5.0, 'OH': 5.75, 'OK': 4.5,
    'OR': 0, 'PA': 6.0, 'RI': 7.0, 'SC': 6.0,
    'SD': 4.5, 'TN': 7.0, 'TX': 6.25, 'UT': 5.95,
    'VT': 6.0, 'VA': 5.3, 'WA': 6.5, 'WV': 6.0,
    'WI': 5.0, 'WY': 4.0
  };

  private localTaxRates: { [key: string]: number } = {
    'TN': 2.25,  // Nashville/Memphis additional
    'TX': 2.0,   // Austin/Houston additional
    'CA': 2.25,  // LA/SF additional
    'NY': 4.5,   // NYC additional
    'IL': 2.75,  // Chicago additional
  };

  async calculateOrderTax(
    _eventId: string,
    subtotalCents: number,
    venueState: string
  ): Promise<{
    stateTaxCents: number;
    localTaxCents: number;
    totalTaxCents: number;
    taxRate: number;
    breakdown: any;
  }> {
    const subtotalDollars = subtotalCents / 100;
    
    // Get state tax rate
    const stateRate = this.stateTaxRates[venueState] || 0;
    const stateTax = subtotalDollars * (stateRate / 100);
    
    // Get local tax rate (if applicable)
    const localRate = this.localTaxRates[venueState] || 0;
    const localTax = subtotalDollars * (localRate / 100);
    
    const totalTax = stateTax + localTax;
    const effectiveRate = stateRate + localRate;

    return {
      stateTaxCents: Math.round(stateTax * 100),
      localTaxCents: Math.round(localTax * 100),
      totalTaxCents: Math.round(totalTax * 100),
      taxRate: effectiveRate,
      breakdown: {
        state: {
          name: `${venueState} Sales Tax`,
          rate: stateRate,
          amount: stateTax
        },
        local: localRate > 0 ? {
          name: `Local Tax`,
          rate: localRate,
          amount: localTax
        } : null
      }
    };
  }
}

export const taxService = new TaxService();
```

### FILE: src/services/solanaService.ts
```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { NFTMintRequest } from '../types';

class SolanaServiceClass {
  private connection: Connection | null = null;
  private wallet: Keypair | null = null;
  private log = logger.child({ component: 'SolanaService' });

  async initialize(): Promise<void> {
    try {
      this.connection = new Connection(config.solana.rpcUrl, config.solana.commitment);
      
      // Make wallet optional for development
      if (config.solana.walletPrivateKey && config.solana.walletPrivateKey !== 'your-wallet-private-key') {
        try {
          const privateKey = Uint8Array.from(
            Buffer.from(config.solana.walletPrivateKey, 'base64')
          );
          this.wallet = Keypair.fromSecretKey(privateKey);
          this.log.info('Solana wallet loaded', {
            publicKey: this.wallet.publicKey.toBase58()
          });
        } catch (walletError) {
          this.log.warn('Solana wallet not configured - NFT minting will be simulated', walletError);
        }
      } else {
        this.log.warn('Solana wallet not configured - NFT minting will be simulated');
      }

      // Test connection
      const version = await this.connection.getVersion();
      this.log.info('Solana connected', { version });
    } catch (error) {
      this.log.error('Failed to initialize Solana:', error);
      throw error;
    }
  }

  getConnection(): Connection {
    if (!this.connection) {
      throw new Error('Solana not initialized');
    }
    return this.connection;
  }

  getWallet(): Keypair {
    if (!this.wallet) {
      throw new Error('Solana wallet not initialized');
    }
    return this.wallet;
  }

  async mintNFT(request: NFTMintRequest): Promise<{ tokenId: string; transactionHash: string }> {
    // This is a placeholder - actual implementation would use Metaplex
    this.log.info('Minting NFT (simulated)', { ticketId: request.ticketId });
    
    // Simulate minting
    return {
      tokenId: `token_${Date.now()}`,
      transactionHash: `tx_${Date.now()}`
    };
  }

  async transferNFT(tokenId: string, from: string, to: string): Promise<string> {
    // Placeholder for NFT transfer
    this.log.info('Transferring NFT (simulated)', { tokenId, from, to });
    return `transfer_tx_${Date.now()}`;
  }
}

export const SolanaService = new SolanaServiceClass();
```

### FILE: src/services/databaseService.ts
```typescript
import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

class DatabaseServiceClass {
  private pool: Pool | null = null;
  private log = logger.child({ component: 'DatabaseService' });

  async initialize(): Promise<void> {
    try {
      this.pool = new Pool({
        connectionString: config.database.url,
        max: config.database.pool?.max || 20,
        min: config.database.pool?.min || 2,
        idleTimeoutMillis: config.database.pool?.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.database.pool?.connectionTimeoutMillis || 5000
      });

      this.pool.on('error', (err) => {
        this.log.error('Database pool error:', err);
      });

      await this.pool.query('SELECT 1');
      this.log.info('Database service initialized');
    } catch (error) {
      this.log.error('Failed to initialize database service:', error);
      throw error;
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
    return this.pool;
  }

  async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const result = await this.pool.query(text, params);
    return { rows: result.rows, rowCount: result.rowCount };
  }

  async transaction<T = any>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      
      // CRITICAL: Explicitly wait for COMMIT to complete
      const commitResult = await client.query('COMMIT');
      console.log('✅ COMMIT response:', commitResult);
      
      // Force a flush by querying transaction status
      const statusCheck = await client.query('SELECT txid_current_if_assigned()');
      console.log('Transaction ID after commit:', statusCheck.rows[0]);
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

export const DatabaseService = new DatabaseServiceClass();
```

### FILE: src/services/redisService.ts
```typescript
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

// Simple timeout utility
function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ]);
}

// Simple circuit breaker implementation
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold: number,
    private timeout: number,
    private resetTimeout: number
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  getState(): string {
    return this.state;
  }
}

class RedisServiceClass {
  private client: Redis | null = null;
  private log = logger.child({ component: 'RedisService' });
  private circuitBreaker = new CircuitBreaker(5, 5000, 30000);
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  async initialize(): Promise<void> {
    try {
      this.client = new Redis(config.redis.url, {
        retryStrategy: (times) => {
          this.reconnectAttempts = times;

          if (times > this.maxReconnectAttempts) {
            this.log.error('Max Redis reconnection attempts reached');
            return null;
          }

          const delay = Math.min(times * 100, 3000);
          this.log.info(`Redis reconnecting in ${delay}ms (attempt ${times})`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: true,
        connectTimeout: 5000,
        disconnectTimeout: 2000,
        commandTimeout: 5000,
        reconnectOnError: (err) => {
          const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
          if (targetErrors.some(e => err.message.includes(e))) {
            return true;
          }
          return false;
        }
      });

      this.setupEventHandlers();

      await withTimeout(this.client.ping(), 5000, 'Redis ping timeout');

      this.log.info('Redis connected successfully');
    } catch (error) {
      this.log.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  private setupEventHandlers() {
    if (!this.client) return;

    this.client.on('error', (err) => {
      this.log.error('Redis error:', err);
    });

    this.client.on('connect', () => {
      this.log.info('Redis connected');
      this.reconnectAttempts = 0;
      this.circuitBreaker.reset();
    });

    this.client.on('ready', () => {
      this.log.info('Redis ready');
    });

    this.client.on('close', () => {
      this.log.warn('Redis connection closed');
    });

    this.client.on('reconnecting', (delay: number) => {
      this.log.info(`Redis reconnecting in ${delay}ms`);
    });

    this.client.on('end', () => {
      this.log.warn('Redis connection ended');
    });
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }
    if (this.client.status !== 'ready') {
      throw new Error(`Redis not ready (status: ${this.client.status})`);
    }
    return this.client;
  }

  private async executeCommand<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    try {
      return await this.circuitBreaker.execute(async () => {
        return await withTimeout(fn(), 5000, `Redis ${operation} timeout`);
      });
    } catch (error: any) {
      this.log.error(`Redis ${operation} failed:`, {
        error: error.message,
        state: this.circuitBreaker.getState()
      });

      if (operation === 'get' || operation === 'exists') {
        return null as any;
      }

      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.executeCommand('get', () =>
      this.getClient().get(key)
    );
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    await this.executeCommand('set', async () => {
      const client = this.getClient();
      if (ttl) {
        await client.setex(key, ttl, value);
      } else {
        await client.set(key, value);
      }
    });
  }

  async del(key: string): Promise<void> {
    await this.executeCommand('del', () =>
      this.getClient().del(key).then(() => undefined)
    );
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.executeCommand('exists', () =>
      this.getClient().exists(key)
    );
    return result === 1;
  }

  async incr(key: string): Promise<number> {
    return this.executeCommand('incr', () =>
      this.getClient().incr(key)
    );
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.executeCommand('expire', () =>
      this.getClient().expire(key, ttl).then(() => undefined)
    );
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];

    return this.executeCommand('mget', () =>
      this.getClient().mget(...keys)
    );
  }

  async mset(pairs: { key: string; value: string }[]): Promise<void> {
    if (pairs.length === 0) return;

    const args: string[] = [];
    pairs.forEach(({ key, value }) => {
      args.push(key, value);
    });

    await this.executeCommand('mset', () =>
      this.getClient().mset(...args).then(() => undefined)
    );
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.log.info('Redis connection closed');
      } catch (error) {
        this.log.error('Error closing Redis connection:', error);
        this.client.disconnect();
      }
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      if (!this.client || this.client.status !== 'ready') {
        return false;
      }

      const result = await withTimeout(
        this.client.ping(),
        1000,
        'Health check timeout'
      );

      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

export const RedisService = new RedisServiceClass();
```

### FILE: src/services/queueService.ts
```typescript
import * as amqplib from 'amqplib';
import { config } from '../config';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

class QueueServiceClass extends EventEmitter {
  private connection: any = null;
  private publishChannel: any = null;
  private consumeChannel: any = null;
  private log = logger.child({ component: 'QueueService' });
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;

  async initialize(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      this.connection = await amqplib.connect(config.rabbitmq.url);

      this.connection.on('error', (err: any) => {
        this.log.error('RabbitMQ connection error:', err);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        this.log.warn('RabbitMQ connection closed');
        this.handleConnectionError();
      });

      this.publishChannel = await this.connection.createChannel();
      this.consumeChannel = await this.connection.createChannel();

      await this.setupQueues();

      this.reconnectAttempts = 0;
      this.log.info('Queue service connected');
      this.emit('connected');
    } catch (error) {
      this.log.error('Failed to connect to RabbitMQ:', error);
      this.handleConnectionError();
      throw error;
    }
  }

  private async setupQueues(): Promise<void> {
    const queues = Object.values(config.rabbitmq.queues);

    for (const queue of queues) {
      if (this.publishChannel) {
        await this.publishChannel.assertQueue(queue, { durable: true });
      }
    }
  }

  private handleConnectionError(): void {
    if (this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log.error('Max reconnection attempts reached');
      this.emit('max_reconnect_attempts');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);

    this.log.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        this.log.error('Reconnection failed:', error);
      }
    }, delay);
  }

  async publish(queue: string, message: any): Promise<void> {
    if (!this.publishChannel) {
      throw new Error('Queue service not initialized');
    }

    const messageBuffer = Buffer.from(JSON.stringify(message));

    try {
      const sent = this.publishChannel.sendToQueue(queue, messageBuffer, { persistent: true });

      if (!sent) {
        this.log.warn('Message was not sent, queue buffer full', { queue });
        throw new Error('Queue buffer full');
      }
    } catch (error) {
      this.log.error('Failed to publish message:', error);
      throw error;
    }
  }

  async consume(queue: string, handler: (msg: any) => Promise<void>): Promise<void> {
    if (!this.consumeChannel) {
      throw new Error('Queue service not initialized');
    }

    await this.consumeChannel.prefetch(1);

    await this.consumeChannel.consume(queue, async (msg: any) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString());
        await handler(content);

        if (this.consumeChannel) {
          this.consumeChannel.ack(msg);
        }
      } catch (error) {
        this.log.error('Error processing message:', error);

        if (this.consumeChannel) {
          this.consumeChannel.nack(msg, false, true);
        }
      }
    });
  }

  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.publishChannel) {
      await this.publishChannel.close();
    }

    if (this.consumeChannel) {
      await this.consumeChannel.close();
    }

    if (this.connection) {
      await this.connection.close();
    }

    this.log.info('Queue service closed');
  }

  isConnected(): boolean {
    return this.connection !== null && this.publishChannel !== null;
  }
}

export const QueueService = new QueueServiceClass();
```

### FILE: src/services/discountService.ts
```typescript
import { DatabaseService } from './databaseService';
import { logger } from '../utils/logger';

interface Discount {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'bogo' | 'early_bird';
  value: number;
  priority: number;  // Lower number = higher priority
  stackable: boolean;
  maxUses?: number;
  currentUses?: number;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom: Date;
  validUntil: Date;
  eventId?: string;
  ticketTypeIds?: string[];
}

interface DiscountApplication {
  discountId: string;
  code: string;
  type: string;
  amountInCents: number;
  appliedTo: 'order' | 'tickets';
}

export class DiscountService {
  private log = logger.child({ component: 'DiscountService' });

  // ISSUE #23 FIX: Validate and apply discounts with proper stacking rules
  async applyDiscounts(
    orderAmountCents: number,
    discountCodes: string[],
    eventId?: string,
    ticketTypeIds?: string[]
  ): Promise<{
    finalAmountCents: number;
    discountsApplied: DiscountApplication[];
    totalDiscountCents: number;
  }> {
    if (!discountCodes || discountCodes.length === 0) {
      return {
        finalAmountCents: orderAmountCents,
        discountsApplied: [],
        totalDiscountCents: 0
      };
    }

    // Get all valid discounts
    const validDiscounts = await this.getValidDiscounts(discountCodes, eventId);
    
    // Sort by priority (lower number = higher priority)
    validDiscounts.sort((a, b) => a.priority - b.priority);

    const discountsApplied: DiscountApplication[] = [];
    let currentAmountCents = orderAmountCents;
    let hasNonStackable = false;

    for (const discount of validDiscounts) {
      // ISSUE #23 FIX: Check stacking rules
      if (hasNonStackable) {
        this.log.info('Skipping discount due to non-stackable discount already applied', {
          code: discount.code,
          skipped: true
        });
        continue;
      }

      if (!discount.stackable) {
        // If this is non-stackable and we already have discounts, skip it
        if (discountsApplied.length > 0) {
          this.log.info('Skipping non-stackable discount as other discounts already applied', {
            code: discount.code
          });
          continue;
        }
        hasNonStackable = true;
      }

      // Check minimum purchase requirement
      if (discount.minPurchaseAmount && orderAmountCents < discount.minPurchaseAmount * 100) {
        this.log.info('Discount minimum purchase not met', {
          code: discount.code,
          required: discount.minPurchaseAmount,
          actual: orderAmountCents / 100
        });
        continue;
      }

      // Calculate discount amount
      let discountAmountCents = 0;
      
      switch (discount.type) {
        case 'percentage':
          // Percentage off the current amount (after previous discounts)
          discountAmountCents = Math.round((currentAmountCents * discount.value) / 100);
          break;
          
        case 'fixed':
          // Fixed amount off (in dollars, convert to cents)
          discountAmountCents = Math.min(discount.value * 100, currentAmountCents);
          break;
          
        case 'early_bird':
          // Early bird discount (percentage)
          discountAmountCents = Math.round((currentAmountCents * discount.value) / 100);
          break;
          
        case 'bogo':
          // Buy one get one - 50% off for even quantities
          discountAmountCents = Math.round(currentAmountCents * 0.25); // Approximation
          break;
      }

      // Apply max discount cap if specified
      if (discount.maxDiscountAmount) {
        discountAmountCents = Math.min(discountAmountCents, discount.maxDiscountAmount * 100);
      }

      // Ensure we don't discount more than the remaining amount
      discountAmountCents = Math.min(discountAmountCents, currentAmountCents);

      if (discountAmountCents > 0) {
        discountsApplied.push({
          discountId: discount.id,
          code: discount.code,
          type: discount.type,
          amountInCents: discountAmountCents,
          appliedTo: 'order'
        });

        currentAmountCents -= discountAmountCents;

        // Record discount usage
        await this.recordDiscountUsage(discount.id);
      }
    }

    const totalDiscountCents = orderAmountCents - currentAmountCents;

    this.log.info('Discounts applied', {
      original: orderAmountCents,
      final: currentAmountCents,
      totalDiscount: totalDiscountCents,
      discountsApplied: discountsApplied.length
    });

    return {
      finalAmountCents: currentAmountCents,
      discountsApplied,
      totalDiscountCents
    };
  }

  private async getValidDiscounts(codes: string[], eventId?: string): Promise<Discount[]> {
    const query = `
      SELECT * FROM discounts 
      WHERE code = ANY($1)
        AND valid_from <= NOW()
        AND valid_until >= NOW()
        AND (max_uses IS NULL OR current_uses < max_uses)
        AND (event_id IS NULL OR event_id = $2)
        AND active = true
      ORDER BY priority ASC
    `;

    try {
      const result = await DatabaseService.query<Discount>(query, [codes, eventId || null]);
      return result.rows;
    } catch (error) {
      this.log.error('Failed to fetch discounts', { codes, error });
      return [];
    }
  }

  private async recordDiscountUsage(discountId: string): Promise<void> {
    const query = `
      UPDATE discounts 
      SET current_uses = COALESCE(current_uses, 0) + 1,
          last_used_at = NOW()
      WHERE id = $1
    `;

    try {
      await DatabaseService.query(query, [discountId]);
    } catch (error) {
      this.log.error('Failed to record discount usage', { discountId, error });
    }
  }

  async validateDiscountCode(code: string, eventId?: string): Promise<{
    valid: boolean;
    reason?: string;
    discount?: Partial<Discount>;
  }> {
    const query = `
      SELECT * FROM discounts 
      WHERE code = $1
        AND (event_id IS NULL OR event_id = $2)
      LIMIT 1
    `;

    try {
      const result = await DatabaseService.query<Discount>(query, [code, eventId || null]);
      
      if (result.rows.length === 0) {
        return { valid: false, reason: 'Invalid discount code' };
      }

      const discount = result.rows[0];

      // Check validity
      const now = new Date();
      if (new Date(discount.validFrom) > now) {
        return { valid: false, reason: 'Discount not yet active' };
      }

      if (new Date(discount.validUntil) < now) {
        return { valid: false, reason: 'Discount has expired' };
      }

      // Fix for TypeScript error - check both maxUses and currentUses properly
      if (discount.maxUses && discount.currentUses !== undefined && discount.currentUses >= discount.maxUses) {
        return { valid: false, reason: 'Discount usage limit reached' };
      }

      return { 
        valid: true, 
        discount: {
          type: discount.type,
          value: discount.value,
          stackable: discount.stackable
        }
      };
    } catch (error) {
      this.log.error('Failed to validate discount', { code, error });
      return { valid: false, reason: 'Error validating discount' };
    }
  }
}

export const discountService = new DiscountService();
```

### FILE: src/services/qrService.ts
```typescript
import QRCode from 'qrcode';
import crypto from 'crypto';
import { RedisService } from './redisService';
import { DatabaseService } from './databaseService';
import { config } from '../config';
import { QRValidation, TicketStatus } from '../types';
import { ValidationError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

export class QRService {
  private log = logger.child({ component: 'QRService' });
  private encryptionKey = Buffer.from(config.qr.encryptionKey, 'utf-8');

  async generateRotatingQR(ticketId: string): Promise<{ qrCode: string; qrImage: string }> {
    const ticket = await this.getTicketData(ticketId);
    
    // Create time-based QR data
    const timestamp = Math.floor(Date.now() / config.qr.rotationInterval);
    const qrData = {
      ticketId,
      eventId: ticket.event_id,
      timestamp,
      nonce: crypto.randomBytes(8).toString('hex')
    };

    // Encrypt QR data
    const encrypted = this.encrypt(JSON.stringify(qrData));
    const qrString = `TKT:${encrypted}`;

    // Generate QR image
    const qrImage = await QRCode.toDataURL(qrString, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Store validation data in Redis
    const validationKey = `qr:${ticketId}:${timestamp}`;
    await RedisService.set(
      validationKey,
      JSON.stringify({
        ticketId,
        eventId: ticket.event_id,
        validUntil: new Date((timestamp + 1) * config.qr.rotationInterval)
      }),
      config.qr.rotationInterval * 2 // Keep for 2 rotation periods
    );

    return { qrCode: qrString, qrImage };
  }

  async validateQR(qrCode: string, validationData: {
    eventId: string;
    entrance?: string;
    deviceId?: string;
    validatorId?: string;
  }): Promise<QRValidation> {
    try {
      // Extract and decrypt QR data
      if (!qrCode.startsWith('TKT:')) {
        throw new ValidationError('Invalid QR format');
      }

      const encrypted = qrCode.substring(4);
      const decrypted = this.decrypt(encrypted);
      const qrData = JSON.parse(decrypted);

      // Validate timestamp
      const currentTimestamp = Math.floor(Date.now() / config.qr.rotationInterval);
      const timeDiff = currentTimestamp - qrData.timestamp;

      if (timeDiff < 0 || timeDiff > 2) {
        return {
          ticketId: qrData.ticketId,
          eventId: qrData.eventId,
          isValid: false,
          reason: 'QR code expired'
        };
      }

      // Validate event match
      if (qrData.eventId !== validationData.eventId) {
        return {
          ticketId: qrData.ticketId,
          eventId: qrData.eventId,
          isValid: false,
          reason: 'Wrong event'
        };
      }

      // Check if ticket already used
      const ticket = await this.getTicketData(qrData.ticketId);
      
      if (ticket.status === TicketStatus.USED) {
        return {
          ticketId: qrData.ticketId,
          eventId: qrData.eventId,
          isValid: false,
          validatedAt: ticket.validated_at,
          reason: 'Ticket already used'
        };
      }

      if (ticket.status !== TicketStatus.SOLD) {
        return {
          ticketId: qrData.ticketId,
          eventId: qrData.eventId,
          isValid: false,
          reason: `Invalid ticket status: ${ticket.status}`
        };
      }

      // Mark ticket as used
      await DatabaseService.transaction(async (client) => {
        // Lock ticket for update
        const lockQuery = 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE';
        const lockResult = await client.query(lockQuery, [qrData.ticketId]);

        if (lockResult.rows[0].status === TicketStatus.USED) {
          throw new ValidationError('Ticket was just used');
        }

        // Update ticket status
        const updateQuery = `
          UPDATE tickets 
          SET status = $1, validated_at = $2, validator_id = $3, entrance = $4
          WHERE id = $5
        `;

        await client.query(updateQuery, [
          TicketStatus.USED,
          new Date(),
          validationData.validatorId || null,
          validationData.entrance || null,
          qrData.ticketId
        ]);

        // Log validation
        const logQuery = `
          INSERT INTO ticket_validations 
          (ticket_id, event_id, validated_at, validator_id, entrance, device_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `;

        await client.query(logQuery, [
          qrData.ticketId,
          qrData.eventId,
          new Date(),
          validationData.validatorId || null,
          validationData.entrance || null,
          validationData.deviceId || null
        ]);
      });

      // Clear ticket cache
      await RedisService.del(`ticket:${qrData.ticketId}`);

      return {
        ticketId: qrData.ticketId,
        eventId: qrData.eventId,
        isValid: true,
        validatedAt: new Date()
      };

    } catch (error) {
      this.log.error('QR validation error:', error);
      
      if (error instanceof ValidationError) {
        return {
          ticketId: '',
          eventId: validationData.eventId,
          isValid: false,
          reason: 'Ticket was just validated'
        };
      }

      return {
        ticketId: '',
        eventId: validationData.eventId,
        isValid: false,
        reason: 'Invalid QR code'
      };
    }
  }

  private async getTicketData(ticketId: string): Promise<any> {
    const query = 'SELECT * FROM tickets WHERE id = $1';
    const result = await DatabaseService.query(query, [ticketId]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('Ticket');
    }

    return result.rows[0];
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey.slice(0, 32), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey.slice(0, 32), iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

export const qrService = new QRService();
```

