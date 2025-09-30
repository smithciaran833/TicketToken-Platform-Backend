import { getIO, emitMetricUpdate, emitWidgetUpdate } from '../config/websocket';
import { RealTimeMetric, WidgetData } from '../types';
import { logger } from '../utils/logger';
import { RealtimeModel } from '../models';

export class WebSocketService {
  private static instance: WebSocketService;
  private log = logger.child({ component: 'WebSocketService' });

  static getInstance(): WebSocketService {
    if (!this.instance) {
      this.instance = new WebSocketService();
    }
    return this.instance;
  }

  async broadcastMetricUpdate(
    venueId: string,
    metricType: string,
    data: RealTimeMetric
  ): Promise<void> {
    try {
      // Emit to all subscribers of this metric
      emitMetricUpdate(metricType, venueId, data);
      
      // Also update Redis for future connections
      await RealtimeModel.publishMetricUpdate(venueId, metricType, data);
      
      this.log.debug('Metric update broadcasted', { venueId, metricType });
    } catch (error) {
      this.log.error('Failed to broadcast metric update', { error, venueId, metricType });
    }
  }

  async broadcastWidgetUpdate(
    widgetId: string,
    data: WidgetData
  ): Promise<void> {
    try {
      emitWidgetUpdate(widgetId, data);
      this.log.debug('Widget update broadcasted', { widgetId });
    } catch (error) {
      this.log.error('Failed to broadcast widget update', { error, widgetId });
    }
  }

  async broadcastToVenue(
    venueId: string,
    event: string,
    data: any
  ): Promise<void> {
    try {
      const io = getIO();
      io.to(`venue:${venueId}`).emit(event, data);
      this.log.debug('Event broadcasted to venue', { venueId, event });
    } catch (error) {
      this.log.error('Failed to broadcast to venue', { error, venueId, event });
    }
  }

  async broadcastToUser(
    userId: string,
    event: string,
    data: any
  ): Promise<void> {
    try {
      const io = getIO();
      // Find sockets for this user
      const sockets = await io.fetchSockets();
      const userSockets = sockets.filter(s => s.data.userId === userId);
      
      userSockets.forEach(socket => {
        socket.emit(event, data);
      });
      
      this.log.debug('Event broadcasted to user', { userId, event, socketCount: userSockets.length });
    } catch (error) {
      this.log.error('Failed to broadcast to user', { error, userId, event });
    }
  }

  async getConnectedClients(): Promise<{
    total: number;
    byVenue: Record<string, number>;
  }> {
    try {
      const io = getIO();
      const sockets = await io.fetchSockets();
      
      const byVenue: Record<string, number> = {};
      
      sockets.forEach(socket => {
        const venueId = socket.data.venueId;
        if (venueId) {
          byVenue[venueId] = (byVenue[venueId] || 0) + 1;
        }
      });
      
      return {
        total: sockets.length,
        byVenue
      };
    } catch (error) {
      this.log.error('Failed to get connected clients', { error });
      return { total: 0, byVenue: {} };
    }
  }

  async disconnectUser(userId: string, reason?: string): Promise<void> {
    try {
      const io = getIO();
      const sockets = await io.fetchSockets();
      const userSockets = sockets.filter(s => s.data.userId === userId);
      
      userSockets.forEach(socket => {
        socket.disconnect(true);
      });
      
      this.log.info('User disconnected', { userId, reason, socketCount: userSockets.length });
    } catch (error) {
      this.log.error('Failed to disconnect user', { error, userId });
    }
  }

  async subscribeToMetrics(
    socketId: string,
    venueId: string,
    metrics: string[]
  ): Promise<void> {
    try {
      const io = getIO();
      const socket = io.sockets.sockets.get(socketId);
      
      if (!socket) {
        throw new Error('Socket not found');
      }
      
      // Join metric rooms
      metrics.forEach(metric => {
        socket.join(`metrics:${metric}:${venueId}`);
      });
      
      // Send current values
      for (const metric of metrics) {
        const currentValue = await RealtimeModel.getRealTimeMetric(venueId, metric);
        if (currentValue) {
          socket.emit('metric:update', {
            type: metric,
            venueId,
            data: currentValue,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      this.log.debug('Socket subscribed to metrics', { socketId, venueId, metrics });
    } catch (error) {
      this.log.error('Failed to subscribe to metrics', { error, socketId });
    }
  }

  async unsubscribeFromMetrics(
    socketId: string,
    venueId: string,
    metrics: string[]
  ): Promise<void> {
    try {
      const io = getIO();
      const socket = io.sockets.sockets.get(socketId);
      
      if (!socket) {
        return;
      }
      
      // Leave metric rooms
      metrics.forEach(metric => {
        socket.leave(`metrics:${metric}:${venueId}`);
      });
      
      this.log.debug('Socket unsubscribed from metrics', { socketId, venueId, metrics });
    } catch (error) {
      this.log.error('Failed to unsubscribe from metrics', { error, socketId });
    }
  }

  async getRoomSubscribers(room: string): Promise<number> {
    try {
      const io = getIO();
      const sockets = await io.in(room).fetchSockets();
      return sockets.length;
    } catch (error) {
      this.log.error('Failed to get room subscribers', { error, room });
      return 0;
    }
  }
}

export const websocketService = WebSocketService.getInstance();
