import { EventEmitter } from 'events';
import { getRequestContext, RequestContext } from '../middleware/context-propagation';

interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, any>;
  logs: Array<{
    timestamp: number;
    message: string;
    level: string;
    fields?: Record<string, any>;
  }>;
  status: 'in_progress' | 'completed' | 'error';
  error?: Error;
}

class DistributedTracingService extends EventEmitter {
  private spans: Map<string, Span> = new Map();
  private traces: Map<string, Set<string>> = new Map();

  /**
   * Start a new span
   */
  startSpan(
    operationName: string,
    parentSpanId?: string,
    tags?: Record<string, any>
  ): Span {
    const context = getRequestContext();
    
    if (!context) {
      throw new Error('No request context available');
    }

    const span: Span = {
      traceId: context.traceId,
      spanId: Math.random().toString(36).substring(2, 15),
      parentSpanId: parentSpanId || context.spanId,
      operationName,
      serviceName: context.service,
      startTime: Date.now(),
      tags: {
        ...tags,
        userId: context.userId,
        tenantId: context.tenantId,
        requestId: context.requestId
      },
      logs: [],
      status: 'in_progress'
    };

    // Store span
    this.spans.set(span.spanId, span);

    // Track in trace
    if (!this.traces.has(span.traceId)) {
      this.traces.set(span.traceId, new Set());
    }
    this.traces.get(span.traceId)!.add(span.spanId);

    // Emit event
    this.emit('span:start', span);

    return span;
  }

  /**
   * End a span
   */
  endSpan(spanId: string, error?: Error): void {
    const span = this.spans.get(spanId);
    
    if (!span) {
      console.error(`Span not found: ${spanId}`);
      return;
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = error ? 'error' : 'completed';
    span.error = error;

    // Emit event
    this.emit('span:end', span);

    // Clean up old spans (keep for 1 hour)
    setTimeout(() => {
      this.spans.delete(spanId);
    }, 3600000);
  }

  /**
   * Add log to span
   */
  addLog(spanId: string, message: string, level: string = 'info', fields?: Record<string, any>): void {
    const span = this.spans.get(spanId);
    
    if (!span) {
      return;
    }

    span.logs.push({
      timestamp: Date.now(),
      message,
      level,
      fields
    });
  }

  /**
   * Add tag to span
   */
  addTag(spanId: string, key: string, value: any): void {
    const span = this.spans.get(spanId);
    
    if (!span) {
      return;
    }

    span.tags[key] = value;
  }

  /**
   * Get trace summary
   */
  getTraceSummary(traceId: string): {
    spans: Span[];
    totalDuration: number;
    services: Set<string>;
    errors: number;
  } {
    const spanIds = this.traces.get(traceId);
    
    if (!spanIds) {
      return {
        spans: [],
        totalDuration: 0,
        services: new Set(),
        errors: 0
      };
    }

    const spans: Span[] = [];
    const services = new Set<string>();
    let errors = 0;
    let minStartTime = Infinity;
    let maxEndTime = 0;

    for (const spanId of spanIds) {
      const span = this.spans.get(spanId);
      if (span) {
        spans.push(span);
        services.add(span.serviceName);
        if (span.status === 'error') errors++;
        if (span.startTime < minStartTime) minStartTime = span.startTime;
        if (span.endTime && span.endTime > maxEndTime) maxEndTime = span.endTime;
      }
    }

    return {
      spans,
      totalDuration: maxEndTime - minStartTime,
      services,
      errors
    };
  }

  /**
   * Export trace for external systems (Jaeger, Zipkin, etc.)
   */
  exportTrace(traceId: string): any {
    const summary = this.getTraceSummary(traceId);
    
    return {
      traceId,
      spans: summary.spans.map(span => ({
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        operationName: span.operationName,
        serviceName: span.serviceName,
        startTime: span.startTime,
        duration: span.duration,
        tags: span.tags,
        logs: span.logs,
        status: {
          code: span.status === 'error' ? 2 : 0,
          message: span.error?.message
        }
      }))
    };
  }

  /**
   * Clean up old traces
   */
  cleanup(maxAge: number = 3600000): void {
    const now = Date.now();
    
    for (const [spanId, span] of this.spans.entries()) {
      if (now - span.startTime > maxAge) {
        this.spans.delete(spanId);
        
        // Remove from trace
        const traceSpans = this.traces.get(span.traceId);
        if (traceSpans) {
          traceSpans.delete(spanId);
          if (traceSpans.size === 0) {
            this.traces.delete(span.traceId);
          }
        }
      }
    }
  }
}

export const distributedTracing = new DistributedTracingService();

// Clean up old traces periodically
setInterval(() => {
  distributedTracing.cleanup();
}, 600000); // Every 10 minutes

/**
 * Express middleware for automatic span creation
 */
export function tracingMiddleware() {
  return (req: any, res: any, next: any) => {
    const context = getRequestContext();
    
    if (!context) {
      return next();
    }

    // Create span for this request
    const span = distributedTracing.startSpan(
      `${req.method} ${req.path}`,
      context.parentSpanId,
      {
        http_method: req.method,
        http_url: req.originalUrl,
        http_path: req.path,
        user_agent: req.headers['user-agent']
      }
    );

    // Store span ID in request
    req.spanId = span.spanId;

    // Hook into response to end span
    const originalSend = res.send;
    res.send = function(data: any) {
      distributedTracing.addTag(span.spanId, 'http_status_code', res.statusCode);
      distributedTracing.endSpan(span.spanId, res.statusCode >= 500 ? new Error(`HTTP ${res.statusCode}`) : undefined);
      return originalSend.call(this, data);
    };

    next();
  };
}
