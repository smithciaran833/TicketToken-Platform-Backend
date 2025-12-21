"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeWebSocket = initializeWebSocket;
exports.getIO = getIO;
exports.emitMetricUpdate = emitMetricUpdate;
exports.emitAlert = emitAlert;
exports.emitWidgetUpdate = emitWidgetUpdate;
exports.startWebSocketServer = startWebSocketServer;
const socket_io_1 = require("socket.io");
const logger_1 = require("../utils/logger");
let io;
function initializeWebSocket(server) {
    io = new socket_io_1.Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        },
        transports: ['websocket', 'polling']
    });
    io.on('connection', (socket) => {
        logger_1.logger.info('Client connected', { socketId: socket.id });
        socket.on('subscribe', (data) => {
            const { venueId, metrics } = data;
            socket.join(`venue:${venueId}`);
            metrics.forEach((metric) => {
                socket.join(`metric:${metric}:${venueId}`);
            });
            logger_1.logger.info('Client subscribed', {
                socketId: socket.id,
                venueId,
                metrics
            });
        });
        socket.on('unsubscribe', (data) => {
            const { venueId } = data;
            socket.leave(`venue:${venueId}`);
            logger_1.logger.info('Client unsubscribed', { socketId: socket.id, venueId });
        });
        socket.on('disconnect', () => {
            logger_1.logger.info('Client disconnected', { socketId: socket.id });
        });
    });
    return io;
}
function getIO() {
    if (!io) {
        throw new Error('WebSocket not initialized');
    }
    return io;
}
function emitMetricUpdate(venueId, metric, data) {
    if (!io)
        return;
    io.to(`venue:${venueId}`).emit('metric-update', {
        venueId,
        metric,
        data,
        timestamp: new Date()
    });
    io.to(`metric:${metric}:${venueId}`).emit(`${metric}-update`, data);
}
function emitAlert(venueId, alert) {
    if (!io)
        return;
    io.to(`venue:${venueId}`).emit('alert', {
        venueId,
        alert,
        timestamp: new Date()
    });
}
function emitWidgetUpdate(widgetId, data) {
    if (!io)
        return;
    io.to(`widget:${widgetId}`).emit("widget-update", {
        widgetId,
        data,
        timestamp: new Date()
    });
}
function startWebSocketServer(server) {
    return initializeWebSocket(server);
}
//# sourceMappingURL=websocket.js.map