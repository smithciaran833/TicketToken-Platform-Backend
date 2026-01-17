// @ts-nocheck
/**
 * Unit Tests for ticket-enrichment.service.ts
 */

describe('TicketEnrichmentService - Unit Tests', () => {
  let TicketEnrichmentService: any;
  let mockDb: any;
  let mockLogger: any;

  // Helper function accessible to all tests
  const createQueryChain = (table: string) => {
    const chain: any = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      orderBy: jest.fn().mockResolvedValue([])
    };

    // Table-specific mocks
    if (table === 'tickets') {
      chain.first.mockResolvedValue({
        id: 'ticket-1',
        event_id: 'event-1',
        venue_id: 'venue-1',
        user_id: 'user-1',
        ticket_number: 'TKT-001',
        ticket_type: 'standard',
        section: 'A',
        row: '10',
        seat: '5',
        price: 100,
        currency: 'USD',
        status: 'active',
        is_transferable: true,
        is_resellable: true,
        is_refundable: false,
        verified: true,
        created_at: new Date(),
        updated_at: new Date()
      });
    } else if (table === 'ticket_transfers') {
      chain.orderBy.mockResolvedValue([
        {
          from_user_id: 'user-0',
          to_user_id: 'user-1',
          transfer_date: new Date(),
          transfer_type: 'gift',
          status: 'completed'
        }
      ]);
    } else if (table === 'ticket_validations') {
      chain.orderBy.mockResolvedValue([
        {
          timestamp: new Date(),
          gate: 'A1',
          staff_id: 'staff-1',
          result: 'valid'
        }
      ]);
    } else if (table === 'ticket_price_history') {
      chain.orderBy.mockResolvedValue([
        {
          price: 100,
          date: new Date(),
          reason: 'initial'
        }
      ]);
    } else if (table === 'nfts') {
      chain.first.mockResolvedValue(null);
    } else if (table === 'marketplace_listings') {
      chain.first.mockResolvedValue(null);
    }

    return chain;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockDb = jest.fn((table) => createQueryChain(table));

    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    TicketEnrichmentService = require('../../../src/services/ticket-enrichment.service').TicketEnrichmentService;
  });

  describe('Constructor', () => {
    it('should initialize with database', () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      expect(service['db']).toBe(mockDb);
    });

    it('should initialize with logger', () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      expect(service['logger']).toBe(mockLogger);
    });
  });

  describe('enrich()', () => {
    it('should fetch ticket from database', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      await service.enrich('ticket-1');

      expect(mockDb).toHaveBeenCalledWith('tickets');
    });

    it('should throw error if ticket not found', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'tickets') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(null)
          };
        }
        return { where: jest.fn().mockReturnThis(), first: jest.fn().mockResolvedValue(null), orderBy: jest.fn().mockResolvedValue([]) };
      });

      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      await expect(service.enrich('ticket-1')).rejects.toThrow('Ticket not found: ticket-1');
    });

    it('should return enriched ticket', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.ticketId).toBe('ticket-1');
      expect(result.eventId).toBe('event-1');
      expect(result.venueId).toBe('venue-1');
      expect(result.status).toBe('active');
    });

    it('should include ticket details', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.section).toBe('A');
      expect(result.row).toBe('10');
      expect(result.seat).toBe('5');
      expect(result.ticketNumber).toBe('TKT-001');
      expect(result.ticketType).toBe('standard');
    });

    it('should include pricing information', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.pricing.originalPrice).toBe(100);
      expect(result.pricing.currency).toBe('USD');
      expect(Array.isArray(result.pricing.priceHistory)).toBe(true);
    });

    it('should fetch transfer history', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      await service.enrich('ticket-1');

      expect(mockDb).toHaveBeenCalledWith('ticket_transfers');
    });

    it('should include transfer history', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(Array.isArray(result.transferHistory)).toBe(true);
      expect(result.transferHistory[0].fromUserId).toBe('user-0');
      expect(result.transferHistory[0].toUserId).toBe('user-1');
    });

    it('should handle validations table not existing', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'ticket_validations') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockRejectedValue(new Error('Table does not exist'))
          };
        }
        return createQueryChain(table);
      });

      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.validation.validationHistory).toEqual([]);
    });

    it('should include validation history when available', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(Array.isArray(result.validation.validationHistory)).toBe(true);
      expect(result.validation.validationCount).toBe(1);
    });

    it('should handle price history table not existing', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'ticket_price_history') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockRejectedValue(new Error('Table does not exist'))
          };
        }
        return createQueryChain(table);
      });

      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.pricing.priceHistory).toEqual([]);
    });

    it('should fetch NFT data when nft_id exists', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'tickets') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'ticket-1',
              event_id: 'event-1',
              venue_id: 'venue-1',
              user_id: 'user-1',
              nft_id: 'nft-1',
              price: 100,
              status: 'active',
              created_at: new Date()
            })
          };
        } else if (table === 'nfts') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'nft-1',
              contract_address: '0x123',
              token_id: '456',
              chain_id: 1
            })
          };
        }
        return createQueryChain(table);
      });

      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.blockchain).toBeDefined();
      expect(result.blockchain.nftId).toBe('nft-1');
      expect(result.blockchain.contractAddress).toBe('0x123');
    });

    it('should not include blockchain data when no nft_id', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.blockchain).toBeUndefined();
    });

    it('should fetch marketplace listing when active', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'marketplace_listings') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'listing-1',
              price: 150,
              created_at: new Date(),
              view_count: 10
            })
          };
        }
        return createQueryChain(table);
      });

      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.marketplace.isListed).toBe(true);
      expect(result.marketplace.listingId).toBe('listing-1');
      expect(result.marketplace.listingPrice).toBe(150);
    });

    it('should handle no marketplace listing', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.marketplace.isListed).toBe(false);
    });

    it('should handle marketplace_listings table not existing', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'marketplace_listings') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockRejectedValue(new Error('Table does not exist'))
          };
        }
        return createQueryChain(table);
      });

      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.marketplace.isListed).toBe(false);
    });

    it('should include delivery information', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.delivery).toBeDefined();
      expect(result.delivery.method).toBeDefined();
      expect(result.delivery.status).toBeDefined();
    });

    it('should include transferability flags', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.isTransferable).toBe(true);
      expect(result.isResellable).toBe(true);
      expect(result.isRefundable).toBe(false);
    });

    it('should calculate search score', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.searchScore).toBeDefined();
      expect(typeof result.searchScore).toBe('number');
      expect(result.searchScore).toBeGreaterThan(0);
    });

    it('should log error on failure', async () => {
      mockDb.mockImplementation(() => {
        throw new Error('DB error');
      });

      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      await expect(service.enrich('ticket-1')).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('bulkEnrich()', () => {
    it('should enrich multiple tickets', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const results = await service.bulkEnrich(['ticket-1', 'ticket-2']);

      expect(results).toHaveLength(2);
    });

    it('should continue on individual failures', async () => {
      let callCount = 0;
      mockDb.mockImplementation((table) => {
        if (table === 'tickets') {
          callCount++;
          return {
            where: jest.fn().mockReturnThis(),
            first: callCount === 1
              ? jest.fn().mockResolvedValue({ id: 'ticket-1', event_id: 'e1', venue_id: 'v1', user_id: 'u1', price: 100, status: 'active', created_at: new Date() })
              : jest.fn().mockRejectedValue(new Error('Ticket 2 error'))
          };
        }
        return { where: jest.fn().mockReturnThis(), first: jest.fn().mockResolvedValue(null), orderBy: jest.fn().mockResolvedValue([]) };
      });

      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const results = await service.bulkEnrich(['ticket-1', 'ticket-2']);

      expect(results).toHaveLength(1);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return empty array for empty input', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const results = await service.bulkEnrich([]);

      expect(results).toEqual([]);
    });
  });

  describe('calculateSearchScore()', () => {
    it('should boost verified tickets', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'tickets') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'ticket-1',
              event_id: 'event-1',
              venue_id: 'venue-1',
              user_id: 'user-1',
              price: 100,
              verified: true,
              status: 'active',
              created_at: new Date()
            })
          };
        }
        return createQueryChain(table);
      });

      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.searchScore).toBeGreaterThan(1.0);
    });

    it('should boost tickets with NFT', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'tickets') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'ticket-1',
              event_id: 'event-1',
              venue_id: 'venue-1',
              user_id: 'user-1',
              price: 100,
              nft_id: 'nft-1',
              status: 'active',
              created_at: new Date()
            })
          };
        } else if (table === 'nfts') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ id: 'nft-1' })
          };
        }
        return createQueryChain(table);
      });

      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.searchScore).toBeGreaterThan(1.0);
    });

    it('should penalize many transfers', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'ticket_transfers') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue(
              Array(10).fill({ from_user_id: 'u1', to_user_id: 'u2', transfer_date: new Date() })
            )
          };
        }
        return createQueryChain(table);
      });

      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.searchScore).toBeLessThan(1.5);
    });

    it('should boost tickets with validation history', async () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      // Default mock has 1 validation
      expect(result.searchScore).toBeGreaterThan(1.0);
    });

    it('should never return score below 0.1', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'tickets') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'ticket-1',
              event_id: 'event-1',
              venue_id: 'venue-1',
              user_id: 'user-1',
              price: 100,
              verified: false,
              is_transferable: false,
              is_resellable: false,
              status: 'active',
              created_at: new Date()
            })
          };
        } else if (table === 'ticket_transfers') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue(
              Array(20).fill({ from_user_id: 'u1', to_user_id: 'u2' })
            )
          };
        }
        return createQueryChain(table);
      });

      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      const result = await service.enrich('ticket-1');

      expect(result.searchScore).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('Class Structure', () => {
    it('should be instantiable', () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      expect(service).toBeInstanceOf(TicketEnrichmentService);
    });

    it('should have enrich method', () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      expect(typeof service.enrich).toBe('function');
    });

    it('should have bulkEnrich method', () => {
      const service = new TicketEnrichmentService({ db: mockDb, logger: mockLogger });
      expect(typeof service.bulkEnrich).toBe('function');
    });
  });
});
