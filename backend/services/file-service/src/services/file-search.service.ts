import { getPool } from '../config/database.config';

export interface SearchFilters {
  filename?: string;
  mimeType?: string;
  entityType?: string;
  entityId?: string;
  uploadedBy?: string;
  tags?: string[];
  minSize?: number;
  maxSize?: number;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  isPublic?: boolean;
}

export class FileSearchService {
  async search(filters: SearchFilters, limit: number = 100, offset: number = 0): Promise<any> {
    const pool = getPool();
    if (!pool) return { files: [], total: 0 };
    
    let query = 'SELECT * FROM files WHERE deleted_at IS NULL';
    const params: any[] = [];
    let paramCount = 0;
    
    if (filters.filename) {
      query += ` AND filename ILIKE $${++paramCount}`;
      params.push(`%${filters.filename}%`);
    }
    
    if (filters.mimeType) {
      query += ` AND mime_type LIKE $${++paramCount}`;
      params.push(`${filters.mimeType}%`);
    }
    
    if (filters.entityType) {
      query += ` AND entity_type = $${++paramCount}`;
      params.push(filters.entityType);
    }
    
    if (filters.entityId) {
      query += ` AND entity_id = $${++paramCount}`;
      params.push(filters.entityId);
    }
    
    if (filters.uploadedBy) {
      query += ` AND uploaded_by = $${++paramCount}`;
      params.push(filters.uploadedBy);
    }
    
    if (filters.tags && filters.tags.length > 0) {
      query += ` AND tags && $${++paramCount}`;
      params.push(filters.tags);
    }
    
    if (filters.minSize) {
      query += ` AND size_bytes >= $${++paramCount}`;
      params.push(filters.minSize);
    }
    
    if (filters.maxSize) {
      query += ` AND size_bytes <= $${++paramCount}`;
      params.push(filters.maxSize);
    }
    
    if (filters.startDate) {
      query += ` AND created_at >= $${++paramCount}`;
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ` AND created_at <= $${++paramCount}`;
      params.push(filters.endDate);
    }
    
    if (filters.status) {
      query += ` AND status = $${++paramCount}`;
      params.push(filters.status);
    }
    
    if (filters.isPublic !== undefined) {
      query += ` AND is_public = $${++paramCount}`;
      params.push(filters.isPublic);
    }
    
    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get paginated results
    query += ` ORDER BY created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    return {
      files: result.rows,
      total,
      limit,
      offset
    };
  }
  
  async searchByContent(searchText: string, limit: number = 100): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    // Search in document metadata
    const result = await pool.query(
      `SELECT f.*, dm.extracted_text 
       FROM files f
       JOIN document_metadata dm ON dm.file_id = f.id
       WHERE dm.extracted_text ILIKE $1
       AND f.deleted_at IS NULL
       ORDER BY f.created_at DESC
       LIMIT $2`,
      [`%${searchText}%`, limit]
    );
    
    return result.rows;
  }
  
  async getRecentFiles(limit: number = 10): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT * FROM files 
       WHERE deleted_at IS NULL 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }
  
  async getMostAccessed(limit: number = 10): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT f.*, COUNT(fal.id) as access_count
       FROM files f
       LEFT JOIN file_access_logs fal ON fal.file_id = f.id
       WHERE f.deleted_at IS NULL
       GROUP BY f.id
       ORDER BY access_count DESC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }
}

export const fileSearchService = new FileSearchService();
