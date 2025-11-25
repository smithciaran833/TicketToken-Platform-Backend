import { Pool } from 'pg';
import { OrderSearchFilters, OrderSearchResult, SavedSearch, SearchHistory } from '../types/admin.types';

export class OrderSearchService {
  constructor(private pool: Pool) {}

  async searchOrders(
    tenantId: string,
    filters: OrderSearchFilters,
    page: number = 1,
    pageSize: number = 50
  ): Promise<OrderSearchResult> {
    const offset = (page - 1) * pageSize;
    
    let query = `
      SELECT 
        o.id,
        o.order_number,
        o.customer_name,
        o.customer_email,
        o.status,
        o.total_amount_cents / 100.0 as total_amount,
        o.event_id,
        o.created_at,
        EXISTS(SELECT 1 FROM order_notes WHERE order_id = o.id) as has_notes,
        EXISTS(SELECT 1 FROM order_notes WHERE order_id = o.id AND is_flagged = true) as is_flagged,
        fs.risk_level
      FROM orders o
      LEFT JOIN fraud_scores fs ON fs.order_id = o.id
      WHERE o.tenant_id = $1
    `;
    
    const params: any[] = [tenantId];
    let paramCount = 1;

    // Full-text search
    if (filters.query) {
      paramCount++;
      query += ` AND o.search_vector @@ plainto_tsquery('english', $${paramCount})`;
      params.push(filters.query);
    }

    // Exact matches
    if (filters.orderId) {
      paramCount++;
      query += ` AND o.id = $${paramCount}`;
      params.push(filters.orderId);
    }

    // Fuzzy matching for email
    if (filters.customerEmail) {
      paramCount++;
      query += ` AND o.customer_email ILIKE $${paramCount}`;
      params.push(`%${filters.customerEmail}%`);
    }

    // Fuzzy matching for name
    if (filters.customerName) {
      paramCount++;
      query += ` AND o.customer_name % $${paramCount}`;
      params.push(filters.customerName);
    }

    // Phone search
    if (filters.customerPhone) {
      paramCount++;
      query += ` AND o.customer_phone ILIKE $${paramCount}`;
      params.push(`%${filters.customerPhone}%`);
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      paramCount++;
      query += ` AND o.status = ANY($${paramCount})`;
      params.push(filters.status);
    }

    // Event filter
    if (filters.eventId) {
      paramCount++;
      query += ` AND o.event_id = $${paramCount}`;
      params.push(filters.eventId);
    }

    // Date range
    if (filters.dateFrom) {
      paramCount++;
      query += ` AND o.created_at >= $${paramCount}`;
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      paramCount++;
      query += ` AND o.created_at <= $${paramCount}`;
      params.push(filters.dateTo);
    }

    // Amount range
    if (filters.minAmount) {
      paramCount++;
      query += ` AND o.total_amount_cents >= $${paramCount}`;
      params.push(filters.minAmount * 100);
    }

    if (filters.maxAmount) {
      paramCount++;
      query += ` AND o.total_amount_cents <= $${paramCount}`;
      params.push(filters.maxAmount * 100);
    }

    // Notes filter
    if (filters.hasNotes !== undefined) {
      if (filters.hasNotes) {
        query += ` AND EXISTS(SELECT 1 FROM order_notes WHERE order_id = o.id)`;
      } else {
        query += ` AND NOT EXISTS(SELECT 1 FROM order_notes WHERE order_id = o.id)`;
      }
    }

    // Flagged filter
    if (filters.isFlagged !== undefined) {
      if (filters.isFlagged) {
        query += ` AND EXISTS(SELECT 1 FROM order_notes WHERE order_id = o.id AND is_flagged = true)`;
      }
    }

    // Risk level filter
    if (filters.riskLevel && filters.riskLevel.length > 0) {
      paramCount++;
      query += ` AND fs.risk_level = ANY($${paramCount})`;
      params.push(filters.riskLevel);
    }

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as count_query`;
    const countResult = await this.pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Add ordering and pagination
    query += ` ORDER BY o.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(pageSize, offset);

    const result = await this.pool.query(query, params);

    return {
      orders: result.rows.map(row => ({
        id: row.id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        status: row.status,
        totalAmount: parseFloat(row.total_amount),
        eventName: row.event_id, // TODO: Join with events table if needed
        createdAt: row.created_at,
        hasNotes: row.has_notes,
        isFlagged: row.is_flagged,
        riskLevel: row.risk_level
      })),
      total,
      page,
      pageSize
    };
  }

  async saveSearch(
    tenantId: string,
    adminUserId: string,
    name: string,
    filters: OrderSearchFilters,
    isDefault: boolean = false
  ): Promise<SavedSearch> {
    const result = await this.pool.query(
      `INSERT INTO saved_searches (tenant_id, admin_user_id, name, filters, is_default)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, adminUserId, name, JSON.stringify(filters), isDefault]
    );

    return this.mapSavedSearch(result.rows[0]);
  }

  async getSavedSearches(tenantId: string, adminUserId: string): Promise<SavedSearch[]> {
    const result = await this.pool.query(
      `SELECT * FROM saved_searches 
       WHERE tenant_id = $1 AND admin_user_id = $2
       ORDER BY is_default DESC, created_at DESC`,
      [tenantId, adminUserId]
    );

    return result.rows.map(row => this.mapSavedSearch(row));
  }

  async deleteSavedSearch(id: string, tenantId: string, adminUserId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM saved_searches WHERE id = $1 AND tenant_id = $2 AND admin_user_id = $3`,
      [id, tenantId, adminUserId]
    );
  }

  async recordSearchHistory(
    tenantId: string,
    adminUserId: string,
    query: string,
    filters: OrderSearchFilters,
    resultsCount: number
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO search_history (tenant_id, admin_user_id, query, filters, results_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, adminUserId, query, JSON.stringify(filters), resultsCount]
    );
  }

  async getSearchHistory(tenantId: string, adminUserId: string, limit: number = 10): Promise<SearchHistory[]> {
    const result = await this.pool.query(
      `SELECT * FROM search_history 
       WHERE tenant_id = $1 AND admin_user_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [tenantId, adminUserId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      adminUserId: row.admin_user_id,
      query: row.query,
      filters: row.filters,
      resultsCount: row.results_count,
      createdAt: row.created_at
    }));
  }

  private mapSavedSearch(row: any): SavedSearch {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      adminUserId: row.admin_user_id,
      name: row.name,
      filters: row.filters,
      isDefault: row.is_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
