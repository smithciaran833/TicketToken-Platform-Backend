// Mock dependencies BEFORE imports
const mockDbWhere = jest.fn();
const mockDbFirst = jest.fn();
const mockDbUpdate = jest.fn();
const mockDbInsert = jest.fn();
const mockDbIncrement = jest.fn();
const mockDbOrderBy = jest.fn();

const mockQueryBuilder: any = {
  where: mockDbWhere,
  first: mockDbFirst,
  update: mockDbUpdate,
  insert: mockDbInsert,
  increment: mockDbIncrement,
  orderBy: mockDbOrderBy,
};

mockDbWhere.mockReturnValue(mockQueryBuilder);
mockDbOrderBy.mockReturnValue(mockQueryBuilder);
mockDbIncrement.mockReturnValue(mockQueryBuilder);

const mockDb = jest.fn(() => mockQueryBuilder);

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-12345'),
}));

const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { MappingService, mappingService } from '../../../src/services/mapping.service';

describe('MappingService', () => {
  let service: MappingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbWhere.mockReturnValue(mockQueryBuilder);
    mockDbOrderBy.mockReturnValue(mockQueryBuilder);
    mockDbIncrement.mockReturnValue(mockQueryBuilder);
    service = new MappingService();
  });

  describe('applyTemplate', () => {
    const venueId = 'venue-123';
    const integration = 'stripe';

    it('should apply specified template', async () => {
      const template = {
        id: 'template-1',
        mappings: JSON.stringify({ 'event.name': 'product.name' }),
      };

      mockDbFirst.mockResolvedValueOnce(template);
      mockDbUpdate.mockResolvedValueOnce(1);
      mockDbUpdate.mockResolvedValueOnce(1);

      await service.applyTemplate(venueId, integration, 'template-1');

      expect(mockDb).toHaveBeenCalledWith('field_mapping_templates');
      expect(mockDb).toHaveBeenCalledWith('integration_configs');
      expect(mockDbUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          field_mappings: { 'event.name': 'product.name' },
          template_id: template.id,
          template_applied_at: expect.any(Date),
        })
      );
    });

    it('should auto-detect best template when templateId not provided', async () => {
      const venue = { id: venueId, name: 'Comedy Club Downtown' };
      const template = {
        id: 'comedy-template',
        mappings: JSON.stringify({ 'event.name': 'item.name' }),
      };

      mockDbFirst
        .mockResolvedValueOnce(venue)
        .mockResolvedValueOnce(template);

      mockDbUpdate.mockResolvedValue(1);

      await service.applyTemplate(venueId, integration);

      expect(mockDbWhere).toHaveBeenCalledWith('id', venueId);
    });

    it('should throw error when no template found', async () => {
      mockDbFirst.mockResolvedValue(null);

      await expect(
        service.applyTemplate(venueId, integration, 'nonexistent')
      ).rejects.toThrow('No suitable template found');
    });

    it('should increment template usage', async () => {
      const template = { id: 'template-1', mappings: JSON.stringify({}) };
      mockDbFirst.mockResolvedValueOnce(template);
      mockDbUpdate.mockResolvedValue(1);

      await service.applyTemplate(venueId, integration, 'template-1');

      expect(mockDb).toHaveBeenCalledWith('field_mapping_templates');
      expect(mockDbIncrement).toHaveBeenCalledWith('usage_count', 1);
    });

    it('should log success', async () => {
      const template = { id: 'template-1', mappings: JSON.stringify({}) };
      mockDbFirst.mockResolvedValueOnce(template);
      mockDbUpdate.mockResolvedValue(1);

      await service.applyTemplate(venueId, integration, 'template-1');

      expect(mockLoggerInfo).toHaveBeenCalledWith('Template applied', {
        venueId,
        integration,
        templateId: 'template-1',
      });
    });

    it('should log and rethrow error on failure', async () => {
      const error = new Error('Database error');
      mockDbFirst.mockRejectedValue(error);

      await expect(
        service.applyTemplate(venueId, integration, 'template-1')
      ).rejects.toThrow('Database error');

      expect(mockLoggerError).toHaveBeenCalledWith('Failed to apply template', {
        venueId,
        integration,
        templateId: 'template-1',
        error,
      });
    });
  });

  describe('createCustomMapping', () => {
    const venueId = 'venue-123';
    const integration = 'stripe';

    it('should save valid mappings', async () => {
      const mappings = {
        'event.name': 'product.name',
        'event.price': 'price.unit_amount',
      };

      mockDbUpdate.mockResolvedValue(1);

      await service.createCustomMapping(venueId, integration, mappings);

      expect(mockDbUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          field_mappings: mappings,
          template_id: null,
        })
      );
    });

    it('should throw error for invalid target field', async () => {
      const mappings = {
        'event.name': 'invalid.field.name',
      };

      await expect(
        service.createCustomMapping(venueId, integration, mappings)
      ).rejects.toThrow('Invalid mappings: Invalid target field: invalid.field.name');
    });

    it('should throw error when required field not mapped', async () => {
      const mappings = {
        'event.name': 'product.name',
      };

      await expect(
        service.createCustomMapping(venueId, integration, mappings)
      ).rejects.toThrow('Required field not mapped: price.unit_amount');
    });

    it('should log success', async () => {
      const mappings = {
        'event.name': 'product.name',
        'event.price': 'price.unit_amount',
      };

      mockDbUpdate.mockResolvedValue(1);

      await service.createCustomMapping(venueId, integration, mappings);

      expect(mockLoggerInfo).toHaveBeenCalledWith('Custom mappings saved', {
        venueId,
        integration,
      });
    });
  });

  describe('getAvailableFields', () => {
    it('should return fields for square', async () => {
      const fields = await service.getAvailableFields('square');

      expect(fields.source).toContain('event.name');
      expect(fields.target).toContain('item.name');
    });

    it('should return fields for stripe', async () => {
      const fields = await service.getAvailableFields('stripe');

      expect(fields.source).toContain('event.price');
      expect(fields.target).toContain('price.unit_amount');
    });

    it('should return fields for mailchimp', async () => {
      const fields = await service.getAvailableFields('mailchimp');

      expect(fields.source).toContain('customer.email');
      expect(fields.target).toContain('email_address');
    });

    it('should return fields for quickbooks', async () => {
      const fields = await service.getAvailableFields('quickbooks');

      expect(fields.source).toContain('transaction.amount');
      expect(fields.target).toContain('Invoice.Line.Amount');
    });

    it('should return empty arrays for unknown integration', async () => {
      const fields = await service.getAvailableFields('unknown');

      expect(fields).toEqual({ source: [], target: [] });
    });
  });

  describe('createTemplate', () => {
    it('should create template with all fields', async () => {
      mockDbInsert.mockResolvedValue([1]);

      const templateData = {
        name: 'Comedy Club Template',
        description: 'For comedy venues',
        venueType: 'comedy_club',
        integrationType: 'stripe',
        mappings: { 'event.name': 'product.name' },
        validationRules: { required: ['event.name'] },
      };

      const id = await service.createTemplate(templateData);

      expect(id).toBe('mock-uuid-12345');
      expect(mockDb).toHaveBeenCalledWith('field_mapping_templates');
      expect(mockDbInsert).toHaveBeenCalledWith({
        id: 'mock-uuid-12345',
        name: 'Comedy Club Template',
        description: 'For comedy venues',
        venue_type: 'comedy_club',
        integration_type: 'stripe',
        mappings: JSON.stringify({ 'event.name': 'product.name' }),
        validation_rules: JSON.stringify({ required: ['event.name'] }),
        is_active: true,
      });
    });

    it('should create template without optional fields', async () => {
      mockDbInsert.mockResolvedValue([1]);

      const templateData = {
        name: 'Basic Template',
        integrationType: 'square',
        mappings: {},
      };

      await service.createTemplate(templateData);

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          description: undefined,
          venue_type: undefined,
          validation_rules: null,
        })
      );
    });

    it('should log template creation', async () => {
      mockDbInsert.mockResolvedValue([1]);

      await service.createTemplate({
        name: 'Test Template',
        integrationType: 'stripe',
        mappings: {},
      });

      expect(mockLoggerInfo).toHaveBeenCalledWith('Template created', {
        templateId: 'mock-uuid-12345',
        name: 'Test Template',
      });
    });
  });

  describe('detectVenueType (via detectBestTemplate)', () => {
    it('should detect comedy_club venue type', async () => {
      const venue = { id: 'v1', name: 'Laugh Factory Comedy Club' };
      const template = { id: 't1', mappings: JSON.stringify({}) };

      mockDbFirst
        .mockResolvedValueOnce(venue)
        .mockResolvedValueOnce(template);
      mockDbUpdate.mockResolvedValue(1);

      await service.applyTemplate('v1', 'stripe');

      expect(mockDbWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_type: 'comedy_club',
        })
      );
    });

    it('should detect music_venue type', async () => {
      const venue = { id: 'v1', name: 'Downtown Concert Hall' };
      const template = { id: 't1', mappings: JSON.stringify({}) };

      mockDbFirst
        .mockResolvedValueOnce(venue)
        .mockResolvedValueOnce(template);
      mockDbUpdate.mockResolvedValue(1);

      await service.applyTemplate('v1', 'stripe');

      expect(mockDbWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_type: 'music_venue',
        })
      );
    });

    it('should detect theater type', async () => {
      const venue = { id: 'v1', name: 'Broadway Theatre' };
      const template = { id: 't1', mappings: JSON.stringify({}) };

      mockDbFirst
        .mockResolvedValueOnce(venue)
        .mockResolvedValueOnce(template);
      mockDbUpdate.mockResolvedValue(1);

      await service.applyTemplate('v1', 'stripe');

      expect(mockDbWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_type: 'theater',
        })
      );
    });

    it('should detect festival type', async () => {
      // Use a name without "music" or "concert" to avoid matching music_venue first
      const venue = { id: 'v1', name: 'Summer Arts Festival' };
      const template = { id: 't1', mappings: JSON.stringify({}) };

      mockDbFirst
        .mockResolvedValueOnce(venue)
        .mockResolvedValueOnce(template);
      mockDbUpdate.mockResolvedValue(1);

      await service.applyTemplate('v1', 'stripe');

      expect(mockDbWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_type: 'festival',
        })
      );
    });

    it('should default to standard type', async () => {
      const venue = { id: 'v1', name: 'Generic Event Space' };
      const template = { id: 't1', mappings: JSON.stringify({}) };

      mockDbFirst
        .mockResolvedValueOnce(venue)
        .mockResolvedValueOnce(template);
      mockDbUpdate.mockResolvedValue(1);

      await service.applyTemplate('v1', 'stripe');

      expect(mockDbWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_type: 'standard',
        })
      );
    });

    it('should fallback to default template when no venue-type match', async () => {
      const venue = { id: 'v1', name: 'Some Venue' };
      const defaultTemplate = { id: 'default-t', mappings: JSON.stringify({}), is_default: true };

      mockDbFirst
        .mockResolvedValueOnce(venue)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(defaultTemplate);
      mockDbUpdate.mockResolvedValue(1);

      await service.applyTemplate('v1', 'stripe');

      expect(mockDbWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          is_default: true,
        })
      );
    });
  });

  describe('healMapping', () => {
    const venueId = 'venue-123';
    const integration = 'stripe';

    it('should keep valid mappings unchanged', async () => {
      const config = {
        field_mappings: {
          'event.name': 'product.name',
          'event.price': 'price.unit_amount',
        },
      };

      mockDbFirst.mockResolvedValue(config);
      mockDbUpdate.mockResolvedValue(1);

      await service.healMapping(venueId, integration);
    });

    it('should remove invalid mappings', async () => {
      const config = {
        field_mappings: {
          'event.name': 'product.name',
          'event.invalid': 'nonexistent.field',
        },
      };

      mockDbFirst.mockResolvedValue(config);
      mockDbUpdate.mockResolvedValue(1);

      await service.healMapping(venueId, integration);

      expect(mockDbUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          field_mappings: expect.not.objectContaining({
            'event.invalid': expect.anything(),
          }),
        })
      );
    });

    it('should find alternative field when possible', async () => {
      const config = {
        field_mappings: {
          'event.name': 'PRODUCT.NAME',
        },
      };

      mockDbFirst.mockResolvedValue(config);
      mockDbUpdate.mockResolvedValue(1);

      await service.healMapping(venueId, integration);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Mappings healed',
        expect.objectContaining({
          venueId,
          integration,
          changes: expect.any(Array),
        })
      );
    });

    it('should do nothing when no config found', async () => {
      mockDbFirst.mockResolvedValue(null);

      await service.healMapping(venueId, integration);

      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it('should do nothing when no field_mappings', async () => {
      mockDbFirst.mockResolvedValue({ field_mappings: null });

      await service.healMapping(venueId, integration);

      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it('should log error on failure', async () => {
      const error = new Error('DB error');
      mockDbFirst.mockRejectedValue(error);

      await service.healMapping(venueId, integration);

      expect(mockLoggerError).toHaveBeenCalledWith('Failed to heal mappings', {
        venueId,
        integration,
        error,
      });
    });
  });

  describe('singleton export', () => {
    it('should export a singleton instance', () => {
      expect(mappingService).toBeInstanceOf(MappingService);
    });
  });
});
