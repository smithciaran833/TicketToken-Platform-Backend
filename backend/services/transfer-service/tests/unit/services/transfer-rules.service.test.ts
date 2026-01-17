/**
 * Unit Tests for TransferRulesService
 *
 * Tests:
 * - Transfer validation
 * - Rule checking logic
 * - Max transfers limits
 * - Blacklist checking
 * - Cooling periods
 * - Event date proximity
 * - Identity verification
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import { TransferRulesService } from '../../../src/services/transfer-rules.service';

jest.mock('../../../src/utils/logger');
jest.mock('@tickettoken/shared/clients');

describe('TransferRulesService', () => {
  let transferRulesService: TransferRulesService;
  let mockPool: jest.Mocked<Pool>;
  let ticketServiceClient: any;
  let authServiceClient: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    } as any;

    transferRulesService = new TransferRulesService(mockPool);

    const clients = require('@tickettoken/shared/clients');
    ticketServiceClient = clients.ticketServiceClient;
    authServiceClient = clients.authServiceClient;

    jest.clearAllMocks();
  });

  describe('validateTransfer()', () => {
    const params = {
      ticketId: 'ticket-123',
      ticketTypeId: 'type-123',
      eventId: 'event-123',
      fromUserId: 'user-from-123',
      toUserId: 'user-to-456',
      tenantId: 'tenant-123'
    };

    it('should allow transfer when no rules are active', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      const result = await transferRulesService.validateTransfer(params);

      expect(result.allowed).toBe(true);
      expect(result.violatedRules).toBeUndefined();
    });

    it('should query active rules for ticket type and event', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await transferRulesService.validateTransfer(params);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM transfer_rules'),
        ['type-123', 'event-123']
      );
    });

    it('should check rules ordered by priority', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await transferRulesService.validateTransfer(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('ORDER BY priority DESC');
    });

    it('should block transfer on first blocking rule violation', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_name: 'MAX_TRANSFERS',
            rule_type: 'MAX_TRANSFERS_PER_TICKET',
            is_blocking: true,
            config: { max_transfers: 1 }
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ transfer_count: 5 }] } as any);

      const result = await transferRulesService.validateTransfer(params);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('maximum transfers');
      expect(result.violatedRules).toContain('MAX_TRANSFERS');
    });

    it('should allow transfer with non-blocking rule violations', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_name: 'SOFT_LIMIT',
            rule_type: 'MAX_TRANSFERS_PER_TICKET',
            is_blocking: false,
            config: { max_transfers: 1 }
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ transfer_count: 5 }] } as any);

      const result = await transferRulesService.validateTransfer(params);

      expect(result.allowed).toBe(true);
      expect(result.violatedRules).toContain('SOFT_LIMIT');
    });

    it('should check multiple rules in priority order', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              rule_name: 'RULE_1',
              rule_type: 'MAX_TRANSFERS_PER_TICKET',
              is_blocking: false,
              config: { max_transfers: 10 }
            },
            {
              rule_name: 'RULE_2',
              rule_type: 'MAX_TRANSFERS_PER_USER_PER_DAY',
              is_blocking: false,
              config: { max_per_day: 10 }
            }
          ]
        } as any)
        .mockResolvedValueOnce({ rows: [{ transfer_count: 2 }] } as any)
        .mockResolvedValueOnce({ rows: [{ transfer_count: 3 }] } as any);

      const result = await transferRulesService.validateTransfer(params);

      expect(result.allowed).toBe(true);
    });
  });

  describe('MAX_TRANSFERS_PER_TICKET Rule', () => {
    it('should allow transfer when under limit', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_name: 'MAX_TRANSFERS',
            rule_type: 'MAX_TRANSFERS_PER_TICKET',
            is_blocking: true,
            config: { max_transfers: 5 }
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ transfer_count: 2 }] } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(true);
    });

    it('should block transfer when at limit', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_name: 'MAX_TRANSFERS',
            rule_type: 'MAX_TRANSFERS_PER_TICKET',
            is_blocking: true,
            config: { max_transfers: 5 }
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ transfer_count: 5 }] } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('maximum transfers (5)');
    });

    it('should count only completed transfers', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'MAX_TRANSFERS_PER_TICKET',
            is_blocking: true,
            config: { max_transfers: 5 }
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ transfer_count: 2 }] } as any);

      await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      const countQuery = mockPool.query.mock.calls[1][0] as string;
      expect(countQuery).toContain("status = 'COMPLETED'");
    });

    it('should use default max of 5 when not configured', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'MAX_TRANSFERS_PER_TICKET',
            is_blocking: true,
            config: {}
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ transfer_count: 5 }] } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(false);
    });
  });

  describe('MAX_TRANSFERS_PER_USER_PER_DAY Rule', () => {
    it('should allow transfer when under daily limit', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'MAX_TRANSFERS_PER_USER_PER_DAY',
            is_blocking: true,
            config: { max_per_day: 10 }
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ transfer_count: 3 }] } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(true);
    });

    it('should block transfer when at daily limit', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'MAX_TRANSFERS_PER_USER_PER_DAY',
            is_blocking: true,
            config: { max_per_day: 10 }
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ transfer_count: 10 }] } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('daily transfer limit (10)');
    });

    it('should check transfers within last 24 hours', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'MAX_TRANSFERS_PER_USER_PER_DAY',
            is_blocking: true,
            config: { max_per_day: 10 }
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ transfer_count: 3 }] } as any);

      await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      const countQuery = mockPool.query.mock.calls[1][0] as string;
      expect(countQuery).toContain("INTERVAL '24 hours'");
    });

    it('should use default max of 10 when not configured', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'MAX_TRANSFERS_PER_USER_PER_DAY',
            is_blocking: true,
            config: {}
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ transfer_count: 10 }] } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(false);
    });
  });

  describe('BLACKLIST_CHECK Rule', () => {
    it('should allow transfer when neither user is blacklisted', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'BLACKLIST_CHECK',
            is_blocking: true,
            config: {}
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-from-123',
        toUserId: 'user-to-456',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(true);
    });

    it('should block transfer when from user is blacklisted', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'BLACKLIST_CHECK',
            is_blocking: true,
            config: {}
          }]
        } as any)
        .mockResolvedValueOnce({
          rows: [{
            user_id: 'user-from-123',
            reason: 'Fraudulent activity'
          }]
        } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-from-123',
        toUserId: 'user-to-456',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blacklisted');
      expect(result.reason).toContain('Fraudulent activity');
    });

    it('should block transfer when to user is blacklisted', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'BLACKLIST_CHECK',
            is_blocking: true,
            config: {}
          }]
        } as any)
        .mockResolvedValueOnce({
          rows: [{
            user_id: 'user-to-456',
            reason: 'Suspended account'
          }]
        } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-from-123',
        toUserId: 'user-to-456',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blacklisted');
    });

    it('should check only active blacklist entries', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'BLACKLIST_CHECK',
            is_blocking: true,
            config: {}
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-from-123',
        toUserId: 'user-to-456',
        tenantId: 'tenant-123'
      });

      const blacklistQuery = mockPool.query.mock.calls[1][0] as string;
      expect(blacklistQuery).toContain('is_active = true');
    });

    it('should handle missing toUserId gracefully', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'BLACKLIST_CHECK',
            is_blocking: true,
            config: {}
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-from-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('COOLING_PERIOD Rule', () => {
    it('should allow transfer when no previous transfers exist', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'COOLING_PERIOD',
            is_blocking: true,
            config: { cooling_hours: 24 }
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ last_transfer: null }] } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(true);
    });

    it('should allow transfer when cooling period has passed', async () => {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'COOLING_PERIOD',
            is_blocking: true,
            config: { cooling_hours: 24 }
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ last_transfer: twoDaysAgo }] } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(true);
    });

    it('should block transfer during cooling period', async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'COOLING_PERIOD',
            is_blocking: true,
            config: { cooling_hours: 24 }
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ last_transfer: oneHourAgo }] } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cooling period active');
      expect(result.reason).toMatch(/Wait \d+ more hours/);
    });

    it('should use default cooling period of 24 hours', async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            rule_type: 'COOLING_PERIOD',
            is_blocking: true,
            config: {}
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ last_transfer: oneHourAgo }] } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(false);
    });
  });

  describe('EVENT_DATE_PROXIMITY Rule', () => {
    it('should allow transfer when event is far enough away', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          rule_type: 'EVENT_DATE_PROXIMITY',
          is_blocking: true,
          config: { min_days_before_event: 7 }
        }]
      } as any);

      ticketServiceClient.getTicketEventDate.mockResolvedValue({
        eventStartDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        daysUntilEvent: 14
      });

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(true);
    });

    it('should block transfer when too close to event', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          rule_type: 'EVENT_DATE_PROXIMITY',
          is_blocking: true,
          config: { min_days_before_event: 7 }
        }]
      } as any);

      ticketServiceClient.getTicketEventDate.mockResolvedValue({
        eventStartDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        daysUntilEvent: 3
      });

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Too close to event date');
      expect(result.reason).toContain('7 days');
    });

    it('should use default minimum of 7 days', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          rule_type: 'EVENT_DATE_PROXIMITY',
          is_blocking: true,
          config: {}
        }]
      } as any);

      ticketServiceClient.getTicketEventDate.mockResolvedValue({
        eventStartDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        daysUntilEvent: 3
      });

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(false);
    });

    it('should allow transfer when event date unavailable', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          rule_type: 'EVENT_DATE_PROXIMITY',
          is_blocking: true,
          config: { min_days_before_event: 7 }
        }]
      } as any);

      ticketServiceClient.getTicketEventDate.mockResolvedValue(null);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(true);
    });

    it('should allow transfer on service error', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          rule_type: 'EVENT_DATE_PROXIMITY',
          is_blocking: true,
          config: { min_days_before_event: 7 }
        }]
      } as any);

      ticketServiceClient.getTicketEventDate.mockRejectedValue(
        new Error('Service unavailable')
      );

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('IDENTITY_VERIFICATION Rule', () => {
    it('should allow transfer when verification not required', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          rule_type: 'IDENTITY_VERIFICATION',
          is_blocking: true,
          config: { require_verification: false }
        }]
      } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-from-123',
        toUserId: 'user-to-456',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(true);
    });

    it('should allow transfer when all users are verified', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          rule_type: 'IDENTITY_VERIFICATION',
          is_blocking: true,
          config: { require_verification: true }
        }]
      } as any);

      authServiceClient.batchIdentityCheck.mockResolvedValue({
        allVerified: true
      });

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-from-123',
        toUserId: 'user-to-456',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(true);
    });

    it('should block transfer when users not verified', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          rule_type: 'IDENTITY_VERIFICATION',
          is_blocking: true,
          config: { require_verification: true }
        }]
      } as any);

      authServiceClient.batchIdentityCheck.mockResolvedValue({
        allVerified: false
      });

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-from-123',
        toUserId: 'user-to-456',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Identity verification required');
    });

    it('should check both from and to users', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          rule_type: 'IDENTITY_VERIFICATION',
          is_blocking: true,
          config: { require_verification: true }
        }]
      } as any);

      authServiceClient.batchIdentityCheck.mockResolvedValue({
        allVerified: true
      });

      await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-from-123',
        toUserId: 'user-to-456',
        tenantId: 'tenant-123'
      });

      expect(authServiceClient.batchIdentityCheck).toHaveBeenCalledWith(
        ['user-from-123', 'user-to-456'],
        expect.anything()
      );
    });

    it('should block transfer on service error', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          rule_type: 'IDENTITY_VERIFICATION',
          is_blocking: true,
          config: { require_verification: true }
        }]
      } as any);

      authServiceClient.batchIdentityCheck.mockRejectedValue(
        new Error('Service unavailable')
      );

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-from-123',
        toUserId: 'user-to-456',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Unable to verify identity status');
    });

    it('should handle missing toUserId', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          rule_type: 'IDENTITY_VERIFICATION',
          is_blocking: true,
          config: { require_verification: true }
        }]
      } as any);

      authServiceClient.batchIdentityCheck.mockResolvedValue({
        allVerified: true
      });

      await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-from-123',
        tenantId: 'tenant-123'
      });

      expect(authServiceClient.batchIdentityCheck).toHaveBeenCalledWith(
        ['user-from-123'],
        expect.anything()
      );
    });
  });

  describe('Unknown Rule Types', () => {
    it('should allow transfer for unknown rule types', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          rule_type: 'UNKNOWN_RULE_TYPE',
          is_blocking: true,
          config: {}
        }]
      } as any);

      const result = await transferRulesService.validateTransfer({
        ticketId: 'ticket-123',
        ticketTypeId: 'type-123',
        eventId: 'event-123',
        fromUserId: 'user-123',
        tenantId: 'tenant-123'
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw error on database failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await expect(
        transferRulesService.validateTransfer({
          ticketId: 'ticket-123',
          ticketTypeId: 'type-123',
          eventId: 'event-123',
          fromUserId: 'user-123',
          tenantId: 'tenant-123'
        })
      ).rejects.toThrow('Database error');
    });
  });
});
