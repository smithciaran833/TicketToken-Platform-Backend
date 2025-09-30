import { getPool } from '../config/database.config';
import { logger } from '../utils/logger';

export class AccessLogService {
  async logAccess(
    fileId: string,
    accessType: 'view' | 'download' | 'share' | 'stream',
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
    responseCode?: number,
    bytesSent?: number
  ): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    
    try {
      await pool.query(
        `INSERT INTO file_access_logs 
         (file_id, accessed_by, access_type, ip_address, user_agent, response_code, bytes_sent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [fileId, userId, accessType, ipAddress, userAgent, responseCode, bytesSent]
      );
    } catch (error) {
      logger.error('Failed to log file access:', error);
    }
  }
  
  async getAccessLogs(fileId: string, limit: number = 100): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT * FROM file_access_logs 
       WHERE file_id = $1 
       ORDER BY accessed_at DESC 
       LIMIT $2`,
      [fileId, limit]
    );
    
    return result.rows;
  }
  
  async getUserAccessHistory(userId: string, limit: number = 100): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT fal.*, f.filename, f.mime_type 
       FROM file_access_logs fal
       JOIN files f ON f.id = fal.file_id
       WHERE fal.accessed_by = $1 
       ORDER BY fal.accessed_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows;
  }
  
  async getFileAccessStats(fileId: string): Promise<any> {
    const pool = getPool();
    if (!pool) return null;
    
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_accesses,
        COUNT(DISTINCT accessed_by) as unique_users,
        COUNT(CASE WHEN access_type = 'download' THEN 1 END) as downloads,
        COUNT(CASE WHEN access_type = 'view' THEN 1 END) as views,
        COUNT(CASE WHEN access_type = 'share' THEN 1 END) as shares,
        SUM(bytes_sent) as total_bytes_sent,
        MAX(accessed_at) as last_accessed
       FROM file_access_logs 
       WHERE file_id = $1`,
      [fileId]
    );
    
    return result.rows[0];
  }
}

export const accessLogService = new AccessLogService();
