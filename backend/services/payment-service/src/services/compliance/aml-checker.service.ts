import { query } from '../../config/database';
import { complianceConfig } from '../../config/compliance';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'AMLCheckerService' });

export class AMLCheckerService {
  async checkTransaction(
    userId: string,
    amount: number,
    transactionType: string
  ): Promise<{
    passed: boolean;
    flags: string[];
    requiresReview: boolean;
    riskScore: number;
  }> {
    const flags: string[] = [];
    let riskScore = 0;
    
    // Check 1: Transaction amount threshold
    if (amount >= complianceConfig.aml.transactionThreshold) {
      flags.push('high_value_transaction');
      riskScore += 0.3;
    }
    
    // Check 2: Aggregate amount in rolling window
    const aggregateCheck = await this.checkAggregateAmount(userId);
    if (aggregateCheck.exceeds) {
      flags.push('aggregate_threshold_exceeded');
      riskScore += 0.25;
    }
    
    // Check 3: Suspicious patterns
    const patterns = await this.checkSuspiciousPatterns(userId);
    if (patterns.length > 0) {
      flags.push(...patterns.map(p => `pattern_${p.type}`));
      riskScore += patterns.reduce((sum, p) => sum + p.risk, 0);
    }
    
    // Check 4: Sanctions list
    const sanctionsCheck = await this.checkSanctionsList(userId);
    if (sanctionsCheck.matched) {
      flags.push('sanctions_list_match');
      riskScore = 1.0; // Automatic high risk
    }
    
    // Check 5: PEP (Politically Exposed Person)
    const pepCheck = await this.checkPEPStatus(userId);
    if (pepCheck.isPEP) {
      flags.push('politically_exposed_person');
      riskScore += 0.3;
    }
    
    const requiresReview = riskScore >= 0.5 || flags.includes('sanctions_list_match');
    const passed = !requiresReview;
    
    // Record AML check
    await this.recordAMLCheck(userId, amount, transactionType, {
      passed,
      flags,
      requiresReview,
      riskScore
    });
    
    return {
      passed,
      flags,
      requiresReview,
      riskScore
    };
  }
  
  private async checkAggregateAmount(userId: string): Promise<{
    exceeds: boolean;
    amount: number;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const result = await query(
      `SELECT SUM(amount) as total
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > $2
         AND status = 'completed'`,
      [userId, thirtyDaysAgo]
    );
    
    const total = parseFloat(result.rows[0].total) || 0;
    
    return {
      exceeds: total >= complianceConfig.aml.aggregateThreshold,
      amount: total
    };
  }
  
  private async checkSuspiciousPatterns(userId: string): Promise<any[]> {
    const patterns = [];
    
    // Pattern 1: Rapid high-value transactions
    const rapidHighValue = await this.checkRapidHighValuePattern(userId);
    if (rapidHighValue.detected) {
      patterns.push({
        type: 'rapid_high_value',
        risk: 0.2,
        details: rapidHighValue
      });
    }
    
    // Pattern 2: Structured transactions (smurfing)
    const structuring = await this.checkStructuringPattern(userId);
    if (structuring.detected) {
      patterns.push({
        type: 'structured_transactions',
        risk: 0.3,
        details: structuring
      });
    }
    
    // Pattern 3: Unusual geographic patterns
    const geographic = await this.checkGeographicPattern(userId);
    if (geographic.detected) {
      patterns.push({
        type: 'unusual_geography',
        risk: 0.15,
        details: geographic
      });
    }
    
    return patterns;
  }
  
  private async checkRapidHighValuePattern(userId: string): Promise<any> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const result = await query(
      `SELECT COUNT(*) as count, SUM(amount) as total
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > $2
         AND amount > $3
         AND status = 'completed'`,
      [userId, oneDayAgo, 5000]
    );
    
    const count = parseInt(result.rows[0].count);
    const total = parseFloat(result.rows[0].total) || 0;
    
