import { EventEmitter } from 'events';
import { Connection } from '@solana/web3.js';
import { Pool } from 'pg';

export class BaseListener extends EventEmitter {
  protected connection: Connection;
  protected db: Pool;
  protected subscriptions: Map<string, number>;
  protected isRunning: boolean;

  constructor(connection: Connection, db: Pool) {
    super();
    this.connection = connection;
    this.db = db;
    this.subscriptions = new Map();
    this.isRunning = false;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Listener already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting ${this.constructor.name}...`);
    await this.setupSubscriptions();
    console.log(`${this.constructor.name} started`);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log(`Stopping ${this.constructor.name}...`);

    // Remove all subscriptions
    for (const [id, subscription] of this.subscriptions) {
      await this.connection.removeAccountChangeListener(subscription);
      this.subscriptions.delete(id);
    }

    this.isRunning = false;
    console.log(`${this.constructor.name} stopped`);
  }

  async setupSubscriptions(): Promise<void> {
    // Override in subclass
    throw new Error('setupSubscriptions must be implemented');
  }

  async handleError(error: Error, context: any): Promise<void> {
    console.error(`Error in ${this.constructor.name}:`, error);
    console.error('Context:', context);

    // Store error in database
    try {
      await this.db.query(`
        INSERT INTO blockchain_events (
          event_type,
          program_id,
          event_data,
          processed,
          created_at
        )
        VALUES ('ERROR', $1, $2, false, NOW())
      `, [context.programId || 'unknown', JSON.stringify({ error: error.message, context })]);
    } catch (dbError) {
      console.error('Failed to log error to database:', dbError);
    }
  }
}

export default BaseListener;
