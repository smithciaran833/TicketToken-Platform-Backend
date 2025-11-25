import { EventMetadataModel } from '../../../src/models/event-metadata.model';
import { Knex } from 'knex';

describe('Event Metadata Model', () => {
  let mockDb: any;
  let metadataModel: EventMetadataModel;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
    };

    mockDb = jest.fn(() => mockQueryBuilder);
    metadataModel = new EventMetadataModel(mockDb as any);
  });

  describe('findByEventId', () => {
    it('should find metadata by event id', async () => {
      const mockMetadata = { id: '1', event_id: 'event-123', headliner: 'Artist' };
      mockQueryBuilder.first.mockResolvedValue(mockMetadata);

      const result = await metadataModel.findByEventId('event-123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ event_id: 'event-123' });
      expect(result).toEqual(mockMetadata);
    });
  });

  describe('upsert', () => {
    it('should update existing metadata', async () => {
      const existing = { id: '1', event_id: 'event-123' };
      const updated = { id: '1', event_id: 'event-123', headliner: 'New Artist' };
      
      mockQueryBuilder.first.mockResolvedValue(existing);
      mockQueryBuilder.returning.mockResolvedValue([updated]);

      const result = await metadataModel.upsert('event-123', { headliner: 'New Artist' });

      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it('should create new metadata if not exists', async () => {
      const created = { id: '1', event_id: 'event-123', headliner: 'Artist' };
      
      mockQueryBuilder.first.mockResolvedValue(null);
      mockQueryBuilder.returning.mockResolvedValue([created]);

      const result = await metadataModel.upsert('event-123', { headliner: 'Artist' });

      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(result).toEqual(created);
    });
  });
});
