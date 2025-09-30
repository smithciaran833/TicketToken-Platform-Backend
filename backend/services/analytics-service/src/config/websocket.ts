import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';

let io: SocketIOServer;

export function initializeWebSocket(server: HTTPServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    logger.info('Client connected', { socketId: socket.id });

    socket.on('subscribe', (data) => {
      const { venueId, metrics } = data;
      
      // Join venue-specific room
      socket.join(`venue:${venueId}`);
      
      // Join metric-specific rooms
      metrics.forEach((metric: string) => {
        socket.join(`metric:${metric}:${venueId}`);
      });
      
      logger.info('Client subscribed', { 
        socketId: socket.id, 
        venueId, 
        metrics 
      });
    });

    socket.on('unsubscribe', (data) => {
      const { venueId } = data;
      socket.leave(`venue:${venueId}`);
      logger.info('Client unsubscribed', { socketId: socket.id, venueId });
    });

    socket.on('disconnect', () => {
      logger.info('Client disconnected', { socketId: socket.id });
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('WebSocket not initialized');
  }
  return io;
}

// Emit real-time updates
export function emitMetricUpdate(venueId: string, metric: string, data: any) {
  if (!io) return;
  
  // Emit to venue room
  io.to(`venue:${venueId}`).emit('metric-update', {
    venueId,
    metric,
    data,
    timestamp: new Date()
  });
  
  // Emit to specific metric room
  io.to(`metric:${metric}:${venueId}`).emit(`${metric}-update`, data);
}

export function emitAlert(venueId: string, alert: any) {
  if (!io) return;
  
  io.to(`venue:${venueId}`).emit('alert', {
    venueId,
    alert,
    timestamp: new Date()
  });
}

// Export function to start WebSocket server
export function emitWidgetUpdate(widgetId: string, data: any) {
  if (!io) return;

  io.to(`widget:${widgetId}`).emit("widget-update", {
    widgetId,
    data,
    timestamp: new Date()
  });
}

export function startWebSocketServer(server: any) {
  return initializeWebSocket(server);
}
