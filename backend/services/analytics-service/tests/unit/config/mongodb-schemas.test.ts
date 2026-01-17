/**
 * MongoDB Schemas Configuration Tests
 */

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('MongoDB Schemas', () => {
  let mockDb: any;
  let mockCollection: any;

  beforeEach(() => {
    mockCollection = {
      createIndex: jest.fn().mockResolvedValue('index_name'),
    };

    mockDb = {
      listCollections: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      }),
      createCollection: jest.fn().mockResolvedValue(mockCollection),
      command: jest.fn().mockResolvedValue({}),
      collection: jest.fn().mockReturnValue(mockCollection),
    };

    jest.clearAllMocks();
  });

  describe('applyMongoSchemas', () => {
    it('should create collections with validation when they do not exist', async () => {
      const { applyMongoSchemas } = require('../../../src/config/mongodb-schemas');
      
      await applyMongoSchemas(mockDb);

      expect(mockDb.createCollection).toHaveBeenCalledWith(
        'raw_analytics',
        expect.objectContaining({
          validator: expect.any(Object),
          validationLevel: 'moderate',
          validationAction: 'warn',
        })
      );
    });

    it('should update existing collections with validation', async () => {
      mockDb.listCollections = jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([{ name: 'raw_analytics' }]),
      });

      const { applyMongoSchemas } = require('../../../src/config/mongodb-schemas');
      
      await applyMongoSchemas(mockDb);

      expect(mockDb.command).toHaveBeenCalledWith(
        expect.objectContaining({
          collMod: 'raw_analytics',
          validationLevel: 'moderate',
          validationAction: 'warn',
        })
      );
    });

    it('should create indexes for raw_analytics collection', async () => {
      const { applyMongoSchemas } = require('../../../src/config/mongodb-schemas');
      
      await applyMongoSchemas(mockDb);

      expect(mockCollection.createIndex).toHaveBeenCalledWith(
        { venue_id: 1, timestamp: -1 }
      );
      expect(mockCollection.createIndex).toHaveBeenCalledWith(
        { event_type: 1, timestamp: -1 }
      );
    });

    it('should handle errors gracefully', async () => {
      mockDb.createCollection = jest.fn().mockRejectedValue(new Error('Create error'));

      const { applyMongoSchemas } = require('../../../src/config/mongodb-schemas');
      
      await expect(applyMongoSchemas(mockDb)).resolves.toBeUndefined();
    });
  });

  describe('schemas export', () => {
    it('should export default schemas object', () => {
      const schemas = require('../../../src/config/mongodb-schemas').default;

      expect(schemas).toHaveProperty('raw_analytics');
      expect(schemas).toHaveProperty('user_behavior');
      expect(schemas).toHaveProperty('campaign_performance');
    });

    it('should have valid JSON Schema for raw_analytics', () => {
      const schemas = require('../../../src/config/mongodb-schemas').default;

      expect(schemas.raw_analytics.$jsonSchema).toBeDefined();
      expect(schemas.raw_analytics.$jsonSchema.bsonType).toBe('object');
      expect(schemas.raw_analytics.$jsonSchema.required).toContain('venue_id');
      expect(schemas.raw_analytics.$jsonSchema.required).toContain('event_type');
      expect(schemas.raw_analytics.$jsonSchema.required).toContain('timestamp');
    });

    it('should have valid event_type enum', () => {
      const schemas = require('../../../src/config/mongodb-schemas').default;
      const eventTypes = schemas.raw_analytics.$jsonSchema.properties.event_type.enum;

      expect(eventTypes).toContain('ticket_purchase');
      expect(eventTypes).toContain('ticket_scan');
      expect(eventTypes).toContain('page_view');
      expect(eventTypes).toContain('cart_abandonment');
      expect(eventTypes).toContain('search_query');
      expect(eventTypes).toContain('user_action');
    });
  });
});
