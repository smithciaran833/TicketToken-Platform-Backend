"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.websocketService = exports.WebSocketService = void 0;
const websocket_1 = require("../config/websocket");
const logger_1 = require("../utils/logger");
const models_1 = require("../models");
class WebSocketService {
    static instance;
    log = logger_1.logger.child({ component: 'WebSocketService' });
    static getInstance() {
        if (!this.instance) {
            this.instance = new WebSocketService();
        }
        return this.instance;
    }
    async broadcastMetricUpdate(venueId, metricType, data) {
        try {
            (0, websocket_1.emitMetricUpdate)(metricType, venueId, data);
            await models_1.RealtimeModel.publishMetricUpdate(venueId, metricType, data);
            this.log.debug('Metric update broadcasted', { venueId, metricType });
        }
        catch (error) {
            this.log.error('Failed to broadcast metric update', { error, venueId, metricType });
        }
    }
    async broadcastWidgetUpdate(widgetId, data) {
        try {
            (0, websocket_1.emitWidgetUpdate)(widgetId, data);
            this.log.debug('Widget update broadcasted', { widgetId });
        }
        catch (error) {
            this.log.error('Failed to broadcast widget update', { error, widgetId });
        }
    }
    async broadcastToVenue(venueId, event, data) {
        try {
            const io = (0, websocket_1.getIO)();
            io.to(`venue:${venueId}`).emit(event, data);
            this.log.debug('Event broadcasted to venue', { venueId, event });
        }
        catch (error) {
            this.log.error('Failed to broadcast to venue', { error, venueId, event });
        }
    }
    async broadcastToUser(userId, event, data) {
        try {
            const io = (0, websocket_1.getIO)();
            const sockets = await io.fetchSockets();
            const userSockets = sockets.filter(s => s.data.userId === userId);
            userSockets.forEach(socket => {
                socket.emit(event, data);
            });
            this.log.debug('Event broadcasted to user', { userId, event, socketCount: userSockets.length });
        }
        catch (error) {
            this.log.error('Failed to broadcast to user', { error, userId, event });
        }
    }
    async getConnectedClients() {
        try {
            const io = (0, websocket_1.getIO)();
            const sockets = await io.fetchSockets();
            const byVenue = {};
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
        }
        catch (error) {
            this.log.error('Failed to get connected clients', { error });
            return { total: 0, byVenue: {} };
        }
    }
    async disconnectUser(userId, reason) {
        try {
            const io = (0, websocket_1.getIO)();
            const sockets = await io.fetchSockets();
            const userSockets = sockets.filter(s => s.data.userId === userId);
            userSockets.forEach(socket => {
                socket.disconnect(true);
            });
            this.log.info('User disconnected', { userId, reason, socketCount: userSockets.length });
        }
        catch (error) {
            this.log.error('Failed to disconnect user', { error, userId });
        }
    }
    async subscribeToMetrics(socketId, venueId, metrics) {
        try {
            const io = (0, websocket_1.getIO)();
            const socket = io.sockets.sockets.get(socketId);
            if (!socket) {
                throw new Error('Socket not found');
            }
            metrics.forEach(metric => {
                socket.join(`metrics:${metric}:${venueId}`);
            });
            for (const metric of metrics) {
                const currentValue = await models_1.RealtimeModel.getRealTimeMetric(venueId, metric);
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
        }
        catch (error) {
            this.log.error('Failed to subscribe to metrics', { error, socketId });
        }
    }
    async unsubscribeFromMetrics(socketId, venueId, metrics) {
        try {
            const io = (0, websocket_1.getIO)();
            const socket = io.sockets.sockets.get(socketId);
            if (!socket) {
                return;
            }
            metrics.forEach(metric => {
                socket.leave(`metrics:${metric}:${venueId}`);
            });
            this.log.debug('Socket unsubscribed from metrics', { socketId, venueId, metrics });
        }
        catch (error) {
            this.log.error('Failed to unsubscribe from metrics', { error, socketId });
        }
    }
    async getRoomSubscribers(room) {
        try {
            const io = (0, websocket_1.getIO)();
            const sockets = await io.in(room).fetchSockets();
            return sockets.length;
        }
        catch (error) {
            this.log.error('Failed to get room subscribers', { error, room });
            return 0;
        }
    }
}
exports.WebSocketService = WebSocketService;
exports.websocketService = WebSocketService.getInstance();
//# sourceMappingURL=websocket.service.js.map