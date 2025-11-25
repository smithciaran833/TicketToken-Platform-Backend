import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'MintWorker' });

interface MintJob {
  orderId: string;
  userId: string;
  eventId: string;
  quantity: number;
  ticketTypeId?: string;
  timestamp: string;
}

class MintWorkerClass {
  async processMintJob(job: MintJob) {
    log.info('Processing mint job', job);

    const db = DatabaseService.getPool();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      let ticketTypeId = job.ticketTypeId;

      if (!ticketTypeId) {
        const orderResult = await client.query(
          `SELECT oi.ticket_type_id
           FROM order_items oi
           WHERE oi.order_id = $1
           LIMIT 1`,
          [job.orderId]
        );

        if (orderResult.rows.length > 0) {
          ticketTypeId = orderResult.rows[0].ticket_type_id;
        } else {
          throw new Error('No ticket type found for order');
        }
      }

      const tickets = [];
      for (let i = 0; i < job.quantity; i++) {
        const ticketId = uuidv4();

        const nftMint = await this.mintNFT(ticketId, job.userId, job.eventId);

        await client.query(
          `INSERT INTO tickets (
            id, order_id, user_id, event_id, ticket_type_id,
            nft_mint_address, nft_transaction_hash,
            status, price_cents, is_transferable, transfer_count, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SOLD', 0, true, 0, NOW())`,
          [ticketId, job.orderId, job.userId, job.eventId, ticketTypeId, nftMint.address, nftMint.signature]
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

    // Random failure disabled for tests
    // if (Math.random() < 0.05) {
    //   throw new Error('Mock mint failure - network timeout');
    // }

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
