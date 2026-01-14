// Mock dependencies BEFORE imports
const mockJoiChain = {
  required: jest.fn().mockReturnThis(),
  optional: jest.fn().mockReturnThis(),
  default: jest.fn().mockReturnThis(),
  min: jest.fn().mockReturnThis(),
  max: jest.fn().mockReturnThis(),
  length: jest.fn().mockReturnThis(),
  integer: jest.fn().mockReturnThis(),
  allow: jest.fn().mockReturnThis(),
  uuid: jest.fn().mockReturnThis(),
  unknown: jest.fn().mockReturnThis(),
};

const mockValidate = jest.fn();

jest.mock('joi', () => ({
  __esModule: true,
  default: {
    object: jest.fn(() => ({
      validate: mockValidate,
      min: jest.fn().mockReturnThis(),
      unknown: jest.fn().mockReturnThis(),
      optional: jest.fn().mockReturnThis(),
    })),
    string: jest.fn(() => mockJoiChain),
    number: jest.fn(() => mockJoiChain),
    boolean: jest.fn(() => mockJoiChain),
  },
}));

jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock EventPricingModel
jest.mock('../../../src/models', () => ({
  EventPricingModel: jest.fn(),
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import * as ticketsController from '../../../src/controllers/tickets.controller';
import { EventPricingModel } from '../../../src/models';

describe('Tickets Controller', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockEventService: any;
  let mockPricingService: any;
  let mockDb: any;
  let mockPricingModel: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockValidate.mockReturnValue({ error: null, value: {} });

    mockPricingModel = {
      findById: jest.fn(),
    };

    (EventPricingModel as jest.MockedClass<typeof EventPricingModel>).mockImplementation(() => mockPricingModel);

    mockEventService = {
      getEvent: jest.fn(),
    };

    mockPricingService = {
      getEventPricing: jest.fn(),
      createPricing: jest.fn(),
      updatePricing: jest.fn(),
    };

    mockDb = jest.fn();

    mockRequest = {
      params: {},
      body: {},
      headers: {},
      log: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      } as any,
      container: {
        cradle: {
          db: mockDb,
          eventService: mockEventService,
          pricingService: mockPricingService,
        },
      } as any,
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('getTicketTypes', () => {
    it('should return ticket types for event', async () => {
      const mockPricing = [
        { id: '1', name: 'General', base_price: 50 },
        { id: '2', name: 'VIP', base_price: 100 },
      ];

      mockRequest.params = { id: 'event-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockPricingService.getEventPricing.mockResolvedValue(mockPricing);

      await ticketsController.getTicketTypes(
        mockRequest as any,
        mockReply as any
      );

      expect(mockEventService.getEvent).toHaveBeenCalledWith('event-1', 'tenant-1');
      expect(mockPricingService.getEventPricing).toHaveBeenCalledWith('event-1', 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockPricing,
      });
    });

    it('should return 404 if event not found', async () => {
      mockRequest.params = { id: 'event-999' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockRejectedValue(new Error('Event not found'));

      await ticketsController.getTicketTypes(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Event not found',
      });
    });
  });

  describe('createTicketType', () => {
    it('should create ticket type', async () => {
      const mockTicketType = {
        id: 'pricing-1',
        name: 'General',
        base_price: 50,
      };
      const requestBody = {
        name: 'General',
        base_price: 50,
      };

      mockRequest.params = { id: 'event-1' };
      mockRequest.body = requestBody;
      (mockRequest as any).tenantId = 'tenant-1';
      mockValidate.mockReturnValue({ error: null, value: requestBody });
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockPricingService.createPricing.mockResolvedValue(mockTicketType);

      await ticketsController.createTicketType(
        mockRequest as any,
        mockReply as any
      );

      expect(mockPricingService.createPricing).toHaveBeenCalledWith(
        {
          event_id: 'event-1',
          ...requestBody,
          is_active: true,
          is_visible: true,
        },
        'tenant-1'
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTicketType,
      });
    });

    it('should return 422 for validation errors', async () => {
      mockRequest.params = { id: 'event-1' };
      mockRequest.body = { name: 'X' }; // Too short
      (mockRequest as any).tenantId = 'tenant-1';
      mockValidate.mockReturnValue({
        error: { details: [{ message: 'Name too short' }] },
        value: null,
      });

      await ticketsController.createTicketType(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.status).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [{ message: 'Name too short' }],
      });
    });

    it('should return 404 if event not found', async () => {
      mockRequest.params = { id: 'event-999' };
      mockRequest.body = { name: 'General', base_price: 50 };
      (mockRequest as any).tenantId = 'tenant-1';
      mockValidate.mockReturnValue({ error: null, value: mockRequest.body });
      mockEventService.getEvent.mockRejectedValue(new Error('Event not found'));

      await ticketsController.createTicketType(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateTicketType', () => {
    it('should update ticket type', async () => {
      const mockPricing = {
        id: 'pricing-1',
        event_id: 'event-1',
        tenant_id: 'tenant-1',
        name: 'General',
      };
      const mockUpdated = { ...mockPricing, base_price: 60 };

      mockRequest.params = { id: 'event-1', typeId: 'pricing-1' };
      mockRequest.body = { base_price: 60 };
      (mockRequest as any).tenantId = 'tenant-1';
      mockValidate.mockReturnValue({ error: null, value: { base_price: 60 } });
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockPricingModel.findById.mockResolvedValue(mockPricing);
      mockPricingService.updatePricing.mockResolvedValue(mockUpdated);

      await ticketsController.updateTicketType(
        mockRequest as any,
        mockReply as any
      );

      expect(mockPricingService.updatePricing).toHaveBeenCalledWith(
        'pricing-1',
        { base_price: 60 },
        'tenant-1'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockUpdated,
      });
    });

    it('should return 404 if ticket type not found', async () => {
      mockRequest.params = { id: 'event-1', typeId: 'pricing-999' };
      mockRequest.body = { base_price: 60 };
      (mockRequest as any).tenantId = 'tenant-1';
      mockValidate.mockReturnValue({ error: null, value: { base_price: 60 } });
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockPricingModel.findById.mockResolvedValue(null);

      await ticketsController.updateTicketType(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Ticket type not found',
        code: 'NOT_FOUND',
      });
    });

    it('should return 404 if pricing belongs to different event', async () => {
      const mockPricing = {
        id: 'pricing-1',
        event_id: 'event-2', // Different event
        tenant_id: 'tenant-1',
      };

      mockRequest.params = { id: 'event-1', typeId: 'pricing-1' };
      mockRequest.body = { base_price: 60 };
      (mockRequest as any).tenantId = 'tenant-1';
      mockValidate.mockReturnValue({ error: null, value: { base_price: 60 } });
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockPricingModel.findById.mockResolvedValue(mockPricing);

      await ticketsController.updateTicketType(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getTicketType', () => {
    it('should return ticket type by id', async () => {
      const mockPricing = {
        id: 'pricing-1',
        event_id: 'event-1',
        tenant_id: 'tenant-1',
        name: 'General',
        base_price: 50,
      };

      mockRequest.params = { id: 'event-1', typeId: 'pricing-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockPricingModel.findById.mockResolvedValue(mockPricing);

      await ticketsController.getTicketType(
        mockRequest as any,
        mockReply as any
      );

      expect(mockPricingModel.findById).toHaveBeenCalledWith('pricing-1');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockPricing,
      });
    });

    it('should return 404 if ticket type not found', async () => {
      mockRequest.params = { id: 'event-1', typeId: 'pricing-999' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockPricingModel.findById.mockResolvedValue(null);

      await ticketsController.getTicketType(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Ticket type not found',
        code: 'NOT_FOUND',
      });
    });

    it('should return 404 if event not found', async () => {
      mockRequest.params = { id: 'event-999', typeId: 'pricing-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockRejectedValue(new Error('Event not found'));

      await ticketsController.getTicketType(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });
});
