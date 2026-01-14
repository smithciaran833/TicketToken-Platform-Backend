import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import { FraudCheck, FraudSignal, SignalType, FraudDecision } from '../../types/fraud.types';

interface FraudCheckRequest {
  userId: string;
  sessionId: string;
  ipAddress: string;
  deviceFingerprint: string;
  cardFingerprint?: string;
  amount: number;
  eventId?: string;
  userAgent?: string;
  behavioralData?: any;
}

export class AdvancedFraudDetectionService {
  /**
   * Main fraud check - orchestrates all detection methods
   */
  async performFraudCheck(request: FraudCheckRequest): Promise<FraudCheck> {
    const signals: FraudSignal[] = [];
    let totalScore = 0;

    // Run all fraud checks in parallel
    const [
      ipSignal,
      velocitySignal,
      behavioralSignal,
      mlSignal,
      cardSignal,
      accountTakeoverSignal,
      ruleSignals
    ] = await Promise.all([
      this.checkIPReputation(request.ipAddress),
      this.checkVelocityLimits(request),
      this.analyzeBehavior(request),
      this.getMLFraudScore(request),
      request.cardFingerprint ? this.checkCardReputation(request.cardFingerprint) : null,
      this.checkAccountTakeover(request),
      this.evaluateFraudRules(request)
    ]);

    // Aggregate signals
    if (ipSignal) {
      signals.push(ipSignal);
      totalScore += this.calculateSignalScore(ipSignal);
    }

    if (velocitySignal) {
      signals.push(velocitySignal);
      totalScore += this.calculateSignalScore(velocitySignal);
    }

    if (behavioralSignal) {
      signals.push(behavioralSignal);
      totalScore += this.calculateSignalScore(behavioralSignal);
    }

    if (mlSignal) {
      signals.push(mlSignal);
      totalScore += this.calculateSignalScore(mlSignal);
    }

    if (cardSignal) {
      signals.push(cardSignal);
      totalScore += this.calculateSignalScore(cardSignal);
    }

    if (accountTakeoverSignal) {
      signals.push(accountTakeoverSignal);
      totalScore += this.calculateSignalScore(accountTakeoverSignal);
    }

    signals.push(...ruleSignals);
    ruleSignals.forEach(signal => {
      totalScore += this.calculateSignalScore(signal);
    });

    // Normalize score to 0-1
    totalScore = Math.min(totalScore, 1.0);

    // Determine decision
    const decision = this.determineDecision(totalScore, signals);

    const fraudCheck: FraudCheck = {
      userId: request.userId,
      ipAddress: request.ipAddress,
      deviceFingerprint: request.deviceFingerprint,
      score: totalScore,
      signals,
      decision,
      timestamp: new Date()
    };

    // Store check
    await this.storeFraudCheck(fraudCheck);

    // Queue for review if needed
    if (decision === FraudDecision.REVIEW) {
      await this.queueForReview(fraudCheck);
    }

    // Update reputation systems
    await this.updateReputations(request, decision);

    return fraudCheck;
  }

  /**
   * Check IP reputation
   */
  private async checkIPReputation(ipAddress: string): Promise<FraudSignal | null> {
    try {
      const reputation = await db('ip_reputation')
        .where('ip_address', ipAddress)
        .first();

      if (!reputation) {
        // New IP - check with external service (placeholder)
        await this.createIPReputation(ipAddress);
        return null;
      }

      // Update last seen
      await db('ip_reputation')
        .where('ip_address', ipAddress)
        .update({ last_seen: new Date() });

      if (reputation.reputation_status === 'blocked') {
        return {
          type: SignalType.PROXY_DETECTED,
          severity: 'high',
          confidence: 1.0,
          details: {
            ipAddress,
            reason: reputation.blocked_reason,
            blockedAt: reputation.blocked_at
          }
        };
      }

      if (reputation.risk_score > 70) {
        return {
          type: SignalType.PROXY_DETECTED,
          severity: 'high',
          confidence: reputation.risk_score / 100,
          details: {
            ipAddress,
            riskScore: reputation.risk_score,
            fraudCount: reputation.fraud_count,
            isProxy: reputation.is_proxy,
            isVPN: reputation.is_vpn,
            isTor: reputation.is_tor
          }
        };
      }

      if (reputation.is_proxy || reputation.is_vpn || reputation.is_tor) {
        return {
          type: SignalType.PROXY_DETECTED,
          severity: 'medium',
          confidence: 0.7,
          details: {
            ipAddress,
            isProxy: reputation.is_proxy,
            isVPN: reputation.is_vpn,
            isTor: reputation.is_tor
          }
        };
      }

    } catch (error) {
      logger.error('Error checking IP reputation:', error instanceof Error ? error.message : String(error));
    }

    return null;
  }

