import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const log = logger.child({ component: 'MintWorker' });

interface MintJob {
  orderId: string;
  userId: string;
  eventId: string;
  quantity: number;
  ticketTypeId?: string;
  tenantId?: string;
  timestamp: string;
}

class MintWorkerClass {
  async processMintJob(job: MintJob) {
    log.info('Processing mint job', job);

    const db = DatabaseService.getPool();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Get order details including tenant_id
      const orderResult = await client.query(
        `SELECT o.tenant_id, o.event_id, oi.ticket_type_id
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE o.id = $1
         LIMIT 1`,
        [job.orderId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const orderData = orderResult.rows[0];
      const tenantId = job.tenantId || orderData.tenant_id;
      const ticketTypeId = job.ticketTypeId || orderData.ticket_type_id;
      const eventId = job.eventId || orderData.event_id;

      if (!ticketTypeId) {
        throw new Error('No ticket type found for order');
      }

      if (!tenantId) {
        throw new Error('No tenant found for order');
      }

      const tickets = [];
      for (let i = 0; i < job.quantity; i++) {
        const ticketId = uuidv4();
        const ticketNumber = `TKT-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const qrCode = `QR-${ticketNumber}`;

        const nftMint = await this.mintNFT(ticketId, job.userId, eventId);

        // Insert ticket using actual schema columns
        // Store NFT data in metadata JSONB field
        await client.query(
          `INSERT INTO tickets (
            id, tenant_id, user_id, event_id, ticket_type_id,
            ticket_number, qr_code, status, price_cents,
            is_nft, is_transferable, transfer_count,
            metadata, purchased_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW(), NOW())`,
          [
            ticketId,
            tenantId,
            job.userId,
            eventId,
            ticketTypeId,
            ticketNumber,
            qrCode,
            'active',  // Valid status from check constraint
            0,
            true,      // is_nft = true for minted tickets
            true,
            0,
            JSON.stringify({
              nft_mint_address: nftMint.address,
              nft_transaction_hash: nftMint.signature,
              minted_at: new Date().toISOString(),
              order_id: job.orderId
            })
          ]
        );

        tickets.push({
          id: ticketId,
          nftAddress: nftMint.address,
          signature: nftMint.signature
        });

        log.info('Ticket minted', { ticketId, nftAddress: nftMint.address });
      }

      await client.query(
        `UPDATE orders SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
        [job.orderId]
      );

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

      await this.handleMintFailure(job.orderId, (error as Error).message);

      throw error;
    } finally {
      client.release();
    }
  }

  private async mintNFT(_ticketId: string, _userId: string, _eventId: string) {
    const mockAddress = `mock_nft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const mockSignature = `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await new Promise(resolve => setTimeout(resolve, 100));

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
