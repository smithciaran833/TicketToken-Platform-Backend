/**
 * Unit Tests for notification.service.ts
 * Tests notification sending for marketplace events
 */

import { notificationService, NotificationService } from '../../../src/services/notification.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/service-urls', () => ({
  additionalServiceUrls: {
    notificationServiceUrl: 'http://notification-service:3000',
  },
}));

jest.mock('../../../src/config', () => ({
  config: {},
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('notifyListingSold', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });

    it('should notify both seller and buyer when listing is sold', async () => {
      await notificationService.notifyListingSold(
        'listing-123',
        'buyer-456',
        'seller-789',
        100
      );

      // Should call fetch twice - once for seller, once for buyer
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should send correct notification to seller', async () => {
      await notificationService.notifyListingSold(
        'listing-123',
        'buyer-456',
        'seller-789',
        100
      );

      const sellerCall = mockFetch.mock.calls.find(
        call => JSON.parse(call[1].body).user_id === 'seller-789'
      );

      expect(sellerCall).toBeDefined();
      const body = JSON.parse(sellerCall[1].body);
      expect(body.type).toBe('listing_sold');
      expect(body.priority).toBe('high');
    });

    it('should send correct notification to buyer', async () => {
      await notificationService.notifyListingSold(
        'listing-123',
        'buyer-456',
        'seller-789',
        100
      );

      const buyerCall = mockFetch.mock.calls.find(
        call => JSON.parse(call[1].body).user_id === 'buyer-456'
      );

      expect(buyerCall).toBeDefined();
      const body = JSON.parse(buyerCall[1].body);
      expect(body.type).toBe('purchase_confirmed');
    });

    it('should handle notification service errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      // Should not throw
      await expect(
        notificationService.notifyListingSold('listing-123', 'buyer-456', 'seller-789', 100)
      ).resolves.not.toThrow();
    });

    it('should handle non-ok response gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });

      await expect(
        notificationService.notifyListingSold('listing-123', 'buyer-456', 'seller-789', 100)
      ).resolves.not.toThrow();
    });
  });

  describe('notifyPriceChange', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });

    it('should notify all watchers of price decrease', async () => {
      const watchers = ['user-1', 'user-2', 'user-3'];

      await notificationService.notifyPriceChange('listing-123', watchers, 100, 80);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should include correct price direction for decrease', async () => {
      await notificationService.notifyPriceChange('listing-123', ['user-1'], 100, 80);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.body).toContain('decreased');
    });

    it('should include correct price direction for increase', async () => {
      await notificationService.notifyPriceChange('listing-123', ['user-1'], 80, 100);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.body).toContain('increased');
    });

    it('should include old and new price in notification data', async () => {
      await notificationService.notifyPriceChange('listing-123', ['user-1'], 100, 80);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.data.old_price).toBe(100);
      expect(body.data.new_price).toBe(80);
    });

    it('should handle empty watchers array', async () => {
      await notificationService.notifyPriceChange('listing-123', [], 100, 80);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('notifyDisputeUpdate', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });

    it('should notify all parties of dispute update', async () => {
      const parties = ['party-1', 'party-2'];

      await notificationService.notifyDisputeUpdate(
        'dispute-123',
        parties,
        'in_review',
        'Your dispute is being reviewed'
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should send high priority notifications for disputes', async () => {
      await notificationService.notifyDisputeUpdate(
        'dispute-123',
        ['party-1'],
        'resolved',
        'Dispute resolved'
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.priority).toBe('high');
      expect(body.type).toBe('dispute_update');
    });

    it('should include dispute status in notification data', async () => {
      await notificationService.notifyDisputeUpdate(
        'dispute-123',
        ['party-1'],
        'resolved',
        'Dispute resolved'
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.data.dispute_id).toBe('dispute-123');
      expect(body.data.status).toBe('resolved');
    });
  });

  describe('notifyTransferComplete', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });

    it('should notify both buyer and seller', async () => {
      await notificationService.notifyTransferComplete(
        'transfer-123',
        'buyer-456',
        'seller-789',
        'ticket-101'
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should send transfer_complete to buyer', async () => {
      await notificationService.notifyTransferComplete(
        'transfer-123',
        'buyer-456',
        'seller-789',
        'ticket-101'
      );

      const buyerCall = mockFetch.mock.calls.find(
        call => JSON.parse(call[1].body).user_id === 'buyer-456'
      );

      const body = JSON.parse(buyerCall[1].body);
      expect(body.type).toBe('transfer_complete');
      expect(body.data.ticket_id).toBe('ticket-101');
    });

    it('should send payment_received to seller', async () => {
      await notificationService.notifyTransferComplete(
        'transfer-123',
        'buyer-456',
        'seller-789',
        'ticket-101'
      );

      const sellerCall = mockFetch.mock.calls.find(
        call => JSON.parse(call[1].body).user_id === 'seller-789'
      );

      const body = JSON.parse(sellerCall[1].body);
      expect(body.type).toBe('payment_received');
    });
  });

  describe('notifyListingExpiring', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });

    it('should notify seller of expiring listing', async () => {
      await notificationService.notifyListingExpiring('listing-123', 'seller-456', 24);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should send normal priority for expiring notification', async () => {
      await notificationService.notifyListingExpiring('listing-123', 'seller-456', 24);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.priority).toBe('normal');
      expect(body.type).toBe('listing_expiring');
    });

    it('should include hours remaining in notification', async () => {
      await notificationService.notifyListingExpiring('listing-123', 'seller-456', 6);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.body).toContain('6 hours');
      expect(body.data.hours_remaining).toBe(6);
    });
  });

  describe('Class export', () => {
    it('should export NotificationService class', () => {
      expect(NotificationService).toBeDefined();
    });

    it('should export notificationService singleton', () => {
      expect(notificationService).toBeDefined();
    });
  });
});
