/**
 * Comprehensive Unit Tests for src/utils/websocket-manager.ts
 *
 * Tests WebSocket manager with reconnection, health checks, and subscriptions
 */

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

// Simple synchronous mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  public readyState = MockWebSocket.OPEN;
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor(public url: string) {
    // Immediately open
    this.readyState = MockWebSocket.OPEN;
    setImmediate(() => this.emit('open'));
  }

  on(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  emit(event: string, ...args: any[]) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(...args));
  }

  send(data: any) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    setImmediate(() => this.emit('close', code || 1000, Buffer.from(reason || '')));
  }

  terminate() {
    this.readyState = MockWebSocket.CLOSED;
    setImmediate(() => this.emit('close', 1006, Buffer.from('Terminated')));
  }

  ping() {
    setImmediate(() => this.emit('pong'));
  }
}

jest.mock('ws', () => MockWebSocket);

import {
  WebSocketManager,
  ConnectionState,
  initializeSolanaWebSocket,
  getSolanaWebSocket,
  initializeMarketplaceWebSocket,
  getMarketplaceWebSocket,
} from '../../../src/utils/websocket-manager';

describe('src/utils/websocket-manager.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  // =============================================================================
  // CONSTRUCTOR
  // =============================================================================

  describe('Constructor', () => {
    it('should initialize with required options', () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      expect(manager).toBeInstanceOf(WebSocketManager);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test',
          url: 'ws://localhost:8080',
        }),
        'WebSocket manager initialized'
      );

      manager.disconnect();
    });

    it('should use default options', () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      expect(manager.getState()).toBe(ConnectionState.DISCONNECTED);
      manager.disconnect();
    });

    it('should use custom options', () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
        reconnectDelay: 2000,
        maxReconnectDelay: 60000,
        backoffMultiplier: 3,
        maxReconnectAttempts: 5,
        pingInterval: 45000,
        pongTimeout: 10000,
        connectionTimeout: 15000,
        autoReconnect: false,
      });

      expect(manager).toBeDefined();
      manager.disconnect();
    });
  });

  // =============================================================================
  // CONNECT
  // =============================================================================

  describe('connect()', () => {
    it('should connect successfully', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      await manager.connect();

      expect(manager.getState()).toBe(ConnectionState.CONNECTED);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test' }),
        'WebSocket connected'
      );

      manager.disconnect();
    });

    it('should emit connected event', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      const listener = jest.fn();
      manager.on('connected', listener);

      await manager.connect();

      expect(listener).toHaveBeenCalled();
      manager.disconnect();
    });

    it('should update metrics on connection', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      await manager.connect();

      const metrics = manager.getMetrics();
      expect(metrics.totalConnections).toBe(1);
      expect(metrics.lastConnectedAt).toBeGreaterThan(0);

      manager.disconnect();
    });
  });

  // =============================================================================
  // DISCONNECT
  // =============================================================================

  describe('disconnect()', () => {
    it('should disconnect successfully', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      await manager.connect();
      manager.disconnect();

      expect(manager.getState()).toBe(ConnectionState.DISCONNECTED);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test' }),
        'WebSocket disconnected'
      );
    });
  });

  // =============================================================================
  // SEND
  // =============================================================================

  describe('send()', () => {
    it('should send string message', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      await manager.connect();
      const result = manager.send('test message');

      expect(result).toBe(true);
      manager.disconnect();
    });

    it('should send JSON message', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      await manager.connect();
      const result = manager.send({ type: 'test', data: 'value' });

      expect(result).toBe(true);
      manager.disconnect();
    });

    it('should fail when not connected', () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      const result = manager.send('test');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should track messages sent', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      await manager.connect();
      manager.send('message1');
      manager.send('message2');

      const metrics = manager.getMetrics();
      expect(metrics.messagesSent).toBe(2);

      manager.disconnect();
    });
  });

  // =============================================================================
  // SUBSCRIPTIONS
  // =============================================================================

  describe('Subscriptions', () => {
    it('should add subscription', () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      manager.addSubscription('sub1', { type: 'subscribe', channel: 'trades' });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sub1' }),
        'Subscription added'
      );

      manager.disconnect();
    });

    it('should remove subscription', () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      manager.addSubscription('sub1', { type: 'subscribe' });
      manager.removeSubscription('sub1');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sub1' }),
        'Subscription removed'
      );

      manager.disconnect();
    });
  });

  // =============================================================================
  // STATE MANAGEMENT
  // =============================================================================

  describe('State Management', () => {
    it('should start in DISCONNECTED state', () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      expect(manager.getState()).toBe(ConnectionState.DISCONNECTED);
      manager.disconnect();
    });

    it('should transition to CONNECTED', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      await manager.connect();
      expect(manager.getState()).toBe(ConnectionState.CONNECTED);

      manager.disconnect();
    });

    it('should emit stateChange events', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      const listener = jest.fn();
      manager.on('stateChange', listener);

      await manager.connect();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          from: ConnectionState.DISCONNECTED,
          to: ConnectionState.CONNECTING,
        })
      );

      manager.disconnect();
    });

    it('should check isConnected()', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      expect(manager.isConnected()).toBe(false);

      await manager.connect();
      expect(manager.isConnected()).toBe(true);

      manager.disconnect();
    });
  });

  // =============================================================================
  // METRICS
  // =============================================================================

  describe('getMetrics()', () => {
    it('should return comprehensive metrics', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      await manager.connect();
      manager.send('test1');
      manager.send('test2');

      const metrics = manager.getMetrics();

      expect(metrics).toEqual({
        name: 'test',
        state: ConnectionState.CONNECTED,
        reconnectAttempts: 0,
        totalConnections: 1,
        totalDisconnections: 0,
        lastConnectedAt: expect.any(Number),
        lastDisconnectedAt: null,
        messagesSent: 2,
        messagesReceived: 0,
        uptime: expect.any(Number),
      });

      manager.disconnect();
    });

    it('should track disconnections', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      await manager.connect();
      
      // Wait for close event to process
      const closePromise = new Promise(resolve => {
        manager.on('disconnected', resolve);
      });
      
      manager.disconnect();
      await closePromise;

      const metrics = manager.getMetrics();
      expect(metrics.totalDisconnections).toBe(1);
      expect(metrics.lastDisconnectedAt).toBeGreaterThan(0);
    });

    it('should show zero uptime when disconnected', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      await manager.connect();
      manager.disconnect();

      const metrics = manager.getMetrics();
      expect(metrics.uptime).toBe(0);
    });
  });

  // =============================================================================
  // MESSAGE HANDLING
  // =============================================================================

  describe('Message Handling', () => {
    it('should emit message events', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      const listener = jest.fn();
      manager.on('message', listener);

      await manager.connect();

      // Simulate message
      (manager as any).ws.emit('message', Buffer.from('{"type":"data"}'));

      expect(listener).toHaveBeenCalledWith({ type: 'data' });

      manager.disconnect();
    });

    it('should parse JSON messages', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      const listener = jest.fn();
      manager.on('message', listener);

      await manager.connect();

      (manager as any).ws.emit('message', Buffer.from('{"test":true}'));

      expect(listener).toHaveBeenCalledWith({ test: true });

      manager.disconnect();
    });

    it('should handle non-JSON messages', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      const listener = jest.fn();
      manager.on('message', listener);

      await manager.connect();

      (manager as any).ws.emit('message', Buffer.from('plain text'));

      expect(listener).toHaveBeenCalledWith(expect.any(Buffer));

      manager.disconnect();
    });

    it('should track messages received', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      await manager.connect();

      (manager as any).ws.emit('message', Buffer.from('msg1'));
      (manager as any).ws.emit('message', Buffer.from('msg2'));

      const metrics = manager.getMetrics();
      expect(metrics.messagesReceived).toBe(2);

      manager.disconnect();
    });
  });

  // =============================================================================
  // ERROR HANDLING
  // =============================================================================

  describe('Error Handling', () => {
    it('should emit error events', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      const listener = jest.fn();
      manager.on('error', listener);

      await manager.connect();

      const error = new Error('Test error');
      (manager as any).ws.emit('error', error);

      expect(listener).toHaveBeenCalledWith(error);
      expect(mockLogger.error).toHaveBeenCalled();

      manager.disconnect();
    });
  });

  // =============================================================================
  // SINGLETON FUNCTIONS
  // =============================================================================

  describe('Singleton Functions', () => {
    describe('Solana WebSocket', () => {
      it('should initialize Solana WebSocket', () => {
        const manager = initializeSolanaWebSocket('ws://solana:8080');

        expect(manager).toBeInstanceOf(WebSocketManager);
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'solana-rpc' }),
          'WebSocket manager initialized'
        );

        manager.disconnect();
      });

      it('should return existing instance', () => {
        const manager1 = initializeSolanaWebSocket('ws://solana:8080');
        const manager2 = initializeSolanaWebSocket('ws://solana:8080');

        expect(manager1).toBe(manager2);

        manager1.disconnect();
      });

      it('should get Solana WebSocket instance', () => {
        initializeSolanaWebSocket('ws://solana:8080');
        const manager = getSolanaWebSocket();

        expect(manager).toBeInstanceOf(WebSocketManager);

        manager?.disconnect();
      });
    });

    describe('Marketplace WebSocket', () => {
      it('should initialize Marketplace WebSocket', () => {
        const manager = initializeMarketplaceWebSocket('ws://marketplace:8080');

        expect(manager).toBeInstanceOf(WebSocketManager);
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'marketplace' }),
          'WebSocket manager initialized'
        );

        manager.disconnect();
      });

      it('should get Marketplace WebSocket instance', () => {
        initializeMarketplaceWebSocket('ws://marketplace:8080');
        const manager = getMarketplaceWebSocket();

        expect(manager).toBeInstanceOf(WebSocketManager);

        manager?.disconnect();
      });
    });
  });

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('Integration Tests', () => {
    it('should handle full connection lifecycle', async () => {
      const manager = new WebSocketManager({
        url: 'ws://localhost:8080',
        name: 'test',
      });

      // Connect
      await manager.connect();
      expect(manager.isConnected()).toBe(true);

      // Send message
      manager.send({ type: 'subscribe' });

      // Disconnect
      manager.disconnect();
      expect(manager.isConnected()).toBe(false);
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export ConnectionState enum', () => {
      expect(ConnectionState.DISCONNECTED).toBe('DISCONNECTED');
      expect(ConnectionState.CONNECTING).toBe('CONNECTING');
      expect(ConnectionState.CONNECTED).toBe('CONNECTED');
      expect(ConnectionState.RECONNECTING).toBe('RECONNECTING');
      expect(ConnectionState.FAILED).toBe('FAILED');
    });

    it('should export WebSocketManager class', () => {
      expect(typeof WebSocketManager).toBe('function');
    });

    it('should export singleton functions', () => {
      expect(typeof initializeSolanaWebSocket).toBe('function');
      expect(typeof getSolanaWebSocket).toBe('function');
      expect(typeof initializeMarketplaceWebSocket).toBe('function');
      expect(typeof getMarketplaceWebSocket).toBe('function');
    });
  });
});
