import { Pool } from 'pg';
import { CustomerInteraction } from '../types/admin.types';

export class CustomerInteractionService {
  constructor(private pool: Pool) {}

  async recordInteraction(
    tenantId: string,
    userId: string,
    adminUserId: string,
    interactionType: string,
    channel: string,
    summary: string,
    options: {
      orderId?: string;
      subject?: string;
      durationSeconds?: number;
      resolutionStatus?: string;
      satisfactionScore?: number;
      ticketId?: string;
      ticketSystem?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<CustomerInteraction> {
    const result = await this.pool.query(
      `INSERT INTO customer_interaction_history 
       (tenant_id, user_id, order_id, admin_user_id, interaction_type, channel,
        subject, summary, duration_seconds, resolution_status, satisfaction_score,
        ticket_id, ticket_system, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        tenantId, userId, options.orderId, adminUserId, interactionType, channel,
        options.subject, summary, options.durationSeconds, options.resolutionStatus,
        options.satisfactionScore, options.ticketId, options.ticketSystem,
        JSON.stringify(options.metadata || {})
      ]
    );

    return this.mapInteraction(result.rows[0]);
  }

  async updateInteraction(
    interactionId: string,
    tenantId: string,
    updates: {
      resolutionStatus?: string;
      satisfactionScore?: number;
      durationSeconds?: number;
    }
  ): Promise<CustomerInteraction> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (updates.resolutionStatus) {
      fields.push(`resolution_status = $${++paramCount}`);
      values.push(updates.resolutionStatus);
    }

    if (updates.satisfactionScore !== undefined) {
      fields.push(`satisfaction_score = $${++paramCount}`);
      values.push(updates.satisfactionScore);
    }

    if (updates.durationSeconds !== undefined) {
      fields.push(`duration_seconds = $${++paramCount}`);
      values.push(updates.durationSeconds);
    }

    fields.push(`updated_at = NOW()`);
    values.push(interactionId, tenantId);

    const result = await this.pool.query(
      `UPDATE customer_interaction_history 
       SET ${fields.join(', ')}
       WHERE id = $${paramCount + 1} AND tenant_id = $${paramCount + 2}
       RETURNING *`,
      values
    );

    return this.mapInteraction(result.rows[0]);
  }

  async getInteraction(
    interactionId: string,
    tenantId: string
  ): Promise<CustomerInteraction | null> {
    const result = await this.pool.query(
      'SELECT * FROM customer_interaction_history WHERE id = $1 AND tenant_id = $2',
      [interactionId, tenantId]
    );

    return result.rows[0] ? this.mapInteraction(result.rows[0]) : null;
  }

  async getUserInteractions(
    userId: string,
    tenantId: string,
    limit: number = 50
  ): Promise<CustomerInteraction[]> {
    const result = await this.pool.query(
      `SELECT * FROM customer_interaction_history 
       WHERE user_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, tenantId, limit]
    );

    return result.rows.map(row => this.mapInteraction(row));
  }

  async getOrderInteractions(
    orderId: string,
    tenantId: string
  ): Promise<CustomerInteraction[]> {
    const result = await this.pool.query(
      `SELECT * FROM customer_interaction_history 
       WHERE order_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [orderId, tenantId]
    );

    return result.rows.map(row => this.mapInteraction(row));
  }

  async getAdminInteractions(
    adminUserId: string,
    tenantId: string,
    limit: number = 50
  ): Promise<CustomerInteraction[]> {
    const result = await this.pool.query(
      `SELECT * FROM customer_interaction_history 
       WHERE admin_user_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [adminUserId, tenantId, limit]
    );

    return result.rows.map(row => this.mapInteraction(row));
  }

  async getUnresolvedInteractions(
    tenantId: string,
    limit: number = 50
  ): Promise<CustomerInteraction[]> {
    const result = await this.pool.query(
      `SELECT * FROM customer_interaction_history 
       WHERE tenant_id = $1 
       AND (resolution_status IS NULL OR resolution_status != 'RESOLVED')
       ORDER BY created_at ASC
       LIMIT $2`,
      [tenantId, limit]
    );

    return result.rows.map(row => this.mapInteraction(row));
  }

  async getInteractionsByTicket(
    ticketId: string,
    tenantId: string
  ): Promise<CustomerInteraction[]> {
    const result = await this.pool.query(
      `SELECT * FROM customer_interaction_history 
       WHERE ticket_id = $1 AND tenant_id = $2
       ORDER BY created_at ASC`,
      [ticketId, tenantId]
    );

    return result.rows.map(row => this.mapInteraction(row));
  }

  async getInteractionStats(
    tenantId: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<{
    totalInteractions: number;
    averageDuration: number;
    averageSatisfaction: number;
    resolutionRate: number;
    byChannel: Record<string, number>;
    byType: Record<string, number>;
  }> {
    let query = `
      SELECT 
        COUNT(*) as total_interactions,
        AVG(duration_seconds) as avg_duration,
        AVG(satisfaction_score) as avg_satisfaction,
        SUM(CASE WHEN resolution_status = 'RESOLVED' THEN 1 ELSE 0 END)::float / COUNT(*) as resolution_rate,
        channel,
        interaction_type
      FROM customer_interaction_history 
      WHERE tenant_id = $1
    `;
    
    const params: any[] = [tenantId];
    let paramCount = 1;

    if (dateFrom) {
      query += ` AND created_at >= $${++paramCount}`;
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ` AND created_at <= $${++paramCount}`;
      params.push(dateTo);
    }

    query += ' GROUP BY channel, interaction_type';

    const result = await this.pool.query(query, params);

    // Aggregate results
    const byChannel: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalInteractions = 0;
    let totalDuration = 0;
    let totalSatisfaction = 0;
    let resolvedCount = 0;

    result.rows.forEach(row => {
      const count = parseInt(row.total_interactions);
      totalInteractions += count;
      totalDuration += parseFloat(row.avg_duration || 0) * count;
      totalSatisfaction += parseFloat(row.avg_satisfaction || 0) * count;
      resolvedCount += parseInt(row.total_interactions) * parseFloat(row.resolution_rate);

      byChannel[row.channel] = (byChannel[row.channel] || 0) + count;
      byType[row.interaction_type] = (byType[row.interaction_type] || 0) + count;
    });

    return {
      totalInteractions,
      averageDuration: totalInteractions > 0 ? totalDuration / totalInteractions : 0,
      averageSatisfaction: totalInteractions > 0 ? totalSatisfaction / totalInteractions : 0,
      resolutionRate: totalInteractions > 0 ? resolvedCount / totalInteractions : 0,
      byChannel,
      byType
    };
  }

  private mapInteraction(row: any): CustomerInteraction {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      orderId: row.order_id,
      adminUserId: row.admin_user_id,
      interactionType: row.interaction_type,
      channel: row.channel,
      subject: row.subject,
      summary: row.summary,
      durationSeconds: row.duration_seconds,
      resolutionStatus: row.resolution_status,
      satisfactionScore: row.satisfaction_score,
      ticketId: row.ticket_id,
      ticketSystem: row.ticket_system,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
