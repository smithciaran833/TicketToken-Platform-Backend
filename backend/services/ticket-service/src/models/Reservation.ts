import { Pool } from 'pg';

export interface IReservation {
  id?: string;
  user_id: string;
  ticket_id: string;
  expires_at: Date;
  status: 'active' | 'expired' | 'completed' | 'cancelled';
  created_at?: Date;
  updated_at?: Date;
}

export class ReservationModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'user_id',
    'ticket_id',
    'expires_at',
    'status'
  ];

  async create(data: IReservation): Promise<IReservation> {
    const query = `
      INSERT INTO reservations (user_id, ticket_id, expires_at, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [data.user_id, data.ticket_id, data.expires_at, data.status || 'active'];
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
