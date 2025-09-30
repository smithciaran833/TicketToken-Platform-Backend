import { db } from './database.service';

export class RiskService {
  async calculateRiskScore(venueId: string): Promise<{
    score: number;
    factors: string[];
    recommendation: string;
  }> {
    let score = 0;
    const factors: string[] = [];
    
    // Check verification status (0-30 points)
    const verificationResult = await db.query(
      'SELECT * FROM venue_verifications WHERE venue_id = $1',
      [venueId]
    );
    
    if (verificationResult.rows.length === 0) {
      score += 30;
      factors.push('No verification started');
    } else {
      const verification = verificationResult.rows[0];
      
      if (verification.status === 'rejected') {
        score += 50;
        factors.push('Previously rejected');
      }
      if (verification.status === 'pending') {
        score += 20;
        factors.push('Verification pending');
      }
      if (!verification.ein) {
        score += 15;
        factors.push('Missing EIN');
      }
      if (!verification.w9_uploaded) {
        score += 10;
        factors.push('No W-9 on file');
      }
      if (!verification.bank_verified) {
        score += 10;
        factors.push('Bank not verified');
      }
    }
    
    // Check OFAC status (0-40 points)
    const ofacResult = await db.query(
      'SELECT * FROM ofac_checks WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
      [venueId]
    );
    
    if (ofacResult.rows.length > 0 && ofacResult.rows[0].is_match) {
      score += 40;
      factors.push('OFAC match found');
    }
    
    // Check transaction patterns (0-30 points)
    const velocityCheck = await this.checkVelocity(venueId);
    if (velocityCheck.suspicious) {
      score += velocityCheck.riskPoints;
      factors.push(velocityCheck.reason);
    }
    
    // Determine recommendation
    let recommendation = '';
    if (score >= 70) {
      recommendation = 'BLOCK';
    } else if (score >= 50) {
      recommendation = 'MANUAL_REVIEW';
    } else if (score >= 30) {
      recommendation = 'MONITOR';
    } else {
      recommendation = 'APPROVE';
    }
    
    // Store risk assessment
    await db.query(
      `INSERT INTO risk_assessments 
       (venue_id, risk_score, factors, recommendation, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [venueId, score, JSON.stringify(factors), recommendation]
    );
    
    return { score, factors, recommendation };
  }
  
  private async checkVelocity(venueId: string): Promise<{
    suspicious: boolean;
    riskPoints: number;
    reason: string;
  }> {
    // Check for suspicious patterns in last 24 hours
    const result = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as total
       FROM tax_records 
       WHERE venue_id = $1 
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [venueId]
    );
    
    const count = parseInt(result.rows[0]?.count || '0');
    const total = parseFloat(result.rows[0]?.total || '0');
    
    // High velocity checks
    if (count > 100) {
      return {
        suspicious: true,
        riskPoints: 20,
        reason: `High transaction velocity: ${count} in 24h`
      };
    }
    
    if (total > 10000) {
      return {
        suspicious: true,
        riskPoints: 25,
        reason: `High transaction volume: $${total} in 24h`
      };
    }
    
    return {
      suspicious: false,
      riskPoints: 0,
      reason: ''
    };
  }
  
  async flagForReview(venueId: string, reason: string): Promise<void> {
    await db.query(
      `INSERT INTO risk_flags (venue_id, reason, created_at) 
       VALUES ($1, $2, NOW())`,
      [venueId, reason]
    );
    
    console.log(`🚩 Venue ${venueId} flagged for review: ${reason}`);
    
    // TODO: Send notification to admin
  }
  
  async resolveFlag(flagId: number, resolution: string): Promise<void> {
    await db.query(
      `UPDATE risk_flags 
       SET resolved = true, resolution = $2, resolved_at = NOW()
       WHERE id = $1`,
      [flagId, resolution]
    );
  }
}

export const riskService = new RiskService();
