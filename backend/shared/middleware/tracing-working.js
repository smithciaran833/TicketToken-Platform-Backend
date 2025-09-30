const opentelemetry = require('@opentelemetry/api');
const { v4: uuidv4 } = require('uuid');

// Simple tracing implementation that works regardless of OpenTelemetry version issues
class SimpleTracingService {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.activeSpans = new Map();
  }

  initialize(options = {}) {
    console.log(`🔍 Tracing initialized for ${this.serviceName} (simplified mode)`);
    return this;
  }

  // Express middleware for trace propagation
  middleware() {
    return (req, res, next) => {
      // Generate or extract trace ID
      const traceId = req.headers['x-trace-id'] || uuidv4().replace(/-/g, '');
      const spanId = uuidv4().replace(/-/g, '').substring(0, 16);
      const parentSpanId = req.headers['x-parent-span-id'] || null;
      
      // Create span object
      const span = {
        traceId,
        spanId,
        parentSpanId,
        serviceName: this.serviceName,
        operationName: `${req.method} ${req.path}`,
        startTime: Date.now(),
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          'http.path': req.path,
          'http.host': req.hostname,
        },
        events: [],
        status: 'OK'
      };
      
      // Store span
      this.activeSpans.set(spanId, span);
      
      // Attach to request
      req.span = span;
      req.traceId = traceId;
      req.spanId = spanId;
      
      // Set response headers for trace propagation
      res.setHeader('X-Trace-Id', traceId);
      res.setHeader('X-Span-Id', spanId);
      if (parentSpanId) {
        res.setHeader('X-Parent-Span-Id', parentSpanId);
      }
      
      // Log span start
      console.log(JSON.stringify({
        type: 'span_start',
        traceId,
        spanId,
        parentSpanId,
        service: this.serviceName,
        operation: span.operationName,
        timestamp: new Date().toISOString()
      }));
      
      // End span on response
      const originalEnd = res.end;
      res.end = (...args) => {
        span.endTime = Date.now();
        span.duration = span.endTime - span.startTime;
        span.attributes['http.status_code'] = res.statusCode;
        
        if (res.statusCode >= 400) {
          span.status = 'ERROR';
        }
        
        // Log span end
        console.log(JSON.stringify({
          type: 'span_end',
          traceId,
          spanId,
          service: this.serviceName,
          operation: span.operationName,
          duration: span.duration,
          status: span.status,
          statusCode: res.statusCode,
          timestamp: new Date().toISOString()
        }));
        
        // Clean up
        this.activeSpans.delete(spanId);
        
        return originalEnd.apply(res, args);
      };
      
      next();
    };
  }

  // Create a child span
  startSpan(name, parentSpan = null) {
    const traceId = parentSpan?.traceId || uuidv4().replace(/-/g, '');
    const spanId = uuidv4().replace(/-/g, '').substring(0, 16);
    const parentSpanId = parentSpan?.spanId || null;
    
    const span = {
      traceId,
      spanId,
      parentSpanId,
      serviceName: this.serviceName,
      operationName: name,
      startTime: Date.now(),
      attributes: {},
      events: [],
      status: 'OK',
      
      // Methods
      setAttributes: function(attrs) {
        Object.assign(this.attributes, attrs);
      },
      
      addEvent: function(name, attributes = {}) {
        this.events.push({
          name,
          attributes,
          timestamp: Date.now()
        });
      },
      
      setStatus: function(status) {
        this.status = status.code === 2 ? 'ERROR' : 'OK';
      },
      
      end: function() {
        this.endTime = Date.now();
        this.duration = this.endTime - this.startTime;
        
        console.log(JSON.stringify({
          type: 'span_end',
          traceId: this.traceId,
          spanId: this.spanId,
          parentSpanId: this.parentSpanId,
          service: this.serviceName,
          operation: this.operationName,
          duration: this.duration,
          status: this.status,
          timestamp: new Date().toISOString()
        }));
      }
    };
    
    this.activeSpans.set(spanId, span);
    
    console.log(JSON.stringify({
      type: 'span_start',
      traceId,
      spanId,
      parentSpanId,
      service: this.serviceName,
      operation: name,
      timestamp: new Date().toISOString()
    }));
    
    return span;
  }

  // Add event to current span
  addEvent(name, attributes = {}) {
    // Find the most recent span
    const spans = Array.from(this.activeSpans.values());
    if (spans.length > 0) {
      const span = spans[spans.length - 1];
      span.events.push({
        name,
        attributes,
        timestamp: Date.now()
      });
    }
  }

  // Wrap async function with span
  async withSpan(name, fn, parentSpan = null) {
    const span = this.startSpan(name, parentSpan);
    
    try {
      const result = await fn();
      span.setStatus({ code: 0 });
      return result;
    } catch (error) {
      span.setStatus({ code: 2 });
      span.addEvent('exception', {
        'exception.message': error.message,
        'exception.type': error.constructor.name
      });
      throw error;
    } finally {
      span.end();
    }
  }

  async shutdown() {
    console.log('Tracing shutdown');
  }
}

// Factory function
function initializeTracing(serviceName, options = {}) {
  const tracer = new SimpleTracingService(serviceName);
  tracer.initialize(options);
  return tracer;
}

module.exports = {
  TracingService: SimpleTracingService,
  initializeTracing,
  opentelemetry,
};
