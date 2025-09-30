import { Pool } from 'pg';

export interface ITicket {
  id?: string;
  event_id: string;
  ticket_type_id: string;
  user_id?: string;
  status: 'available' | 'reserved' | 'sold' | 'transferred';
  price: number;
  seat_number?: string;
  barcode?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class TicketModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'event_id',
    'ticket_type_id',
    'user_id',
    'status',
    'price',
    'seat_number',
    'barcode',
    'metadata'
  ];

  async create(data: ITicket): Promise<ITicket> {
    const query = `
      INSERT INTO tickets (event_id, ticket_type_id, user_id, status, price, seat_number, barcode, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const values = [
      data.event_id, data.ticket_type_id, data.user_id,
      data.status || 'available', data.price, data.seat_number,
      data.barcode, data.metadata || {}
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<ITicket | null> {
    const query = 'SELECT * FROM tickets WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByEventId(eventId: string): Promise<ITicket[]> {
    const query = 'SELECT * FROM tickets WHERE event_id = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [eventId]);
    return result.rows;
  }

  async update(id: string, data: Partial<ITicket>): Promise<ITicket | null> {
    // SECURITY FIX: Validate fields against whitelist
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
    const query = `UPDATE tickets SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const values = [id, ...validValues];
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM tickets WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export default TicketModel;
