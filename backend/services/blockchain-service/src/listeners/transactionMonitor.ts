import { BaseListener } from './baseListener';
import { Connection } from '@solana/web3.js';
import { Pool } from 'pg';

interface PendingTransaction {
  signature: string;
  metadata: any;
  startTime: number;
  attempts: number;
}

export class TransactionMonitor extends BaseListener {
  private pendingTransactions: Map<string, PendingTransaction>;

  constructor(connection: Connection, db: Pool) {
    super(connection, db);
    this.pendingTransactions = new Map();
  }

  async monitorTransaction(signature: string, metadata: any = {}): Promise<void> {
    console.log(`Monitoring transaction: ${signature}`);

    this.pendingTransactions.set(signature, {
      signature,
      metadata,
      startTime: Date.now(),
      attempts: 0
    });

    // Start monitoring
    await this.checkTransaction(signature);
  }

  async checkTransaction(signature: string): Promise<void> {
    const txData = this.pendingTransactions.get(signature);
    if (!txData) return;

    txData.attempts++;

    try {
      const status = await this.connection.getSignatureStatus(signature);

      if (status.value) {
        const { confirmationStatus, confirmations, err } = status.value;

        console.log(`Transaction ${signature}: ${confirmationStatus} (${confirmations || 0} confirmations)`);

        // Update database
        await this.updateTransactionStatus(signature, confirmationStatus || '', confirmations || 0, err);

        if (confirmationStatus === 'finalized' || err) {
          // Transaction is finalized or failed
          this.pendingTransactions.delete(signature);
          this.emit('transaction:finalized', { signature, status: confirmationStatus, error: err });

          // Update related records
          if (txData.metadata.ticketId) {
            await this.finalizeTicketMinting(txData.metadata.ticketId, !err);
          }
        } else {
          // Check again in a few seconds
          setTimeout(() => this.checkTransaction(signature), 2000);
        }
      } else {
        // Transaction not found yet, retry
        if (txData.attempts < 30) { // Max 1 minute
          setTimeout(() => this.checkTransaction(signature), 2000);
        } else {
          // Timeout
          this.pendingTransactions.delete(signature);
          this.emit('transaction:timeout', { signature });
        }
      }

    } catch (error: any) {
      console.error(`Error checking transaction ${signature}:`, error);

      if (txData.attempts < 30) {
        setTimeout(() => this.checkTransaction(signature), 5000);
      } else {
        this.pendingTransactions.delete(signature);
        await this.handleError(error, { signature, metadata: txData.metadata });
      }
    }
  }

  async updateTransactionStatus(signature: string, status: string, confirmations: number, error: any): Promise<void> {
    await this.db.query(`
      UPDATE blockchain_transactions
      SET status = $1,
          confirmation_count = $2,
          error_message = $3,
          updated_at = NOW()
      WHERE id = $4 OR metadata->>'signature' = $4
    `, [status, confirmations, error ? JSON.stringify(error) : null, signature]);
  }

  async finalizeTicketMinting(ticketId: string, success: boolean): Promise<void> {
    if (success) {
      await this.db.query(`
        UPDATE tickets
        SET on_chain_confirmed = true,
            status = 'SOLD'
        WHERE id = $1
      `, [ticketId]);

      await this.db.query(`
        UPDATE queue_jobs
        SET status = 'CONFIRMED'
        WHERE ticket_id = $1 AND job_type = 'MINT'
      `, [ticketId]);
    } else {
      await this.db.query(`
        UPDATE tickets
        SET is_minted = false,
            status = 'AVAILABLE'
        WHERE id = $1
      `, [ticketId]);

      await this.db.query(`
        UPDATE queue_jobs
        SET status = 'BLOCKCHAIN_FAILED'
        WHERE ticket_id = $1 AND job_type = 'MINT'
      `, [ticketId]);
    }
  }

  async setupSubscriptions(): Promise<void> {
    // No subscriptions needed, we monitor on demand
    console.log('Transaction monitor ready');
  }
}

export default TransactionMonitor;
