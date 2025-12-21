import { Pool } from 'pg';

export interface IQRCodeResult {
  id: string;
  ticket_id: string;
  qr_code: string;
  ticket_number: string;
  status: string;
  is_validated: boolean;
  validated_at?: Date;
  validated_by?: string;
  event_id: string;
  user_id?: string;
}

export class QRCodeModel {
  constructor(private pool: Pool) {}

  private generateQRCode(): string {
    return `QR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  async findByCode(qrCode: string): Promise<IQRCodeResult | null> {
    if (!qrCode) return null;
    
    const query = `
      SELECT id, id as ticket_id, qr_code, ticket_number, status, 
             is_validated, validated_at, validated_by, event_id, user_id
      FROM tickets 
      WHERE qr_code = $1 AND deleted_at IS NULL
    `;
    const result = await this.pool.query(query, [qrCode]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByTicketId(ticketId: string): Promise<IQRCodeResult | null> {
    const query = `
      SELECT id, id as ticket_id, qr_code, ticket_number, status,
             is_validated, validated_at, validated_by, event_id, user_id
      FROM tickets 
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const result = await this.pool.query(query, [ticketId]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async regenerate(ticketId: string): Promise<IQRCodeResult | null> {
    const newQRCode = this.generateQRCode();
    
    const query = `
      UPDATE tickets 
      SET qr_code = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, id as ticket_id, qr_code, ticket_number, status,
                is_validated, validated_at, validated_by, event_id, user_id
    `;
    const result = await this.pool.query(query, [ticketId, newQRCode]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async markAsScanned(qrCode: string, validatedBy?: string): Promise<boolean> {
    const query = `
      UPDATE tickets 
      SET is_validated = true, validated_at = NOW(), validated_by = $2, updated_at = NOW()
      WHERE qr_code = $1 AND is_validated = false AND deleted_at IS NULL
    `;
    const result = await this.pool.query(query, [qrCode, validatedBy || null]);
    return (result.rowCount ?? 0) > 0;
  }

  async isValid(qrCode: string): Promise<boolean> {
    if (!qrCode) return false;
    
    const query = `
      SELECT id FROM tickets 
      WHERE qr_code = $1 
        AND status = 'active' 
        AND is_validated = false 
        AND deleted_at IS NULL
    `;
    const result = await this.pool.query(query, [qrCode]);
    return result.rows.length > 0;
  }

  async getValidationStatus(qrCode: string): Promise<{
    exists: boolean;
    isValid: boolean;
    reason?: string;
  }> {
    if (!qrCode) {
      return { exists: false, isValid: false, reason: 'No QR code provided' };
    }

    const query = `
      SELECT status, is_validated, deleted_at
      FROM tickets 
      WHERE qr_code = $1
    `;
    const result = await this.pool.query(query, [qrCode]);
    
    if (result.rows.length === 0) {
      return { exists: false, isValid: false, reason: 'QR code not found' };
    }

    const ticket = result.rows[0];

    if (ticket.deleted_at) {
      return { exists: true, isValid: false, reason: 'Ticket has been deleted' };
    }

    if (ticket.is_validated) {
      return { exists: true, isValid: false, reason: 'Ticket already scanned' };
    }

    if (ticket.status !== 'active') {
      return { exists: true, isValid: false, reason: `Ticket status is ${ticket.status}` };
    }

    return { exists: true, isValid: true };
  }

  private mapRow(row: any): IQRCodeResult {
    return {
      id: row.id,
      ticket_id: row.ticket_id,
      qr_code: row.qr_code,
      ticket_number: row.ticket_number,
      status: row.status,
      is_validated: row.is_validated,
      validated_at: row.validated_at,
      validated_by: row.validated_by,
      event_id: row.event_id,
      user_id: row.user_id
    };
  }
}

export default QRCodeModel;
