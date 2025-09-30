export class MockFraudService {
  checkTransaction(userId: string, amount: number, deviceFingerprint: string) {
    // Simulate fraud scoring
    const score = Math.random() * 0.5; // 0-0.5 for testing
    const isHighRisk = score > 0.4;
    
    return {
      score,
      decision: isHighRisk ? 'review' : 'approve',
      signals: isHighRisk ? ['rapid_purchases', 'new_device'] : [],
      details: {
        userId,
        amount,
        deviceFingerprint,
        timestamp: new Date()
      }
    };
  }
  
  checkVelocity(userId: string) {
    // Mock velocity check
    const recentPurchases = Math.floor(Math.random() * 5);
    const withinLimit = recentPurchases < 3;
    
    return {
      allowed: withinLimit,
      recentPurchases,
      limit: 3,
      timeWindow: '1 hour'
    };
  }
}
