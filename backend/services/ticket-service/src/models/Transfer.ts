import { Pool } from 'pg';

export interface ITransfer {
  id?: string;
  tenant_id: string;
  ticket_id: string;
  from_user_id?: string;
  to_user_id?: string;
  to_email: string;
  transfer_code?: string;
  transfer_type?: string;
  transfer_method: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed' | 'expired';
  acceptance_code?: string;
  message?: string;
  notes?: string;
  is_gift: boolean;
  price_cents?: number;
  currency?: string;
  expires_at: Date;
  accepted_at?: Date;
  cancelled_at?: Date;
  cancellation_reason?: string;
  transferred_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class TransferModel {
  constructor(private pool: Pool) {}

  private generateAcceptanceCode(): string {
    return Math.random().toString(36).substring(2, 14).toUpperCase();
  }

  private generateTransferCode(): string {
    return `TRF-${Date.now().toString(36).toUpperCase()}`;
  }

  async create(data: ITransfer): Promise<ITransfer> {
    const acceptanceCode = data.acceptance_code || this.generateAcceptanceCode();
    const transferCode = data.transfer_code || this.generateTransferCode();

    const query = `
      INSERT INTO ticket_transfers (
        tenant_id, ticket_id, from_user_id, to_user_id, to_email,
        transfer_code, transfer_type, transfer_method, status,
        acceptance_code, message, notes, is_gift, price_cents,
        currency, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const values = [
      data.tenant_id,
      data.ticket_id,
      data.from_user_id || null,
      data.to_user_id || null,
      data.to_email,
      transferCode,
      data.transfer_type || null,
      data.transfer_method,
      data.status || 'pending',
      acceptanceCode,
      data.message || null,
      data.notes || null,
      data.is_gift ?? true,
      data.price_cents || 0,
      data.currency || 'USD',
      data.expires_at
    ];

    const result = await this.pool.query(query, values);
    return this.mapRowToTransfer(result.rows[0]);
  }

  async findById(id: string): Promise<ITransfer | null> {
    const query = 'SELECT * FROM ticket_transfers WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] ? this.mapRowToTransfer(result.rows[0]) : null;
  }

  async findByTicketId(ticketId: string): Promise<ITransfer[]> {
    const query = 'SELECT * FROM ticket_transfers WHERE ticket_id = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [ticketId]);
    return result.rows.map(row => this.mapRowToTransfer(row));
  }

  async findByTransferCode(code: string): Promise<ITransfer | null> {
    if (!code) return null;
    const query = 'SELECT * FROM ticket_transfers WHERE transfer_code = $1';
    const result = await this.pool.query(query, [code]);
    return result.rows[0] ? this.mapRowToTransfer(result.rows[0]) : null;
  }

  async findByAcceptanceCode(code: string): Promise<ITransfer | null> {
    if (!code) return null;
    const query = 'SELECT * FROM ticket_transfers WHERE acceptance_code = $1';
    const result = await this.pool.query(query, [code]);
    return result.rows[0] ? this.mapRowToTransfer(result.rows[0]) : null;
  }

  async findByFromUserId(userId: string): Promise<ITransfer[]> {
    const query = 'SELECT * FROM ticket_transfers WHERE from_user_id = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [userId]);
    return result.rows.map(row => this.mapRowToTransfer(row));
  }

  async findByToUserId(userId: string): Promise<ITransfer[]> {
    const query = 'SELECT * FROM ticket_transfers WHERE to_user_id = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [userId]);
    return result.rows.map(row => this.mapRowToTransfer(row));
  }

  async findByToEmail(email: string): Promise<ITransfer[]> {
    const query = 'SELECT * FROM ticket_transfers WHERE to_email = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [email]);
    return result.rows.map(row => this.mapRowToTransfer(row));
  }

  async findPendingByTicketId(ticketId: string): Promise<ITransfer[]> {
    const query = `
      SELECT * FROM ticket_transfers 
      WHERE ticket_id = $1 AND status = 'pending' AND expires_at > NOW()
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [ticketId]);
    return result.rows.map(row => this.mapRowToTransfer(row));
  }

  async accept(id: string, toUserId: string): Promise<ITransfer | null> {
    const query = `
      UPDATE ticket_transfers 
      SET status = 'accepted', to_user_id = $2, accepted_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.pool.query(query, [id, toUserId]);
    return result.rows[0] ? this.mapRowToTransfer(result.rows[0]) : null;
  }

  async complete(id: string): Promise<ITransfer | null> {
    const query = `
      UPDATE ticket_transfers 
      SET status = 'completed', transferred_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.pool.query(query, [id]);
    return result.rows[0] ? this.mapRowToTransfer(result.rows[0]) : null;
  }

  async cancel(id: string, reason?: string): Promise<ITransfer | null> {
    const query = `
      UPDATE ticket_transfers 
      SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.pool.query(query, [id, reason || null]);
    return result.rows[0] ? this.mapRowToTransfer(result.rows[0]) : null;
  }

  async reject(id: string): Promise<ITransfer | null> {
    const query = `
      UPDATE ticket_transfers 
      SET status = 'rejected', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.pool.query(query, [id]);
    return result.rows[0] ? this.mapRowToTransfer(result.rows[0]) : null;
  }

  async expire(id: string): Promise<ITransfer | null> {
    const query = `
      UPDATE ticket_transfers 
      SET status = 'expired', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.pool.query(query, [id]);
    return result.rows[0] ? this.mapRowToTransfer(result.rows[0]) : null;
  }

  async expireOldPending(): Promise<number> {
    const query = `
      UPDATE ticket_transfers 
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'pending' AND expires_at < NOW()
    `;
    const result = await this.pool.query(query);
    return result.rowCount ?? 0;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM ticket_transfers WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  private mapRowToTransfer(row: any): ITransfer {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      ticket_id: row.ticket_id,
      from_user_id: row.from_user_id,
      to_user_id: row.to_user_id,
      to_email: row.to_email,
      transfer_code: row.transfer_code,
      transfer_type: row.transfer_type,
      transfer_method: row.transfer_method,
      status: row.status,
      acceptance_code: row.acceptance_code,
      message: row.message,
      notes: row.notes,
      is_gift: row.is_gift,
      price_cents: row.price_cents ? Number(row.price_cents) : 0,
      currency: row.currency,
      expires_at: row.expires_at,
      accepted_at: row.accepted_at,
      cancelled_at: row.cancelled_at,
      cancellation_reason: row.cancellation_reason,
      transferred_at: row.transferred_at,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export default TransferModel;
