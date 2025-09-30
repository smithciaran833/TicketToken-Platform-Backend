import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { dataRetentionService } from '../services/data-retention.service';
import { db } from '../services/database.service';

export class GDPRController {
  static async requestDeletion(req: Request, res: Response) {
    try {
      const { customerId } = req.body;
      
      // Log the request
      await db.query(
        `INSERT INTO gdpr_deletion_requests (customer_id, status)
         VALUES ($1, 'processing')`,
        [customerId]
      );
      
      // Process deletion
      await dataRetentionService.handleGDPRDeletion(customerId);
      
      // Update status
      await db.query(
        `UPDATE gdpr_deletion_requests 
         SET status = 'completed', processed_at = NOW()
         WHERE customer_id = $1`,
        [customerId]
      );
      
      res.json({
        success: true,
        message: 'GDPR deletion request processed',
        customerId
      });
    } catch (error: any) {
      console.error('GDPR deletion error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  static async getDeletionStatus(req: Request, res: Response) {
    try {
      const { customerId } = req.params;
      
      const result = await db.query(
        `SELECT * FROM gdpr_deletion_requests 
         WHERE customer_id = $1 
         ORDER BY requested_at DESC LIMIT 1`,
        [customerId]
      );
      
      res.json({
        success: true,
        data: result.rows[0] || null
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
