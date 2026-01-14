/**
 * Tickets Controller Unit Tests
 * 
 * Tests the tickets controller handlers for:
 * - getTicketTypes: Get all ticket types (pricing tiers) for an event
 * - createTicketType: Create new ticket type
 * - updateTicketType: Update ticket type
 * - getTicketType: Get specific ticket type
 */

import {
  getTicketTypes,
  createTicketType,
  updateTicketType,
  getTicketType
} from '../../../src/controllers/tickets.controller';

// Mock dependencies
jest.mock('../../../src/models', () => ({
  EventPricingModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn()
  }))
}));

import { EventPricingModel } from '../../../src/models';

describe('Tickets Controller', () => {
  let mockPricingModel: any;
  let mockEventService: any;
  let mockPricingService: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPricingModel = {
      findById: jest.fn()
    };

    mockEventService = {
      getEvent: jest.fn().mockResolvedValue({ id: 'event-123' })
    };

    mockPricingService = {
      getEventPricing: jest.fn(),
      createPricing: jest.fn(),
      updatePricing: jest.fn()
    };

    (EventPricingModel as jest.Mock).mockImplementation(() => mockPricingModel);

    mockRequest = {
      params: { id: 'event-123' },
      body: {},
      container: {
        cradle: {
          db: {},
          eventService: mockEventService,
          pricingService: mockPricingService
        }
      },
      log: { error: jest.fn() }
    };
    (mockRequest as any).tenantId = 'tenant-123';

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('getTicketTypes', () => {
    it('should return ticket types for an event', async () => {
      const pricing = [
        { id: 'price-1', name: 'VIP', base_price: 100 },
        { id: 'price-2', name: 'GA', base_price: 50 }
      ];
      mockPricingService.getEventPricing.mockResolvedValue(pricing);

      await getTicketTypes(mockRequest, mockReply);

      expect(mockEventService.getEvent).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockPricingService.getEventPricing).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: pricing
      });
    });

    it('should return 404 when event not found', async () => {
      mockEventService.getEvent.mockRejectedValue(new Error('Event not found'));

      await getTicketTypes(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Event not found'
      });
    });
  });

  describe('createTicketType', () => {
    const validTicketData = {
      name: 'VIP Ticket',
      base_price: 100.00,
      currency: 'USD'
    };

    it('should create ticket type successfully', async () => {
      const createdTicket = { id: 'price-123', ...validTicketData };
      mockPricingService.createPricing.mockResolvedValue(createdTicket);
      mockRequest.body = validTicketData;

      await createTicketType(mockRequest, mockReply);

      expect(mockPricingService.createPricing).toHaveBeenCalledWith(
        { event_id: 'event-123', ...validTicketData, is_active: true, is_visible: true },
        'tenant-123'
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: createdTicket
      });
    });

    it('should return 422 on validation error', async () => {
      mockRequest.body = { base_price: -50 };

      await createTicketType(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR'
      }));
    });

    it('should return 404 when event not found', async () => {
      mockEventService.getEvent.mockRejectedValue(new Error('Event not found'));
      mockRequest.body = validTicketData;

      await createTicketType(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateTicketType', () => {
    const updateData = { name: 'Updated VIP', base_price: 120 };

    it('should update ticket type successfully', async () => {
      const existingPricing = { id: 'price-123', event_id: 'event-123', tenant_id: 'tenant-123' };
      const updatedTicket = { ...existingPricing, ...updateData };
      mockPricingModel.findById.mockResolvedValue(existingPricing);
      mockPricingService.updatePricing.mockResolvedValue(updatedTicket);
      mockRequest.params = { id: 'event-123', typeId: 'price-123' };
      mockRequest.body = updateData;

      await updateTicketType(mockRequest, mockReply);

      expect(mockPricingService.updatePricing).toHaveBeenCalledWith('price-123', updateData, 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: updatedTicket
      });
    });

    it('should return 422 on validation error', async () => {
      mockRequest.params = { id: 'event-123', typeId: 'price-123' };
      mockRequest.body = {};

      await updateTicketType(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
    });

    it('should return 404 when pricing not found', async () => {
      mockPricingModel.findById.mockResolvedValue(null);
      mockRequest.params = { id: 'event-123', typeId: 'nonexistent' };
      mockRequest.body = updateData;

      await updateTicketType(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Ticket type not found',
        code: 'NOT_FOUND'
      });
    });

    it('should return 404 when pricing belongs to different event', async () => {
      const existingPricing = { id: 'price-123', event_id: 'other-event', tenant_id: 'tenant-123' };
      mockPricingModel.findById.mockResolvedValue(existingPricing);
      mockRequest.params = { id: 'event-123', typeId: 'price-123' };
      mockRequest.body = updateData;

      await updateTicketType(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getTicketType', () => {
    it('should return ticket type when found', async () => {
      const pricing = { id: 'price-123', event_id: 'event-123', tenant_id: 'tenant-123', name: 'VIP' };
      mockPricingModel.findById.mockResolvedValue(pricing);
      mockRequest.params = { id: 'event-123', typeId: 'price-123' };

      await getTicketType(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: pricing
      });
    });

    it('should return 404 when pricing not found', async () => {
      mockPricingModel.findById.mockResolvedValue(null);
      mockRequest.params = { id: 'event-123', typeId: 'nonexistent' };

      await getTicketType(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should return 404 when pricing belongs to different tenant', async () => {
      const pricing = { id: 'price-123', event_id: 'event-123', tenant_id: 'other-tenant' };
      mockPricingModel.findById.mockResolvedValue(pricing);
      mockRequest.params = { id: 'event-123', typeId: 'price-123' };

      await getTicketType(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });
});
