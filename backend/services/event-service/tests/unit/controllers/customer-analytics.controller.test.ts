/**
 * Customer Analytics Controller Unit Tests
 * 
 * Tests the customer analytics controller handlers for:
 * - getCustomerProfile: Get customer profile with purchase history
 */

import { getCustomerProfile } from '../../../src/controllers/customer-analytics.controller';

describe('Customer Analytics Controller', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      params: { customerId: 'customer-123' }
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('getCustomerProfile', () => {
    it('should return customer profile', async () => {
      await getCustomerProfile(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'customer-123',
          profile: expect.any(Object),
          purchaseHistory: expect.any(Array),
          preferences: expect.any(Object)
        })
      });
    });

    it('should include profile data', async () => {
      await getCustomerProfile(mockRequest, mockReply);

      const response = mockReply.send.mock.calls[0][0];
      expect(response.data.profile).toEqual(
        expect.objectContaining({
          total_purchases: expect.any(Number),
          total_spent: expect.any(Number),
          average_ticket_price: expect.any(Number),
          member_since: expect.any(String)
        })
      );
    });

    it('should include purchase history', async () => {
      await getCustomerProfile(mockRequest, mockReply);

      const response = mockReply.send.mock.calls[0][0];
      expect(Array.isArray(response.data.purchaseHistory)).toBe(true);
    });

    it('should include preferences', async () => {
      await getCustomerProfile(mockRequest, mockReply);

      const response = mockReply.send.mock.calls[0][0];
      expect(response.data.preferences).toEqual(
        expect.objectContaining({
          favorite_venues: expect.any(Array),
          favorite_categories: expect.any(Array),
          notification_preferences: expect.any(Object)
        })
      );
    });

    it('should handle different customer IDs', async () => {
      mockRequest.params.customerId = 'different-customer-456';

      await getCustomerProfile(mockRequest, mockReply);

      const response = mockReply.send.mock.calls[0][0];
      expect(response.data.id).toBe('different-customer-456');
    });
  });
});
