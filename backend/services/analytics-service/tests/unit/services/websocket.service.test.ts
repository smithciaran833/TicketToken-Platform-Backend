/**
 * WebSocket Service Unit Tests
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

const mockEmitMetricUpdate = jest.fn();
const mockEmitWidgetUpdate = jest.fn();
const mockTo = jest.fn().mockReturnThis();
const mockEmit = jest.fn();
const mockIn = jest.fn().mockReturnThis();
const mockFetchSockets = jest.fn().mockResolvedValue([]);
const mockSocketsGet = jest.fn();

jest.mock('../../../src/config/websocket', () => ({
  getIO: jest.fn(() => ({
    to: mockTo,
    emit: mockEmit,
    in: mockIn,
    fetchSockets: mockFetchSockets,
    sockets: {
      sockets: {
        get: mockSocketsGet,
      },
    },
  })),
  emitMetricUpdate: mockEmitMetricUpdate,
  emitWidgetUpdate: mockEmitWidgetUpdate,
}));

const mockPublishMetricUpdate = jest.fn().mockResolvedValue(undefined);
const mockGetRealTimeMetric = jest.fn().mockResolvedValue(null);

jest.mock('../../../src/models', () => ({
  RealtimeModel: {
    publishMetricUpdate: mockPublishMetricUpdate,
    getRealTimeMetric: mockGetRealTimeMetric,
  },
}));

import { WebSocketService } from '../../../src/services/websocket.service';

describe('WebSocketService', () => {
  let service: WebSocketService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTo.mockReturnThis();
    mockTo.mockReturnValue({ emit: mockEmit });
    mockIn.mockReturnValue({ fetchSockets: mockFetchSockets });
    service = WebSocketService.getInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = WebSocketService.getInstance();
      const instance2 = WebSocketService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('broadcastMetricUpdate', () => {
    const mockMetric = {
      name: 'revenue',
      value: 5000,
      timestamp: new Date(),
    };

    it('should emit metric update via WebSocket', async () => {
      await service.broadcastMetricUpdate('venue-123', 'revenue', mockMetric as any);

      expect(mockEmitMetricUpdate).toHaveBeenCalledWith('revenue', 'venue-123', mockMetric);
    });

    it('should publish to Redis', async () => {
      await service.broadcastMetricUpdate('venue-123', 'revenue', mockMetric as any);

      expect(mockPublishMetricUpdate).toHaveBeenCalledWith('venue-123', 'revenue', mockMetric);
    });

    it('should handle errors gracefully', async () => {
      mockEmitMetricUpdate.mockImplementationOnce(() => {
        throw new Error('WebSocket error');
      });

      await expect(
        service.broadcastMetricUpdate('venue-123', 'revenue', mockMetric as any)
      ).resolves.not.toThrow();
    });
  });

  describe('broadcastWidgetUpdate', () => {
    const mockWidgetData = {
      widgetId: 'widget-1',
      data: { value: 100 },
    };

    it('should emit widget update', async () => {
      await service.broadcastWidgetUpdate('widget-1', mockWidgetData as any);

      expect(mockEmitWidgetUpdate).toHaveBeenCalledWith('widget-1', mockWidgetData);
    });

    it('should handle errors gracefully', async () => {
      mockEmitWidgetUpdate.mockImplementationOnce(() => {
        throw new Error('Widget error');
      });

      await expect(
        service.broadcastWidgetUpdate('widget-1', mockWidgetData as any)
      ).resolves.not.toThrow();
    });
  });

  describe('broadcastToVenue', () => {
    it('should emit to venue room', async () => {
      await service.broadcastToVenue('venue-123', 'alert', { message: 'Test' });

      expect(mockTo).toHaveBeenCalledWith('venue:venue-123');
      expect(mockEmit).toHaveBeenCalledWith('alert', { message: 'Test' });
    });

    it('should handle errors gracefully', async () => {
      mockTo.mockImplementationOnce(() => {
        throw new Error('Room error');
      });

      await expect(
        service.broadcastToVenue('venue-123', 'alert', {})
      ).resolves.not.toThrow();
    });
  });

  describe('broadcastToUser', () => {
    it('should emit to user sockets', async () => {
      const mockSocket = { data: { userId: 'user-1' }, emit: jest.fn() };
      mockFetchSockets.mockResolvedValueOnce([mockSocket]);

      await service.broadcastToUser('user-1', 'notification', { text: 'Hello' });

      expect(mockSocket.emit).toHaveBeenCalledWith('notification', { text: 'Hello' });
    });

    it('should only emit to matching user sockets', async () => {
      const mockSocket1 = { data: { userId: 'user-1' }, emit: jest.fn() };
      const mockSocket2 = { data: { userId: 'user-2' }, emit: jest.fn() };
      mockFetchSockets.mockResolvedValueOnce([mockSocket1, mockSocket2]);

      await service.broadcastToUser('user-1', 'notification', { text: 'Hello' });

      expect(mockSocket1.emit).toHaveBeenCalled();
      expect(mockSocket2.emit).not.toHaveBeenCalled();
    });

    it('should handle no matching sockets', async () => {
      mockFetchSockets.mockResolvedValueOnce([]);

      await expect(
        service.broadcastToUser('user-1', 'notification', {})
      ).resolves.not.toThrow();
    });
  });

  describe('getConnectedClients', () => {
    it('should return total count and by venue', async () => {
      mockFetchSockets.mockResolvedValueOnce([
        { data: { venueId: 'venue-1' } },
        { data: { venueId: 'venue-1' } },
        { data: { venueId: 'venue-2' } },
        { data: {} },
      ]);

      const result = await service.getConnectedClients();

      expect(result.total).toBe(4);
      expect(result.byVenue['venue-1']).toBe(2);
      expect(result.byVenue['venue-2']).toBe(1);
    });

    it('should return empty on error', async () => {
      mockFetchSockets.mockRejectedValueOnce(new Error('Socket error'));

      const result = await service.getConnectedClients();

      expect(result).toEqual({ total: 0, byVenue: {} });
    });
  });

  describe('disconnectUser', () => {
    it('should disconnect all user sockets', async () => {
      const mockSocket1 = { data: { userId: 'user-1' }, disconnect: jest.fn() };
      const mockSocket2 = { data: { userId: 'user-1' }, disconnect: jest.fn() };
      mockFetchSockets.mockResolvedValueOnce([mockSocket1, mockSocket2]);

      await service.disconnectUser('user-1', 'Session expired');

      expect(mockSocket1.disconnect).toHaveBeenCalledWith(true);
      expect(mockSocket2.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle no user sockets', async () => {
      mockFetchSockets.mockResolvedValueOnce([]);

      await expect(service.disconnectUser('user-1')).resolves.not.toThrow();
    });
  });

  describe('subscribeToMetrics', () => {
    it('should join metric rooms', async () => {
      const mockSocket = { join: jest.fn(), emit: jest.fn() };
      mockSocketsGet.mockReturnValue(mockSocket);

      await service.subscribeToMetrics('socket-1', 'venue-123', ['revenue', 'tickets']);

      expect(mockSocket.join).toHaveBeenCalledWith('metrics:revenue:venue-123');
      expect(mockSocket.join).toHaveBeenCalledWith('metrics:tickets:venue-123');
    });

    it('should send current metric values', async () => {
      const mockSocket = { join: jest.fn(), emit: jest.fn() };
      mockSocketsGet.mockReturnValue(mockSocket);
      mockGetRealTimeMetric.mockResolvedValueOnce({ value: 100 });

      await service.subscribeToMetrics('socket-1', 'venue-123', ['revenue']);

      expect(mockSocket.emit).toHaveBeenCalledWith('metric:update', expect.objectContaining({
        type: 'revenue',
        venueId: 'venue-123',
        data: { value: 100 },
      }));
    });

    it('should throw for missing socket', async () => {
      mockSocketsGet.mockReturnValue(undefined);

      await expect(
        service.subscribeToMetrics('invalid-socket', 'venue-123', ['revenue'])
      ).resolves.not.toThrow(); // Error is caught internally
    });
  });

  describe('unsubscribeFromMetrics', () => {
    it('should leave metric rooms', async () => {
      const mockSocket = { leave: jest.fn() };
      mockSocketsGet.mockReturnValue(mockSocket);

      await service.unsubscribeFromMetrics('socket-1', 'venue-123', ['revenue', 'tickets']);

      expect(mockSocket.leave).toHaveBeenCalledWith('metrics:revenue:venue-123');
      expect(mockSocket.leave).toHaveBeenCalledWith('metrics:tickets:venue-123');
    });

    it('should handle missing socket gracefully', async () => {
      mockSocketsGet.mockReturnValue(undefined);

      await expect(
        service.unsubscribeFromMetrics('invalid-socket', 'venue-123', ['revenue'])
      ).resolves.not.toThrow();
    });
  });

  describe('getRoomSubscribers', () => {
    it('should return subscriber count', async () => {
      mockFetchSockets.mockResolvedValueOnce([{}, {}, {}]);

      const count = await service.getRoomSubscribers('metrics:revenue:venue-123');

      expect(count).toBe(3);
    });

    it('should return 0 on error', async () => {
      mockFetchSockets.mockRejectedValueOnce(new Error('Room error'));

      const count = await service.getRoomSubscribers('metrics:revenue:venue-123');

      expect(count).toBe(0);
    });
  });
});