    return {
      detected: count >= 3 || total >= 20000,
      transactionCount: count,
      totalAmount: total
    };
  }
  
  private async checkStructuringPattern(userId: string): Promise<any> {
    // Check for multiple transactions just below reporting threshold
    const result = await query(
      `SELECT 
        COUNT(*) as count,
        AVG(amount) as avg_amount,
        STDDEV(amount) as stddev_amount
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > CURRENT_DATE - INTERVAL '7 days'
         AND amount BETWEEN $2 AND $3
         AND status = 'completed'`,
      [userId, 9000, 9999] // Just below $10k threshold
    );
    
    const count = parseInt(result.rows[0].count);
    const avgAmount = parseFloat(result.rows[0].avg_amount) || 0;
    const stdDev = parseFloat(result.rows[0].stddev_amount) || 0;
    
    // Low standard deviation with multiple transactions suggests structuring
    return {
      detected: count >= 3 && stdDev < 100,
      transactionCount: count,
      averageAmount: avgAmount,
      standardDeviation: stdDev
    };
  }
  
  private async checkGeographicPattern(userId: string): Promise<any> {
    // Check for transactions from unusual locations
    const result = await query(
      `SELECT 
        COUNT(DISTINCT country) as country_count,
        COUNT(DISTINCT state) as state_count,
        array_agg(DISTINCT country) as countries
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > CURRENT_DATE - INTERVAL '30 days'
         AND status = 'completed'`,
      [userId]
    );
    
    const countryCount = parseInt(result.rows[0].country_count);
    const stateCount = parseInt(result.rows[0].state_count);
    const countries = result.rows[0].countries || [];
    
    // High-risk countries
    const highRiskCountries = ['KP', 'IR', 'SY', 'CU', 'VE'];
    const hasHighRiskCountry = countries.some((c: string) => highRiskCountries.includes(c));
    
    return {
      detected: countryCount > 5 || hasHighRiskCountry,
      countryCount,
      stateCount,
      countries,
      hasHighRiskCountry
    };
  }
  
  private async checkSanctionsList(userId: string): Promise<{
    matched: boolean;
    listName?: string;
  }> {
    // In production, integrate with OFAC and other sanctions lists
    // For now, check local database
    const result = await query(
      `SELECT * FROM sanctions_list_matches
       WHERE user_id = $1 AND active = true`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      return {
        matched: true,
        listName: result.rows[0].list_name
      };
    }
    
    return { matched: false };
  }
  
  private async checkPEPStatus(userId: string): Promise<{
    isPEP: boolean;
    details?: any;
  }> {
    // Check if user is a Politically Exposed Person
    const result = await query(
      `SELECT * FROM pep_database
       WHERE user_id = $1 OR linked_user_ids @> ARRAY[$1]`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      return {
        isPEP: true,
        details: {
          position: result.rows[0].position,
          country: result.rows[0].country,
          since: result.rows[0].since_date
        }
      };
    }
    
    return { isPEP: false };
  }
  
  private async recordAMLCheck(
    userId: string,
    amount: number,
    transactionType: string,
    results: any
  ): Promise<void> {
    await query(
      `INSERT INTO aml_checks 
       (user_id, amount, transaction_type, passed, 
        flags, risk_score, requires_review, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        userId,
        amount,
        transactionType,
        results.passed,
        JSON.stringify(results.flags),
        results.riskScore,
        results.requiresReview
      ]
    );
  }
  
  async generateSAR(
    userId: string,
    transactionIds: string[],
    suspiciousActivity: string
  ): Promise<{
    sarId: string;
    filingDeadline: Date;
  }> {
    // Generate Suspicious Activity Report
    const sarId = `SAR-${Date.now()}-${userId.substring(0, 8)}`;
    const filingDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    await query(
      `INSERT INTO suspicious_activity_reports 
       (sar_id, user_id, transaction_ids, activity_description,
        filing_deadline, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)`,
      [
        sarId,
        userId,
        transactionIds,
        suspiciousActivity,
        filingDeadline
      ]
    );
    
    // In production, notify compliance team
    log.info({ sarId, userId }, 'SAR generated');
    
    return {
      sarId,
      filingDeadline
    };
  }
}
