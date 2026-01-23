/**
 * Unit Tests for Auth Service RabbitMQ Publisher
 *
 * PHASE 1 FIX (Issue 4): Tests the real RabbitMQ event publishing implementation.
 */

// Mock modules before imports
jest.mock('amqplib', () => {
  const mockChannel = {
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({ queue: 'test-queue' }),
    bindQueue: jest.fn().mockResolvedValue({}),
    publish: jest.fn().mockReturnValue(true),
    close: jest.fn().mockResolvedValue({}),
    on: jest.fn(),
  };

  const mockConnection = {
    createChannel: jest.fn().mockResolvedValue(mockChannel),
    close: jest.fn().mockResolvedValue({}),
    on: jest.fn(),
  };

  return {
    connect: jest.fn().mockResolvedValue(mockConnection),
    __mockChannel: mockChannel,
    __mockConnection: mockConnection,
  };
});

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

jest.mock('../../src/config/env', () => ({
  env: {
    PORT: 3001,
  },
}));

jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
  })),
  Gauge: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
  })),
}));

import {
  rabbitmq,
  initializeRabbitMQ,
  shutdownRabbitMQ,
  rabbitmqConfig,
  AuthEventPublisher,
} from '../../src/config/rabbitmq';

const amqplib = require('amqplib');
const mockChannel = amqplib.__mockChannel;
const mockConnection = amqplib.__mockConnection;

