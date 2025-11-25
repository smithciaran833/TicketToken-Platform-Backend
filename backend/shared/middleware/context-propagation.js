"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestContext = void 0;
exports.getRequestContext = getRequestContext;
exports.contextPropagation = contextPropagation;
exports.getOutgoingHeaders = getOutgoingHeaders;
exports.requestLogging = requestLogging;
exports.createChildSpan = createChildSpan;
const uuid_1 = require("uuid");
const async_hooks_1 = require("async_hooks");
// Context headers that should be propagated
const PROPAGATED_HEADERS = [
    'x-request-id',
    'x-trace-id',
    'x-span-id',
    'x-parent-span-id',
    'x-correlation-id',
    'x-tenant-id',
    'x-user-id',
    'x-session-id',
    'x-client-id',
    'x-forwarded-for',
    'x-real-ip',
    'x-originating-service',
    'x-api-version',
    'authorization',
    'user-agent'
];
// Additional headers for debugging
const DEBUG_HEADERS = [
    'x-debug-mode',
    'x-force-error',
    'x-slow-query',
    'x-bypass-cache'
];
// AsyncLocalStorage for request context
exports.requestContext = new async_hooks_1.AsyncLocalStorage();
/**
 * Get current request context
 */
function getRequestContext() {
    return exports.requestContext.getStore();
}
/**
 * Extract headers from incoming request
 */
function extractHeaders(req) {
    const headers = new Map();
    for (const header of [...PROPAGATED_HEADERS, ...DEBUG_HEADERS]) {
        const value = req.headers[header];
        if (value && typeof value === 'string') {
            headers.set(header, value);
        }
    }
    return headers;
}
/**
 * Generate new span ID
 */
function generateSpanId() {
    return Math.random().toString(36).substring(2, 15);
}
/**
 * Context propagation middleware
 */
function contextPropagation(serviceName) {
    return (req, res, next) => {
        // Extract or generate IDs
        const requestId = req.headers['x-request-id'] || (0, uuid_1.v4)();
        const traceId = req.headers['x-trace-id'] || requestId;
        const parentSpanId = req.headers['x-parent-span-id'];
        const spanId = generateSpanId();
        const correlationId = req.headers['x-correlation-id'] || traceId;
        // Extract user context
        const tenantId = req.user?.tenantId || req.headers['x-tenant-id'];
        const userId = req.user?.id || req.headers['x-user-id'];
        const sessionId = req.headers['x-session-id'];
        const clientId = req.headers['x-client-id'];
        // Build context
        const context = {
            requestId,
            traceId,
            spanId,
            parentSpanId,
            correlationId,
            tenantId,
            userId,
            sessionId,
            clientId,
            service: serviceName,
            headers: extractHeaders(req),
            startTime: Date.now(),
            path: req.path,
            method: req.method
        };
        // Store context in AsyncLocalStorage
        exports.requestContext.run(context, () => {
            // Set response headers
            res.setHeader('x-request-id', requestId);
            res.setHeader('x-trace-id', traceId);
            res.setHeader('x-span-id', spanId);
            // Log request with context
            const logger = req.logger;
            if (logger) {
                logger.child({
                    requestId,
                    traceId,
                    spanId,
                    parentSpanId,
                    correlationId,
                    tenantId,
                    userId,
                    service: serviceName
                });
            }
            // Add context to request object for backward compatibility
            req.context = context;
            // Continue with request
            next();
        });
    };
}
/**
 * Create headers for outgoing requests
 */
function getOutgoingHeaders(additionalHeaders) {
    const context = getRequestContext();
    if (!context) {
        return additionalHeaders || {};
    }
    const headers = {
        'x-request-id': context.requestId,
        'x-trace-id': context.traceId,
        'x-parent-span-id': context.spanId, // Current span becomes parent for next service
        'x-correlation-id': context.correlationId,
        ...additionalHeaders
    };
    // Add optional headers if present
    if (context.tenantId)
        headers['x-tenant-id'] = context.tenantId;
    if (context.userId)
        headers['x-user-id'] = context.userId;
    if (context.sessionId)
        headers['x-session-id'] = context.sessionId;
    if (context.clientId)
        headers['x-client-id'] = context.clientId;
    // Add any debug headers
    for (const [key, value] of context.headers.entries()) {
        if (DEBUG_HEADERS.includes(key)) {
            headers[key] = value;
        }
    }
    // Add originating service
    headers['x-originating-service'] = context.service;
    return headers;
}
/**
 * Express middleware to log request completion
 */
function requestLogging(logger) {
    return (req, res, next) => {
        const context = getRequestContext();
        if (!context) {
            return next();
        }
        // Log request start
        logger.info({
            type: 'request_start',
            ...context,
            headers: undefined // Don't log all headers
        });
        // Track response
        const originalSend = res.send;
        res.send = function (data) {
            const duration = Date.now() - context.startTime;
            logger.info({
                type: 'request_complete',
                requestId: context.requestId,
                traceId: context.traceId,
                spanId: context.spanId,
                duration,
                statusCode: res.statusCode,
                path: context.path,
                method: context.method
            });
            // Set duration header
            res.setHeader('x-response-time', `${duration}ms`);
            return originalSend.call(this, data);
        };
        next();
    };
}
/**
 * Create a child span for async operations
 */
function createChildSpan(name) {
    const context = getRequestContext();
    if (!context) {
        return {
            spanId: generateSpanId(),
            parentSpanId: ''
        };
    }
    return {
        spanId: generateSpanId(),
        parentSpanId: context.spanId
    };
}
