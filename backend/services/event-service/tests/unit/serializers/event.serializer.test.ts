import {
  SAFE_EVENT_FIELDS,
  FORBIDDEN_EVENT_FIELDS,
  SAFE_EVENT_SELECT,
  serializeEvent,
  serializeEvents,
  serializeEventSummary,
  findForbiddenEventFields,
  findMissingSafeEventFields,
  SafeEvent,
} from '../../../src/serializers/event.serializer';

describe('Event Serializer', () => {
  // Mock raw event from database with ALL fields including sensitive ones
  const mockRawEvent = {
    // Safe fields
    id: '123e4567-e89b-12d3-a456-426614174000',
    tenant_id: 'tenant-123',
    venue_id: 'venue-456',
    venue_layout_id: 'layout-789',
    name: 'Test Concert',
    slug: 'test-concert',
    description: 'A test concert description',
    short_description: 'A test concert',
    event_type: 'single',
    primary_category_id: 'cat-123',
    secondary_category_ids: ['cat-456', 'cat-789'],
    tags: ['music', 'live'],
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    is_featured: true,
    priority_score: 10,
    banner_image_url: 'https://example.com/banner.jpg',
    thumbnail_image_url: 'https://example.com/thumb.jpg',
    image_gallery: [{ url: 'https://example.com/1.jpg' }],
    video_url: 'https://youtube.com/watch?v=123',
    virtual_event_url: null,
    age_restriction: 18,
    dress_code: 'casual',
    special_requirements: ['ID required'],
    accessibility_info: { wheelchair: true },
    is_virtual: false,
    is_hybrid: false,
    streaming_platform: null,
    cancellation_policy: 'Full refund within 7 days',
    refund_policy: 'Full refund',
    cancellation_deadline_hours: 48,
    start_date: '2026-06-15T19:00:00Z',
    allow_transfers: true,
    max_transfers_per_ticket: 3,
    transfer_blackout_start: null,
    transfer_blackout_end: null,
    require_identity_verification: false,
    meta_title: 'Test Concert - SEO Title',
    meta_description: 'SEO description',
    meta_keywords: ['concert', 'test'],
    view_count: 1000,
    interest_count: 500,
    share_count: 100,
    external_id: 'ext-123',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',

    // FORBIDDEN fields that should be stripped
    mint_authority: 'MINT_AUTH_SECRET_KEY_12345',
    artist_wallet: 'ArtistWallet123ABC',
    event_pda: 'EventPDA456DEF',
    collection_address: 'CollectionAddr789',
    artist_percentage: 15.5,
    venue_percentage: 10.0,
    royalty_percentage: 5.0,
    blockchain_status: 'synced',
    streaming_config: { api_key: 'secret-streaming-key' },
    created_by: 'user-123',
    updated_by: 'user-456',
    version: 5,
    deleted_at: null,
    status_reason: 'Internal reason',
    status_changed_by: 'admin-user',
    status_changed_at: '2026-01-14T00:00:00Z',
    metadata: { internal_note: 'secret info' },
  };

  describe('SAFE_EVENT_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(SAFE_EVENT_FIELDS).toBeDefined();
      expect(SAFE_EVENT_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include essential public fields', () => {
      expect(SAFE_EVENT_FIELDS).toContain('id');
      expect(SAFE_EVENT_FIELDS).toContain('tenant_id');
      expect(SAFE_EVENT_FIELDS).toContain('venue_id');
      expect(SAFE_EVENT_FIELDS).toContain('name');
      expect(SAFE_EVENT_FIELDS).toContain('status');
      expect(SAFE_EVENT_FIELDS).toContain('created_at');
      expect(SAFE_EVENT_FIELDS).toContain('updated_at');
    });

    it('should NOT include forbidden fields', () => {
      for (const forbidden of FORBIDDEN_EVENT_FIELDS) {
        expect(SAFE_EVENT_FIELDS).not.toContain(forbidden);
      }
    });
  });

  describe('FORBIDDEN_EVENT_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(FORBIDDEN_EVENT_FIELDS).toBeDefined();
      expect(FORBIDDEN_EVENT_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include critical blockchain fields', () => {
      expect(FORBIDDEN_EVENT_FIELDS).toContain('mint_authority');
      expect(FORBIDDEN_EVENT_FIELDS).toContain('artist_wallet');
      expect(FORBIDDEN_EVENT_FIELDS).toContain('event_pda');
    });

    it('should include business-confidential fields', () => {
      expect(FORBIDDEN_EVENT_FIELDS).toContain('artist_percentage');
      expect(FORBIDDEN_EVENT_FIELDS).toContain('venue_percentage');
    });

    it('should include internal tracking fields', () => {
      expect(FORBIDDEN_EVENT_FIELDS).toContain('created_by');
      expect(FORBIDDEN_EVENT_FIELDS).toContain('updated_by');
      expect(FORBIDDEN_EVENT_FIELDS).toContain('version');
      expect(FORBIDDEN_EVENT_FIELDS).toContain('deleted_at');
    });
  });

  describe('SAFE_EVENT_SELECT', () => {
    it('should be a comma-separated string of safe fields', () => {
      expect(typeof SAFE_EVENT_SELECT).toBe('string');
      expect(SAFE_EVENT_SELECT).toContain('id');
      expect(SAFE_EVENT_SELECT).toContain('name');
      expect(SAFE_EVENT_SELECT).toContain(',');
    });

    it('should NOT contain forbidden fields', () => {
      expect(SAFE_EVENT_SELECT).not.toContain('mint_authority');
      expect(SAFE_EVENT_SELECT).not.toContain('artist_wallet');
      expect(SAFE_EVENT_SELECT).not.toContain('artist_percentage');
    });
  });

  describe('serializeEvent', () => {
    it('should return only safe fields', () => {
      const result = serializeEvent(mockRawEvent);

      // Check safe fields are present
      expect(result.id).toBe(mockRawEvent.id);
      expect(result.tenantId).toBe(mockRawEvent.tenant_id);
      expect(result.venueId).toBe(mockRawEvent.venue_id);
      expect(result.name).toBe(mockRawEvent.name);
      expect(result.status).toBe(mockRawEvent.status);
    });

    it('should strip forbidden fields', () => {
      const result = serializeEvent(mockRawEvent);

      // Check forbidden fields are NOT present
      expect((result as any).mintAuthority).toBeUndefined();
      expect((result as any).mint_authority).toBeUndefined();
      expect((result as any).artistWallet).toBeUndefined();
      expect((result as any).artist_wallet).toBeUndefined();
      expect((result as any).eventPda).toBeUndefined();
      expect((result as any).event_pda).toBeUndefined();
      expect((result as any).artistPercentage).toBeUndefined();
      expect((result as any).artist_percentage).toBeUndefined();
      expect((result as any).venuePercentage).toBeUndefined();
      expect((result as any).venue_percentage).toBeUndefined();
      expect((result as any).streamingConfig).toBeUndefined();
      expect((result as any).streaming_config).toBeUndefined();
      expect((result as any).createdBy).toBeUndefined();
      expect((result as any).created_by).toBeUndefined();
      expect((result as any).version).toBeUndefined();
      expect((result as any).metadata).toBeUndefined();
    });

    it('should convert snake_case to camelCase', () => {
      const result = serializeEvent(mockRawEvent);

      expect(result.tenantId).toBeDefined();
      expect(result.venueId).toBeDefined();
      expect(result.eventType).toBeDefined();
      expect(result.isFeatured).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeEvent(null as any)).toThrow('Cannot serialize null or undefined event');
    });

    it('should throw error for undefined input', () => {
      expect(() => serializeEvent(undefined as any)).toThrow('Cannot serialize null or undefined event');
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalEvent = {
        id: '123',
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'Test',
        status: 'DRAFT',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = serializeEvent(minimalEvent);
      expect(result.id).toBe('123');
      expect(result.description).toBeNull();
      expect(result.shortDescription).toBeNull();
    });
  });

  describe('serializeEvents', () => {
    it('should serialize array of events', () => {
      const events = [mockRawEvent, { ...mockRawEvent, id: 'event-2', name: 'Second Event' }];
      const result = serializeEvents(events);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(mockRawEvent.id);
      expect(result[1].id).toBe('event-2');
    });

    it('should return empty array for null input', () => {
      const result = serializeEvents(null as any);
      expect(result).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      const result = serializeEvents(undefined as any);
      expect(result).toEqual([]);
    });

    it('should strip forbidden fields from all events', () => {
      const events = [mockRawEvent, { ...mockRawEvent, id: 'event-2' }];
      const result = serializeEvents(events);

      for (const event of result) {
        expect((event as any).artist_wallet).toBeUndefined();
        expect((event as any).artistWallet).toBeUndefined();
        expect((event as any).artist_percentage).toBeUndefined();
      }
    });
  });

  describe('serializeEventSummary', () => {
    it('should return minimal fields for list views', () => {
      const result = serializeEventSummary(mockRawEvent);

      expect(result.id).toBeDefined();
      expect(result.name).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.isFeatured).toBeDefined();

      // Should NOT include detailed fields
      expect((result as any).description).toBeUndefined();
      expect((result as any).accessibilityInfo).toBeUndefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeEventSummary(null as any)).toThrow('Cannot serialize null or undefined event');
    });
  });

  describe('findForbiddenEventFields', () => {
    it('should find forbidden snake_case fields', () => {
      const found = findForbiddenEventFields(mockRawEvent);

      expect(found).toContain('mint_authority');
      expect(found).toContain('artist_wallet');
      expect(found).toContain('artist_percentage');
      expect(found).toContain('created_by');
      expect(found).toContain('version');
    });

    it('should find forbidden camelCase fields', () => {
      const objWithCamelCase = {
        id: '123',
        mintAuthority: 'secret',
        artistWallet: 'wallet',
        artistPercentage: 10,
      };

      const found = findForbiddenEventFields(objWithCamelCase);
      expect(found).toContain('mintAuthority');
      expect(found).toContain('artistWallet');
      expect(found).toContain('artistPercentage');
    });

    it('should return empty array for safe object', () => {
      const safeEvent = serializeEvent(mockRawEvent);
      const found = findForbiddenEventFields(safeEvent);
      expect(found).toHaveLength(0);
    });
  });

  describe('findMissingSafeEventFields', () => {
    it('should return empty for complete serialized event', () => {
      const safeEvent = serializeEvent(mockRawEvent);
      const missing = findMissingSafeEventFields(safeEvent);
      expect(missing).toHaveLength(0);
    });

    it('should identify missing required fields', () => {
      const incomplete = { id: '123' };
      const missing = findMissingSafeEventFields(incomplete);

      expect(missing).toContain('tenantId');
      expect(missing).toContain('venueId');
      expect(missing).toContain('name');
      expect(missing).toContain('status');
    });
  });

  describe('Security validation', () => {
    it('should ensure serialized output passes security check', () => {
      const result = serializeEvent(mockRawEvent);
      const forbidden = findForbiddenEventFields(result);
      const missing = findMissingSafeEventFields(result);

      expect(forbidden).toHaveLength(0);
      expect(missing).toHaveLength(0);
    });

    it('should never leak blockchain wallet addresses', () => {
      const result = serializeEvent(mockRawEvent);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('ArtistWallet123ABC');
      expect(jsonString).not.toContain('MINT_AUTH_SECRET_KEY');
      expect(jsonString).not.toContain('EventPDA456DEF');
    });

    it('should never leak royalty percentages', () => {
      const result = serializeEvent(mockRawEvent);
      const jsonString = JSON.stringify(result);

      // The specific percentage values should not appear
      expect(jsonString).not.toContain('15.5');
      expect(jsonString).not.toContain('"artistPercentage"');
      expect(jsonString).not.toContain('"venuePercentage"');
    });
  });
});
