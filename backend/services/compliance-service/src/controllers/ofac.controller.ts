import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { ofacService } from '../services/ofac.service';
import { db } from '../services/database.service';

export class OFACController {
  static async checkName(req: Request, res: Response) {
    try {
      const { name, venueId } = req.body;
      
      const result = await ofacService.checkName(name);
      
      // Log the check
      await db.query(
        `INSERT INTO ofac_checks (venue_id, name_checked, is_match, confidence, matched_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [venueId, name, result.isMatch, result.confidence, result.matchedName]
      );
      
      res.json({
        success: true,
        data: {
          ...result,
          timestamp: new Date().toISOString(),
          action: result.isMatch ? 'REQUIRES_REVIEW' : 'CLEARED'
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