describe('Auth Service RabbitMQ Publisher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await rabbitmq.disconnect();
  });

  describe('Connection', () => {
    it('should connect to RabbitMQ successfully', async () => {
      await initializeRabbitMQ();

      expect(amqplib.connect).toHaveBeenCalledWith(rabbitmqConfig.url);
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should assert required exchanges on connection', async () => {
      await initializeRabbitMQ();

      // Should assert tickettoken_events exchange
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        'topic',
        { durable: true }
      );

      // Should assert auth-events exchange
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.auth,
        'topic',
        { durable: true }
      );
    });

    it('should set up error handlers on connection', async () => {
      await initializeRabbitMQ();

      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should handle connection failure gracefully', async () => {
      const connectionError = new Error('Connection refused');
      amqplib.connect.mockRejectedValueOnce(connectionError);

      // Should not throw (initialization logs warning but doesn't fail)
      await initializeRabbitMQ();

      expect(amqplib.connect).toHaveBeenCalled();
    });

    it('should report connected status correctly', async () => {
      expect(rabbitmq.isConnected()).toBe(false);

      await initializeRabbitMQ();

      expect(rabbitmq.isConnected()).toBe(true);
    });
  });

  describe('User Registration Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish user.registered event', async () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = await AuthEventPublisher.userRegistered(user, {
        tenantId: 'tenant-1',
      });

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.userRegistered,
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
        })
      );
    });

    it('should include correct payload in user.registered event', async () => {
      const user = {
        id: 'user-456',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
      };

      await AuthEventPublisher.userRegistered(user, { tenantId: 'tenant-2' });

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message.userId).toBe('user-456');
      expect(message.email).toBe('jane@example.com');
      expect(message.firstName).toBe('Jane');
      expect(message.lastName).toBe('Smith');
      expect(message.registeredAt).toBeDefined();
      expect(message.metadata.tenantId).toBe('tenant-2');
    });
  });

  describe('User Login Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish user.login event', async () => {
      const result = await AuthEventPublisher.userLogin(
        'user-123',
        {
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          method: 'password',
        },
        { tenantId: 'tenant-1' }
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.userLogin,
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should include login metadata in user.login event', async () => {
      await AuthEventPublisher.userLogin(
        'user-789',
        {
          ipAddress: '10.0.0.1',
          userAgent: 'Chrome/100',
          method: 'mfa',
        },
        { tenantId: 'tenant-3' }
      );

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message.userId).toBe('user-789');
      expect(message.ipAddress).toBe('10.0.0.1');
      expect(message.userAgent).toBe('Chrome/100');
      expect(message.method).toBe('mfa');
      expect(message.loginAt).toBeDefined();
    });
  });

  describe('User Logout Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish user.logout event', async () => {
      const result = await AuthEventPublisher.userLogout('user-123', {
        tenantId: 'tenant-1',
      });

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.userLogout,
        expect.any(Buffer),
        expect.any(Object)
      );
    });
  });

  describe('Password Reset Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish user.password_reset_requested event', async () => {
      const result = await AuthEventPublisher.passwordResetRequested(
        'user-123',
        'test@example.com',
        { tenantId: 'tenant-1' }
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.passwordResetRequested,
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should include correct payload in password_reset_requested event', async () => {
      await AuthEventPublisher.passwordResetRequested(
        'user-456',
        'reset@example.com',
        { tenantId: 'tenant-2' }
      );

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message.userId).toBe('user-456');
      expect(message.email).toBe('reset@example.com');
      expect(message.requestedAt).toBeDefined();
    });

    it('should publish user.password_reset_completed event', async () => {
      const result = await AuthEventPublisher.passwordResetCompleted('user-123', {
        tenantId: 'tenant-1',
      });

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.passwordResetCompleted,
        expect.any(Buffer),
        expect.any(Object)
      );
    });
  });

  describe('Email Verification Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish user.email_verified event', async () => {
      const result = await AuthEventPublisher.emailVerified(
        'user-123',
        'verified@example.com',
        { tenantId: 'tenant-1' }
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.emailVerified,
        expect.any(Buffer),
        expect.any(Object)
      );
    });
  });

  describe('MFA Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish user.mfa_enabled event', async () => {
      const result = await AuthEventPublisher.mfaEnabled('user-123', 'totp', {
        tenantId: 'tenant-1',
      });

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.mfaEnabled,
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should include method in mfa_enabled event', async () => {
      await AuthEventPublisher.mfaEnabled('user-456', 'biometric', {
        tenantId: 'tenant-2',
      });

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message.userId).toBe('user-456');
      expect(message.method).toBe('biometric');
      expect(message.enabledAt).toBeDefined();
    });

    it('should publish user.mfa_disabled event', async () => {
      const result = await AuthEventPublisher.mfaDisabled('user-123', {
        tenantId: 'tenant-1',
      });

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.mfaDisabled,
        expect.any(Buffer),
        expect.any(Object)
      );
    });
  });

  describe('Message Format', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should include metadata in published messages', async () => {
      await AuthEventPublisher.userRegistered(
        { id: 'user-123', email: 'test@example.com' },
        { tenantId: 'tenant-1' }
      );

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message.metadata).toBeDefined();
      expect(message.metadata.tenantId).toBe('tenant-1');
      expect(message.metadata.timestamp).toBeDefined();
      expect(message.metadata.source).toBe('auth-service');
    });

    it('should include _meta in published messages', async () => {
      await AuthEventPublisher.userLogin('user-123', {}, {});

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message._meta).toBeDefined();
      expect(message._meta.source).toBe('auth-service');
      expect(message._meta.publishedAt).toBeDefined();
      expect(message._meta.routingKey).toBe(rabbitmqConfig.routingKeys.userLogin);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should handle publish when buffer is full', async () => {
      mockChannel.publish.mockReturnValueOnce(false);

      const result = await AuthEventPublisher.userRegistered(
        { id: 'user-123', email: 'test@example.com' }
      );

      expect(result).toBe(false);
    });

    it('should return false when not connected', async () => {
      await rabbitmq.disconnect();

      const result = await AuthEventPublisher.userRegistered(
        { id: 'user-123', email: 'test@example.com' }
      );

      expect(result).toBe(false);
    });
  });

  describe('Disconnect', () => {
    it('should close channel and connection on disconnect', async () => {
      await initializeRabbitMQ();

      await rabbitmq.disconnect();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
      expect(rabbitmq.isConnected()).toBe(false);
    });
  });
});
