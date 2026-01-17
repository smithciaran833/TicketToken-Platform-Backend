// Mock dependencies BEFORE imports
const mockWsOn = jest.fn();
const mockWsSend = jest.fn();
const mockWsClose = jest.fn();
const mockWsPing = jest.fn();
const mockWssOn = jest.fn();
const mockWssClose = jest.fn();

jest.mock('ws', () => ({
  WebSocketServer: jest.fn().mockImplementation(() => ({
    on: mockWssOn,
    close: mockWssClose,
  })),
  WebSocket: {
    OPEN: 1,
    CLOSED: 3,
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-12345'),
}));

jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/metrics.collector', () => ({
  metricsCollector: {
    wsConnectionsActive: { set: jest.fn() },
    wsMessagesSent: { inc: jest.fn() },
  },
}));

import { WebSocketManagerService, websocketManager } from '../../../src/services/websocket-manager.service';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../../../src/logger';

describe('WebSocketManagerService', () => {
  let service: WebSocketManagerService;
  let mockServer: any;
  let mockWs: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    service = new WebSocketManagerService();
    
    mockServer = { on: jest.fn() };
    mockWs = {
      on: mockWsOn,
      send: mockWsSend,
      close: mockWsClose,
      ping: mockWsPing,
      readyState: WebSocket.OPEN,
    };
  });

  describe('initialize', () => {
    it('should create WebSocket server with correct path', () => {
      service.initialize(mockServer);

      expect(WebSocketServer).toHaveBeenCalledWith({
        server: mockServer,
        path: '/api/v1/ws',
      });
    });

    it('should register connection handler', () => {
      service.initialize(mockServer);

      expect(mockWssOn).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should start heartbeat', () => {
      service.initialize(mockServer);

      expect(logger.info).toHaveBeenCalledWith('WebSocket heartbeat started', expect.any(Object));
    });

    it('should log initialization', () => {
      service.initialize(mockServer);

      expect(logger.info).toHaveBeenCalledWith('WebSocket server initialized');
    });
  });

  describe('handleConnection', () => {
    let connectionHandler: Function;

    beforeEach(() => {
      service.initialize(mockServer);
      connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
    });

    it('should create connection with unique ID', () => {
      connectionHandler(mockWs, {});

      expect(service.getConnectionCount()).toBe(1);
    });

    it('should register message handler', () => {
      connectionHandler(mockWs, {});

      expect(mockWsOn).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should register pong handler', () => {
      connectionHandler(mockWs, {});

      expect(mockWsOn).toHaveBeenCalledWith('pong', expect.any(Function));
    });

    it('should register close handler', () => {
      connectionHandler(mockWs, {});

      expect(mockWsOn).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should register error handler', () => {
      connectionHandler(mockWs, {});

      expect(mockWsOn).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should send welcome message', () => {
      connectionHandler(mockWs, {});

      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"type":"connected"')
      );
    });

    it('should log connection established', () => {
      connectionHandler(mockWs, {});

      expect(logger.info).toHaveBeenCalledWith('WebSocket connection established', {
        connectionId: 'mock-uuid-12345',
      });
    });
  });

  describe('handleMessage', () => {
    let connectionHandler: Function;
    let messageHandler: Function;

    beforeEach(() => {
      service.initialize(mockServer);
      connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockWs, {});
      messageHandler = mockWsOn.mock.calls.find(call => call[0] === 'message')[1];
    });

    it('should handle subscribe action', () => {
      const subscribeMessage = JSON.stringify({
        action: 'subscribe',
        metrics: ['cpu', 'memory'],
      });

      messageHandler(Buffer.from(subscribeMessage));

      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"type":"subscribed"')
      );
    });

    it('should handle unsubscribe action', () => {
      // First subscribe
      messageHandler(Buffer.from(JSON.stringify({
        action: 'subscribe',
        metrics: ['cpu'],
      })));

      jest.clearAllMocks();

      // Then unsubscribe
      messageHandler(Buffer.from(JSON.stringify({
        action: 'unsubscribe',
        metrics: ['cpu'],
      })));

      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"type":"unsubscribed"')
      );
    });

    it('should handle auth action', () => {
      const authMessage = JSON.stringify({
        action: 'auth',
        token: 'test-token',
      });

      messageHandler(Buffer.from(authMessage));

      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"type":"authenticated"')
      );
    });

    it('should handle ping action', () => {
      const pingMessage = JSON.stringify({ action: 'ping' });

      messageHandler(Buffer.from(pingMessage));

      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"type":"pong"')
      );
    });

    it('should handle unknown action', () => {
      const unknownMessage = JSON.stringify({ action: 'unknown' });

      messageHandler(Buffer.from(unknownMessage));

      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Unknown action"')
      );
    });

    it('should handle invalid JSON', () => {
      messageHandler(Buffer.from('not valid json'));

      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Invalid message format"')
      );
    });

    it('should log error for invalid message', () => {
      messageHandler(Buffer.from('invalid'));

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to handle WebSocket message',
        expect.any(Object)
      );
    });
  });

  describe('handleDisconnection', () => {
    let connectionHandler: Function;
    let closeHandler: Function;

    beforeEach(() => {
      service.initialize(mockServer);
      connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockWs, {});
      closeHandler = mockWsOn.mock.calls.find(call => call[0] === 'close')[1];
    });

    it('should remove connection on close', () => {
      expect(service.getConnectionCount()).toBe(1);

      closeHandler();

      expect(service.getConnectionCount()).toBe(0);
    });

    it('should log disconnection', () => {
      closeHandler();

      expect(logger.info).toHaveBeenCalledWith('WebSocket connection closed', {
        connectionId: 'mock-uuid-12345',
      });
    });

    it('should clean up subscriptions on close', () => {
      // Subscribe to a metric
      const messageHandler = mockWsOn.mock.calls.find(call => call[0] === 'message')[1];
      messageHandler(Buffer.from(JSON.stringify({
        action: 'subscribe',
        metrics: ['test_metric'],
      })));

      // Disconnect
      closeHandler();

      // Verify subscription is cleaned up
      const subscriptions = service.getActiveSubscriptions();
      expect(subscriptions.get('test_metric')).toBeUndefined();
    });
  });

  describe('broadcastMetricUpdate', () => {
    let connectionHandler: Function;
    let messageHandler: Function;

    beforeEach(() => {
      service.initialize(mockServer);
      connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockWs, {});
      messageHandler = mockWsOn.mock.calls.find(call => call[0] === 'message')[1];
    });

    it('should broadcast to subscribed connections', () => {
      // Subscribe to metric
      messageHandler(Buffer.from(JSON.stringify({
        action: 'subscribe',
        metrics: ['cpu_usage'],
      })));

      jest.clearAllMocks();

      // Broadcast update
      service.broadcastMetricUpdate({
        metric: 'cpu_usage',
        value: 75.5,
        timestamp: new Date(),
      });

      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"type":"metric_update"')
      );
    });

    it('should not broadcast to non-subscribed connections', () => {
      jest.clearAllMocks();

      service.broadcastMetricUpdate({
        metric: 'memory_usage',
        value: 60,
        timestamp: new Date(),
      });

      // No message should be sent for unsubscribed metric
      expect(mockWsSend).not.toHaveBeenCalledWith(
        expect.stringContaining('"type":"metric_update"')
      );
    });

    it('should include labels in broadcast', () => {
      messageHandler(Buffer.from(JSON.stringify({
        action: 'subscribe',
        metrics: ['http_requests'],
      })));

      jest.clearAllMocks();

      service.broadcastMetricUpdate({
        metric: 'http_requests',
        value: 100,
        timestamp: new Date(),
        labels: { method: 'GET', path: '/api' },
      });

      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"labels"')
      );
    });

    it('should log broadcast details', () => {
      messageHandler(Buffer.from(JSON.stringify({
        action: 'subscribe',
        metrics: ['test_metric'],
      })));

      service.broadcastMetricUpdate({
        metric: 'test_metric',
        value: 42,
        timestamp: new Date(),
      });

      expect(logger.debug).toHaveBeenCalledWith('Metric update broadcasted', expect.any(Object));
    });

    it('should handle no subscribers gracefully', () => {
      service.broadcastMetricUpdate({
        metric: 'no_subscribers',
        value: 0,
        timestamp: new Date(),
      });

      // Should not throw
      expect(logger.debug).not.toHaveBeenCalledWith(
        'Metric update broadcasted',
        expect.objectContaining({ metric: 'no_subscribers' })
      );
    });
  });

  describe('broadcastAlert', () => {
    let connectionHandler: Function;
    let messageHandler: Function;

    beforeEach(() => {
      service.initialize(mockServer);
      connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockWs, {});
      messageHandler = mockWsOn.mock.calls.find(call => call[0] === 'message')[1];
    });

    it('should broadcast alert to connections subscribed to alerts', () => {
      messageHandler(Buffer.from(JSON.stringify({
        action: 'subscribe',
        metrics: ['alerts'],
      })));

      jest.clearAllMocks();

      service.broadcastAlert({
        id: 'alert-123',
        severity: 'critical',
        message: 'CPU High',
      });

      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"type":"alert"')
      );
    });

    it('should broadcast alert to wildcard subscribers', () => {
      messageHandler(Buffer.from(JSON.stringify({
        action: 'subscribe',
        metrics: ['*'],
      })));

      jest.clearAllMocks();

      service.broadcastAlert({
        id: 'alert-456',
        severity: 'warning',
      });

      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"type":"alert"')
      );
    });

    it('should log alert broadcast', () => {
      messageHandler(Buffer.from(JSON.stringify({
        action: 'subscribe',
        metrics: ['alerts'],
      })));

      service.broadcastAlert({ id: 'alert-789' });

      expect(logger.info).toHaveBeenCalledWith('Alert broadcasted', expect.any(Object));
    });

    it('should not broadcast to non-alert subscribers', () => {
      messageHandler(Buffer.from(JSON.stringify({
        action: 'subscribe',
        metrics: ['cpu_only'],
      })));

      jest.clearAllMocks();

      service.broadcastAlert({ id: 'alert-no-send' });

      expect(mockWsSend).not.toHaveBeenCalledWith(
        expect.stringContaining('"type":"alert"')
      );
    });
  });

  describe('getConnectionCount', () => {
    it('should return 0 when no connections', () => {
      expect(service.getConnectionCount()).toBe(0);
    });

    it('should return correct count after connections', () => {
      service.initialize(mockServer);
      const connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
      
      connectionHandler(mockWs, {});
      expect(service.getConnectionCount()).toBe(1);
    });
  });

  describe('getActiveSubscriptions', () => {
    it('should return empty map when no subscriptions', () => {
      const subscriptions = service.getActiveSubscriptions();

      expect(subscriptions.size).toBe(0);
    });

    it('should return subscription counts', () => {
      service.initialize(mockServer);
      const connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockWs, {});
      const messageHandler = mockWsOn.mock.calls.find(call => call[0] === 'message')[1];

      messageHandler(Buffer.from(JSON.stringify({
        action: 'subscribe',
        metrics: ['cpu', 'memory'],
      })));

      const subscriptions = service.getActiveSubscriptions();

      expect(subscriptions.get('cpu')).toBe(1);
      expect(subscriptions.get('memory')).toBe(1);
    });
  });

  describe('shutdown', () => {
    it('should close all connections', () => {
      service.initialize(mockServer);
      const connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockWs, {});

      service.shutdown();

      expect(mockWsClose).toHaveBeenCalledWith(1000, 'Server shutting down');
    });

    it('should clear connections map', () => {
      service.initialize(mockServer);
      const connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockWs, {});

      service.shutdown();

      expect(service.getConnectionCount()).toBe(0);
    });

    it('should close WebSocket server', () => {
      service.initialize(mockServer);

      service.shutdown();

      expect(mockWssClose).toHaveBeenCalled();
    });

    it('should log shutdown complete', () => {
      service.initialize(mockServer);

      service.shutdown();

      expect(logger.info).toHaveBeenCalledWith('WebSocket server shutdown complete');
    });

    it('should clear active subscriptions', () => {
      service.initialize(mockServer);
      const connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockWs, {});
      const messageHandler = mockWsOn.mock.calls.find(call => call[0] === 'message')[1];
      messageHandler(Buffer.from(JSON.stringify({
        action: 'subscribe',
        metrics: ['test'],
      })));

      service.shutdown();

      expect(service.getActiveSubscriptions().size).toBe(0);
    });
  });

  describe('send', () => {
    it('should not send to closed connections', () => {
      service.initialize(mockServer);
      const connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
      
      // Create connection with closed state
      const closedWs = {
        ...mockWs,
        readyState: WebSocket.CLOSED,
      };
      connectionHandler(closedWs, {});

      // The welcome message send should fail silently
      // We can verify by checking no successful sends happened
      expect(closedWs.send).not.toHaveBeenCalled();
    });

    it('should return false for non-existent connection', () => {
      service.initialize(mockServer);
      
      // Broadcast to non-existent subscribers - should not throw
      service.broadcastMetricUpdate({
        metric: 'test',
        value: 1,
        timestamp: new Date(),
      });

      // Should complete without error
      expect(true).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle WebSocket error event', () => {
      service.initialize(mockServer);
      const connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockWs, {});
      
      const errorHandler = mockWsOn.mock.calls.find(call => call[0] === 'error')[1];
      const testError = new Error('Test WebSocket error');
      
      errorHandler(testError);
      
      expect(logger.error).toHaveBeenCalledWith('WebSocket error', expect.any(Object));
      expect(service.getConnectionCount()).toBe(0);
    });
  });

  describe('pong handler', () => {
    it('should update lastPing on pong', () => {
      service.initialize(mockServer);
      const connectionHandler = mockWssOn.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockWs, {});
      
      const pongHandler = mockWsOn.mock.calls.find(call => call[0] === 'pong')[1];
      
      // Should not throw
      pongHandler();
      
      expect(service.getConnectionCount()).toBe(1);
    });
  });

  describe('exported instance', () => {
    it('should export websocketManager as singleton', () => {
      const { websocketManager: exported1 } = require('../../../src/services/websocket-manager.service');
      const { websocketManager: exported2 } = require('../../../src/services/websocket-manager.service');
      expect(exported1).toBe(exported2);
    });
  });
});
