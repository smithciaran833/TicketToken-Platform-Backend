import { Connection, TransactionSignature, SignatureStatus, Commitment } from '@solana/web3.js';
import { logger } from '../utils/logger';

interface ConfirmationConfig {
  commitment?: Commitment;
  timeout?: number; // milliseconds
  pollInterval?: number; // milliseconds
}

interface ConfirmationResult {
  confirmed: boolean;
  signature: string;
  slot?: number;
  confirmations?: number;
  err?: any;
}

export class TransactionConfirmationService {
  private connection: Connection;
  private defaultTimeout: number = 60000; // 60 seconds
  private defaultPollInterval: number = 1000; // 1 second
  private defaultCommitment: Commitment = 'finalized';

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Wait for transaction to reach desired confirmation status
   */
  async confirmTransaction(
    signature: TransactionSignature,
    config: ConfirmationConfig = {}
  ): Promise<ConfirmationResult> {
    const commitment = config.commitment || this.defaultCommitment;
    const timeout = config.timeout || this.defaultTimeout;
    const pollInterval = config.pollInterval || this.defaultPollInterval;

    logger.info('Starting transaction confirmation', {
      signature,
      commitment,
      timeout,
      pollInterval
    });

    const startTime = Date.now();

    try {
      // Use built-in confirmation for faster response
      const result = await this.connection.confirmTransaction({
        signature,
        ...(commitment && { commitment })
      } as any, commitment);

      if (result.value.err) {
        logger.error('Transaction failed', {
          signature,
          error: result.value.err
        });

        return {
          confirmed: false,
          signature,
          err: result.value.err
        };
      }

      // Get final status
      const status = await this.getTransactionStatus(signature);

      const duration = Date.now() - startTime;
      logger.info('Transaction confirmed', {
        signature,
        commitment,
        duration,
        slot: status.slot,
        confirmations: status.confirmations
      });

      return {
        confirmed: true,
        signature,
        slot: status.slot,
        confirmations: status.confirmations,
        err: status.err
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      if (duration >= timeout) {
        logger.error('Transaction confirmation timeout', {
          signature,
          timeout,
          duration
        });
        throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
      }

      logger.error('Transaction confirmation error', {
        signature,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get current transaction status
   */
  async getTransactionStatus(signature: TransactionSignature): Promise<SignatureStatus> {
    try {
      const statuses = await this.connection.getSignatureStatuses([signature]);
      const status = statuses.value[0];

      if (!status) {
        throw new Error('Transaction not found');
      }

      return status;
    } catch (error: any) {
      logger.error('Failed to get transaction status', {
        signature,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Wait for multiple transactions to confirm
   */
  async confirmTransactions(
    signatures: TransactionSignature[],
    config: ConfirmationConfig = {}
  ): Promise<ConfirmationResult[]> {
    logger.info('Confirming multiple transactions', {
      count: signatures.length,
      commitment: config.commitment
    });

    try {
      const results = await Promise.all(
        signatures.map(sig => this.confirmTransaction(sig, config))
      );

      const successCount = results.filter(r => r.confirmed).length;
      logger.info('Batch confirmation complete', {
        total: signatures.length,
        confirmed: successCount,
        failed: signatures.length - successCount
      });

      return results;
    } catch (error: any) {
      logger.error('Batch confirmation error', {
        error: error.message,
        count: signatures.length
      });
      throw error;
    }
  }

  /**
   * Poll for transaction confirmation with custom logic
   */
  async pollForConfirmation(
    signature: TransactionSignature,
    commitment: Commitment = 'finalized',
    timeout: number = 60000
  ): Promise<ConfirmationResult> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < timeout) {
      try {
        const status = await this.getTransactionStatus(signature);

        // Check if transaction reached desired commitment
        const isConfirmed = this.checkCommitmentLevel(status, commitment);

        if (isConfirmed) {
          logger.info('Transaction reached desired commitment', {
            signature,
            commitment,
            slot: status.slot,
            confirmations: status.confirmations
          });

          return {
            confirmed: true,
            signature,
            slot: status.slot,
            confirmations: status.confirmations,
            err: status.err
          };
        }

        // Check for errors
        if (status.err) {
          logger.error('Transaction failed during polling', {
            signature,
            error: status.err
          });

          return {
            confirmed: false,
            signature,
            err: status.err
          };
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error: any) {
        logger.warn('Polling attempt failed, retrying...', {
          signature,
          error: error.message
        });
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
  }

  /**
   * Check if transaction meets commitment level
   */
  private checkCommitmentLevel(status: SignatureStatus, commitment: Commitment): boolean {
    if (!status) return false;

    switch (commitment) {
      case 'processed':
        return true; // Any status means processed
      case 'confirmed':
        return (status.confirmations !== null && status.confirmations > 0) || 
               status.confirmationStatus === 'confirmed' ||
               status.confirmationStatus === 'finalized';
      case 'finalized':
        return status.confirmationStatus === 'finalized';
      default:
        return false;
    }
  }

  /**
   * Get transaction with retries
   */
  async getTransaction(
    signature: TransactionSignature,
    maxRetries: number = 3
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const tx = await this.connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0
        });

        if (tx) {
          return tx;
        }

        // Transaction not found yet, wait and retry
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      } catch (error: any) {
        lastError = error;
        logger.warn('Failed to get transaction, retrying...', {
          signature,
          attempt,
          maxRetries,
          error: error.message
        });

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error('Transaction not found after retries');
  }
}

export default TransactionConfirmationService;
