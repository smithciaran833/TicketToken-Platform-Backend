import { Pool } from 'pg';
import logger from '../utils/logger';

/**
 * SEARCH SERVICE
 * 
 * Advanced search and filtering for transfers
 * Phase 8: Advanced Features
 * 
 * PHASE 5c BYPASS EXCEPTION:
 * This service uses complex SQL JOINs across multiple tables (ticket_transfers, tickets,
 * events, users) for search and filtering operations. This is intentional because:
 * 
 * 1. Search operations require efficient DB-level JOINs for performance
 * 2. Breaking into multiple service calls would significantly degrade search performance
 * 3. These are READ-ONLY queries for UI data enrichment (ticket_number, event_name, user_emails)
 * 4. The primary data (ticket_transfers) is transfer-service owned
 * 5. Secondary data fetched is for display purposes and doesn't affect business logic
 * 
 * Future optimization: Consider implementing a materialized search view or
 * Elasticsearch index for cross-service search functionality.
 */

export interface SearchFilters {
  status?: string[];
  fromUserId?: string;
  toUserId?: string;
  ticketId?: string;
  eventId?: string;
  transferType?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
  hasBlockchainSignature?: boolean;
  searchTerm?: string; // For full-text search
}

export interface SearchOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface SearchResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class SearchService {
  constructor(private readonly pool: Pool) {}

  /**
   * Search transfers with advanced filtering
   */
  async searchTransfers(
    tenantId: string,
    filters: SearchFilters = {},
    options: SearchOptions = {}
  ): Promise<SearchResult<any>> {
    const {
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    const offset = (page - 1) * limit;

    try {
      // Build query
      const { query, countQuery, params } = this.buildSearchQuery(
        tenantId,
        filters,
        sortBy,
        sortOrder,
        limit,
        offset
      );

      // Execute queries in parallel
      const [dataResult, countResult] = await Promise.all([
        this.pool.query(query, params),
        this.pool.query(countQuery, params.slice(0, -2)) // Remove limit and offset for count
      ]);

      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / limit);

      return {
        data: dataResult.rows,
        total,
        page,
        limit,
        totalPages
      };

    } catch (error) {
      logger.error({ err: error, filters }, 'Search failed');
      throw error;
    }
  }

