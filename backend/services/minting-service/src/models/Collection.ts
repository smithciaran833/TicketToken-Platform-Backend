import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface ICollection {
  id?: string;
  name: string;
  symbol: string;
  contract_address: string;
  blockchain: string;
  max_supply?: number;
  current_supply?: number;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class CollectionModel {
  private db: Knex;
  private tableName = 'collections';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: ICollection): Promise<ICollection> {
    const [collection] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return collection;
  }

  async findById(id: string): Promise<ICollection | null> {
    const collection = await this.db(this.tableName)
      .where({ id })
      .first();
    return collection || null;
  }

  async findByContract(contractAddress: string): Promise<ICollection | null> {
    return this.db(this.tableName)
      .where({ contract_address: contractAddress })
      .first();
  }

  async update(id: string, data: Partial<ICollection>): Promise<ICollection | null> {
    const [collection] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return collection || null;
  }

  async incrementSupply(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .increment('current_supply', 1);
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default CollectionModel;
