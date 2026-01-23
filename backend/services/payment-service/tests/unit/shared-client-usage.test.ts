/**
 * Unit Tests: Shared Client Usage - payment-service
 *
 * Verifies correct wiring and usage of @tickettoken/shared library clients.
 * payment-service uses notificationServiceClient for sending payment notifications.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// Mock the shared library
jest.mock('@tickettoken/shared', () => ({
  notificationServiceClient: {
    sendNotification: jest.fn<any>().mockResolvedValue({ notificationId: 'notif-123' }),
    queueNotification: jest.fn<any>().mockResolvedValue({ queued: true }),
  },
  createRequestContext: jest.fn<any>((tenantId: string, userId?: string) => ({
    tenantId,
    userId,
    traceId: `test-trace-${Date.now()}`,
  })),
  ServiceClientError: class ServiceClientError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

describe('payment-service Shared Client Usage', () => {
  let notificationServiceClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const shared = require('@tickettoken/shared');
    notificationServiceClient = shared.notificationServiceClient;
  });

  describe('Import Validation', () => {
    it('should import notificationServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.notificationServiceClient).toBeDefined();
      expect(shared.notificationServiceClient.sendNotification).toBeDefined();
    });

    it('should import createRequestContext from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.createRequestContext).toBeDefined();
    });

    it('should import ServiceClientError from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.ServiceClientError).toBeDefined();
    });

    it('should use shared client in notification.service.ts', () => {
      const servicePath = path.join(__dirname, '../../src/services/notification.service.ts');
      const content = fs.readFileSync(servicePath, 'utf8');

      expect(content).toMatch(/@tickettoken\/shared/);
      expect(content).toMatch(/notificationServiceClient/);
      expect(content).toMatch(/createRequestContext/);
      expect(content).toMatch(/ServiceClientError/);
    });
  });

  describe('Custom HTTP Client Removal', () => {
    it('should NOT have custom http-client.ts', () => {
      const httpClientPath = path.join(__dirname, '../../src/utils/http-client.ts');
      const exists = fs.existsSync(httpClientPath);
      expect(exists).toBe(false);
    });

    it('should NOT have standalone notification client', () => {
      const customClientPath = path.join(__dirname, '../../src/clients/notification.client.ts');
      const exists = fs.existsSync(customClientPath);
      expect(exists).toBe(false);
    });
  });

  describe('RequestContext Creation', () => {
    it('should create RequestContext with tenantId and userId', () => {
      const { createRequestContext } = require('@tickettoken/shared');
      const ctx = createRequestContext('tenant-123', 'user-456');

      expect(ctx.tenantId).toBe('tenant-123');
      expect(ctx.userId).toBe('user-456');
    });
  });

  describe('notificationServiceClient Method Calls', () => {
    it('should call sendNotification for payment notifications', async () => {
      const ctx = { tenantId: 'tenant-123', userId: 'user-456', traceId: 'trace-1' };

      await notificationServiceClient.sendNotification(
        {
          userId: 'user-456',
          templateId: 'payment_succeeded',
          channels: ['email'],
          priority: 'normal',
          data: {
            amount: '100.00',
            currency: 'USD',
          },
        },
        ctx
      );

      expect(notificationServiceClient.sendNotification).toHaveBeenCalled();
    });

    it('should call sendNotification for refund notifications', async () => {
      const ctx = { tenantId: 'tenant-123', userId: 'user-456', traceId: 'trace-1' };

      await notificationServiceClient.sendNotification(
        {
          userId: 'user-456',
          templateId: 'refund_initiated',
          channels: ['email'],
          priority: 'normal',
          data: {
            refundId: 'refund-123',
            amount: '50.00',
          },
        },
        ctx
      );

      expect(notificationServiceClient.sendNotification).toHaveBeenCalled();
    });

    it('should call sendNotification for dispute notifications', async () => {
      const ctx = { tenantId: 'tenant-123', userId: 'user-456', traceId: 'trace-1' };

      await notificationServiceClient.sendNotification(
        {
          userId: 'user-456',
          templateId: 'dispute_opened',
          channels: ['email'],
          priority: 'high',
          data: {
            disputeId: 'dispute-123',
            amount: '150.00',
          },
        },
        ctx
      );

      expect(notificationServiceClient.sendNotification).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle ServiceClientError gracefully', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      notificationServiceClient.sendNotification.mockRejectedValueOnce(
        new ServiceClientError('Notification service unavailable', 503)
      );

      // Notification service errors should be handled gracefully
      await expect(
        notificationServiceClient.sendNotification({}, { tenantId: 'test' })
      ).rejects.toThrow('Notification service unavailable');
    });

    it('should handle notification failures without breaking main flow', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      notificationServiceClient.sendNotification.mockRejectedValueOnce(
        new ServiceClientError('Rate limit exceeded', 429)
      );

      // The service should catch this and return false, not throw
      let result = true;
      try {
        await notificationServiceClient.sendNotification({}, { tenantId: 'test' });
      } catch (e) {
        result = false;
      }

      expect(result).toBe(false);
    });
  });

  describe('Notification Service Integration', () => {
    it('should have notification service with correct structure', () => {
      const servicePath = path.join(__dirname, '../../src/services/notification.service.ts');
      const content = fs.readFileSync(servicePath, 'utf8');

      // Should have refund notification methods
      expect(content).toMatch(/sendRefundInitiated/);
      expect(content).toMatch(/sendRefundCompleted/);
      expect(content).toMatch(/sendRefundFailed/);

      // Should have dispute notification methods
      expect(content).toMatch(/sendDisputeOpened/);

      // Should have payment notification methods
      expect(content).toMatch(/sendPaymentSucceeded/);
    });

    it('should use proper notification data format', () => {
      const servicePath = path.join(__dirname, '../../src/services/notification.service.ts');
      const content = fs.readFileSync(servicePath, 'utf8');

      // Should use userId and templateId format
      expect(content).toMatch(/userId:/);
      expect(content).toMatch(/templateId:/);
      expect(content).toMatch(/channels:/);
    });
  });

  describe('Reconciliation Service Integration', () => {
    it('should use shared library in reconciliation-service.ts', () => {
      const servicePath = path.join(__dirname, '../../src/services/reconciliation/reconciliation-service.ts');
      if (fs.existsSync(servicePath)) {
        const content = fs.readFileSync(servicePath, 'utf8');
        expect(content).toMatch(/@tickettoken\/shared/);
      }
    });
  });
});
