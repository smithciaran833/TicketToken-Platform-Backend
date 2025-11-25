import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
export interface RequestContext {
    requestId: string;
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    correlationId: string;
    tenantId?: string;
    userId?: string;
    sessionId?: string;
    clientId?: string;
    service: string;
    headers: Map<string, string>;
    startTime: number;
    path: string;
    method: string;
}
export declare const requestContext: AsyncLocalStorage<RequestContext>;
/**
 * Get current request context
 */
export declare function getRequestContext(): RequestContext | undefined;
/**
 * Context propagation middleware
 */
export declare function contextPropagation(serviceName: string): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Create headers for outgoing requests
 */
export declare function getOutgoingHeaders(additionalHeaders?: Record<string, string>): Record<string, string>;
/**
 * Express middleware to log request completion
 */
export declare function requestLogging(logger: any): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Create a child span for async operations
 */
export declare function createChildSpan(name: string): {
    spanId: string;
    parentSpanId: string;
};
//# sourceMappingURL=context-propagation.d.ts.map