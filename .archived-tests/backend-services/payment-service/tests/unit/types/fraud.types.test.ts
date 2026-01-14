// =============================================================================
// TEST SUITE: fraud.types
// =============================================================================

import { FraudCheck, FraudSignal, SignalType, FraudDecision } from '../../../src/types/fraud.types';

describe('fraud.types', () => {
  // ===========================================================================
  // FraudCheck Interface - 5 test cases
  // ===========================================================================

  describe('FraudCheck Interface', () => {
    it('should allow valid FraudCheck object', () => {
      const fraudCheck: FraudCheck = {
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        deviceFingerprint: 'fp-abc123',
        score: 0.75,
        signals: [],
        decision: FraudDecision.REVIEW,
        timestamp: new Date(),
      };

      expect(fraudCheck.userId).toBe('user-123');
      expect(fraudCheck.ipAddress).toBe('192.168.1.1');
      expect(fraudCheck.deviceFingerprint).toBe('fp-abc123');
      expect(fraudCheck.score).toBe(0.75);
      expect(fraudCheck.signals).toEqual([]);
      expect(fraudCheck.decision).toBe(FraudDecision.REVIEW);
      expect(fraudCheck.timestamp).toBeInstanceOf(Date);
    });

    it('should allow FraudCheck with multiple signals', () => {
      const signals: FraudSignal[] = [
        {
          type: SignalType.RAPID_PURCHASES,
          severity: 'high',
          confidence: 0.9,
          details: { count: 5 },
        },
        {
          type: SignalType.BOT_BEHAVIOR,
          severity: 'medium',
          confidence: 0.7,
          details: { pattern: 'automated' },
        },
      ];

      const fraudCheck: FraudCheck = {
        userId: 'user-456',
        ipAddress: '10.0.0.1',
        deviceFingerprint: 'fp-xyz789',
        score: 0.85,
        signals,
        decision: FraudDecision.DECLINE,
        timestamp: new Date(),
      };

      expect(fraudCheck.signals).toHaveLength(2);
    });

    it('should store timestamp as Date object', () => {
      const now = new Date();
      const fraudCheck: FraudCheck = {
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        deviceFingerprint: 'fp-abc',
        score: 0.5,
        signals: [],
        decision: FraudDecision.APPROVE,
        timestamp: now,
      };

      expect(fraudCheck.timestamp).toBe(now);
      expect(fraudCheck.timestamp.getTime()).toBe(now.getTime());
    });

    it('should allow score as decimal number', () => {
      const fraudCheck: FraudCheck = {
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        deviceFingerprint: 'fp-abc',
        score: 0.456789,
        signals: [],
        decision: FraudDecision.CHALLENGE,
        timestamp: new Date(),
      };

      expect(fraudCheck.score).toBe(0.456789);
    });

    it('should allow empty signals array', () => {
      const fraudCheck: FraudCheck = {
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        deviceFingerprint: 'fp-abc',
        score: 0.2,
        signals: [],
        decision: FraudDecision.APPROVE,
        timestamp: new Date(),
      };

      expect(fraudCheck.signals).toEqual([]);
      expect(fraudCheck.signals).toHaveLength(0);
    });
  });

  // ===========================================================================
  // FraudSignal Interface - 6 test cases
  // ===========================================================================

  describe('FraudSignal Interface', () => {
    it('should allow valid FraudSignal object', () => {
      const signal: FraudSignal = {
        type: SignalType.KNOWN_SCALPER,
        severity: 'high',
        confidence: 0.95,
        details: { reason: 'matched known pattern' },
      };

      expect(signal.type).toBe(SignalType.KNOWN_SCALPER);
      expect(signal.severity).toBe('high');
      expect(signal.confidence).toBe(0.95);
      expect(signal.details).toEqual({ reason: 'matched known pattern' });
    });

    it('should allow low severity', () => {
      const signal: FraudSignal = {
        type: SignalType.RAPID_PURCHASES,
        severity: 'low',
        confidence: 0.3,
        details: {},
      };

      expect(signal.severity).toBe('low');
    });

    it('should allow medium severity', () => {
      const signal: FraudSignal = {
        type: SignalType.PROXY_DETECTED,
        severity: 'medium',
        confidence: 0.6,
        details: {},
      };

      expect(signal.severity).toBe('medium');
    });

    it('should allow high severity', () => {
      const signal: FraudSignal = {
        type: SignalType.BOT_BEHAVIOR,
        severity: 'high',
        confidence: 0.9,
        details: {},
      };

      expect(signal.severity).toBe('high');
    });

    it('should allow any details object', () => {
      const signal: FraudSignal = {
        type: SignalType.MULTIPLE_ACCOUNTS,
        severity: 'medium',
        confidence: 0.7,
        details: {
          accountCount: 5,
          sharedData: ['email', 'phone'],
          timestamp: new Date().toISOString(),
        },
      };

      expect(signal.details).toHaveProperty('accountCount');
      expect(signal.details).toHaveProperty('sharedData');
      expect(signal.details).toHaveProperty('timestamp');
    });

    it('should allow empty details object', () => {
      const signal: FraudSignal = {
        type: SignalType.SUSPICIOUS_CARD,
        severity: 'low',
        confidence: 0.4,
        details: {},
      };

      expect(signal.details).toEqual({});
    });
  });

  // ===========================================================================
  // SignalType Enum - 6 test cases
  // ===========================================================================

  describe('SignalType Enum', () => {
    it('should have KNOWN_SCALPER type', () => {
      expect(SignalType.KNOWN_SCALPER).toBe('known_scalper');
    });

    it('should have RAPID_PURCHASES type', () => {
      expect(SignalType.RAPID_PURCHASES).toBe('rapid_purchases');
    });

    it('should have MULTIPLE_ACCOUNTS type', () => {
      expect(SignalType.MULTIPLE_ACCOUNTS).toBe('multiple_accounts');
    });

    it('should have PROXY_DETECTED type', () => {
      expect(SignalType.PROXY_DETECTED).toBe('proxy_detected');
    });

    it('should have SUSPICIOUS_CARD type', () => {
      expect(SignalType.SUSPICIOUS_CARD).toBe('suspicious_card');
    });

    it('should have BOT_BEHAVIOR type', () => {
      expect(SignalType.BOT_BEHAVIOR).toBe('bot_behavior');
    });
  });

  // ===========================================================================
  // FraudDecision Enum - 4 test cases
  // ===========================================================================

  describe('FraudDecision Enum', () => {
    it('should have APPROVE decision', () => {
      expect(FraudDecision.APPROVE).toBe('approve');
    });

    it('should have REVIEW decision', () => {
      expect(FraudDecision.REVIEW).toBe('review');
    });

    it('should have CHALLENGE decision', () => {
      expect(FraudDecision.CHALLENGE).toBe('challenge');
    });

    it('should have DECLINE decision', () => {
      expect(FraudDecision.DECLINE).toBe('decline');
    });
  });
});
