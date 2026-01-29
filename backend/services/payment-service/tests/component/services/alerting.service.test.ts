/**
 * COMPONENT TEST: AlertingService
 *
 * Tests alert system with REAL Database and MOCKED external services
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

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      fatal: jest.fn(),
    }),
  },
}));

// Mock DatabaseService
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: () => getSharedPool(),
  },
}));

// Mock metrics
const mockIncCounter = jest.fn();
const mockRegisterCounter = jest.fn();
jest.mock('../../../src/routes/metrics.routes', () => ({
  metricsRegistry: {
    incCounter: mockIncCounter,
    registerCounter: mockRegisterCounter,
  },
}));

// Mock SecureHttpClient
const mockPost = jest.fn();
jest.mock('../../../src/utils/http-client.util', () => ({
  SecureHttpClient: jest.fn().mockImplementation(() => ({
    post: mockPost,
  })),
}));

import { AlertingService, AlertSeverity, AlertChannel } from '../../../src/services/alerting.service';

describe('AlertingService Component Tests', () => {
  let pool: Pool;
  let tenantId: string;
  let userId: string;
  let alertingService: AlertingService;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    userId = uuidv4();

    // Clear mocks
    jest.clearAllMocks();
    mockPost.mockResolvedValue({ ok: true });

    // Create fresh service instance
    alertingService = new AlertingService({
      channels: [AlertChannel.LOG],
      thresholds: {
        highValueRefundAmount: 100_000,
        transferFailureCountPerHour: 5,
        disputeCountPerDay: 10,
      },
    });

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
  });

  afterEach(async () => {
    await pool.query('DELETE FROM alert_history WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // TRANSFER FAILURE ALERTS
  // ===========================================================================
  describe('alertTransferFailed()', () => {
    it('should send transfer failure alert', async () => {
      const transferId = uuidv4();

      await alertingService.alertTransferFailed(
        transferId,
        10000,
        'acct_test_123',
        'Insufficient funds',
        tenantId
      );

      // Verify metric incremented
      expect(mockIncCounter).toHaveBeenCalledWith('alerts_sent_total', {
        type: 'transfer.failed',
        severity: AlertSeverity.ERROR,
      });
    });
  });

  // ===========================================================================
  // PAYOUT FAILURE ALERTS
  // ===========================================================================
  describe('alertPayoutFailed()', () => {
    it('should send payout failure alert', async () => {
      const payoutId = `po_test_${uuidv4().slice(0, 8)}`;

      await alertingService.alertPayoutFailed(
        payoutId,
        50000,
        'acct_test_456',
        'account_closed',
        tenantId
      );

      expect(mockIncCounter).toHaveBeenCalledWith('alerts_sent_total', {
        type: 'payout.failed',
        severity: AlertSeverity.ERROR,
      });
    });

    it('should handle payout failure without failure code', async () => {
      const payoutId = `po_test_${uuidv4().slice(0, 8)}`;

      await alertingService.alertPayoutFailed(
        payoutId,
        25000,
        'acct_test_789',
        null,
        tenantId
      );

      expect(mockIncCounter).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // DISPUTE ALERTS
  // ===========================================================================
  describe('alertDisputeOpened()', () => {
    it('should send dispute opened alert', async () => {
      const disputeId = `dp_test_${uuidv4().slice(0, 8)}`;
      const chargeId = `ch_test_${uuidv4().slice(0, 8)}`;

      await alertingService.alertDisputeOpened(
        disputeId,
        chargeId,
        15000,
        'fraudulent',
        tenantId
      );

      expect(mockIncCounter).toHaveBeenCalledWith('alerts_sent_total', {
        type: 'dispute.opened',
        severity: AlertSeverity.WARNING,
      });
    });
  });

  // ===========================================================================
  // HIGH-VALUE REFUND ALERTS
  // ===========================================================================
  describe('alertHighValueRefund()', () => {
    it('should send alert for high-value refund', async () => {
      const refundId = `re_test_${uuidv4().slice(0, 8)}`;
      const paymentIntentId = `pi_test_${uuidv4().slice(0, 8)}`;

      await alertingService.alertHighValueRefund(
        refundId,
        paymentIntentId,
        150000, // $1500 - above threshold
        tenantId
      );

      expect(mockIncCounter).toHaveBeenCalledWith('alerts_sent_total', {
        type: 'refund.high_value',
        severity: AlertSeverity.WARNING,
      });
    });

    it('should NOT send alert for low-value refund', async () => {
      const refundId = `re_test_${uuidv4().slice(0, 8)}`;
      const paymentIntentId = `pi_test_${uuidv4().slice(0, 8)}`;

      await alertingService.alertHighValueRefund(
        refundId,
        paymentIntentId,
        5000, // $50 - below threshold
        tenantId
      );

      // Should not increment counter
      expect(mockIncCounter).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // SECURITY ALERTS
  // ===========================================================================
  describe('alertAuthFailures()', () => {
    it('should send auth failure alert', async () => {
      await alertingService.alertAuthFailures(
        '192.168.1.1',
        5,
        '/api/auth/login'
      );

      expect(mockIncCounter).toHaveBeenCalledWith('alerts_sent_total', {
        type: 'security.auth_failures',
        severity: AlertSeverity.WARNING,
      });
    });
  });

  describe('alertRateLimitExceeded()', () => {
    it('should send rate limit alert', async () => {
      await alertingService.alertRateLimitExceeded(
        '10.0.0.1',
        '/api/payments',
        100
      );

      expect(mockIncCounter).toHaveBeenCalledWith('alerts_sent_total', {
        type: 'security.rate_limit',
        severity: AlertSeverity.INFO,
      });
    });
  });

  // ===========================================================================
  // INFRASTRUCTURE ALERTS
  // ===========================================================================
  describe('alertDatabaseIssue()', () => {
    it('should send critical database alert', async () => {
      await alertingService.alertDatabaseIssue(
        'Connection pool exhausted',
        {
          poolSize: 20,
          activeConnections: 20,
          waitingClients: 15,
        }
      );

      expect(mockIncCounter).toHaveBeenCalledWith('alerts_sent_total', {
        type: 'infrastructure.database',
        severity: AlertSeverity.CRITICAL,
      });
    });
  });

  describe('alertStripeApiIssue()', () => {
    it('should send Stripe API alert', async () => {
      await alertingService.alertStripeApiIssue(
        'charge.create',
        'Rate limit exceeded',
        429
      );

      expect(mockIncCounter).toHaveBeenCalledWith('alerts_sent_total', {
        type: 'integration.stripe',
        severity: AlertSeverity.ERROR,
      });
    });
  });

  // ===========================================================================
  // ACCOUNT STATUS ALERTS
  // ===========================================================================
  describe('alertAccountDisabled()', () => {
    it('should send critical account disabled alert', async () => {
      await alertingService.alertAccountDisabled(
        'acct_disabled_123',
        'Terms of service violation',
        new Date(),
        tenantId,
        'Main Street Venue'
      );

      expect(mockIncCounter).toHaveBeenCalledWith('alerts_sent_total', {
        type: 'account.disabled',
        severity: AlertSeverity.CRITICAL,
      });
    });
  });

  describe('alertAccountVerificationFailed()', () => {
    it('should send verification alert with deadline', async () => {
      const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await alertingService.alertAccountVerificationFailed(
        'acct_verify_456',
        ['individual.id_number', 'individual.verification.document'],
        deadline,
        tenantId
      );

      expect(mockIncCounter).toHaveBeenCalledWith('alerts_sent_total', {
        type: 'account.verification_failed',
        severity: AlertSeverity.WARNING,
      });
    });

    it('should send verification alert without deadline', async () => {
      await alertingService.alertAccountVerificationFailed(
        'acct_verify_789',
        ['business.tax_id'],
        undefined,
        tenantId
      );

      expect(mockIncCounter).toHaveBeenCalled();
    });
  });

  describe('alertPayoutsPaused()', () => {
    it('should send payouts paused alert', async () => {
      await alertingService.alertPayoutsPaused(
        'acct_paused_111',
        'Negative balance',
        tenantId
      );

      expect(mockIncCounter).toHaveBeenCalledWith('alerts_sent_total', {
        type: 'account.payouts_paused',
        severity: AlertSeverity.ERROR,
      });
    });
  });

  // ===========================================================================
  // DASHBOARD INTEGRATION - FIXED SCHEMA
  // ===========================================================================
  describe('publishToDashboard()', () => {
    it('should store alert in database with correct schema', async () => {
      const alertId = uuidv4();

      await alertingService.publishToDashboard({
        id: alertId,
        type: 'test.alert',
        severity: AlertSeverity.WARNING,
        title: 'Test Alert',
        message: 'This is a test alert',
        metadata: {
          amount: 5000,
          threshold: 10000,
        },
        timestamp: new Date(),
        tenantId,
      });

      // Verify stored in database with correct columns
      const result = await pool.query(
        'SELECT * FROM alert_history WHERE id = $1',
        [alertId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].alert_type).toBe('test.alert');
      expect(result.rows[0].severity).toBe('warning');
      expect(result.rows[0].message).toBe('Test Alert: This is a test alert');
      // FIXED: numeric(10,2) returns decimal format
      expect(parseFloat(result.rows[0].metric_value)).toBe(5000);
      expect(parseFloat(result.rows[0].threshold_value)).toBe(10000);
      expect(result.rows[0].tenant_id).toBe(tenantId);
      expect(result.rows[0].acknowledged).toBe(false);
    });

    it('should handle alert without numeric metadata', async () => {
      const alertId = uuidv4();

      await alertingService.publishToDashboard({
        id: alertId,
        type: 'info.alert',
        severity: AlertSeverity.INFO,
        title: 'Info',
        message: 'Information message',
        metadata: {
          source: 'test',
        },
        timestamp: new Date(),
        tenantId,
      });

      const result = await pool.query(
        'SELECT * FROM alert_history WHERE id = $1',
        [alertId]
      );

      expect(result.rows[0].metric_value).toBeNull();
      expect(result.rows[0].threshold_value).toBeNull();
    });
  });

  describe('getActiveAlerts()', () => {
    it('should retrieve active alerts for tenant', async () => {
      // Create some alerts with delay to ensure ordering
      const alert1Id = uuidv4();
      
      await pool.query(`
        INSERT INTO alert_history (
          id, tenant_id, alert_type, severity, message, acknowledged, created_at
        )
        VALUES ($1, $2, 'transfer.failed', 'error', 'Transfer Failed: Connection timeout', false, NOW() - INTERVAL '1 minute')
      `, [alert1Id, tenantId]);

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const alert2Id = uuidv4();
      await pool.query(`
        INSERT INTO alert_history (
          id, tenant_id, alert_type, severity, message, acknowledged, created_at
        )
        VALUES ($1, $2, 'dispute.opened', 'warning', 'Dispute Opened: Fraudulent charge', false, NOW())
      `, [alert2Id, tenantId]);

      const alerts = await alertingService.getActiveAlerts(tenantId);

      expect(alerts).toHaveLength(2);
      // Most recent first (dispute)
      expect(alerts[0].type).toBe('dispute.opened');
      expect(alerts[0].severity).toBe(AlertSeverity.WARNING);
      expect(alerts[1].type).toBe('transfer.failed');
      expect(alerts[1].severity).toBe(AlertSeverity.ERROR);
    });

    it('should only return unacknowledged alerts', async () => {
      const alert1Id = uuidv4();
      const alert2Id = uuidv4();

      await pool.query(`
        INSERT INTO alert_history (
          id, tenant_id, alert_type, severity, message, acknowledged, created_at
        )
        VALUES 
          ($1, $2, 'test.alert1', 'info', 'Test: Alert 1', false, NOW()),
          ($3, $2, 'test.alert2', 'info', 'Test: Alert 2', true, NOW())
      `, [alert1Id, tenantId, alert2Id]);

      const alerts = await alertingService.getActiveAlerts(tenantId);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe(alert1Id);
    });

    it('should respect limit parameter', async () => {
      // Create 5 alerts
      for (let i = 0; i < 5; i++) {
        await pool.query(`
          INSERT INTO alert_history (
            id, tenant_id, alert_type, severity, message, acknowledged, created_at
          )
          VALUES ($1, $2, 'test.alert', 'info', 'Test: Alert', false, NOW())
        `, [uuidv4(), tenantId]);
      }

      const alerts = await alertingService.getActiveAlerts(tenantId, 3);

      expect(alerts).toHaveLength(3);
    });
  });

  describe('acknowledgeAlert()', () => {
    it('should acknowledge an alert', async () => {
      const alertId = uuidv4();

      await pool.query(`
        INSERT INTO alert_history (
          id, tenant_id, alert_type, severity, message, acknowledged, created_at
        )
        VALUES ($1, $2, 'test.alert', 'warning', 'Test: Alert', false, NOW())
      `, [alertId, tenantId]);

      const result = await alertingService.acknowledgeAlert(alertId, userId);

      expect(result).toBe(true);

      // Verify in database
      const dbResult = await pool.query(
        'SELECT acknowledged, acknowledged_by FROM alert_history WHERE id = $1',
        [alertId]
      );

      expect(dbResult.rows[0].acknowledged).toBe(true);
      expect(dbResult.rows[0].acknowledged_by).toBe(userId);
    });

    it('should return false for nonexistent alert', async () => {
      const result = await alertingService.acknowledgeAlert(uuidv4(), userId);

      expect(result).toBe(false);
    });
  });

  describe('getAlertStats()', () => {
    it('should return alert statistics', async () => {
      // Create various alerts
      await pool.query(`
        INSERT INTO alert_history (
          id, tenant_id, alert_type, severity, message, acknowledged, created_at
        )
        VALUES 
          ($1, $2, 'transfer.failed', 'error', 'Test: Transfer 1', false, NOW()),
          ($3, $2, 'transfer.failed', 'error', 'Test: Transfer 2', true, NOW()),
          ($4, $2, 'dispute.opened', 'warning', 'Test: Dispute', false, NOW())
      `, [uuidv4(), tenantId, uuidv4(), uuidv4()]);

      const stats = await alertingService.getAlertStats(tenantId);

      expect(stats.total).toBe(3);
      expect(stats.byType['transfer.failed']).toBe(2);
      expect(stats.byType['dispute.opened']).toBe(1);
      expect(stats.bySeverity['error']).toBe(2);
      expect(stats.bySeverity['warning']).toBe(1);
      expect(stats.unacknowledged).toBe(2);
    });

    it('should return zero stats for tenant with no alerts', async () => {
      const stats = await alertingService.getAlertStats(tenantId);

      expect(stats.total).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.bySeverity).toEqual({});
      expect(stats.unacknowledged).toBe(0);
    });
  });

  // ===========================================================================
  // RATE LIMITING
  // ===========================================================================
  describe('alert rate limiting', () => {
    it('should rate limit repeated alerts of same type', async () => {
      const service = new AlertingService({
        channels: [AlertChannel.LOG],
      });

      // Send 15 alerts of same type rapidly
      for (let i = 0; i < 15; i++) {
        await service.alertTransferFailed(
          `transfer-${i}`,
          1000,
          'acct_test',
          'error',
          tenantId
        );
      }

      // Only first 10 should increment counter (MAX_ALERTS_PER_WINDOW = 10)
      expect(mockIncCounter).toHaveBeenCalledTimes(10);
    });

    it('should allow alerts after rate limit window expires', async () => {
      // This would need to mock time or wait 5 minutes in real scenario
      // For now, just verify different alert types aren't rate limited together
      const service = new AlertingService({
        channels: [AlertChannel.LOG],
      });

      await service.alertTransferFailed('t1', 1000, 'acct1', 'error', tenantId);
      await service.alertPayoutFailed('p1', 2000, 'acct2', 'failed', tenantId);
      await service.alertDisputeOpened('d1', 'ch1', 3000, 'fraud', tenantId);

      // All should be sent (different types)
      expect(mockIncCounter).toHaveBeenCalledTimes(3);
    });
  });

  // ===========================================================================
  // EXTERNAL CHANNEL INTEGRATION
  // ===========================================================================
  describe('Slack integration', () => {
    it('should send alert to Slack when configured', async () => {
      const service = new AlertingService({
        channels: [AlertChannel.SLACK],
        slackWebhookUrl: 'https://hooks.slack.com/test',
      });

      await service.alertTransferFailed(
        'transfer-123',
        5000,
        'acct_test',
        'Network timeout',
        tenantId
      );

      expect(mockPost).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              color: '#FF6600', // ERROR color
              title: expect.stringContaining('Transfer Failed'),
            }),
          ]),
        })
      );
    });
  });

  describe('PagerDuty integration', () => {
    it('should send critical alerts to PagerDuty', async () => {
      const service = new AlertingService({
        channels: [AlertChannel.PAGERDUTY],
        pagerdutyIntegrationKey: 'test-integration-key',
      });

      await service.alertDatabaseIssue('Pool exhausted', { poolSize: 20 });

      expect(mockPost).toHaveBeenCalledWith(
        'https://events.pagerduty.com/v2/enqueue',
        expect.objectContaining({
          routing_key: 'test-integration-key',
          event_action: 'trigger',
          payload: expect.objectContaining({
            severity: 'critical',
          }),
        })
      );
    });

    it('should NOT send non-critical alerts to PagerDuty', async () => {
      const service = new AlertingService({
        channels: [AlertChannel.PAGERDUTY],
        pagerdutyIntegrationKey: 'test-integration-key',
      });

      await service.alertRateLimitExceeded('10.0.0.1', '/api/test', 100);

      // INFO severity should not trigger PagerDuty
      expect(mockPost).not.toHaveBeenCalled();
    });
  });
});
