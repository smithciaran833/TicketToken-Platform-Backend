import { Pool } from 'pg';

export interface ITransfer {
  id?: string;
  ticket_id: string;
  from_user_id: string;
  to_user_id: string;
  status: 'pending' | 'completed' | 'cancelled';
  transfer_code?: string;
  expires_at?: Date;
  completed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class TransferModel {
  constructor(private pool: Pool) {}

  async create(data: ITransfer): Promise<ITransfer> {
    const query = `
      INSERT INTO transfers (ticket_id, from_user_id, to_user_id, status, transfer_code, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      data.ticket_id, data.from_user_id, data.to_user_id,
      data.status || 'pending', data.transfer_code, data.expires_at
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<ITransfer | null> {
    const query = 'SELECT * FROM transfers WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByTransferCode(code: string): Promise<ITransfer | null> {
    const query = 'SELECT * FROM transfers WHERE transfer_code = $1';
    const result = await this.pool.query(query, [code]);
    return result.rows[0] || null;
  }

  async complete(id: string): Promise<boolean> {
    const query = `
      UPDATE transfers 
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `;
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export default TransferModel;
