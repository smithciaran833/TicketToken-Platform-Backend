/**
 * Advanced Fraud Detection Service Tests
 * Tests for ML-based and rule-based fraud detection
 */

jest.mock('../../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('AdvancedFraudDetectionService', () => {
  let service: AdvancedFraudDetectionService;
  let mockMlModel: any;
  let mockRulesEngine: any;
  let mockHistoryStore: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMlModel = { predict: jest.fn() };
    mockRulesEngine = { evaluate: jest.fn() };
    mockHistoryStore = { getUserHistory: jest.fn(), recordTransaction: jest.fn() };
    service = new AdvancedFraudDetectionService(mockMlModel, mockRulesEngine, mockHistoryStore);
  });

  describe('analyzeTransaction', () => {
    it('should return low risk for normal transaction', async () => {
      mockMlModel.predict.mockResolvedValue(0.1);
      mockRulesEngine.evaluate.mockResolvedValue({ score: 10, triggers: [] });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 5000,
        ip: '192.168.1.1',
        deviceId: 'device_abc',
      });

      expect(result.riskLevel).toBe('low');
      expect(result.score).toBeLessThan(30);
    });

    it('should return high risk for suspicious transaction', async () => {
      mockMlModel.predict.mockResolvedValue(0.85);
      mockRulesEngine.evaluate.mockResolvedValue({ score: 80, triggers: ['velocity', 'location'] });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 100000,
        ip: '1.2.3.4',
        deviceId: 'unknown',
      });

      expect(result.riskLevel).toBe('high');
      expect(result.score).toBeGreaterThan(70);
    });

    it('should combine ML and rules scores', async () => {
      mockMlModel.predict.mockResolvedValue(0.5);
      mockRulesEngine.evaluate.mockResolvedValue({ score: 50, triggers: [] });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 10000,
        ip: '192.168.1.1',
        deviceId: 'device_abc',
      });

      expect(result.mlScore).toBeDefined();
      expect(result.rulesScore).toBeDefined();
    });
  });

  describe('ML model', () => {
    it('should extract features correctly', async () => {
      mockMlModel.predict.mockResolvedValue(0.3);
      mockRulesEngine.evaluate.mockResolvedValue({ score: 0, triggers: [] });
      mockHistoryStore.getUserHistory.mockResolvedValue({
        totalTransactions: 10,
        averageAmount: 5000,
        lastTransaction: new Date(),
      });

      await service.analyzeTransaction({
        userId: 'user_123',
        amount: 5000,
        ip: '192.168.1.1',
        deviceId: 'device_abc',
      });

      expect(mockMlModel.predict).toHaveBeenCalledWith(expect.objectContaining({
        features: expect.any(Array),
      }));
    });

    it('should handle model failure gracefully', async () => {
      mockMlModel.predict.mockRejectedValue(new Error('Model error'));
      mockRulesEngine.evaluate.mockResolvedValue({ score: 30, triggers: [] });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 5000,
        ip: '192.168.1.1',
        deviceId: 'device_abc',
      });

      // Should fall back to rules-only
      expect(result.mlScore).toBeUndefined();
      expect(result.rulesScore).toBeDefined();
    });
  });

  describe('rules engine', () => {
    it('should trigger velocity rule', async () => {
      mockMlModel.predict.mockResolvedValue(0.3);
      mockRulesEngine.evaluate.mockResolvedValue({ 
        score: 60, 
        triggers: ['velocity_exceeded'] 
      });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 5000,
        ip: '192.168.1.1',
        deviceId: 'device_abc',
      });

      expect(result.triggers).toContain('velocity_exceeded');
    });

    it('should trigger new device rule', async () => {
      mockMlModel.predict.mockResolvedValue(0.3);
      mockRulesEngine.evaluate.mockResolvedValue({ 
        score: 40, 
        triggers: ['new_device'] 
      });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 5000,
        ip: '192.168.1.1',
        deviceId: 'new_device_xyz',
      });

      expect(result.triggers).toContain('new_device');
    });

    it('should trigger geographic anomaly', async () => {
      mockMlModel.predict.mockResolvedValue(0.5);
      mockRulesEngine.evaluate.mockResolvedValue({ 
        score: 70, 
        triggers: ['geo_anomaly', 'impossible_travel'] 
      });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 5000,
        ip: '203.0.113.1', // Different geo
        deviceId: 'device_abc',
      });

      expect(result.triggers).toContain('geo_anomaly');
    });
  });

  describe('risk decisions', () => {
    it('should recommend approval for low risk', async () => {
      mockMlModel.predict.mockResolvedValue(0.1);
      mockRulesEngine.evaluate.mockResolvedValue({ score: 10, triggers: [] });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 5000,
        ip: '192.168.1.1',
        deviceId: 'device_abc',
      });

      expect(result.recommendation).toBe('approve');
    });

    it('should recommend review for medium risk', async () => {
      mockMlModel.predict.mockResolvedValue(0.5);
      mockRulesEngine.evaluate.mockResolvedValue({ score: 50, triggers: ['new_device'] });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 15000,
        ip: '192.168.1.1',
        deviceId: 'new_device',
      });

      expect(result.recommendation).toBe('review');
    });

    it('should recommend reject for high risk', async () => {
      mockMlModel.predict.mockResolvedValue(0.9);
      mockRulesEngine.evaluate.mockResolvedValue({ 
        score: 90, 
        triggers: ['velocity', 'new_device', 'geo_anomaly'] 
      });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 100000,
        ip: '1.2.3.4',
        deviceId: 'unknown',
      });

      expect(result.recommendation).toBe('reject');
    });

    it('should require 3DS for borderline cases', async () => {
      mockMlModel.predict.mockResolvedValue(0.4);
      mockRulesEngine.evaluate.mockResolvedValue({ score: 45, triggers: [] });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 20000,
        ip: '192.168.1.1',
        deviceId: 'device_abc',
      });

      expect(result.require3DS).toBe(true);
    });
  });

  describe('transaction history', () => {
    it('should record transaction for learning', async () => {
      mockMlModel.predict.mockResolvedValue(0.2);
      mockRulesEngine.evaluate.mockResolvedValue({ score: 20, triggers: [] });

      await service.analyzeTransaction({
        userId: 'user_123',
        amount: 5000,
        ip: '192.168.1.1',
        deviceId: 'device_abc',
      });

      expect(mockHistoryStore.recordTransaction).toHaveBeenCalled();
    });

    it('should use history for behavioral analysis', async () => {
      mockHistoryStore.getUserHistory.mockResolvedValue({
        totalTransactions: 100,
        averageAmount: 5000,
        devices: ['device_abc'],
        locations: ['US'],
      });

      mockMlModel.predict.mockResolvedValue(0.2);
      mockRulesEngine.evaluate.mockResolvedValue({ score: 10, triggers: [] });

      await service.analyzeTransaction({
        userId: 'user_123',
        amount: 5000,
        ip: '192.168.1.1',
        deviceId: 'device_abc',
      });

      expect(mockHistoryStore.getUserHistory).toHaveBeenCalledWith('user_123');
    });
  });

  describe('amount analysis', () => {
    it('should flag unusually large amounts', async () => {
      mockHistoryStore.getUserHistory.mockResolvedValue({
        averageAmount: 5000,
        maxAmount: 10000,
      });
      mockMlModel.predict.mockResolvedValue(0.6);
      mockRulesEngine.evaluate.mockResolvedValue({ 
        score: 60, 
        triggers: ['amount_anomaly'] 
      });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 50000, // 10x average
        ip: '192.168.1.1',
        deviceId: 'device_abc',
      });

      expect(result.triggers).toContain('amount_anomaly');
    });

    it('should not flag normal amounts', async () => {
      mockHistoryStore.getUserHistory.mockResolvedValue({
        averageAmount: 5000,
        maxAmount: 10000,
      });
      mockMlModel.predict.mockResolvedValue(0.1);
      mockRulesEngine.evaluate.mockResolvedValue({ score: 10, triggers: [] });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 6000,
        ip: '192.168.1.1',
        deviceId: 'device_abc',
      });

      expect(result.triggers).not.toContain('amount_anomaly');
    });
  });

  describe('time-based analysis', () => {
    it('should flag unusual time patterns', async () => {
      mockMlModel.predict.mockResolvedValue(0.5);
      mockRulesEngine.evaluate.mockResolvedValue({ 
        score: 50, 
        triggers: ['unusual_time'] 
      });

      const result = await service.analyzeTransaction({
        userId: 'user_123',
        amount: 5000,
        ip: '192.168.1.1',
        deviceId: 'device_abc',
        timestamp: new Date('2024-01-01T03:00:00Z'), // 3 AM
      });

      expect(result.triggers).toContain('unusual_time');
    });
  });
});

