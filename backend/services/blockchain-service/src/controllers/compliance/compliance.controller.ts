import { Request, Response } from 'express';
import { feeTransparencyService } from '../../services/compliance/fee-transparency.service';
import { privacyExportService } from '../../services/compliance/privacy-export.service';
import { logger } from '../../utils/logger';

export class ComplianceController {
  /**
   * Get fee breakdown for a ticket
   * GET /api/compliance/fees/breakdown
   */
  async getFeeBreakdown(req: Request, res: Response): Promise<void> {
    try {
      const { basePrice, venueId, isResale, location } = req.query;
      
      const breakdown = await feeTransparencyService.calculateFeeBreakdown(
        parseFloat(basePrice as string),
        venueId as string,
        isResale === 'true',
        location as string
      );
      
      res.json({
        success: true,
        data: breakdown,
        disclaimer: 'All fees are shown in USD. Final price may vary based on location and applicable taxes.'
      });
      
    } catch (error: any) {
      logger.error('Failed to get fee breakdown:', error);
      res.status(500).json({ error: 'Failed to calculate fees' });
    }
  }

  /**
   * Get order fees
   * GET /api/compliance/orders/:orderId/fees
   */
  async getOrderFees(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;
      const userId = (req as any).user.id;
      
      // Verify user owns this order
      const order = await this.verifyOrderOwnership(orderId, userId);
      if (!order) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      
      const fees = await feeTransparencyService.getOrderFees(orderId);
      
      res.json({
        success: true,
        data: fees
      });
      
    } catch (error: any) {
      logger.error('Failed to get order fees:', error);
      res.status(500).json({ error: 'Failed to retrieve order fees' });
    }
  }

  /**
   * Request data export (GDPR)
   * POST /api/compliance/privacy/export
   */
  async requestDataExport(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { reason } = req.body;
      
      const exportRequest = await privacyExportService.requestDataExport(
        userId,
        reason || 'User requested'
      );
      
      res.json({
        success: true,
        data: exportRequest,
        message: 'Your data export has been queued. You will receive an email when it\'s ready.'
      });
      
    } catch (error: any) {
      logger.error('Failed to request data export:', error);
      res.status(500).json({ error: 'Failed to process export request' });
    }
  }

  /**
   * Request account deletion (GDPR/CCPA)
   * POST /api/compliance/privacy/delete
   */
  async requestAccountDeletion(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { reason, confirmEmail } = req.body;
      
      // Verify email matches
      if (confirmEmail !== (req as any).user.email) {
        res.status(400).json({ error: 'Email confirmation does not match' });
        return;
      }
      
      const deletionRequest = await privacyExportService.requestAccountDeletion(
        userId,
        reason
      );
      
      res.json({
        success: true,
        data: deletionRequest,
        warning: 'Your account will be deleted in 30 days. You can cancel this request within 29 days.'
      });
      
    } catch (error: any) {
      logger.error('Failed to request account deletion:', error);
      res.status(500).json({ error: 'Failed to process deletion request' });
    }
  }

  /**
   * Get venue fee report
   * GET /api/compliance/venues/:venueId/fees/report
   */
  async getVenueFeeReport(req: Request, res: Response): Promise<void> {
    try {
      const { venueId } = req.params;
      const { startDate, endDate } = req.query;
      
      // Verify venue admin access
      const hasAccess = await this.verifyVenueAccess(venueId, (req as any).user.id);
      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      
      const report = await feeTransparencyService.generateVenueFeeReport(
        venueId,
        new Date(startDate as string),
        new Date(endDate as string)
      );
      
      res.json({
        success: true,
        data: report
      });
      
    } catch (error: any) {
      logger.error('Failed to generate fee report:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }

  /**
   * Get privacy policy
   * GET /api/compliance/privacy/policy
   */
  async getPrivacyPolicy(_req: Request, res: Response): Promise<void> {
    res.json({
      version: '2.0',
      effectiveDate: '2025-01-01',
      lastUpdated: '2025-08-10',
      dataCollection: {
        personal: ['name', 'email', 'phone', 'address'],
        payment: ['card last 4 digits', 'billing address'],
        usage: ['IP address', 'browser info', 'activity logs'],
        blockchain: ['wallet address', 'NFT ownership']
      },
      dataUsage: [
        'Process ticket purchases',
        'Mint NFT tickets',
        'Communicate about events',
        'Prevent fraud',
        'Comply with legal obligations'
      ],
      dataRetention: {
        transactional: '7 years',
        marketing: 'Until consent withdrawn',
        logs: '90 days'
      },
      userRights: [
        'Access your data (GDPR Article 15)',
        'Correct your data (GDPR Article 16)',
        'Delete your data (GDPR Article 17)',
        'Export your data (GDPR Article 20)',
        'Object to processing (GDPR Article 21)',
        'Withdraw consent anytime'
      ],
      contact: {
        email: 'privacy@tickettoken.com',
        dpo: 'dpo@tickettoken.com'
      }
    });
  }

  /**
   * Verify order ownership
   */
  private async verifyOrderOwnership(_orderId: string, _userId: string): Promise<boolean> {
    // Implementation would check database
    return true;
  }

  /**
   * Verify venue access
   */
  private async verifyVenueAccess(_venueId: string, _userId: string): Promise<boolean> {
    // Implementation would check venue_staff table
    return true;
  }
}

export const complianceController = new ComplianceController();
