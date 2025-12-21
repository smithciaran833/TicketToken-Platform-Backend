/**
 * Redis Connection Manager
 * 
 * Singleton connection manager for Redis. Manages main client, pub client,
 * and sub client instances with automatic reconnection and error handling.
 */

import Redis from 'ioredis';
import {
  RedisConnectionConfig,
  RedisEnvConfig,
  ConnectionState,
  ConnectionInfo,
  HealthCheckResult,
  RedisConnectionError,
} from './types';
import {
  DEFAULT_CONNECTION_CONFIG,
  DEFAULT_REDIS_ENV,
  REDIS_ENV_VARS,
  HEALTH_CHECK_CONFIG,
} from './config';

/**
 * Connection Manager Singleton
 * 
 * Manages Redis connections across the application. Provides main client
 * for general operations, and separate pub/sub clients for messaging.
 */
export class ConnectionManager {
  private static instance: ConnectionManager;
  
  private mainClient: Redis | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  
  private connectionState: ConnectionState = 'disconnected';
  private connectionStartTime: number = 0;
  private reconnectAttempts: number = 0;
  private lastError: Error | undefined;
  
  private config: RedisConnectionConfig;
  private envConfig: RedisEnvConfig;
  
  /**
   * Private constructor (singleton pattern)
   */
  private constructor() {
    this.envConfig = this.loadEnvConfig();
    this.config = this.buildConnectionConfig();
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }
  
  /**
   * Load configuration from environment variables
   */
  private loadEnvConfig(): RedisEnvConfig {
    return {
      host: process.env[REDIS_ENV_VARS.HOST] || DEFAULT_REDIS_ENV.HOST,
      port: parseInt(process.env[REDIS_ENV_VARS.PORT] || String(DEFAULT_REDIS_ENV.PORT), 10),
      password: process.env[REDIS_ENV_VARS.PASSWORD],
      db: parseInt(process.env[REDIS_ENV_VARS.DB] || String(DEFAULT_REDIS_ENV.DB), 10),
      url: process.env[REDIS_ENV_VARS.URL],
    };
  }
  
  /**
   * Build Redis connection configuration
   */
  private buildConnectionConfig(): RedisConnectionConfig {
    const config: RedisConnectionConfig = {
      ...DEFAULT_CONNECTION_CONFIG,
    };
    
    // If URL is provided, use it (overrides individual settings)
    if (this.envConfig.url) {
      // Parse URL and extract components if needed
      // ioredis will handle the URL directly
      return config;
    }
    
    // Otherwise use individual settings
    config.host = this.envConfig.host;
    config.port = this.envConfig.port;
    config.db = this.envConfig.db;
    
    // Only add password if it's set
    if (this.envConfig.password) {
      config.password = this.envConfig.password;
    }
    
    return config;
  }
  
  /**
   * Create and configure a Redis client
   */
  private createClient(name: string): Redis {
    const clientConfig = { ...this.config };
    
    let client: Redis;
    
    // Create client from URL or individual config
    if (this.envConfig.url) {
      client = new Redis(this.envConfig.url, clientConfig);
    } else {
      client = new Redis(clientConfig);
    }
    
    // Attach event handlers
    this.attachEventHandlers(client, name);
    
    return client;
  }
  
  /**
   * Attach event handlers to Redis client
   */
  private attachEventHandlers(client: Redis, name: string): void {
    client.on('connect', () => {
      this.connectionState = 'connecting';
      if (name === 'main') {
        this.connectionStartTime = Date.now();
      }
      this.log('info', `[${name}] Redis connecting to ${this.envConfig.host}:${this.envConfig.port}`);
    });
    
    client.on('ready', () => {
      this.connectionState = 'ready';
      this.reconnectAttempts = 0;
      this.lastError = undefined;
      this.log('info', `[${name}] Redis connection ready`);
    });
    
    client.on('error', (error: Error) => {
      this.connectionState = 'error';
      this.lastError = error;
      this.log('error', `[${name}] Redis error: ${error.message}`, error);
    });
    
    client.on('close', () => {
      this.connectionState = 'disconnected';
      this.log('warn', `[${name}] Redis connection closed`);
    });
    
    client.on('reconnecting', (delay: number) => {
      this.connectionState = 'reconnecting';
      this.reconnectAttempts++;
      this.log('info', `[${name}] Redis reconnecting (attempt ${this.reconnectAttempts}, delay ${delay}ms)`);
    });
    
    client.on('end', () => {
      this.connectionState = 'disconnected';
      this.log('info', `[${name}] Redis connection ended`);
    });
  }
  
  /**
   * Get main Redis client for general operations
   */
  public async getClient(): Promise<Redis> {
    if (!this.mainClient) {
      this.mainClient = this.createClient('main');
      
      // Wait for connection to be ready
      if (this.mainClient.status !== 'ready') {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new RedisConnectionError('Connection timeout'));
          }, 10000);
          
          this.mainClient!.once('ready', () => {
            clearTimeout(timeout);
            resolve();
          });
          
