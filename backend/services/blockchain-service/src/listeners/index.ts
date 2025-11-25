import { Connection } from '@solana/web3.js';
import { Pool } from 'pg';
import config from '../config';
import ProgramEventListener from './programListener';
import TransactionMonitor from './transactionMonitor';
import { logger } from '../utils/logger';

interface Listeners {
  program?: ProgramEventListener;
  transaction?: TransactionMonitor;
}

class ListenerManager {
  private connection: Connection | null;
  private db: Pool | null;
  private listeners: Listeners;
  private initialized: boolean;

  constructor() {
    this.connection = null;
    this.db = null;
    this.listeners = {};
    this.initialized = false;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing event listeners...');

    // Setup connection
    this.connection = new Connection(config.solana.rpcUrl, {
      commitment: config.solana.commitment as any,
      wsEndpoint: config.solana.wsUrl
    });

    // Setup database
    this.db = new Pool(config.database);

    if (config.solana.programId) {
      // Create listeners
      this.listeners.program = new ProgramEventListener(
        this.connection,
        this.db,
        config.solana.programId
      );

      this.listeners.transaction = new TransactionMonitor(
        this.connection,
        this.db
      );

      // Start all listeners
      await this.listeners.program.start();
      await this.listeners.transaction.start();
      
      logger.info('Event listeners started', {
        programId: config.solana.programId,
        rpcUrl: config.solana.rpcUrl
      });
    } else {
      logger.warn('No program ID configured - listeners not started');
    }

    this.initialized = true;
    logger.info('Event listener system initialized');
  }

  getProgramListener(): ProgramEventListener | undefined {
    return this.listeners.program;
  }

  getTransactionMonitor(): TransactionMonitor | undefined {
    return this.listeners.transaction;
  }

  async monitorTransaction(signature: string, metadata: any): Promise<void> {
    if (!this.initialized) {
      throw new Error('Listeners not initialized');
    }
    if (this.listeners.transaction) {
      await this.listeners.transaction.monitorTransaction(signature, metadata);
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down event listeners...');

    for (const listener of Object.values(this.listeners)) {
      if (listener) {
        await listener.stop();
      }
    }

    if (this.db) {
      await this.db.end();
    }

    this.initialized = false;
    logger.info('Event listeners shut down');
  }
}

export default new ListenerManager();
