/**
 * Cancellation Controller Unit Tests
 * 
 * Tests the cancellation controller handler for:
 * - cancelEvent: Cancel an event with reason and refund trigger
 */

import { cancelEvent } from '../../../src/controllers/cancellation.controller';

// Mock dependencies
jest.mock('../../../src/services/cancellation.service', () => ({
  CancellationService: jest.fn().mockImplementation(() => ({
    validateCancellationPermission: jest.fn(),
    cancelEvent: jest.fn()
  }))
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

import { CancellationService } from '../../../src/services/cancellation.service';

describe('Cancellation Controller', () => {
  let mockCancellationService: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCancellationService = {
      validateCancellationPermission: jest.fn(),
      cancelEvent: jest.fn()
    };

    (CancellationService as jest.Mock).mockImplementation(() => mockCancellationService);

    mockRequest = {
      params: { eventId: 'event-123' },
      body: { cancellation_reason: 'Weather conditions' },
      container: {
        cradle: { db: {} }
      },
      log: {
        error: jest.fn()
      }
    };
    mockRequest.auth = { userId: 'user-123', tenantId: 'tenant-123' };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('cancelEvent', () => {
    it('should cancel event successfully', async () => {
      const cancellationResult = {
        eventId: 'event-123',
        status: 'CANCELLED',
        cancelled_at: new Date()
      };
      mockCancellationService.validateCancellationPermission.mockResolvedValue(true);
      mockCancellationService.cancelEvent.mockResolvedValue(cancellationResult);

      await cancelEvent(mockRequest, mockReply);

      expect(mockCancellationService.validateCancellationPermission).toHaveBeenCalledWith(
        'event-123',
        'user-123',
        'tenant-123'
      );
      expect(mockCancellationService.cancelEvent).toHaveBeenCalledWith(
        {
          event_id: 'event-123',
          cancelled_by: 'user-123',
          cancellation_reason: 'Weather conditions',
          trigger_refunds: true
        },
        'tenant-123'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: cancellationResult,
        message: 'Event cancelled successfully'
      });
    });

    it('should cancel event without triggering refunds', async () => {
      mockRequest.body = { cancellation_reason: 'Test reason', trigger_refunds: false };
      mockCancellationService.validateCancellationPermission.mockResolvedValue(true);
      mockCancellationService.cancelEvent.mockResolvedValue({ eventId: 'event-123' });

      await cancelEvent(mockRequest, mockReply);

      expect(mockCancellationService.cancelEvent).toHaveBeenCalledWith(
        expect.objectContaining({ trigger_refunds: false }),
        'tenant-123'
      );
    });

    it('should return 400 when cancellation_reason is missing', async () => {
      mockRequest.body = {};

      await cancelEvent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Cancellation reason is required'
      });
      expect(mockCancellationService.validateCancellationPermission).not.toHaveBeenCalled();
    });

    it('should return 400 when cancellation_reason is empty', async () => {
      mockRequest.body = { cancellation_reason: '   ' };

      await cancelEvent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Cancellation reason is required'
      });
    });

    it('should return 403 when user lacks permission', async () => {
      mockCancellationService.validateCancellationPermission.mockResolvedValue(false);

      await cancelEvent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'You do not have permission to cancel this event'
      });
      expect(mockCancellationService.cancelEvent).not.toHaveBeenCalled();
    });

    it('should return 404 when event is not found', async () => {
      mockCancellationService.validateCancellationPermission.mockResolvedValue(true);
      mockCancellationService.cancelEvent.mockRejectedValue(new Error('Event not found'));

      await cancelEvent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Event not found'
      });
    });

    it('should return 400 when past cancellation deadline', async () => {
      mockCancellationService.validateCancellationPermission.mockResolvedValue(true);
      mockCancellationService.cancelEvent.mockRejectedValue(new Error('Past cancellation deadline'));

      await cancelEvent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Past cancellation deadline'
      });
    });

    it('should return 409 when event is already cancelled', async () => {
      mockCancellationService.validateCancellationPermission.mockResolvedValue(true);
      mockCancellationService.cancelEvent.mockRejectedValue(new Error('Event is already cancelled'));

      await cancelEvent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Event is already cancelled'
      });
    });

    it('should return 500 for unknown errors', async () => {
      mockCancellationService.validateCancellationPermission.mockResolvedValue(true);
      mockCancellationService.cancelEvent.mockRejectedValue(new Error('Database connection failed'));

      await cancelEvent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Database connection failed'
      });
    });

    it('should handle errors with no message', async () => {
      mockCancellationService.validateCancellationPermission.mockResolvedValue(true);
      mockCancellationService.cancelEvent.mockRejectedValue(new Error());

      await cancelEvent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to cancel event'
      });
    });
  });
});
