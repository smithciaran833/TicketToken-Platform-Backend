import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger';
import { metricsCollector } from '../metrics.collector';

interface Connection {
  id: string;
  ws: WebSocket;
  userId?: string;
  subscriptions: Set<string>;
  lastPing: Date;
}

interface MetricUpdate {
  metric: string;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

export class WebSocketManagerService {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, Connection> = new Map();
  private metricSubscribers: Map<string, Set<string>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  initialize(server: Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/api/v1/ws'
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    // Start heartbeat
    this.startHeartbeat();

    logger.info('WebSocket server initialized');
  }

  private handleConnection(ws: WebSocket, req: any): void {
    const connectionId = uuidv4();
    const connection: Connection = {
      id: connectionId,
      ws,
      subscriptions: new Set(),
      lastPing: new Date()
    };

    this.connections.set(connectionId, connection);

    // Update metrics
    // metricsCollector.wsConnectionsActive.set(this.connections.size);

    logger.info('WebSocket connection established', { connectionId });

    ws.on('message', (data: Buffer) => {
      this.handleMessage(connectionId, data);
    });

    ws.on('pong', () => {
      const conn = this.connections.get(connectionId);
      if (conn) {
        conn.lastPing = new Date();
      }
    });

    ws.on('close', () => {
      this.handleDisconnection(connectionId);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', { connectionId, error });
      this.handleDisconnection(connectionId);
    });

    // Send welcome message
    this.send(connectionId, {
      type: 'connected',
      connectionId,
      timestamp: new Date()
    });
  }

  private handleMessage(connectionId: string, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      const connection = this.connections.get(connectionId);

      if (!connection) {
        return;
      }

      switch (message.action) {
        case 'subscribe':
          this.handleSubscribe(connectionId, message.metrics, message.filters);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(connectionId, message.metrics);
          break;
        case 'auth':
          this.handleAuth(connectionId, message.token);
          break;
        case 'ping':
          this.send(connectionId, { type: 'pong', timestamp: new Date() });
          break;
        default:
          this.send(connectionId, { 
            type: 'error', 
            message: 'Unknown action',
            action: message.action 
          });
      }
    } catch (error) {
      logger.error('Failed to handle WebSocket message', { connectionId, error });
      this.send(connectionId, { 
        type: 'error', 
        message: 'Invalid message format' 
      });
    }
  }

  private handleSubscribe(connectionId: string, metrics: string[], filters?: Record<string, any>): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    for (const metric of metrics) {
      // Add to connection subscriptions
      connection.subscriptions.add(metric);

      // Add to metric subscribers
      if (!this.metricSubscribers.has(metric)) {
        this.metricSubscribers.set(metric, new Set());
      }
      this.metricSubscribers.get(metric)!.add(connectionId);

      logger.debug('Subscription added', { connectionId, metric, filters });
    }

    this.send(connectionId, {
      type: 'subscribed',
      metrics,
      timestamp: new Date()
    });
  }

  private handleUnsubscribe(connectionId: string, metrics: string[]): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    for (const metric of metrics) {
      connection.subscriptions.delete(metric);

      const subscribers = this.metricSubscribers.get(metric);
      if (subscribers) {
        subscribers.delete(connectionId);
        if (subscribers.size === 0) {
          this.metricSubscribers.delete(metric);
        }
      }

      logger.debug('Subscription removed', { connectionId, metric });
    }

    this.send(connectionId, {
      type: 'unsubscribed',
      metrics,
      timestamp: new Date()
    });
  }

  private handleAuth(connectionId: string, token: string): void {
    // TODO: Implement JWT token validation
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      // Verify token and extract userId
      // const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // connection.userId = decoded.userId;

      this.send(connectionId, {
        type: 'authenticated',
        timestamp: new Date()
      });
    } catch (error) {
      this.send(connectionId, {
        type: 'error',
        message: 'Authentication failed'
      });
    }
  }

  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // Remove all subscriptions
    for (const metric of connection.subscriptions) {
      const subscribers = this.metricSubscribers.get(metric);
      if (subscribers) {
        subscribers.delete(connectionId);
        if (subscribers.size === 0) {
          this.metricSubscribers.delete(metric);
        }
      }
    }

    this.connections.delete(connectionId);

    // Update metrics
    // metricsCollector.wsConnectionsActive.set(this.connections.size);

    logger.info('WebSocket connection closed', { connectionId });
  }

  broadcastMetricUpdate(update: MetricUpdate): void {
    const subscribers = this.metricSubscribers.get(update.metric);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message = {
      type: 'metric_update',
      data: update
    };

    let sent = 0;
    for (const connectionId of subscribers) {
      if (this.send(connectionId, message)) {
        sent++;
      }
    }

    // Update metrics
    // metricsCollector.wsMessagesSent.inc(sent);

    logger.debug('Metric update broadcasted', { 
      metric: update.metric, 
      subscribers: subscribers.size,
      sent 
    });
  }

  broadcastAlert(alert: any): void {
    const message = {
      type: 'alert',
      data: alert
    };

    let sent = 0;
    for (const [connectionId, connection] of this.connections) {
      if (connection.subscriptions.has('alerts') || connection.subscriptions.has('*')) {
        if (this.send(connectionId, message)) {
          sent++;
        }
      }
    }

    logger.info('Alert broadcasted', { alertId: alert.id, connections: sent });
  }

  private send(connectionId: string, message: any): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    try {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify(message));
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to send WebSocket message', { connectionId, error });
      return false;
    }
  }

  private startHeartbeat(): void {
    const interval = parseInt(process.env.WS_PING_INTERVAL || '30000', 10);

    this.pingInterval = setInterval(() => {
      const now = new Date();
      const timeout = 60000; // 60 seconds

      for (const [connectionId, connection] of this.connections) {
        // Check if connection is stale
        if (now.getTime() - connection.lastPing.getTime() > timeout) {
          logger.warn('Stale WebSocket connection, closing', { connectionId });
          connection.ws.close();
          this.handleDisconnection(connectionId);
          continue;
        }

        // Send ping
        if (connection.ws.readyState === WebSocket.OPEN) {
          connection.ws.ping();
        }
      }
    }, interval);

    logger.info('WebSocket heartbeat started', { interval });
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getActiveSubscriptions(): Map<string, number> {
    const subscriptions = new Map<string, number>();

    for (const [metric, subscribers] of this.metricSubscribers) {
      subscriptions.set(metric, subscribers.size);
    }

    return subscriptions;
  }

  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Close all connections
    for (const [connectionId, connection] of this.connections) {
      connection.ws.close(1000, 'Server shutting down');
    }

    this.connections.clear();
    this.metricSubscribers.clear();

    if (this.wss) {
      this.wss.close();
    }

    logger.info('WebSocket server shutdown complete');
  }
}

export const websocketManager = new WebSocketManagerService();
