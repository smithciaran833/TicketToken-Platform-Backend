import { Pool } from 'pg';

export interface IQRCode {
  id?: string;
  ticket_id: string;
  code: string;
  scanned?: boolean;
  scanned_at?: Date;
  created_at?: Date;
  expires_at?: Date;
}

export class QRCodeModel {
  constructor(private pool: Pool) {}

  async create(data: IQRCode): Promise<IQRCode> {
    const query = `
      INSERT INTO qr_codes (ticket_id, code, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [data.ticket_id, data.code, data.expires_at];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findByCode(code: string): Promise<IQRCode | null> {
    const query = 'SELECT * FROM qr_codes WHERE code = $1';
    const result = await this.pool.query(query, [code]);
    return result.rows[0] || null;
  }

  async markAsScanned(id: string): Promise<boolean> {
    const query = `
      UPDATE qr_codes 
      SET scanned = true, scanned_at = NOW()
      WHERE id = $1 AND scanned = false
    `;
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async isValid(code: string): Promise<boolean> {
    const query = `
      SELECT * FROM qr_codes 
      WHERE code = $1 AND scanned = false 
      AND (expires_at IS NULL OR expires_at > NOW())
    `;
    const result = await this.pool.query(query, [code]);
    return result.rows.length > 0;
  }
}

export default QRCodeModel;
