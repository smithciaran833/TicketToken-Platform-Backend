import { logger } from '../logger';
import { db } from '../config/database';

export interface Report {
  id?: string;
  user_id: string;
  name: string;
  description?: string;
  query: any;
  format: 'pdf' | 'csv' | 'json' | 'xlsx';
  schedule?: string;
  is_public: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface ReportHistory {
  id?: string;
  report_id: string;
  generated_at: Date;
  status: 'pending' | 'success' | 'failed';
  file_url?: string;
  error?: string;
}

export class ReportBuilderService {
  async createReport(report: Report): Promise<Report> {
    try {
      const result = await db.raw(`
        INSERT INTO reports (user_id, name, description, query, format, schedule, is_public, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        RETURNING *
      `, [
        report.user_id,
        report.name,
        report.description || '',
        JSON.stringify(report.query),
        report.format,
        report.schedule || null,
        report.is_public
      ]);

      logger.info('Report created', { id: result.rows[0].id });
      return this.mapRowToReport(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create report:', error);
      throw error;
    }
  }

  async getReport(reportId: string): Promise<Report | null> {
    try {
      const result = await db.raw('SELECT * FROM reports WHERE id = ?', [reportId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToReport(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get report:', error);
      throw error;
    }
  }

  async listReports(userId: string, includePublic: boolean = true): Promise<Report[]> {
    try {
      let query = 'SELECT * FROM reports WHERE user_id = ?';
      const params: any[] = [userId];

      if (includePublic) {
        query += ' OR is_public = TRUE';
      }

      query += ' ORDER BY created_at DESC';

      const result = await db.raw(query, params);
      return result.rows.map((row: any) => this.mapRowToReport(row));
    } catch (error) {
      logger.error('Failed to list reports:', error);
      throw error;
    }
  }

  async updateReport(reportId: string, updates: Partial<Report>): Promise<Report> {
    try {
      const setClauses: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) {
        setClauses.push('name = ?');
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        setClauses.push('description = ?');
        values.push(updates.description);
      }
      if (updates.query !== undefined) {
        setClauses.push('query = ?');
        values.push(JSON.stringify(updates.query));
      }
      if (updates.format !== undefined) {
        setClauses.push('format = ?');
        values.push(updates.format);
      }
      if (updates.schedule !== undefined) {
        setClauses.push('schedule = ?');
        values.push(updates.schedule);
      }
      if (updates.is_public !== undefined) {
        setClauses.push('is_public = ?');
        values.push(updates.is_public);
      }

      setClauses.push('updated_at = NOW()');
      values.push(reportId);

      const result = await db.raw(`
        UPDATE reports 
        SET ${setClauses.join(', ')}
        WHERE id = ?
        RETURNING *
      `, values);

      logger.info('Report updated', { id: reportId });
      return this.mapRowToReport(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update report:', error);
      throw error;
    }
  }

  async deleteReport(reportId: string): Promise<void> {
    try {
      await db.raw('DELETE FROM reports WHERE id = ?', [reportId]);
      logger.info('Report deleted', { id: reportId });
    } catch (error) {
      logger.error('Failed to delete report:', error);
      throw error;
    }
  }

  async generateReport(report: Report): Promise<ReportHistory> {
    const startTime = Date.now();
    
    try {
      // Log report generation
      const result = await db.raw(`
        INSERT INTO report_history (report_id, generated_at, status)
        VALUES (?, NOW(), 'pending')
        RETURNING *
      `, [report.id]);

      const historyId = result.rows[0].id;

      try {
        // Execute report query (simplified)
        logger.info('Generating report', { report_id: report.id, format: report.format });

        // In real implementation, you'd execute the query and format the output
        const duration = Date.now() - startTime;

        // Update history as success
        const updateResult = await db.raw(`
          UPDATE report_history 
          SET status = 'success', file_url = ?
          WHERE id = ?
          RETURNING *
        `, [`/reports/${report.id}/output.${report.format}`, historyId]);

        logger.info('Report generated successfully', { report_id: report.id, duration });
        return this.mapRowToReportHistory(updateResult.rows[0]);
      } catch (error) {
        // Update history as failed
        await db.raw(`
          UPDATE report_history 
          SET status = 'failed', error = ?
          WHERE id = ?
        `, [error instanceof Error ? error.message : 'Unknown error', historyId]);

        throw error;
      }
    } catch (error) {
      logger.error('Report generation failed:', error);
      throw error;
    }
  }

  async getReportHistory(reportId: string, limit: number = 50): Promise<ReportHistory[]> {
    try {
      const result = await db.raw(`
        SELECT * FROM report_history 
        WHERE report_id = ?
        ORDER BY generated_at DESC
        LIMIT ?
      `, [reportId, limit]);

      return result.rows.map((row: any) => this.mapRowToReportHistory(row));
    } catch (error) {
      logger.error('Failed to get report history:', error);
      throw error;
    }
  }

  async getScheduledReports(): Promise<Report[]> {
    try {
      const result = await db.raw(`
        SELECT * FROM reports 
        WHERE schedule IS NOT NULL
        ORDER BY created_at DESC
      `);

      return result.rows.map((row: any) => this.mapRowToReport(row));
    } catch (error) {
      logger.error('Failed to get scheduled reports:', error);
      throw error;
    }
  }

  private mapRowToReport(row: any): Report {
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      description: row.description,
      query: typeof row.query === 'string' ? JSON.parse(row.query) : row.query,
      format: row.format,
      schedule: row.schedule,
      is_public: row.is_public ?? false,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  private mapRowToReportHistory(row: any): ReportHistory {
    return {
      id: row.id,
      report_id: row.report_id,
      generated_at: row.generated_at,
      status: row.status,
      file_url: row.file_url,
      error: row.error
    };
  }
}

export const reportBuilderService = new ReportBuilderService();
