// @ts-nocheck
/**
 * Unit Tests for sync.service.ts
 */

describe('SyncService - Unit Tests', () => {
  let SyncService: any;
  let mockElasticsearch: any;
  let mockLogger: any;
  let mockConsistencyService: any;
  let mockEventEnrichmentService: any;
  let mockVenueEnrichmentService: any;
  let mockTicketEnrichmentService: any;
  let mockMarketplaceEnrichmentService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Elasticsearch
    mockElasticsearch = {
      index: jest.fn().mockResolvedValue({ result: 'created' })
    };

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Mock ConsistencyService
    mockConsistencyService = {
      indexWithConsistency: jest.fn().mockResolvedValue({
        token: 'token-123',
        versions: new Map(),
        expiresAt: new Date()
      })
    };

    // Mock EventEnrichmentService
    mockEventEnrichmentService = {
      enrich: jest.fn().mockResolvedValue({
        eventId: 'event-1',
        title: 'Enriched Concert',
        description: 'Amazing show',
        category: 'music'
      })
    };

    // Mock VenueEnrichmentService
    mockVenueEnrichmentService = {
      enrich: jest.fn().mockResolvedValue({
        venueId: 'venue-1',
        name: 'Enriched Stadium',
        capacity: 50000,
        address: { city: 'NYC' }
      })
    };

    // Mock TicketEnrichmentService
    mockTicketEnrichmentService = {
      enrich: jest.fn().mockResolvedValue({
        ticketId: 'ticket-1',
        eventId: 'event-1',
        section: 'A',
        row: '10',
        seat: '5'
      })
    };

    // Mock MarketplaceEnrichmentService
    mockMarketplaceEnrichmentService = {
      enrich: jest.fn().mockResolvedValue({})
    };

    SyncService = require('../../../src/services/sync.service').SyncService;
  });

  describe('Constructor', () => {
    it('should initialize with all dependencies', () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      expect(service['elasticsearch']).toBe(mockElasticsearch);
      expect(service['logger']).toBe(mockLogger);
      expect(service['consistencyService']).toBe(mockConsistencyService);
      expect(service['eventEnrichmentService']).toBe(mockEventEnrichmentService);
      expect(service['venueEnrichmentService']).toBe(mockVenueEnrichmentService);
      expect(service['ticketEnrichmentService']).toBe(mockTicketEnrichmentService);
      expect(service['marketplaceEnrichmentService']).toBe(mockMarketplaceEnrichmentService);
    });
  });

  describe('processMessage()', () => {
    it('should route venue messages to syncVenue', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('venue.created', { id: 'venue-1', name: 'Stadium' });

      expect(mockVenueEnrichmentService.enrich).toHaveBeenCalledWith('venue-1');
    });

    it('should route event messages to syncEvent', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('event.created', { id: 'event-1', name: 'Concert' });

      expect(mockEventEnrichmentService.enrich).toHaveBeenCalledWith('event-1');
    });

    it('should route ticket messages to syncTicket', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('ticket.created', { id: 'ticket-1', event_id: 'event-1' });

      expect(mockTicketEnrichmentService.enrich).toHaveBeenCalledWith('ticket-1');
    });

    it('should return consistency token', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      const result = await service.processMessage('venue.created', { id: 'venue-1' });

      expect(result.token).toBe('token-123');
    });

    it('should pass clientId through', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('venue.created', { id: 'venue-1' }, 'client-123');

      expect(mockConsistencyService.indexWithConsistency).toHaveBeenCalledWith(
        expect.any(Object),
        'client-123'
      );
    });

    it('should log error and throw on failure', async () => {
      mockVenueEnrichmentService.enrich.mockRejectedValue(new Error('Enrich failed'));
      mockConsistencyService.indexWithConsistency.mockRejectedValue(new Error('Index failed'));

      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await expect(
        service.processMessage('venue.created', { id: 'venue-1' })
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('syncVenue()', () => {
    it('should enrich venue for create action', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('venue.created', { id: 'venue-1', name: 'Stadium' });

      expect(mockVenueEnrichmentService.enrich).toHaveBeenCalledWith('venue-1');
      expect(mockConsistencyService.indexWithConsistency).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'venue',
          entityId: 'venue-1',
          operation: 'UPDATE',
          payload: expect.objectContaining({
            venueId: 'venue-1',
            name: 'Enriched Stadium'
          })
        }),
        undefined
      );
    });

    it('should enrich venue for update action', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('venue.updated', { id: 'venue-1', name: 'Stadium' });

      expect(mockVenueEnrichmentService.enrich).toHaveBeenCalledWith('venue-1');
    });

    it('should not enrich venue for delete action', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('venue.deleted', { id: 'venue-1' });

      expect(mockVenueEnrichmentService.enrich).not.toHaveBeenCalled();
      expect(mockConsistencyService.indexWithConsistency).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'DELETE',
          payload: {}
        }),
        undefined
      );
    });

    it('should fallback to basic data on enrichment failure', async () => {
      mockVenueEnrichmentService.enrich.mockRejectedValue(new Error('Enrich failed'));

      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('venue.created', {
        id: 'venue-1',
        name: 'Stadium',
        type: 'outdoor',
        capacity: 50000,
        is_active: true
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: 'venue-1' }),
        'Failed to enrich venue, using basic data'
      );

      expect(mockConsistencyService.indexWithConsistency).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            venueId: 'venue-1',
            name: 'Stadium',
            type: 'outdoor',
            capacity: 50000,
            status: 'active'
          })
        }),
        undefined
      );
    });

    it('should set high priority for venue sync', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('venue.created', { id: 'venue-1' });

      expect(mockConsistencyService.indexWithConsistency).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 9
        }),
        undefined
      );
    });
  });

  describe('syncEvent()', () => {
    it('should enrich event for create action', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('event.created', { id: 'event-1', name: 'Concert' });

      expect(mockEventEnrichmentService.enrich).toHaveBeenCalledWith('event-1');
      expect(mockConsistencyService.indexWithConsistency).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'event',
          entityId: 'event-1',
          operation: 'UPDATE',
          payload: expect.objectContaining({
            eventId: 'event-1',
            title: 'Enriched Concert'
          })
        }),
        undefined
      );
    });

    it('should not enrich event for delete action', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('event.deleted', { id: 'event-1' });

      expect(mockEventEnrichmentService.enrich).not.toHaveBeenCalled();
      expect(mockConsistencyService.indexWithConsistency).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'DELETE',
          payload: {}
        }),
        undefined
      );
    });

    it('should fallback to basic data on enrichment failure', async () => {
      mockEventEnrichmentService.enrich.mockRejectedValue(new Error('Enrich failed'));

      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('event.created', {
        id: 'event-1',
        name: 'Concert',
        description: 'Amazing show',
        category: 'music',
        date: '2025-12-31',
        venue_id: 'venue-1',
        status: 'active'
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'event-1' }),
        'Failed to enrich event, using basic data'
      );

      expect(mockConsistencyService.indexWithConsistency).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            eventId: 'event-1',
            title: 'Concert',
            category: 'music',
            status: 'active'
          })
        }),
        undefined
      );
    });
  });

  describe('syncTicket()', () => {
    it('should enrich ticket for create action', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('ticket.created', {
        id: 'ticket-1',
        event_id: 'event-1'
      });

      expect(mockTicketEnrichmentService.enrich).toHaveBeenCalledWith('ticket-1');
    });

    it('should not enrich ticket for delete action', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('ticket.deleted', { id: 'ticket-1' });

      expect(mockTicketEnrichmentService.enrich).not.toHaveBeenCalled();
      expect(mockConsistencyService.indexWithConsistency).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'DELETE',
          payload: {}
        }),
        undefined
      );
    });

    it('should trigger event refresh after ticket update', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('ticket.created', {
        id: 'ticket-1',
        event_id: 'event-1'
      });

      // Should be called twice: once for ticket, once for event
      expect(mockConsistencyService.indexWithConsistency).toHaveBeenCalledTimes(2);
      
      // Second call should be for event refresh
      expect(mockConsistencyService.indexWithConsistency).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          entityType: 'event',
          entityId: 'event-1',
          operation: 'UPDATE',
          priority: 8
        }),
        undefined
      );

      expect(mockEventEnrichmentService.enrich).toHaveBeenCalledWith('event-1');
    });

    it('should not trigger event refresh for ticket delete', async () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('ticket.deleted', {
        id: 'ticket-1',
        event_id: 'event-1'
      });

      // Should only be called once for ticket delete
      expect(mockConsistencyService.indexWithConsistency).toHaveBeenCalledTimes(1);
    });

    it('should handle event refresh failure gracefully', async () => {
      // First enrichment (ticket) succeeds, second (event) fails
      mockTicketEnrichmentService.enrich.mockResolvedValueOnce({
        ticketId: 'ticket-1',
        eventId: 'event-1'
      });
      mockEventEnrichmentService.enrich.mockRejectedValueOnce(new Error('Event refresh failed'));

      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      const result = await service.processMessage('ticket.created', {
        id: 'ticket-1',
        event_id: 'event-1'
      });

      // Should still return token from ticket sync
      expect(result.token).toBe('token-123');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'event-1', error: expect.any(Error) }),
        'Failed to refresh event after ticket update'
      );
    });

    it('should fallback to basic data on ticket enrichment failure', async () => {
      mockTicketEnrichmentService.enrich.mockRejectedValue(new Error('Enrich failed'));

      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      await service.processMessage('ticket.created', {
        id: 'ticket-1',
        event_id: 'event-1',
        venue_id: 'venue-1',
        user_id: 'user-1',
        section: 'A',
        row: '10',
        seat: '5',
        price: 100,
        status: 'active'
      });

      expect(mockConsistencyService.indexWithConsistency).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            ticketId: 'ticket-1',
            eventId: 'event-1',
            section: 'A',
            row: '10',
            seat: '5',
            status: 'active'
          })
        }),
        undefined
      );
    });
  });

  describe('Class Structure', () => {
    it('should be instantiable', () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      expect(service).toBeInstanceOf(SyncService);
    });

    it('should have processMessage method', () => {
      const service = new SyncService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService,
        eventEnrichmentService: mockEventEnrichmentService,
        venueEnrichmentService: mockVenueEnrichmentService,
        ticketEnrichmentService: mockTicketEnrichmentService,
        marketplaceEnrichmentService: mockMarketplaceEnrichmentService
      });

      expect(typeof service.processMessage).toBe('function');
    });
  });
});