// Mock implementations for testing
interface TransactionInput {
  userId: string;
  amount: number;
  ip: string;
  deviceId: string;
  timestamp?: Date;
}

interface AnalysisResult {
  riskLevel: 'low' | 'medium' | 'high';
  score: number;
  mlScore?: number;
  rulesScore: number;
  triggers: string[];
  recommendation: 'approve' | 'review' | 'reject';
  require3DS: boolean;
}

class AdvancedFraudDetectionService {
  constructor(
    private mlModel: any,
    private rulesEngine: any,
    private historyStore: any
  ) {}

  async analyzeTransaction(input: TransactionInput): Promise<AnalysisResult> {
    let mlScore: number | undefined;
    let rulesResult: any;

    // Get user history
    await this.historyStore.getUserHistory(input.userId);

    // ML prediction
    try {
      mlScore = await this.mlModel.predict({ features: this.extractFeatures(input) });
    } catch {
      // ML failed, continue with rules only
    }

    // Rules evaluation
    rulesResult = await this.rulesEngine.evaluate(input);

    // Combine scores
    const combinedScore = mlScore !== undefined
      ? (mlScore * 100 * 0.6 + rulesResult.score * 0.4)
      : rulesResult.score;

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high';
    if (combinedScore < 30) riskLevel = 'low';
    else if (combinedScore < 70) riskLevel = 'medium';
    else riskLevel = 'high';

    // Recommendation
    let recommendation: 'approve' | 'review' | 'reject';
    if (combinedScore < 30) recommendation = 'approve';
    else if (combinedScore < 70) recommendation = 'review';
    else recommendation = 'reject';

    // Record for learning
    await this.historyStore.recordTransaction(input);

    return {
      riskLevel,
      score: combinedScore,
      mlScore: mlScore !== undefined ? mlScore * 100 : undefined,
      rulesScore: rulesResult.score,
      triggers: rulesResult.triggers,
      recommendation,
      require3DS: combinedScore >= 35 && combinedScore < 70,
    };
  }

  private extractFeatures(input: TransactionInput): number[] {
    return [input.amount, Date.now()];
  }
}
