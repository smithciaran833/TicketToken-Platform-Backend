import { MockFraudService } from '../../../../src/services/mock/mock-fraud.service';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('MockFraudService', () => {
  let mockFraudService: MockFraudService;

  beforeEach(() => {
    mockFraudService = new MockFraudService();
    // Mock Math.random for predictable testing
    jest.spyOn(Math, 'random');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ===========================================================================
  // checkTransaction() - 10 test cases
  // ===========================================================================

  describe('checkTransaction()', () => {
    it('should return fraud check result', () => {
      const result = mockFraudService.checkTransaction(
        'user-123',
        100.00,
        'device-fingerprint-abc'
      );

      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('signals');
      expect(result).toHaveProperty('details');
    });

    it('should generate score between 0 and 0.5', () => {
      (Math.random as jest.Mock).mockReturnValue(0.8);
      
      const result = mockFraudService.checkTransaction('user-123', 100, 'device-abc');

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(0.5);
      expect(result.score).toBe(0.4);
    });

    it('should mark as review when score above 0.4', () => {
      (Math.random as jest.Mock).mockReturnValue(0.9); // 0.9 * 0.5 = 0.45
      
      const result = mockFraudService.checkTransaction('user-123', 100, 'device-abc');

      expect(result.decision).toBe('review');
    });

    it('should mark as approve when score 0.4 or below', () => {
      (Math.random as jest.Mock).mockReturnValue(0.6); // 0.6 * 0.5 = 0.3
      
      const result = mockFraudService.checkTransaction('user-123', 100, 'device-abc');

      expect(result.decision).toBe('approve');
    });

    it('should include signals for high risk transactions', () => {
      (Math.random as jest.Mock).mockReturnValue(0.9);
      
      const result = mockFraudService.checkTransaction('user-123', 100, 'device-abc');

      expect(result.signals).toEqual(['rapid_purchases', 'new_device']);
    });

    it('should have empty signals for approved transactions', () => {
      (Math.random as jest.Mock).mockReturnValue(0.5);
      
      const result = mockFraudService.checkTransaction('user-123', 100, 'device-abc');

      expect(result.signals).toEqual([]);
    });

    it('should include userId in details', () => {
      const result = mockFraudService.checkTransaction(
        'user-456',
        200,
        'device-xyz'
      );

      expect(result.details.userId).toBe('user-456');
    });

    it('should include amount in details', () => {
      const result = mockFraudService.checkTransaction(
        'user-123',
        350.75,
        'device-abc'
      );

      expect(result.details.amount).toBe(350.75);
    });

    it('should include device fingerprint in details', () => {
      const result = mockFraudService.checkTransaction(
        'user-123',
        100,
        'fingerprint-xyz-789'
      );

      expect(result.details.deviceFingerprint).toBe('fingerprint-xyz-789');
    });

    it('should include timestamp in details', () => {
      const result = mockFraudService.checkTransaction(
        'user-123',
        100,
        'device-abc'
      );

      expect(result.details.timestamp).toBeInstanceOf(Date);
    });
  });

  // ===========================================================================
  // checkVelocity() - 8 test cases
  // ===========================================================================

  describe('checkVelocity()', () => {
    it('should return velocity check result', () => {
      const result = mockFraudService.checkVelocity('user-123');

      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('recentPurchases');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('timeWindow');
    });

    it('should generate random number of recent purchases', () => {
      (Math.random as jest.Mock).mockReturnValue(0.5);
      
      const result = mockFraudService.checkVelocity('user-123');

      expect(result.recentPurchases).toBeGreaterThanOrEqual(0);
      expect(result.recentPurchases).toBeLessThan(5);
    });

    it('should allow when purchases below limit', () => {
      (Math.random as jest.Mock).mockReturnValue(0.3); // Floor(0.3 * 5) = 1
      
      const result = mockFraudService.checkVelocity('user-123');

      expect(result.allowed).toBe(true);
      expect(result.recentPurchases).toBeLessThan(3);
    });

    it('should deny when purchases at or above limit', () => {
      (Math.random as jest.Mock).mockReturnValue(0.7); // Floor(0.7 * 5) = 3
      
      const result = mockFraudService.checkVelocity('user-123');

      expect(result.allowed).toBe(false);
      expect(result.recentPurchases).toBeGreaterThanOrEqual(3);
    });

    it('should set limit to 3', () => {
      const result = mockFraudService.checkVelocity('user-123');

      expect(result.limit).toBe(3);
    });

    it('should set time window to 1 hour', () => {
      const result = mockFraudService.checkVelocity('user-123');

      expect(result.timeWindow).toBe('1 hour');
    });

    it('should work with different user ids', () => {
      const result1 = mockFraudService.checkVelocity('user-111');
      const result2 = mockFraudService.checkVelocity('user-222');

      expect(result1).toHaveProperty('allowed');
      expect(result2).toHaveProperty('allowed');
    });

    it('should return consistent structure', () => {
      const result = mockFraudService.checkVelocity('user-test');

      expect(Object.keys(result)).toEqual([
        'allowed',
        'recentPurchases',
        'limit',
        'timeWindow',
      ]);
    });
  });
});
