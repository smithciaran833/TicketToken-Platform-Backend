/**
 * WebSocket Configuration Tests
 */

import { Server as HTTPServer } from 'http';

// Mock socket.io BEFORE any imports
const mockSocket = {
  id: 'test-socket-id',
  join: jest.fn(),
  leave: jest.fn(),
  on: jest.fn(),
};

const mockIO = {
  on: jest.fn((event: string, callback: Function) => {
    if (event === 'connection') {
      callback(mockSocket);
    }
  }),
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => mockIO),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock config
jest.mock('../../../src/config/index', () => ({
  config: {
    env: 'test',
    websocket: {
      port: 3008,
      path: '/analytics/realtime',
    },
  },
}));

describe('WebSocket Config', () => {
  let mockServer: HTTPServer;
  let websocketModule: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServer = {} as HTTPServer;
    mockSocket.on.mockReset();
    mockSocket.join.mockReset();
    mockSocket.leave.mockReset();
    mockIO.on.mockClear();
    mockIO.to.mockClear().mockReturnThis();
    mockIO.emit.mockClear();
    
    // Re-setup the connection callback
    mockIO.on.mockImplementation((event: string, callback: Function) => {
      if (event === 'connection') {
        callback(mockSocket);
      }
    });
    
    // Fresh import for each test
    jest.resetModules();
    
    // Re-apply mocks after resetModules
    jest.doMock('socket.io', () => ({
      Server: jest.fn().mockImplementation(() => mockIO),
    }));
    jest.doMock('../../../src/utils/logger', () => ({
      logger: { info: jest.fn(), error: jest.fn() },
    }));
    jest.doMock('../../../src/config/index', () => ({
      config: { env: 'test', websocket: { port: 3008, path: '/analytics/realtime' } },
    }));
    
    websocketModule = require('../../../src/config/websocket');
  });

  describe('initializeWebSocket', () => {
    it('should create SocketIO server with correct options', () => {
      const { Server } = require('socket.io');

      websocketModule.initializeWebSocket(mockServer);

      expect(Server).toHaveBeenCalledWith(
        mockServer,
        expect.objectContaining({
          cors: expect.any(Object),
          transports: ['websocket', 'polling'],
        })
      );
    });

    it('should set up connection handler', () => {
      websocketModule.initializeWebSocket(mockServer);

      expect(mockIO.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should set up socket event handlers on connection', () => {
      websocketModule.initializeWebSocket(mockServer);

      expect(mockSocket.on).toHaveBeenCalledWith('subscribe', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('unsubscribe', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });

  describe('getIO', () => {
    it('should throw if not initialized', () => {
      // Don't initialize, just call getIO
      jest.resetModules();
      jest.doMock('socket.io', () => ({ Server: jest.fn() }));
      jest.doMock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn() },
      }));
      jest.doMock('../../../src/config/index', () => ({
        config: { env: 'test', websocket: { port: 3008, path: '/analytics/realtime' } },
      }));
      
      const freshModule = require('../../../src/config/websocket');
      expect(() => freshModule.getIO()).toThrow('WebSocket not initialized');
    });

    it('should return IO instance after initialization', () => {
      websocketModule.initializeWebSocket(mockServer);
      const io = websocketModule.getIO();

      expect(io).toBeDefined();
    });
  });

  describe('emitMetricUpdate', () => {
    it('should emit to venue room', () => {
      websocketModule.initializeWebSocket(mockServer);
      websocketModule.emitMetricUpdate('venue-123', 'sales', { total: 1000 });

      expect(mockIO.to).toHaveBeenCalledWith('venue:venue-123');
      expect(mockIO.emit).toHaveBeenCalledWith('metric-update', expect.objectContaining({
        venueId: 'venue-123',
        metric: 'sales',
        data: { total: 1000 },
        timestamp: expect.any(Date),
      }));
    });

    it('should emit to specific metric room', () => {
      websocketModule.initializeWebSocket(mockServer);
      websocketModule.emitMetricUpdate('venue-123', 'revenue', { amount: 5000 });

      expect(mockIO.to).toHaveBeenCalledWith('metric:revenue:venue-123');
      expect(mockIO.emit).toHaveBeenCalledWith('revenue-update', { amount: 5000 });
    });
  });

  describe('emitAlert', () => {
    it('should emit alert to venue room', () => {
      websocketModule.initializeWebSocket(mockServer);
      const alert = { type: 'capacity', message: 'Near capacity' };
      websocketModule.emitAlert('venue-456', alert);

      expect(mockIO.to).toHaveBeenCalledWith('venue:venue-456');
      expect(mockIO.emit).toHaveBeenCalledWith('alert', expect.objectContaining({
        venueId: 'venue-456',
        alert,
        timestamp: expect.any(Date),
      }));
    });
  });

  describe('emitWidgetUpdate', () => {
    it('should emit widget update to widget room', () => {
      websocketModule.initializeWebSocket(mockServer);
      const data = { chartData: [1, 2, 3] };
      websocketModule.emitWidgetUpdate('widget-789', data);

      expect(mockIO.to).toHaveBeenCalledWith('widget:widget-789');
      expect(mockIO.emit).toHaveBeenCalledWith('widget-update', expect.objectContaining({
        widgetId: 'widget-789',
        data,
        timestamp: expect.any(Date),
      }));
    });
  });

  describe('startWebSocketServer', () => {
    it('should be alias for initializeWebSocket', () => {
      const result = websocketModule.startWebSocketServer(mockServer);

      expect(result).toBeDefined();
    });
  });

  describe('socket event handlers', () => {
    it('should handle subscribe event', () => {
      websocketModule.initializeWebSocket(mockServer);

      const subscribeHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'subscribe'
      )?.[1];

      expect(subscribeHandler).toBeDefined();

      subscribeHandler({ venueId: 'venue-123', metrics: ['sales', 'revenue'] });

      expect(mockSocket.join).toHaveBeenCalledWith('venue:venue-123');
      expect(mockSocket.join).toHaveBeenCalledWith('metric:sales:venue-123');
      expect(mockSocket.join).toHaveBeenCalledWith('metric:revenue:venue-123');
    });

    it('should handle unsubscribe event', () => {
      websocketModule.initializeWebSocket(mockServer);

      const unsubscribeHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'unsubscribe'
      )?.[1];

      expect(unsubscribeHandler).toBeDefined();

      unsubscribeHandler({ venueId: 'venue-123' });

      expect(mockSocket.leave).toHaveBeenCalledWith('venue:venue-123');
    });
  });
});