  /**
   * Check velocity limits
   */
  private async checkVelocityLimits(request: FraudCheckRequest): Promise<FraudSignal | null> {
    try {
      // Check multiple entity types
      const entities = [
        { type: 'user', id: request.userId },
        { type: 'ip', id: request.ipAddress },
        { type: 'device', id: request.deviceFingerprint }
      ];

      if (request.cardFingerprint) {
        entities.push({ type: 'card', id: request.cardFingerprint });
      }

      for (const entity of entities) {
        const limit = await db('velocity_limits')
          .where('entity_type', entity.type)
          .where('entity_id', entity.id)
          .where('action_type', 'purchase')
          .where('window_end', '>', new Date())
          .first();

        if (limit) {
          // Increment counter
          await db('velocity_limits')
            .where('id', limit.id)
            .increment('current_count', 1);

          if (limit.current_count >= limit.limit_count) {
            return {
              type: SignalType.RAPID_PURCHASES,
              severity: 'high',
              confidence: 0.9,
              details: {
                entityType: entity.type,
                count: limit.current_count + 1,
                limit: limit.limit_count,
                windowMinutes: limit.window_minutes
              }
            };
          }
        } else {
          // Create new velocity limit window
          await db('velocity_limits').insert({
            entity_type: entity.type,
            entity_id: entity.id,
            action_type: 'purchase',
            limit_count: 10, // Default limit
            window_minutes: 60,
            current_count: 1,
            window_start: new Date(),
            window_end: new Date(Date.now() + 60 * 60 * 1000)
          });
        }
      }

    } catch (error) {
      logger.error('Error checking velocity limits:', error instanceof Error ? error.message : String(error));
    }

    return null;
  }

  /**
   * Analyze behavioral patterns
   */
  private async analyzeBehavior(request: FraudCheckRequest): Promise<FraudSignal | null> {
    try {
      if (!request.behavioralData) return null;

      const { sessionId, userId } = request;

      // Get recent behavioral data
      const recentBehavior = await db('behavioral_analytics')
        .where('session_id', sessionId)
        .where('user_id', userId)
        .orderBy('timestamp', 'desc')
        .limit(50);

      if (recentBehavior.length === 0) return null;

      // Analyze patterns
      const botIndicators = [];

      // Check for copy-paste
      const copyPasteCount = recentBehavior.filter((b: any) => b.copy_paste_detected).length;
      if (copyPasteCount > 3) {
        botIndicators.push('excessive_copy_paste');
      }

      // Check for form autofill
      const autofillCount = recentBehavior.filter((b: any) => b.form_autofill_detected).length;
      if (autofillCount > 5) {
        botIndicators.push('excessive_autofill');
      }

      // Check mouse movement
      const avgMouseMovements = recentBehavior
        .filter((b: any) => b.mouse_movements != null)
        .reduce((sum: number, b: any) => sum + b.mouse_movements, 0) / recentBehavior.length;

      if (avgMouseMovements < 5) {
        botIndicators.push('low_mouse_activity');
      }

      // Check page time
      const avgTimeOnPage = recentBehavior
        .filter((b: any) => b.time_on_page_ms != null)
        .reduce((sum: number, b: any) => sum + b.time_on_page_ms, 0) / recentBehavior.length;

      if (avgTimeOnPage < 1000) {
        botIndicators.push('unusually_fast_navigation');
      }

      if (botIndicators.length >= 2) {
        return {
          type: SignalType.BOT_BEHAVIOR,
          severity: botIndicators.length >= 3 ? 'high' : 'medium',
          confidence: Math.min(botIndicators.length / 4, 1.0),
          details: {
            indicators: botIndicators,
            sessionId,
            avgMouseMovements,
            avgTimeOnPage
          }
        };
      }

    } catch (error) {
      logger.error('Error analyzing behavior:', error instanceof Error ? error.message : String(error));
    }

    return null;
  }

