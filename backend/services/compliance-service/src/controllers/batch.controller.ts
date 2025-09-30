import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { batchService } from '../services/batch.service';
import { db } from '../services/database.service';

export class BatchController {
  static async generate1099Forms(req: Request, res: Response) {
    try {
      const { year } = req.body;
      const targetYear = year || new Date().getFullYear() - 1;
      
      const result = await batchService.generateYear1099Forms(targetYear);
      
      res.json({
        success: true,
        message: `Generated ${result.generated} Form 1099-Ks for year ${targetYear}`,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async getBatchJobs(req: Request, res: Response) {
    try {
      const jobs = await db.query(
        `SELECT * FROM compliance_batch_jobs 
         ORDER BY created_at DESC 
         LIMIT 20`
      );
      
      res.json({
        success: true,
        data: jobs.rows
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async runDailyChecks(req: Request, res: Response) {
    try {
      await batchService.dailyComplianceChecks();
      
      res.json({
        success: true,
        message: 'Daily compliance checks completed'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async updateOFACList(req: Request, res: Response) {
    try {
      await batchService.processOFACUpdates();
      
      res.json({
        success: true,
        message: 'OFAC list updated successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
