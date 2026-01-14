import { query } from '../../config/database';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'BotDetectorService' });

export class BotDetectorService {
  private botIndicators = {
    // Timing patterns
    rapidClicking: { weight: 0.3, threshold: 100 }, // ms between actions
    consistentTiming: { weight: 0.2, threshold: 0.1 }, // timing variance
    impossibleSpeed: { weight: 0.4, threshold: 50 }, // ms to complete form
    
    // Behavior patterns
    noMouseMovement: { weight: 0.3, threshold: 0 },
    linearMousePath: { weight: 0.2, threshold: 0.9 },
    noScrolling: { weight: 0.1, threshold: 0 },
    
    // Technical indicators
    headlessBrowser: { weight: 0.4, threshold: 1 },
    automationTools: { weight: 0.5, threshold: 1 },
    suspiciousUserAgent: { weight: 0.3, threshold: 1 }
  };
  
  async detectBot(sessionData: {
    userId: string;
    sessionId: string;
    userAgent: string;
    actions: Array<{
      type: string;
      timestamp: number;
      x?: number;
      y?: number;
    }>;
    browserFeatures: {
      webdriver?: boolean;
      languages?: string[];
      plugins?: any[];
      permissions?: any;
      webgl?: string;
    };
  }): Promise<{
    isBot: boolean;
    confidence: number;
    indicators: string[];
    recommendation: string;
  }> {
    const indicators: string[] = [];
    let totalScore = 0;
    
    // Check timing patterns
    const timingScore = this.analyzeTimingPatterns(sessionData.actions);
    if (timingScore.score > 0) {
      indicators.push(...timingScore.indicators);
      totalScore += timingScore.score;
    }
    
    // Check mouse patterns
    const mouseScore = this.analyzeMousePatterns(sessionData.actions);
    if (mouseScore.score > 0) {
      indicators.push(...mouseScore.indicators);
      totalScore += mouseScore.score;
    }
    
    // Check browser features
    const browserScore = this.analyzeBrowserFeatures(
      sessionData.browserFeatures,
      sessionData.userAgent
    );
    if (browserScore.score > 0) {
      indicators.push(...browserScore.indicators);
      totalScore += browserScore.score;
    }
    
    // Check historical patterns
    const historicalScore = await this.analyzeHistoricalPatterns(
      sessionData.userId,
      sessionData.sessionId
    );
    if (historicalScore.score > 0) {
      indicators.push(...historicalScore.indicators);
      totalScore += historicalScore.score;
    }
    
    // Determine if bot
    const confidence = Math.min(totalScore, 1);
    const isBot = confidence >= 0.7;
    
    // Record detection
    await this.recordBotDetection(sessionData, {
      isBot,
      confidence,
      indicators
    });
    
    return {
      isBot,
      confidence,
      indicators,
      recommendation: this.getRecommendation(confidence, indicators)
    };
  }
  
  private analyzeTimingPatterns(actions: any[]): {
    score: number;
    indicators: string[];
  } {
    if (actions.length < 2) {
      return { score: 0, indicators: [] };
    }
    
    const indicators: string[] = [];
    let score = 0;
    
    // Calculate time between actions
    const timeDiffs: number[] = [];
    for (let i = 1; i < actions.length; i++) {
      timeDiffs.push(actions[i].timestamp - actions[i - 1].timestamp);
    }
    
    // Check for rapid clicking
    const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    if (avgTimeDiff < this.botIndicators.rapidClicking.threshold) {
      indicators.push('rapid_clicking');
      score += this.botIndicators.rapidClicking.weight;
    }
    
    // Check for consistent timing (low variance)
    const variance = this.calculateVariance(timeDiffs);
    const coefficientOfVariation = variance / avgTimeDiff;
    
    if (coefficientOfVariation < this.botIndicators.consistentTiming.threshold) {
      indicators.push('consistent_timing');
      score += this.botIndicators.consistentTiming.weight;
    }
    
    // Check for impossible speed
    const formCompletionTime = actions[actions.length - 1].timestamp - actions[0].timestamp;
    if (formCompletionTime < this.botIndicators.impossibleSpeed.threshold) {
      indicators.push('impossible_speed');
      score += this.botIndicators.impossibleSpeed.weight;
    }
    
    return { score, indicators };
  }
  
