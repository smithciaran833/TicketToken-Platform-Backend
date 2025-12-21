import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface ITicket {
  id?: string;
  tenant_id: string;
  event_id: string;
  ticket_type_id: string;
  user_id?: string;
  original_purchaser_id?: string;
  reservation_id?: string;
  ticket_number?: string;
  qr_code?: string;
  price_cents?: number;
  price?: number;
  face_value?: number;
  section?: string;
  row?: string;
  seat?: string;
  status: 'active' | 'used' | 'cancelled' | 'transferred';
  is_validated?: boolean;
  is_transferable?: boolean;
  transfer_count?: number;
  is_nft?: boolean;
  payment_id?: string;
  purchased_at?: Date;
  purchase_date?: Date;
  validated_at?: Date;
  validated_by?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;
}

export class TicketModel {
  constructor(private pool: Pool) {}

  private readonly UPDATABLE_FIELDS = [
    'user_id',
    'status',
    'price_cents',
    'price',
    'section',
    'row',
    'seat',
    'metadata',
    'is_validated',
    'validated_at',
    'validated_by',
    'is_transferable',
    'transfer_count',
    'is_nft',
    'payment_id'
  ];

  private generateTicketNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = uuidv4().split('-')[0].toUpperCase();
    return `TKT-${timestamp}-${random}`;
  }

  private generateQRCode(): string {
    return `QR-${uuidv4()}`;
  }

  async create(data: ITicket): Promise<ITicket> {
    const ticketNumber = data.ticket_number || this.generateTicketNumber();
    const qrCode = data.qr_code || this.generateQRCode();
    
    const query = `
      INSERT INTO tickets (
        tenant_id, event_id, ticket_type_id, user_id,
        ticket_number, qr_code, status, price_cents, price,
        section, row, seat, metadata,
        is_validated, is_transferable, transfer_count, is_nft
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;
    
    const values = [
      data.tenant_id,
      data.event_id,
      data.ticket_type_id,
      data.user_id || null,
      ticketNumber,
      qrCode,
      data.status || 'active',
      data.price_cents || null,
      data.price || null,
      data.section || null,
      data.row || null,
      data.seat || null,
      data.metadata || {},
      data.is_validated !== undefined ? data.is_validated : false,
      data.is_transferable !== undefined ? data.is_transferable : true,
      data.transfer_count || 0,
      data.is_nft !== undefined ? data.is_nft : false
    ];

    const result = await this.pool.query(query, values);
    return this.mapRowToTicket(result.rows[0]);
  }

  async findById(id: string): Promise<ITicket | null> {
    const query = 'SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] ? this.mapRowToTicket(result.rows[0]) : null;
  }

  async findByEventId(eventId: string): Promise<ITicket[]> {
    const query = 'SELECT * FROM tickets WHERE event_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC';
    const result = await this.pool.query(query, [eventId]);
    return result.rows.map(row => this.mapRowToTicket(row));
  }

  async findByUserId(userId: string): Promise<ITicket[]> {
    const query = 'SELECT * FROM tickets WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC';
    const result = await this.pool.query(query, [userId]);
    return result.rows.map(row => this.mapRowToTicket(row));
  }

  async findByTicketNumber(ticketNumber: string): Promise<ITicket | null> {
    const query = 'SELECT * FROM tickets WHERE ticket_number = $1 AND deleted_at IS NULL';
    const result = await this.pool.query(query, [ticketNumber]);
    return result.rows[0] ? this.mapRowToTicket(result.rows[0]) : null;
  }

  async update(id: string, data: Partial<ITicket>): Promise<ITicket | null> {
    const validFields: string[] = [];
    const validValues: any[] = [];

    Object.keys(data).forEach(key => {
      if (this.UPDATABLE_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push((data as any)[key]);
      }
    });

    if (validFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const query = `UPDATE tickets SET ${fields}, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`;
    const values = [id, ...validValues];

    const result = await this.pool.query(query, values);
    return result.rows[0] ? this.mapRowToTicket(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'UPDATE tickets SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async hardDelete(id: string): Promise<boolean> {
    const query = 'DELETE FROM tickets WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  private mapRowToTicket(row: any): ITicket {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      event_id: row.event_id,
      ticket_type_id: row.ticket_type_id,
      user_id: row.user_id,
      original_purchaser_id: row.original_purchaser_id,
      reservation_id: row.reservation_id,
      ticket_number: row.ticket_number,
      qr_code: row.qr_code,
      price_cents: row.price_cents ? Number(row.price_cents) : undefined,
      price: row.price ? Number(row.price) : undefined,
      face_value: row.face_value ? Number(row.face_value) : undefined,
      section: row.section,
      row: row.row,
      seat: row.seat,
      status: row.status,
      is_validated: row.is_validated,
      is_transferable: row.is_transferable,
      transfer_count: row.transfer_count,
      is_nft: row.is_nft,
      payment_id: row.payment_id,
      purchased_at: row.purchased_at,
      purchase_date: row.purchase_date,
      validated_at: row.validated_at,
      validated_by: row.validated_by,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at
    };
  }
}

export default TicketModel;
