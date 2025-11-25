import { Pool } from 'pg';
import { OrderNote, OrderNoteType, NoteTemplate } from '../types/admin.types';

export class OrderNotesService {
  constructor(private pool: Pool) {}

  async createNote(
    tenantId: string,
    orderId: string,
    adminUserId: string,
    noteType: OrderNoteType,
    content: string,
    options: {
      isInternal?: boolean;
      isFlagged?: boolean;
      tags?: string[];
      attachments?: any[];
      mentionedUsers?: string[];
    } = {}
  ): Promise<OrderNote> {
    const {
      isInternal = true,
      isFlagged = false,
      tags = [],
      attachments = [],
      mentionedUsers = []
    } = options;

    const result = await this.pool.query(
      `INSERT INTO order_notes 
       (tenant_id, order_id, admin_user_id, note_type, content, is_internal, 
        is_flagged, tags, attachments, mentioned_users)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        tenantId, orderId, adminUserId, noteType, content,
        isInternal, isFlagged, tags, 
        JSON.stringify(attachments), mentionedUsers
      ]
    );

    return this.mapNote(result.rows[0]);
  }

  async updateNote(
    noteId: string,
    tenantId: string,
    updates: {
      content?: string;
      isFlagged?: boolean;
      tags?: string[];
    }
  ): Promise<OrderNote> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (updates.content) {
      fields.push(`content = $${++paramCount}`);
      values.push(updates.content);
    }

    if (updates.isFlagged !== undefined) {
      fields.push(`is_flagged = $${++paramCount}`);
      values.push(updates.isFlagged);
    }

    if (updates.tags) {
      fields.push(`tags = $${++paramCount}`);
      values.push(updates.tags);
    }

    fields.push(`updated_at = NOW()`);
    values.push(noteId, tenantId);

    const result = await this.pool.query(
      `UPDATE order_notes 
       SET ${fields.join(', ')}
       WHERE id = $${paramCount + 1} AND tenant_id = $${paramCount + 2}
       RETURNING *`,
      values
    );

    return this.mapNote(result.rows[0]);
  }

  async deleteNote(noteId: string, tenantId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM order_notes WHERE id = $1 AND tenant_id = $2',
      [noteId, tenantId]
    );
  }

  async getNote(noteId: string, tenantId: string): Promise<OrderNote | null> {
    const result = await this.pool.query(
      'SELECT * FROM order_notes WHERE id = $1 AND tenant_id = $2',
      [noteId, tenantId]
    );

    return result.rows[0] ? this.mapNote(result.rows[0]) : null;
  }

  async getOrderNotes(
    orderId: string,
    tenantId: string,
    includeInternal: boolean = true
  ): Promise<OrderNote[]> {
    let query = 'SELECT * FROM order_notes WHERE order_id = $1 AND tenant_id = $2';
    const params: any[] = [orderId, tenantId];

    if (!includeInternal) {
      query += ' AND is_internal = false';
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.mapNote(row));
  }

  async getFlaggedNotes(tenantId: string, limit: number = 50): Promise<OrderNote[]> {
    const result = await this.pool.query(
      `SELECT * FROM order_notes 
       WHERE tenant_id = $1 AND is_flagged = true
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );

    return result.rows.map(row => this.mapNote(row));
  }

  async searchNotes(
    tenantId: string,
    searchTerm: string,
    filters: {
      noteType?: OrderNoteType;
      isFlagged?: boolean;
      tags?: string[];
    } = {}
  ): Promise<OrderNote[]> {
    let query = `
      SELECT * FROM order_notes 
      WHERE tenant_id = $1 AND content ILIKE $2
    `;
    const params: any[] = [tenantId, `%${searchTerm}%`];
    let paramCount = 2;

    if (filters.noteType) {
      query += ` AND note_type = $${++paramCount}`;
      params.push(filters.noteType);
    }

    if (filters.isFlagged !== undefined) {
      query += ` AND is_flagged = $${++paramCount}`;
      params.push(filters.isFlagged);
    }

    if (filters.tags && filters.tags.length > 0) {
      query += ` AND tags && $${++paramCount}`;
      params.push(filters.tags);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.mapNote(row));
  }

  // Note Templates
  async createTemplate(
    tenantId: string,
    name: string,
    noteType: OrderNoteType,
    contentTemplate: string,
    createdBy: string
  ): Promise<NoteTemplate> {
    const result = await this.pool.query(
      `INSERT INTO note_templates (tenant_id, name, note_type, content_template, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, name, noteType, contentTemplate, createdBy]
    );

    return this.mapTemplate(result.rows[0]);
  }

  async getTemplates(tenantId: string, noteType?: OrderNoteType): Promise<NoteTemplate[]> {
    let query = 'SELECT * FROM note_templates WHERE tenant_id = $1 AND is_active = true';
    const params: any[] = [tenantId];

    if (noteType) {
      query += ' AND note_type = $2';
      params.push(noteType);
    }

    query += ' ORDER BY usage_count DESC, name ASC';

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.mapTemplate(row));
  }

  async incrementTemplateUsage(templateId: string, tenantId: string): Promise<void> {
    await this.pool.query(
      `UPDATE note_templates 
       SET usage_count = usage_count + 1 
       WHERE id = $1 AND tenant_id = $2`,
      [templateId, tenantId]
    );
  }

  private mapNote(row: any): OrderNote {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderId: row.order_id,
      userId: row.user_id,
      adminUserId: row.admin_user_id,
      noteType: row.note_type,
      content: row.content,
      isInternal: row.is_internal,
      isFlagged: row.is_flagged,
      tags: row.tags || [],
      attachments: row.attachments,
      mentionedUsers: row.mentioned_users || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapTemplate(row: any): NoteTemplate {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      noteType: row.note_type,
      contentTemplate: row.content_template,
      isActive: row.is_active,
      usageCount: row.usage_count,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
