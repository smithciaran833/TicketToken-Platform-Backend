import { Pool } from 'pg';
import { FraudDetectionService } from '../services/fraud-detection.service';
import { FraudRiskLevel } from '../types/admin.types';
import logger from '../utils/logger';

export class FraudReviewJob {
  constructor(private pool: Pool) {}

  async execute(): Promise<void> {
    try {
      logger.info('Starting fraud review job');

      const fraudService = new FraudDetectionService(this.pool);

      // Get all high-risk orders that haven't been reviewed
      const highRiskOrders = await fraudService.getHighRiskOrders('system', 100);

      logger.info(`Found ${highRiskOrders.length} high-risk orders to review`);

      for (const fraudScore of highRiskOrders) {
        // Auto-clear low scores that were initially flagged
        if (fraudScore.score < 40 && fraudScore.riskLevel === FraudRiskLevel.MEDIUM) {
          await fraudService.reviewFraudScore(
            fraudScore.id,
            fraudScore.tenantId,
            'system',
            'AUTO_CLEARED',
            'Automatically cleared - score below threshold'
          );
          logger.info(`Auto-cleared fraud score ${fraudScore.id}`);
        }

        // Check for aged fraud scores (>24 hours) and escalate
        const ageHours = (Date.now() - fraudScore.createdAt.getTime()) / (1000 * 60 * 60);
        
        if (ageHours > 24 && !fraudScore.isReviewed) {
          if (fraudScore.riskLevel === FraudRiskLevel.CRITICAL) {
            logger.warn(`Critical fraud score ${fraudScore.id} not reviewed after 24 hours`);
            // Could trigger alerts here
          }
        }
      }

      logger.info('Fraud review job completed successfully');
    } catch (error) {
      logger.error('Fraud review job error:', error);
      throw error;
    }
  }
}
