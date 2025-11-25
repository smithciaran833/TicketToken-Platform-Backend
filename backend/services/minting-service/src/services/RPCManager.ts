import { Connection, ComputeBudgetProgram, Transaction, Signer } from '@solana/web3.js';
import logger from '../utils/logger';

export class RPCManager {
  private endpoints: string[];
  private currentEndpoint: number;
  private connections: Connection[];
  private maxRetries: number;
  private baseDelay: number;

  constructor() {
    this.endpoints = [
      'https://api.devnet.solana.com',
      'https://devnet.helius-rpc.com/?api-key=YOUR_KEY', // Add your key
      'https://devnet.genesysgo.net/'
    ];
    this.currentEndpoint = 0;
    this.connections = [];
    this.maxRetries = 3;
    this.baseDelay = 1000;
  }

  async initialize(): Promise<void> {
    this.connections = this.endpoints.map(endpoint =>
      new Connection(endpoint, 'confirmed')
    );
    logger.info(`Initialized ${this.connections.length} RPC endpoints`);
  }

  async getConnection(): Promise<Connection> {
    return this.connections[this.currentEndpoint];
  }

  async sendTransactionWithRetry(transaction: Transaction, signers: Signer[]): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const connection = await this.getConnection();

        // Add compute budget
        transaction.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
        );

        const signature = await connection.sendTransaction(
          transaction,
          signers,
          { skipPreflight: false, preflightCommitment: 'confirmed' }
        );

        await connection.confirmTransaction(signature, 'confirmed');

        logger.info(`✅ Transaction confirmed: ${signature}`);
        return signature;

      } catch (error) {
        lastError = error as Error;

        // Check for rate limiting
        if (lastError.message?.includes('429') || lastError.message?.includes('Too Many Requests')) {
          logger.warn(`Rate limited on endpoint ${this.currentEndpoint}, switching...`);
          this.currentEndpoint = (this.currentEndpoint + 1) % this.endpoints.length;
        }

        // Exponential backoff
        const delay = this.baseDelay * Math.pow(2, attempt - 1);
        logger.info(`Retry ${attempt}/${this.maxRetries} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Transaction failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }
}
