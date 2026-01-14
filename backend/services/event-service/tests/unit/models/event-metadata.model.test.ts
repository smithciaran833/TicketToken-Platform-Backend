/**
 * Unit tests for EventMetadataModel
 * Tests event metadata operations including upsert functionality
 */

import { EventMetadataModel, IEventMetadata } from '../../../src/models/event-metadata.model';
import { createKnexMock, configureMockReturn } from '../../__mocks__/knex.mock';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('EventMetadataModel', () => {
  let mockDb: any;
  let model: EventMetadataModel;

  const mockMetadata: IEventMetadata = {
    id: 'meta-123',
    event_id: 'event-123',
    performers: [
      { name: 'Artist 1', role: 'headliner' },
      { name: 'Artist 2', role: 'opener' },
    ],
    headliner: 'Artist 1',
    supporting_acts: ['Artist 2', 'Artist 3'],
    production_company: 'Big Production Co.',
    technical_requirements: {
      sound_system: '10000W',
      lighting: 'Full LED',
    },
    stage_setup_time_hours: 4,
    sponsors: [
      { name: 'Sponsor A', tier: 'gold' },
    ],
    primary_sponsor: 'Sponsor A',
    performance_rights_org: 'ASCAP',
    licensing_requirements: ['Performance License', 'Music License'],
    insurance_requirements: {
      liability: 1000000,
      cancellation: true,
    },
    press_release: 'Big concert announcement...',
    marketing_copy: {
      tagline: 'The best concert of the year!',
      description: 'Join us for an amazing night...',
    },
    sound_requirements: { bass: 'heavy', volume: 'loud' },
    lighting_requirements: { type: 'moving heads', color: 'RGB' },
    catering_requirements: { vegetarian: true, vegan: true },
    rider_requirements: { items: ['Water', 'Towels'] },
    production_budget: 50000,
    marketing_budget: 10000,
    projected_revenue: 100000,
    break_even_capacity: 500,
    custom_fields: { vip_area: true },
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockDb = createKnexMock();
    model = new EventMetadataModel(mockDb);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with event_metadata table', () => {
      expect(model).toBeInstanceOf(EventMetadataModel);
      expect((model as any).tableName).toBe('event_metadata');
    });
  });

  describe('findByEventId', () => {
    it('should find metadata by event ID', async () => {
      configureMockReturn(mockDb, mockMetadata);

      const result = await model.findByEventId('event-123');

      expect(mockDb).toHaveBeenCalledWith('event_metadata');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ event_id: 'event-123' });
      expect(mockDb._mockChain.first).toHaveBeenCalled();
      expect(result?.headliner).toBe('Artist 1');
    });

    it('should return null when metadata not found', async () => {
      configureMockReturn(mockDb, null);

      const result = await model.findByEventId('non-existent');

      expect(result).toBeNull();
    });

    it('should return metadata with performers array', async () => {
      configureMockReturn(mockDb, mockMetadata);

      const result = await model.findByEventId('event-123');

      expect(result?.performers).toHaveLength(2);
      expect(result?.performers?.[0].name).toBe('Artist 1');
    });
  });

  describe('upsert', () => {
    describe('when metadata does not exist (insert)', () => {
      it('should create new metadata', async () => {
        // First call - findByEventId returns null
        mockDb._mockChain.first.mockResolvedValueOnce(null);
        // Second call - insert returns created record
        mockDb._mockChain.returning.mockResolvedValue([mockMetadata]);

        const result = await model.upsert('event-123', {
          headliner: 'New Artist',
          production_budget: 25000,
        });

        expect(mockDb._mockChain.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            event_id: 'event-123',
            headliner: 'New Artist',
            production_budget: 25000,
          })
        );
        expect(result.headliner).toBe('Artist 1');
      });

      it('should insert metadata with all fields', async () => {
        mockDb._mockChain.first.mockResolvedValueOnce(null);
        mockDb._mockChain.returning.mockResolvedValue([mockMetadata]);

        const newMetadata: Partial<IEventMetadata> = {
          headliner: 'Big Star',
          supporting_acts: ['Opener 1', 'Opener 2'],
          production_company: 'Production Inc.',
          production_budget: 100000,
          marketing_budget: 20000,
        };

        await model.upsert('event-123', newMetadata);

        expect(mockDb._mockChain.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            event_id: 'event-123',
            ...newMetadata,
          })
        );
      });
    });

    describe('when metadata exists (update)', () => {
      it('should update existing metadata', async () => {
        // First call - findByEventId returns existing
        configureMockReturn(mockDb, mockMetadata);
        // Second call - update returns updated record
        mockDb._mockChain.returning.mockResolvedValue([{ ...mockMetadata, headliner: 'Updated Artist' }]);

        const result = await model.upsert('event-123', {
          headliner: 'Updated Artist',
        });

        expect(mockDb._mockChain.where).toHaveBeenCalledWith({ event_id: 'event-123' });
        expect(mockDb._mockChain.update).toHaveBeenCalledWith(
          expect.objectContaining({
            headliner: 'Updated Artist',
            updated_at: expect.any(Date),
          })
        );
        expect(result.headliner).toBe('Updated Artist');
      });

      it('should preserve existing fields when updating partial data', async () => {
        configureMockReturn(mockDb, mockMetadata);
        mockDb._mockChain.returning.mockResolvedValue([{
          ...mockMetadata,
          production_budget: 75000,
        }]);

        await model.upsert('event-123', {
          production_budget: 75000,
        });

        expect(mockDb._mockChain.update).toHaveBeenCalledWith(
          expect.objectContaining({
            production_budget: 75000,
          })
        );
      });

      it('should set updated_at timestamp on update', async () => {
        configureMockReturn(mockDb, mockMetadata);
        mockDb._mockChain.returning.mockResolvedValue([mockMetadata]);

        await model.upsert('event-123', { headliner: 'Test' });

        const updateCall = mockDb._mockChain.update.mock.calls[0][0];
        expect(updateCall.updated_at).toBeInstanceOf(Date);
      });
    });
  });

  describe('inherited BaseModel methods', () => {
    describe('findById', () => {
      it('should find metadata by ID', async () => {
        configureMockReturn(mockDb, mockMetadata);

        const result = await model.findById('meta-123');

        expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'meta-123' });
        expect(result?.id).toBe('meta-123');
      });
    });

    describe('create', () => {
      it('should create new metadata record', async () => {
        mockDb._mockChain.returning.mockResolvedValue([mockMetadata]);

        const result = await model.create({
          event_id: 'event-123',
          headliner: 'Test Artist',
        });

        expect(mockDb._mockChain.insert).toHaveBeenCalled();
        expect(result.event_id).toBe('event-123');
      });
    });

    describe('update', () => {
      it('should update metadata record', async () => {
        const updated = { ...mockMetadata, headliner: 'Updated' };
        mockDb._mockChain.returning.mockResolvedValue([updated]);

        const result = await model.update('meta-123', { headliner: 'Updated' });

        expect(result?.headliner).toBe('Updated');
      });
    });

    describe('delete', () => {
      it('should soft delete metadata record', async () => {
        mockDb._mockChain.update.mockResolvedValue(1);

        const result = await model.delete('meta-123');

        expect(result).toBe(true);
      });
    });
  });

  describe('metadata scenarios', () => {
    it('should handle metadata with performers list', async () => {
      const metaWithPerformers: IEventMetadata = {
        ...mockMetadata,
        performers: [
          { name: 'Headliner', role: 'headliner', genre: ['rock'] },
          { name: 'Support', role: 'support', genre: ['indie'] },
        ],
      };
      configureMockReturn(mockDb, metaWithPerformers);

      const result = await model.findByEventId('event-123');

      expect(result?.performers).toHaveLength(2);
    });

    it('should handle metadata with sponsors', async () => {
      const metaWithSponsors: IEventMetadata = {
        ...mockMetadata,
        sponsors: [
          { name: 'Gold Sponsor', tier: 'gold' },
          { name: 'Silver Sponsor', tier: 'silver' },
        ],
        primary_sponsor: 'Gold Sponsor',
      };
      configureMockReturn(mockDb, metaWithSponsors);

      const result = await model.findByEventId('event-123');

      expect(result?.sponsors).toHaveLength(2);
      expect(result?.primary_sponsor).toBe('Gold Sponsor');
    });

    it('should handle technical requirements object', async () => {
      const metaWithTech: IEventMetadata = {
        ...mockMetadata,
        technical_requirements: {
          sound_system: '20000W PA System',
          lighting_rig: 'Full concert lighting',
          video_screens: '2x LED walls',
          stage_size: '40x30 ft',
        },
      };
      configureMockReturn(mockDb, metaWithTech);

      const result = await model.findByEventId('event-123');

      expect(result?.technical_requirements?.sound_system).toBe('20000W PA System');
    });

    it('should handle financial projections', async () => {
      const metaWithFinance: IEventMetadata = {
        ...mockMetadata,
        production_budget: 150000,
        marketing_budget: 25000,
        projected_revenue: 300000,
        break_even_capacity: 750,
      };
      configureMockReturn(mockDb, metaWithFinance);

      const result = await model.findByEventId('event-123');

      expect(result?.production_budget).toBe(150000);
      expect(result?.projected_revenue).toBe(300000);
      expect(result?.break_even_capacity).toBe(750);
    });

    it('should handle licensing and insurance requirements', async () => {
      const metaWithLegal: IEventMetadata = {
        ...mockMetadata,
        licensing_requirements: ['ASCAP', 'BMI', 'SESAC'],
        insurance_requirements: {
          general_liability: 2000000,
          weather_insurance: true,
          cancellation_insurance: true,
        },
      };
      configureMockReturn(mockDb, metaWithLegal);

      const result = await model.findByEventId('event-123');

      expect(result?.licensing_requirements).toHaveLength(3);
      expect(result?.insurance_requirements?.general_liability).toBe(2000000);
    });

    it('should handle custom fields', async () => {
      const metaWithCustom: IEventMetadata = {
        ...mockMetadata,
        custom_fields: {
          backstage_access: true,
          vip_meet_greet: true,
          early_entry: '2 hours',
          parking_included: false,
        },
      };
      configureMockReturn(mockDb, metaWithCustom);

      const result = await model.findByEventId('event-123');

      expect(result?.custom_fields?.backstage_access).toBe(true);
      expect(result?.custom_fields?.early_entry).toBe('2 hours');
    });
  });

  describe('edge cases', () => {
    it('should handle metadata with minimal fields', async () => {
      const minimalMeta: IEventMetadata = {
        id: 'meta-min',
        event_id: 'event-123',
      };
      configureMockReturn(mockDb, minimalMeta);

      const result = await model.findByEventId('event-123');

      expect(result?.id).toBe('meta-min');
      expect(result?.performers).toBeUndefined();
      expect(result?.sponsors).toBeUndefined();
    });

    it('should handle empty performers array', async () => {
      const metaEmptyPerformers: IEventMetadata = {
        ...mockMetadata,
        performers: [],
      };
      configureMockReturn(mockDb, metaEmptyPerformers);

      const result = await model.findByEventId('event-123');

      expect(result?.performers).toEqual([]);
    });

    it('should handle zero budget values', async () => {
      const metaZeroBudget: IEventMetadata = {
        ...mockMetadata,
        production_budget: 0,
        marketing_budget: 0,
      };
      configureMockReturn(mockDb, metaZeroBudget);

      const result = await model.findByEventId('event-123');

      expect(result?.production_budget).toBe(0);
      expect(result?.marketing_budget).toBe(0);
    });

    it('should handle null optional fields', async () => {
      const metaNulls: IEventMetadata = {
        id: 'meta-null',
        event_id: 'event-123',
        headliner: null as any,
        press_release: null as any,
      };
      configureMockReturn(mockDb, metaNulls);

      const result = await model.findByEventId('event-123');

      expect(result?.headliner).toBeNull();
      expect(result?.press_release).toBeNull();
    });

    it('should handle stage_setup_time_hours as decimal', async () => {
      const metaDecimal: IEventMetadata = {
        ...mockMetadata,
        stage_setup_time_hours: 2.5,
      };
      configureMockReturn(mockDb, metaDecimal);

      const result = await model.findByEventId('event-123');

      expect(result?.stage_setup_time_hours).toBe(2.5);
    });

    it('should handle previous_events array', async () => {
      const metaWithHistory: IEventMetadata = {
        ...mockMetadata,
        previous_events: [
          { event_id: 'prev-1', date: '2024-01-01', attendance: 1000 },
          { event_id: 'prev-2', date: '2024-06-01', attendance: 1500 },
        ],
      };
      configureMockReturn(mockDb, metaWithHistory);

      const result = await model.findByEventId('event-123');

      expect(result?.previous_events).toHaveLength(2);
    });
  });
});
