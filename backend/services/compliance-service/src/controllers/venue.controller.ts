import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { db } from '../services/database.service';

export class VenueController {
  static async startVerification(req: Request, res: Response) {
    try {
      const { venueId, ein, businessName } = req.body;
      const verificationId = 'ver_' + Date.now();
      
      // Save to database
      const result = await db.query(
        `INSERT INTO venue_verifications (venue_id, ein, business_name, status, verification_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [venueId, ein, businessName, 'pending', verificationId]
      );
      
      // Log to audit table
      await db.query(
        `INSERT INTO compliance_audit_log (action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4)`,
        ['verification_started', 'venue', venueId, JSON.stringify({ ein, businessName })]
      );
      
      return res.json({
        success: true,
        message: 'Verification started and saved to database',
        data: {
          id: result.rows[0].id,
          venueId,
          verificationId,
          status: 'pending',
          nextStep: 'upload_w9'
        }
      });
    } catch (error: any) {
      console.error('Error starting verification:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to start verification',
        details: error.message
      });
    }
  }

  static async getVerificationStatus(req: Request, res: Response) {
    try {
      const { venueId } = req.params;
      
      // Get from database
      const result = await db.query(
        'SELECT * FROM venue_verifications WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
        [venueId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No verification found for this venue'
        });
      }
      
      const verification = result.rows[0];
      
      return res.json({
        success: true,
        data: {
          venueId: verification.venue_id,
          verificationId: verification.verification_id,
          status: verification.status,
          businessName: verification.business_name,
          ein: verification.ein,
          createdAt: verification.created_at,
          updatedAt: verification.updated_at
        }
      });
    } catch (error: any) {
      console.error('Error getting verification status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get verification status',
        details: error.message
      });
    }
  }

  static async getAllVerifications(req: Request, res: Response) {
    try {
      const result = await db.query(
        'SELECT * FROM venue_verifications ORDER BY created_at DESC LIMIT 10'
      );
      
      return res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error: any) {
      console.error('Error getting verifications:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get verifications',
        details: error.message
      });
    }
  }
}
