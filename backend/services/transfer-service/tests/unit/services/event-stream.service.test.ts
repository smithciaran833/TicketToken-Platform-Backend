/**
 * Unit Tests for EventStreamService
 *
 * Tests:
 * - Socket.IO connection handling
 * - Authentication flows
 * - Room subscriptions
 * - Redis pub/sub integration
 * - Event broadcasting
 * - User-specific events
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { EventStreamService, StreamEventType, createStreamEvent } from '../../../src/services/event-stream.service';

jest.mock('../../../src/utils/logger');

describe('EventStreamService', () => {
  let eventStreamService: EventStreamService;
  let mockIo: any;
  let mockRedis: any;
  let mockRedisSubscriber: any;
  let mockSocket: any;
  let connectionHandler: any;
  let messageHandler: any;

  beforeEach(() => {
    // Mock Socket.IO server
    mockIo = {
      on: jest.fn(),
      to: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      close: jest.fn(),
      fetchSockets: jest.fn().mockResolvedValue([])
    };

    // Mock Socket
    mockSocket = {
      id: 'socket-123',
      data: {},
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn()
    };

    // Mock Redis subscriber
    mockRedisSubscriber = {
      subscribe: jest.fn((channel, callback) => {
        if (callback) callback(null);
        return Promise.resolve();
      }),
      on: jest.fn(),
      publish: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK')
    };

    // Mock Redis
    mockRedis = {
      duplicate: jest.fn(() => mockRedisSubscriber)
    };

    // Capture the connection handler
    mockIo.on.mockImplementation((event: string, handler: any) => {
      if (event === 'connection') {
        connectionHandler = handler;
      }
    });

    // Capture Redis message handler
    mockRedisSubscriber.on.mockImplementation((event: string, handler: any) => {
      if (event === 'message') {
        messageHandler = handler;
      }
    });

    eventStreamService = new EventStreamService(mockIo, mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Setup', () => {
    it('should initialize with Socket.IO and Redis', () => {
      expect(eventStreamService).toBeDefined();
      expect(mockRedis.duplicate).toHaveBeenCalled();
    });

    it('should setup Socket.IO connection handler', () => {
      expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should subscribe to Redis transfer events channel', () => {
      expect(mockRedisSubscriber.subscribe).toHaveBeenCalledWith(
        'transfer:events',
        expect.any(Function)
      );
    });

    it('should setup Redis message handler', () => {
      expect(mockRedisSubscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('Socket Connection Handling', () => {
    it('should handle new socket connections', () => {
      expect(connectionHandler).toBeDefined();
      connectionHandler(mockSocket);

      // Should setup event handlers on the socket
      expect(mockSocket.on).toHaveBeenCalledWith('authenticate', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('subscribe:transfer', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('unsubscribe:transfer', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('should track connected socket count', () => {
      expect(eventStreamService.getConnectedCount()).toBe(0);
    });
  });

  describe('Authentication', () => {
    let authenticateHandler: any;

    beforeEach(() => {
      connectionHandler(mockSocket);

      // Find the authenticate handler
      const authenticateCall = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'authenticate'
      );
      authenticateHandler = authenticateCall[1];
    });

    it('should authenticate valid user and join user room', async () => {
      const authData = {
        userId: 'user-123',
        token: 'valid-token'
      };

      await authenticateHandler(authData);

      expect(mockSocket.data.userId).toBe('user-123');
      expect(mockSocket.join).toHaveBeenCalledWith('user:user-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', { success: true });
    });

    it('should track authenticated sockets', async () => {
      const authData = {
        userId: 'user-123',
        token: 'valid-token'
      };

      await authenticateHandler(authData);

      expect(eventStreamService.getConnectedCount()).toBe(1);
    });

    it('should disconnect socket on invalid token', async () => {
      // Mock verifyToken to return false
      (eventStreamService as any).verifyToken = jest.fn().mockResolvedValue(false);

      const authData = {
        userId: 'user-123',
        token: 'invalid-token'
      };

      await authenticateHandler(authData);

      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        success: false,
        error: 'Invalid token'
      });
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should handle authentication errors gracefully', async () => {
      (eventStreamService as any).verifyToken = jest.fn().mockRejectedValue(
        new Error('Auth service down')
      );

      const authData = {
        userId: 'user-123',
        token: 'any-token'
      };

      await authenticateHandler(authData);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('Transfer Subscriptions', () => {
    let subscribeHandler: any;
    let unsubscribeHandler: any;

    beforeEach(async () => {
      connectionHandler(mockSocket);

      // Authenticate first
      const authenticateCall = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'authenticate'
      );
      await authenticateCall[1]({ userId: 'user-123', token: 'valid-token' });

      // Get subscribe/unsubscribe handlers
      const subscribeCall = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'subscribe:transfer'
      );
      subscribeHandler = subscribeCall[1];

      const unsubscribeCall = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'unsubscribe:transfer'
      );
      unsubscribeHandler = unsubscribeCall[1];
    });

    it('should allow authenticated socket to subscribe to transfer', () => {
      subscribeHandler('transfer-123');

      expect(mockSocket.join).toHaveBeenCalledWith('transfer:transfer-123');
    });

    it('should not allow unauthenticated socket to subscribe', () => {
      // Create new socket without authentication
      const unauthSocket = { ...mockSocket, data: {}, join: jest.fn() };
      connectionHandler(unauthSocket);

      const subCall = unauthSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'subscribe:transfer'
      );
      subCall[1]('transfer-123');

      expect(unauthSocket.join).not.toHaveBeenCalled();
    });

    it('should allow socket to unsubscribe from transfer', () => {
      unsubscribeHandler('transfer-123');

      expect(mockSocket.leave).toHaveBeenCalledWith('transfer:transfer-123');
    });
  });

  describe('Socket Disconnection', () => {
    let disconnectHandler: any;

    beforeEach(async () => {
      connectionHandler(mockSocket);

      // Authenticate
      const authenticateCall = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'authenticate'
      );
      await authenticateCall[1]({ userId: 'user-123', token: 'valid-token' });

      // Get disconnect handler
      const disconnectCall = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'disconnect'
      );
      disconnectHandler = disconnectCall[1];
    });

    it('should remove socket from authenticated list on disconnect', () => {
      expect(eventStreamService.getConnectedCount()).toBe(1);

      disconnectHandler();

      expect(eventStreamService.getConnectedCount()).toBe(0);
    });
  });

  describe('Redis Message Handling', () => {
    it('should parse and broadcast Redis messages', () => {
      const event = {
        type: StreamEventType.TRANSFER_UPDATE,
        data: {
          transferId: 'transfer-123',
          status: 'COMPLETED'
        },
        timestamp: new Date().toISOString()
      };

      messageHandler('transfer:events', JSON.stringify(event));

      expect(mockIo.to).toHaveBeenCalledWith('transfer:transfer-123');
      expect(mockIo.emit).toHaveBeenCalledWith(
        StreamEventType.TRANSFER_UPDATE,
        event.data
      );
    });

    it('should handle malformed Redis messages gracefully', () => {
      // Should not throw
      expect(() => {
        messageHandler('transfer:events', 'invalid json{');
      }).not.toThrow();
    });

    it('should broadcast to user room when userId in event data', () => {
      const event = {
        type: StreamEventType.NOTIFICATION,
        data: {
          userId: 'user-456',
          message: 'Transfer completed'
        },
        timestamp: new Date().toISOString()
      };

      messageHandler('transfer:events', JSON.stringify(event));

      expect(mockIo.to).toHaveBeenCalledWith('user:user-456');
    });

    it('should broadcast to both transfer and user rooms when both present', () => {
      const event = {
        type: StreamEventType.TRANSFER_STATUS,
        data: {
          transferId: 'transfer-123',
          userId: 'user-456',
          status: 'PENDING'
        },
        timestamp: new Date().toISOString()
      };

      messageHandler('transfer:events', JSON.stringify(event));

      expect(mockIo.to).toHaveBeenCalledWith('transfer:transfer-123');
      expect(mockIo.to).toHaveBeenCalledWith('user:user-456');
    });
  });

  describe('publishEvent()', () => {
    it('should publish event to Redis', async () => {
      const event = createStreamEvent(StreamEventType.TRANSFER_UPDATE, {
        transferId: 'transfer-123',
        status: 'COMPLETED'
      });

      await eventStreamService.publishEvent(event);

      expect(mockRedisSubscriber.publish).toHaveBeenCalledWith(
        'transfer:events',
        JSON.stringify(event)
      );
    });

    it('should handle Redis publish errors gracefully', async () => {
      mockRedisSubscriber.publish.mockRejectedValue(new Error('Redis down'));

      const event = createStreamEvent(StreamEventType.TRANSFER_UPDATE, {
        transferId: 'transfer-123'
      });

      // Should not throw
      await expect(
        eventStreamService.publishEvent(event)
      ).resolves.not.toThrow();
    });
  });

  describe('sendToUser()', () => {
    it('should send event to specific user room', async () => {
      const event = createStreamEvent(StreamEventType.NOTIFICATION, {
        message: 'Transfer accepted'
      });

      await eventStreamService.sendToUser('user-123', event);

      expect(mockIo.to).toHaveBeenCalledWith('user:user-123');
      expect(mockIo.emit).toHaveBeenCalledWith(
        StreamEventType.NOTIFICATION,
        event.data
      );
    });
  });

  describe('sendToTransfer()', () => {
    it('should send event to specific transfer room', async () => {
      const event = createStreamEvent(StreamEventType.TRANSFER_STATUS, {
        status: 'PROCESSING'
      });

      await eventStreamService.sendToTransfer('transfer-123', event);

      expect(mockIo.to).toHaveBeenCalledWith('transfer:transfer-123');
      expect(mockIo.emit).toHaveBeenCalledWith(
        StreamEventType.TRANSFER_STATUS,
        event.data
      );
    });
  });

  describe('broadcast()', () => {
    it('should broadcast event to all connected clients', async () => {
      const event = createStreamEvent(StreamEventType.NOTIFICATION, {
        message: 'System maintenance'
      });

      await eventStreamService.broadcast(event);

      expect(mockIo.emit).toHaveBeenCalledWith(
        StreamEventType.NOTIFICATION,
        event.data
      );
    });
  });

  describe('getRoomMemberCount()', () => {
    it('should return number of sockets in a room', async () => {
      const mockSockets = [
        { id: 'socket-1' },
        { id: 'socket-2' },
        { id: 'socket-3' }
      ];

      mockIo.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue(mockSockets)
      });

      const count = await eventStreamService.getRoomMemberCount('transfer:transfer-123');

      expect(mockIo.in).toHaveBeenCalledWith('transfer:transfer-123');
      expect(count).toBe(3);
    });

    it('should return 0 for empty room', async () => {
      mockIo.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([])
      });

      const count = await eventStreamService.getRoomMemberCount('user:user-123');

      expect(count).toBe(0);
    });
  });

  describe('close()', () => {
    it('should close Redis connection and Socket.IO server', async () => {
      await eventStreamService.close();

      expect(mockRedisSubscriber.quit).toHaveBeenCalled();
      expect(mockIo.close).toHaveBeenCalled();
    });
  });

  describe('createStreamEvent() Helper', () => {
    it('should create properly formatted stream event', () => {
      const data = { transferId: 'transfer-123', status: 'COMPLETED' };
      const event = createStreamEvent(StreamEventType.TRANSFER_UPDATE, data);

      expect(event.type).toBe(StreamEventType.TRANSFER_UPDATE);
      expect(event.data).toEqual(data);
      expect(event.timestamp).toBeDefined();
      expect(new Date(event.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should generate ISO timestamp', () => {
      const event = createStreamEvent(StreamEventType.NOTIFICATION, {});

      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('StreamEventType Enum', () => {
    it('should have all expected event types', () => {
      expect(StreamEventType.TRANSFER_UPDATE).toBe('transfer:update');
      expect(StreamEventType.TRANSFER_STATUS).toBe('transfer:status');
      expect(StreamEventType.BLOCKCHAIN_UPDATE).toBe('blockchain:update');
      expect(StreamEventType.NOTIFICATION).toBe('notification');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle multiple simultaneous connections', async () => {
      const sockets = Array(10).fill(null).map((_, i) => ({
        id: `socket-${i}`,
        data: {},
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        disconnect: jest.fn(),
        on: jest.fn()
      }));

      sockets.forEach(socket => connectionHandler(socket));

      // Each socket gets 4 event handlers registered
      sockets.forEach(socket => {
        expect(socket.on).toHaveBeenCalledWith('authenticate', expect.any(Function));
        expect(socket.on).toHaveBeenCalledWith('subscribe:transfer', expect.any(Function));
        expect(socket.on).toHaveBeenCalledWith('unsubscribe:transfer', expect.any(Function));
        expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      });
    });

    it('should handle rapid subscribe/unsubscribe cycles', async () => {
      connectionHandler(mockSocket);

      // Authenticate
      const authenticateCall = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'authenticate'
      );
      await authenticateCall[1]({ userId: 'user-123', token: 'valid-token' });

      // Clear join calls from authentication
      mockSocket.join.mockClear();

      // Get handlers
      const subCall = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'subscribe:transfer'
      );
      const unsubCall = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'unsubscribe:transfer'
      );

      const subscribeHandler = subCall[1];
      const unsubscribeHandler = unsubCall[1];

      // Rapid cycles
      for (let i = 0; i < 5; i++) {
        subscribeHandler(`transfer-${i}`);
        unsubscribeHandler(`transfer-${i}`);
      }

      expect(mockSocket.join).toHaveBeenCalledTimes(5);
      expect(mockSocket.leave).toHaveBeenCalledTimes(5);
    });

    it('should handle Redis subscription errors', () => {
      const mockErrorRedis = {
        duplicate: jest.fn(() => ({
          subscribe: jest.fn((channel, callback) => {
            callback(new Error('Subscription failed'));
          }),
          on: jest.fn(),
          publish: jest.fn(),
          quit: jest.fn()
        }))
      };

      // Should not throw during construction
      expect(() => {
        new EventStreamService(mockIo, mockErrorRedis as any);
      }).not.toThrow();
    });

    it('should handle events with missing data fields', () => {
      const event = {
        type: StreamEventType.TRANSFER_UPDATE,
        data: {}, // No transferId or userId
        timestamp: new Date().toISOString()
      };

      // Should not throw
      expect(() => {
        messageHandler('transfer:events', JSON.stringify(event));
      }).not.toThrow();
    });

    it('should handle events with null data', () => {
      const event = {
        type: StreamEventType.NOTIFICATION,
        data: null,
        timestamp: new Date().toISOString()
      };

      expect(() => {
        messageHandler('transfer:events', JSON.stringify(event));
      }).not.toThrow();
    });

    it('should maintain socket list integrity after multiple disconnects', async () => {
      const sockets = Array(5).fill(null).map((_, i) => ({
        id: `socket-${i}`,
        data: {},
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        disconnect: jest.fn(),
        on: jest.fn()
      }));

      // Connect all
      for (const socket of sockets) {
        connectionHandler(socket);
        const authCall = socket.on.mock.calls.find(
          (call: any[]) => call[0] === 'authenticate'
        );
        await authCall[1]({ userId: `user-${socket.id}`, token: 'valid' });
      }

      expect(eventStreamService.getConnectedCount()).toBe(5);

      // Disconnect some
      const disconnectCalls = sockets.slice(0, 3).map(socket =>
        socket.on.mock.calls.find((call: any[]) => call[0] === 'disconnect')
      );

      disconnectCalls.forEach(call => call[1]());

      expect(eventStreamService.getConnectedCount()).toBe(2);
    });
  });

  describe('Integration Patterns', () => {
    it('should support full authentication and subscription flow', async () => {
      connectionHandler(mockSocket);

      // Step 1: Authenticate
      const authCall = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'authenticate'
      );
      await authCall[1]({ userId: 'user-123', token: 'valid-token' });

      expect(mockSocket.data.userId).toBe('user-123');
      expect(mockSocket.join).toHaveBeenCalledWith('user:user-123');

      // Step 2: Subscribe to transfers
      const subCall = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'subscribe:transfer'
      );
      subCall[1]('transfer-123');
      subCall[1]('transfer-456');

      expect(mockSocket.join).toHaveBeenCalledWith('transfer:transfer-123');
      expect(mockSocket.join).toHaveBeenCalledWith('transfer:transfer-456');

      // Step 3: Receive events
      const event = {
        type: StreamEventType.TRANSFER_STATUS,
        data: {
          transferId: 'transfer-123',
          status: 'COMPLETED'
        },
        timestamp: new Date().toISOString()
      };

      messageHandler('transfer:events', JSON.stringify(event));

      expect(mockIo.to).toHaveBeenCalledWith('transfer:transfer-123');
    });
  });
});
