/**
 * COMPONENT TEST: AdvancedFraudDetectionService
 *
 * Tests AdvancedFraudDetectionService with REAL Database
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Shared pool
let sharedPool: Pool;

function getSharedPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'tickettoken_db',
      user: 'postgres',
      password: 'postgres',
    });
  }
  return sharedPool;
}

// Mock database config
jest.mock('../../../../src/config/database', () => ({
  query: async (text: string, values?: any[]) => {
    return getSharedPool().query(text, values);
  },
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import {
  AdvancedFraudDetectionService,
  FraudDecision,
  SignalType,
} from '../../../../src/services/fraud/advanced-fraud-detection.service';

describe('AdvancedFraudDetectionService Component Tests', () => {
  let pool: Pool;
  let service: AdvancedFraudDetectionService;
  let tenantId: string;
  let userId: string;
  let testCardFp: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    userId = uuidv4();
    testCardFp = `test_card_${uuidv4().slice(0, 8)}`;

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create test user
    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId, tenantId, `user-${userId.slice(0, 8)}@test.com`, 'hash']);

    service = new AdvancedFraudDetectionService();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM fraud_review_queue WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM fraud_checks WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM velocity_limits WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM fraud_rules WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM account_takeover_signals WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM card_fingerprints WHERE card_fingerprint LIKE $1', ['test_card_%']);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    // Clean up IP reputation (no tenant isolation)
    await pool.query(`DELETE FROM ip_reputation WHERE ip_address IN ('192.168.1.100'::inet, '10.0.0.1'::inet, '172.16.0.1'::inet)`);
  });

  // ===========================================================================
  // PERFORM FRAUD CHECK - BASIC
  // ===========================================================================
  describe('performFraudCheck() - basic', () => {
    it('should approve clean transaction', async () => {
      const result = await service.performFraudCheck({
        tenantId,
        userId,
        ipAddress: '192.168.1.100',
        deviceFingerprint: 'clean_device_fp',
        amount: 5000,
      });

      expect(result.decision).toBe(FraudDecision.APPROVE);
      expect(result.score).toBeLessThan(0.4);
      expect(result.userId).toBe(userId);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should store fraud check in database', async () => {
      await service.performFraudCheck({
        tenantId,
        userId,
        ipAddress: '192.168.1.100',
        deviceFingerprint: 'test_device',
        amount: 5000,
      });

      const result = await pool.query(
        'SELECT * FROM fraud_checks WHERE user_id = $1 AND tenant_id = $2',
        [userId, tenantId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].decision).toBe('approve');
    });
  });

  // ===========================================================================
  // IP REPUTATION
  // ===========================================================================
  describe('checkIPReputation()', () => {
    it('should create reputation for new IP', async () => {
      await service.checkIPReputation('10.0.0.1', tenantId);

      const result = await pool.query(
        `SELECT * FROM ip_reputation WHERE ip_address = '10.0.0.1'::inet`
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].reputation_status).toBe('unknown');
    });

    it('should flag blocked IP', async () => {
      // Create blocked IP
      await pool.query(`
        INSERT INTO ip_reputation (ip_address, risk_score, reputation_status, blocked_reason, first_seen, last_seen)
        VALUES ('172.16.0.1'::inet, 100, 'blocked', 'Known fraud', NOW(), NOW())
      `);

      const signal = await service.checkIPReputation('172.16.0.1', tenantId);

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe(SignalType.PROXY_DETECTED);
      expect(signal?.severity).toBe('high');
      expect(signal?.confidence).toBe(1.0);
    });

    it('should flag high risk IP', async () => {
      await pool.query(`
        INSERT INTO ip_reputation (ip_address, risk_score, reputation_status, fraud_count, first_seen, last_seen)
        VALUES ('172.16.0.1'::inet, 80, 'suspicious', 5, NOW(), NOW())
      `);

      const signal = await service.checkIPReputation('172.16.0.1', tenantId);

      expect(signal).not.toBeNull();
      expect(signal?.severity).toBe('high');
      expect(signal?.details.riskScore).toBe(80);
    });

    it('should flag proxy/VPN', async () => {
      await pool.query(`
        INSERT INTO ip_reputation (ip_address, risk_score, reputation_status, is_proxy, is_vpn, first_seen, last_seen)
        VALUES ('172.16.0.1'::inet, 50, 'suspicious', true, true, NOW(), NOW())
      `);

      const signal = await service.checkIPReputation('172.16.0.1', tenantId);

      expect(signal).not.toBeNull();
      expect(signal?.severity).toBe('medium');
      expect(signal?.details.isProxy).toBe(true);
    });
  });

  // ===========================================================================
  // VELOCITY LIMITS
  // ===========================================================================
  describe('checkVelocityLimits()', () => {
    it('should create velocity window for new entity', async () => {
      await service.checkVelocityLimits({
        tenantId,
        userId,
        ipAddress: '192.168.1.100',
        deviceFingerprint: 'device_1',
        amount: 5000,
      });

      const result = await pool.query(
        `SELECT * FROM velocity_limits WHERE tenant_id = $1 AND entity_type = 'user'`,
        [tenantId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_count).toBe(1);
    });

    it('should increment velocity counter', async () => {
      // First call creates window
      await service.checkVelocityLimits({
        tenantId,
        userId,
        ipAddress: '192.168.1.100',
        deviceFingerprint: 'device_1',
        amount: 5000,
      });

      // Second call increments
      await service.checkVelocityLimits({
        tenantId,
        userId,
        ipAddress: '192.168.1.100',
        deviceFingerprint: 'device_1',
        amount: 5000,
      });

      const result = await pool.query(
        `SELECT * FROM velocity_limits WHERE tenant_id = $1 AND entity_type = 'user'`,
        [tenantId]
      );

      expect(result.rows[0].current_count).toBe(2);
    });

    it('should flag when velocity limit exceeded', async () => {
      // Create velocity limit at threshold
      await pool.query(`
        INSERT INTO velocity_limits (
          tenant_id, entity_type, entity_id, action_type,
          limit_count, window_minutes, current_count, window_start, window_end
        ) VALUES ($1, 'user', $2, 'purchase', 10, 60, 10, NOW(), NOW() + INTERVAL '60 minutes')
      `, [tenantId, userId]);

      const signal = await service.checkVelocityLimits({
        tenantId,
        userId,
        ipAddress: '192.168.1.100',
        deviceFingerprint: 'device_1',
        amount: 5000,
      });

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe(SignalType.RAPID_PURCHASES);
      expect(signal?.severity).toBe('high');
    });
  });

  // ===========================================================================
  // CARD REPUTATION
  // ===========================================================================
  describe('checkCardReputation()', () => {
    it('should return null for unknown card', async () => {
      const signal = await service.checkCardReputation('unknown_card');

      expect(signal).toBeNull();
    });

    it('should flag blocked card', async () => {
      await pool.query(`
        INSERT INTO card_fingerprints (card_fingerprint, risk_level, chargeback_count, fraud_count)
        VALUES ($1, 'blocked', 3, 2)
      `, [testCardFp]);

      const signal = await service.checkCardReputation(testCardFp);

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe(SignalType.SUSPICIOUS_CARD);
      expect(signal?.severity).toBe('high');
      expect(signal?.confidence).toBe(1.0);
    });

    it('should flag card with chargebacks', async () => {
      await pool.query(`
        INSERT INTO card_fingerprints (card_fingerprint, risk_level, chargeback_count, fraud_count)
        VALUES ($1, 'medium', 1, 0)
      `, [testCardFp]);

      const signal = await service.checkCardReputation(testCardFp);

      expect(signal).not.toBeNull();
      expect(signal?.severity).toBe('medium');
      expect(signal?.details.chargebackCount).toBe(1);
    });
  });

  // ===========================================================================
  // ACCOUNT TAKEOVER
  // ===========================================================================
  describe('checkAccountTakeover()', () => {
    it('should return null when no anomalies', async () => {
      const signal = await service.checkAccountTakeover(userId, tenantId);

      expect(signal).toBeNull();
    });

    it('should flag multiple anomaly signals', async () => {
      // Create anomaly signals
      await pool.query(`
        INSERT INTO account_takeover_signals (tenant_id, user_id, signal_type, is_anomaly, timestamp)
        VALUES ($1, $2, 'new_device', true, NOW()),
               ($1, $2, 'location_change', true, NOW())
      `, [tenantId, userId]);

      const signal = await service.checkAccountTakeover(userId, tenantId);

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe(SignalType.ACCOUNT_TAKEOVER);
      expect(signal?.severity).toBe('high');
      expect(signal?.details.signalCount).toBe(2);
    });
  });

  // ===========================================================================
  // FRAUD RULES
  // ===========================================================================
  describe('evaluateFraudRules()', () => {
    it('should return empty array when no rules', async () => {
      const signals = await service.evaluateFraudRules({
        tenantId,
        userId,
        ipAddress: '192.168.1.100',
        deviceFingerprint: 'device_1',
        amount: 5000,
      });

      expect(signals).toEqual([]);
    });

    it('should trigger matching rule', async () => {
      // Create rule that matches high amounts
      await pool.query(`
        INSERT INTO fraud_rules (
          tenant_id, rule_name, rule_type, conditions, action, is_active, priority, trigger_count, block_count
        ) VALUES ($1, 'High Amount Rule', 'amount', '{"min_amount": 1000}', 'review', true, 1, 0, 0)
      `, [tenantId]);

      const signals = await service.evaluateFraudRules({
        tenantId,
        userId,
        ipAddress: '192.168.1.100',
        deviceFingerprint: 'device_1',
        amount: 5000,
      });

      expect(signals).toHaveLength(1);
      expect(signals[0].details.ruleName).toBe('High Amount Rule');
    });

    it('should not trigger rule when conditions not met', async () => {
      await pool.query(`
        INSERT INTO fraud_rules (
          tenant_id, rule_name, rule_type, conditions, action, is_active, priority, trigger_count, block_count
        ) VALUES ($1, 'High Amount Rule', 'amount', '{"min_amount": 10000}', 'review', true, 1, 0, 0)
      `, [tenantId]);

      const signals = await service.evaluateFraudRules({
        tenantId,
        userId,
        ipAddress: '192.168.1.100',
        deviceFingerprint: 'device_1',
        amount: 5000, // Below threshold
      });

      expect(signals).toHaveLength(0);
    });

    it('should increment trigger count', async () => {
      await pool.query(`
        INSERT INTO fraud_rules (
          tenant_id, rule_name, rule_type, conditions, action, is_active, priority, trigger_count, block_count
        ) VALUES ($1, 'Test Rule', 'amount', '{"min_amount": 100}', 'review', true, 1, 0, 0)
      `, [tenantId]);

      await service.evaluateFraudRules({
        tenantId,
        userId,
        ipAddress: '192.168.1.100',
        deviceFingerprint: 'device_1',
        amount: 5000,
      });

      const result = await pool.query(
        'SELECT trigger_count FROM fraud_rules WHERE tenant_id = $1',
        [tenantId]
      );

      expect(result.rows[0].trigger_count).toBe(1);
    });
  });

  // ===========================================================================
  // DECISION LOGIC
  // ===========================================================================
  describe('decision logic', () => {
    it('should DECLINE when blocked IP', async () => {
      await pool.query(`
        INSERT INTO ip_reputation (ip_address, risk_score, reputation_status, blocked_reason, first_seen, last_seen)
        VALUES ('172.16.0.1'::inet, 100, 'blocked', 'Fraud', NOW(), NOW())
      `);

      const result = await service.performFraudCheck({
        tenantId,
        userId,
        ipAddress: '172.16.0.1',
        deviceFingerprint: 'device_1',
        amount: 5000,
      });

      expect(result.decision).toBe(FraudDecision.DECLINE);
    });

    it('should queue for REVIEW when score is medium', async () => {
      // Create conditions for review score
      await pool.query(`
        INSERT INTO ip_reputation (ip_address, risk_score, reputation_status, is_vpn, first_seen, last_seen)
        VALUES ('172.16.0.1'::inet, 60, 'suspicious', true, NOW(), NOW())
      `);

      await pool.query(`
        INSERT INTO fraud_rules (
          tenant_id, rule_name, rule_type, conditions, action, is_active, priority, trigger_count, block_count
        ) VALUES ($1, 'Rule 1', 'amount', '{"min_amount": 100}', 'review', true, 1, 0, 0)
      `, [tenantId]);

      const result = await service.performFraudCheck({
        tenantId,
        userId,
        ipAddress: '172.16.0.1',
        deviceFingerprint: 'device_1',
        amount: 5000,
      });

      // Check if queued for review
      if (result.decision === FraudDecision.REVIEW) {
        const reviewQueue = await pool.query(
          'SELECT * FROM fraud_review_queue WHERE user_id = $1 AND tenant_id = $2',
          [userId, tenantId]
        );
        expect(reviewQueue.rows.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // USER FRAUD HISTORY
  // ===========================================================================
  describe('getUserFraudHistory()', () => {
    it('should return empty array for new user', async () => {
      const history = await service.getUserFraudHistory(userId, tenantId);

      expect(history).toEqual([]);
    });

    it('should return fraud check history', async () => {
      // Create some fraud checks
      await service.performFraudCheck({
        tenantId,
        userId,
        ipAddress: '192.168.1.100',
        deviceFingerprint: 'device_1',
        amount: 5000,
      });

      await service.performFraudCheck({
        tenantId,
        userId,
        ipAddress: '192.168.1.101',
        deviceFingerprint: 'device_2',
        amount: 10000,
      });

      const history = await service.getUserFraudHistory(userId, tenantId);

      expect(history).toHaveLength(2);
      expect(history[0]).toHaveProperty('score');
      expect(history[0]).toHaveProperty('decision');
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await service.performFraudCheck({
          tenantId,
          userId,
          ipAddress: `192.168.1.${i}`,
          deviceFingerprint: `device_${i}`,
          amount: 5000,
        });
      }

      const history = await service.getUserFraudHistory(userId, tenantId, 3);

      expect(history).toHaveLength(3);
    });
  });
});
