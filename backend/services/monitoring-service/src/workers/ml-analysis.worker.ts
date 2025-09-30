import { anomalyDetector } from '../ml/detectors/anomaly-detector';
import { fraudMLDetector } from '../ml/detectors/fraud-ml-detector';
import { predictiveEngine } from '../ml/predictions/predictive-engine';
import { logger } from '../utils/logger';

export async function startMLWorker() {
  logger.info('Starting ML analysis worker...');

  // Run anomaly detection every minute
  setInterval(async () => {
    try {
      await anomalyDetector.checkAllMetrics();
    } catch (error) {
      logger.error('ML anomaly detection error:', error);
    }
  }, 60000);

  // Run predictive analytics every 5 minutes
  setInterval(async () => {
    try {
      const failure = await predictiveEngine.predictSystemFailure();
      if (failure.probability > 0.7) {
        logger.warn(`⚠️ SYSTEM FAILURE PREDICTED: ${(failure.probability * 100).toFixed(1)}% probability in ${failure.timeToFailure} minutes`);
        logger.warn(`Risk factors: ${failure.riskFactors.join(', ')}`);
      }
    } catch (error) {
      logger.error('Predictive analytics error:', error);
    }
  }, 300000);

  // Train fraud detector daily
  setInterval(async () => {
    try {
      await fraudMLDetector.trainOnHistoricalFraud();
    } catch (error) {
      logger.error('Fraud ML training error:', error);
    }
  }, 86400000);

  logger.info('ML analysis worker started');
}