  /**
   * Build search query with filters
   */
  private buildSearchQuery(
    tenantId: string,
    filters: SearchFilters,
    sortBy: string,
    sortOrder: string,
    limit: number,
    offset: number
  ): { query: string; countQuery: string; params: any[] } {
    const conditions: string[] = ['tt.tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    // Status filter
    if (filters.status && filters.status.length > 0) {
      conditions.push(`tt.status = ANY($${paramIndex})`);
      params.push(filters.status);
      paramIndex++;
    }

    // User filters
    if (filters.fromUserId) {
      conditions.push(`tt.from_user_id = $${paramIndex}`);
      params.push(filters.fromUserId);
      paramIndex++;
    }

    if (filters.toUserId) {
      conditions.push(`tt.to_user_id = $${paramIndex}`);
      params.push(filters.toUserId);
      paramIndex++;
    }

    // Ticket filter
    if (filters.ticketId) {
      conditions.push(`tt.ticket_id = $${paramIndex}`);
      params.push(filters.ticketId);
      paramIndex++;
    }

    // Event filter
    if (filters.eventId) {
      conditions.push(`t.event_id = $${paramIndex}`);
      params.push(filters.eventId);
      paramIndex++;
    }

    // Transfer type filter
    if (filters.transferType && filters.transferType.length > 0) {
      conditions.push(`tt.transfer_type = ANY($${paramIndex})`);
      params.push(filters.transferType);
      paramIndex++;
    }

    // Date range filter
    if (filters.dateFrom) {
      conditions.push(`tt.created_at >= $${paramIndex}`);
      params.push(filters.dateFrom);
      paramIndex++;
    }

    if (filters.dateTo) {
      conditions.push(`tt.created_at <= $${paramIndex}`);
      params.push(filters.dateTo);
      paramIndex++;
    }

    // Amount filter (if applicable)
    if (filters.minAmount !== undefined) {
      conditions.push(`tt.sale_price >= $${paramIndex}`);
      params.push(filters.minAmount);
      paramIndex++;
    }

    if (filters.maxAmount !== undefined) {
      conditions.push(`tt.sale_price <= $${paramIndex}`);
      params.push(filters.maxAmount);
      paramIndex++;
    }

    // Blockchain signature filter
    if (filters.hasBlockchainSignature !== undefined) {
      if (filters.hasBlockchainSignature) {
        conditions.push('tt.blockchain_signature IS NOT NULL');
      } else {
        conditions.push('tt.blockchain_signature IS NULL');
      }
    }

    // Full-text search
    if (filters.searchTerm) {
      conditions.push(`(
        tt.transfer_code ILIKE $${paramIndex} OR
        tt.to_email ILIKE $${paramIndex} OR
        t.ticket_number ILIKE $${paramIndex}
      )`);
      params.push(`%${filters.searchTerm}%`);
      paramIndex++;
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Validate and sanitize sort column
    const validSortColumns = [
      'created_at',
      'updated_at',
      'status',
      'transfer_type',
      'sale_price'
    ];
    const sanitizedSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sanitizedSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    // Base SELECT clause
    const selectClause = `
      SELECT 
        tt.*,
        t.ticket_number,
        t.event_id,
        e.name as event_name,
        u1.email as from_user_email,
        u2.email as to_user_email
      FROM ticket_transfers tt
      LEFT JOIN tickets t ON tt.ticket_id = t.id
      LEFT JOIN events e ON t.event_id = e.id
      LEFT JOIN users u1 ON tt.from_user_id = u1.id
      LEFT JOIN users u2 ON tt.to_user_id = u2.id
    `;

    // Main query with pagination
    const query = `
      ${selectClause}
      ${whereClause}
      ORDER BY tt.${sanitizedSortBy} ${sanitizedSortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    // Count query
    const countQuery = `
      SELECT COUNT(*) as count
      FROM ticket_transfers tt
      LEFT JOIN tickets t ON tt.ticket_id = t.id
      ${whereClause}
    `;

    return { query, countQuery, params };
  }

  /**
   * Get transfer suggestions/autocomplete
   */
  async getTransferSuggestions(
    tenantId: string,
    searchTerm: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      const result = await this.pool.query(`
        SELECT DISTINCT
          tt.transfer_code,
          tt.to_email,
          t.ticket_number
        FROM ticket_transfers tt
        LEFT JOIN tickets t ON tt.ticket_id = t.id
        WHERE tt.tenant_id = $1
          AND (
            tt.transfer_code ILIKE $2 OR
            tt.to_email ILIKE $2 OR
            t.ticket_number ILIKE $2
          )
        LIMIT $3
      `, [tenantId, `%${searchTerm}%`, limit]);

      return result.rows;

    } catch (error) {
      logger.error({ err: error, searchTerm }, 'Failed to get suggestions');
      return [];
    }
  }

  /**
   * Get faceted search counts
   */
  async getFacets(tenantId: string, _filters: SearchFilters = {}): Promise<any> {
    try {
      // Get status counts
      const statusResult = await this.pool.query(`
        SELECT status, COUNT(*) as count
        FROM ticket_transfers
        WHERE tenant_id = $1
        GROUP BY status
      `, [tenantId]);

      // Get transfer type counts
      const typeResult = await this.pool.query(`
        SELECT transfer_type, COUNT(*) as count
        FROM ticket_transfers
        WHERE tenant_id = $1
        GROUP BY transfer_type
      `, [tenantId]);

      return {
        status: statusResult.rows,
        transferType: typeResult.rows
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to get facets');
      return {};
    }
  }
}
