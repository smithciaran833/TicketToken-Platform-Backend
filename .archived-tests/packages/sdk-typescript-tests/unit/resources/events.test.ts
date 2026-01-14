import { Events } from '../../../src/resources/events';
import { HTTPClient } from '../../../src/client/http-client';
import { mockEvent, mockPaginatedResponse } from '../../setup';

describe('Events Resource', () => {
  let events: Events;
  let mockHttpClient: jest.Mocked<HTTPClient>;

  beforeEach(() => {
    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    } as any;

    events = new Events(mockHttpClient);
  });

  describe('list', () => {
    it('should fetch all events', async () => {
      const response = { ...mockPaginatedResponse, data: [mockEvent] };
      mockHttpClient.get.mockResolvedValue(response);

      const result = await events.list();

      expect(mockHttpClient.get).toHaveBeenCalledWith('/events', { params: {} });
      expect(result).toEqual(response);
    });

    it('should pass pagination params', async () => {
      const response = mockPaginatedResponse;
      mockHttpClient.get.mockResolvedValue(response);

      await events.list({ page: 2, limit: 20 });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/events', {
        params: { page: 2, limit: 20 },
      });
    });

    it('should pass sort params', async () => {
      const response = mockPaginatedResponse;
      mockHttpClient.get.mockResolvedValue(response);

      await events.list({ sort: 'startDate', order: 'desc' });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/events', {
        params: { sort: 'startDate', order: 'desc' },
      });
    });
  });

  describe('get', () => {
    it('should fetch single event by id', async () => {
      mockHttpClient.get.mockResolvedValue(mockEvent);

      const result = await events.get('evt_123');

      expect(mockHttpClient.get).toHaveBeenCalledWith('/events/evt_123');
      expect(result).toEqual(mockEvent);
    });
  });

  describe('create', () => {
    it('should create new event', async () => {
      const createParams = {
        name: 'New Event',
        venue: 'Test Venue',
        location: 'Test City',
        startDate: '2024-12-31T20:00:00Z',
        endDate: '2024-12-31T23:00:00Z',
        capacity: 1000,
        ticketTypes: [],
      };
      mockHttpClient.post.mockResolvedValue(mockEvent);

      const result = await events.create(createParams);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/events', createParams);
      expect(result).toEqual(mockEvent);
    });
  });

  describe('update', () => {
    it('should update event', async () => {
      const updateParams = { name: 'Updated Event' };
      const updatedEvent = { ...mockEvent, name: 'Updated Event' };
      mockHttpClient.put.mockResolvedValue(updatedEvent);

      const result = await events.update('evt_123', updateParams);

      expect(mockHttpClient.put).toHaveBeenCalledWith('/events/evt_123', updateParams);
      expect(result).toEqual(updatedEvent);
    });
  });

  describe('delete', () => {
    it('should delete event', async () => {
      mockHttpClient.delete.mockResolvedValue({ success: true });

      await events.delete('evt_123');

      expect(mockHttpClient.delete).toHaveBeenCalledWith('/events/evt_123');
    });
  });

  describe('publish', () => {
    it('should publish event', async () => {
      const publishedEvent = { ...mockEvent, status: 'published' };
      mockHttpClient.post.mockResolvedValue(publishedEvent);

      const result = await events.publish('evt_123');

      expect(mockHttpClient.post).toHaveBeenCalledWith('/events/evt_123/publish');
      expect(result).toEqual(publishedEvent);
    });
  });

  describe('cancel', () => {
    it('should cancel event with reason', async () => {
      const cancelledEvent = { ...mockEvent, status: 'cancelled' };
      mockHttpClient.post.mockResolvedValue(cancelledEvent);

      const result = await events.cancel('evt_123', 'Weather conditions');

      expect(mockHttpClient.post).toHaveBeenCalledWith('/events/evt_123/cancel', {
        reason: 'Weather conditions',
      });
      expect(result).toEqual(cancelledEvent);
    });
  });

  describe('search', () => {
    it('should search events with query', async () => {
      const response = { ...mockPaginatedResponse, data: [mockEvent] };
      mockHttpClient.get.mockResolvedValue(response);

      const result = await events.search({ query: 'concert' });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/events/search', {
        params: { query: 'concert' },
      });
      expect(result).toEqual(response);
    });

    it('should search events with multiple params', async () => {
      const response = mockPaginatedResponse;
      mockHttpClient.get.mockResolvedValue(response);

      await events.search({
        query: 'festival',
        location: 'New York',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/events/search', {
        params: {
          query: 'festival',
          location: 'New York',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
        },
      });
    });
  });
});
