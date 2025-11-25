import { Tickets } from '../../../src/resources/tickets';
import { HTTPClient } from '../../../src/client/http-client';
import { mockTicket, mockPaginatedResponse } from '../../setup';

describe('Tickets Resource', () => {
  let tickets: Tickets;
  let mockHttpClient: jest.Mocked<HTTPClient>;

  beforeEach(() => {
    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    } as any;

    tickets = new Tickets(mockHttpClient);
  });

  describe('list', () => {
    it('should fetch all tickets', async () => {
      const response = { ...mockPaginatedResponse, data: [mockTicket] };
      mockHttpClient.get.mockResolvedValue(response);

      const result = await tickets.list();

      expect(mockHttpClient.get).toHaveBeenCalledWith('/tickets', { params: {} });
      expect(result).toEqual(response);
    });

    it('should pass pagination params', async () => {
      const response = mockPaginatedResponse;
      mockHttpClient.get.mockResolvedValue(response);

      await tickets.list({ page: 1, limit: 50 });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/tickets', {
        params: { page: 1, limit: 50 },
      });
    });
  });

  describe('get', () => {
    it('should fetch single ticket by id', async () => {
      mockHttpClient.get.mockResolvedValue(mockTicket);

      const result = await tickets.get('tkt_123');

      expect(mockHttpClient.get).toHaveBeenCalledWith('/tickets/tkt_123');
      expect(result).toEqual(mockTicket);
    });
  });

  describe('purchase', () => {
    it('should purchase tickets', async () => {
      const purchaseParams = {
        eventId: 'evt_123',
        ticketType: 'general-admission',
        quantity: 2,
        paymentMethod: 'card',
      };
      const purchasedTickets = [mockTicket, { ...mockTicket, id: 'tkt_124' }];
      mockHttpClient.post.mockResolvedValue(purchasedTickets);

      const result = await tickets.purchase(purchaseParams);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/tickets/purchase', purchaseParams);
      expect(result).toEqual(purchasedTickets);
    });

    it('should purchase tickets with metadata', async () => {
      const purchaseParams = {
        eventId: 'evt_123',
        ticketType: 'vip',
        quantity: 1,
        paymentMethod: 'card',
        metadata: { specialRequest: 'Front row' },
      };
      mockHttpClient.post.mockResolvedValue([mockTicket]);

      await tickets.purchase(purchaseParams);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/tickets/purchase', purchaseParams);
    });
  });

  describe('transfer', () => {
    it('should transfer ticket', async () => {
      const transferParams = {
        ticketId: 'tkt_123',
        recipientAddress: '0xrecipient',
      };
      const transferredTicket = { ...mockTicket, userId: 'usr_new' };
      mockHttpClient.post.mockResolvedValue(transferredTicket);

      const result = await tickets.transfer(transferParams);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/tickets/transfer', transferParams);
      expect(result).toEqual(transferredTicket);
    });
  });

  describe('validate', () => {
    it('should validate ticket and return valid result', async () => {
      const validationResult = { valid: true, ticket: mockTicket };
      mockHttpClient.post.mockResolvedValue(validationResult);

      const result = await tickets.validate('tkt_123');

      expect(mockHttpClient.post).toHaveBeenCalledWith('/tickets/tkt_123/validate');
      expect(result).toEqual(validationResult);
    });

    it('should return invalid result for invalid ticket', async () => {
      const validationResult = {
        valid: false,
        reason: 'Ticket already used',
      };
      mockHttpClient.post.mockResolvedValue(validationResult);

      const result = await tickets.validate('tkt_invalid');

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('use', () => {
    it('should mark ticket as used', async () => {
      const usedTicket = { ...mockTicket, status: 'used' };
      mockHttpClient.post.mockResolvedValue(usedTicket);

      const result = await tickets.use('tkt_123');

      expect(mockHttpClient.post).toHaveBeenCalledWith('/tickets/tkt_123/use');
      expect(result).toEqual(usedTicket);
    });
  });

  describe('cancel', () => {
    it('should cancel ticket with reason', async () => {
      const cancelledTicket = { ...mockTicket, status: 'cancelled' };
      mockHttpClient.post.mockResolvedValue(cancelledTicket);

      const result = await tickets.cancel('tkt_123', 'Changed plans');

      expect(mockHttpClient.post).toHaveBeenCalledWith('/tickets/tkt_123/cancel', {
        reason: 'Changed plans',
      });
      expect(result).toEqual(cancelledTicket);
    });
  });

  describe('getByEvent', () => {
    it('should fetch tickets for specific event', async () => {
      const response = { ...mockPaginatedResponse, data: [mockTicket] };
      mockHttpClient.get.mockResolvedValue(response);

      const result = await tickets.getByEvent('evt_123');

      expect(mockHttpClient.get).toHaveBeenCalledWith('/events/evt_123/tickets', {
        params: {},
      });
      expect(result).toEqual(response);
    });

    it('should pass pagination params when getting event tickets', async () => {
      const response = mockPaginatedResponse;
      mockHttpClient.get.mockResolvedValue(response);

      await tickets.getByEvent('evt_123', { page: 2 });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/events/evt_123/tickets', {
        params: { page: 2 },
      });
    });
  });

  describe('getMyTickets', () => {
    it('should fetch current user tickets', async () => {
      const response = { ...mockPaginatedResponse, data: [mockTicket] };
      mockHttpClient.get.mockResolvedValue(response);

      const result = await tickets.getMyTickets();

      expect(mockHttpClient.get).toHaveBeenCalledWith('/tickets/me', { params: {} });
      expect(result).toEqual(response);
    });

    it('should pass pagination params when getting my tickets', async () => {
      const response = mockPaginatedResponse;
      mockHttpClient.get.mockResolvedValue(response);

      await tickets.getMyTickets({ limit: 100 });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/tickets/me', {
        params: { limit: 100 },
      });
    });
  });
});
