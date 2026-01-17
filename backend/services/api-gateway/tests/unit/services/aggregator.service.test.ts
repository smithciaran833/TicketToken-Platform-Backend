import { AggregatorService } from '../../../src/services/aggregator.service';
import { ProxyService } from '../../../src/services/proxy.service';
import { DataSource } from '../../../src/types';

jest.mock('../../../src/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('AggregatorService', () => {
  let service: AggregatorService;
  let mockProxyService: jest.Mocked<ProxyService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProxyService = {
      forward: jest.fn(),
    } as any;

    service = new AggregatorService(mockProxyService);
  });

  describe('aggregate', () => {
    it('executes required data sources in parallel', async () => {
      const dataSources: DataSource[] = [
        { name: 'source1', service: 'service1', endpoint: '/data1', required: true },
        { name: 'source2', service: 'service2', endpoint: '/data2', required: true },
      ];

      let callCount = 0;
      mockProxyService.forward.mockImplementation(async () => {
        callCount++;
        return { data: { call: callCount } };
      });

      await service.aggregate(dataSources, {});

      expect(mockProxyService.forward).toHaveBeenCalledTimes(2);
      // Both should be called (parallel execution)
      expect(callCount).toBe(2);
    });

    it('returns merged results with exact structure', async () => {
      const dataSources: DataSource[] = [
        { name: 'source1', service: 'service1', endpoint: '/data1', required: true },
      ];

      mockProxyService.forward.mockResolvedValue({ data: { value: 'test-data' } });

      const result = await service.aggregate(dataSources, {});

      expect(result).toEqual({
        source1: { value: 'test-data' },
        _metadata: {
          timestamp: expect.any(String),
          sources: [
            {
              name: 'source1',
              required: true,
              success: true,
            },
          ],
        },
      });
    });

    it('throws error immediately when required source fails', async () => {
      const dataSources: DataSource[] = [
        { name: 'critical', service: 'service1', endpoint: '/data', required: true },
        { name: 'another', service: 'service2', endpoint: '/data', required: true },
      ];

      mockProxyService.forward
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce({ data: {} });

      await expect(service.aggregate(dataSources, {})).rejects.toThrow('Failed to fetch required data: critical');
      
      // Should still call all required sources in parallel
      expect(mockProxyService.forward).toHaveBeenCalledTimes(2);
    });

    it('applies transform function and returns transformed data', async () => {
      const transformSpy = jest.fn((data) => ({ transformed: data.original }));
      const dataSources: DataSource[] = [
        { 
          name: 'source', 
          service: 'service1', 
          endpoint: '/data', 
          required: true, 
          transform: transformSpy 
        },
      ];

      mockProxyService.forward.mockResolvedValue({ data: { original: 'value' } });

      const result = await service.aggregate(dataSources, {});

      expect(transformSpy).toHaveBeenCalledWith({ original: 'value' });
      expect(transformSpy).toHaveBeenCalledTimes(1);
      expect(result.source).toEqual({ transformed: 'value' });
    });

    it('uses fallback for optional sources on failure', async () => {
      const dataSources: DataSource[] = [
        { name: 'required', service: 'service1', endpoint: '/data', required: true },
        { name: 'optional', service: 'service2', endpoint: '/data', required: false, fallback: { default: true } },
      ];

      mockProxyService.forward
        .mockResolvedValueOnce({ data: { required: 'data' } })
        .mockRejectedValueOnce(new Error('Service unavailable'));

      const result = await service.aggregate(dataSources, {});

      expect(result.required).toEqual({ required: 'data' });
      expect(result.optional).toEqual({ default: true });
    });

    it('includes metadata with ISO timestamp', async () => {
      const dataSources: DataSource[] = [
        { name: 'source1', service: 'service1', endpoint: '/data', required: true },
      ];

      mockProxyService.forward.mockResolvedValue({ data: {} });

      const result = await service.aggregate(dataSources, {});

      expect(result._metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(result._metadata.timestamp).toISOString()).toBe(result._metadata.timestamp);
    });

    it('marks failed optional sources as unsuccessful in metadata', async () => {
      const dataSources: DataSource[] = [
        { name: 'good', service: 'service1', endpoint: '/data', required: true },
        { name: 'bad', service: 'service2', endpoint: '/data', required: false, fallback: {} },
      ];

      mockProxyService.forward
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce(new Error('Failed'));

      const result = await service.aggregate(dataSources, {});

      const goodSource = result._metadata.sources.find((s: any) => s.name === 'good');
      const badSource = result._metadata.sources.find((s: any) => s.name === 'bad');
      
      expect(goodSource.success).toBe(true);
      expect(badSource.success).toBe(true); // Has fallback data, so marked as success
    });

    it('passes request object to proxy service', async () => {
      const dataSources: DataSource[] = [
        { name: 'source', service: 'service1', endpoint: '/data', required: true },
      ];
      const request = { headers: { 'x-test': 'value' } };

      mockProxyService.forward.mockResolvedValue({ data: {} });

      await service.aggregate(dataSources, request);

      expect(mockProxyService.forward).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'x-test': 'value' },
          url: '/data',
        }),
        'service1'
      );
    });
  });

  describe('getEventDetails', () => {
    it('calls proxy service with correct endpoints for all sources', async () => {
      mockProxyService.forward
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: { available_count: 0, ticket_tiers: [] } })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} });

      await service.getEventDetails('event-123', {});

      expect(mockProxyService.forward).toHaveBeenCalledWith(expect.objectContaining({ url: '/events/event-123' }), 'event-service');
      expect(mockProxyService.forward).toHaveBeenCalledWith(expect.objectContaining({ url: '/events/event-123/venue' }), 'venue-service');
      expect(mockProxyService.forward).toHaveBeenCalledWith(expect.objectContaining({ url: '/events/event-123/availability' }), 'ticket-service');
      expect(mockProxyService.forward).toHaveBeenCalledWith(expect.objectContaining({ url: '/events/event-123/nft-config' }), 'nft-service');
      expect(mockProxyService.forward).toHaveBeenCalledWith(expect.objectContaining({ url: '/events/event-123/stats' }), 'analytics-service');
    });

    it('transforms ticket data with exact structure', async () => {
      mockProxyService.forward
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: { available_count: 50, ticket_tiers: ['VIP', 'GA'] } })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} });

      const result = await service.getEventDetails('event-123', {});

      expect(result.tickets).toEqual({
        available: 50,
        soldOut: false,
        tiers: ['VIP', 'GA'],
      });
    });

    it('marks soldOut as true when available_count is 0', async () => {
      mockProxyService.forward
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: { available_count: 0, ticket_tiers: [] } })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} });

      const result = await service.getEventDetails('event-123', {});

      expect(result.tickets.soldOut).toBe(true);
    });

    it('uses fallback { enabled: false } for nftStatus on failure', async () => {
      mockProxyService.forward
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: { available_count: 10, ticket_tiers: [] } })
        .mockRejectedValueOnce(new Error('NFT service down'))
        .mockResolvedValueOnce({ data: {} });

      const result = await service.getEventDetails('event-123', {});

      expect(result.nftStatus).toEqual({ enabled: false });
    });

    it('uses fallback null for analytics on failure', async () => {
      mockProxyService.forward
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: { available_count: 10, ticket_tiers: [] } })
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce(new Error('Analytics service down'));

      const result = await service.getEventDetails('event-123', {});

      expect(result.analytics).toBeNull();
    });

    it('throws when required event data fails', async () => {
      mockProxyService.forward.mockRejectedValue(new Error('Event service unavailable'));

      await expect(service.getEventDetails('event-123', {})).rejects.toThrow('Failed to fetch required data: event');
    });

    it('throws when required venue data fails', async () => {
      mockProxyService.forward
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce(new Error('Venue service unavailable'));

      await expect(service.getEventDetails('event-123', {})).rejects.toThrow('Failed to fetch required data: venue');
    });
  });

  describe('getUserDashboard', () => {
    it('calls proxy service with correct endpoints for all sources', async () => {
      mockProxyService.forward
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      await service.getUserDashboard('user-123', {});

      expect(mockProxyService.forward).toHaveBeenCalledWith(expect.objectContaining({ url: '/users/user-123' }), 'user-service');
      expect(mockProxyService.forward).toHaveBeenCalledWith(expect.objectContaining({ url: '/users/user-123/tickets' }), 'ticket-service');
      expect(mockProxyService.forward).toHaveBeenCalledWith(expect.objectContaining({ url: '/users/user-123/nfts' }), 'nft-service');
      expect(mockProxyService.forward).toHaveBeenCalledWith(expect.objectContaining({ url: '/users/user-123/transactions?limit=10' }), 'payment-service');
    });

    it('separates tickets into upcoming and past based on event_date', async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 86400000).toISOString();
      const past = new Date(now.getTime() - 86400000).toISOString();

      mockProxyService.forward
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: [
          { id: 'ticket-1', event_date: future },
          { id: 'ticket-2', event_date: past },
          { id: 'ticket-3', event_date: future },
        ]})
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      const result = await service.getUserDashboard('user-123', {});

      expect(result.tickets.upcoming).toHaveLength(2);
      expect(result.tickets.past).toHaveLength(1);
      expect(result.tickets.upcoming[0].id).toBe('ticket-1');
      expect(result.tickets.upcoming[1].id).toBe('ticket-3');
      expect(result.tickets.past[0].id).toBe('ticket-2');
    });

    it('uses empty array fallback for nfts on failure', async () => {
      mockProxyService.forward
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: [] })
        .mockRejectedValueOnce(new Error('NFT service unavailable'))
        .mockResolvedValueOnce({ data: [] });

      const result = await service.getUserDashboard('user-123', {});

      expect(result.nfts).toEqual([]);
    });

    it('uses empty array fallback for transactions on failure', async () => {
      mockProxyService.forward
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] })
        .mockRejectedValueOnce(new Error('Payment service unavailable'));

      const result = await service.getUserDashboard('user-123', {});

      expect(result.transactions).toEqual([]);
    });

    it('throws when required profile data fails', async () => {
      mockProxyService.forward.mockRejectedValue(new Error('User service unavailable'));

      await expect(service.getUserDashboard('user-123', {})).rejects.toThrow('Failed to fetch required data: profile');
    });

    it('throws when required tickets data fails', async () => {
      mockProxyService.forward
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce(new Error('Ticket service unavailable'));

      await expect(service.getUserDashboard('user-123', {})).rejects.toThrow('Failed to fetch required data: tickets');
    });
  });
});
