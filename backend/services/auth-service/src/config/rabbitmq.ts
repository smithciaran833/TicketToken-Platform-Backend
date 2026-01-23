/**
 * RabbitMQ Publisher for Auth Service
 *
 * PHASE 1 FIX (Issue 4): Implements real RabbitMQ event publishing
 *
 * Events Published:
 * - user.registered - When a new user registers
 * - user.password_reset_requested - When password reset is requested
 * - user.password_reset_completed - When password is successfully reset
 * - user.login - When a user logs in
 * - user.logout - When a user logs out
 * - user.email_verified - When a user verifies their email
 * - user.mfa_enabled - When MFA is enabled
 * - user.mfa_disabled - When MFA is disabled
 *
 * These events enable other services to react to auth events:
 * - notification-service: Welcome emails, security alerts
 * - analytics-service: User funnel tracking
 * - audit-service: Security audit logging
 */

import * as amqplib from 'amqplib';
import type { Connection, Channel } from 'amqplib';
import { logger } from '../utils/logger';
import { env } from './env';
import { Counter, Gauge } from 'prom-client';

const log = logger.child({ component: 'RabbitMQ' });

// =============================================================================
// METRICS
// =============================================================================

const eventsPublished = new Counter({
  name: 'auth_service_events_published_total',
  help: 'Total events published to RabbitMQ',
  labelNames: ['event_type', 'status']
});

const connectionStatus = new Gauge({
  name: 'auth_service_rabbitmq_publisher_connected',
  help: 'RabbitMQ publisher connection status (1=connected, 0=disconnected)',
  labelNames: []
});

// =============================================================================
// CONFIGURATION
// =============================================================================

export const rabbitmqConfig = {
  url: process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672',
  exchanges: {
    // Main platform events exchange
    events: 'tickettoken_events',
    // Auth-specific exchange for detailed auth events
    auth: 'auth-events'
  },
  routingKeys: {
    userRegistered: 'user.registered',
    userLogin: 'user.login',
    userLogout: 'user.logout',
    passwordResetRequested: 'user.password_reset_requested',
    passwordResetCompleted: 'user.password_reset_completed',
    emailVerified: 'user.email_verified',
    mfaEnabled: 'user.mfa_enabled',
    mfaDisabled: 'user.mfa_disabled',
    userUpdated: 'user.updated',
    userDeleted: 'user.deleted'
  }
};

const RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  maxAttempts: -1  // Infinite retries
};

// =============================================================================
// RABBITMQ PUBLISHER CLASS
// =============================================================================

class RabbitMQPublisher {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  /**
   * Connect to RabbitMQ
   */
  async connect(): Promise<void> {
    if (this.connecting) {
      log.debug('Connection already in progress');
      return;
    }

    if (this.connected) {
      log.debug('Already connected');
      return;
    }

    this.connecting = true;

    try {
      log.info('Connecting to RabbitMQ...', {
        url: rabbitmqConfig.url.replace(/:[^:@]+@/, ':***@')
      });

      this.connection = await amqplib.connect(rabbitmqConfig.url);
      this.channel = await this.connection.createChannel();

      // Set up event handlers
      this.connection.on('error', (err: Error) => {
        log.error('RabbitMQ connection error', { error: err.message });
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        log.warn('RabbitMQ connection closed');
        this.handleDisconnect();
      });

      this.channel.on('error', (err: Error) => {
        log.error('RabbitMQ channel error', { error: err.message });
      });

      // Set up exchanges
      await this.setupExchanges();

      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      connectionStatus.set(1);

      log.info('RabbitMQ publisher connected successfully', {
        exchanges: Object.values(rabbitmqConfig.exchanges)
      });

    } catch (error: any) {
      this.connecting = false;
      this.connected = false;
      connectionStatus.set(0);
      log.error('Failed to connect to RabbitMQ', { error: error.message });
      this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Set up exchanges
   */
  private async setupExchanges(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    // Assert main events exchange
    await this.channel.assertExchange(rabbitmqConfig.exchanges.events, 'topic', {
      durable: true
    });

    // Assert auth-specific exchange
    await this.channel.assertExchange(rabbitmqConfig.exchanges.auth, 'topic', {
      durable: true
    });

    log.info('RabbitMQ exchanges configured');
  }

  /**
   * Publish an event to RabbitMQ
   */
  async publish(
    exchange: string,
    routingKey: string,
    payload: Record<string, any>,
    metadata?: { userId?: string; tenantId?: string }
  ): Promise<boolean> {
    if (!this.connected || !this.channel) {
      log.warn('Cannot publish - not connected to RabbitMQ', { routingKey });
      eventsPublished.inc({ event_type: routingKey, status: 'not_connected' });
      return false;
    }

    try {
      const message = {
        ...payload,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          source: 'auth-service'
        },
        _meta: {
          source: 'auth-service',
          publishedAt: new Date().toISOString(),
          routingKey
        }
      };

      const success = this.channel.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: Date.now()
        }
      );

      if (success) {
        eventsPublished.inc({ event_type: routingKey, status: 'success' });
        log.debug('Event published successfully', {
          exchange,
          routingKey,
          userId: metadata?.userId
        });
      } else {
        eventsPublished.inc({ event_type: routingKey, status: 'buffer_full' });
        log.warn('Event publish returned false (buffer full)', {
          exchange,
          routingKey
        });
      }

      return success;
    } catch (error: any) {
      eventsPublished.inc({ event_type: routingKey, status: 'error' });
      log.error('Failed to publish event', {
        exchange,
        routingKey,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    this.connected = false;
    this.connection = null;
    this.channel = null;
    this.connecting = false;
    connectionStatus.set(0);
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    this.reconnectAttempts++;

    if (RECONNECT_CONFIG.maxAttempts > 0 &&
        this.reconnectAttempts > RECONNECT_CONFIG.maxAttempts) {
      log.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      RECONNECT_CONFIG.initialDelayMs * Math.pow(RECONNECT_CONFIG.multiplier, this.reconnectAttempts - 1),
      RECONNECT_CONFIG.maxDelayMs
    );

    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    const actualDelay = Math.round(delay + jitter);

    log.info('Scheduling reconnection', {
      attempt: this.reconnectAttempts,
      delayMs: actualDelay
    });

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      try {
        await this.connect();
      } catch (error: any) {
        log.error('Reconnection failed', {
          attempt: this.reconnectAttempts,
          error: error.message
        });
      }
    }, actualDelay);
  }

