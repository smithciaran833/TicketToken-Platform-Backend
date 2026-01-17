// Mock services and database BEFORE imports
const mockGetAvailableFields = jest.fn();
const mockCreateCustomMapping = jest.fn();
const mockApplyTemplate = jest.fn();
const mockHealMapping = jest.fn();

jest.mock('../../../src/services/mapping.service', () => ({
  mappingService: {
    getAvailableFields: mockGetAvailableFields,
    createCustomMapping: mockCreateCustomMapping,
    applyTemplate: mockApplyTemplate,
    healMapping: mockHealMapping,
  },
}));

// Mock database
const mockFirst = jest.fn();
const mockWhere = jest.fn().mockReturnValue({ first: mockFirst });

const mockDb = jest.fn(() => ({
  where: mockWhere,
  first: mockFirst,
}));

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

import { MappingController } from '../../../src/controllers/mapping.controller';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('MappingController', () => {
  let controller: MappingController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockCode: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new MappingController();

    mockSend = jest.fn().mockReturnThis();
    mockCode = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      code: mockCode,
    };

    mockRequest = {
      params: {},
      query: {},
      body: {},
    };
  });

  describe('getAvailableFields', () => {
    it('should return available fields for provider', async () => {
      const fields = {
        customer: ['email', 'name', 'phone'],
        transaction: ['amount', 'date', 'status'],
      };

      mockRequest.params = { provider: 'stripe' };
      mockGetAvailableFields.mockResolvedValue(fields);

      await controller.getAvailableFields(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetAvailableFields).toHaveBeenCalledWith('stripe');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: fields,
      });
    });

    it('should get fields for different providers', async () => {
      const providers = ['stripe', 'square', 'mailchimp', 'quickbooks'];

      for (const provider of providers) {
        jest.clearAllMocks();
        mockRequest.params = { provider };
        mockGetAvailableFields.mockResolvedValue({});

        await controller.getAvailableFields(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockGetAvailableFields).toHaveBeenCalledWith(provider);
      }
    });

    it('should handle empty fields', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockGetAvailableFields.mockResolvedValue({});

      await controller.getAvailableFields(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {},
      });
    });

    it('should propagate service errors', async () => {
      mockRequest.params = { provider: 'invalid' };
      const error = new Error('Provider not found');
      mockGetAvailableFields.mockRejectedValue(error);

      await expect(
        controller.getAvailableFields(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Provider not found');
    });
  });

  describe('getCurrentMappings', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = {};

      await controller.getCurrentMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should return current mappings for venue and provider', async () => {
      const config = {
        venue_id: 'venue-123',
        integration_type: 'stripe',
        field_mappings: {
          'customer.email': 'email',
          'customer.name': 'full_name',
        },
        template_id: 'default',
        template_applied_at: new Date('2025-01-01'),
      };

      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123' };
      mockFirst.mockResolvedValue(config);

      await controller.getCurrentMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDb).toHaveBeenCalledWith('integration_configs');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: 'venue-123',
        integration_type: 'stripe',
      });
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          mappings: config.field_mappings,
          templateId: 'default',
          templateAppliedAt: config.template_applied_at,
        },
      });
    });

    it('should return empty mappings when config not found', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.query = { venueId: 'venue-456' };
      mockFirst.mockResolvedValue(null);

      await controller.getCurrentMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          mappings: {},
          templateId: undefined,
          templateAppliedAt: undefined,
        },
      });
    });

    it('should handle config with no field_mappings', async () => {
      const config = {
        venue_id: 'venue-123',
        integration_type: 'mailchimp',
      };

      mockRequest.params = { provider: 'mailchimp' };
      mockRequest.query = { venueId: 'venue-123' };
      mockFirst.mockResolvedValue(config);

      await controller.getCurrentMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          mappings: {},
          templateId: undefined,
          templateAppliedAt: undefined,
        },
      });
    });

    it('should propagate database errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123' };
      const error = new Error('Database query failed');
      mockFirst.mockRejectedValue(error);

      await expect(
        controller.getCurrentMappings(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Database query failed');
    });
  });

  describe('updateMappings', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { mappings: {} };

      await controller.updateMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID and mappings are required',
      });
    });

    it('should return 400 when mappings are missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };

      await controller.updateMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID and mappings are required',
      });
    });

    it('should return 400 when both are missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = {};

      await controller.updateMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
    });

    it('should update mappings successfully', async () => {
      const mappings = {
        'source.email': 'target.email',
        'source.name': 'target.full_name',
      };

      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123', mappings };
      mockCreateCustomMapping.mockResolvedValue(undefined);

      await controller.updateMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCreateCustomMapping).toHaveBeenCalledWith(
        'venue-123',
        'stripe',
        mappings
      );
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Mappings updated successfully',
      });
    });

    it('should update mappings for different providers', async () => {
      const providers = ['stripe', 'square', 'mailchimp', 'quickbooks'];

      for (const provider of providers) {
        jest.clearAllMocks();
        mockRequest.params = { provider };
        mockRequest.body = { venueId: 'venue-123', mappings: {} };
        mockCreateCustomMapping.mockResolvedValue(undefined);

        await controller.updateMappings(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockCreateCustomMapping).toHaveBeenCalledWith(
          'venue-123',
          provider,
          {}
        );
      }
    });

    it('should propagate service errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123', mappings: {} };
      const error = new Error('Invalid mapping format');
      mockCreateCustomMapping.mockRejectedValue(error);

      await expect(
        controller.updateMappings(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Invalid mapping format');
    });
  });

  describe('testMappings', () => {
    it('should return 400 when mappings are missing', async () => {
      mockRequest.body = { sampleData: {} };

      await controller.testMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Mappings and sample data are required',
      });
    });

    it('should return 400 when sampleData is missing', async () => {
      mockRequest.body = { mappings: {} };

      await controller.testMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Mappings and sample data are required',
      });
    });

    it('should return 400 when both are missing', async () => {
      mockRequest.body = {};

      await controller.testMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
    });

    it('should test mappings with simple fields', async () => {
      const mappings = {
        email: 'customer_email',
        name: 'customer_name',
      };
      const sampleData = {
        email: 'test@example.com',
        name: 'John Doe',
      };

      mockRequest.body = { mappings, sampleData };

      await controller.testMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          original: sampleData,
          mapped: {
            customer_email: 'test@example.com',
            customer_name: 'John Doe',
          },
        },
      });
    });

    it('should test mappings with nested fields', async () => {
      const mappings = {
        'customer.email': 'email',
        'customer.profile.name': 'name',
      };
      const sampleData = {
        customer: {
          email: 'nested@example.com',
          profile: {
            name: 'Jane Smith',
          },
        },
      };

      mockRequest.body = { mappings, sampleData };

      await controller.testMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          original: sampleData,
          mapped: {
            email: 'nested@example.com',
            name: 'Jane Smith',
          },
        },
      });
    });

    it('should handle missing fields in sample data', async () => {
      const mappings = {
        email: 'customer_email',
        missing: 'customer_missing',
      };
      const sampleData = {
        email: 'test@example.com',
      };

      mockRequest.body = { mappings, sampleData };

      await controller.testMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          original: sampleData,
          mapped: {
            customer_email: 'test@example.com',
            customer_missing: undefined,
          },
        },
      });
    });

    it('should handle empty mappings', async () => {
      mockRequest.body = { mappings: {}, sampleData: { test: 'data' } };

      await controller.testMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          original: { test: 'data' },
          mapped: {},
        },
      });
    });

    it('should propagate mapping errors', async () => {
      mockRequest.body = { mappings: { test: 'value' }, sampleData: {} };
      
      // Force an error by making entries throw
      jest.spyOn(Object, 'entries').mockImplementationOnce(() => {
        throw new Error('Mapping transformation failed');
      });

      await expect(
        controller.testMappings(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Mapping transformation failed');

      jest.restoreAllMocks();
    });
  });

  describe('applyTemplate', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { templateId: 'default' };

      await controller.applyTemplate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should apply template with templateId', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123', templateId: 'advanced' };
      mockApplyTemplate.mockResolvedValue(undefined);

      await controller.applyTemplate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockApplyTemplate).toHaveBeenCalledWith(
        'venue-123',
        'stripe',
        'advanced'
      );
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Template applied successfully',
      });
    });

    it('should apply template without templateId', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.body = { venueId: 'venue-456' };
      mockApplyTemplate.mockResolvedValue(undefined);

      await controller.applyTemplate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockApplyTemplate).toHaveBeenCalledWith(
        'venue-456',
        'square',
        undefined
      );
    });

    it('should apply templates for different providers', async () => {
      const providers = ['stripe', 'square', 'mailchimp', 'quickbooks'];

      for (const provider of providers) {
        jest.clearAllMocks();
        mockRequest.params = { provider };
        mockRequest.body = { venueId: 'venue-123' };
        mockApplyTemplate.mockResolvedValue(undefined);

        await controller.applyTemplate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockApplyTemplate).toHaveBeenCalledWith(
          'venue-123',
          provider,
          undefined
        );
      }
    });

    it('should propagate service errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123', templateId: 'invalid' };
      const error = new Error('Template not found');
      mockApplyTemplate.mockRejectedValue(error);

      await expect(
        controller.applyTemplate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Template not found');
    });
  });

  describe('resetMappings', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = {};

      await controller.resetMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should reset mappings to default template', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      mockApplyTemplate.mockResolvedValue(undefined);

      await controller.resetMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // resetMappings calls applyTemplate with only 2 args (no third arg)
      expect(mockApplyTemplate).toHaveBeenCalledWith(
        'venue-123',
        'stripe'
      );
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Mappings reset to default template',
      });
    });

    it('should reset for different providers', async () => {
      const providers = ['stripe', 'square', 'mailchimp', 'quickbooks'];

      for (const provider of providers) {
        jest.clearAllMocks();
        mockRequest.params = { provider };
        mockRequest.body = { venueId: 'venue-123' };
        mockApplyTemplate.mockResolvedValue(undefined);

        await controller.resetMappings(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockApplyTemplate).toHaveBeenCalledWith(
          'venue-123',
          provider
        );
      }
    });

    it('should propagate service errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      const error = new Error('Failed to reset mappings');
      mockApplyTemplate.mockRejectedValue(error);

      await expect(
        controller.resetMappings(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Failed to reset mappings');
    });
  });

  describe('healMappings', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = {};

      await controller.healMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should heal mappings successfully', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      mockHealMapping.mockResolvedValue(undefined);

      await controller.healMappings(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockHealMapping).toHaveBeenCalledWith('venue-123', 'stripe');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Mappings healed successfully',
      });
    });

    it('should heal for different providers', async () => {
      const providers = ['stripe', 'square', 'mailchimp', 'quickbooks'];

      for (const provider of providers) {
        jest.clearAllMocks();
        mockRequest.params = { provider };
        mockRequest.body = { venueId: 'venue-123' };
        mockHealMapping.mockResolvedValue(undefined);

        await controller.healMappings(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockHealMapping).toHaveBeenCalledWith('venue-123', provider);
      }
    });

    it('should propagate service errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      const error = new Error('Healing failed');
      mockHealMapping.mockRejectedValue(error);

      await expect(
        controller.healMappings(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Healing failed');
    });
  });
});
