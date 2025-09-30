import { query } from '../../config/database';
import { FraudCheck, FraudSignal, SignalType, FraudDecision } from '../../types';
import { createClient } from 'redis';
import { config } from '../../config';

export class ScalperDetectorService {
  private redis: any;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private knownScalperPatterns: Set<string>;

  constructor() {
    this.knownScalperPatterns = new Set([
      'rapid_multi_event_purchases',
      'consistent_high_markup_resales',
      'bot_like_behavior',
      'multiple_payment_methods',
      'suspicious_account_creation'
    ]);
    
    this.initRedis();
  }

  private initRedis() {
    this.connectionPromise = this.connectRedis();
  }

  private async connectRedis(): Promise<void> {
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      }
    });

    this.redis.on('error', (err: any) => {
      console.error('Redis Client Error (Scalper):', err);
      this.isConnected = false;
    });

    this.redis.on('connect', () => {
      console.log('Redis connected (Scalper)');
      this.isConnected = true;
    });

    try {
      await this.redis.connect();
      this.isConnected = true;
    } catch (err) {
      console.error('Failed to connect to Redis (Scalper):', err);
      this.isConnected = false;
    }
  }

  private async ensureConnection(): Promise<boolean> {
    if (this.connectionPromise) {
      await this.connectionPromise;
    }
    return this.isConnected;
  }

  async detectScalper(
    userId: string,
    purchaseData: any,
    deviceFingerprint: string
  ): Promise<FraudCheck> {
    // Ensure Redis is connected but don't block if it's not
    await this.ensureConnection();
    
    const signals: FraudSignal[] = [];
    let totalScore = 0;

    // Check 1: Purchase velocity
    const velocitySignal = await this.checkPurchaseVelocity(userId);
    if (velocitySignal) {
      signals.push(velocitySignal);
      totalScore += velocitySignal.confidence * 0.3;
    }

    // Check 2: Resale patterns
    const resaleSignal = await this.checkResalePatterns(userId);
    if (resaleSignal) {
      signals.push(resaleSignal);
      totalScore += resaleSignal.confidence * 0.25;
    }

    // Check 3: Multiple accounts
    const multiAccountSignal = await this.checkMultipleAccounts(deviceFingerprint);
    if (multiAccountSignal) {
      signals.push(multiAccountSignal);
      totalScore += multiAccountSignal.confidence * 0.2;
    }

    // Check 4: High-demand targeting
    const demandSignal = await this.checkHighDemandTargeting(userId);
    if (demandSignal) {
      signals.push(demandSignal);
      totalScore += demandSignal.confidence * 0.15;
    }

    // Check 5: Known scalper database
    const knownScalperSignal = await this.checkKnownScalperDatabase(userId, deviceFingerprint);
    if (knownScalperSignal) {
      signals.push(knownScalperSignal);
      totalScore += knownScalperSignal.confidence * 0.1;
    }

    // Determine decision
    const decision = this.determineDecision(totalScore, signals);

    const fraudCheck: FraudCheck = {
      userId,
      ipAddress: purchaseData.ipAddress,
      deviceFingerprint,
      score: totalScore,
      signals,
      decision,
      timestamp: new Date()
    };

    // Store check result
    await this.storeFraudCheck(fraudCheck);

    return fraudCheck;
  }

  private async checkPurchaseVelocity(userId: string): Promise<FraudSignal | null> {
    // Check purchases in last hour
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const velocityQuery = `
      SELECT
        COUNT(*) as purchase_count,
        COUNT(DISTINCT event_id) as unique_events,
        SUM(ticket_count) as total_tickets
      FROM payment_transactions
      WHERE user_id = $1
        AND created_at > $2
        AND status = 'completed'
    `;

    try {
      const result = await query(velocityQuery, [userId, hourAgo]);
      const stats = result.rows[0];

      const purchaseCount = parseInt(stats.purchase_count);
      const uniqueEvents = parseInt(stats.unique_events);
      const totalTickets = parseInt(stats.total_tickets);

      // Suspicious patterns
      if (purchaseCount > 5 || totalTickets > 20 || uniqueEvents > 3) {
        return {
          type: SignalType.RAPID_PURCHASES,
          severity: purchaseCount > 10 ? 'high' : 'medium',
          confidence: Math.min(purchaseCount / 10, 1),
          details: {
            purchaseCount,
            uniqueEvents,
            totalTickets,
            timeWindow: '1_hour'
          }
        };
      }
    } catch (err) {
      console.error('Error checking purchase velocity:', err);
    }

    return null;
  }

  private async checkResalePatterns(userId: string): Promise<FraudSignal | null> {
    // Check resale history
    const resaleQuery = `
      SELECT
        COUNT(*) as total_resales,
        AVG((rl.price - t.original_price) / t.original_price * 100) as avg_markup,
        COUNT(*) FILTER (WHERE rl.created_at < t.purchased_at + INTERVAL '24 hours') as quick_resales
      FROM resale_listings rl
      JOIN tickets t ON rl.ticket_id = t.id
      WHERE rl.seller_id = $1
        AND rl.created_at > CURRENT_DATE - INTERVAL '30 days'
    `;

    try {
      const result = await query(resaleQuery, [userId]);
      const stats = result.rows[0];

      const totalResales = parseInt(stats.total_resales);
      const avgMarkup = parseFloat(stats.avg_markup) || 0;
      const quickResales = parseInt(stats.quick_resales);

      if (totalResales > 10 || avgMarkup > 100 || quickResales > 5) {
        return {
          type: SignalType.KNOWN_SCALPER,
          severity: avgMarkup > 200 ? 'high' : 'medium',
          confidence: Math.min((totalResales + quickResales) / 20, 1),
          details: {
            totalResales,
            averageMarkup: avgMarkup,
            quickResales,
            timeFrame: '30_days'
          }
        };
      }
    } catch (err) {
      console.error('Error checking resale patterns:', err);
    }

    return null;
  }

  private async checkMultipleAccounts(deviceFingerprint: string): Promise<FraudSignal | null> {
    // Check how many accounts use this device
    const deviceQuery = `
      SELECT
        COUNT(DISTINCT user_id) as account_count,
        COUNT(*) as total_transactions
      FROM payment_transactions
      WHERE device_fingerprint = $1
        AND created_at > CURRENT_DATE - INTERVAL '7 days'
    `;

    try {
      const result = await query(deviceQuery, [deviceFingerprint]);
      const stats = result.rows[0];

      const accountCount = parseInt(stats.account_count);
      const totalTransactions = parseInt(stats.total_transactions);

      if (accountCount > 2) {
        return {
          type: SignalType.MULTIPLE_ACCOUNTS,
          severity: accountCount > 5 ? 'high' : 'medium',
          confidence: Math.min(accountCount / 5, 1),
          details: {
            accountCount,
            totalTransactions,
            deviceFingerprint
          }
        };
      }
    } catch (err) {
      console.error('Error checking multiple accounts:', err);
    }

    return null;
  }

  private async checkHighDemandTargeting(userId: string): Promise<FraudSignal | null> {
    // Check if user only buys high-demand events
    const targetingQuery = `
      SELECT
        COUNT(*) FILTER (WHERE e.demand_score > 0.8) as high_demand_purchases,
        COUNT(*) as total_purchases,
        AVG(pt.ticket_count) as avg_tickets_per_purchase
      FROM payment_transactions pt
      JOIN events e ON pt.event_id = e.id
      WHERE pt.user_id = $1
        AND pt.created_at > CURRENT_DATE - INTERVAL '30 days'
        AND pt.status = 'completed'
    `;

    try {
      const result = await query(targetingQuery, [userId]);
      const stats = result.rows[0];

      const highDemandPurchases = parseInt(stats.high_demand_purchases);
      const totalPurchases = parseInt(stats.total_purchases);
      const avgTickets = parseFloat(stats.avg_tickets_per_purchase) || 0;

      const highDemandRatio = totalPurchases > 0 ? highDemandPurchases / totalPurchases : 0;

      if (highDemandRatio > 0.8 && totalPurchases > 5) {
        return {
          type: SignalType.BOT_BEHAVIOR,
          severity: 'medium',
          confidence: highDemandRatio,
          details: {
            highDemandPurchases,
            totalPurchases,
            highDemandRatio,
            averageTicketsPerPurchase: avgTickets
          }
        };
      }
    } catch (err) {
      console.error('Error checking high demand targeting:', err);
    }

    return null;
  }

  private async checkKnownScalperDatabase(
    userId: string,
    deviceFingerprint: string
  ): Promise<FraudSignal | null> {
    // Check if user or device is in known scalper database
    const knownQuery = `
      SELECT
        reason,
        confidence_score,
        added_at
      FROM known_scalpers
      WHERE user_id = $1 OR device_fingerprint = $2
      ORDER BY confidence_score DESC
      LIMIT 1
    `;

    try {
      const result = await query(knownQuery, [userId, deviceFingerprint]);

      if (result.rows.length > 0) {
        const scalper = result.rows[0];

        return {
          type: SignalType.KNOWN_SCALPER,
          severity: 'high',
          confidence: scalper.confidence_score,
          details: {
            reason: scalper.reason,
            addedAt: scalper.added_at,
            source: 'known_scalper_database'
          }
        };
      }
    } catch (err) {
      console.error('Error checking known scalper database:', err);
    }

    return null;
  }

  private determineDecision(score: number, signals: FraudSignal[]): FraudDecision {
    // Check for high-severity signals
    const hasHighSeverity = signals.some(s => s.severity === 'high');

    if (score >= 0.8 || hasHighSeverity) {
      return FraudDecision.DECLINE;
    } else if (score >= 0.6) {
      return FraudDecision.REVIEW;
    } else if (score >= 0.4) {
      return FraudDecision.CHALLENGE;
    } else {
      return FraudDecision.APPROVE;
    }
  }

  private async storeFraudCheck(fraudCheck: FraudCheck): Promise<void> {
    try {
      await query(
        `INSERT INTO fraud_checks
         (user_id, device_fingerprint, score, signals, decision, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          fraudCheck.userId,
          fraudCheck.deviceFingerprint,
          fraudCheck.score,
          JSON.stringify(fraudCheck.signals),
          fraudCheck.decision,
          fraudCheck.timestamp
        ]
      );
    } catch (err) {
      console.error('Error storing fraud check:', err);
    }
  }

  async reportScalper(
    reporterId: string,
    suspectedScalperId: string,
    evidence: any
  ): Promise<void> {
    try {
      // Store user report
      await query(
        `INSERT INTO scalper_reports
         (reporter_id, suspected_scalper_id, evidence, status)
         VALUES ($1, $2, $3, 'pending_review')`,
        [reporterId, suspectedScalperId, JSON.stringify(evidence)]
      );

      // Trigger review if multiple reports
      const reportCount = await this.getReportCount(suspectedScalperId);

      if (reportCount >= 3) {
        await this.triggerManualReview(suspectedScalperId);
      }
    } catch (err) {
      console.error('Error reporting scalper:', err);
    }
  }

  private async getReportCount(userId: string): Promise<number> {
    try {
      const result = await query(
        `SELECT COUNT(*) as count
         FROM scalper_reports
         WHERE suspected_scalper_id = $1
           AND created_at > CURRENT_DATE - INTERVAL '30 days'`,
        [userId]
      );

      return parseInt(result.rows[0].count);
    } catch (err) {
      console.error('Error getting report count:', err);
      return 0;
    }
  }

  private async triggerManualReview(userId: string): Promise<void> {
    console.log(`Triggering manual review for suspected scalper: ${userId}`);

    try {
      // In production, this would create a task for the fraud team
      await query(
        `INSERT INTO fraud_review_queue
         (user_id, reason, priority, status)
         VALUES ($1, 'multiple_scalper_reports', 'high', 'pending')`,
        [userId]
      );
    } catch (err) {
      console.error('Error triggering manual review:', err);
    }
  }
}