  /**
   * Get ML fraud score
   */
  private async getMLFraudScore(request: FraudCheckRequest): Promise<FraudSignal | null> {
    try {
      // Get active ML model
      const activeModel = await db('ml_fraud_models')
        .where('status', 'active')
        .orderBy('deployed_at', 'desc')
        .first();

      if (!activeModel) return null;

      // Extract features
      const features = await this.extractFeatures(request);

      // In production, this would call actual ML model
      // For now, simple rule-based scoring
      const fraudProbability = this.calculateMLScore(features);

      // Store prediction
      await db('ml_fraud_predictions').insert({
        model_id: activeModel.id,
        user_id: request.userId,
        fraud_probability: fraudProbability,
        predicted_class: fraudProbability > 0.5 ? 'fraud' : 'legitimate',
        feature_values: JSON.stringify(features),
        prediction_time_ms: 50
      });

      if (fraudProbability > 0.7) {
        return {
          type: SignalType.SUSPICIOUS_CARD,
          severity: 'high',
          confidence: fraudProbability,
          details: {
            modelName: activeModel.model_name,
            fraudProbability,
            features
          }
        };
      }

    } catch (error) {
      logger.error('Error getting ML fraud score:', error instanceof Error ? error.message : String(error));
    }

    return null;
  }

  /**
   * Check card reputation
   */
  private async checkCardReputation(cardFingerprint: string): Promise<FraudSignal | null> {
    try {
      const cardRep = await db('card_fingerprints')
        .where('card_fingerprint', cardFingerprint)
        .first();

      if (!cardRep) return null;

      // Update last used
      await db('card_fingerprints')
        .where('card_fingerprint', cardFingerprint)
        .update({ last_used: new Date() });

      if (cardRep.risk_level === 'blocked') {
        return {
          type: SignalType.SUSPICIOUS_CARD,
          severity: 'high',
          confidence: 1.0,
          details: {
            cardFingerprint,
            riskLevel: cardRep.risk_level,
            chargebackCount: cardRep.chargeback_count,
            fraudCount: cardRep.fraud_count
          }
        };
      }

      if (cardRep.chargeback_count > 0 || cardRep.fraud_count > 0) {
        return {
          type: SignalType.SUSPICIOUS_CARD,
          severity: 'medium',
          confidence: 0.7,
          details: {
            cardFingerprint,
            chargebackCount: cardRep.chargeback_count,
            fraudCount: cardRep.fraud_count
          }
        };
      }

    } catch (error) {
      logger.error('Error checking card reputation:', error instanceof Error ? error.message : String(error));
    }

    return null;
  }

  /**
   * Check for account takeover signals
   */
  private async checkAccountTakeover(request: FraudCheckRequest): Promise<FraudSignal | null> {
    try {
      // Look for recent takeover signals
      const recentSignals = await db('account_takeover_signals')
        .where('user_id', request.userId)
        .where('timestamp', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .where('is_anomaly', true);

      if (recentSignals.length >= 2) {
        return {
          type: SignalType.MULTIPLE_ACCOUNTS,
          severity: 'high',
          confidence: 0.8,
          details: {
            signalCount: recentSignals.length,
            signals: recentSignals.map((s: any) => s.signal_type)
          }
        };
      }

    } catch (error) {
      logger.error('Error checking account takeover:', error instanceof Error ? error.message : String(error));
    }

    return null;
  }

  /**
   * Evaluate custom fraud rules
   */
  private async evaluateFraudRules(request: FraudCheckRequest): Promise<FraudSignal[]> {
    const signals: FraudSignal[] = [];

    try {
      const activeRules = await db('fraud_rules')
        .where('is_active', true)
        .orderBy('priority', 'asc');

      for (const rule of activeRules) {
        const conditions = rule.conditions;

        if (this.evaluateConditions(conditions, request)) {
          // Increment trigger count
          await db('fraud_rules')
            .where('id', rule.id)
            .increment('trigger_count', 1);

          if (rule.action === 'block') {
            await db('fraud_rules')
              .where('id', rule.id)
              .increment('block_count', 1);
          }

          signals.push({
            type: SignalType.BOT_BEHAVIOR,
            severity: rule.action === 'block' ? 'high' : 'medium',
            confidence: 0.8,
            details: {
              ruleName: rule.rule_name,
              ruleAction: rule.action,
              conditions
            }
          });
        }
      }

    } catch (error) {
      logger.error('Error evaluating fraud rules:', error instanceof Error ? error.message : String(error));
    }

    return signals;
  }

  /**
   * Helper methods
   */

  private calculateSignalScore(signal: FraudSignal): number {
    const severityWeight = {
      'low': 0.1,
      'medium': 0.3,
      'high': 0.5
    };

    return (severityWeight[signal.severity] || 0.2) * signal.confidence;
  }

  private determineDecision(score: number, signals: FraudSignal[]): FraudDecision {
    const hasHighSeverity = signals.some(s => s.severity === 'high' && s.confidence > 0.8);

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
      await db('fraud_checks').insert({
        user_id: fraudCheck.userId,
        device_fingerprint: fraudCheck.deviceFingerprint,
        ip_address: fraudCheck.ipAddress,
        score: fraudCheck.score,
        risk_score: fraudCheck.score * 100,
        signals: JSON.stringify(fraudCheck.signals),
        decision: fraudCheck.decision,
        timestamp: fraudCheck.timestamp
      });
    } catch (error) {
      logger.error('Error storing fraud check:', error instanceof Error ? error.message : String(error));
    }
  }

