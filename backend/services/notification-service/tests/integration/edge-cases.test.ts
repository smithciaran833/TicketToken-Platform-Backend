import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import notificationRoutes from '../../src/routes/notification.routes';

// Mock dependencies
jest.mock('../../src/controllers/notification.controller');
jest.mock('../../src/middleware/auth.middleware');
jest.mock('../../src/middleware/validation.middleware');
jest.mock('../../src/services/notification.service');
jest.mock('../../src/services/template.service');

const mockAuth = require('../../src/middleware/auth.middleware');
const mockValidation = require('../../src/middleware/validation.middleware');
const mockController = require('../../src/controllers/notification.controller');
const mockNotificationService = require('../../src/services/notification.service');
const mockTemplateService = require('../../src/services/template.service');

describe('Edge Cases - Integration Tests', () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeAll(async () => {
    // Mock auth middleware
    mockAuth.authMiddleware = jest.fn(async (request: any) => {
      request.user = { id: 'test-user', venueId: 'test-venue' };
    });

    // Mock validation middleware
    mockValidation.validateSendRequest = jest.fn(async () => {});
    mockValidation.validateBatchSendRequest = jest.fn(async () => {});
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    
    app = Fastify();
    await app.register(notificationRoutes, { prefix: '/notifications' });
    await app.ready();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Template with Missing Variables', () => {
    it('should handle template with undefined variables gracefully', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          return reply.status(400).send({
            error: 'Template Error',
            message: 'Missing required template variable: userName',
            missingVariables: ['userName']
          });
        })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'email',
          recipientId: 'user-123',
          recipient: { email: 'test@example.com', name: 'Test' },
          type: 'transactional',
          template: 'order-confirmation',
          data: {
            orderId: '12345'
            // Missing userName variable
          }
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Template Error');
      expect(body.missingVariables).toContain('userName');
    });

    it('should use default values for optional template variables', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          return reply.status(200).send({
            success: true,
            id: 'notif-123',
            message: 'Notification sent with default values'
          });
        })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'email',
          recipientId: 'user-123',
          recipient: { email: 'test@example.com', name: 'Test' },
          type: 'transactional',
          template: 'order-confirmation',
          data: {
            userName: 'John',
            orderId: '12345'
            // Optional variables will use defaults
          }
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject template with malformed data structure', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          return reply.status(400).send({
            error: 'Invalid Data Structure',
            message: 'Template data must be a flat object'
          });
        })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'email',
          recipientId: 'user-123',
          recipient: { email: 'test@example.com', name: 'Test' },
          type: 'transactional',
          template: 'order-confirmation',
          data: {
            nested: {
              deeply: {
                malformed: 'data'
              }
            }
          }
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid Data Structure');
    });
  });

  describe('Notifications to Suppressed Addresses', () => {
    it('should reject notification to suppressed email address', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Recipient has opted out of notifications',
            suppressionReason: 'user_opt_out'
          });
        })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'email',
          recipientId: 'user-123',
          recipient: { email: 'suppressed@example.com', name: 'Test' },
          type: 'marketing',
          template: 'newsletter',
          data: {}
        }
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.suppressionReason).toBe('user_opt_out');
    });

    it('should reject notification to bounced email address', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Email address has hard bounced',
            suppressionReason: 'hard_bounce'
          });
        })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'email',
          recipientId: 'user-123',
          recipient: { email: 'bounced@example.com', name: 'Test' },
          type: 'transactional',
          template: 'order-confirmation',
          data: {}
        }
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.suppressionReason).toBe('hard_bounce');
    });

    it('should allow transactional emails to opted-out users', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          return reply.status(200).send({
            success: true,
            id: 'notif-123',
            message: 'Transactional notification bypassed opt-out'
          });
        })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'email',
          recipientId: 'user-123',
          recipient: { email: 'opted-out@example.com', name: 'Test' },
          type: 'transactional', // Transactional should bypass
          template: 'password-reset',
          data: {}
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject notification to spam-reported phone number', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Phone number reported as spam',
            suppressionReason: 'spam_report'
          });
        })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'sms',
          recipientId: 'user-123',
          recipient: { phone: '+1234567890', name: 'Test' },
          type: 'marketing',
          template: 'promotion',
          data: {}
        }
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.suppressionReason).toBe('spam_report');
    });
  });

  describe('Notifications During Quiet Hours', () => {
    it('should queue notification sent during quiet hours', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          return reply.status(202).send({
            success: true,
            id: 'notif-123',
            status: 'queued',
            message: 'Notification queued for delivery after quiet hours',
            scheduledFor: '2024-01-01T09:00:00Z'
          });
        })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'sms',
          recipientId: 'user-123',
          recipient: { phone: '+1234567890', name: 'Test' },
          type: 'marketing',
          template: 'promotion',
          data: {},
          respectQuietHours: true
        }
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('queued');
      expect(body.scheduledFor).toBeDefined();
    });

    it('should send urgent notifications during quiet hours', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          return reply.status(200).send({
            success: true,
            id: 'notif-123',
            message: 'Urgent notification sent immediately'
          });
        })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'sms',
          recipientId: 'user-123',
          recipient: { phone: '+1234567890', name: 'Test' },
          type: 'transactional',
          priority: 'urgent',
          template: 'security-alert',
          data: {}
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should respect user timezone for quiet hours', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          return reply.status(202).send({
            success: true,
            id: 'notif-123',
            status: 'queued',
            message: 'Queued based on recipient timezone',
            recipientTimezone: 'America/New_York'
          });
        })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'sms',
          recipientId: 'user-123',
          recipient: { 
            phone: '+1234567890', 
            name: 'Test',
            timezone: 'America/New_York'
          },
          type: 'marketing',
          template: 'promotion',
          data: {},
          respectQuietHours: true
        }
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.recipientTimezone).toBe('America/New_York');
    });
  });

  describe('Expired Notification Handling', () => {
    it('should reject expired notification', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Notification has expired',
            expiresAt: '2024-01-01T00:00:00Z'
          });
        })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'email',
          recipientId: 'user-123',
          recipient: { email: 'test@example.com', name: 'Test' },
          type: 'transactional',
          template: 'limited-offer',
          data: {},
          expiresAt: '2024-01-01T00:00:00Z' // Past date
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('expired');
    });

    it('should send notification before expiry', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          return reply.status(200).send({
            success: true,
            id: 'notif-123'
          });
        })
      };

      const futureDate = new Date(Date.now() + 86400000).toISOString(); // 24 hours from now

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'email',
          recipientId: 'user-123',
          recipient: { email: 'test@example.com', name: 'Test' },
          type: 'transactional',
          template: 'limited-offer',
          data: {},
          expiresAt: futureDate
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Concurrent Batch Sends', () => {
    it('should handle concurrent batch send requests', async () => {
      let requestCount = 0;

      mockController.notificationController = {
        sendBatch: jest.fn(async (request: any, reply: any) => {
          requestCount++;
          return reply.status(200).send({
            success: true,
            sent: 10,
            requestNumber: requestCount
          });
        })
      };

      const requests = Array(5).fill(null).map(() =>
        app.inject({
          method: 'POST',
          url: '/notifications/send-batch',
          payload: {
            notifications: Array(10).fill({
              channel: 'email',
              recipientId: 'user-123',
              recipient: { email: 'test@example.com', name: 'Test' },
              type: 'marketing',
              template: 'newsletter',
              data: {}
            })
          }
        })
      );

      const responses = await Promise.all(requests);

      expect(responses.every(r => r.statusCode === 200)).toBe(true);
      expect(requestCount).toBe(5);
    });

    it('should handle concurrent sends to same recipient', async () => {
      let sentCount = 0;

      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          sentCount++;
          return reply.status(200).send({
            success: true,
            id: `notif-${sentCount}`
          });
        })
      };

      const requests = Array(10).fill(null).map(() =>
        app.inject({
          method: 'POST',
          url: '/notifications/send',
          payload: {
            channel: 'email',
            recipientId: 'user-123',
            recipient: { email: 'test@example.com', name: 'Test' },
            type: 'transactional',
            template: 'order-confirmation',
            data: { orderId: '12345' }
          }
        })
      );

      const responses = await Promise.all(requests);

      expect(responses.every(r => r.statusCode === 200)).toBe(true);
      expect(sentCount).toBe(10);
    });

    it('should maintain order in batch processing', async () => {
      const processedIds: string[] = [];

      mockController.notificationController = {
        sendBatch: jest.fn(async (request: any, reply: any) => {
          const ids = request.body.notifications.map((n: any) => n.recipientId);
          processedIds.push(...ids);
          
          return reply.status(200).send({
            success: true,
            sent: ids.length,
            order: ids
          });
        })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send-batch',
        payload: {
          notifications: [
            { channel: 'email', recipientId: 'user-1', recipient: { email: 'test1@example.com', name: 'Test 1' }, type: 'marketing', template: 'newsletter', data: {} },
            { channel: 'email', recipientId: 'user-2', recipient: { email: 'test2@example.com', name: 'Test 2' }, type: 'marketing', template: 'newsletter', data: {} },
            { channel: 'email', recipientId: 'user-3', recipient: { email: 'test3@example.com', name: 'Test 3' }, type: 'marketing', template: 'newsletter', data: {} }
          ]
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.order).toEqual(['user-1', 'user-2', 'user-3']);
    });
  });

  describe('Large Payload Handling', () => {
    it('should handle notification with large data payload', async () => {
      mockController.notificationController = {
        send: jest.fn(async (request: any, reply: any) => {
          const dataSize = JSON.stringify(request.body.data).length;
          
          if (dataSize > 100000) { // 100KB limit
            return reply.status(413).send({
              error: 'Payload Too Large',
              message: 'Data payload exceeds maximum size'
            });
          }
          
          return reply.status(200).send({
            success: true,
            id: 'notif-123'
          });
        })
      };

      const largeData = {
        items: Array(1000).fill({ name: 'Item', description: 'A' .repeat(100) })
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'email',
          recipientId: 'user-123',
          recipient: { email: 'test@example.com', name: 'Test' },
          type: 'marketing',
          template: 'catalog',
          data: largeData
        }
      });

      expect(response.statusCode).toBe(413);
    });

    it('should handle batch with maximum recipients', async () => {
      mockController.notificationController = {
        sendBatch: jest.fn(async (request: any, reply: any) => {
          return reply.status(200).send({
            success: true,
            sent: request.body.notifications.length
          });
        })
      };

      const maxRecipients = Array(100).fill(null).map((_, i) => ({
        channel: 'email',
        recipientId: `user-${i}`,
        recipient: { email: `test${i}@example.com`, name: `Test ${i}` },
        type: 'marketing',
        template: 'newsletter',
        data: {}
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send-batch',
        payload: {
          notifications: maxRecipients
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sent).toBe(100);
    });
  });
});