  /**
   * Disconnect from RabbitMQ
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.connected = false;
      connectionStatus.set(0);
      log.info('RabbitMQ publisher disconnected');
    } catch (error: any) {
      log.error('Error closing RabbitMQ connection', { error: error.message });
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const rabbitmq = new RabbitMQPublisher();

// =============================================================================
// INITIALIZATION FUNCTIONS
// =============================================================================

/**
 * Initialize RabbitMQ publisher
 */
export async function initializeRabbitMQ(): Promise<void> {
  try {
    await rabbitmq.connect();
    log.info('RabbitMQ publisher initialized');
  } catch (error: any) {
    log.warn('Failed to initialize RabbitMQ publisher - events will not be published', {
      error: error.message
    });
    // Don't throw - allow service to run without RabbitMQ
  }
}

/**
 * Shutdown RabbitMQ publisher
 */
export async function shutdownRabbitMQ(): Promise<void> {
  await rabbitmq.disconnect();
}

// =============================================================================
// AUTH EVENT PUBLISHER
// =============================================================================

export const AuthEventPublisher = {
  /**
   * Publish user.registered event
   */
  async userRegistered(
    user: {
      id: string;
      email: string;
      firstName?: string;
      lastName?: string;
    },
    metadata?: { tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.userRegistered,
      {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        registeredAt: new Date().toISOString()
      },
      { userId: user.id, tenantId: metadata?.tenantId }
    );
  },

  /**
   * Publish user.login event
   */
  async userLogin(
    userId: string,
    loginData: {
      ipAddress?: string;
      userAgent?: string;
      method?: string; // 'password', 'mfa', 'oauth'
    },
    metadata?: { tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.userLogin,
      {
        userId,
        ...loginData,
        loginAt: new Date().toISOString()
      },
      { userId, tenantId: metadata?.tenantId }
    );
  },

  /**
   * Publish user.logout event
   */
  async userLogout(
    userId: string,
    metadata?: { tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.userLogout,
      {
        userId,
        logoutAt: new Date().toISOString()
      },
      { userId, tenantId: metadata?.tenantId }
    );
  },

  /**
   * Publish user.password_reset_requested event
   */
  async passwordResetRequested(
    userId: string,
    email: string,
    metadata?: { tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.passwordResetRequested,
      {
        userId,
        email,
        requestedAt: new Date().toISOString()
      },
      { userId, tenantId: metadata?.tenantId }
    );
  },

  /**
   * Publish user.password_reset_completed event
   */
  async passwordResetCompleted(
    userId: string,
    metadata?: { tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.passwordResetCompleted,
      {
        userId,
        completedAt: new Date().toISOString()
      },
      { userId, tenantId: metadata?.tenantId }
    );
  },

  /**
   * Publish user.email_verified event
   */
  async emailVerified(
    userId: string,
    email: string,
    metadata?: { tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.emailVerified,
      {
        userId,
        email,
        verifiedAt: new Date().toISOString()
      },
      { userId, tenantId: metadata?.tenantId }
    );
  },

  /**
   * Publish user.mfa_enabled event
   */
  async mfaEnabled(
    userId: string,
    method: string, // 'totp', 'biometric'
    metadata?: { tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.mfaEnabled,
      {
        userId,
        method,
        enabledAt: new Date().toISOString()
      },
      { userId, tenantId: metadata?.tenantId }
    );
  },

  /**
   * Publish user.mfa_disabled event
   */
  async mfaDisabled(
    userId: string,
    metadata?: { tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.mfaDisabled,
      {
        userId,
        disabledAt: new Date().toISOString()
      },
      { userId, tenantId: metadata?.tenantId }
    );
  }
};
