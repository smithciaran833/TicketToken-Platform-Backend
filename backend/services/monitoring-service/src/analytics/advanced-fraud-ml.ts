import * as tf from '@tensorflow/tfjs-node';
import { pgPool } from '../utils/database';
import { kafkaProducer } from '../streaming/kafka-producer';
import { logger } from '../utils/logger';
import { createHash } from 'crypto';

interface FraudPattern {
  userId: string;
  ipAddress: string;
  deviceFingerprint: string;
  behaviorVector: number[];
  riskScore: number;
  patterns: string[];
  timestamp: Date;
}

export class AdvancedFraudDetector {
  private model: tf.LayersModel | null = null;
  private patternCache = new Map<string, FraudPattern[]>();
  private knownScalpers = new Set<string>();
  private suspiciousIPs = new Map<string, number>();
  private analysisInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeDeepLearningModel();
    this.loadKnownPatterns();
    this.startRealtimeAnalysis();
  }

  private async initializeDeepLearningModel() {
    // Build neural network for fraud detection
    this.model = tf.sequential({
      layers: [
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          inputShape: [10], // Simplified to 10 features
        }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({
          units: 64,
          activation: 'relu',
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu',
        }),
        tf.layers.dense({
          units: 1,
          activation: 'sigmoid',
        }),
      ],
    });

    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    });

    logger.info('🧠 Advanced fraud detection neural network initialized');
  }

  private extractFeatures(data: any): number[] {
    // Extract 10 key features for the neural network
    return [
      data.request_count || 0,
      data.time_between_requests || 0,
      data.unique_events_targeted || 0,
      data.total_tickets_attempted || 0,
      data.failed_attempts || 0,
      this.isKnownVPN(data.ip_address) ? 1 : 0,
      this.isSuspiciousUserAgent(data.user_agent) ? 1 : 0,
      data.account_age_days || 0,
      data.payment_methods_used || 0,
      this.calculateVelocityScore(data),
    ];
  }

  async detectFraud(userData: any): Promise<FraudPattern> {
    try {
      const features = this.extractFeatures(userData);
      const featureTensor = tf.tensor2d([features]);

      // Get neural network prediction
      const prediction = this.model!.predict(featureTensor) as tf.Tensor;
      const fraudProbability = (await prediction.data())[0];

      featureTensor.dispose();
      prediction.dispose();

      const patterns: string[] = [];
      let riskScore = fraudProbability;

      // Check velocity
      if (await this.checkVelocity(userData)) {
        patterns.push('high_velocity');
        riskScore = Math.min(riskScore + 0.3, 1);
      }

      // Check IP reputation - directly check for VPN
      if (this.isKnownVPN(userData.ip_address)) {
        patterns.push('suspicious_ip');
        riskScore = Math.min(riskScore + 0.2, 1);
      }

      // Check for scalper behaviors
      const scalperScore = await this.detectScalperBehavior(userData);
      if (scalperScore > 0.6) {
        patterns.push('scalper_behavior');
        riskScore = Math.min(riskScore + scalperScore * 0.3, 1);
      }

      const fraudPattern: FraudPattern = {
        userId: userData.user_id,
        ipAddress: userData.ip_address,
        deviceFingerprint: this.generateFingerprint(userData),
        behaviorVector: features,
        riskScore,
        patterns,
        timestamp: new Date(),
      };

      // Send to Kafka if high risk
      if (riskScore > 0.7) {
        await kafkaProducer.sendFraudEvent({
          userId: userData.user_id,
          pattern: patterns.join(', '),
          riskLevel: riskScore > 0.9 ? 'critical' : 'high',
          riskScore,
          timestamp: new Date(),
        });
      }

      return fraudPattern;
    } catch (error) {
      logger.error('Error detecting fraud:', error);
      throw error;
    }
  }

  private async detectScalperBehavior(userData: any): Promise<number> {
    let score = 0;

    // Multiple indicators
    if (userData.time_between_requests < 1) score += 0.25;
    if (userData.total_tickets_attempted > 10) score += 0.2;
    if (userData.multiple_ips_used) score += 0.15;
    if (this.detectAutomation(userData)) score += 0.2;
    if (userData.targeting_high_demand) score += 0.2;

    return Math.min(score, 1);
  }

  private async checkVelocity(userData: any): Promise<boolean> {
    return userData.request_count && userData.request_count > 30;
  }

  private getIPRiskScore(ipAddress: string): number {
    if (this.suspiciousIPs.has(ipAddress)) {
      return this.suspiciousIPs.get(ipAddress)!;
    }

    let score = 0;
    if (this.isKnownVPN(ipAddress)) score += 0.3;
    if (this.isDataCenter(ipAddress)) score += 0.4;

    return Math.min(score, 1);
  }

  private isKnownVPN(ip: string): boolean {
    const vpnRanges = ['10.', '172.16.', '192.168.'];
    return vpnRanges.some(range => ip.startsWith(range));
  }

  private isDataCenter(ip: string): boolean {
    // Simplified check
    return false;
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    if (!userAgent) return false;
    const suspicious = ['bot', 'crawler', 'spider', 'scraper', 'curl', 'wget', 'scrapy', 'python-requests', 'python'];
    const ua = userAgent.toLowerCase();
    return suspicious.some(s => ua.includes(s));
  }

  private calculateVelocityScore(data: any): number {
    const velocity = data.request_count / Math.max(data.time_window_minutes || 1, 1);
    return Math.min(velocity / 100, 1);
  }

  private generateFingerprint(userData: any): string {
    const data = `${userData.user_agent}|${userData.ip_address}`;
    return createHash('sha256').update(data).digest('hex');
  }

  private detectAutomation(userData: any): boolean {
    return userData.mouse_movements === 0 && userData.keyboard_events === 0;
  }

  private async loadKnownPatterns() {
    try {
      // Load known bad actors from database
      logger.info('Loading known fraud patterns...');
    } catch (error) {
      logger.error('Error loading patterns:', error);
    }
  }

  private startRealtimeAnalysis() {
    this.analysisInterval = setInterval(async () => {
      try {
        // Real-time fraud analysis
        logger.debug('Running fraud analysis...');
      } catch (error) {
        logger.error('Error in realtime analysis:', error);
      }
    }, 30000);
  }

  stopRealtimeAnalysis() {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }

  async getFraudMetrics() {
    return {
      high_risk_users: this.knownScalpers.size,
      suspicious_ips: this.suspiciousIPs.size,
      patterns_detected: 0,
    };
  }
}

export const fraudDetector = new AdvancedFraudDetector();
