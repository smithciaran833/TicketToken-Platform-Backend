import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface INFT {
  id?: string;
  token_id: string;
  contract_address: string;
  owner_address: string;
  metadata_uri?: string;
  metadata?: any;
  blockchain: string;
  created_at?: Date;
  updated_at?: Date;
}

export class NFTModel {
  private db: Knex;
  private tableName = 'nfts';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: INFT): Promise<INFT> {
    const [nft] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return nft;
  }

  async findById(id: string): Promise<INFT | null> {
    const nft = await this.db(this.tableName)
      .where({ id })
      .first();
    return nft || null;
  }

  async findByTokenId(tokenId: string, contractAddress: string): Promise<INFT | null> {
    return this.db(this.tableName)
      .where({ token_id: tokenId, contract_address: contractAddress })
      .first();
  }

  async findByOwner(ownerAddress: string): Promise<INFT[]> {
    return this.db(this.tableName)
      .where({ owner_address: ownerAddress })
      .orderBy('created_at', 'desc');
  }

  async update(id: string, data: Partial<INFT>): Promise<INFT | null> {
    const [nft] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return nft || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default NFTModel;
