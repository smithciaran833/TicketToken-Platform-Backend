import { logger } from '../../utils/logger';
import { pgPool } from '../../utils/database';

export class PredictiveEngine {
  async predictMetricValue(metricName: string, hoursAhead: number = 1): Promise<{
    prediction: number;
    confidence: number;
    trend: 'up' | 'down' | 'stable';
  }> {
    try {
      // Get historical data
      const query = `
        SELECT value, timestamp
        FROM metrics
        WHERE metric_name = $1
        AND timestamp > NOW() - INTERVAL '7 days'
        ORDER BY timestamp ASC
      `;
      
      const result = await pgPool.query(query, [metricName]);
      
      if (result.rows.length < 10) {
        return {
          prediction: 0,
          confidence: 0,
          trend: 'stable'
        };
      }

      const values = result.rows.map(r => parseFloat(r.value));
      
      // Simple moving average with trend
      const recentValues = values.slice(-24); // Last 24 hours
      const ma = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
      
      // Calculate trend
      const firstHalf = recentValues.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
      const secondHalf = recentValues.slice(12).reduce((a, b) => a + b, 0) / 12;
      
      const trendFactor = (secondHalf - firstHalf) / firstHalf;
      const prediction = ma * (1 + trendFactor * hoursAhead);
      
      const trend = trendFactor > 0.05 ? 'up' : trendFactor < -0.05 ? 'down' : 'stable';
      const confidence = Math.min(0.95, result.rows.length / 100);

      return {
        prediction,
        confidence,
        trend
      };
    } catch (error) {
      logger.error('Error predicting metric value:', error);
      return {
        prediction: 0,
        confidence: 0,
        trend: 'stable'
      };
    }
  }

  async predictSystemFailure(): Promise<{
    probability: number;
    timeToFailure: number; // minutes
    riskFactors: string[];
  }> {
    try {
      const riskFactors: string[] = [];
      let riskScore = 0;

      // Check CPU trend
      const cpuPrediction = await this.predictMetricValue('system_cpu_usage_percent', 0.25);
      if (cpuPrediction.prediction > 80) {
        riskScore += 30;
        riskFactors.push('High CPU usage predicted');
      }

      // Check memory trend
      const memPrediction = await this.predictMetricValue('system_memory_usage_percent', 0.25);
      if (memPrediction.prediction > 85) {
        riskScore += 30;
        riskFactors.push('High memory usage predicted');
      }

      // Check error rate trend
      const errorPrediction = await this.predictMetricValue('http_error_rate', 0.25);
      if (errorPrediction.trend === 'up') {
        riskScore += 25;
        riskFactors.push('Increasing error rate');
      }

      // Check response time
      const responsePrediction = await this.predictMetricValue('http_response_time_ms', 0.25);
      if (responsePrediction.prediction > 2000) {
        riskScore += 15;
        riskFactors.push('Slow response times predicted');
      }

      const probability = Math.min(riskScore / 100, 0.95);
      const timeToFailure = probability > 0.7 ? 15 : probability > 0.5 ? 30 : 60;

      return {
        probability,
        timeToFailure,
        riskFactors
      };
    } catch (error) {
      logger.error('Error predicting system failure:', error);
      return {
        probability: 0,
        timeToFailure: 999,
        riskFactors: []
      };
    }
  }
}

export const predictiveEngine = new PredictiveEngine();
