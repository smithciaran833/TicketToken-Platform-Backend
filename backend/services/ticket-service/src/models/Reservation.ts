import { Pool } from 'pg';

export interface IReservation {
  id?: string;
  tenant_id?: string;
  event_id: string;
  ticket_type_id: string;
  user_id: string;
  quantity: number;
  total_quantity: number;
  tickets: Array<{ ticketTypeId: string; quantity: number }> | string;
  type_name?: string;
  status: 'pending' | 'confirmed' | 'expired' | 'cancelled';
  expires_at: Date;
  released_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class ReservationModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'user_id',
    'event_id',
    'ticket_type_id',
    'quantity',
    'total_quantity',
    'tickets',
    'type_name',
    'expires_at',
    'status',
    'released_at'
  ];

  async create(data: IReservation): Promise<IReservation> {
    const query = `
      INSERT INTO reservations (
        tenant_id, event_id, ticket_type_id, user_id, 
        quantity, total_quantity, tickets, type_name,
        expires_at, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const ticketsJson = typeof data.tickets === 'string' ? data.tickets : JSON.stringify(data.tickets);
    const values = [
      data.tenant_id,
      data.event_id,
      data.ticket_type_id,
      data.user_id,
      data.quantity,
      data.total_quantity,
      ticketsJson,
      data.type_name,
      data.expires_at,
      data.status || 'pending'
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<IReservation | null> {
    const query = 'SELECT * FROM reservations WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findActive(userId: string): Promise<IReservation[]> {
    const query = `
      SELECT * FROM reservations
      WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  async update(id: string, data: Partial<IReservation>): Promise<IReservation | null> {
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
    const query = `UPDATE reservations SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const values = [id, ...validValues];
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async expireOldReservations(): Promise<number> {
    const query = `
      UPDATE reservations
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'active' AND expires_at < NOW()
    `;
    const result = await this.pool.query(query);
    return result.rowCount ?? 0;
  }
}

export default ReservationModel;
