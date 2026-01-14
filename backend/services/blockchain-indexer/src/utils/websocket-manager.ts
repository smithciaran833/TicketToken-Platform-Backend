/**
 * WebSocket Manager with Automatic Reconnection
 * 
 * AUDIT FIX: EVT-4 - WebSocket reconnection not handled
 * AUDIT FIX: GD-3 - Fallback for marketplace tracker
 * 
 * Provides resilient WebSocket connections with:
 * - Automatic reconnection with exponential backoff
 * - Connection state management
 * - Health monitoring
 * - Event subscription persistence across reconnects
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import logger from './logger';

// =============================================================================
// TYPES
// =============================================================================

export interface WebSocketManagerOptions {
  /** WebSocket URL */
  url: string;
  /** Name for logging */
  name: string;
  /** Initial reconnection delay (ms) */
  reconnectDelay?: number;
  /** Maximum reconnection delay (ms) */
  maxReconnectDelay?: number;
  /** Backoff multiplier */
  backoffMultiplier?: number;
  /** Maximum reconnection attempts (0 = infinite) */
  maxReconnectAttempts?: number;
  /** Ping interval for health checks (ms) */
  pingInterval?: number;
  /** Pong timeout (ms) */
  pongTimeout?: number;
  /** Connection timeout (ms) */
  connectionTimeout?: number;
  /** Auto-reconnect on close */
  autoReconnect?: boolean;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  FAILED = 'FAILED'
}

export interface WebSocketMetrics {
  name: string;
  state: ConnectionState;
  reconnectAttempts: number;
  totalConnections: number;
  totalDisconnections: number;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  messagesSent: number;
  messagesReceived: number;
  uptime: number;
}

// =============================================================================
// WEBSOCKET MANAGER
// =============================================================================