  private analyzeMousePatterns(actions: any[]): {
    score: number;
    indicators: string[];
  } {
    const mouseActions = actions.filter(a => 
      a.type === 'mousemove' || a.type === 'click'
    );
    
    if (mouseActions.length < 5) {
      return { score: 0, indicators: [] };
    }
    
    const indicators: string[] = [];
    let score = 0;
    
    // Check for mouse movement
    const hasMouseMovement = mouseActions.some(a => a.type === 'mousemove');
    if (!hasMouseMovement) {
      indicators.push('no_mouse_movement');
      score += this.botIndicators.noMouseMovement.weight;
    }
    
    // Check for linear paths
    if (mouseActions.length >= 3) {
      const linearity = this.calculatePathLinearity(mouseActions);
      if (linearity > this.botIndicators.linearMousePath.threshold) {
        indicators.push('linear_mouse_path');
        score += this.botIndicators.linearMousePath.weight;
      }
    }
    
    // Check for scrolling
    const hasScrolling = actions.some(a => a.type === 'scroll');
    if (!hasScrolling && actions.length > 10) {
      indicators.push('no_scrolling');
      score += this.botIndicators.noScrolling.weight;
    }
    
    return { score, indicators };
  }
  
  private analyzeBrowserFeatures(
    features: any,
    userAgent: string
  ): {
    score: number;
    indicators: string[];
  } {
    const indicators: string[] = [];
    let score = 0;
    
    // Check for webdriver
    if (features.webdriver) {
      indicators.push('webdriver_detected');
      score += this.botIndicators.headlessBrowser.weight;
    }
    
    // Check for headless browser indicators
    if (!features.plugins || features.plugins.length === 0) {
      indicators.push('no_plugins');
      score += 0.1;
    }
    
    if (!features.languages || features.languages.length === 0) {
      indicators.push('no_languages');
      score += 0.1;
    }
    
    // Check user agent
    const suspiciousPatterns = [
      /headless/i,
      /phantom/i,
      /selenium/i,
      /puppeteer/i,
      /playwright/i
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
      indicators.push('suspicious_user_agent');
      score += this.botIndicators.suspiciousUserAgent.weight;
    }
    
    return { score, indicators };
  }
  
  private async analyzeHistoricalPatterns(
    userId: string,
    sessionId: string
  ): Promise<{
    score: number;
    indicators: string[];
  }> {
    const indicators: string[] = [];
    let score = 0;
    
    // Check for multiple failed attempts
    const failedAttempts = await query(
      `SELECT COUNT(*) as count
       FROM bot_detections
       WHERE user_id = $1
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
         AND is_bot = true`,
      [userId]
    );
    
    if (parseInt(failedAttempts.rows[0].count) > 3) {
      indicators.push('multiple_bot_detections');
      score += 0.3;
    }
    
    // Check for IP reputation
    const ipReputation = await this.checkIPReputation(sessionId);
    if (ipReputation.suspicious) {
      indicators.push('suspicious_ip');
      score += 0.2;
    }
    
    return { score, indicators };
  }
  
  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
  }
  
  private calculatePathLinearity(mouseActions: any[]): number {
    if (mouseActions.length < 3) return 0;
    
    // Calculate the straightness of the path
    let totalDistance = 0;
    let directDistance = 0;
    
    for (let i = 1; i < mouseActions.length; i++) {
      const dx = mouseActions[i].x - mouseActions[i - 1].x;
      const dy = mouseActions[i].y - mouseActions[i - 1].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    
    const firstPoint = mouseActions[0];
    const lastPoint = mouseActions[mouseActions.length - 1];
    const dx = lastPoint.x - firstPoint.x;
    const dy = lastPoint.y - firstPoint.y;
    directDistance = Math.sqrt(dx * dx + dy * dy);
    
    return directDistance / (totalDistance || 1);
  }
  
  private async checkIPReputation(sessionId: string): Promise<{
    suspicious: boolean;
  }> {
    // Check if IP is from known bot networks, VPNs, or proxies
    // In production, integrate with IP reputation service
    return { suspicious: false };
  }
  
  private getRecommendation(confidence: number, indicators: string[]): string {
    if (confidence >= 0.9) {
      return 'block_immediately';
    } else if (confidence >= 0.7) {
      return 'require_captcha';
    } else if (confidence >= 0.5) {
      return 'increase_monitoring';
    } else {
      return 'allow';
    }
  }
  
  private async recordBotDetection(
    sessionData: any,
    detection: any
  ): Promise<void> {
    await query(
      `INSERT INTO bot_detections 
       (user_id, session_id, is_bot, confidence, 
        indicators, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [
        sessionData.userId,
        sessionData.sessionId,
        detection.isBot,
        detection.confidence,
        JSON.stringify(detection.indicators),
        sessionData.userAgent
      ]
    );
  }
  
  async trainModel(verifiedData: Array<{
    sessionId: string;
    wasBot: boolean;
  }>): Promise<void> {
    // Update bot detection model based on verified data
    // In production, this would update ML model weights
    log.info({ sampleCount: verifiedData.length }, 'Training bot detection model');
  }
}
