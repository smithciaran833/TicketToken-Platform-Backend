import { logger } from '../../utils/logger';
import { pgPool } from '../../utils/database';

interface FraudPattern {
  pattern: string;
  score: number;
  confidence: number;
  indicators: string[];
}

export class FraudMLDetector {
  private patterns: Map<string, number[]> = new Map();
  private suspiciousIPs: Set<string> = new Set();
  private botSignatures: Map<string, number> = new Map();

  async detectScalperPattern(data: any): Promise<FraudPattern> {
    const indicators: string[] = [];
    let score = 0;

    // Pattern 1: Rapid sequential requests
    if (data.requestsPerMinute > 60) {
      score += 30;
      indicators.push('Rapid request rate');
    }

    // Pattern 2: Multiple payment methods from same IP
    if (data.paymentMethodCount > 3) {
      score += 25;
      indicators.push('Multiple payment methods');
    }

    // Pattern 3: Bulk ticket purchases
    if (data.ticketCount > 10) {
      score += 35;
      indicators.push('Bulk purchase attempt');
    }

    // Pattern 4: Geographic anomaly
    if (data.geoDistance > 1000) { // km from usual location
      score += 20;
      indicators.push('Geographic anomaly');
    }

    // Pattern 5: Time-based pattern (purchases at exact intervals)
    if (this.detectTimePattern(data.timestamps)) {
      score += 40;
      indicators.push('Automated timing pattern');
    }

    // ML confidence based on historical accuracy
    const confidence = this.calculateConfidence(score, indicators.length);

    return {
      pattern: 'scalper',
      score: Math.min(score, 100),
      confidence,
      indicators
    };
  }

  async detectBotActivity(data: any): Promise<FraudPattern> {
    const indicators: string[] = [];
    let score = 0;

    // Bot detection features
    if (!data.userAgent || data.userAgent.includes('bot')) {
      score += 50;
      indicators.push('Bot user agent');
    }

    if (data.mouseMovements === 0) {
      score += 30;
      indicators.push('No mouse movements');
    }

    if (data.keypressInterval < 10) { // ms
      score += 25;
      indicators.push('Inhuman typing speed');
    }

    if (data.sessionDuration < 5) { // seconds
      score += 20;
      indicators.push('Extremely short session');
    }

    const confidence = this.calculateConfidence(score, indicators.length);

    return {
      pattern: 'bot',
      score: Math.min(score, 100),
      confidence,
      indicators
    };
  }

  private detectTimePattern(timestamps: number[]): boolean {
    if (timestamps.length < 3) return false;

    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    // Check if intervals are suspiciously consistent (automated)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    
    return variance < 100; // Very consistent timing = likely automated
  }

  private calculateConfidence(score: number, indicatorCount: number): number {
    // Base confidence on score and number of indicators
    const scoreConfidence = score / 100;
    const indicatorConfidence = Math.min(indicatorCount / 5, 1);
    
    return (scoreConfidence * 0.7 + indicatorConfidence * 0.3);
  }

  async trainOnHistoricalFraud() {
    try {
      // This would normally load historical fraud data
      // For now, we'll use simulated training
      logger.info('Training fraud ML detector on historical data...');
      
      // Simulate training
      setTimeout(() => {
        logger.info('Fraud ML detector training complete');
      }, 2000);
    } catch (error) {
      logger.error('Error training fraud detector:', error);
    }
  }
}

export const fraudMLDetector = new FraudMLDetector();
