/**
 * Unit tests for PaymentIntegration service
 * Tests payment completion handling and mint job creation
 */

// Mock dependencies before imports
jest.mock('../../../src/queues/mintQueue', () => ({
  addMintJob: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

import { PaymentIntegration } from '../../../src/services/PaymentIntegration';
import { addMintJob } from '../../../src/queues/mintQueue';
import logger from '../../../src/utils/logger';

describe('PaymentIntegration', () => {
  const mockOrderData = {
    orderId: 'order-123',
    eventId: 'event-456',
    userId: 'user-789',
    tenantId: 'tenant-abc',
    tickets: [
      {
        id: 'ticket-1',
        eventName: 'Concert A',
        venue: 'Stadium X',
        eventDate: '2026-02-15',
        tier: 'VIP',
        seatNumber: 'A1',
        price: 150.00
      },
      {
        id: 'ticket-2',
        eventName: 'Concert A',
        venue: 'Stadium X',
        eventDate: '2026-02-15',
        tier: 'General',
        seatNumber: 'B10',
        price: 75.00
      }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    (addMintJob as jest.Mock).mockResolvedValue({
      id: 'job-123',
      data: {}
    });
  });

  describe('onPaymentComplete', () => {
    it('should extract order data', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      expect(addMintJob).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-123'
        })
      );
    });

    it('should map ticket fields', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      expect(addMintJob).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'ticket-1',
          tenantId: 'tenant-abc',
          eventId: 'event-456',
          userId: 'user-789'
        })
      );
    });

    it('should include metadata', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      expect(addMintJob).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            eventName: 'Concert A',
            venue: 'Stadium X',
            date: '2026-02-15',
            tier: 'VIP',
            seatNumber: 'A1',
            price: 150.00
          })
        })
      );
    });

    it('should create job per ticket', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      expect(addMintJob).toHaveBeenCalledTimes(2);
    });

    it('should return job array', async () => {
      const result = await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('should log completion', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Payment completed'),
        expect.anything()
      );
    });

    it('should include orderId in log', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('order-123'),
        expect.anything()
      );
    });

    it('should include ticket count in log', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('2 tickets'),
        expect.anything()
      );
    });

    it('should log job creation success', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Added'),
        expect.anything()
      );
    });

    it('should handle single ticket order', async () => {
      const singleTicketOrder = {
        ...mockOrderData,
        tickets: [mockOrderData.tickets[0]]
      };
      
      const result = await PaymentIntegration.onPaymentComplete(singleTicketOrder);
      
      expect(result).toHaveLength(1);
      expect(addMintJob).toHaveBeenCalledTimes(1);
    });

    it('should handle empty tickets array', async () => {
      const emptyOrder = {
        ...mockOrderData,
        tickets: []
      };
      
      const result = await PaymentIntegration.onPaymentComplete(emptyOrder);
      
      expect(result).toHaveLength(0);
      expect(addMintJob).not.toHaveBeenCalled();
    });

    it('should preserve all ticket metadata fields', async () => {
      const orderWithAllFields = {
        ...mockOrderData,
        tickets: [{
          id: 'ticket-full',
          eventName: 'Full Event',
          venue: 'Full Venue',
          eventDate: '2026-03-20',
          tier: 'Premium',
          seatNumber: 'P1',
          price: 200.00
        }]
      };
      
      await PaymentIntegration.onPaymentComplete(orderWithAllFields);
      
      expect(addMintJob).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            eventName: 'Full Event',
            venue: 'Full Venue',
            date: '2026-03-20',
            tier: 'Premium',
            seatNumber: 'P1',
            price: 200.00
          }
        })
      );
    });

    it('should pass tenantId to each job', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      const calls = (addMintJob as jest.Mock).mock.calls;
      calls.forEach((call: any[]) => {
        expect(call[0].tenantId).toBe('tenant-abc');
      });
    });

    it('should pass eventId to each job', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      const calls = (addMintJob as jest.Mock).mock.calls;
      calls.forEach((call: any[]) => {
        expect(call[0].eventId).toBe('event-456');
      });
    });

    it('should pass userId to each job', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      const calls = (addMintJob as jest.Mock).mock.calls;
      calls.forEach((call: any[]) => {
        expect(call[0].userId).toBe('user-789');
      });
    });

    it('should use unique ticketId for each job', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      const calls = (addMintJob as jest.Mock).mock.calls;
      const ticketIds = calls.map((call: any[]) => call[0].ticketId);
      
      expect(ticketIds).toContain('ticket-1');
      expect(ticketIds).toContain('ticket-2');
      expect(new Set(ticketIds).size).toBe(2); // All unique
    });

    it('should handle large order with many tickets', async () => {
      const largeOrder = {
        ...mockOrderData,
        tickets: Array.from({ length: 50 }, (_, i) => ({
          id: `ticket-${i}`,
          eventName: 'Big Concert',
          venue: 'Stadium',
          eventDate: '2026-04-01',
          tier: 'General',
          seatNumber: `Seat-${i}`,
          price: 50.00
        }))
      };
      
      const result = await PaymentIntegration.onPaymentComplete(largeOrder);
      
      expect(result).toHaveLength(50);
      expect(addMintJob).toHaveBeenCalledTimes(50);
    });

    it('should await all job creations', async () => {
      let callOrder: number[] = [];
      (addMintJob as jest.Mock).mockImplementation(async (data) => {
        const index = parseInt(data.ticketId.split('-')[1]);
        callOrder.push(index);
        await new Promise(resolve => setTimeout(resolve, 10));
        return { id: `job-${index}`, data };
      });

      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      // Both jobs should be created
      expect(addMintJob).toHaveBeenCalledTimes(2);
    });

    it('should map eventDate to date in metadata', async () => {
      await PaymentIntegration.onPaymentComplete(mockOrderData);
      
      expect(addMintJob).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            date: '2026-02-15'  // eventDate mapped to date
          })
        })
      );
    });
  });

  describe('error handling', () => {
    it('should propagate addMintJob errors', async () => {
      (addMintJob as jest.Mock).mockRejectedValue(new Error('Queue error'));
      
      await expect(
        PaymentIntegration.onPaymentComplete(mockOrderData)
      ).rejects.toThrow('Queue error');
    });

    it('should handle partial failures', async () => {
      (addMintJob as jest.Mock)
        .mockResolvedValueOnce({ id: 'job-1' })
        .mockRejectedValueOnce(new Error('Second job failed'));
      
      await expect(
        PaymentIntegration.onPaymentComplete(mockOrderData)
      ).rejects.toThrow('Second job failed');
    });
  });

  describe('static method', () => {
    it('should be callable without instantiation', async () => {
      // PaymentIntegration.onPaymentComplete is static
      expect(typeof PaymentIntegration.onPaymentComplete).toBe('function');
    });
  });
});