  private async queueForReview(fraudCheck: FraudCheck): Promise<void> {
    try {
      const priority = fraudCheck.score >= 0.7 ? 'high' : 'medium';

      await db('fraud_review_queue').insert({
        user_id: fraudCheck.userId,
        reason: `Fraud score: ${(fraudCheck.score * 100).toFixed(0)}%`,
        priority,
        status: 'pending'
      });

      logger.info({
        userId: fraudCheck.userId,
        score: fraudCheck.score
      });
    } catch (error) {
      logger.error('Error queueing for review:', error instanceof Error ? error.message : String(error));
    }
  }

  private async updateReputations(request: FraudCheckRequest, decision: FraudDecision): Promise<void> {
    try {
      // Update IP reputation
      if (decision === FraudDecision.DECLINE) {
        await db('ip_reputation')
          .where('ip_address', request.ipAddress)
          .increment('fraud_count', 1)
          .increment('risk_score', 10);
      }

      await db('ip_reputation')
        .where('ip_address', request.ipAddress)
        .increment('total_transactions', 1);

      // Update card reputation if available
      if (request.cardFingerprint) {
        if (decision === FraudDecision.APPROVE) {
          await db('card_fingerprints')
            .where('card_fingerprint', request.cardFingerprint)
            .increment('successful_purchases', 1);
        } else if (decision === FraudDecision.DECLINE) {
          await db('card_fingerprints')
            .where('card_fingerprint', request.cardFingerprint)
            .increment('fraud_count', 1);
        }
      }

    } catch (error) {
      logger.error('Error updating reputations:', error instanceof Error ? error.message : String(error));
    }
  }

  private async createIPReputation(ipAddress: string): Promise<void> {
    try {
      await db('ip_reputation').insert({
        ip_address: ipAddress,
        risk_score: 0,
        reputation_status: 'clean',
        first_seen: new Date(),
        last_seen: new Date()
      }).onConflict('ip_address').ignore();
    } catch (error) {
      logger.error('Error creating IP reputation:', error instanceof Error ? error.message : String(error));
    }
  }

  private async extractFeatures(request: FraudCheckRequest): Promise<any> {
    // Extract ML features
    return {
      amount: request.amount,
      hour_of_day: new Date().getHours(),
      day_of_week: new Date().getDay(),
      has_card: !!request.cardFingerprint,
      user_age_days: 30, // Placeholder
      previous_purchases: 0 // Placeholder
    };
  }

  private calculateMLScore(features: any): number {
    // Simple rule-based scoring (replace with actual ML model in production)
    let score = 0;

    if (features.amount > 1000) score += 0.2;
    if (features.hour_of_day < 6 || features.hour_of_day > 22) score += 0.1;
    if (features.user_age_days < 7) score += 0.3;

    return Math.min(score, 1.0);
  }

  private evaluateConditions(conditions: any, request: FraudCheckRequest): boolean {
    // Simple condition evaluation
    if (conditions.min_amount && request.amount < conditions.min_amount) return false;
    if (conditions.max_amount && request.amount > conditions.max_amount) return false;

    return true;
  }
}


let serviceInstance: AdvancedFraudDetectionService | null = null;

export function getAdvancedFraudDetectionService(): AdvancedFraudDetectionService {
  if (!serviceInstance) {
    serviceInstance = new AdvancedFraudDetectionService();
  }
  return serviceInstance;
}

// Backward compatibility
export const advancedFraudDetectionService = new Proxy({} as AdvancedFraudDetectionService, {
  get(target, prop) {
    return (getAdvancedFraudDetectionService() as any)[prop];
  }
});
