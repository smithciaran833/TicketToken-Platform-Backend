import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IMint {
  id?: string;
  ticket_id: string;
  nft_id?: string;
  status: 'pending' | 'minting' | 'completed' | 'failed';
  transaction_hash?: string;
  blockchain: string;
  error?: string;
  retry_count?: number;
  created_at?: Date;
  completed_at?: Date;
}

export class MintModel {
  private db: Knex;
  private tableName = 'nft_mints';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IMint): Promise<IMint> {
    const [mint] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return mint;
  }

  async findById(id: string): Promise<IMint | null> {
    const mint = await this.db(this.tableName)
      .where({ id })
      .first();
    return mint || null;
  }

  async findPending(limit = 10): Promise<IMint[]> {
    return this.db(this.tableName)
      .where({ status: 'pending' })
      .where('retry_count', '<', 3)
      .orderBy('created_at', 'asc')
      .limit(limit);
  }

  async update(id: string, data: Partial<IMint>): Promise<IMint | null> {
    const [mint] = await this.db(this.tableName)
      .where({ id })
      .update(data)
      .returning('*');
    return mint || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default MintModel;