          this.mainClient!.once('error', (err) => {
            clearTimeout(timeout);
            reject(new RedisConnectionError('Connection failed', err));
          });
        });
      }
    }
    
    return this.mainClient;
  }
  
  /**
   * Get Pub client for publishing messages
   */
  public async getPubClient(): Promise<Redis> {
    if (!this.pubClient) {
      // Create pub client as duplicate of main client
      const mainClient = await this.getClient();
      this.pubClient = mainClient.duplicate();
      this.attachEventHandlers(this.pubClient, 'pub');
    }
    
    return this.pubClient;
  }
  
  /**
   * Get Sub client for subscribing to messages
   */
  public async getSubClient(): Promise<Redis> {
    if (!this.subClient) {
      // Create sub client as duplicate of main client
      const mainClient = await this.getClient();
      this.subClient = mainClient.duplicate();
      this.attachEventHandlers(this.subClient, 'sub');
    }
    
    return this.subClient;
  }
  
  /**
   * Get connection info
   */
  public getConnectionInfo(): ConnectionInfo {
    return {
      state: this.connectionState,
      host: this.envConfig.host || DEFAULT_REDIS_ENV.HOST,
      port: this.envConfig.port || DEFAULT_REDIS_ENV.PORT,
      db: this.envConfig.db || DEFAULT_REDIS_ENV.DB,
      uptime: this.connectionStartTime ? Math.floor((Date.now() - this.connectionStartTime) / 1000) : 0,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError,
    };
  }
  
  /**
   * Check Redis health
   */
  public async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const client = await this.getClient();
      
      // Send PING command
      const response = await Promise.race([
        client.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), HEALTH_CHECK_CONFIG.TIMEOUT)
        ),
      ]);
      
      if (response !== 'PONG') {
        throw new Error('Invalid PING response');
      }
      
      const responseTime = Date.now() - startTime;
      
      // Get server info
      const infoStr = await client.info('server');
      const info = this.parseRedisInfo(infoStr);
      
      return {
        healthy: true,
        responseTime,
        info: {
          version: info.redis_version || 'unknown',
          mode: info.redis_mode || 'standalone',
          uptime: parseInt(info.uptime_in_seconds || '0', 10),
          connectedClients: parseInt(info.connected_clients || '0', 10),
          usedMemory: parseInt(info.used_memory || '0', 10),
          maxMemory: parseInt(info.maxmemory || '0', 10),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  /**
   * Parse Redis INFO command output
   */
  private parseRedisInfo(infoStr: string): Record<string, string> {
    const info: Record<string, string> = {};
    
    infoStr.split('\r\n').forEach(line => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          info[key.trim()] = value.trim();
        }
      }
    });
    
    return info;
  }
  
  /**
   * Disconnect all clients
   */
  public async disconnect(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];
    
    if (this.mainClient) {
      disconnectPromises.push(
        this.mainClient.quit().then(() => {}).catch(err => {
          this.log('error', 'Error disconnecting main client', err);
        })
      );
      this.mainClient = null;
    }
    
    if (this.pubClient) {
      disconnectPromises.push(
        this.pubClient.quit().then(() => {}).catch(err => {
          this.log('error', 'Error disconnecting pub client', err);
        })
      );
      this.pubClient = null;
    }
    
    if (this.subClient) {
      disconnectPromises.push(
        this.subClient.quit().then(() => {}).catch(err => {
          this.log('error', 'Error disconnecting sub client', err);
        })
      );
      this.subClient = null;
    }
    
    await Promise.all(disconnectPromises);
    
    this.connectionState = 'disconnected';
    this.log('info', 'All Redis connections closed');
  }
  
  /**
   * Reconnect all clients
   */
  public async reconnect(): Promise<void> {
    await this.disconnect();
    
    // Connections will be re-created on next access
    this.log('info', 'Redis reconnection initiated');
  }
  
  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.connectionState === 'ready' && this.mainClient?.status === 'ready';
  }
  
  /**
   * Update configuration (requires reconnect)
   */
  public updateConfig(config: Partial<RedisConnectionConfig>): void {
    this.config = { ...this.config, ...config };
    this.log('info', 'Redis configuration updated (reconnection required)');
  }
  
  /**
   * Simple logger (can be replaced with proper logging library)
   */
  private log(level: 'info' | 'warn' | 'error', message: string, error?: Error): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [Redis] [${level.toUpperCase()}] ${message}`;
    
    if (level === 'error') {
      console.error(logMessage, error || '');
    } else if (level === 'warn') {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }
  }
}

/**
 * Convenience function to get connection manager instance
 */
export function getConnectionManager(): ConnectionManager {
  return ConnectionManager.getInstance();
}

/**
 * Convenience function to get main Redis client
 */
export async function getRedisClient(): Promise<Redis> {
  return ConnectionManager.getInstance().getClient();
}

/**
 * Convenience function to get pub Redis client
 */
export async function getRedisPubClient(): Promise<Redis> {
  return ConnectionManager.getInstance().getPubClient();
}

/**
 * Convenience function to get sub Redis client
 */
export async function getRedisSubClient(): Promise<Redis> {
  return ConnectionManager.getInstance().getSubClient();
}