export class WebSocketManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private connectionTimer: NodeJS.Timeout | null = null;
  
  // Metrics
  private totalConnections: number = 0;
  private totalDisconnections: number = 0;
  private lastConnectedAt: number | null = null;
  private lastDisconnectedAt: number | null = null;
  private messagesSent: number = 0;
  private messagesReceived: number = 0;
  private connectedAt: number | null = null;
  
  // Subscriptions to restore on reconnect
  private subscriptions: Map<string, any> = new Map();
  
  private readonly options: Required<WebSocketManagerOptions>;

  constructor(options: WebSocketManagerOptions) {
    super();
    
    this.options = {
      url: options.url,
      name: options.name,
      reconnectDelay: options.reconnectDelay || 1000,
      maxReconnectDelay: options.maxReconnectDelay || 30000,
      backoffMultiplier: options.backoffMultiplier || 2,
      maxReconnectAttempts: options.maxReconnectAttempts || 0,
      pingInterval: options.pingInterval || 30000,
      pongTimeout: options.pongTimeout || 5000,
      connectionTimeout: options.connectionTimeout || 10000,
      autoReconnect: options.autoReconnect !== false
    };

    logger.info({
      name: this.options.name,
      url: this.options.url,
      autoReconnect: this.options.autoReconnect
    }, 'WebSocket manager initialized');
  }

  /**
   * Connect to WebSocket
   */
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED || 
        this.state === ConnectionState.CONNECTING) {
      logger.debug({ name: this.options.name }, 'Already connected or connecting');
      return;
    }

    this.setState(ConnectionState.CONNECTING);
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.url);
        
        // Connection timeout
        this.connectionTimer = setTimeout(() => {
          if (this.state === ConnectionState.CONNECTING) {
            logger.error({ name: this.options.name }, 'Connection timeout');
            this.ws?.terminate();
            reject(new Error('Connection timeout'));
          }
        }, this.options.connectionTimeout);

        this.ws.on('open', () => {
          this.clearTimer('connectionTimer');
          this.onOpen();
          resolve();
        });

        this.ws.on('message', (data) => this.onMessage(data));
        this.ws.on('close', (code, reason) => this.onClose(code, reason.toString()));
        this.ws.on('error', (error) => this.onError(error));
        this.ws.on('pong', () => this.onPong());

      } catch (error) {
        logger.error({ error, name: this.options.name }, 'Failed to create WebSocket');
        this.setState(ConnectionState.DISCONNECTED);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.options.autoReconnect = false;
    this.clearAllTimers();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.setState(ConnectionState.DISCONNECTED);
    logger.info({ name: this.options.name }, 'WebSocket disconnected');
  }

  /**
   * Send message through WebSocket
   */
  send(data: any): boolean {
    if (!this.ws || this.state !== ConnectionState.CONNECTED) {
      logger.warn({ name: this.options.name, state: this.state }, 'Cannot send - not connected');
      return false;
    }

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(message);
      this.messagesSent++;
      return true;
    } catch (error) {
      logger.error({ error, name: this.options.name }, 'Failed to send message');
      return false;
    }
  }

  /**
   * Add subscription to restore on reconnect
   * AUDIT FIX: EVT-4 - Persist subscriptions across reconnects
   */
  addSubscription(id: string, subscriptionData: any): void {
    this.subscriptions.set(id, subscriptionData);
    logger.debug({ name: this.options.name, id }, 'Subscription added');
  }

  /**
   * Remove subscription
   */
  removeSubscription(id: string): void {
    this.subscriptions.delete(id);
    logger.debug({ name: this.options.name, id }, 'Subscription removed');
  }

  /**
   * Get current state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * Get metrics
   */
  getMetrics(): WebSocketMetrics {
    return {
      name: this.options.name,
      state: this.state,
      reconnectAttempts: this.reconnectAttempts,
      totalConnections: this.totalConnections,
      totalDisconnections: this.totalDisconnections,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      uptime: this.connectedAt ? Date.now() - this.connectedAt : 0
    };
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private onOpen(): void {
    this.setState(ConnectionState.CONNECTED);
    this.reconnectAttempts = 0;
    this.totalConnections++;
    this.lastConnectedAt = Date.now();
    this.connectedAt = Date.now();
    
    // Start ping health checks
    this.startPing();
    
    // Restore subscriptions
    this.restoreSubscriptions();
    
    logger.info({ name: this.options.name }, 'WebSocket connected');
    this.emit('connected');
  }

  private onMessage(data: WebSocket.Data): void {
    this.messagesReceived++;
    
    try {
      const parsed = JSON.parse(data.toString());
      this.emit('message', parsed);
    } catch {
      this.emit('message', data);
    }
  }

  private onClose(code: number, reason: string): void {
    this.clearAllTimers();
    this.totalDisconnections++;
    this.lastDisconnectedAt = Date.now();
    this.connectedAt = null;
    
    logger.warn({ 
      name: this.options.name, 
      code, 
      reason 
    }, 'WebSocket closed');
    
    this.emit('disconnected', { code, reason });

    // Attempt reconnection if enabled
    if (this.options.autoReconnect && code !== 1000) {
      this.scheduleReconnect();
    } else {
      this.setState(ConnectionState.DISCONNECTED);
    }
  }

  private onError(error: Error): void {
    logger.error({ error, name: this.options.name }, 'WebSocket error');
    this.emit('error', error);
  }

  private onPong(): void {
    this.clearTimer('pongTimer');
    logger.trace({ name: this.options.name }, 'Pong received');
  }

  private setState(state: ConnectionState): void {
    const oldState = this.state;
    this.state = state;
    
    if (oldState !== state) {
      logger.debug({ 
        name: this.options.name, 
        from: oldState, 
        to: state 
      }, 'WebSocket state changed');
      this.emit('stateChange', { from: oldState, to: state });
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.options.maxReconnectAttempts > 0 && 
        this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      logger.error({ 
        name: this.options.name, 
        attempts: this.reconnectAttempts 
      }, 'Max reconnection attempts reached');
      this.setState(ConnectionState.FAILED);
      this.emit('failed', { attempts: this.reconnectAttempts });
      return;
    }

    this.setState(ConnectionState.RECONNECTING);
    
    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.options.reconnectDelay * Math.pow(this.options.backoffMultiplier, this.reconnectAttempts),
      this.options.maxReconnectDelay
    );
    
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    const actualDelay = Math.round(delay + jitter);
    
    this.reconnectAttempts++;
    
    logger.info({ 
      name: this.options.name, 
      attempt: this.reconnectAttempts,
      delay: actualDelay 
    }, 'Scheduling reconnection');

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error({ error, name: this.options.name }, 'Reconnection failed');
        this.scheduleReconnect();
      }
    }, actualDelay);
  }

  /**
   * Restore subscriptions after reconnect
   */
  private restoreSubscriptions(): void {
    if (this.subscriptions.size === 0) return;
    
    logger.info({ 
      name: this.options.name, 
      count: this.subscriptions.size 
    }, 'Restoring subscriptions');

    for (const [id, data] of this.subscriptions) {
      try {
        this.send(data);
        logger.debug({ name: this.options.name, id }, 'Subscription restored');
      } catch (error) {
        logger.error({ error, name: this.options.name, id }, 'Failed to restore subscription');
      }
    }
  }

  /**
   * Start ping health checks
   */
  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.state === ConnectionState.CONNECTED) {
        this.ws.ping();
        
        // Set pong timeout
        this.pongTimer = setTimeout(() => {
          logger.warn({ name: this.options.name }, 'Pong timeout - connection may be stale');
          this.ws?.terminate();
        }, this.options.pongTimeout);
      }
    }, this.options.pingInterval);
  }

  /**
   * Clear specific timer
   */
  private clearTimer(timerName: 'reconnectTimer' | 'pingTimer' | 'pongTimer' | 'connectionTimer'): void {
    const timer = this[timerName];
    if (timer) {
      clearTimeout(timer as NodeJS.Timeout);
      clearInterval(timer as NodeJS.Timeout);
      this[timerName] = null;
    }
  }

  /**
   * Clear all timers
   */
  private clearAllTimers(): void {
    this.clearTimer('reconnectTimer');
    this.clearTimer('pingTimer');
    this.clearTimer('pongTimer');
    this.clearTimer('connectionTimer');
  }
}

// =============================================================================
// SINGLETON INSTANCES FOR COMMON USE CASES
// =============================================================================

let solanaWsManager: WebSocketManager | null = null;
let marketplaceWsManager: WebSocketManager | null = null;

/**
 * Initialize Solana WebSocket manager
 */
export function initializeSolanaWebSocket(url: string): WebSocketManager {
  if (!solanaWsManager) {
    solanaWsManager = new WebSocketManager({
      url,
      name: 'solana-rpc',
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      pingInterval: 30000
    });
  }
  return solanaWsManager;
}

/**
 * Get Solana WebSocket manager
 */
export function getSolanaWebSocket(): WebSocketManager | null {
  return solanaWsManager;
}

/**
 * Initialize Marketplace WebSocket manager
 */
export function initializeMarketplaceWebSocket(url: string): WebSocketManager {
  if (!marketplaceWsManager) {
    marketplaceWsManager = new WebSocketManager({
      url,
      name: 'marketplace',
      reconnectDelay: 2000,
      maxReconnectDelay: 60000,
      pingInterval: 45000
    });
  }
  return marketplaceWsManager;
}

/**
 * Get Marketplace WebSocket manager
 */
export function getMarketplaceWebSocket(): WebSocketManager | null {
  return marketplaceWsManager;
}
