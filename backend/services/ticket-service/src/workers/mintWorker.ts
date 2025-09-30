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
