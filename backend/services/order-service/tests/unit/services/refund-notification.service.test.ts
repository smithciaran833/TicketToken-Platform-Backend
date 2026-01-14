/**
 * Unit Tests: Refund Notification Service
 * Tests refund notifications with timeline calculations for buyers, sellers, creators, and venues
 */

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockPublishEvent = jest.fn();

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => mockPool),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

jest.mock('../../../src/config/rabbitmq', () => ({
  publishEvent: mockPublishEvent,
}));

import { RefundNotificationService, RefundNotificationData } from '../../../src/services/refund-notification.service';

describe('RefundNotificationService', () => {
  let service: RefundNotificationService;

  const baseNotificationData: RefundNotificationData = {
    orderId: 'order-123',
    refundId: 'refund-456',
    refundAmountCents: 10000,
    refundReason: 'Event cancelled',
    refundType: 'FULL',
    buyerId: 'buyer-789',
    buyerEmail: 'buyer@example.com',
    eventId: 'event-abc',
    eventName: 'Test Event',
    tenantId: 'tenant-xyz',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RefundNotificationService();
  });

  describe('notifyRefund', () => {
    it('should notify buyer only for direct purchase', async () => {
      await service.notifyRefund(baseNotificationData);

      expect(mockPublishEvent).toHaveBeenCalledTimes(1);
      expect(mockPublishEvent).toHaveBeenCalledWith(
        'notification.refund.buyer',
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Refund notifications sent', expect.any(Object));
    });

    it('should notify buyer and seller for resale', async () => {
      const resaleData = {
        ...baseNotificationData,
        sellerId: 'seller-123',
        sellerEmail: 'seller@example.com',
      };

      await service.notifyRefund(resaleData);

      expect(mockPublishEvent).toHaveBeenCalledTimes(2);
      expect(mockPublishEvent).toHaveBeenCalledWith('notification.refund.buyer', expect.any(Object));
      expect(mockPublishEvent).toHaveBeenCalledWith('notification.refund.seller', expect.any(Object));
    });

    it('should notify creator when royalty reversed', async () => {
      const dataWithRoyalty = {
        ...baseNotificationData,
        creatorId: 'creator-456',
        creatorName: 'John Doe',
        royaltyReversed: 50,
      };

      await service.notifyRefund(dataWithRoyalty);

      expect(mockPublishEvent).toHaveBeenCalledTimes(2);
      expect(mockPublishEvent).toHaveBeenCalledWith('notification.refund.buyer', expect.any(Object));
      expect(mockPublishEvent).toHaveBeenCalledWith('notification.royalty.creator_reversed', expect.any(Object));
    });

    it('should notify venue when venue royalty reversed', async () => {
      const dataWithVenueRoyalty = {
        ...baseNotificationData,
        venueId: 'venue-789',
        venueName: 'Test Venue',
        venueRoyaltyReversed: 30,
      };

      await service.notifyRefund(dataWithVenueRoyalty);

      expect(mockPublishEvent).toHaveBeenCalledTimes(2);
      expect(mockPublishEvent).toHaveBeenCalledWith('notification.refund.buyer', expect.any(Object));
      expect(mockPublishEvent).toHaveBeenCalledWith('notification.royalty.venue_reversed', expect.any(Object));
    });

    it('should notify all parties when applicable', async () => {
      const fullData = {
        ...baseNotificationData,
        sellerId: 'seller-123',
        sellerEmail: 'seller@example.com',
        creatorId: 'creator-456',
        creatorName: 'John Doe',
        royaltyReversed: 50,
        venueId: 'venue-789',
        venueName: 'Test Venue',
        venueRoyaltyReversed: 30,
      };

      await service.notifyRefund(fullData);

      expect(mockPublishEvent).toHaveBeenCalledTimes(4);
    });

    it('should not notify creator if royalty is zero', async () => {
      const dataWithZeroRoyalty = {
        ...baseNotificationData,
        creatorId: 'creator-456',
        royaltyReversed: 0,
      };

      await service.notifyRefund(dataWithZeroRoyalty);

      expect(mockPublishEvent).toHaveBeenCalledTimes(1); // Only buyer
    });

    it('should handle notification failures gracefully with Promise.allSettled', async () => {
      mockPublishEvent.mockRejectedValueOnce(new Error('Notification failed'));

      const dataWithSeller = {
        ...baseNotificationData,
        sellerId: 'seller-123',
      };

      await expect(service.notifyRefund(dataWithSeller)).resolves.not.toThrow();
    });

    it('should log notification count', async () => {
      const fullData = {
        ...baseNotificationData,
        sellerId: 'seller-123',
        creatorId: 'creator-456',
        royaltyReversed: 50,
      };

      await service.notifyRefund(fullData);

      expect(mockLogger.info).toHaveBeenCalledWith('Refund notifications sent', {
        orderId: baseNotificationData.orderId,
        notificationCount: 3,
      });
    });
  });

  describe('buyer notifications with timeline', () => {
    it('should include card refund timeline (5-10 days)', async () => {
      const cardData = { ...baseNotificationData, paymentMethod: 'card' as const };

      await service.notifyRefund(cardData);

      const buyerCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.refund.buyer');
      expect(buyerCall[1].data.timeline.estimatedMinDays).toBe(5);
      expect(buyerCall[1].data.timeline.estimatedMaxDays).toBe(10);
      expect(buyerCall[1].data.timeline.message).toContain('5-10 business days');
    });

    it('should include bank transfer timeline (3-5 days)', async () => {
      const bankData = { ...baseNotificationData, paymentMethod: 'bank_transfer' as const };

      await service.notifyRefund(bankData);

      const buyerCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.refund.buyer');
      expect(buyerCall[1].data.timeline.estimatedMinDays).toBe(3);
      expect(buyerCall[1].data.timeline.estimatedMaxDays).toBe(5);
      expect(buyerCall[1].data.timeline.message).toContain('3-5 business days');
    });

    it('should include wallet refund timeline (0-1 days)', async () => {
      const walletData = { ...baseNotificationData, paymentMethod: 'wallet' as const };

      await service.notifyRefund(walletData);

      const buyerCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.refund.buyer');
      expect(buyerCall[1].data.timeline.estimatedMinDays).toBe(0);
      expect(buyerCall[1].data.timeline.estimatedMaxDays).toBe(1);
      expect(buyerCall[1].data.timeline.message).toContain('within 24 hours');
    });

    it('should use default timeline for unknown payment method', async () => {
      const unknownData = { ...baseNotificationData, paymentMethod: 'unknown' as any };

      await service.notifyRefund(unknownData);

      const buyerCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.refund.buyer');
      expect(buyerCall[1].data.timeline.estimatedMinDays).toBe(5);
      expect(buyerCall[1].data.timeline.estimatedMaxDays).toBe(10);
    });

    it('should format refund amount correctly', async () => {
      await service.notifyRefund(baseNotificationData);

      const buyerCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.refund.buyer');
      expect(buyerCall[1].data.refundAmountFormatted).toBe('$100.00');
    });

    it('should include estimated arrival date', async () => {
      await service.notifyRefund(baseNotificationData);

      const buyerCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.refund.buyer');
      expect(buyerCall[1].data.timeline.estimatedArrivalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('seller notifications', () => {
    it('should include proceeds reversal timeline (1-2 days)', async () => {
      const sellerData = {
        ...baseNotificationData,
        sellerId: 'seller-123',
        sellerEmail: 'seller@example.com',
      };

      await service.notifyRefund(sellerData);

      const sellerCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.refund.seller');
      expect(sellerCall[1].data.timeline.estimatedMinDays).toBe(1);
      expect(sellerCall[1].data.timeline.estimatedMaxDays).toBe(2);
      expect(sellerCall[1].data.timeline.message).toContain('1-2 business days');
    });

    it('should include proceeds reversal message', async () => {
      const sellerData = {
        ...baseNotificationData,
        sellerId: 'seller-123',
      };

      await service.notifyRefund(sellerData);

      const sellerCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.refund.seller');
      expect(sellerCall[1].data.message).toContain('proceeds');
      expect(sellerCall[1].data.message).toContain('reversed');
    });

    it('should format seller refund amount correctly', async () => {
      const sellerData = {
        ...baseNotificationData,
        sellerId: 'seller-123',
        refundAmountCents: 15050,
      };

      await service.notifyRefund(sellerData);

      const sellerCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.refund.seller');
      expect(sellerCall[1].data.refundAmountFormatted).toBe('$150.50');
    });
  });

  describe('creator royalty notifications', () => {
    it('should include royalty reversal timeline (1-3 days)', async () => {
      const creatorData = {
        ...baseNotificationData,
        creatorId: 'creator-456',
        creatorName: 'John Doe',
        royaltyReversed: 25.50,
      };

      await service.notifyRefund(creatorData);

      const creatorCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.royalty.creator_reversed');
      expect(creatorCall[1].data.timeline.estimatedMinDays).toBe(1);
      expect(creatorCall[1].data.timeline.estimatedMaxDays).toBe(3);
      expect(creatorCall[1].data.timeline.message).toContain('next payout cycle');
    });

    it('should format royalty amount correctly', async () => {
      const creatorData = {
        ...baseNotificationData,
        creatorId: 'creator-456',
        royaltyReversed: 25.50,
      };

      await service.notifyRefund(creatorData);

      const creatorCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.royalty.creator_reversed');
      expect(creatorCall[1].data.reversedAmountFormatted).toBe('$25.50');
      expect(creatorCall[1].data.reversedAmountCents).toBe(2550);
    });

    it('should include creator name in notification', async () => {
      const creatorData = {
        ...baseNotificationData,
        creatorId: 'creator-456',
        creatorName: 'John Doe',
        royaltyReversed: 25,
      };

      await service.notifyRefund(creatorData);

      const creatorCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.royalty.creator_reversed');
      expect(creatorCall[1].data.creatorName).toBe('John Doe');
    });
  });

  describe('venue royalty notifications', () => {
    it('should include venue royalty reversal timeline (1-3 days)', async () => {
      const venueData = {
        ...baseNotificationData,
        venueId: 'venue-789',
        venueName: 'Test Venue',
        venueRoyaltyReversed: 15.75,
      };

      await service.notifyRefund(venueData);

      const venueCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.royalty.venue_reversed');
      expect(venueCall[1].data.timeline.estimatedMinDays).toBe(1);
      expect(venueCall[1].data.timeline.estimatedMaxDays).toBe(3);
    });

    it('should format venue royalty amount correctly', async () => {
      const venueData = {
        ...baseNotificationData,
        venueId: 'venue-789',
        venueRoyaltyReversed: 15.75,
      };

      await service.notifyRefund(venueData);

      const venueCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.royalty.venue_reversed');
      expect(venueCall[1].data.reversedAmountFormatted).toBe('$15.75');
      expect(venueCall[1].data.reversedAmountCents).toBe(1575);
    });

    it('should use venueId for eventId if provided', async () => {
      const venueData = {
        ...baseNotificationData,
        venueId: 'venue-789',
        venueRoyaltyReversed: 15,
      };

      await service.notifyRefund(venueData);

      const venueCall = mockPublishEvent.mock.calls.find(call => call[0] === 'notification.royalty.venue_reversed');
      expect(venueCall[1].venueId).toBe('venue-789');
    });
  });

  describe('getSellerInfo', () => {
    it('should return seller info for resale order', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ seller_id: 'seller-123', seller_email: 'seller@example.com' }],
      });

      const result = await service.getSellerInfo('order-123');

      expect(result).toEqual({
        sellerId: 'seller-123',
        sellerEmail: 'seller@example.com',
      });
    });

    it('should return null for non-resale order', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getSellerInfo('order-123');

      expect(result).toBeNull();
    });

    it('should return null if marketplace table does not exist', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Table does not exist'));

      const result = await service.getSellerInfo('order-123');

      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('getEventInfo', () => {
    it('should return complete event info', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          event_name: 'Concert Night',
          creator_id: 'creator-456',
          creator_name: 'John Doe',
          venue_id: 'venue-789',
          venue_name: 'Madison Square Garden',
        }],
      });

      const result = await service.getEventInfo('event-abc');

      expect(result).toEqual({
        eventName: 'Concert Night',
        creatorId: 'creator-456',
        creatorName: 'John Doe',
        venueId: 'venue-789',
        venueName: 'Madison Square Garden',
      });
    });

    it('should return empty object if event not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getEventInfo('nonexistent');

      expect(result).toEqual({});
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await service.getEventInfo('event-abc');

      expect(result).toEqual({});
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('getPaymentMethod', () => {
    it('should return payment method for order', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ payment_method: 'card' }] });

      const result = await service.getPaymentMethod('order-123');

      expect(result).toBe('card');
    });

    it('should return undefined if order not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getPaymentMethod('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should return undefined on database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await service.getPaymentMethod('order-123');

      expect(result).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });
});
