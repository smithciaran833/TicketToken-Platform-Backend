/**
 * COMPONENT TEST: NotificationService
 *
 * Tests NotificationService with REAL Database and MOCKED notification service client
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.NOTIFICATIONS_ENABLED = 'true';
process.env.APP_URL = 'https://test.tickettoken.com';
process.env.MERCHANT_DASHBOARD_URL = 'https://test-dashboard.tickettoken.com';
process.env.SUPPORT_EMAIL = 'support@test.tickettoken.com';
process.env.SUPPORT_PHONE = '1-800-TEST';

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
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// Mock the shared library notification client
const mockSendNotification = jest.fn();
const mockCreateRequestContext = jest.fn();
const mockNotificationServiceClient = {
  sendNotification: mockSendNotification,
};

jest.mock('@tickettoken/shared', () => ({
  notificationServiceClient: mockNotificationServiceClient,
  createRequestContext: mockCreateRequestContext,
  ServiceClientError: class ServiceClientError extends Error {
    constructor(message: string, public statusCode?: number) {
      super(message);
      this.name = 'ServiceClientError';
    }
  },
}));

import { notificationService } from '../../../src/services/notification.service';
import type {
  RefundNotificationData,
  DisputeNotificationData,
  PaymentNotificationData,
} from '../../../src/services/notification.service';

describe('NotificationService Component Tests', () => {
  let pool: Pool;
  let tenantId: string;
  let userId: string;
  let userEmail: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    userId = uuidv4();
    userEmail = `user-${userId.slice(0, 8)}@test.com`;

    // Clear mocks
    mockSendNotification.mockClear();
    mockCreateRequestContext.mockClear();
    
    mockSendNotification.mockResolvedValue({ success: true, notificationId: 'notif_test_123' });
    mockCreateRequestContext.mockImplementation((tenantId: string, userId: string) => ({
      tenantId,
      userId,
      requestId: `req_${Date.now()}`,
    }));

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create test user
    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId, tenantId, userEmail, 'hash']);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // SERVICE INITIALIZATION
  // ===========================================================================
  describe('initialization', () => {
    it('should initialize with notifications enabled', () => {
      expect(notificationService.isEnabled()).toBe(true);
    });
  });

  // ===========================================================================
  // REFUND NOTIFICATIONS
  // ===========================================================================
  describe('sendRefundInitiated()', () => {
    it('should send refund initiated notification with all data', async () => {
      const refundData: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_123',
        amount: 10000, // $100.00
        currency: 'usd',
        reason: 'Customer requested refund',
        ticketIds: ['ticket_1', 'ticket_2'],
        eventName: 'Rock Concert 2024',
        eventDate: '2024-12-31',
      };

      await notificationService.sendRefundInitiated(refundData);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      
      const call = mockSendNotification.mock.calls[0];
      const notificationRequest = call[0];
      
      expect(notificationRequest.userId).toBe(userId);
      expect(notificationRequest.templateId).toBe('refund_initiated');
      expect(notificationRequest.channels).toContain('email');
      expect(notificationRequest.priority).toBe('normal');
      
      // Check template data
      expect(notificationRequest.data.refundId).toBe(refundData.refundId);
      expect(notificationRequest.data.paymentIntentId).toBe('pi_test_123');
      expect(notificationRequest.data.amount).toBe('$100.00');
      expect(notificationRequest.data.amountCents).toBe('10000');
      expect(notificationRequest.data.currency).toBe('usd');
      expect(notificationRequest.data.reason).toBe('Customer requested refund');
      expect(notificationRequest.data.ticketCount).toBe('2');
      expect(notificationRequest.data.eventName).toBe('Rock Concert 2024');
      expect(notificationRequest.data.eventDate).toBe('2024-12-31');
      
      // COMM-2: Timeline communication
      expect(notificationRequest.data.estimatedDays).toBeDefined();
      expect(notificationRequest.data.estimatedCompletionDate).toBeDefined();
      expect(notificationRequest.data.estimatedCompletionFormatted).toBeDefined();
      expect(notificationRequest.data.statusTrackingUrl).toContain(refundData.refundId);
      expect(notificationRequest.data.supportEmail).toBe('support@test.tickettoken.com');
      
      // Check source and timestamp
      expect(notificationRequest.data.source).toBe('payment-service');
      expect(notificationRequest.data.timestamp).toBeDefined();
    });

    it('should use default estimated days for small refunds', async () => {
      const refundData: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_456',
        amount: 3000, // $30.00 - small amount
        currency: 'usd',
      };

      await notificationService.sendRefundInitiated(refundData);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].data.estimatedDays).toBe('5');
    });

    it('should use longer timeline for medium refunds', async () => {
      const refundData: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_789',
        amount: 75000, // $750.00 - medium amount
        currency: 'usd',
      };

      await notificationService.sendRefundInitiated(refundData);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].data.estimatedDays).toBe('7');
    });

    it('should use longest timeline for large refunds', async () => {
      const refundData: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_999',
        amount: 150000, // $1500.00 - large amount
        currency: 'usd',
      };

      await notificationService.sendRefundInitiated(refundData);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].data.estimatedDays).toBe('10');
    });

    it('should use custom estimated timeline when provided', async () => {
      const refundData: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_custom',
        amount: 10000,
        currency: 'usd',
        estimatedTimelineDays: 3, // Custom timeline
      };

      await notificationService.sendRefundInitiated(refundData);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].data.estimatedDays).toBe('3');
    });

    it('should use default event name when not provided', async () => {
      const refundData: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_default',
        amount: 5000,
        currency: 'usd',
      };

      await notificationService.sendRefundInitiated(refundData);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].data.eventName).toBe('Your order');
    });

    it('should handle different currencies', async () => {
      const refundData: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_eur',
        amount: 15000, // €150.00
        currency: 'eur',
      };

      await notificationService.sendRefundInitiated(refundData);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].data.amount).toBe('€150.00');
      expect(call[0].data.currency).toBe('eur');
    });
  });

  describe('sendRefundCompleted()', () => {
    it('should send refund completed notification', async () => {
      const refundData: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_completed',
        amount: 20000,
        currency: 'usd',
        reason: 'Event cancelled',
        eventName: 'Music Festival 2024',
      };

      await notificationService.sendRefundCompleted(refundData);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      
      const call = mockSendNotification.mock.calls[0];
      const notificationRequest = call[0];
      
      expect(notificationRequest.templateId).toBe('refund_completed');
      expect(notificationRequest.priority).toBe('normal');
      expect(notificationRequest.data.refundId).toBe(refundData.refundId);
      expect(notificationRequest.data.amount).toBe('$200.00');
      expect(notificationRequest.data.completedAt).toBeDefined();
      
      // COMM-2: Bank processing note
      expect(notificationRequest.data.bankProcessingNote).toContain('5-10 business days');
      expect(notificationRequest.data.supportEmail).toBe('support@test.tickettoken.com');
    });
  });

  describe('sendRefundFailed()', () => {
    it('should send refund failed notification with error details', async () => {
      const refundData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_failed',
        amount: 8000,
        currency: 'usd',
        reason: 'Customer requested',
        eventName: 'Comedy Show',
        errorMessage: 'Insufficient funds in platform account',
      };

      await notificationService.sendRefundFailed(refundData);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      
      const call = mockSendNotification.mock.calls[0];
      const notificationRequest = call[0];
      
      expect(notificationRequest.templateId).toBe('refund_failed');
      expect(notificationRequest.data.errorMessage).toBe('Insufficient funds in platform account');
      expect(notificationRequest.data.nextSteps).toContain('24 hours');
      expect(notificationRequest.data.supportEmail).toBe('support@test.tickettoken.com');
      expect(notificationRequest.data.supportPhone).toBe('1-800-TEST');
    });

    it('should use default error message when not provided', async () => {
      const refundData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_default_error',
        amount: 5000,
        currency: 'usd',
      };

      await notificationService.sendRefundFailed(refundData);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].data.errorMessage).toBe('An error occurred while processing your refund.');
    });
  });

  // ===========================================================================
  // DISPUTE NOTIFICATIONS
  // ===========================================================================
  describe('sendDisputeOpened()', () => {
    it('should send dispute opened notification to merchant', async () => {
      const disputeData: DisputeNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        disputeId: 'dp_test_123',
        paymentIntentId: 'pi_test_dispute',
        amount: 50000,
        currency: 'usd',
        reason: 'fraudulent',
        dueDate: '2024-12-31T23:59:59Z',
        evidenceRequired: ['receipt', 'shipping_proof', 'customer_communication'],
      };

      await notificationService.sendDisputeOpened(disputeData);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      
      const call = mockSendNotification.mock.calls[0];
      const notificationRequest = call[0];
      
      expect(notificationRequest.templateId).toBe('dispute_opened');
      expect(notificationRequest.priority).toBe('high'); // Disputes are high priority
      expect(notificationRequest.data.disputeId).toBe('dp_test_123');
      expect(notificationRequest.data.amount).toBe('$500.00');
      expect(notificationRequest.data.reason).toBe('fraudulent');
      expect(notificationRequest.data.dueDate).toBe('2024-12-31T23:59:59Z');
      expect(notificationRequest.data.dueDateFormatted).toBeDefined();
      
      // Arrays are converted to strings by the service (String() conversion)
      expect(notificationRequest.data.evidenceRequired).toBe('receipt,shipping_proof,customer_communication');
      
      expect(notificationRequest.data.dashboardUrl).toContain('dp_test_123');
      expect(notificationRequest.data.urgencyNote).toContain('promptly');
    });
  });

  // ===========================================================================
  // PAYMENT NOTIFICATIONS
  // ===========================================================================
  describe('sendPaymentSucceeded()', () => {
    it('should send payment success notification', async () => {
      const paymentData: PaymentNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        paymentIntentId: 'pi_test_success',
        amount: 15000,
        currency: 'usd',
        status: 'succeeded',
        eventName: 'Theater Performance',
        ticketCount: 4,
      };

      await notificationService.sendPaymentSucceeded(paymentData);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      
      const call = mockSendNotification.mock.calls[0];
      const notificationRequest = call[0];
      
      expect(notificationRequest.templateId).toBe('payment_succeeded');
      expect(notificationRequest.priority).toBe('normal');
      expect(notificationRequest.data.paymentIntentId).toBe('pi_test_success');
      expect(notificationRequest.data.amount).toBe('$150.00');
      expect(notificationRequest.data.eventName).toBe('Theater Performance');
      expect(notificationRequest.data.ticketCount).toBe('4');
      expect(notificationRequest.data.orderUrl).toContain('pi_test_success');
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should not throw when notification service fails', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');
      mockSendNotification.mockRejectedValueOnce(
        new ServiceClientError('Notification service unavailable', 503)
      );

      const refundData: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_error',
        amount: 5000,
        currency: 'usd',
      };

      // Should not throw
      await expect(
        notificationService.sendRefundInitiated(refundData)
      ).resolves.not.toThrow();

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });

    it('should handle generic errors gracefully', async () => {
      mockSendNotification.mockRejectedValueOnce(new Error('Network error'));

      const paymentData: PaymentNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        paymentIntentId: 'pi_test_network_error',
        amount: 10000,
        currency: 'usd',
        status: 'succeeded',
      };

      await expect(
        notificationService.sendPaymentSucceeded(paymentData)
      ).resolves.not.toThrow();
    });

    it('should skip notifications when disabled', async () => {
      // Temporarily disable notifications
      process.env.NOTIFICATIONS_ENABLED = 'false';
      
      // Re-import to get new instance with disabled state
      jest.resetModules();
      const { notificationService: disabledService } = require('../../../src/services/notification.service');

      const refundData: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_disabled',
        amount: 5000,
        currency: 'usd',
      };

      await disabledService.sendRefundInitiated(refundData);

      // Should not call notification service when disabled
      expect(mockSendNotification).not.toHaveBeenCalled();

      // Re-enable for other tests
      process.env.NOTIFICATIONS_ENABLED = 'true';
    });
  });

  // ===========================================================================
  // CURRENCY FORMATTING
  // ===========================================================================
  describe('currency formatting', () => {
    it('should format USD correctly', async () => {
      const data: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_usd',
        amount: 123456, // $1,234.56
        currency: 'usd',
      };

      await notificationService.sendRefundInitiated(data);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].data.amount).toBe('$1,234.56');
    });

    it('should format EUR correctly', async () => {
      const data: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_eur',
        amount: 98765, // €987.65
        currency: 'eur',
      };

      await notificationService.sendRefundInitiated(data);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].data.amount).toBe('€987.65');
    });

    it('should format GBP correctly', async () => {
      const data: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_gbp',
        amount: 45678, // £456.78
        currency: 'gbp',
      };

      await notificationService.sendRefundInitiated(data);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].data.amount).toBe('£456.78');
    });
  });

  // ===========================================================================
  // PRIORITY LEVELS
  // ===========================================================================
  describe('priority levels', () => {
    it('should set high priority for disputes', async () => {
      const disputeData: DisputeNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        disputeId: 'dp_test_priority',
        paymentIntentId: 'pi_test',
        amount: 10000,
        currency: 'usd',
        reason: 'fraudulent',
        dueDate: '2024-12-31T23:59:59Z',
        evidenceRequired: [],
      };

      await notificationService.sendDisputeOpened(disputeData);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].priority).toBe('high');
    });

    it('should set normal priority for refunds', async () => {
      const refundData: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_priority',
        amount: 10000,
        currency: 'usd',
      };

      await notificationService.sendRefundInitiated(refundData);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].priority).toBe('normal');
    });

    it('should set normal priority for successful payments', async () => {
      const paymentData: PaymentNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        paymentIntentId: 'pi_test_priority',
        amount: 10000,
        currency: 'usd',
        status: 'succeeded',
      };

      await notificationService.sendPaymentSucceeded(paymentData);

      const call = mockSendNotification.mock.calls[0];
      expect(call[0].priority).toBe('normal');
    });
  });

  // ===========================================================================
  // REQUEST CONTEXT
  // ===========================================================================
  describe('request context', () => {
    it('should create proper request context with tenant and user', async () => {
      const refundData: RefundNotificationData = {
        userId,
        email: userEmail,
        tenantId,
        refundId: uuidv4(),
        paymentIntentId: 'pi_test_context',
        amount: 5000,
        currency: 'usd',
      };

      await notificationService.sendRefundInitiated(refundData);

      expect(mockCreateRequestContext).toHaveBeenCalledWith(tenantId, userId);
    });
  });
});
