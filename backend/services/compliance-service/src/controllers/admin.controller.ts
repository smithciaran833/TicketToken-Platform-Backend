import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { db } from '../services/database.service';
import { notificationService } from '../services/notification.service';

export class AdminController {
  static async getPendingReviews(req: Request, res: Response) {
    try {
      const pendingVerifications = await db.query(`
        SELECT v.*, r.risk_score, r.factors, r.recommendation
        FROM venue_verifications v
        LEFT JOIN risk_assessments r ON v.venue_id = r.venue_id
        WHERE v.status = 'pending' 
        OR v.manual_review_required = true
        ORDER BY v.created_at DESC
      `);
      
      const pendingFlags = await db.query(`
        SELECT * FROM risk_flags 
        WHERE resolved = false
        ORDER BY created_at DESC
      `);
      
      res.json({
        success: true,
        data: {
          verifications: pendingVerifications.rows,
          flags: pendingFlags.rows,
          totalPending: pendingVerifications.rows.length + pendingFlags.rows.length
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async approveVerification(req: Request, res: Response) {
    try {
      const { venueId } = req.params;
      const { notes } = req.body;
      
      await db.query(`
        UPDATE venue_verifications 
        SET status = 'verified', 
            manual_review_required = false,
            manual_review_notes = $2,
            updated_at = NOW()
        WHERE venue_id = $1
      `, [venueId, notes]);
      
      // Log the action
      await db.query(`
        INSERT INTO compliance_audit_log 
        (action, entity_type, entity_id, user_id, metadata)
        VALUES ('verification_approved', 'venue', $1, $2, $3)
      `, [venueId, 'admin', JSON.stringify({ notes })]);
      
      // Notify venue
      await notificationService.notifyVerificationStatus(venueId, 'approved');
      
      res.json({
        success: true,
        message: 'Venue verification approved',
        data: { venueId }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async rejectVerification(req: Request, res: Response) {
    try {
      const { venueId } = req.params;
      const { reason, notes } = req.body;
      
      await db.query(`
        UPDATE venue_verifications 
        SET status = 'rejected',
            manual_review_required = false,
            manual_review_notes = $2,
            updated_at = NOW()
        WHERE venue_id = $1
      `, [venueId, notes]);
      
      // Log the action
      await db.query(`
        INSERT INTO compliance_audit_log 
        (action, entity_type, entity_id, user_id, metadata)
        VALUES ('verification_rejected', 'venue', $1, $2, $3)
      `, [venueId, 'admin', JSON.stringify({ reason, notes })]);
      
      // Notify venue
      await notificationService.notifyVerificationStatus(venueId, 'rejected');
      
      res.json({
        success: true,
        message: 'Venue verification rejected',
        data: { venueId, reason }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
