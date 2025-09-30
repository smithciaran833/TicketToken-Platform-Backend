import { BaseModel } from './base.model';
import { ExportRequest, ExportStatus } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class ExportModel extends BaseModel {
  protected static tableName = 'analytics_exports';
  
  static async createExport(
    data: Omit<ExportRequest, 'id' | 'createdAt'>
  ): Promise<ExportRequest> {
    const exportRequest = {
      id: uuidv4(),
      ...data,
      status: ExportStatus.PENDING,
      progress: 0,
      created_at: new Date()
    };
    
    return await this.create(exportRequest);
  }
  
  static async getExportsByVenue(
    venueId: string,
    limit: number = 50
  ): Promise<ExportRequest[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }
  
  static async getExportsByUser(
    userId: string,
    venueId: string,
    limit: number = 50
  ): Promise<ExportRequest[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('user_id', userId)
      .where('venue_id', venueId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }
  
  static async updateExportStatus(
    id: string,
    status: ExportStatus,
    data?: {
      progress?: number;
      fileUrl?: string;
      fileSize?: number;
      error?: string;
      completedAt?: Date;
    }
  ): Promise<ExportRequest> {
    return await this.update(id, {
      status,
      ...data,
      updated_at: new Date()
    });
  }
  
  static async updateProgress(
    id: string,
    progress: number
  ): Promise<void> {
    const db = this.db();
    
    await db(this.tableName)
      .where('id', id)
      .update({
        progress,
        updated_at: new Date()
      });
  }
  
  static async getPendingExports(
    limit: number = 10
  ): Promise<ExportRequest[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('status', ExportStatus.PENDING)
      .orderBy('created_at', 'asc')
      .limit(limit);
  }
  
  static async cleanupExpiredExports(
    expirationDays: number = 7
  ): Promise<number> {
    const db = this.db();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - expirationDays);
    
    return await db(this.tableName)
      .where('status', ExportStatus.COMPLETED)
      .where('created_at', '<', cutoffDate)
      .delete();
  }
}
